import { CONFIG } from '../config';
import { store } from '../state/store';
import type { NetRoom } from './net';
import { serverApi } from './server';

export type PublicKind = 'build' | 'race';

export interface PublicRoomInfo {
  code: string;
  kind?: PublicKind;
  name: [number, number];
  host: string;
  players: number;
  max: number;
  theme: number;
  createdAt: number;
}

/**
 * Lists a build or race room on the community server so players 13+ can
 * find and join it. Only the room code, the host's generated name and the
 * level's name/theme are shared. Stops automatically when the room closes;
 * race rooms drop off the list once the race starts.
 */
export class PublicListing {
  private secret = '';
  private timer = 0;
  private stopped = false;
  private readonly onHide = () => this.beacon();

  constructor(
    private readonly room: NetRoom,
    private readonly info: () => { name: [number, number]; theme: number },
    private readonly kind: PublicKind = 'build',
  ) {}

  private body(): Record<string, unknown> {
    const i = this.info();
    return { kind: this.kind, name: i.name, theme: i.theme, host: store.data.profile.name, players: this.room.players.length, max: CONFIG.net.maxPlayers, open: !this.room.racing };
  }

  /** Send the player count / open state now (e.g. someone joined, the race started). */
  update(): void {
    void this.beat();
  }

  async start(): Promise<void> {
    const r = await serverApi<{ secret: string }>(`/api/rooms/${this.room.code}`, { body: this.body() });
    this.secret = r.secret;
    this.timer = window.setInterval(() => void this.beat(), 15_000);
    window.addEventListener('pagehide', this.onHide);
  }

  private async beat(): Promise<void> {
    if (this.stopped) return;
    if (!this.room.open) return this.stop();
    try {
      await serverApi(`/api/rooms/${this.room.code}/beat`, { body: { ...this.body(), secret: this.secret } });
    } catch {
      /* the server forgets the room after 45 s without a beat */
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    window.removeEventListener('pagehide', this.onHide);
    if (this.secret) void serverApi(`/api/rooms/${this.room.code}`, { method: 'DELETE', body: { secret: this.secret } }).catch(() => {});
  }

  private beacon(): void {
    if (!this.secret || !navigator.sendBeacon) return;
    navigator.sendBeacon(`${CONFIG.server.url}/api/rooms/${this.room.code}/remove`, new Blob([JSON.stringify({ secret: this.secret })], { type: 'text/plain' }));
  }
}

export const lobby = {
  async list(kind: PublicKind = 'build'): Promise<PublicRoomInfo[]> {
    const r = await serverApi<{ rooms: PublicRoomInfo[] }>(kind === 'race' ? '/api/rooms?kind=race' : '/api/rooms');
    return Array.isArray(r.rooms) ? r.rooms : [];
  },

  async report(code: string, reason: string, level: string | null): Promise<void> {
    await serverApi(`/api/rooms/${code}/report`, { body: { reason, level }, token: store.data.account.token || undefined });
  },
};
