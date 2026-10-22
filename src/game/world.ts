import type { ShapeMode } from './shapes';

/** Longest object along x; solids are split so queries can use a bounded window. */
export const MAX_OBJ_W = 8;

interface Base {
  id: number;
  /** Bounding box (world tiles). */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export type SolidRole = 'ground' | 'ceil' | 'block' | 'platform';

export interface Solid extends Base {
  kind: 'solid';
  role: SolidRole;
}

export interface Spike extends Base {
  kind: 'spike';
  /** Base centre. */
  x: number;
  y: number;
  /** 1 = points up, -1 = points down. */
  dir: 1 | -1;
  size: number;
}

export interface Saw extends Base {
  kind: 'saw';
  x: number;
  y: number;
  r: number;
  /**
   * Moving saw: slides from y=`from` to y=`to` while the runner travels from
   * `ax` to `bx`. Tied to the runner's position (not the clock), so it is
   * the same for physics, the bot and the screen.
   */
  move?: {
    ax: number;
    bx: number;
    from: number;
    to: number;
    /**
     * Haunted Run monsters: wander back and forth between `l` and `r` (a
     * zombie turns at walls, spikes and drops; a ghost drifts through
     * anything) until the runner reaches `ax` and they notice you, then
     * come at you and settle on `x` by `bx`. Driven by the runner's
     * position like everything else, so physics, bot and screen agree.
     */
    patrol?: { l: number; r: number; rate: number; off: number; bob?: number };
    /** Swoops up and down this much on the way in (settles by `bx`). */
    wave?: number;
  };
  /** Haunted Run: drawn as a zombie (on the ground) or a ghost (in the air) instead of a saw. */
  mob?: 'zombie' | 'ghost';
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Where a wandering monster is (and which way it faces) before it notices you. */
function wander(p: NonNullable<NonNullable<Saw['move']>['patrol']>, runnerX: number): { x: number; dir: 1 | -1 } {
  const len = Math.max(0.001, p.r - p.l);
  const u = (((runnerX * p.rate + p.off) % (2 * len)) + 2 * len) % (2 * len);
  return u < len ? { x: p.l + u, dir: 1 } : { x: p.l + 2 * len - u, dir: -1 };
}

/** 0 = still wandering, 0..1 = coming at you, 1 = settled on its spot. */
export function mobAlert(s: Saw, runnerX: number): number {
  const m = s.move;
  if (!m?.patrol) return 1;
  return Math.min(1, Math.max(0, (runnerX - m.ax) / (m.bx - m.ax)));
}

/** Which way a monster faces: 1 = right (away from you), -1 = left (at you). */
export function mobFacing(s: Saw, runnerX: number): 1 | -1 {
  const m = s.move;
  if (!m?.patrol || runnerX >= m.ax) return -1;
  return wander(m.patrol, runnerX).dir;
}

/** Where a (possibly moving) saw is when the runner is at `runnerX`. */
export function sawY(s: Saw, runnerX: number): number {
  const m = s.move;
  if (!m) return s.y;
  const t = Math.min(1, Math.max(0, (runnerX - m.ax) / (m.bx - m.ax)));
  const wave = m.wave ? m.wave * Math.sin(t * Math.PI * 3) * (1 - t) : 0;
  if (m.patrol?.bob) {
    // A ghost bobs while it drifts about, then swoops down onto its spot.
    const bobAt = (x: number) => m.from + m.patrol!.bob! * Math.sin(x * m.patrol!.rate * 1.7 + m.patrol!.off);
    if (t <= 0) return bobAt(runnerX);
    const start = bobAt(m.ax);
    return start + (m.to - start) * smooth(t) + wave;
  }
  return m.from + (m.to - m.from) * smooth(t) + wave;
}

/** Where a (possibly moving) saw is across, when the runner is at `runnerX`. */
export function sawX(s: Saw, runnerX: number): number {
  const p = s.move?.patrol;
  if (!p) return s.x;
  const m = s.move!;
  if (runnerX <= m.ax) return wander(p, runnerX).x;
  const start = wander(p, m.ax).x;
  const t = Math.min(1, (runnerX - m.ax) / (m.bx - m.ax));
  return start + (s.x - start) * smooth(t);
}

export interface Gem extends Base {
  kind: 'gem';
  x: number;
  y: number;
  big: boolean;
}

export interface Pad extends Base {
  kind: 'pad';
  x: number;
  /** Surface the pad sits on. */
  y: number;
  dir: 1 | -1;
}

export interface Orb extends Base {
  kind: 'orb';
  x: number;
  y: number;
}

export interface Portal extends Base {
  kind: 'portal';
  x: number;
  y: number;
  mode: ShapeMode;
}

export type PickupType = 'heart' | 'shield' | 'magnet';

export interface Pickup extends Base {
  kind: 'pickup';
  x: number;
  y: number;
  type: PickupType;
}

export interface MysteryBox extends Base {
  kind: 'box';
  x: number;
  y: number;
}

/** A hidden Golden Shape: one per Endless level (1-based), off the main path. */
export interface Secret extends Base {
  kind: 'secret';
  x: number;
  y: number;
  level: number;
}

export interface Finish extends Base {
  kind: 'finish';
  x: number;
}

export interface Hint extends Base {
  kind: 'hint';
  x: number;
  text: string;
  sub: string;
  /** Tutorial key so each hint shows once per player. */
  key: string;
}

export type WorldObj = Solid | Spike | Saw | Gem | Pad | Orb | Portal | Pickup | MysteryBox | Finish | Hint | Secret;

/** A stretch of track with one shape mode (used for rendering ceilings, music and bots). */
export interface Section {
  x0: number;
  x1: number;
  mode: ShapeMode;
  ceiling: boolean;
}

/**
 * Track storage. Objects are appended in increasing x0 order (the generator
 * guarantees it), so range queries are a binary search + short scan.
 */
export class World {
  objs: WorldObj[] = [];
  sections: Section[] = [];
  private nextId = 1;
  /** x up to which the track exists. */
  generatedTo = 0;
  /** Race finish line (Infinity for endless). */
  finishX = Infinity;
  /** Largest tail ever merged (tests keep this small). */
  merges = 0;

