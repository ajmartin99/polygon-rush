import { decodeName } from '../../src/meta/names.ts';
import { checkDisplayText } from '../../src/shared/chat-filter.ts';
import { LevelCodeFormatError, readLevelCode } from '../../src/shared/level-code.ts';
import { ApiError } from './accounts.ts';
import type { Db } from './db.ts';
import type { NameRegistry } from './names.ts';
import type { PlayerRow, PlayerService } from './players.ts';
import { RateLimiter } from './ratelimit.ts';
import { DAY, randomId } from './util.ts';

/**
 * Community levels: players share levels they built (and beat) so anyone can
 * play them. A shared level is its share code plus counters; the author shows
 * as their racer name without the #tag. Typed level names and typed author
 * names only come from 13+ players and pass the same filter as names. Three
 * different players reporting a level hides it until a moderator looks.
 */
export const MAX_SHARED_PER_PLAYER = 30;
export const PAGE_SIZE = 24;
const SUGGESTED = 20;
const HIDE_AFTER_REPORTS = 3;
/** Same bounds the editor enforces. */
const MIN_LENGTH = 30;
const MAX_LENGTH = 1200;
const MIN_PIECES = 5;
export const REPORT_REASONS = ['mean_name', 'impossible', 'copied', 'other'] as const;

export type LevelTab = 'top' | 'suggested' | 'new';
export type LevelScope = 'all' | 'friends' | 'mine';

interface LevelRow {
  id: string;
  owner: string;
  local_id: string;
  code: string;
  created_at: number;
  updated_at: number;
  plays: number;
  clears: number;
  likes: number;
  reports: number;
  hidden: number;
  author: string;
}

export interface SharedLevelView {
  id: string;
  code: string;
  author: string;
  plays: number;
  clears: number;
  likes: number;
  liked: boolean;
  played: boolean;
  mine: boolean;
  friend: boolean;
  created: number;
}

