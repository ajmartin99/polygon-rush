import { hmac, safeEqual } from './util.ts';

/** Who verified: the player themselves (16+) or a parent for a 13-15 year old. */
export type Consent = 'self' | 'parent';

export interface TokenClaims {
  /** Account id. */
  sub: string;
  c: Consent;
  /** Issued / expires (unix seconds). */
  iat: number;
  exp: number;
}

export const TOKEN_DAYS = 180;

/** Compact signed token: base64url(json).base64url(hmac). Not encrypted — holds no personal data. */
export function signToken(claims: Omit<TokenClaims, 'iat' | 'exp'>, secret: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const body: TokenClaims = { ...claims, iat, exp: iat + TOKEN_DAYS * 86400 };
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = Buffer.from(hmac(secret, `token:${payload}`), 'hex').toString('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: unknown, secret: string, now = Date.now()): TokenClaims | null {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const want = Buffer.from(hmac(secret, `token:${payload}`), 'hex').toString('base64url');
  if (!safeEqual(sig, want)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenClaims;
    if (typeof c.sub !== 'string' || (c.c !== 'self' && c.c !== 'parent') || typeof c.exp !== 'number') return null;
    if (c.exp * 1000 < now) return null;
    return c;
  } catch {
    return null;
  }
}
