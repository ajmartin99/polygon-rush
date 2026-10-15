import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const DAY = 24 * 60 * 60 * 1000;

export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function randomId(bytes = 12): string {
  return randomBytes(bytes).toString('base64url');
}

export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Lower-cased, trimmed, sanity-checked email (null if it doesn't look like one). */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  // Deliberately simple: one @, no spaces, a dot in the domain, plain characters only.
  if (!/^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/.test(email)) return null;
  return email;
}

/** "jo***@gm***.com" — enough for the owner to recognise, not enough to read. */
export function emailHint(email: string): string {
  const [user, domain] = email.split('@');
  const dot = domain.lastIndexOf('.');
  const host = domain.slice(0, dot);
  const tld = domain.slice(dot);
  return `${user.slice(0, 2)}***@${host.slice(0, 2)}***${tld}`;
}

/** Age assuming the birthday hasn't happened yet this year (errs on the young side). */
export function conservativeAge(birthYear: number, now = new Date()): number {
  return now.getUTCFullYear() - birthYear - 1;
}

export function isBirthYear(v: unknown, now = new Date()): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1900 && v <= now.getUTCFullYear();
}
