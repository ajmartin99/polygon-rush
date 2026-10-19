import { randomInt } from 'node:crypto';
import { isGeneratedName } from '../../src/meta/names.ts';
import { checkDisplayText, NAME_MESSAGES } from '../../src/shared/chat-filter.ts';
import { parseHandle } from '../../src/shared/handle.ts';
import { ApiError } from './accounts.ts';
import type { Db } from './db.ts';
import type { NameRegistry } from './names.ts';
import { RateLimiter } from './ratelimit.ts';
import { CODE_RE } from './rooms.ts';
import { DAY, hmac, randomId } from './util.ts';

/**
 * Players and friends.
 *
 * A player is a random device key (stored only as an HMAC) with a racer name
 * and a 4-digit tag, so many people can share a name: "Neon Fox#0427".
 * Friends are added by exact Name#tag only (no search or directory), both
 * sides must accept, and either can remove or block. Online status and room
 * invites carry no free text: an invite is a kind (race/build) and a room code.
 */
export const MAX_FRIENDS = 100;
const MAX_PENDING = 50;
/** Seen within this long = online. */
export const ONLINE_MS = 90_000;
/** Invites expire after this long. */
export const INVITE_MS = 10 * 60_000;
const ACTIVITIES = ['menu', 'race', 'build', 'play'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export interface PlayerRow {
  id: string;
  key_hash: string;
  name: string;
  name_lc: string;
  tag: number;
  kid: number;
  friends_off: number;
  activity: string;
  created_at: number;
  last_seen: number;
  /** Latest game profile card (JSON, game facts only) and skin, sent with sync. */
  card: string;
  skin: string;
}

/** A player's profile card as other players fetch it. The game cleans the card again on arrival. */
export interface CardView {
  name: string;
  skin: string;
  card: Record<string, unknown> | null;
}

const MAX_CARD_JSON = 2048;
const SKIN_RE = /^[a-z0-9_-]{1,32}$/;

export interface PublicPlayer {
  id: string;
  name: string;
  tag: number;
}

export interface FriendView extends PublicPlayer {
  online: boolean;
  activity: Activity | null;
}

export interface InviteView {
  id: string;
  from: PublicPlayer;
  kind: 'race' | 'build';
  room: string;
  at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_lc TEXT NOT NULL,
  tag INTEGER NOT NULL,
  kid INTEGER NOT NULL DEFAULT 0,
  friends_off INTEGER NOT NULL DEFAULT 0,
  activity TEXT NOT NULL DEFAULT 'menu',
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  UNIQUE (name_lc, tag)
);
CREATE TABLE IF NOT EXISTS friends (
  a TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  b TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE INDEX IF NOT EXISTS friends_b ON friends (b);
CREATE TABLE IF NOT EXISTS friend_requests (
  from_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests (to_id);
CREATE TABLE IF NOT EXISTS blocks (
  by_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (by_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  room TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS invites_to ON invites (to_id, created_at);
`;

export class PlayerService {
  private readonly db: Db;
  private readonly secret: string;
  private readonly names: NameRegistry;
  /** New players per IP (schools and families share one), renames per player. */
  private readonly joins = new RateLimiter(60, 60 * 60 * 1000);
  private readonly renames = new RateLimiter(10, 60 * 60 * 1000);
  private readonly adds = new RateLimiter(30, 60 * 60 * 1000);
  private readonly invitesPerMin = new RateLimiter(12, 60 * 1000);

  constructor(db: Db, secret: string, names: NameRegistry) {
    this.db = db;
    this.secret = secret;
    this.names = names;
    db.sql.exec(SCHEMA);
    // Profile cards came after the first release.
    const cols = new Set((db.sql.prepare('PRAGMA table_info(players)').all() as { name: string }[]).map((c) => c.name));
    if (!cols.has('card')) db.sql.exec("ALTER TABLE players ADD COLUMN card TEXT NOT NULL DEFAULT ''");
    if (!cols.has('skin')) db.sql.exec("ALTER TABLE players ADD COLUMN skin TEXT NOT NULL DEFAULT ''");
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

  private keyHash(key: unknown): string {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new ApiError(400, 'bad_key', 'Please update the app.');
    return hmac(this.secret, `name-key:${key}`);
  }

  /** The caller, or 401 if this device hasn't registered yet. */
  me(body: Record<string, unknown>, now = Date.now()): PlayerRow {
    const row = this.q<PlayerRow>('SELECT * FROM players WHERE key_hash = ?', this.keyHash(body.key));
    if (!row) throw new ApiError(401, 'not_registered', 'Please restart the app.');
    // A moderator banned this name since: the app must pick a new one.
    if (!this.names.allowed(row.name, now)) throw new ApiError(403, 'name_banned', 'Your racer name was reset by our safety team.');
    return row;
  }

  private pub(r: Pick<PlayerRow, 'id' | 'name' | 'tag'>): PublicPlayer {
    return { id: r.id, name: r.name, tag: r.tag };
  }

  private freeTag(nameLc: string, prefer: number): number {
    const used = new Set(this.qa<{ tag: number }>('SELECT tag FROM players WHERE name_lc = ?', nameLc).map((r) => r.tag));
    if (prefer >= 1 && prefer <= 9999 && !used.has(prefer)) return prefer;
    if (used.size >= 9999) throw new ApiError(409, 'name_full', 'That name is very popular. Try a different one!');
    for (let i = 0; i < 50; i++) {
      const t = randomInt(1, 10000);
      if (!used.has(t)) return t;
    }
    for (let t = 1; t <= 9999; t++) if (!used.has(t)) return t;
    throw new ApiError(409, 'name_full', 'That name is very popular. Try a different one!');
  }

  /**
   * Create or update this device's player: name (generated, or typed for 13+),
   * kid flag and the parents' friends switch. Keeps the tag when it can.
   */
  register(body: Record<string, unknown>, ipKey: string, now = Date.now()): PublicPlayer & { friendsOff: boolean } {
    const keyHash = this.keyHash(body.key);
    const kid = body.kid === true;
    const raw = typeof body.name === 'string' ? body.name : '';
    let name: string;
    if (isGeneratedName(raw)) name = raw;
    else {
      if (kid) throw new ApiError(400, 'bad_name', 'Pick one of the generated names.');
      const r = checkDisplayText(raw, 'name');
      if (!r.ok || r.text !== raw) throw new ApiError(400, 'bad_name', NAME_MESSAGES[r.reason ?? 'empty']);
      name = r.text;
    }
    if (!this.names.allowed(name, now)) throw new ApiError(403, 'name_banned', 'That name isn’t allowed.');
    const friendsOff = body.friendsOff === true ? 1 : 0;
    const lc = name.toLowerCase();
    const row = this.q<PlayerRow>('SELECT * FROM players WHERE key_hash = ?', keyHash);
    if (!row) {
      if (!this.joins.hit(ipKey, now)) throw new ApiError(429, 'slow_down', 'Too many name changes. Try again later.');
      const tag = this.freeTag(lc, typeof body.tag === 'number' ? body.tag : 0);
      const id = randomId(9);
      this.x(
        'INSERT INTO players (id, key_hash, name, name_lc, tag, kid, friends_off, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        keyHash,
        name,
        lc,
        tag,
        kid ? 1 : 0,
        friendsOff,
        now,
        now,
      );
      return { id, name, tag, friendsOff: Boolean(friendsOff) };
    }
    let tag = row.tag;
    if (row.name_lc !== lc) {
      if (!this.renames.hit(row.id, now)) throw new ApiError(429, 'slow_down', 'Too many name changes. Try again later.');
      tag = this.freeTag(lc, row.tag);
    }
    this.x('UPDATE players SET name = ?, name_lc = ?, tag = ?, kid = ?, friends_off = ?, last_seen = ? WHERE id = ?', name, lc, tag, kid ? 1 : 0, friendsOff, now, row.id);
    if (friendsOff) this.x('DELETE FROM invites WHERE to_id = ?', row.id);
    return { id: row.id, name, tag, friendsOff: Boolean(friendsOff) };
  }

  /** Forget this device's player, friends, requests and invites. */
  remove(body: Record<string, unknown>): void {
    this.x('DELETE FROM players WHERE key_hash = ?', this.keyHash(body.key));
  }

  private pair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private areFriends(a: string, b: string): boolean {
    const [x, y] = this.pair(a, b);
    return Boolean(this.q('SELECT 1 AS ok FROM friends WHERE a = ? AND b = ?', x, y));
  }

  private blocked(by: string, who: string): boolean {
    return Boolean(this.q('SELECT 1 AS ok FROM blocks WHERE by_id = ? AND blocked_id = ?', by, who));
  }

  private friendCount(id: string): number {
    return this.q<{ n: number }>('SELECT COUNT(*) AS n FROM friends WHERE a = ? OR b = ?', id, id)?.n ?? 0;
  }

  /**
   * Heartbeat + everything the Friends screen needs: friends with online
   * status, requests both ways and invites waiting for this player.
   */
  sync(body: Record<string, unknown>, now = Date.now()) {
    const me = this.me(body, now);
    const activity = (ACTIVITIES as readonly string[]).includes(body.activity as string) ? (body.activity as string) : 'menu';
    this.x('UPDATE players SET last_seen = ?, activity = ? WHERE id = ?', now, activity, me.id);
    this.saveCard(me, body);
    if (me.friends_off)
      return {
        me: { ...this.pub(me), friendsOff: true },
        friends: [],
        incoming: [],
        outgoing: [],
        invites: [],
      };
    const friends = this.qa<PlayerRow>(
      `SELECT p.* FROM friends f JOIN players p ON p.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
       WHERE f.a = ? OR f.b = ? ORDER BY p.name_lc, p.tag`,
      me.id,
      me.id,
      me.id,
    ).map(
      (p): FriendView => ({
        ...this.pub(p),
        online: !p.friends_off && now - p.last_seen < ONLINE_MS,
        activity: !p.friends_off && now - p.last_seen < ONLINE_MS ? (p.activity as Activity) : null,
      }),
    );
    const incoming = this.qa<PlayerRow>('SELECT p.* FROM friend_requests r JOIN players p ON p.id = r.from_id WHERE r.to_id = ? ORDER BY r.created_at DESC LIMIT ?', me.id, MAX_PENDING).map((p) =>
      this.pub(p),
    );
    const outgoing = this.qa<PlayerRow>('SELECT p.* FROM friend_requests r JOIN players p ON p.id = r.to_id WHERE r.from_id = ? ORDER BY r.created_at DESC LIMIT ?', me.id, MAX_PENDING).map((p) =>
      this.pub(p),
    );
    const invites = this.qa<{
      id: string;
      kind: 'race' | 'build';
      room: string;
      created_at: number;
      pid: string;
      name: string;
      tag: number;
    }>(
      `SELECT i.id, i.kind, i.room, i.created_at, p.id AS pid, p.name, p.tag FROM invites i JOIN players p ON p.id = i.from_id
       WHERE i.to_id = ? AND i.created_at > ? ORDER BY i.created_at DESC LIMIT 10`,
      me.id,
      now - INVITE_MS,
    ).map(
      (i): InviteView => ({
        id: i.id,
        from: { id: i.pid, name: i.name, tag: i.tag },
        kind: i.kind,
        room: i.room,
        at: i.created_at,
      }),
    );
    return {
      me: { ...this.pub(me), friendsOff: false },
      friends,
      incoming,
      outgoing,
      invites,
    };
  }

  /** Send a friend request by exact Name#tag (or accept theirs if they already asked). */
  add(body: Record<string, unknown>, ipKey: string, now = Date.now()): { state: 'sent' | 'friends' } {
    const me = this.me(body, now);
    if (me.friends_off) throw new ApiError(403, 'friends_off', 'Friends are switched off in Parental Controls.');
    if (!this.adds.hit(me.id, now) || !this.adds.hit(`ip:${ipKey}`, now)) throw new ApiError(429, 'slow_down', 'Slow down a little and try again later.');
    const h = parseHandle(body.handle);
    const notFound = new ApiError(404, 'not_found', 'No racer with that name and number. Check the # number too.');
    if (!h) throw notFound;
    const them = this.q<PlayerRow>('SELECT * FROM players WHERE name_lc = ? AND tag = ?', h.name.toLowerCase(), h.tag);
    // Blocked and switched-off players look the same as nobody (no hints).
    if (!them || them.id === me.id || them.friends_off || this.blocked(them.id, me.id) || !this.names.allowed(them.name, now)) {
      if (them && them.id === me.id) throw new ApiError(400, 'self', 'That’s you!');
      throw notFound;
    }
    if (this.areFriends(me.id, them.id)) return { state: 'friends' };
    if (this.friendCount(me.id) >= MAX_FRIENDS) throw new ApiError(409, 'too_many', `You can have up to ${MAX_FRIENDS} friends.`);
    this.x('DELETE FROM blocks WHERE by_id = ? AND blocked_id = ?', me.id, them.id);
    if (this.q('SELECT 1 AS ok FROM friend_requests WHERE from_id = ? AND to_id = ?', them.id, me.id)) {
      this.befriend(me.id, them.id, now);
      return { state: 'friends' };
    }
    const pending = this.q<{ n: number }>('SELECT COUNT(*) AS n FROM friend_requests WHERE to_id = ?', them.id)?.n ?? 0;
    if (pending >= MAX_PENDING) throw notFound;
    this.x('INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)', me.id, them.id, now);
    return { state: 'sent' };
  }

  private befriend(a: string, b: string, now: number): void {
    const [x, y] = this.pair(a, b);
    this.x('INSERT OR IGNORE INTO friends (a, b, created_at) VALUES (?, ?, ?)', x, y, now);
    this.x('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', a, b, b, a);
  }

  respond(body: Record<string, unknown>, now = Date.now()): { state: 'friends' | 'declined' } {
    const me = this.me(body, now);
    const id = typeof body.id === 'string' ? body.id : '';
    if (!this.q('SELECT 1 AS ok FROM friend_requests WHERE from_id = ? AND to_id = ?', id, me.id)) throw new ApiError(404, 'not_found', 'That request is gone.');
    if (body.accept === true) {
      if (this.friendCount(me.id) >= MAX_FRIENDS) throw new ApiError(409, 'too_many', `You can have up to ${MAX_FRIENDS} friends.`);
      this.befriend(me.id, id, now);
      return { state: 'friends' };
    }
    this.x('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?', id, me.id);
    return { state: 'declined' };
  }

  /** Unfriend, or cancel a request either way. */
  unfriend(body: Record<string, unknown>, now = Date.now()): void {
    const me = this.me(body, now);
    const id = typeof body.id === 'string' ? body.id : '';
    const [x, y] = this.pair(me.id, id);
    this.x('DELETE FROM friends WHERE a = ? AND b = ?', x, y);
    this.x('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', me.id, id, id, me.id);
    this.x('DELETE FROM invites WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', me.id, id, id, me.id);
  }

  /** Unfriend and stop them sending requests or invites. */
  block(body: Record<string, unknown>, now = Date.now()): void {
    const me = this.me(body, now);
    const id = typeof body.id === 'string' ? body.id : '';
    if (!this.q('SELECT 1 AS ok FROM players WHERE id = ?', id)) return;
    this.unfriend(body, now);
    this.x('INSERT OR IGNORE INTO blocks (by_id, blocked_id, created_at) VALUES (?, ?, ?)', me.id, id, now);
  }

  /** Invite a friend to a race or build room (a room code, never text). */
  invite(body: Record<string, unknown>, now = Date.now()): { ok: true } {
    const me = this.me(body, now);
    const id = typeof body.id === 'string' ? body.id : '';
    const kind = body.kind === 'build' ? 'build' : body.kind === 'race' ? 'race' : null;
    if (!kind || typeof body.room !== 'string' || !CODE_RE.test(body.room)) throw new ApiError(400, 'bad_invite', 'Please update the app.');
    if (me.friends_off) throw new ApiError(403, 'friends_off', 'Friends are switched off in Parental Controls.');
    if (!this.areFriends(me.id, id)) throw new ApiError(404, 'not_found', 'You can only invite friends.');
    if (!this.invitesPerMin.hit(me.id, now)) throw new ApiError(429, 'slow_down', 'Slow down a little.');
    this.x('DELETE FROM invites WHERE from_id = ? AND to_id = ?', me.id, id);
    this.x('INSERT INTO invites (id, from_id, to_id, kind, room, created_at) VALUES (?, ?, ?, ?, ?, ?)', randomId(9), me.id, id, kind, body.room, now);
    return { ok: true };
  }

  dismissInvite(body: Record<string, unknown>, now = Date.now()): void {
    const me = this.me(body, now);
    this.x('DELETE FROM invites WHERE id = ? AND to_id = ?', typeof body.id === 'string' ? body.id : '', me.id);
  }

  /** Ids of this player's friends. */
  friendIds(id: string): string[] {
    return this.qa<{ id: string }>('SELECT CASE WHEN a = ? THEN b ELSE a END AS id FROM friends WHERE a = ? OR b = ?', id, id, id).map((r) => r.id);
  }

  /** Ids of players this player blocked. */
  /** Keep the card and skin the game sent (game facts only; size-capped). */
  private saveCard(me: PlayerRow, body: Record<string, unknown>): void {
    const c = body.card;
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      const json = JSON.stringify(c);
      if (json.length <= MAX_CARD_JSON && json !== me.card) this.x('UPDATE players SET card = ? WHERE id = ?', json, me.id);
    }
    if (typeof body.skin === 'string' && SKIN_RE.test(body.skin) && body.skin !== me.skin) this.x('UPDATE players SET skin = ? WHERE id = ?', body.skin, me.id);
  }

  /** Either player blocked the other. */
  blockedEither(a: string, b: string): boolean {
    return Boolean(this.q('SELECT 1 AS ok FROM blocks WHERE (by_id = ? AND blocked_id = ?) OR (by_id = ? AND blocked_id = ?)', a, b, b, a));
  }

  /** A player's card for someone else to see. Under-13s' #number never leaves. */
  cardView(id: string, now = Date.now()): CardView {
    const p = this.q<PlayerRow>('SELECT * FROM players WHERE id = ?', id);
    if (!p) throw new ApiError(404, 'not_found', 'That player isn’t around any more.');
    let card: Record<string, unknown> | null = null;
    try {
      card = p.card ? (JSON.parse(p.card) as Record<string, unknown>) : null;
    } catch {
      card = null;
    }
    if (card && p.kid) delete card.tag;
    return { name: this.names.allowed(p.name, now) ? p.name : 'Rusher', skin: p.skin || 'classic', card };
  }

  /** A friend's profile card (POST /api/friends/card). */
  friendCard(body: Record<string, unknown>, now = Date.now()): CardView {
    const me = this.me(body, now);
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id || !this.friendIds(me.id).includes(id)) throw new ApiError(404, 'not_found', 'That player isn’t on your friends list.');
    return this.cardView(id, now);
  }

  blockedIds(id: string): string[] {
    return this.qa<{ id: string }>('SELECT blocked_id AS id FROM blocks WHERE by_id = ?', id).map((r) => r.id);
  }

  /** Expired invites; players unseen for `inactiveDays` (and everything of theirs). */
  purge(now: number, inactiveDays: number): Record<string, number> {
    return {
      invites: this.x('DELETE FROM invites WHERE created_at < ?', now - INVITE_MS),
      players: this.x('DELETE FROM players WHERE last_seen < ?', now - inactiveDays * DAY),
    };
  }

  /** Moderation: who holds this name (all tags). */
  byName(name: string): (PublicPlayer & { last_seen: number })[] {
    return this.qa<PlayerRow>('SELECT * FROM players WHERE name_lc = ? ORDER BY tag', name.toLowerCase()).map((p) => ({ ...this.pub(p), last_seen: p.last_seen }));
  }
}
