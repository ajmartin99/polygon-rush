import { filterChat } from '../../src/shared/chat-filter.ts';
import { ApiError, publicAccount, type AccountService } from './accounts.ts';
import type { Account, Db } from './db.ts';
import { RateLimiter } from './ratelimit.ts';
import { randomId } from './util.ts';
import type { NameRegistry } from './names.ts';

/** A room's chat channel id is a random key only room members know. */
export const CHANNEL_RE = /^[A-Za-z0-9_-]{16,64}$/;
const AUTO_MUTE_REPORTERS = 3;
const AUTO_MUTE_HOURS = 24;
const MAX_SOCKETS_PER_IP = 8;
const MAX_SOCKETS_PER_ACCOUNT = 4;

export interface ChatConn {
  send(msg: object): void;
  close(code: number, reason: string): void;
  /** Hashed IP (never the raw address). */
  readonly ipKey: string;
}

interface Member {
  conn: ChatConn;
  account: Account | null;
  channel: string | null;
  name: string;
  lastAt: number;
  recent: { text: string; at: number }[];
  authTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Free Chat relay. Only verified accounts connect, so only they ever receive
 * typed messages; everyone else in the room sees Quick Chat only. Every
 * message is filtered here (the app's copy of the filter is just a hint),
 * stored for the retention period, and can be reported.
 */
export class ChatHub {
  private readonly db: Db;
  private readonly accounts: AccountService;
  private channels = new Map<string, Set<Member>>();
  private byAccount = new Map<string, Set<Member>>();
  private readonly burst = new RateLimiter(8, 20_000);
  private readonly reportsPerAccount = new RateLimiter(20, 60 * 60 * 1000);
  private perIp = new Map<string, number>();

  private readonly names: NameRegistry;

  constructor(db: Db, accounts: AccountService, names: NameRegistry) {
    this.db = db;
    this.accounts = accounts;
    this.names = names;
  }

  connect(conn: ChatConn): { message(raw: string): void; close(): void } {
    const n = (this.perIp.get(conn.ipKey) ?? 0) + 1;
    this.perIp.set(conn.ipKey, n);
    let closed = false;
    const release = () => {
      if (closed) return;
      closed = true;
      const left = (this.perIp.get(conn.ipKey) ?? 1) - 1;
      if (left > 0) this.perIp.set(conn.ipKey, left);
      else this.perIp.delete(conn.ipKey);
    };
    const m: Member = { conn, account: null, channel: null, name: '', lastAt: 0, recent: [], authTimer: null };
    if (n > MAX_SOCKETS_PER_IP) {
      conn.close(4008, 'too many connections');
      return { message: () => {}, close: release };
    }
    m.authTimer = setTimeout(() => conn.close(4001, 'auth timeout'), 10_000);
    return {
      message: (raw) => this.onMessage(m, raw),
      close: () => {
        release();
        this.onClose(m);
      },
    };
  }

  /** Re-read the account so deletions, mutes and bans apply immediately. */
  private live(m: Member): Account {
    const fresh = m.account ? this.db.accountById(m.account.id) : undefined;
    if (!fresh) throw new ApiError(401, 'signed_out', 'Please verify your email again.');
    if (fresh.banned_until > Date.now()) throw new ApiError(403, 'banned', 'This account can’t use Free Chat.');
    m.account = fresh;
    return fresh;
  }

  /** Live presence of a channel. */
  count(channel: string): number {
    return this.channels.get(channel)?.size ?? 0;
  }

  /** Disconnect an account everywhere (after a ban). */
  kick(accountId: string, reason: string, code: 'banned' | 'signed_out' = 'banned'): void {
    for (const m of [...(this.byAccount.get(accountId) ?? [])]) {
      m.conn.send({ t: 'error', code, message: reason });
      m.conn.close(4003, code);
    }
  }

  /** Tell an account's open sessions about a mute. */
  notifyMute(accountId: string, until: number): void {
    for (const m of this.byAccount.get(accountId) ?? []) {
      if (m.account) m.account.muted_until = until;
      m.conn.send({ t: 'muted', until });
    }
  }

  private onMessage(m: Member, raw: string): void {
    if (raw.length > 2048) return m.conn.close(4002, 'too big');
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    try {
      switch (msg.t) {
        case 'auth':
          return this.auth(m, msg.token);
        case 'ping':
          return m.conn.send({ t: 'pong' });
        case 'join':
          return this.join(m, msg.channel, msg.name);
        case 'leave':
          return this.leave(m);
        case 'say':
          return this.say(m, msg.text);
        case 'report':
          return this.report(m, msg.id, msg.reason);
        default:
          return;
      }
    } catch (e) {
      if (e instanceof ApiError) {
        m.conn.send({ t: 'error', code: e.code, message: e.message });
        if (e.status === 401 || e.status === 403) m.conn.close(4003, e.code);
      } else throw e;
    }
  }

  private auth(m: Member, token: unknown): void {
    if (m.account) return;
    const account = this.accounts.auth(token);
    let set = this.byAccount.get(account.id);
    if (set && set.size >= MAX_SOCKETS_PER_ACCOUNT) throw new ApiError(429, 'too_many', 'Too many chat connections.');
    m.account = account;
    if (m.authTimer) clearTimeout(m.authTimer);
    m.authTimer = null;
    if (!set) this.byAccount.set(account.id, (set = new Set()));
    set.add(m);
    m.conn.send({ t: 'ready', account: publicAccount(account) });
  }

  private join(m: Member, channel: unknown, name: unknown): void {
    if (!m.account) throw new ApiError(401, 'signed_out', 'Sign in first.');
    const me = this.live(m);
    if (typeof channel !== 'string' || !CHANNEL_RE.test(channel)) throw new ApiError(400, 'bad_channel', 'Bad room.');
    if (!this.names.allowed(name)) throw new ApiError(400, 'bad_name', 'That racer name can’t use Free Chat.');
    // Nobody can borrow the name of someone already in the room.
    for (const other of this.channels.get(channel) ?? []) {
      if (other !== m && other.name === name && other.account?.id !== me.id) throw new ApiError(409, 'name_taken', 'Someone in this room already uses that name.');
    }
    this.leave(m);
    m.channel = channel;
    m.name = name;
    let set = this.channels.get(channel);
    if (!set) this.channels.set(channel, (set = new Set()));
    set.add(m);
    m.conn.send({ t: 'joined', channel, count: set.size });
    this.broadcast(channel, { t: 'presence', count: set.size });
  }

  private leave(m: Member): void {
    if (!m.channel) return;
    const set = this.channels.get(m.channel);
    const channel = m.channel;
    m.channel = null;
    if (!set) return;
    set.delete(m);
    if (set.size) this.broadcast(channel, { t: 'presence', count: set.size });
    else this.channels.delete(channel);
  }

  private say(m: Member, text: unknown): void {
    const now = Date.now();
    if (!m.account || !m.channel) throw new ApiError(400, 'not_joined', 'Join a room first.');
    const fresh = this.live(m);
    if (fresh.muted_until > now) return m.conn.send({ t: 'blocked', reason: 'muted', until: fresh.muted_until });
    if (now - m.lastAt < 1200 || !this.burst.hit(fresh.id, now)) return m.conn.send({ t: 'blocked', reason: 'spam' });
    const r = filterChat(typeof text === 'string' ? text : '');
    if (!r.ok) return m.conn.send({ t: 'blocked', reason: r.reason });
    m.recent = m.recent.filter((x) => now - x.at < 30_000);
    if (m.recent.some((x) => x.text.toLowerCase() === r.text.toLowerCase())) return m.conn.send({ t: 'blocked', reason: 'spam' });
    m.recent.push({ text: r.text, at: now });
    m.lastAt = now;
    const id = randomId(10);
    this.db.addMessage({ id, channel: m.channel, account_id: fresh.id, name: m.name, text: r.text, created_at: now });
    this.broadcast(m.channel, { t: 'msg', id, from: fresh.id, name: m.name, text: r.text, at: now });
  }

  private report(m: Member, id: unknown, reason: unknown): void {
    if (!m.account || !m.channel) throw new ApiError(400, 'not_joined', 'Join a room first.');
    this.live(m);
    const now = Date.now();
    const msg = typeof id === 'string' ? this.db.message(id) : undefined;
    // You can only report messages from your own room (and not your own).
    if (!msg || msg.channel !== m.channel || msg.account_id === m.account.id) throw new ApiError(404, 'not_found', 'Message not found.');
    if (!this.reportsPerAccount.hit(m.account.id, now)) throw new ApiError(429, 'slow_down', 'Too many reports.');
    if (!this.db.alreadyReported(m.account.id, msg.id)) {
      const reportId = randomId(10);
      // Keep only pointers to the conversation: the messages stay in one place and
      // follow the normal retention once the report is closed.
      const around = this.db.channelContext(msg.channel, msg.created_at).map((x) => x.id);
      this.db.addReport({
        id: reportId,
        kind: 'message',
        reporter: m.account.id,
        reporter_ip: m.conn.ipKey,
        target_account: msg.account_id,
        message_id: msg.id,
        channel: msg.channel,
        room_code: null,
        reason: typeof reason === 'string' ? reason.slice(0, 60) : 'unspecified',
        context: JSON.stringify({ messages: around.length }),
        created_at: now,
      });
      this.db.linkReportMessages(reportId, around);
      // Several different people reporting the same player: mute them until a moderator looks.
      if (this.db.distinctReporters(msg.account_id, now - 24 * 60 * 60 * 1000) >= AUTO_MUTE_REPORTERS) {
        const target = this.db.accountById(msg.account_id);
        if (target && target.muted_until < now) this.notifyMute(target.id, this.accounts.mute(target.id, AUTO_MUTE_HOURS, 'auto', now));
      }
    }
    m.conn.send({ t: 'reported', id: msg.id });
  }

  private onClose(m: Member): void {
    if (m.authTimer) clearTimeout(m.authTimer);
    this.leave(m);
    if (m.account) {
      const set = this.byAccount.get(m.account.id);
      set?.delete(m);
      if (set && !set.size) this.byAccount.delete(m.account.id);
    }
  }

  private broadcast(channel: string, msg: object): void {
    for (const m of this.channels.get(channel) ?? []) m.conn.send(msg);
  }
}
