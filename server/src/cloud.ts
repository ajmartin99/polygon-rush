import { randomInt } from 'node:crypto';
import { readLevelCode, LevelCodeFormatError } from '../../src/shared/level-code.ts';
import { ApiError } from './accounts.ts';
import type { Db } from './db.ts';
import type { PlayerRow, PlayerService } from './players.ts';
import { RateLimiter } from './ratelimit.ts';
import { DAY, hmac, randomId } from './util.ts';

/**
 * The web editor (Builder Pack): a player links a browser to their game with
 * a short code shown in the app, then builds on a big screen. Levels are kept
 * here per player so they show up on both, each tagged with where it was made,
 * and the browser can send a level to the phone to test-play it.
 *
 * The phone signs calls with its device key (like the rest of the API); a
 * browser gets its own session token when it links. No personal data: levels
 * are share codes, and a browser session is only a hashed random token.
 */
export const PAIR_MS = 10 * 60_000;
export const SESSION_DAYS = 30;
export const MAX_SESSIONS = 3;
export const MAX_CLOUD_LEVELS = 60;
/** A browser used in this long counts as "open" (the phone checks for tests faster). */
export const WEB_ACTIVE_MS = 10 * 60_000;
/** A level sent to the phone waits this long. */
export const TEST_MS = 15 * 60_000;
const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LEVEL_ID_RE = /^[a-z0-9]{6,24}$/;
const MAX_CODE = 16_000;

export type MadeOn = 'mobile' | 'web';

export interface CloudLevel {
  id: string;
  code: string;
  madeOn: MadeOn;
  verified: boolean;
  updated: number;
  deleted: boolean;
}

interface CloudRow {
  player_id: string;
  id: string;
  code: string;
  made_on: string;
  verified: number;
  updated_at: number;
  deleted: number;
}

interface TestRow {
  player_id: string;
  level_id: string;
  code: string;
  sent_at: number;
  delivered_at: number;
  progress: number;
  completed: number;
  result_at: number;
}

