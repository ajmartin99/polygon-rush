import type { Db } from './db.ts';
import { RateLimiter } from './ratelimit.ts';
import { ApiError } from './accounts.ts';
import { randomId, safeEqual } from './util.ts';
import type { NameRegistry } from './names.ts';

export const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ23456789]{4}$/;
const TTL = 45_000;
const MAX_ROOMS = 200;
const HIDE_AFTER_REPORTS = 3;
/** A hidden room's code can't list again for a day; its host's connection for 2 hours (IPs can be shared by a whole school). */
const HIDDEN_CODE_COOLDOWN = 24 * 60 * 60 * 1000;
const HIDDEN_IP_COOLDOWN = 2 * 60 * 60 * 1000;

export type RoomKind = 'build' | 'race';

export interface PublicRoom {
  code: string;
  /** Build together, or race (Quick Match). */
  kind: RoomKind;
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
  open: boolean;
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
  private cooldowns = new Map<string, number>();

  private readonly names: NameRegistry;

  constructor(db: Db, names: NameRegistry) {
    this.db = db;
    this.names = names;
  }

  private parse(body: Record<string, unknown>): Omit<PublicRoom, 'code' | 'createdAt' | 'kind'> & { open: boolean } {
    const name = Array.isArray(body.name) ? body.name : [];
    const a = int(name[0], 0, 255);
    const n = int(name[1], 0, 255);
    const players = int(body.players, 1, 4);
    const max = int(body.max, 2, 4) ?? 4;
    const theme = int(body.theme, 0, 5);
    if (a === null || n === null || players === null || theme === null) throw new ApiError(400, 'bad_room', 'Room details are missing.');
    if (!this.names.allowed(body.host)) throw new ApiError(400, 'bad_room', 'That racer name can’t host a public room.');
    // A race that has started can't be joined: it stays registered (reports still work) but unlisted.
    return { name: [a, n], host: body.host, players, max, theme, open: body.open !== false };
  }

  register(code: unknown, body: Record<string, unknown>, ipKey: string, now = Date.now()): { secret: string } {
    this.sweep(now);
    if (typeof code !== 'string' || !CODE_RE.test(code)) throw new ApiError(400, 'bad_room', 'Bad room code.');
    const info = this.parse(body);
    if ((this.cooldowns.get(`ip:${ipKey}`) ?? 0) > now || (this.cooldowns.get(`code:${code}`) ?? 0) > now) {
      throw new ApiError(403, 'room_blocked', 'Public rooms are paused for you after reports. Friends rooms still work.');
    }
    const mine = [...this.rooms.values()].filter((r) => r.ipKey === ipKey).length;
    if (mine >= 2 || !this.creates.hit(ipKey, now)) throw new ApiError(429, 'slow_down', 'Too many public rooms from this connection.');
    if (this.rooms.size >= MAX_ROOMS) throw new ApiError(503, 'full', 'Public rooms are full right now. Try a friends room!');
    const existing = this.rooms.get(code);
    if (existing && existing.ipKey !== ipKey && existing.seen + TTL > now) throw new ApiError(409, 'taken', 'That room is already listed.');
    const secret = randomId(18);
    const kind: RoomKind = body.kind === 'race' ? 'race' : 'build';
    this.rooms.set(code, { ...info, kind, code, createdAt: now, secret, ipKey, seen: now, hidden: false, reporters: new Set() });
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

  list(now = Date.now(), kind: RoomKind = 'build'): PublicRoom[] {
    this.sweep(now);
    return [...this.rooms.values()]
      .filter((r) => r.kind === kind && r.open && !r.hidden && r.players < r.max)
      .sort((a, b) => b.players - a.players || b.createdAt - a.createdAt)
      .slice(0, 50)
      .map(({ code, kind, name, host, players, max, theme, createdAt }) => ({ code, kind, name, host, players, max, theme, createdAt }));
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
    if (r.reporters.size >= HIDE_AFTER_REPORTS) this.setHidden(r, true, now);
  }

  hide(code: string, hidden: boolean, now = Date.now()): boolean {
    const r = this.rooms.get(code);
    if (!r) return false;
    this.setHidden(r, hidden, now);
    return true;
  }

  private setHidden(r: RoomEntry, hidden: boolean, now: number): void {
    r.hidden = hidden;
    if (hidden) {
      this.cooldowns.set(`ip:${r.ipKey}`, now + HIDDEN_IP_COOLDOWN);
      this.cooldowns.set(`code:${r.code}`, now + HIDDEN_CODE_COOLDOWN);
    } else {
      this.cooldowns.delete(`ip:${r.ipKey}`);
      this.cooldowns.delete(`code:${r.code}`);
    }
  }

  adminList(now = Date.now()): (PublicRoom & { open: boolean; hidden: boolean; reports: number })[] {
    this.sweep(now);
    return [...this.rooms.values()].map(({ code, kind, name, host, players, max, theme, createdAt, open, hidden, reporters }) => ({ code, kind, name, host, players, max, theme, createdAt, open, hidden, reports: reporters.size }));
  }

  private sweep(now: number): void {
    for (const [code, r] of this.rooms) if (r.seen + TTL < now) this.rooms.delete(code);
    for (const [k, until] of this.cooldowns) if (until < now) this.cooldowns.delete(k);
  }
}
