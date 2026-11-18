import type { Piece } from '../game/level';

/**
 * Building a beat-charted course (Haunted Run, Holiday Run, Boss Battles)
 * at exact positions. Spikes, saws, monsters and gems sit exactly where
 * the beat says (a fraction of a tile is kept); pits and blocks snap to the
 * tile whose window is closest. Without this, the 1-tile grid alone could
 * put an obstacle up to half a tile (about 50 ms) off the beat.
 */
export interface CourseBuilder {
  pieces: Map<string, Piece>;
  /** Place a piece centred at world column x (fractional). Pieces never go before x 6 or outside rows 0-7. */
  put(t: Piece['t'], x: number, y?: number, v?: number): void;
  /** A run of `n` pit columns centred a little after `center` (a jump must already be up when it gets there). */
  pits(center: number, n: number, late: number): void;
  /** A run of `n` block columns starting `lead` tiles before `center`, `h` rows tall. */
  blocks(center: number, n: number, lead: number, h?: number): void;
}

const FINE = new Set<Piece['t']>(['spike', 'saw', 'gem']);

export function courseBuilder(): CourseBuilder {
  const pieces = new Map<string, Piece>();
  const put = (t: Piece['t'], x: number, y = 0, v = 0) => {
    const fine = FINE.has(t);
    const tile = fine ? Math.floor(x) : Math.round(x - 0.5);
    if (tile < 6 || y < 0 || y > 7) return;
    const key = t === 'pit' || t === 'portal' ? `${t}:${tile}` : `${tile}:${y}`;
    if (pieces.has(key)) return;
    const p: Piece = { t, x: tile, y, v };
    if (fine) {
      const dx = Math.round((x - tile - 0.5) * 100) / 100;
      if (dx) p.dx = dx;
    }
    pieces.set(key, p);
  };
  return {
    pieces,
    put,
    pits(center, n, late) {
      const start = center - n / 2 + late;
      for (let i = 0; i < n; i++) put('pit', start + i + 0.5);
    },
    blocks(center, n, lead, h = 1) {
      const start = center - lead;
      for (let i = 0; i < n; i++) for (let y = 0; y < h; y++) put('block', start + i + 0.5, y);
    },
  };
}
