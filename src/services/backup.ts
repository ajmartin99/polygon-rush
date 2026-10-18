import { sanitizeLevel } from '../game/level';
import { levels } from '../state/levels';
import { migrate } from '../state/save';
import { store } from '../state/store';

/**
 * Move progress to a new phone: the save (gems, skins, records, name and
 * friend identity) and built levels packed into one copyable text code.
 * Purchases are not carried: they come back from Google Play with Restore.
 */
const PREFIX = 'PRB1.';

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
  if (typeof CompressionStream !== 'undefined') return `${PREFIX}z${toB64(await pipe(json, new CompressionStream('gzip')))}`;
  return `${PREFIX}j${toB64(json)}`;
}

export class BackupError extends Error {}

/** Replace this device's progress with a backup. Returns how many levels came with it. */
export async function restoreBackup(code: string): Promise<{ levels: number }> {
  const s = code.replace(/\s+/g, '');
  if (!s.startsWith(PREFIX) || s.length < PREFIX.length + 10) throw new BackupError('That isn’t a Polygon Rush backup code.');
  let data: { v?: number; save?: unknown; levels?: unknown };
  try {
    let bytes = fromB64(s.slice(PREFIX.length + 1));
    if (s[PREFIX.length] === 'z') bytes = await pipe(bytes, new DecompressionStream('gzip'));
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BackupError('That backup code is incomplete. Copy the whole code and try again.');
  }
  if (data.v !== 1 || typeof data.save !== 'object' || !data.save) throw new BackupError('That backup needs a newer version of Polygon Rush.');
  const purchases = store.data.purchases;
  const next = migrate(data.save);
  next.purchases = purchases;
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
