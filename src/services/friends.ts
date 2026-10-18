import { Emitter } from '../core/emitter';
import { ageOf, serverAvailable } from '../meta/community';
import { isGeneratedName, randomName } from '../meta/names';
import { formatHandle } from '../shared/handle';
import { store } from '../state/store';
import { nav } from '../ui/nav';
import { ServerError, serverApi } from './server';

/**
 * Friends: this device's player on the community server (racer name plus a
 * 4-digit #tag), friends, requests and room invites. Everything is keyed by
 * a random device key; nothing personal is sent. Polls while the app is open.
 */
export interface Player {
  id: string;
  name: string;
  tag: number;
}

export interface Friend extends Player {
  online: boolean;
  activity: 'menu' | 'race' | 'build' | 'play' | null;
}

export interface Invite {
  id: string;
  from: Player;
  kind: 'race' | 'build';
  room: string;
  at: number;
}

export interface FriendsState {
  me: (Player & { friendsOff: boolean }) | null;
  friends: Friend[];
  incoming: Player[];
  outgoing: Player[];
  invites: Invite[];
  /** Why the list couldn't load (offline etc.), or ''. */
  error: string;
}

/** Poll every 30 s, or every 8 s while the Friends screen is open. */
const POLL_MS = 30_000;
const FAST_MS = 8_000;

const empty = (): FriendsState => ({
  me: null,
  friends: [],
  incoming: [],
  outgoing: [],
  invites: [],
  error: '',
});

export function handleOf(p: Pick<Player, 'name' | 'tag'>): string {
  return formatHandle(p.name, p.tag);
}

/** The random key that identifies this device to the server (never shown). */
export function deviceKey(): string {
  let k = store.data.profile.nameKey;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(k)) {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    k = Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'[b & 63]).join('');
    store.data.profile.nameKey = k;
    store.commit();
  }
  return k;
}