export interface CreatorStats {
  shared: number;
  plays: number;
  clears: number;
  likes: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shared_levels (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  local_id TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0,
  clears INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  UNIQUE (owner, local_id)
);
CREATE INDEX IF NOT EXISTS shared_levels_new ON shared_levels (hidden, created_at);
CREATE TABLE IF NOT EXISTS level_plays (
  level_id TEXT NOT NULL REFERENCES shared_levels(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cleared INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  PRIMARY KEY (level_id, player_id)
);
CREATE INDEX IF NOT EXISTS level_plays_player ON level_plays (player_id);
CREATE TABLE IF NOT EXISTS level_likes (
  level_id TEXT NOT NULL REFERENCES shared_levels(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (level_id, player_id)
);
CREATE INDEX IF NOT EXISTS level_likes_player ON level_likes (player_id);
CREATE TABLE IF NOT EXISTS level_reports (
  level_id TEXT NOT NULL REFERENCES shared_levels(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (level_id, player_id)
);
`;

/** Ranking for Top: likes count most, then clears, then plays. */
const SCORE = 'l.likes * 5 + l.clears * 2 + l.plays';

export class LevelService {
  private readonly db: Db;
  private readonly players: PlayerService;
  private readonly names: NameRegistry;
  private readonly publishes = new RateLimiter(12, 60 * 60 * 1000);
  private readonly publishesIp = new RateLimiter(40, 60 * 60 * 1000);
  private readonly reportsPerHour = new RateLimiter(10, 60 * 60 * 1000);

  constructor(db: Db, players: PlayerService, names: NameRegistry) {
    this.db = db;
    this.players = players;
    this.names = names;
    db.sql.exec(SCHEMA);
  }

  private q<T>(sql: string, ...args: (string | number | null)[]): T | undefined {
    return this.db.sql.prepare(sql).get(...args) as T | undefined;
  }

  private qa<T>(sql: string, ...args: (string | number | null)[]): T[] {
    return this.db.sql.prepare(sql).all(...args) as T[];
  }

  private x(sql: string, ...args: (string | number | null)[]): number {
    return Number(this.db.sql.prepare(sql).run(...args).changes);
  }

  /** Check a code before it's listed: a real level, and names/titles that fit the author's age. */
  private checkCode(code: unknown, me: PlayerRow): string {
    if (typeof code !== 'string' || code.length > 16_000) throw new ApiError(400, 'bad_level', 'That level is too big to share.');
    let raw;
    try {
      raw = readLevelCode(code);
    } catch (e) {
      throw new ApiError(400, 'bad_level', e instanceof LevelCodeFormatError ? e.message : 'That level code is damaged.');
    }
    if (raw.length < MIN_LENGTH || raw.length > MAX_LENGTH) throw new ApiError(400, 'bad_level', 'That level is the wrong length.');
    if (raw.pieces.length < MIN_PIECES) throw new ApiError(400, 'too_empty', 'Add a few more obstacles before sharing!');
    const kid = Boolean(me.kid);
    for (const a of raw.authors) {
      const name = 'text' in a ? a.text : decodeName(a.gen);
      if (!name) continue;
      if ('text' in a && (kid || !checkDisplayText(name, 'name').ok)) throw new ApiError(400, 'bad_name', 'One of the builder names can’t be shared.');
      if (!this.names.allowed(name)) throw new ApiError(400, 'bad_name', 'One of the builder names can’t be shared.');
    }
    if (raw.title !== undefined) {
      if (kid) throw new ApiError(400, 'bad_title', 'Typed level names are for players 13 and up.');
      const t = checkDisplayText(raw.title, 'title');
      if (!t.ok || t.text !== raw.title) throw new ApiError(400, 'bad_title', 'That level name can’t be shared. Try another!');
    }
    return code.trim().replace(/\s+/g, '');
  }

  /** Share a level, or update one this player shared before (same local id keeps its likes and plays). */
  publish(body: Record<string, unknown>, ipKey: string, now = Date.now()): { id: string; updated: boolean } {
    const me = this.players.me(body, now);
    const localId = typeof body.localId === 'string' && /^[a-z0-9]{6,24}$/.test(body.localId) ? body.localId : null;
    if (!localId) throw new ApiError(400, 'bad_level', 'Please update the app.');
    const code = this.checkCode(body.code, me);
    if (!this.publishes.hit(me.id, now) || !this.publishesIp.hit(ipKey, now)) throw new ApiError(429, 'slow_down', 'You’ve shared a lot of levels! Try again later.');
    const old = this.q<{ id: string; hidden: number }>('SELECT id, hidden FROM shared_levels WHERE owner = ? AND local_id = ?', me.id, localId);
    if (old) {
      if (old.hidden) throw new ApiError(403, 'hidden', 'This level was taken down by our safety team.');
      this.x('UPDATE shared_levels SET code = ?, updated_at = ? WHERE id = ?', code, now, old.id);
      return { id: old.id, updated: true };
    }
    const count = this.q<{ n: number }>('SELECT COUNT(*) AS n FROM shared_levels WHERE owner = ?', me.id)?.n ?? 0;
    if (count >= MAX_SHARED_PER_PLAYER) throw new ApiError(409, 'too_many', `You can share up to ${MAX_SHARED_PER_PLAYER} levels. Unshare one first.`);
    const id = randomId(8);
    this.x('INSERT INTO shared_levels (id, owner, local_id, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, me.id, localId, code, now, now);
    return { id, updated: false };
  }

  /** Take one of your levels out of the community list. */
  unpublish(id: string, body: Record<string, unknown>, now = Date.now()): void {
    const me = this.players.me(body, now);
    this.x('DELETE FROM shared_levels WHERE id = ? AND owner = ?', id, me.id);
  }

  /** Lists for the Community tab, plus this player's creator numbers (for badges). */
  browse(body: Record<string, unknown>, now = Date.now()): { levels: SharedLevelView[]; more: boolean; stats: CreatorStats } {
    const me = this.players.me(body, now);
    const tab: LevelTab = body.tab === 'suggested' || body.tab === 'new' ? body.tab : 'top';
    const scope: LevelScope = body.scope === 'friends' || body.scope === 'mine' ? body.scope : 'all';
    const offset = typeof body.offset === 'number' && Number.isInteger(body.offset) && body.offset >= 0 ? Math.min(body.offset, 2000) : 0;
    const friends = new Set(me.friends_off ? [] : this.players.friendIds(me.id));
    const blocked = this.players.blockedIds(me.id);
    const notBlocked = blocked.length ? `AND l.owner NOT IN (${blocked.map(() => '?').join(',')})` : '';
    const base = `SELECT l.*, p.name AS author FROM shared_levels l JOIN players p ON p.id = l.owner`;
    let rows: LevelRow[];
    let more = false;
    if (tab === 'suggested') {
      // Levels you haven't played or liked: well liked for their plays, a nudge for new ones and friends', then shuffled.
      const friendList = [...friends];
      const friendBonus = friendList.length ? `+ CASE WHEN l.owner IN (${friendList.map(() => '?').join(',')}) THEN 0.6 ELSE 0 END` : '';
      const pool = this.qa<LevelRow>(
        `${base} WHERE l.hidden = 0 AND l.owner != ? ${notBlocked}
         AND NOT EXISTS (SELECT 1 FROM level_plays lp WHERE lp.level_id = l.id AND lp.player_id = ?)
         AND NOT EXISTS (SELECT 1 FROM level_likes ll WHERE ll.level_id = l.id AND ll.player_id = ?)
         ORDER BY (l.likes * 3.0 + l.clears + 1.0) / (l.plays + 4.0) + CASE WHEN l.created_at > ? THEN 0.35 ELSE 0 END ${friendBonus} DESC
         LIMIT ?`,
        me.id,
        ...blocked,
        me.id,
        me.id,
        now - 7 * DAY,
        ...friendList,
        SUGGESTED * 3,
      );
      // Shuffle (a fresh mix each visit) but keep the better half more likely near the top.
      rows = pool
        .map((r, i) => ({ r, k: i / pool.length + Math.random() * 0.9 }))
        .sort((a, b) => a.k - b.k)
        .slice(0, SUGGESTED)
        .map((x) => x.r);
    } else {
      const where: string[] = ['l.hidden = 0'];
      const args: (string | number)[] = [];
      if (scope === 'mine') {
        where.length = 0;
        where.push('l.owner = ?');
        args.push(me.id);
      } else if (scope === 'friends') {
        if (!friends.size) return { levels: [], more: false, stats: this.stats(me.id) };
        where.push(`l.owner IN (${[...friends].map(() => '?').join(',')})`);
        args.push(...friends);
      }
      const order = scope === 'mine' ? 'l.updated_at DESC' : tab === 'new' ? 'l.created_at DESC' : `${SCORE} DESC, l.created_at DESC`;
      rows = this.qa<LevelRow>(`${base} WHERE ${where.join(' AND ')} ${scope === 'mine' ? '' : notBlocked} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, ...(scope === 'mine' ? [] : blocked), PAGE_SIZE + 1, offset);
      more = rows.length > PAGE_SIZE;
      rows = rows.slice(0, PAGE_SIZE);
    }
    const ids = rows.map((r) => r.id);
    const marks = ids.map(() => '?').join(',');
    const liked = new Set(ids.length ? this.qa<{ level_id: string }>(`SELECT level_id FROM level_likes WHERE player_id = ? AND level_id IN (${marks})`, me.id, ...ids).map((r) => r.level_id) : []);
    const played = new Set(ids.length ? this.qa<{ level_id: string }>(`SELECT level_id FROM level_plays WHERE player_id = ? AND level_id IN (${marks})`, me.id, ...ids).map((r) => r.level_id) : []);
    const levels = rows.map(
      (r): SharedLevelView => ({
        id: r.id,
        code: r.code,
        author: this.names.allowed(r.author, now) ? r.author : 'Rusher',
        plays: r.plays,
        clears: r.clears,
        likes: r.likes,
        liked: liked.has(r.id),
        played: played.has(r.id),
        mine: r.owner === me.id,
        friend: friends.has(r.owner),
        created: r.created_at,
      }),
    );
    return { levels, more, stats: this.stats(me.id) };
  }

