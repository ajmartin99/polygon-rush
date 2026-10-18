import { store } from '../state/store';
import { deviceKey } from './friends';

/**
 * Bans for rooms you host. Each device sends an anonymous room id (a hash of
 * its private device key, so it can't be turned back into the key) that only
 * the host sees; banning keeps that id on your device and the room refuses it.
 */
const MAX_BANS = 200;

/** This device's anonymous room id (16 hex characters). */
export function roomId(): string {
  // FNV-1a 64-bit, done as two 32-bit halves.
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (const ch of `${deviceKey()}:room`) {
    const c = ch.charCodeAt(0);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c ^ (h1 & 0xff), 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function isBanned(rid: string): boolean {
  return store.data.roomBans.some((b) => b.rid === rid);
}

export function addBan(rid: string, name: string): void {
  if (isBanned(rid)) return;
  store.data.roomBans = [...store.data.roomBans, { rid, name, at: Date.now() }].slice(-MAX_BANS);
  store.commit();
}

export function removeBan(rid: string): void {
  store.data.roomBans = store.data.roomBans.filter((b) => b.rid !== rid);
  store.commit();
}
