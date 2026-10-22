import { ApiError } from './accounts.ts';
import type { Db } from './db.ts';
import type { PlayerService } from './players.ts';
import { RateLimiter } from './ratelimit.ts';

/**
 * Promo codes: made by us on /promos/admin, typed by players in
 * Settings → Redeem a code. Each player can use a code once; a code can
 * have a use limit and an end date. The server only checks the code and
 * remembers who used it; the game hands out the reward.
 */
export interface PromoReward {
  gems?: number;
  skins?: string[];
  trails?: string[];
  emotes?: string[];
  regens?: number;
}

export interface PromoRow {
  code: string;
  reward: string;
  note: string;
  max_uses: number;
  uses: number;
  expires_at: number;
  created_at: number;
  disabled: number;
}

export interface PromoView {
  code: string;
  reward: PromoReward;
  note: string;
  maxUses: number;
  uses: number;
  expiresAt: number;
  createdAt: number;
  disabled: boolean;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS promos (
  code TEXT PRIMARY KEY,
  reward TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  max_uses INTEGER NOT NULL DEFAULT 0,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS promo_uses (
  code TEXT NOT NULL REFERENCES promos(code) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (code, player_id)
);
`;

const ITEM_RE = /^[a-z0-9_-]{1,32}$/;
export const MAX_PROMO_GEMS = 50_000;
const MAX_ITEMS = 10;

/** Codes are typed loosely: case, spaces and dashes don't matter. */
export function normalizeCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[\s-]+/g, '') : '';
}

const CODE_RE = /^[A-Z0-9]{4,20}$/;

/** A reward as we accept it from the admin page (unknown keys dropped). */
export function cleanReward(raw: unknown): PromoReward {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: PromoReward = {};
  const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? Math.min(max, v) : 0);
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ITEM_RE.test(x)))].slice(0, MAX_ITEMS) : []);
  const gems = int(r.gems, MAX_PROMO_GEMS);
  const regens = int(r.regens, 20);
  if (gems) out.gems = gems;
  if (regens) out.regens = regens;
  for (const k of ['skins', 'trails', 'emotes'] as const) {
    const list = ids(r[k]);
    if (list.length) out[k] = list;
  }
  return out;
}

export class PromoService {
  private readonly db: Db;
  private readonly players: PlayerService;
  /** Wrong guesses per player (stops someone trying codes until one works). */
  private readonly tries = new RateLimiter(10, 60 * 60 * 1000);

  constructor(db: Db, players: PlayerService) {
    this.db = db;
    this.players = players;
    db.sql.exec(SCHEMA);
  }

  private view(r: PromoRow): PromoView {
    return {
      code: r.code,
      reward: cleanReward(JSON.parse(r.reward)),
      note: r.note,
      maxUses: r.max_uses,
      uses: r.uses,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      disabled: r.disabled === 1,
    };
  }

  private row(code: string): PromoRow | undefined {
    return this.db.sql.prepare('SELECT * FROM promos WHERE code = ?').get(code) as PromoRow | undefined;
  }

  /** Player: use a code. Returns what to give (the game adds it to the save). */
  redeem(body: Record<string, unknown>, now = Date.now()): { code: string; reward: PromoReward; note: string } {
    const me = this.players.me(body, now);
    const code = normalizeCode(body.code);
    const bad = (msg: string) => {
      this.tries.hit(me.id, now);
      return new ApiError(404, 'bad_code', msg);
    };
    if (!this.tries.peek(me.id, now)) throw new ApiError(429, 'slow_down', 'Too many tries. Wait a while and try again.');
    if (!CODE_RE.test(code)) throw bad('That code doesn’t look right. Check it and try again.');
    const p = this.row(code);
    if (!p || p.disabled) throw bad('That code doesn’t exist or has been switched off.');
    if (p.expires_at && p.expires_at < now) throw new ApiError(410, 'expired', 'That code has ended.');
    if (this.db.sql.prepare('SELECT 1 AS ok FROM promo_uses WHERE code = ? AND player_id = ?').get(code, me.id)) {
      throw new ApiError(409, 'used', 'You already used this code.');
    }
    if (p.max_uses && p.uses >= p.max_uses) throw new ApiError(410, 'used_up', 'That code has been used up.');
    this.db.sql.prepare('INSERT INTO promo_uses (code, player_id, at) VALUES (?, ?, ?)').run(code, me.id, now);
    this.db.sql.prepare('UPDATE promos SET uses = uses + 1 WHERE code = ?').run(code);
    return { code, reward: cleanReward(JSON.parse(p.reward)), note: p.note };
  }

  // ------------------------------------------------------------ admin
  list(): PromoView[] {
    return (this.db.sql.prepare('SELECT * FROM promos ORDER BY created_at DESC LIMIT 500').all() as unknown as PromoRow[]).map((r) => this.view(r));
  }

  create(body: Record<string, unknown>, now = Date.now()): PromoView {
    const code = normalizeCode(body.code);
    if (!CODE_RE.test(code)) throw new ApiError(400, 'bad_code', 'Codes are 4-20 letters and numbers.');
    if (this.row(code)) throw new ApiError(409, 'exists', 'That code already exists.');
    const reward = cleanReward(body.reward);
    if (!Object.keys(reward).length) throw new ApiError(400, 'no_reward', 'Add a reward: gems, Heart Regens or items.');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 80) : '';
    const maxUses = typeof body.maxUses === 'number' && Number.isInteger(body.maxUses) && body.maxUses > 0 ? Math.min(1_000_000, body.maxUses) : 0;
    const expiresAt = typeof body.expiresAt === 'number' && body.expiresAt > now ? Math.floor(body.expiresAt) : 0;
    this.db.sql
      .prepare('INSERT INTO promos (code, reward, note, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(code, JSON.stringify(reward), note, maxUses, expiresAt, now);
    return this.view(this.row(code)!);
  }

  setDisabled(code: string, disabled: boolean): boolean {
    return Number(this.db.sql.prepare('UPDATE promos SET disabled = ? WHERE code = ?').run(disabled ? 1 : 0, normalizeCode(code)).changes) > 0;
  }

  remove(code: string): boolean {
    return Number(this.db.sql.prepare('DELETE FROM promos WHERE code = ?').run(normalizeCode(code)).changes) > 0;
  }
}