  private stats(owner: string): CreatorStats {
    const s = this.q<{ n: number; plays: number | null; clears: number | null; likes: number | null }>(
      'SELECT COUNT(*) AS n, SUM(plays) AS plays, SUM(clears) AS clears, SUM(likes) AS likes FROM shared_levels WHERE owner = ?',
      owner,
    );
    return { shared: s?.n ?? 0, plays: s?.plays ?? 0, clears: s?.clears ?? 0, likes: s?.likes ?? 0 };
  }

  private visible(id: string): LevelRow {
    const row = this.q<LevelRow>('SELECT l.*, \'\' AS author FROM shared_levels l WHERE l.id = ? AND l.hidden = 0', id);
    if (!row) throw new ApiError(404, 'not_found', 'That level isn’t shared any more.');
    return row;
  }

  /** Count a play (once per player) and a clear (once per player). Your own plays don't count. */
  play(id: string, body: Record<string, unknown>, now = Date.now()): { plays: number; clears: number } {
    const me = this.players.me(body, now);
    const row = this.visible(id);
    if (row.owner !== me.id) {
      const cleared = body.cleared === true ? 1 : 0;
      const prev = this.q<{ cleared: number }>('SELECT cleared FROM level_plays WHERE level_id = ? AND player_id = ?', id, me.id);
      if (!prev) {
        this.x('INSERT INTO level_plays (level_id, player_id, cleared, at) VALUES (?, ?, ?, ?)', id, me.id, cleared, now);
        this.x('UPDATE shared_levels SET plays = plays + 1, clears = clears + ? WHERE id = ?', cleared, id);
      } else if (cleared && !prev.cleared) {
        this.x('UPDATE level_plays SET cleared = 1, at = ? WHERE level_id = ? AND player_id = ?', now, id, me.id);
        this.x('UPDATE shared_levels SET clears = clears + 1 WHERE id = ?', id);
      }
    }
    const out = this.q<{ plays: number; clears: number }>('SELECT plays, clears FROM shared_levels WHERE id = ?', id);
    return { plays: out?.plays ?? 0, clears: out?.clears ?? 0 };
  }

