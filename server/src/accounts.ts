import type { Config } from './config.ts';
import type { Account, Db } from './db.ts';
import { deleteMail, parentConsentMail, verifyMail, type Mailer } from './mailer.ts';
import { RateLimiter } from './ratelimit.ts';
import { signToken, verifyToken, type Consent } from './tokens.ts';
import { conservativeAge, DAY, emailHint, hmac, isBirthYear, normalizeEmail, randomId, safeEqual, sixDigitCode } from './util.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const CODE_TTL = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
export const PERMANENT = 8_000_000_000_000; // year ~2223

/** What the app may know about its own account. */
export interface PublicAccount {
  id: string;
  consent: Consent;
  emailHint: string;
  mutedUntil: number;
}

export function publicAccount(a: Account): PublicAccount {
  return { id: a.id, consent: a.consent, emailHint: emailHint(a.email), mutedUntil: a.muted_until };
}

/** Which kind of permission a birth year needs for Free Chat. */
export function consentFor(birthYear: number, now = new Date()): Consent | null {
  const age = conservativeAge(birthYear, now);
  if (age < 13) return null;
  return age < 16 ? 'parent' : 'self';
}

/**
 * Email-verified chat accounts. 16+ verify their own email; 13-15 need a
 * parent or guardian to receive the code (their consent); under-13s can't
 * have one. One account per email address.
 */
export class AccountService {
  private readonly db: Db;
  private readonly mailer: Mailer;
  private readonly cfg: Config;
  private readonly perIp: RateLimiter;
  /** A parent may approve a few teens in one sitting; more than that looks like inbox spam. */
  private readonly perEmail = new RateLimiter(5, 60 * 60 * 1000);
  private readonly verifyPerIp: RateLimiter;

  constructor(db: Db, mailer: Mailer, cfg: Config) {
    this.db = db;
    this.mailer = mailer;
    this.cfg = cfg;
    this.perIp = new RateLimiter(cfg.ipLimitPerHour, 60 * 60 * 1000);
    this.verifyPerIp = new RateLimiter(cfg.ipLimitPerHour * 4, 60 * 60 * 1000);
  }

  emailHash(email: string): string {
    return hmac(this.cfg.secret, `email:${email}`);
  }

  private codeHash(email: string, code: string): string {
    return hmac(this.cfg.secret, `code:${email}:${code}`);
  }

  /** Step 1: email a 6-digit code (to the player, or to their parent). */
  async start(body: { email?: unknown; birthYear?: unknown }, ipKey: string, now = Date.now()): Promise<{ consent: Consent; devCode?: string }> {
    const email = normalizeEmail(body.email);
    if (!email) throw new ApiError(400, 'bad_email', 'That email address doesn’t look right.');
    if (!isBirthYear(body.birthYear)) throw new ApiError(400, 'bad_age', 'Missing birth year.');
    const consent = consentFor(body.birthYear, new Date(now));
    if (!consent) throw new ApiError(403, 'too_young', 'Free Chat is for players 13 and older.');
    const hash = this.emailHash(email);
    if (this.db.emailBannedUntil(hash) > now) throw new ApiError(403, 'banned', 'This email can’t be used for Free Chat.');
    if (!this.perIp.hit(ipKey, now) || !this.perEmail.hit(hash, now)) throw new ApiError(429, 'slow_down', 'Too many codes requested. Try again in an hour.');
    const code = sixDigitCode();
    this.db.putCode({ email_hash: hash, purpose: 'verify', email, code_hash: this.codeHash(email, code), consent, birth_year: body.birthYear, expires_at: now + CODE_TTL, attempts: 0 });
    const mail = consent === 'parent' ? parentConsentMail(email, code, this.cfg.publicUrl) : verifyMail(email, code);
    try {
      await this.mailer.send(mail);
    } catch {
      this.db.dropCode(hash, 'verify');
      throw new ApiError(503, 'email_unavailable', 'We couldn’t send the email right now. Please try again later.');
    }
    return this.mailer.real ? { consent } : { consent, devCode: code };
  }

  /** Step 2: check the code, create/refresh the account, hand out a token. */
  verify(body: { email?: unknown; code?: unknown }, ipKey: string, now = Date.now()): { token: string; account: PublicAccount } {
    const email = normalizeEmail(body.email);
    const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
    if (!email || code.length !== 6) throw new ApiError(400, 'bad_code', 'Enter the 6-digit code from the email.');
    if (!this.verifyPerIp.hit(ipKey, now)) throw new ApiError(429, 'slow_down', 'Too many tries. Wait a bit and try again.');
    const hash = this.emailHash(email);
    const pending = this.db.getCode(hash, 'verify');
    if (!pending || pending.expires_at < now) throw new ApiError(400, 'expired', 'That code expired. Ask for a new one.');
    if (pending.attempts >= MAX_ATTEMPTS) {
      this.db.dropCode(hash, 'verify');
      throw new ApiError(400, 'expired', 'Too many wrong codes. Ask for a new one.');
    }
    if (!safeEqual(pending.code_hash, this.codeHash(email, code))) {
      this.db.bumpAttempts(hash, 'verify');
      throw new ApiError(400, 'wrong_code', 'That code isn’t right. Check the email and try again.');
    }
    this.db.dropCode(hash, 'verify');
    const account = this.db.upsertAccount({ id: randomId(12), email, email_hash: hash, consent: pending.consent, birth_year: pending.birth_year }, now);
    if (account.banned_until > now) throw new ApiError(403, 'banned', 'This account can’t use Free Chat.');
    this.db.audit('system', 'verify', account.id, pending.consent, now);
    return { token: signToken({ sub: account.id, c: account.consent }, this.cfg.secret, now), account: publicAccount(account) };
  }

