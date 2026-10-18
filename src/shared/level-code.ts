/**
 * Byte-level reader for "PR1-…" level codes, shared by the game and the
 * community server (no imports, so both can load it). It checks the checksum
 * and splits the code into fields; the game's decodeLevel turns them into
 * pieces and the server checks names and titles before listing a level.
 */

export const LEVEL_CODE_PREFIX = 'PR1-';
/** v1: generated names only. v2: adds custom author names and an optional typed title. */
export const LEVEL_CODE_VERSION = 2;
/** Same cap as the editor's MAX_PIECES. */
const MAX_CODE_PIECES = 4000;

export class LevelCodeFormatError extends Error {}

export type RawAuthor = { gen: [number, number, number] } | { text: string };

export interface RawLevelCode {
  version: number;
  theme: number;
  /** Song id, or -1 for the world's own theme. */
  music: number;
  speed: number;
  /** Index into HEART_OPTIONS. */
  hearts: number;
  length: number;
  name: [number, number];
  authors: RawAuthor[];
  title?: string;
  /** Column deltas and piece bytes, in order. */
  pieces: { dx: number; byte: number }[];
}

export function levelChecksum(bytes: ArrayLike<number>, n = bytes.length): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < n; i++) {
    a = (a + bytes[i]) % 251;
    b = (b + a) % 251;
  }
  return (b << 8) | a;
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Split a level code into its fields. Throws LevelCodeFormatError with a player-facing message. */
export function readLevelCode(code: string): RawLevelCode {
  let s = code.trim().replace(/\s+/g, '');
  if (s.toUpperCase().startsWith(LEVEL_CODE_PREFIX)) s = s.slice(LEVEL_CODE_PREFIX.length);
  if (!s || !/^[A-Za-z0-9_-]+$/.test(s)) throw new LevelCodeFormatError('That doesn’t look like a level code.');
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(s);
  } catch {
    throw new LevelCodeFormatError('That doesn’t look like a level code.');
  }
  if (bytes.length < 11 + (bytes[0] >= 2 ? 2 : 0)) throw new LevelCodeFormatError('That level code is incomplete.');
  const n = bytes.length - 2;
  if (levelChecksum(bytes, n) !== ((bytes[n] << 8) | bytes[n + 1])) throw new LevelCodeFormatError('That level code is incomplete or has a typo.');
  const version = bytes[0];
  if (version !== 1 && version !== LEVEL_CODE_VERSION) throw new LevelCodeFormatError('This level needs a newer version of Polygon Rush.');
  let i = 1;
  const byte = () => {
    if (i >= n) throw new LevelCodeFormatError('That level code is incomplete.');
    return bytes[i++];
  };
  const varint = () => {
    let v = 0;
    let shift = 0;
    for (;;) {
      const b = byte();
      v |= (b & 0x7f) << shift;
      if (!(b & 0x80)) return v >>> 0;
      shift += 7;
      if (shift > 21) throw new LevelCodeFormatError('That level code is damaged.');
    }
  };
  const text = () => {
    const len = byte();
    if (len > 32) throw new LevelCodeFormatError('That level code is damaged.');
    let t = '';
    for (let k = 0; k < len; k++) t += String.fromCharCode(byte());
    return t;
  };
  const tm = byte();
  const theme = tm & 7;
  const music = (version >= 2 ? byte() : tm >> 3) - 1;
  const sh = byte();
  const length = byte() | (byte() << 8);
  const name: [number, number] = [byte(), byte()];
  const authors: RawAuthor[] = [];
  const na = byte();
  for (let k = 0; k < na; k++) {
    const first = byte();
    if (version >= 2 && first === 254) authors.push({ text: text() });
    else authors.push({ gen: [first, byte(), byte()] });
  }
  let title: string | undefined;
  if (version >= 2 && byte() === 254) title = text();
  const count = varint();
  if (count > MAX_CODE_PIECES) throw new LevelCodeFormatError('That level is too big.');
  const pieces: { dx: number; byte: number }[] = [];
  for (let k = 0; k < count; k++) {
    const dx = varint();
    pieces.push({ dx, byte: byte() });
  }
  return { version, theme, music, speed: sh >> 4, hearts: sh & 15, length, name, authors, ...(title !== undefined ? { title } : {}), pieces };
}
