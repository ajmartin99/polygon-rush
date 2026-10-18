/**
 * Friend handles: a racer name plus a 4-digit tag, e.g. "Neon Fox#0427".
 * Many players can share a name; the tag tells them apart. Import-free so
 * the server can use it too.
 */
export function formatHandle(name: string, tag: number): string {
  return tag > 0 ? `${name}#${String(tag).padStart(4, '0')}` : name;
}

/** "neon fox # 427" → { name: 'neon fox', tag: 427 }; null if it isn't a handle. */
export function parseHandle(input: unknown): { name: string; tag: number } | null {
  if (typeof input !== 'string') return null;
  const m = /^(.{3,24}?)\s*#\s*(\d{1,4})$/.exec(input.normalize('NFKC').trim());
  if (!m) return null;
  const tag = Number(m[2]);
  if (tag < 1) return null;
  return { name: m[1].replace(/\s+/g, ' ').trim(), tag };
}
