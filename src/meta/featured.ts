import { sanitizeContent, type LevelContent, type Piece, type PieceType } from '../game/level';

/** Hand-made levels by the Polygon Rush team: play them, or remix them as a starting point. */
export interface FeaturedLevel extends LevelContent {
  id: string;
  blurb: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

const MODES = { jumper: 0, glider: 1, roller: 2, hopper: 3 } as const;

/** Tiny builder so levels read like a script. */
class Build {
  readonly pieces: Piece[] = [];
  put(t: PieceType, x: number, y = 0, v = 0): this {
    this.pieces.push({ t, x, y, v });
    return this;
  }
  spikes(x: number, n = 1, y = 0, down = false): this {
    for (let i = 0; i < n; i++) this.put('spike', x + i, y, down ? 1 : 0);
    return this;
  }
  blocks(x: number, y: number, w: number, h = 1): this {
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) this.put('block', x + dx, y + dy);
    return this;
  }
  ledge(x: number, y: number, w: number): this {
    for (let dx = 0; dx < w; dx++) this.put('platform', x + dx, y);
    return this;
  }
  gems(x0: number, x1: number, y: number, step = 1): this {
    for (let x = x0; x <= x1; x += step) this.put('gem', x, y);
    return this;
  }
  big(x: number, y: number): this {
    return this.put('gem', x, y, 1);
  }
  pit(x: number, w: number): this {
    for (let i = 0; i < w; i++) this.put('pit', x + i);
    return this;
  }
  portal(x: number, mode: keyof typeof MODES): this {
    return this.put('portal', x, 0, MODES[mode]);
  }
  /** Floor and ceiling posts leaving a gap from row `lo` to row `hi` (inclusive). */
  gate(x: number, lo: number, hi: number, w = 1): this {
    if (lo > 0) this.blocks(x, 0, w, lo);
    if (hi < 7) this.blocks(x, hi + 1, w, 7 - hi);
    return this;
  }
}

function level(id: string, meta: Omit<FeaturedLevel, 'pieces' | 'id' | 'authors'>, b: Build): FeaturedLevel {
  const content = sanitizeContent({ ...meta, authors: [], pieces: b.pieces })!;
  return { ...content, id, blurb: meta.blurb, difficulty: meta.difficulty };
}

// ------------------------------------------------------------------ 1. Easy (Chill speed)
const sunny = new Build()
  .gems(8, 11, 0)
  .spikes(14)
  .put('gem', 13, 1)
  .put('gem', 14, 2)
  .put('gem', 15, 1)
  .blocks(22, 0, 2)
  .gems(22, 23, 2)
  .spikes(30, 2)
  .gems(30, 31, 2)
  .pit(38, 2)
  .gems(37, 40, 2)
  .blocks(47, 0, 5)
  .blocks(52, 0, 5, 2)
  .put('gem', 49, 2)
  .big(54, 3)
  .put('pad', 64)
  .spikes(67, 3)
  .gems(66, 69, 4)
  .put('pickup', 78, 1, 0)
  .spikes(86)
  .spikes(93)
  .spikes(100)
  .gems(85, 101, 3, 4)
  .pit(108, 3)
  .gems(108, 110, 2)
  .blocks(118, 0, 8)
  .spikes(122, 1, 1)
  .big(122, 3)
  .gems(131, 140, 0, 2)
  .spikes(146, 2)
  .big(155, 2);

