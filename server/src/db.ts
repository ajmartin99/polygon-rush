import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Consent } from './tokens.ts';
import { DAY } from './util.ts';

export interface Account {
  id: string;
  email: string;
  email_hash: string;
  consent: Consent;
  birth_year: number;
  created_at: number;
  verified_at: number;
  last_seen: number;
  muted_until: number;
  banned_until: number;
  ban_reason: string | null;
}

export interface PendingCode {
  email_hash: string;
  email: string;
  code_hash: string;
  purpose: 'verify' | 'delete';
  consent: Consent;
  birth_year: number;
  expires_at: number;
  attempts: number;
}

export interface Message {
  id: string;
  channel: string;
  account_id: string;
  name: string;
  text: string;
  created_at: number;
}

export interface Report {
  id: string;
  kind: 'message' | 'room';
  reporter: string | null;
  target_account: string | null;
  message_id: string | null;
  channel: string | null;
  room_code: string | null;
  reason: string;
  context: string;
  created_at: number;
  status: 'open' | 'resolved';
  resolved_at: number | null;
  note: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL UNIQUE,
  consent TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  verified_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  muted_until INTEGER NOT NULL DEFAULT 0,
  banned_until INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT
);
CREATE TABLE IF NOT EXISTS codes (
  email_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  consent TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email_hash, purpose)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_channel ON messages (channel, created_at);
