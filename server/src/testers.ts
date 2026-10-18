import { ApiError } from './accounts.ts';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import type { Mailer } from './mailer.ts';
import { RateLimiter } from './ratelimit.ts';
import { normalizeEmail, randomId } from './util.ts';

/**
 * Beta tester sign-ups from the website (/beta). Grown-ups only (18+, or a
 * parent signing up their child). We keep the email Google Play needs to add
 * a tester, an optional first name and phone model, how they'd like to test
 * (Google Play closed test or a sideloaded APK) and a short note. The studio
 * reads them in /beta/admin (admin token) and can get an email per sign-up.
 */
export const CHANNELS = ['play', 'apk', 'either'] as const;
export const TESTER_STATUSES = ['new', 'invited', 'apk_sent', 'declined'] as const;
export type TesterChannel = (typeof CHANNELS)[number];
export type TesterStatus = (typeof TESTER_STATUSES)[number];

export interface TesterRow {
  id: string;
  email: string;
  name: string;
  device: string;
  channel: TesterChannel;
  note: string;
  status: TesterStatus;
  created_at: number;
  updated_at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS testers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_lc TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

/** Plain one-line text: no control characters, trimmed, capped. */
function line(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '';
}

export class TesterService {
  private readonly db: Db;
  private readonly mailer: Mailer;
  private readonly cfg: Config;
  private readonly perIp = new RateLimiter(5, 60 * 60 * 1000);
  private readonly log: (msg: string) => void;

  constructor(db: Db, mailer: Mailer, cfg: Config, log: (msg: string) => void) {
    this.db = db;
    this.mailer = mailer;
    this.cfg = cfg;
    this.log = log;
    db.sql.exec(SCHEMA);
  }

  /** Sign up (or update an earlier sign-up with the same email). */
  signup(body: Record<string, unknown>, ipKey: string, now = Date.now()): { ok: true } {
    if (body.website) return { ok: true }; // honeypot: bots fill every field
    if (body.adult !== true) throw new ApiError(400, 'not_adult', 'Testers must be 18 or older, or a parent or guardian signing up for their child.');
    const email = normalizeEmail(body.email);
    if (!email) throw new ApiError(400, 'bad_email', 'Please enter a valid email address.');
    const channel = (CHANNELS as readonly string[]).includes(body.channel as string) ? (body.channel as TesterChannel) : 'either';
    if (!this.perIp.hit(ipKey, now)) throw new ApiError(429, 'slow_down', 'Thanks! We already have your sign-up.');
    const name = line(body.name, 40);
    const device = line(body.device, 60);
    const note = line(body.note, 300);
    const lc = email.toLowerCase();
    const prev = this.db.sql.prepare('SELECT id FROM testers WHERE email_lc = ?').get(lc) as { id: string } | undefined;
    if (prev) {
      this.db.sql.prepare('UPDATE testers SET name = ?, device = ?, channel = ?, note = ?, updated_at = ? WHERE id = ?').run(name, device, channel, note, now, prev.id);
      return { ok: true };
    }
    this.db.sql
      .prepare('INSERT INTO testers (id, email, email_lc, name, device, channel, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomId(8), email, lc, name, device, channel, note, now, now);
    this.notify({ email, name, device, channel, note });
    return { ok: true };
  }

  /** Email the studio about a new sign-up (only when SMTP and TESTER_NOTIFY are set). */
  private notify(t: { email: string; name: string; device: string; channel: TesterChannel; note: string }): void {
    if (!this.cfg.testerNotify || !this.mailer.real) return;
    const how = t.channel === 'play' ? 'Google Play closed test' : t.channel === 'apk' ? 'Sideloaded APK' : 'Either';
    const lines = [`Email: ${t.email}`, `Name: ${t.name || '-'}`, `Phone: ${t.device || '-'}`, `Wants: ${how}`, `Note: ${t.note || '-'}`];
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    this.mailer
      .send({
        to: this.cfg.testerNotify,
        subject: `New Polygon Rush beta tester: ${t.name || t.email}`,
        text: `${lines.join('\n')}\n\nSee everyone: ${this.cfg.publicUrl}/beta/admin`,
        html: `<p>${lines.map(esc).join('<br>')}</p><p><a href="${esc(this.cfg.publicUrl)}/beta/admin">See all sign-ups</a></p>`,
      })
      .catch((e: Error) => this.log(`[testers] notify failed: ${e.message}`));
  }

  list(status?: string): TesterRow[] {
    const ok = (TESTER_STATUSES as readonly string[]).includes(status ?? '');
    return this.db.sql
      .prepare(`SELECT id, email, name, device, channel, note, status, created_at, updated_at FROM testers ${ok ? 'WHERE status = ?' : ''} ORDER BY created_at DESC LIMIT 2000`)
      .all(...(ok ? [status as string] : [])) as unknown as TesterRow[];
  }

  setStatus(id: string, status: unknown, now = Date.now()): boolean {
    if (!(TESTER_STATUSES as readonly string[]).includes(status as string)) throw new ApiError(400, 'bad_status', `Status must be one of ${TESTER_STATUSES.join(', ')}.`);
    return Number(this.db.sql.prepare('UPDATE testers SET status = ?, updated_at = ? WHERE id = ?').run(status as string, now, id).changes) > 0;
  }

  remove(id: string): boolean {
    return Number(this.db.sql.prepare('DELETE FROM testers WHERE id = ?').run(id).changes) > 0;
  }

  /** Spreadsheet export. */
  csv(): string {
    const q = (v: string | number) => {
      const s = String(v);
      // Quote everything; neutralise formulas when opened in a spreadsheet.
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const rows = this.list().map((t) => [t.email, t.name, t.device, t.channel, t.status, t.note, new Date(t.created_at).toISOString()].map(q).join(','));
    return ['email,name,phone,wants,status,note,signed_up', ...rows].join('\n');
  }
}