// ------------------------------------------------------------------ 2. Medium: orbs, ledges and the Glider
const highway = new Build()
  .spikes(12, 2)
  .gems(11, 14, 2)
  .blocks(20, 0, 4)
  .gems(20, 23, 2)
  .ledge(30, 1, 6)
  .spikes(31, 5)
  .gems(30, 35, 3)
  .pit(46, 5)
  .put('orb', 48, 2)
  .gems(50, 52, 3)
  .put('pad', 62)
  .blocks(66, 0, 3, 3)
  .gems(63, 68, 5)
  .portal(80, 'glider')
  .gems(83, 90, 4)
  .gate(95, 2, 6, 2)
  .put('gem', 96, 4)
  .gate(108, 0, 4, 2)
  .put('gem', 109, 2)
  .gate(121, 3, 7, 2)
  .put('gem', 122, 5)
  .put('saw', 133, 1, 1)
  .put('saw', 141, 6, 1)
  .gems(133, 133, 5)
  .gems(141, 141, 2)
  .portal(152, 'jumper')
  .gems(156, 160, 0)
  .spikes(166)
  .spikes(172, 2)
  .blocks(180, 0, 6)
  .spikes(183, 1, 1)
  .put('pickup', 190, 1, 1)
  .pit(198, 3)
  .spikes(208, 3)
  .gems(207, 211, 2)
  .big(222, 2);

// ------------------------------------------------------------------ 3. Medium: the Roller
const castle = new Build()
  .gems(9, 12, 1)
  .spikes(15)
  .blocks(23, 0, 3)
  .spikes(25, 1, 1)
  .portal(36, 'roller')
  .gems(38, 44, 1)
  .spikes(48, 3)
  .gems(48, 50, 4)
  .spikes(60, 3, 7, true)
  .gems(60, 62, 3)
  .spikes(72, 4)
  .gems(72, 75, 4)
  .blocks(84, 6, 3, 2)
  .gems(84, 86, 3)
  .spikes(96, 3)
  .spikes(108, 3, 7, true)
  .put('pickup', 118, 4, 1)
  .spikes(124, 4)
  .gems(124, 127, 6)
  .portal(138, 'jumper')
  .gems(142, 146, 0)
  .put('pad', 152)
  .blocks(156, 0, 2, 3)
  .gems(153, 158, 5)
  .spikes(168, 2)
  .pit(176, 3)
  .big(186, 2);

// ------------------------------------------------------------------ 4. Hard (Turbo): the Hopper and everything
const express = new Build()
  .spikes(12, 2)
  .blocks(20, 0, 5)
  .spikes(22, 1, 1)
  .pit(30, 3)
  .portal(40, 'hopper')
  .gems(43, 50, 2)
  .spikes(54, 7)
  .gems(54, 60, 3, 2)
  .gate(70, 2, 6, 2)
  .put('gem', 71, 4)
  .gate(82, 1, 5, 2)
  .put('gem', 83, 3)
  .put('saw', 94, 1, 1)
  .gems(94, 94, 5)
  .spikes(104, 6)
  .gems(104, 109, 3, 2)
  .portal(118, 'glider')
  .gate(128, 3, 6, 2)
  .gate(138, 1, 4, 2)
  .gate(148, 3, 6, 2)
  .gems(129, 149, 5, 10)
  .portal(160, 'jumper')
  .spikes(166, 3)
  .put('pad', 176)
  .blocks(180, 0, 2, 4)
  .pit(190, 4)
  .put('orb', 192, 2)
  .spikes(202, 2)
  .spikes(209, 3)
  .big(218, 2);

export const FEATURED: FeaturedLevel[] = [
  level('sunny01', { name: [3, 30], theme: 1, speed: 0, hearts: 5, length: 165, blurb: 'A gentle warm-up: spikes, blocks, a pit and your first bounce pad.', difficulty: 'Easy' }, sunny),
  level('rocket02', { name: [29, 3], theme: 2, speed: 1, hearts: 3, length: 230, blurb: 'Jump rings, ledges over spikes and a Glider gauntlet.', difficulty: 'Medium' }, highway),
  level('jelly03', { name: [8, 1], theme: 0, speed: 1, hearts: 3, length: 195, blurb: 'Flip between floor and ceiling as the Roller.', difficulty: 'Medium' }, castle),
  level('neon04', { name: [2, 21], theme: 3, speed: 2, hearts: 3, length: 228, blurb: 'Turbo speed with Hopper, Glider and a sneaky ring. Good luck!', difficulty: 'Hard' }, express),
];
