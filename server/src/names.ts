import { isGeneratedName } from '../../src/meta/names.ts';
import { checkDisplayText, NAME_MESSAGES } from '../../src/shared/chat-filter.ts';
import { ApiError } from './accounts.ts';
import type { Db } from './db.ts';
import { RateLimiter } from './ratelimit.ts';
import { hmac } from './util.ts';

/**
 * Typed racer names (players 13+). The app checks a name with the shared
 * filter; the server is the real gate: same filter, one owner per name
 * (case-insensitive) and moderators can ban a name, which resets it on the
 * owner's device the next time the app checks.
 */
export class NameRegistry {
  private readonly db: Db;
  private readonly secret: string;
  private readonly claims = new RateLimiter(20, 60 * 60 * 1000);

  constructor(db: Db, secret: string) {
    this.db = db;
    this.secret = secret;
  }

  private keyHash(key: unknown): string {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new ApiError(400, 'bad_key', 'Please update the app.');
    return hmac(this.secret, `name-key:${key}`);
  }

  private banned(nameLc: string, now: number): boolean {
    const row = this.db.nameRow(nameLc);
    return Boolean(row && (row.banned_until === -1 || row.banned_until > now));
  }

  /** Generated names, or typed names that pass the filter and aren't banned. */
  allowed(name: unknown, now = Date.now()): name is string {
    if (typeof name !== 'string') return false;
    if (isGeneratedName(name)) return true;
    const r = checkDisplayText(name, 'name');
    return r.ok && r.text === name && !this.banned(name.toLowerCase(), now);
  }

  claim(body: Record<string, unknown>, ipKey: string, now = Date.now()): { name: string } {
    const keyHash = this.keyHash(body.key);
    if (!this.claims.hit(ipKey, now)) throw new ApiError(429, 'slow_down', 'Too many name changes. Try again later.');
    const r = checkDisplayText(typeof body.name === 'string' ? body.name : '', 'name');
    if (!r.ok) throw new ApiError(400, 'bad_name', NAME_MESSAGES[r.reason ?? 'empty']);
    const lc = r.text.toLowerCase();
    const row = this.db.nameRow(lc);
    if (row && (row.banned_until === -1 || row.banned_until > now)) throw new ApiError(403, 'name_banned', 'That name isn’t allowed.');
    if (row && row.key_hash && row.key_hash !== keyHash) throw new ApiError(409, 'name_taken', 'Someone already has that name.');
    this.db.claimName(r.text, keyHash, now);
    return { name: r.text };
  }

  /** The app checks its typed name on start: still ours and not banned? */
  status(body: Record<string, unknown>, now = Date.now()): { ok: boolean; reason?: string } {
    const keyHash = this.keyHash(body.key);
    const name = typeof body.name === 'string' ? body.name : '';
    const row = this.db.nameRow(name.toLowerCase());
    if (!row) return { ok: false, reason: 'unclaimed' };
    if (row.banned_until === -1 || row.banned_until > now) return { ok: false, reason: 'banned' };
    if (row.key_hash !== keyHash) return { ok: false, reason: 'taken' };
    this.db.touchName(row.name_lc, now);
    return { ok: true };
  }

  ban(name: string, days: number, reason: string | null, now = Date.now()): number {
    const until = days > 0 ? now + days * 86_400_000 : -1;
    this.db.banName(name, until, reason, now);
    return until;
  }

  unban(name: string): void {
    this.db.unbanName(name);
  }
}