CREATE INDEX IF NOT EXISTS messages_account ON messages (account_id, created_at);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  reporter TEXT,
  reporter_ip TEXT,
  target_account TEXT,
  message_id TEXT,
  channel TEXT,
  room_code TEXT,
  reason TEXT NOT NULL,
  context TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_at INTEGER,
  note TEXT
);
CREATE INDEX IF NOT EXISTS reports_status ON reports (status, created_at);
CREATE INDEX IF NOT EXISTS reports_target ON reports (target_account, created_at);
CREATE TABLE IF NOT EXISTS banned_emails (
  email_hash TEXT PRIMARY KEY,
  until INTEGER NOT NULL,
  reason TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
`;

type Row = Record<string, unknown>;

/**
 * SQLite storage (node:sqlite, no native dependencies). Personal data kept:
 * the verified email (for safety, legal requests and account deletion),
 * birth year and consent type. Free Chat messages are kept for a limited
 * time so reports can be investigated.
 */
export class Db {
  readonly sql: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.sql = new DatabaseSync(file);
    this.sql.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
    this.sql.exec(SCHEMA);
  }

  close(): void {
    this.sql.close();
  }

  private one<T>(query: string, ...args: (string | number | null)[]): T | undefined {
    return this.sql.prepare(query).get(...args) as T | undefined;
  }

  private all<T>(query: string, ...args: (string | number | null)[]): T[] {
    return this.sql.prepare(query).all(...args) as T[];
  }

  private run(query: string, ...args: (string | number | null)[]): number {
    return Number(this.sql.prepare(query).run(...args).changes);
  }

  // ------------------------------------------------------------ accounts
  accountById(id: string): Account | undefined {
    return this.one<Account>('SELECT * FROM accounts WHERE id = ?', id);
  }

  accountByEmailHash(hash: string): Account | undefined {
    return this.one<Account>('SELECT * FROM accounts WHERE email_hash = ?', hash);
  }

  upsertAccount(a: Pick<Account, 'id' | 'email' | 'email_hash' | 'consent' | 'birth_year'>, now: number): Account {
    const existing = this.accountByEmailHash(a.email_hash);
    if (existing) {
      this.run('UPDATE accounts SET consent = ?, birth_year = ?, verified_at = ?, last_seen = ?, email = ? WHERE id = ?', a.consent, a.birth_year, now, now, a.email, existing.id);
      return this.accountById(existing.id)!;
    }
    this.run(
      'INSERT INTO accounts (id, email, email_hash, consent, birth_year, created_at, verified_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      a.id,
      a.email,
      a.email_hash,
      a.consent,
      a.birth_year,
      now,
      now,
      now,
    );
    return this.accountById(a.id)!;
  }

  touchAccount(id: string, now: number): void {
    this.run('UPDATE accounts SET last_seen = ? WHERE id = ?', now, id);
  }

  setMute(id: string, until: number): void {
    this.run('UPDATE accounts SET muted_until = ? WHERE id = ?', until, id);
  }

  setBan(id: string, until: number, reason: string | null): void {
    this.run('UPDATE accounts SET banned_until = ?, ban_reason = ? WHERE id = ?', until, reason, id);
  }

  banEmail(hash: string, until: number, reason: string | null): void {
    this.run('INSERT INTO banned_emails (email_hash, until, reason) VALUES (?, ?, ?) ON CONFLICT(email_hash) DO UPDATE SET until = excluded.until, reason = excluded.reason', hash, until, reason);
  }

  unbanEmail(hash: string): void {
    this.run('DELETE FROM banned_emails WHERE email_hash = ?', hash);
  }

  emailBannedUntil(hash: string): number {
    return this.one<{ until: number }>('SELECT until FROM banned_emails WHERE email_hash = ?', hash)?.until ?? 0;
  }

  /**
   * Delete an account and its messages. Messages that are evidence in an open
   * report are kept until that report is resolved (then purged normally).
   */
  deleteAccount(id: string): void {
    this.run(
      `DELETE FROM messages WHERE account_id = ? AND id NOT IN (SELECT message_id FROM reports WHERE status = 'open' AND message_id IS NOT NULL)`,
      id,
    );
    this.run('UPDATE reports SET reporter = NULL WHERE reporter = ?', id);
    this.run('DELETE FROM accounts WHERE id = ?', id);
  }

  // ------------------------------------------------------------ codes
  putCode(c: PendingCode): void {
    this.run(
      `INSERT INTO codes (email_hash, purpose, email, code_hash, consent, birth_year, expires_at, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(email_hash, purpose) DO UPDATE SET email = excluded.email, code_hash = excluded.code_hash, consent = excluded.consent,
       birth_year = excluded.birth_year, expires_at = excluded.expires_at, attempts = 0`,
      c.email_hash,
      c.purpose,
      c.email,
      c.code_hash,
      c.consent,
      c.birth_year,
      c.expires_at,
    );
  }

  getCode(hash: string, purpose: PendingCode['purpose']): PendingCode | undefined {
    return this.one<PendingCode>('SELECT * FROM codes WHERE email_hash = ? AND purpose = ?', hash, purpose);
  }

  bumpAttempts(hash: string, purpose: PendingCode['purpose']): void {
    this.run('UPDATE codes SET attempts = attempts + 1 WHERE email_hash = ? AND purpose = ?', hash, purpose);
  }

  dropCode(hash: string, purpose: PendingCode['purpose']): void {
    this.run('DELETE FROM codes WHERE email_hash = ? AND purpose = ?', hash, purpose);
  }

  // ------------------------------------------------------------ messages
  addMessage(m: Message): void {
    this.run('INSERT INTO messages (id, channel, account_id, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', m.id, m.channel, m.account_id, m.name, m.text, m.created_at);
  }

  message(id: string): Message | undefined {
    return this.one<Message>('SELECT * FROM messages WHERE id = ?', id);
  }

  /** Messages around a moment in a channel (report context). */
  channelContext(channel: string, at: number, before = 10, after = 5): Message[] {
    const older = this.all<Message>('SELECT * FROM messages WHERE channel = ? AND created_at <= ? ORDER BY created_at DESC LIMIT ?', channel, at, before);
    const newer = this.all<Message>('SELECT * FROM messages WHERE channel = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?', channel, at, after);
    return [...older.reverse(), ...newer];
  }

  messagesByAccount(id: string, limit = 500): Message[] {
    return this.all<Message>('SELECT * FROM messages WHERE account_id = ? ORDER BY created_at DESC LIMIT ?', id, limit);
  }

  // ------------------------------------------------------------ reports
  addReport(r: Omit<Report, 'status' | 'resolved_at' | 'note'> & { reporter_ip?: string | null }): void {
    this.run(
      'INSERT INTO reports (id, kind, reporter, reporter_ip, target_account, message_id, channel, room_code, reason, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      r.id,
      r.kind,
      r.reporter,
      r.reporter_ip ?? null,
      r.target_account,
      r.message_id,
      r.channel,
      r.room_code,
      r.reason,
      r.context,
      r.created_at,
    );
  }

  report(id: string): Report | undefined {
    return this.one<Report>('SELECT * FROM reports WHERE id = ?', id);
  }

  reports(status: 'open' | 'resolved' | 'all', limit: number): Report[] {
    if (status === 'all') return this.all<Report>('SELECT * FROM reports ORDER BY created_at DESC LIMIT ?', limit);
    return this.all<Report>('SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT ?', status, limit);
  }

  reportsAgainst(account: string, limit = 200): Report[] {
    return this.all<Report>('SELECT * FROM reports WHERE target_account = ? ORDER BY created_at DESC LIMIT ?', account, limit);
  }

  /** Distinct reporters (accounts or IPs) against an account since `since`. */
  distinctReporters(account: string, since: number): number {
    return (
      this.one<{ n: number }>(
        'SELECT COUNT(DISTINCT COALESCE(reporter, reporter_ip)) AS n FROM reports WHERE target_account = ? AND created_at >= ?',
        account,
        since,
      )?.n ?? 0
    );
  }

  alreadyReported(reporterKey: string, messageId: string): boolean {
    return Boolean(this.one<Row>('SELECT 1 FROM reports WHERE message_id = ? AND (reporter = ? OR reporter_ip = ?)', messageId, reporterKey, reporterKey));
  }

  resolveReport(id: string, note: string | null, now: number): boolean {
    return this.run(`UPDATE reports SET status = 'resolved', resolved_at = ?, note = ? WHERE id = ? AND status = 'open'`, now, note, id) > 0;
  }

  // ------------------------------------------------------------ audit & retention
  audit(actor: string, action: string, target: string | null, detail: string | null, now: number): void {
    this.run('INSERT INTO audit (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)', now, actor, action, target, detail);
  }

  auditLog(limit: number): Row[] {
    return this.all<Row>('SELECT * FROM audit ORDER BY id DESC LIMIT ?', limit);
  }

  /** Data minimisation: drop what we no longer need. */
  purge(now: number, opts: { messageDays: number; reportDays: number; inactiveDays: number }): Record<string, number> {
    const out: Record<string, number> = {};
    out.codes = this.run('DELETE FROM codes WHERE expires_at < ?', now);
    out.messages = this.run(
      `DELETE FROM messages WHERE created_at < ? AND id NOT IN (SELECT message_id FROM reports WHERE status = 'open' AND message_id IS NOT NULL)`,
      now - opts.messageDays * DAY,
    );
    out.reports = this.run(`DELETE FROM reports WHERE status = 'resolved' AND resolved_at < ?`, now - opts.reportDays * DAY);
    out.bans = this.run('DELETE FROM banned_emails WHERE until < ?', now);
    const stale = this.all<{ id: string }>('SELECT id FROM accounts WHERE last_seen < ? AND banned_until < ?', now - opts.inactiveDays * DAY, now);
    for (const a of stale) this.deleteAccount(a.id);
    out.accounts = stale.length;
    out.audit = this.run('DELETE FROM audit WHERE at < ?', now - 2 * 365 * DAY);
    return out;
  }
}