  like(id: string, body: Record<string, unknown>, now = Date.now()): { liked: boolean; likes: number } {
    const me = this.players.me(body, now);
    const row = this.visible(id);
    if (row.owner === me.id) throw new ApiError(400, 'own_level', 'You can’t like your own level.');
    const want = body.like !== false;
    if (want) {
      if (this.x('INSERT OR IGNORE INTO level_likes (level_id, player_id) VALUES (?, ?)', id, me.id)) this.x('UPDATE shared_levels SET likes = likes + 1 WHERE id = ?', id);
    } else if (this.x('DELETE FROM level_likes WHERE level_id = ? AND player_id = ?', id, me.id)) {
      this.x('UPDATE shared_levels SET likes = MAX(0, likes - 1) WHERE id = ?', id);
    }
    return { liked: want, likes: this.q<{ likes: number }>('SELECT likes FROM shared_levels WHERE id = ?', id)?.likes ?? 0 };
  }

  /** Report a level. Three different players hide it until a moderator looks. */
  report(id: string, body: Record<string, unknown>, now = Date.now()): { hidden: boolean } {
    const me = this.players.me(body, now);
    const row = this.visible(id);
    if (row.owner === me.id) return { hidden: false };
    const reason = (REPORT_REASONS as readonly string[]).includes(body.reason as string) ? (body.reason as string) : 'other';
    if (!this.reportsPerHour.hit(me.id, now)) throw new ApiError(429, 'slow_down', 'Thanks! We already have your reports.');
    if (this.x('INSERT OR IGNORE INTO level_reports (level_id, player_id, reason, at) VALUES (?, ?, ?, ?)', id, me.id, reason, now)) {
      this.x('UPDATE shared_levels SET reports = reports + 1 WHERE id = ?', id);
    }
    const n = this.q<{ reports: number }>('SELECT reports FROM shared_levels WHERE id = ?', id)?.reports ?? 0;
    if (n >= HIDE_AFTER_REPORTS) this.x('UPDATE shared_levels SET hidden = 1 WHERE id = ?', id);
    return { hidden: n >= HIDE_AFTER_REPORTS };
  }

  // ------------------------------------------------------------ moderation
  adminList(filter: 'reported' | 'hidden' | 'all', limit: number) {
    const where = filter === 'reported' ? 'WHERE l.reports > 0' : filter === 'hidden' ? 'WHERE l.hidden = 1' : '';
    return this.qa<LevelRow & { tag: number }>(`SELECT l.*, p.name AS author, p.tag FROM shared_levels l JOIN players p ON p.id = l.owner ${where} ORDER BY l.reports DESC, l.created_at DESC LIMIT ?`, limit).map((r) => ({
      ...r,
      reasons: this.qa<{ reason: string; n: number }>('SELECT reason, COUNT(*) AS n FROM level_reports WHERE level_id = ? GROUP BY reason', r.id),
    }));
  }

  /** Hide or restore a level. Restoring clears its reports. */
  setHidden(id: string, hidden: boolean): boolean {
    if (!hidden) this.x('DELETE FROM level_reports WHERE level_id = ?', id);
    return this.x(`UPDATE shared_levels SET hidden = ?${hidden ? '' : ', reports = 0'} WHERE id = ?`, hidden ? 1 : 0, id) > 0;
  }

  remove(id: string): boolean {
    return this.x('DELETE FROM shared_levels WHERE id = ?', id) > 0;
  }

}