export interface TestStatus {
  sent: number;
  delivered: boolean;
  /** Set once the phone finished a run: best progress 0..1 and whether it reached the end. */
  result: { progress: number; completed: boolean } | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cloud_pairs (
  code TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  birth_year INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  birth_year INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cloud_sessions_player ON cloud_sessions (player_id);
CREATE TABLE IF NOT EXISTS cloud_levels (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  code TEXT NOT NULL,
  made_on TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, id)
);
CREATE TABLE IF NOT EXISTS cloud_tests (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL,
  code TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  delivered_at INTEGER NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  result_at INTEGER NOT NULL DEFAULT 0
);
`;

function cleanTime(v: unknown, now: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), now + 60_000) : now;
}

export class CloudService {
  private readonly db: Db;
  private readonly secret: string;
  private readonly players: PlayerService;
  /** Codes tried per IP, so nobody can guess their way into someone's levels. */
  private readonly linkTries = new RateLimiter(20, 60 * 60 * 1000);
  private readonly pairs = new RateLimiter(20, 60 * 60 * 1000);
  private readonly tests = new RateLimiter(60, 60 * 60 * 1000);

  constructor(db: Db, secret: string, players: PlayerService) {
    this.db = db;
    this.secret = secret;
    this.players = players;
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

  private tokenHash(token: string): string {
    return hmac(this.secret, `web-session:${token}`);
  }

  // ------------------------------------------------------------ linking
  /** Phone: a code to type into the browser. The app checks the Builder Pack before asking. */
  pair(body: Record<string, unknown>, now = Date.now()): { code: string; expiresAt: number } {
    const me = this.players.me(body, now);
    if (body.builder !== true) throw new ApiError(403, 'no_builder', 'The web editor comes with the Builder Pack.');
    if (!this.pairs.hit(me.id, now)) throw new ApiError(429, 'slow_down', 'Too many codes. Try again later.');
    this.x('DELETE FROM cloud_pairs WHERE player_id = ? OR expires_at < ?', me.id, now);
    const birthYear = typeof body.birthYear === 'number' && Number.isInteger(body.birthYear) && body.birthYear > 1900 ? body.birthYear : 0;
    for (let i = 0; i < 20; i++) {
      const code = Array.from({ length: 6 }, () => PAIR_ALPHABET[randomInt(PAIR_ALPHABET.length)]).join('');
      if (this.q('SELECT 1 AS ok FROM cloud_pairs WHERE code = ?', code)) continue;
      this.x('INSERT INTO cloud_pairs (code, player_id, birth_year, expires_at) VALUES (?, ?, ?, ?)', code, me.id, birthYear, now + PAIR_MS);
      return { code, expiresAt: now + PAIR_MS };
    }
    throw new ApiError(503, 'busy', 'Please try again.');
  }

  /** Browser: swap the code for a session. */
  link(body: Record<string, unknown>, ipKey: string, now = Date.now()): { token: string; name: string; tag: number; kid: boolean; birthYear: number } {
    if (!this.linkTries.hit(ipKey, now)) throw new ApiError(429, 'slow_down', 'Too many tries. Wait a while and try again.');
    const code = typeof body.code === 'string' ? body.code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    const pair = code.length === 6 ? this.q<{ player_id: string; birth_year: number; expires_at: number }>('SELECT * FROM cloud_pairs WHERE code = ?', code) : undefined;
    if (!pair || pair.expires_at < now) throw new ApiError(404, 'bad_code', 'That code didn’t work. Make a new one in the game and try again.');
    this.x('DELETE FROM cloud_pairs WHERE code = ?', code);
    const p = this.q<PlayerRow>('SELECT * FROM players WHERE id = ?', pair.player_id);
    if (!p) throw new ApiError(404, 'bad_code', 'That code didn’t work. Make a new one in the game and try again.');
    // Keep the newest few browsers.
    const old = this.qa<{ token_hash: string }>('SELECT token_hash FROM cloud_sessions WHERE player_id = ? ORDER BY last_seen DESC', p.id).slice(MAX_SESSIONS - 1);
    for (const o of old) this.x('DELETE FROM cloud_sessions WHERE token_hash = ?', o.token_hash);
    const token = randomId(24);
    this.x('INSERT INTO cloud_sessions (token_hash, player_id, birth_year, created_at, last_seen) VALUES (?, ?, ?, ?, ?)', this.tokenHash(token), p.id, pair.birth_year, now, now);
    return { token, name: p.name, tag: p.tag, kid: p.kid === 1, birthYear: pair.birth_year };
  }

  /** Browser: who is signed in (and keep the session alive). */
  webMe(token: string, now = Date.now()): { name: string; tag: number; kid: boolean; birthYear: number } {
    const s = this.session(token, now);
    const p = this.q<PlayerRow>('SELECT * FROM players WHERE id = ?', s.player_id)!;
    return { name: p.name, tag: p.tag, kid: p.kid === 1, birthYear: s.birth_year };
  }

  logout(token: string): void {
    if (token) this.x('DELETE FROM cloud_sessions WHERE token_hash = ?', this.tokenHash(token));
  }

  /** Phone: signed-in browsers, and whether one was used lately. */
  status(body: Record<string, unknown>, now = Date.now()): { browsers: number; webActive: boolean } {
    const me = this.players.me(body, now);
    const rows = this.qa<{ last_seen: number }>('SELECT last_seen FROM cloud_sessions WHERE player_id = ? AND last_seen > ?', me.id, now - SESSION_DAYS * DAY);
    return { browsers: rows.length, webActive: rows.some((r) => r.last_seen > now - WEB_ACTIVE_MS) };
  }

  /** Phone: sign every browser out. */
  unlink(body: Record<string, unknown>, now = Date.now()): void {
    const me = this.players.me(body, now);
    this.x('DELETE FROM cloud_sessions WHERE player_id = ?', me.id);
    this.x('DELETE FROM cloud_pairs WHERE player_id = ?', me.id);
  }

  private session(token: string, now: number): { player_id: string; birth_year: number } {
    const s = token ? this.q<{ player_id: string; birth_year: number; last_seen: number }>('SELECT * FROM cloud_sessions WHERE token_hash = ?', this.tokenHash(token)) : undefined;
    if (!s || s.last_seen < now - SESSION_DAYS * DAY) throw new ApiError(401, 'signed_out', 'Link this browser again with a code from the game.');
    // A moderator banned this racer name: the browser stops working too.
    this.players.byId(s.player_id, now);
    if (s.last_seen < now - 60_000) this.x('UPDATE cloud_sessions SET last_seen = ? WHERE token_hash = ?', now, this.tokenHash(token));
    return s;
  }

  /** The player behind a call: a browser token, or the phone's device key. */
  who(token: string, body: Record<string, unknown>, now = Date.now()): { id: string; web: boolean } {
    if (token) return { id: this.session(token, now).player_id, web: true };
    return { id: this.players.me(body, now).id, web: false };
  }

  // ------------------------------------------------------------ levels
  list(playerId: string): CloudLevel[] {
    return this.qa<CloudRow>('SELECT * FROM cloud_levels WHERE player_id = ? ORDER BY updated_at DESC', playerId).map((r) => ({
      id: r.id,
      code: r.code,
      madeOn: r.made_on === 'web' ? 'web' : 'mobile',
      verified: r.verified === 1,
      updated: r.updated_at,
      deleted: r.deleted === 1,
    }));
  }

  /** Save one level (newest edit wins). */
  put(playerId: string, web: boolean, body: Record<string, unknown>, now = Date.now()): { updated: number; stored: boolean } {
    const id = typeof body.id === 'string' && LEVEL_ID_RE.test(body.id) ? body.id : '';
    if (!id) throw new ApiError(400, 'bad_level', 'That level can’t be saved.');
    const code = this.checkCode(body.code);
    const updated = cleanTime(body.updated, now);
    const madeOn: MadeOn = body.madeOn === 'web' || body.madeOn === 'mobile' ? body.madeOn : web ? 'web' : 'mobile';
    const old = this.q<CloudRow>('SELECT * FROM cloud_levels WHERE player_id = ? AND id = ?', playerId, id);
    if (old && old.updated_at > updated) return { updated: old.updated_at, stored: false };
    if (!old || old.deleted) {
      const n = this.q<{ n: number }>('SELECT COUNT(*) AS n FROM cloud_levels WHERE player_id = ? AND deleted = 0', playerId)?.n ?? 0;
      if (n >= MAX_CLOUD_LEVELS) throw new ApiError(409, 'full', `You have ${MAX_CLOUD_LEVELS} levels! Delete one to make room.`);
    }
    this.x(
      `INSERT INTO cloud_levels (player_id, id, code, made_on, verified, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(player_id, id) DO UPDATE SET code = excluded.code, made_on = cloud_levels.made_on, verified = excluded.verified, updated_at = excluded.updated_at, deleted = 0`,
      playerId,
      id,
      code,
      old && !old.deleted ? old.made_on : madeOn,
      body.verified === true ? 1 : 0,
      updated,
    );
    return { updated, stored: true };
  }

  /** Delete a level everywhere (a marker stays so the other side deletes it too). */
  remove(playerId: string, body: Record<string, unknown>, now = Date.now()): void {
    const id = typeof body.id === 'string' && LEVEL_ID_RE.test(body.id) ? body.id : '';
    if (!id) return;
    const updated = Math.max(cleanTime(body.updated, now), (this.q<{ u: number }>('SELECT updated_at AS u FROM cloud_levels WHERE player_id = ? AND id = ?', playerId, id)?.u ?? 0) + 1);
    this.x(
      `INSERT INTO cloud_levels (player_id, id, code, made_on, verified, updated_at, deleted) VALUES (?, ?, '', 'mobile', 0, ?, 1)
       ON CONFLICT(player_id, id) DO UPDATE SET code = '', deleted = 1, updated_at = excluded.updated_at`,
      playerId,
      id,
      updated,
    );
  }

  private checkCode(raw: unknown): string {
    if (typeof raw !== 'string' || raw.length > MAX_CODE) throw new ApiError(400, 'bad_level', 'That level is too big.');
    try {
      readLevelCode(raw);
    } catch (e) {
      throw new ApiError(400, 'bad_level', e instanceof LevelCodeFormatError ? e.message : 'That level is damaged.');
    }
    return raw;
  }

  // ------------------------------------------------------------ test on phone
  /** Browser: send a level to the phone (replaces any waiting one). */
  sendTest(playerId: string, body: Record<string, unknown>, now = Date.now()): TestStatus {
    if (!this.tests.hit(playerId, now)) throw new ApiError(429, 'slow_down', 'That’s a lot of tests! Wait a little.');
    const code = this.checkCode(body.code);
    const levelId = typeof body.id === 'string' && LEVEL_ID_RE.test(body.id) ? body.id : '';
    this.x(
      `INSERT INTO cloud_tests (player_id, level_id, code, sent_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(player_id) DO UPDATE SET level_id = excluded.level_id, code = excluded.code, sent_at = excluded.sent_at, delivered_at = 0, progress = 0, completed = 0, result_at = 0`,
      playerId,
      levelId,
      code,
      now,
    );
    return { sent: now, delivered: false, result: null };
  }

  testStatus(playerId: string): TestStatus | null {
    const t = this.q<TestRow>('SELECT * FROM cloud_tests WHERE player_id = ?', playerId);
    if (!t) return null;
    return { sent: t.sent_at, delivered: t.delivered_at > 0, result: t.result_at ? { progress: t.progress, completed: t.completed === 1 } : null };
  }

  /** Phone: a level waiting to be tested (handed over once), and whether a browser is open. */
  inbox(body: Record<string, unknown>, now = Date.now()): { test: { id: string; code: string; sent: number } | null; webActive: boolean } {
    const me = this.players.me(body, now);
    const t = this.q<TestRow>('SELECT * FROM cloud_tests WHERE player_id = ?', me.id);
    let test: { id: string; code: string; sent: number } | null = null;
    if (t && !t.delivered_at && t.sent_at > now - TEST_MS) {
      this.x('UPDATE cloud_tests SET delivered_at = ? WHERE player_id = ?', now, me.id);
      test = { id: t.level_id, code: t.code, sent: t.sent_at };
    }
    const webActive = Boolean(this.q('SELECT 1 AS ok FROM cloud_sessions WHERE player_id = ? AND last_seen > ?', me.id, now - WEB_ACTIVE_MS));
    return { test, webActive };
  }

  /** Phone: how the test went (shown in the browser). */
  testResult(body: Record<string, unknown>, now = Date.now()): void {
    const me = this.players.me(body, now);
    const progress = typeof body.progress === 'number' && Number.isFinite(body.progress) ? Math.min(1, Math.max(0, body.progress)) : 0;
    this.x('UPDATE cloud_tests SET progress = MAX(progress, ?), completed = MAX(completed, ?), result_at = ? WHERE player_id = ? AND sent_at = ?', progress, body.completed === true ? 1 : 0, now, me.id, typeof body.sent === 'number' ? body.sent : -1);
  }

  /** Old pair codes, browser sessions and delete markers. */
  purge(now: number): number {
    return (
      this.x('DELETE FROM cloud_pairs WHERE expires_at < ?', now) +
      this.x('DELETE FROM cloud_sessions WHERE last_seen < ?', now - SESSION_DAYS * DAY) +
      this.x('DELETE FROM cloud_levels WHERE deleted = 1 AND updated_at < ?', now - 90 * DAY) +
      this.x('DELETE FROM cloud_tests WHERE sent_at < ?', now - DAY)
    );
  }
}
