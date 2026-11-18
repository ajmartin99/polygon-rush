import { ApiError } from './accounts.ts';
import type { Db } from './db.ts';
import type { PlayerService } from './players.ts';
import { DAY, randomId } from './util.ts';

/**
 * Secret Santa (Christmas Wonderland): once a day a player can send one
 * friend a wrapped present. There's no text, only a wrapping paper, so it
 * is as safe as an invite. What's inside is decided by the game from the
 * present's id. Presents can only go between friends, never to someone who
 * blocked you or has friends switched off, and only in the Christmas season.
 */
export const WRAPS = 4;
const KEEP_DAYS = 30;

export interface PresentView {
  id: string;
  from: { id: string; name: string; tag: number };
  wrap: number;
  at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS presents (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  wrap INTEGER NOT NULL,
  opened INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (from_id, day)
);
CREATE INDEX IF NOT EXISTS presents_to ON presents (to_id, opened);
`;

/** December 1st to January 6th (server time). */
export function santaSeason(now = Date.now()): boolean {
  const d = new Date(now);
  return d.getUTCMonth() === 11 || (d.getUTCMonth() === 0 && d.getUTCDate() <= 6);
}

const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

export class SantaService {
  private readonly db: Db;
  private readonly players: PlayerService;

  constructor(db: Db, players: PlayerService) {
    this.db = db;
    this.players = players;
    db.sql.exec(SCHEMA);
  }

  /** Send today's present to a friend. */
  send(body: Record<string, unknown>, now = Date.now()): { ok: true } {
    if (!santaSeason(now)) throw new ApiError(403, 'not_season', 'Secret Santa is back next Christmas!');
    const me = this.players.me(body, now);
    if (me.friends_off) throw new ApiError(403, 'friends_off', 'Friends are switched off in Parental Controls.');
    const to = typeof body.id === 'string' ? body.id : '';
    if (!this.players.friendIds(me.id).includes(to) || this.players.blockedEither(me.id, to)) throw new ApiError(404, 'not_found', 'You can only send presents to friends.');
    const them = this.db.sql.prepare('SELECT friends_off FROM players WHERE id = ?').get(to) as { friends_off: number } | undefined;
    if (!them || them.friends_off) throw new ApiError(404, 'not_found', 'You can only send presents to friends.');
    const day = dayKey(now);
    if (this.db.sql.prepare('SELECT 1 AS ok FROM presents WHERE from_id = ? AND day = ?').get(me.id, day)) {
      throw new ApiError(409, 'sent_today', 'You already sent today’s present. You can send another tomorrow!');
    }
    const wrap = typeof body.wrap === 'number' && Number.isInteger(body.wrap) && body.wrap >= 0 && body.wrap < WRAPS ? body.wrap : 0;
    this.db.sql.prepare('INSERT INTO presents (id, from_id, to_id, day, wrap, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomId(9), me.id, to, day, wrap, now);
    return { ok: true };
  }

  /** Presents waiting for you, and whether you've sent today's (and to whom). */
  inbox(body: Record<string, unknown>, now = Date.now()): { presents: PresentView[]; sentToday: string | null } {
    const me = this.players.me(body, now);
    const rows = this.db.sql
      .prepare(
        `SELECT g.id, g.wrap, g.created_at, p.id AS pid, p.name, p.tag FROM presents g JOIN players p ON p.id = g.from_id
         WHERE g.to_id = ? AND g.opened = 0 ORDER BY g.created_at LIMIT 20`,
      )
      .all(me.id) as { id: string; wrap: number; created_at: number; pid: string; name: string; tag: number }[];
    const blocked = new Set(rows.filter((r) => this.players.blockedEither(me.id, r.pid)).map((r) => r.id));
    const sent = this.db.sql.prepare('SELECT to_id FROM presents WHERE from_id = ? AND day = ?').get(me.id, dayKey(now)) as { to_id: string } | undefined;
    return {
      presents: rows.filter((r) => !blocked.has(r.id)).map((r) => ({ id: r.id, from: { id: r.pid, name: r.name, tag: r.tag }, wrap: r.wrap, at: r.created_at })),
      sentToday: sent?.to_id ?? null,
    };
  }

  /** Unwrap a present (each one opens once). */
  open(body: Record<string, unknown>, now = Date.now()): { id: string } {
    const me = this.players.me(body, now);
    const id = typeof body.id === 'string' ? body.id : '';
    const changed = Number(this.db.sql.prepare('UPDATE presents SET opened = 1 WHERE id = ? AND to_id = ? AND opened = 0').run(id, me.id).changes);
    if (!changed) throw new ApiError(404, 'not_found', 'That present was already opened.');
    return { id };
  }

  purge(now: number): number {
    return Number(this.db.sql.prepare('DELETE FROM presents WHERE created_at < ?').run(now - KEEP_DAYS * DAY).changes);
  }
}
