import { Emitter } from '../core/emitter';
import { IS_PORTAL } from '../core/portal';
import { decodeLevel, encodeLevel, type LevelData } from '../game/level';
import { serverAvailable } from '../meta/community';
import { activeEditor } from '../editor/session';
import { levels } from '../state/levels';
import { store } from '../state/store';
import { friends } from './friends';
import { serverApi, ServerError } from './server';

/**
 * Web editor sync (Builder Pack). The phone and a linked browser keep the
 * same "My Levels": each side uploads what it built or changed, downloads
 * what the other did, and the newest edit wins. A browser can also send a
 * level to the phone to test-play it there.
 *
 * The phone signs calls with its device key; the browser with the session
 * token it got when it was linked (kept only in that browser).
 */
export interface CloudLevel {
  id: string;
  code: string;
  madeOn: 'mobile' | 'web';
  verified: boolean;
  updated: number;
  deleted: boolean;
}

export interface WebSession {
  token: string;
  name: string;
  tag: number;
  kid: boolean;
  band: 'child' | 'teen' | 'adult';
}

export interface TestStatus {
  sent: number;
  delivered: boolean;
  result: { progress: number; completed: boolean } | null;
}

/** A level the browser sent to this phone. */
export interface IncomingTest {
  level: LevelData;
  sent: number;
}

const SESSION_KEY = 'polygon-rush.web-session.v1';
/** How often the phone checks for a test while a browser is open (and when none is). */
const INBOX_FAST = 4000;
const INBOX_SLOW = 45_000;
/** The browser re-checks for phone edits this often. */
const WEB_SYNC_MS = 20_000;

function readSession(): WebSession | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as WebSession | null;
    return raw && typeof raw.token === 'string' && raw.token ? raw : null;
  } catch {
    return null;
  }
}

class CloudSync extends Emitter<{ test: IncomingTest; signedOut: string; synced: number }> {
  private session: WebSession | null = IS_PORTAL ? readSession() : null;
  private syncing = false;
  private again = false;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private inboxTimer: ReturnType<typeof setTimeout> | null = null;
  private webTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  /** Ignore level changes this service makes itself. */
  private applying = false;
  private fastPolls = 0;

  get web(): WebSession | null {
    return this.session;
  }

  /** Levels sync right now: a signed-in browser, or a phone with the Builder Pack that linked one. */
  get active(): boolean {
    if (!serverAvailable()) return false;
    if (IS_PORTAL) return Boolean(this.session);
    return (store.data.web.linked || this.pairingUntil > Date.now()) && store.data.purchases.builder;
  }

  /** While a link code is showing, the phone uploads its levels so they're there when the browser opens. */
  private pairingUntil = 0;