  newId(): number {
    return this.nextId++;
  }

  appendSorted(chunk: WorldObj[]): void {
    if (!chunk.length) return;
    chunk.sort((a, b) => a.x0 - b.x0);
    const objs = this.objs;
    if (!objs.length || chunk[0].x0 >= objs[objs.length - 1].x0) {
      for (const o of chunk) objs.push(o);
      return;
    }
    // Patterns may start decorations (gem arcs) slightly before the cursor:
    // merge just the overlapping tail instead of re-sorting everything.
    const tail = objs.splice(this.lowerBound(chunk[0].x0));
    this.merges = Math.max(this.merges, tail.length);
    let i = 0;
    let j = 0;
    while (i < tail.length || j < chunk.length) {
      if (j >= chunk.length || (i < tail.length && tail[i].x0 <= chunk[j].x0)) objs.push(tail[i++]);
      else objs.push(chunk[j++]);
    }
  }

  private lowerBound(x: number): number {
    let lo = 0;
    let hi = this.objs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.objs[mid].x0 < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Calls fn for every object whose x-range overlaps [x0, x1]. */
  each(x0: number, x1: number, fn: (o: WorldObj) => void): void {
    const objs = this.objs;
    for (let i = this.lowerBound(x0 - MAX_OBJ_W); i < objs.length; i++) {
      const o = objs[i];
      if (o.x0 > x1) break;
      if (o.x1 >= x0) fn(o);
    }
  }

  query(x0: number, x1: number, out: WorldObj[] = []): WorldObj[] {
    out.length = 0;
    this.each(x0, x1, (o) => out.push(o));
    return out;
  }

  /** Drop everything entirely left of x. */
  prune(x: number): void {
    let n = 0;
    while (n < this.objs.length && this.objs[n].x0 < x - MAX_OBJ_W) n++;
    if (n > 256) this.objs.splice(0, n);
    while (this.sections.length > 2 && this.sections[1].x1 < x) this.sections.shift();
  }

  sectionAt(x: number): Section | undefined {
    for (const s of this.sections) if (x >= s.x0 && x < s.x1) return s;
    return this.sections[this.sections.length - 1];
  }

  /** First ground surface at or after x (for pit rescue). */
  nextGroundX(x: number): number {
    let best = Infinity;
    this.each(x, x + 40, (o) => {
      if (o.kind === 'solid' && o.role === 'ground' && o.x1 > x + 0.6) best = Math.min(best, Math.max(o.x0, x));
    });
    return best;
  }
}
