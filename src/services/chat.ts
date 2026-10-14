import { Emitter } from '../core/emitter';
import { FILTER_MESSAGES, filterChat, type FilterReason } from '../shared/chat-filter';
import { serverSocketUrl } from './server';

export interface FreeMessage {
  id: string;
  /** Sender's account id. */
  from: string;
  name: string;
  text: string;
  at: number;
}

interface FreeChatEvents extends Record<string, unknown> {
  /** Connected/disconnected or audience changed. */
  state: void;
  msg: FreeMessage;
  /** The server refused one of our messages. */
  blocked: string;
  muted: number;
  /** Signed out / banned / too young: stop offering Free Chat. */
  denied: { code: string; message: string };
}

const MUTE_TEXT = (until: number) => `You can’t use Free Chat right now (until ${new Date(until).toLocaleString()}).`;

/**
 * Free Chat for one room, over the community server. The room's secret chat
 * key names the channel, so only people in the room can join it — and only
 * verified players (with Free Chat on) ever connect, so only they receive
 * typed messages.
 */
export class FreeChatClient extends Emitter<FreeChatEvents> {
  ready = false;
  /** People in the channel, including you. */
  audience = 0;
  private ws: WebSocket | null = null;
  private retry = 0;
  private stopped = false;
  private retryTimer = 0;
  private pendingReports = new Map<string, (ok: boolean) => void>();

  constructor(
    private readonly token: string,
    private readonly channel: string,
    private readonly name: string,
  ) {
    super();
    this.connect();
  }

  private connect(): void {
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(serverSocketUrl('/chat'));
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token: this.token }));
    ws.onmessage = (e) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(String(e.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      this.handle(m);
    };
    ws.onclose = () => {
      this.ready = false;
      this.ws = null;
      this.emit('state', undefined);
      this.scheduleRetry();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retry >= 8) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.retry++);
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  private handle(m: Record<string, unknown>): void {
    switch (m.t) {
      case 'ready':
        this.ws?.send(JSON.stringify({ t: 'join', channel: this.channel, name: this.name }));
        break;
      case 'joined':
        this.ready = true;
        this.retry = 0;
        this.audience = Number(m.count) || 1;
        this.emit('state', undefined);
        break;
      case 'presence':
        this.audience = Number(m.count) || this.audience;
        this.emit('state', undefined);
        break;
      case 'msg':
        if (typeof m.id === 'string' && typeof m.text === 'string') {
          this.emit('msg', { id: m.id, from: String(m.from), name: String(m.name), text: m.text, at: Number(m.at) || Date.now() });
        }
        break;
      case 'blocked': {
        const reason = String(m.reason);
        this.emit('blocked', reason === 'muted' ? MUTE_TEXT(Number(m.until) || Date.now()) : (FILTER_MESSAGES[reason as FilterReason] ?? 'That message wasn’t sent.'));
        break;
      }
      case 'muted':
        this.emit('muted', Number(m.until) || 0);
        break;
      case 'reported': {
        const done = this.pendingReports.get(String(m.id));
        this.pendingReports.delete(String(m.id));
        done?.(true);
        break;
      }
      case 'error': {
        const code = String(m.code);
        if (code === 'signed_out' || code === 'banned' || code === 'too_young') {
          this.stopped = true;
          this.emit('denied', { code, message: String(m.message ?? '') });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Send a message. Returns an explanation if it can't be sent. */
  say(text: string): string | null {
    if (!this.ready || !this.ws) return 'Free Chat is reconnecting…';
    const r = filterChat(text);
    if (!r.ok) return FILTER_MESSAGES[r.reason!];
    this.ws.send(JSON.stringify({ t: 'say', text }));
    return null;
  }

  report(id: string, reason: string): Promise<boolean> {
    if (!this.ws || !this.ready) return Promise.resolve(false);
    this.ws.send(JSON.stringify({ t: 'report', id, reason }));
    return new Promise((resolve) => {
      this.pendingReports.set(id, resolve);
      setTimeout(() => {
        if (this.pendingReports.delete(id)) resolve(false);
      }, 6000);
    });
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.ready = false;
    this.clear();
  }
}