  /** Resolve a bearer token to a live, unbanned account. */
  auth(token: unknown, now = Date.now()): Account {
    const claims = verifyToken(token, this.cfg.secret, now);
    if (!claims) throw new ApiError(401, 'signed_out', 'Please verify your email again.');
    const account = this.db.accountById(claims.sub);
    if (!account) throw new ApiError(401, 'signed_out', 'Please verify your email again.');
    if (account.banned_until > now) throw new ApiError(403, 'banned', 'This account can’t use Free Chat.');
    // Age band can only move up over time; re-check the consent rule anyway.
    if (!consentFor(account.birth_year, new Date(now))) throw new ApiError(403, 'too_young', 'Free Chat is for players 13 and older.');
    this.db.touchAccount(account.id, now);
    return account;
  }

  /** Delete your own account (in the app). Returns its id so live chat can be closed. */
  remove(token: unknown, now = Date.now()): string | null {
    const claims = verifyToken(token, this.cfg.secret, now);
    if (!claims) throw new ApiError(401, 'signed_out', 'Please verify your email again.');
    const account = this.db.accountById(claims.sub);
    if (!account) return null;
    this.deleteNow(account, 'self', now);
    return account.id;
  }

  /**
   * Web deletion (no app needed): email a code to the address. The answer and
   * its timing are the same whether or not an account exists (no probing).
   */
  deleteStart(body: { email?: unknown }, ipKey: string, now = Date.now()): { devCode?: string } {
    const email = normalizeEmail(body.email);
    if (!email) throw new ApiError(400, 'bad_email', 'That email address doesn’t look right.');
    const hash = this.emailHash(email);
    if (!this.perIp.hit(ipKey, now) || !this.perEmail.hit(`del:${hash}`, now)) throw new ApiError(429, 'slow_down', 'Too many requests. Try again in an hour.');
    if (!this.db.accountsByEmailHash(hash).length) return {};
    const code = sixDigitCode();
    this.db.putCode({ email_hash: hash, purpose: 'delete', email, code_hash: this.codeHash(email, code), consent: 'self', birth_year: 0, expires_at: now + CODE_TTL, attempts: 0 });
    this.mailer.send(deleteMail(email, code)).catch((e: Error) => console.error(`[mail] deletion code failed: ${e.message}`));
    // Development servers without email hand the code back (never in production).
    return this.mailer.real ? {} : { devCode: code };
  }

  /** Deletes every chat account verified with this email (a parent's covers all their teens). Returns their ids. */
  deleteConfirm(body: { email?: unknown; code?: unknown }, ipKey: string, now = Date.now()): string[] {
    const email = normalizeEmail(body.email);
    const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
    if (!email || code.length !== 6) throw new ApiError(400, 'bad_code', 'Enter the 6-digit code from the email.');
    if (!this.verifyPerIp.hit(ipKey, now)) throw new ApiError(429, 'slow_down', 'Too many tries. Wait a bit and try again.');
    const hash = this.emailHash(email);
    const pending = this.db.getCode(hash, 'delete');
    if (!pending || pending.expires_at < now || pending.attempts >= MAX_ATTEMPTS) throw new ApiError(400, 'expired', 'That code expired. Ask for a new one.');
    if (!safeEqual(pending.code_hash, this.codeHash(email, code))) {
      this.db.bumpAttempts(hash, 'delete');
      throw new ApiError(400, 'wrong_code', 'That code isn’t right.');
    }
    this.db.dropCode(hash, 'delete');
    const accounts = this.db.accountsByEmailHash(hash);
    for (const a of accounts) this.deleteNow(a, 'web', now);
    return accounts.map((a) => a.id);
  }

  private deleteNow(account: Account, via: string, now: number): void {
    // A banned email stays blocked (the ban list holds only a hash, not the address).
    if (account.banned_until > now) this.db.banEmail(account.email_hash, account.banned_until, account.ban_reason);
    this.db.deleteAccount(account.id, now);
    this.db.audit(via, 'delete_account', account.id, null, now);
  }

  // ------------------------------------------------------------ moderation
  /** Mute an account (or the tombstone of a deleted one, which carries over if they come back). */
  mute(id: string, hours: number, actor: string, now = Date.now()): number {
    const until = now + hours * 60 * 60 * 1000;
    if (this.db.accountById(id)) this.db.setMute(id, until);
    else if (this.db.tombstone(id)) this.db.setTombstoneMute(id, until);
    else throw new ApiError(404, 'not_found', 'No such account.');
    this.db.audit(actor, 'mute', id, `${hours}h`, now);
    return until;
  }

  /** Ban an account and block its email address, even if the account was deleted. */
  ban(id: string, days: number, reason: string, actor: string, now = Date.now()): number {
    const a = this.db.accountById(id);
    const hash = a?.email_hash ?? this.db.tombstone(id)?.email_hash;
    if (!hash) throw new ApiError(404, 'not_found', 'No such account.');
    const until = days > 0 ? now + days * DAY : PERMANENT;
    if (a) this.db.setBan(id, until, reason);
    this.db.banEmail(hash, until, reason);
    this.db.audit(actor, 'ban', id, `${days || 'permanent'}d: ${reason}`, now);
    return until;
  }

  unban(id: string, actor: string, now = Date.now()): void {
    const a = this.db.accountById(id);
    const hash = a?.email_hash ?? this.db.tombstone(id)?.email_hash;
    if (!hash) throw new ApiError(404, 'not_found', 'No such account.');
    if (a) {
      this.db.setBan(id, 0, null);
      this.db.setMute(id, 0);
    } else this.db.setTombstoneMute(id, 0);
    this.db.unbanEmail(hash);
    this.db.audit(actor, 'unban', id, null, now);
  }
}