  private call<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    if (IS_PORTAL) return serverApi<T>(path, { body, token: this.session?.token ?? '' });
    return friends.authed<T>(path, body);
  }

  /** Start syncing (called at boot, and again after linking). Safe to call twice. */
  start(): void {
    if (!this.started) {
      this.started = true;
      levels.on('change', () => {
        if (!this.applying && this.active) this.soon();
      });
      levels.on('removed', (l) => {
        if (this.active && l.synced) void this.call('/api/cloud/levels/delete', { id: l.id, updated: Date.now() }).catch(() => undefined);
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.active) {
          void this.sync();
          if (!IS_PORTAL) this.pollInbox(0);
        }
      });
    }
    if (!this.active) return;
    void this.sync();
    if (IS_PORTAL) {
      if (!this.webTimer) this.webTimer = setInterval(() => document.visibilityState === 'visible' && void this.sync(), WEB_SYNC_MS);
    } else {
      this.pollInbox(0);
    }
  }

  private soon(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.sync(), 2500);
  }

  /** Two-way sync of your own levels (newest edit wins, deletes travel too). */
  async sync(): Promise<void> {
    if (!this.active) return;
    if (this.syncing) {
      this.again = true;
      return;
    }
    this.syncing = true;
    try {
      const { levels: remote } = await this.call<{ levels: CloudLevel[] }>('/api/cloud/levels');
      const open = activeEditor()?.meta.id;
      this.applying = true;
      try {
        for (const r of remote) this.applyRemote(r, open);
      } finally {
        this.applying = false;
      }
      const byId = new Map(remote.map((r) => [r.id, r]));
      for (const l of levels.list()) {
        if (l.origin !== 'mine') continue;
        const r = byId.get(l.id);
        if (r && r.updated >= l.updated) continue;
        if (l.synced === l.updated && !r) continue;
        const res = await this.call<{ updated: number; stored: boolean }>('/api/cloud/levels/put', {
          id: l.id,
          code: encodeLevel(l),
          updated: l.updated,
          madeOn: l.madeOn ?? (IS_PORTAL ? 'web' : 'mobile'),
          verified: l.verified,
        });
        this.applying = true;
        try {
          levels.touch(l.id, (x) => (x.synced = res.updated));
        } finally {
          this.applying = false;
        }
      }
      this.emit('synced', Date.now());
    } catch (e) {
      this.failed(e);
    } finally {
      this.syncing = false;
      if (this.again) {
        this.again = false;
        void this.sync();
      }
    }
  }

  private applyRemote(r: CloudLevel, openId: string | undefined): void {
    const local = levels.get(r.id);
    if (r.id === openId) return;
    if (r.deleted) {
      // Deleted on the other side: drop it here too, unless it was changed here since.
      if (local && local.synced && local.updated <= r.updated) {
        levels.remove(r.id);
      }
      return;
    }
    if (local && local.updated >= r.updated) {
      if (local.madeOn !== r.madeOn || local.synced !== local.updated) levels.touch(r.id, (x) => ((x.madeOn = r.madeOn), (x.synced = x.updated)));
      return;
    }
    let content;
    try {
      content = decodeLevel(r.code);
    } catch {
      return; // made by a newer version
    }
    const next: LevelData = {
      ...content,
      id: r.id,
      created: local?.created ?? r.updated,
      updated: r.updated,
      verified: r.verified,
      best: local?.best ?? 0,
      plays: local?.plays ?? 0,
      origin: 'mine',
      madeOn: r.madeOn,
      synced: r.updated,
    };
    levels.put(next);
  }

  private failed(e: unknown): void {
    if (!(e instanceof ServerError)) return;
    if (IS_PORTAL && e.status === 401) this.signOut(e.message);
  }

  // ------------------------------------------------------------ phone
  /** A code for the browser (the caller checks the Builder Pack). */
  async pair(): Promise<{ code: string; expiresAt: number }> {
    const p = await this.call<{ code: string; expiresAt: number }>('/api/cloud/pair', { builder: store.data.purchases.builder, band: store.data.profile.ageGroup ?? 'child' });
    this.pairingUntil = p.expiresAt;
    this.start();
    return p;
  }

  status(): Promise<{ browsers: number; webActive: boolean }> {
    return this.call('/api/cloud/status');
  }

  /** The phone saw a browser link: start syncing and listening for tests. */
  linked(): void {
    if (!store.data.web.linked) {
      store.data.web = { linked: true };
      store.commit();
    }
    this.start();
  }

  /** Sign every browser out and stop syncing. */
  async unlinkAll(): Promise<void> {
    await this.call('/api/cloud/unlink');
    this.pairingUntil = 0;
    store.data.web = { linked: false };
    store.commit();
  }

  private pollInbox(delay: number): void {
    if (this.inboxTimer) clearTimeout(this.inboxTimer);
    this.inboxTimer = setTimeout(async () => {
      if (!this.active || IS_PORTAL) return;
      let next = INBOX_SLOW;
      if (document.visibilityState === 'visible') {
        try {
          const res = await this.call<{ test: { id: string; code: string; sent: number } | null; webActive: boolean }>('/api/cloud/inbox');
          if (res.webActive) {
            next = INBOX_FAST;
            // A browser is open: pick up what it builds every few checks.
            if (++this.fastPolls % 5 === 0) void this.sync();
          }
          if (res.test) this.receive(res.test);
        } catch {
          /* offline: try again later */
        }
      }
      this.pollInbox(next);
    }, delay);
  }

  private receive(t: { id: string; code: string; sent: number }): void {
    let content;
    try {
      content = decodeLevel(t.code);
    } catch {
      return;
    }
    const local = levels.get(t.id);
    const level: LevelData = {
      ...content,
      id: local ? local.id : 'webtest',
      created: t.sent,
      updated: local?.updated ?? t.sent,
      verified: false,
      best: local?.best ?? 0,
      plays: local?.plays ?? 0,
      origin: 'mine',
      madeOn: 'web',
    };
    this.emit('test', { level, sent: t.sent });
  }

  /** How the phone's test went (the browser shows it). */
  report(sent: number, progress: number, completed: boolean): void {
    void this.call('/api/cloud/test/result', { sent, progress, completed }).catch(() => undefined);
  }

  // ------------------------------------------------------------ browser
  async link(code: string): Promise<WebSession> {
    const s = await serverApi<WebSession>('/api/cloud/link', { body: { code } });
    this.session = s;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {
      /* private mode: signed in for this visit only */
    }
    this.start();
    return s;
  }

  /** Check the saved session still works (and pick up a new racer name). */
  async refresh(): Promise<WebSession | null> {
    if (!this.session) return null;
    try {
      const me = await serverApi<Omit<WebSession, 'token'>>('/api/cloud/me', { body: {}, token: this.session.token });
      this.session = { ...this.session, ...me };
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
      } catch {
        /* ignore */
      }
    } catch (e) {
      if (e instanceof ServerError && (e.status === 401 || e.status === 403)) this.signOut(e.message);
    }
    return this.session;
  }

  signOut(reason = ''): void {
    const token = this.session?.token;
    this.session = null;
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    if (token && !reason) void serverApi('/api/cloud/logout', { body: {}, token }).catch(() => undefined);
    if (this.webTimer) clearInterval(this.webTimer);
    this.webTimer = null;
    this.emit('signedOut', reason);
  }

  /** Browser: play this level on the linked phone. */
  sendTest(level: LevelData): Promise<TestStatus> {
    return this.call<TestStatus>('/api/cloud/test', { id: level.id, code: encodeLevel(level) });
  }

  async testStatus(): Promise<TestStatus | null> {
    return (await this.call<{ test: TestStatus | null }>('/api/cloud/test/status')).test;
  }
}

export const cloud = new CloudSync();
