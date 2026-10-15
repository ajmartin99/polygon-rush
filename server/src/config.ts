import { randomBytes } from 'node:crypto';
import path from 'node:path';

/** Everything is configured with environment variables (see server/README.md). */
export interface Config {
  production: boolean;
  port: number;
  /** SQLite file (':memory:' in tests). */
  dbFile: string;
  /** Signs account tokens and hashes emails/IPs. Keep it secret and stable. */
  secret: string;
  /** Bearer token for the moderation API (disabled when empty). */
  adminToken: string;
  smtpUrl: string;
  mailFrom: string;
  /** Public base URL of this server (used in emails and the deletion page). */
  publicUrl: string;
  /** Browser origins allowed to call the API (the Android app is https://localhost). */
  allowedOrigins: string[];
  trustProxy: boolean;
  peerPath: string;
  peerKey: string;
  messageRetentionDays: number;
  reportRetentionDays: number;
  inactiveAccountDays: number;
  /** Where support/safety emails can be sent (shown on the deletion page). */
  supportEmail: string;
  /** Email codes one IP may request per hour (verification attempts get 4x). */
  ipLimitPerHour: number;
}

const DEFAULT_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173'];

function int(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  let secret = env.TOKEN_SECRET ?? '';
  if (secret.length < 32) {
    if (production) throw new Error('TOKEN_SECRET must be set to a random string of at least 32 characters.');
    secret = env.TOKEN_SECRET || `dev-only-${randomBytes(24).toString('hex')}`;
  }
  const dataDir = env.DATA_DIR || path.resolve('data');
  return {
    production,
    port: int(env.PORT, 8080),
    dbFile: env.DB_FILE || path.join(dataDir, 'polygon-rush.sqlite'),
    secret,
    adminToken: env.ADMIN_TOKEN && env.ADMIN_TOKEN.length >= 24 ? env.ADMIN_TOKEN : '',
    smtpUrl: env.SMTP_URL || '',
    mailFrom: env.MAIL_FROM || 'Polygon Rush <no-reply@localhost>',
    publicUrl: (env.PUBLIC_URL || `http://localhost:${int(env.PORT, 8080)}`).replace(/\/+$/, ''),
    allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ORIGINS,
    trustProxy: env.TRUST_PROXY === 'true',
    peerPath: env.PEER_PATH || '/peerjs',
    peerKey: env.PEER_KEY || 'peerjs',
    messageRetentionDays: int(env.MESSAGE_RETENTION_DAYS, 30),
    reportRetentionDays: int(env.REPORT_RETENTION_DAYS, 365),
    inactiveAccountDays: int(env.INACTIVE_ACCOUNT_DAYS, 730),
    supportEmail: env.SUPPORT_EMAIL || '',
    ipLimitPerHour: int(env.IP_LIMIT_PER_HOUR, 8),
  };
}
