import { Emitter } from '../core/emitter';
import { USER_BASE } from '../core/tracks';

/**
 * My Music: the player's own audio files (MP3, WAV, OGG, M4A...), kept in
 * IndexedDB on this device only. Nothing is uploaded or shared; other
 * players never hear them.
 */
export interface MyTrack {
  /** Stable slot (music id = USER_BASE + slot). */
  slot: number;
  name: string;
  size: number;
}

const DB = 'polygon-rush-music';
const STORE = 'tracks';
/** Keep the device happy: 40 files, 400 MB total. */
export const MAX_FILES = 40;
export const MAX_BYTES = 400 * 1024 * 1024;

interface Row extends MyTrack {
  blob: Blob;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'slot' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Clean up a file name for display ("01 - my_song.mp3" → "01 - my song"). */
export function displayName(file: string): string {
  return (
    file
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'My song'
  );
}

class MyMusic extends Emitter<{ change: MyTrack[] }> {
  private list: MyTrack[] = [];
  private urls = new Map<number, string>();
  private loaded = false;

  get tracks(): MyTrack[] {
    return this.list;
  }

  get available(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  async load(): Promise<MyTrack[]> {
    if (this.loaded || !this.available) return this.list;
    try {
      const rows = (await tx<Row[]>('readonly', (s) => s.getAll() as IDBRequest<Row[]>)) ?? [];
      this.list = rows.map(({ slot, name, size }) => ({ slot, name, size })).sort((a, b) => a.slot - b.slot);
      this.loaded = true;
    } catch {
      this.list = [];
    }
    return this.list;
  }

  /** Add audio files; returns how many were added and why any were skipped. */
  async add(files: FileList | File[]): Promise<{ added: number; skipped: string[] }> {
    await this.load();
    const skipped: string[] = [];
    let added = 0;
    let used = this.list.reduce((n, t) => n + t.size, 0);
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('audio/') && !/\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i.test(f.name)) {
        skipped.push(`${f.name} isn't an audio file`);
        continue;
      }
      if (this.list.length >= MAX_FILES) {
        skipped.push(`${f.name}: My Music is full (${MAX_FILES} songs)`);
        continue;
      }
      if (used + f.size > MAX_BYTES) {
        skipped.push(`${f.name}: not enough space`);
        continue;
      }
      const slot = this.list.reduce((m, t) => Math.max(m, t.slot + 1), 0);
      const row: Row = { slot, name: displayName(f.name), size: f.size, blob: f };
      await tx('readwrite', (s) => s.put(row));
      this.list.push({ slot, name: row.name, size: row.size });
      used += f.size;
      added++;
    }
    this.emit('change', this.list);
    return { added, skipped };
  }

  async remove(slot: number): Promise<void> {
    await tx('readwrite', (s) => s.delete(slot));
    const url = this.urls.get(slot);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(slot);
    this.list = this.list.filter((t) => t.slot !== slot);
    this.emit('change', this.list);
  }

  /** Playable URL for a slot (created on demand). */
  async url(slot: number): Promise<string | null> {
    const cached = this.urls.get(slot);
    if (cached) return cached;
    const row = (await tx<Row | undefined>('readonly', (s) => s.get(slot) as IDBRequest<Row | undefined>)) ?? null;
    if (!row) return null;
    const url = URL.createObjectURL(row.blob);
    this.urls.set(slot, url);
    return url;
  }

  ids(): number[] {
    return this.list.map((t) => USER_BASE + t.slot);
  }

  nameOf(id: number): string | null {
    return this.list.find((t) => USER_BASE + t.slot === id)?.name ?? null;
  }
}

export const myMusic = new MyMusic();