class FriendsService extends Emitter<{
  change: FriendsState;
  invite: Invite;
  notice: string;
}> {
  state: FriendsState = empty();
  private timer = 0;
  private started = false;
  private registered = false;
  private seen = new Set<string>();
  private fast = false;

  /** Server configured, online play allowed and friends not switched off by a parent. */
  get available(): boolean {
    const s = store.data.settings;
    return serverAvailable() && s.onlineAllowed && s.friends;
  }

  /** Under-13s add friends only by typing a full Name#tag (no "add" buttons on cards). */
  get canAddFromCards(): boolean {
    return this.available && ageOf(store.data.profile.birthYear) >= 13;
  }

  /** Requests and invites waiting (for the menu badge). */
  get waiting(): number {
    return this.state.incoming.length + this.state.invites.length;
  }

  get myHandle(): string {
    const p = store.data.profile;
    return p.tag > 0 ? formatHandle(p.name, p.tag) : '';
  }

  private set(patch: Partial<FriendsState>): void {
    this.state = { ...this.state, ...patch };
    this.emit('change', this.state);
  }

  /**
   * Create or update this device's player (name, age band, parents' switch).
   * A name a moderator banned is swapped for a generated one.
   */
  async register(): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!serverAvailable() || !store.data.profile.name) return { ok: false, message: 'Friends aren’t available yet.' };
    const p = store.data.profile;
    const body = () => ({
      key: deviceKey(),
      name: p.name,
      kid: ageOf(p.birthYear) < 13,
      friendsOff: !this.available,
      tag: p.tag,
    });
    try {
      const me = await serverApi<Player & { friendsOff: boolean }>('/api/players/register', { body: body() });
      this.registered = true;
      if (p.tag !== me.tag) {
        p.tag = me.tag;
        store.commit();
      }
      this.set({ me });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerError && (e.code === 'name_banned' || e.code === 'bad_name') && !isGeneratedName(p.name)) {
        p.name = randomName();
        store.commit();
        this.emit('notice', e.code === 'name_banned' ? 'Your racer name was reset by our safety team. Pick a new one any time in Settings.' : 'Your racer name was changed to a generated one.');
        return this.register();
      }
      return {
        ok: false,
        message: e instanceof ServerError ? e.message : 'Can’t reach the game server.',
      };
    }
  }

  /** Start polling (call once at startup; safe to call again). */
  start(): void {
    if (this.started) return;
    this.started = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopTimer();
      else this.kick();
    });
    this.kick();
  }

  private stopTimer(): void {
    clearInterval(this.timer);
    this.timer = 0;
  }

  /** Sync now and keep polling while the app is visible. */
  kick(): void {
    this.stopTimer();
    if (!serverAvailable()) return;
    void this.sync();
    this.timer = window.setInterval(() => void this.sync(), this.fast ? FAST_MS : POLL_MS);
  }

  /** Faster updates while the Friends screen is open. */
  setFast(on: boolean): void {
    this.fast = on;
    if (!document.hidden) this.kick();
  }

  private activity(): Friend['activity'] {
    const r = nav.route;
    if (r === null) return 'play';
    if (r === 'editor') return 'build';
    if (r === 'friends') return 'race';
    return 'menu';
  }

  async sync(): Promise<void> {
    if (!serverAvailable() || !store.data.profile.name) return;
    if (!this.registered) {
      const r = await this.register();
      if (!r.ok) return this.set({ error: r.message });
    }
    if (!this.available) return this.set({ ...empty(), me: this.state.me });
    try {
      const res = await serverApi<Omit<FriendsState, 'error'>>('/api/friends/sync', { body: { key: deviceKey(), activity: this.activity() } });
      this.set({ ...res, error: '' });
      if (res.friends.length > store.data.stats.friendsMax) {
        store.data.stats.friendsMax = res.friends.length;
        store.commit();
      }
      for (const inv of res.invites) {
        if (this.seen.has(inv.id)) continue;
        this.seen.add(inv.id);
        this.emit('invite', inv);
      }
    } catch (e) {
      if (e instanceof ServerError && (e.code === 'not_registered' || e.code === 'name_banned')) {
        this.registered = false;
        const r = await this.register();
        if (r.ok) return this.sync();
      }
      this.set({
        error: e instanceof ServerError ? e.message : 'Can’t reach the game server.',
      });
    }
  }

  /** Call the server as this device's player (registers first if needed). */
  async authed<T>(path: string, body: Record<string, unknown>): Promise<T> {
    if (!this.registered) {
      const r = await this.register();
      if (!r.ok) throw new ServerError(0, 'offline', r.message);
    }
    try {
      return await serverApi<T>(path, { body: { key: deviceKey(), ...body } });
    } catch (e) {
      if (!(e instanceof ServerError) || e.code !== 'not_registered') throw e;
      this.registered = false;
      const r = await this.register();
      if (!r.ok) throw new ServerError(0, 'offline', r.message);
      return serverApi<T>(path, { body: { key: deviceKey(), ...body } });
    }
  }

  private async call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const out = await this.authed<T>(path, body);
    void this.sync();
    return out;
  }

  /** Send a request to "Name#1234" (accepts theirs if they already asked). */
  add(handle: string): Promise<{ state: 'sent' | 'friends' }> {
    return this.call('/api/friends/add', { handle });
  }

  respond(id: string, accept: boolean): Promise<unknown> {
    return this.call('/api/friends/respond', { id, accept });
  }

  remove(id: string): Promise<unknown> {
    return this.call('/api/friends/remove', { id });
  }

  block(id: string): Promise<unknown> {
    return this.call('/api/friends/block', { id });
  }

  invite(id: string, kind: 'race' | 'build', room: string): Promise<unknown> {
    return this.call('/api/friends/invite', { id, kind, room });
  }

  dismiss(id: string): Promise<unknown> {
    this.set({ invites: this.state.invites.filter((i) => i.id !== id) });
    return this.call('/api/friends/invite/dismiss', { id });
  }

  /** The parents' switch changed or the name changed: tell the server. */
  async refresh(): Promise<void> {
    this.registered = false;
    await this.sync();
  }

  /** Forget this player on the server (name, tag, friends, requests, invites). */
  async forget(): Promise<void> {
    await serverApi('/api/players/delete', { body: { key: deviceKey() } });
    store.data.profile.tag = 0;
    store.commit();
    this.registered = false;
    this.set(empty());
  }
}

export const friends = new FriendsService();
