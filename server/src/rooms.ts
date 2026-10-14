import { isGeneratedName } from '../../src/meta/names.ts';
import type { Db } from './db.ts';
import { RateLimiter } from './ratelimit.ts';
import { ApiError } from './accounts.ts';
import { randomId, safeEqual } from './util.ts';

const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ23456789]{4}$/;
const TTL = 45_000;
const MAX_ROOMS = 200;
const HIDE_AFTER_REPORTS = 3;

export interface PublicRoom {
  code: string;
  /** Level name indexes (the app turns them into words). */
  name: [number, number];
  host: string;
  players: number;
  max: number;
  theme: number;
  createdAt: number;
}

interface RoomEntry extends PublicRoom {
  secret: string;
  ipKey: string;
  seen: number;
  hidden: boolean;
  reporters: Set<string>;
}

function int(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
}

/**
 * Public build rooms ("join someone's build"). Hosts list their room code
 * here and keep it alive with a heartbeat; the game connects peer-to-peer.
 * Only generated names and level-name indexes are listed — nothing typed.
 */
export class RoomDirectory {
  private readonly db: Db;
  private rooms = new Map<string, RoomEntry>();
  private readonly creates = new RateLimiter(10, 60 * 60 * 1000);

  constructor(db: Db) {
    this.db = db;
  }

  private parse(body: Record<string, unknown>): Omit<PublicRoom, 'code' | 'createdAt'> {
    const name = Array.isArray(body.name) ? body.name : [];
    const a = int(name[0], 0, 31);
    const n = int(name[1], 0, 31);
    const players = int(body.players, 1, 4);
    const max = int(body.max, 2, 4) ?? 4;
    const theme = int(body.theme, 0, 5);
    if (a === null || n === null || players === null || theme === null) throw new ApiError(400, 'bad_room', 'Room details are missing.');
    if (typeof body.host !== 'string' || !isGeneratedName(body.host)) throw new ApiError(400, 'bad_room', 'Only generated racer names can host.');
    return { name: [a, n], host: body.host, players, max, theme };
  }

  register(code: unknown, body: Record<string, unknown>, ipKey: string, now = Date.now()): { secret: string } {
    this.sweep(now);
    if (typeof code !== 'string' || !CODE_RE.test(code)) throw new ApiError(400, 'bad_room', 'Bad room code.');
    const info = this.parse(body);
    const mine = [...this.rooms.values()].filter((r) => r.ipKey === ipKey).length;
    if (mine >= 2 || !this.creates.hit(ipKey, now)) throw new ApiError(429, 'slow_down', 'Too many public rooms from this connection.');
    if (this.rooms.size >= MAX_ROOMS) throw new ApiError(503, 'full', 'Public rooms are full right now. Try a friends room!');
    const existing = this.rooms.get(code);
    if (existing && existing.ipKey !== ipKey && existing.seen + TTL > now) throw new ApiError(409, 'taken', 'That room is already listed.');
    const secret = randomId(18);
    this.rooms.set(code, { ...info, code, createdAt: now, secret, ipKey, seen: now, hidden: false, reporters: new Set() });
    return { secret };
  }

  beat(code: unknown, body: Record<string, unknown>, now = Date.now()): void {
    const r = typeof code === 'string' ? this.rooms.get(code) : undefined;
    if (!r || typeof body.secret !== 'string' || !safeEqual(body.secret, r.secret)) throw new ApiError(404, 'not_found', 'Room not listed.');
    const info = this.parse({ ...r, ...body });
    Object.assign(r, info, { seen: now });
  }

  remove(code: unknown, secret: unknown): void {
    const r = typeof code === 'string' ? this.rooms.get(code) : undefined;
    if (r && typeof secret === 'string' && safeEqual(secret, r.secret)) this.rooms.delete(r.code);
  }

  list(now = Date.now()): PublicRoom[] {
    this.sweep(now);
    return [...this.rooms.values()]
      .filter((r) => !r.hidden && r.players < r.max)
      .sort((a, b) => b.players - a.players || b.createdAt - a.createdAt)
      .slice(0, 50)
      .map(({ code, name, host, players, max, theme, createdAt }) => ({ code, name, host, players, max, theme, createdAt }));
  }

  /** Anyone in a public room can report it (bad drawings, griefing...). */
  report(code: unknown, body: Record<string, unknown>, ipKey: string, reporter: string | null, now = Date.now()): void {
    const r = typeof code === 'string' ? this.rooms.get(code) : undefined;
    if (!r) throw new ApiError(404, 'not_found', 'Room not listed.');
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 60) : 'unspecified';
    const level = typeof body.level === 'string' && body.level.length <= 16_000 && /^PR1-[A-Za-z0-9_-]+$/.test(body.level) ? body.level : null;
    const key = reporter ?? ipKey;
    if (r.reporters.has(key)) return;
    r.reporters.add(key);
    this.db.addReport({
      id: randomId(10),
      kind: 'room',
      reporter,
      reporter_ip: ipKey,
      target_account: null,
      message_id: null,
      channel: null,
      room_code: r.code,
      reason,
      context: JSON.stringify({ host: r.host, name: r.name, level }),
      created_at: now,
    });
    if (r.reporters.size >= HIDE_AFTER_REPORTS) r.hidden = true;
  }

  hide(code: string, hidden: boolean): boolean {
    const r = this.rooms.get(code);
    if (!r) return false;
    r.hidden = hidden;
    return true;
  }

  adminList(now = Date.now()): (PublicRoom & { hidden: boolean; reports: number })[] {
    this.sweep(now);
    return [...this.rooms.values()].map(({ code, name, host, players, max, theme, createdAt, hidden, reporters }) => ({ code, name, host, players, max, theme, createdAt, hidden, reports: reporters.size }));
  }

  private sweep(now: number): void {
    for (const [code, r] of this.rooms) if (r.seen + TTL < now) this.rooms.delete(code);
  }
}
