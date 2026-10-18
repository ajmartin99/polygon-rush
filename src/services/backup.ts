import { sanitizeLevel } from '../game/level';
import { levels } from '../state/levels';
import { migrate } from '../state/save';
import { store } from '../state/store';

/**
 * Move progress to a new phone: the save (gems, skins, records, name and
 * friend identity) and built levels packed into one copyable text code.
 * Purchases are not carried: they come back from Google Play with Restore,
 * and items only a purchase gives are dropped without one (see migrate).
 *
 * Codes are signed (HMAC-SHA256), so an edited code is refused. The key ships
 * inside the app, so this stops casual editing (decode, change gems, encode),
 * not someone who takes the app apart; nothing here is worth more than that
 * because purchases are checked with Google Play, not read from the code.
 */
const PREFIX = 'PRB2.';
const OLD_PREFIX = 'PRB1.';
const SIGN_KEY = 'polygon-rush/backup/v2/7c1e9a4f3b6d2e8a5f0c4b7d9e1a3c6f';
let keyPromise: Promise<CryptoKey> | null = null;

function signKey(): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey('raw', new TextEncoder().encode(SIGN_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return keyPromise;
}

async function signature(body: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await signKey(), new TextEncoder().encode(body));
  return toB64(new Uint8Array(mac).subarray(0, 16));
}

/** Constant-time compare of two short strings. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function makeBackup(): Promise<string> {
  const { purchases: _p, ...save } = store.data;
  void _p;
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, save, levels: levels.list() }));
  const body = typeof CompressionStream !== 'undefined' ? `z${toB64(await pipe(json, new CompressionStream('gzip')))}` : `j${toB64(json)}`;
  return `${PREFIX}${body}.${await signature(PREFIX + body)}`;
}

export class BackupError extends Error {}

/** Replace this device's progress with a backup. Returns how many levels came with it. */
export async function restoreBackup(code: string): Promise<{ levels: number }> {
  const s = code.replace(/\s+/g, '');
  if (s.startsWith(OLD_PREFIX)) throw new BackupError('That code is from an older version. Update Polygon Rush on your old phone and make a new code.');
  if (!s.startsWith(PREFIX) || s.length < PREFIX.length + 10) throw new BackupError('That isn’t a Polygon Rush backup code.');
  const dot = s.lastIndexOf('.');
  const body = s.slice(PREFIX.length, dot);
  if (dot <= PREFIX.length || !sameText(s.slice(dot + 1), await signature(PREFIX + body))) {
    throw new BackupError('That backup code is incomplete or was changed. Copy the whole code from your old phone and try again.');
  }
  let data: { v?: number; save?: unknown; levels?: unknown };
  try {
    let bytes = fromB64(body.slice(1));
    if (body[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('gzip'));
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BackupError('That backup code is incomplete. Copy the whole code and try again.');
  }
  if (data.v !== 1 || typeof data.save !== 'object' || !data.save) throw new BackupError('That backup needs a newer version of Polygon Rush.');
  // Purchases stay this device's (Google Play restores them); migrate drops pack-only items without them.
  const next = migrate({ ...(data.save as object), purchases: store.data.purchases });
  store.data = next;
  store.commit();
  await store.flush();
  let n = 0;
  for (const raw of Array.isArray(data.levels) ? data.levels : []) {
    const l = sanitizeLevel(raw);
    if (l && levels.put(l)) n++;
  }
  await levels.flush();
  store.emit('gems', { gems: next.gems, delta: 0 });
  store.emit('settings', next.settings);
  return { levels: n };
}
