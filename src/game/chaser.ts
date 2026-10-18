import type { ShapeMode } from './shapes';

/**
 * The Haunted Run's chaser: something is always right behind you. On the
 * ground it's a shambling zombie; when you take off as the Glider it bursts
 * into a ghost that swoops after you (and back into a zombie when you land
 * in another shape). It creeps closer all the time. Every obstacle you clear
 * cleanly and every gem you grab shoves it back, a bump lets it lunge, and if
 * it reaches you the run ends.
 * Pure state (no drawing or sound), so it can be tested.
 */
export type ChaserKind = 'zombie' | 'ghost';
export type ChaserDiff = 'hard' | 'easy';
export type ChaserEvent = 'warn' | 'caught' | 'morph' | 'shove' | 'lunge';

export const CHASER_TUNING = {
  /** Tiles behind the runner at the start, and the furthest it falls back (still on screen). */
  start: 3.0,
  max: 3.4,
  /** Tiles per second it gains on you. */
  creep: { hard: 0.5, easy: 0.3 } as Record<ChaserDiff, number>,
  /**
   * Clearing an obstacle without a bump wins back the ground it crept since
   * the last one, plus this much extra (so clean play always stays ahead).
   */
  dodge: 1.1,
  /** ...and at least this many tiles. */
  dodgeMin: 0.2,
  /** Tiles pushed back per gem / big gem. */
  gem: 0.15,
  bigGem: 0.5,
  /** Tiles it lunges on a bump. */
  hit: 1.4,
  /** Close enough to feel it breathing. */
  warnAt: 1.8,
  /** Caught. */
  catchAt: 0.55,
  /** A grace period at the start (the song's first bar). */
  grace: 1.8,
};

export function chaserKindFor(mode: ShapeMode): ChaserKind {
  return mode === 'triangle' ? 'ghost' : 'zombie';
}

/**
 * Where the obstacles are, as x positions a runner clears (the far edge of
 * each hazard, with neighbours closer than `merge` tiles counted once).
 */
export function obstacleMarks(hazards: { x0: number; x1: number }[], merge = 1.6): number[] {
  const sorted = [...hazards].sort((a, b) => a.x0 - b.x0);
  const out: number[] = [];
  for (const h of sorted) {
    if (out.length && h.x0 - out[out.length - 1] < merge) out[out.length - 1] = Math.max(out[out.length - 1], h.x1);
    else out.push(h.x1);
  }
  return out;
}

export class Chaser {
  readonly diff: ChaserDiff;
  /** Tiles behind the runner. */
  gap = CHASER_TUNING.start;
  kind: ChaserKind = 'zombie';
  /** World position (x is derived from the runner). */
  x = 0;
  y = 0;
  /** Which way gravity pulls the zombie (follows the Roller onto the ceiling). */
  flip = 0;
  /** Animation timers (seconds left). */
  lunge = 0;
  shove = 0;
  morph = 0;
  /** 0 (far) → 1 (about to catch you). */
  danger = 0;
  caught = false;
  private warned = false;
  private time = 0;
  private lastHit = -9;
  private lastMark = 0;
  /** Obstacle x positions (sorted); passing one cleanly is a dodge. */
  private readonly marks: number[];
  private next = 0;

  constructor(diff: ChaserDiff, marks: number[] = []) {
    this.diff = diff;
    this.marks = marks;
  }

  /** Advance one step. Returns what happened (for sounds and effects). */
  update(dt: number, runner: { x: number; y: number; mode: ShapeMode; gdir: number }): ChaserEvent | null {
    if (this.caught) return null;
    const T = CHASER_TUNING;
    this.time += dt;
    let ev: ChaserEvent | null = null;
    if (this.time > T.grace) this.gap -= T.creep[this.diff] * dt;
    const kind = chaserKindFor(runner.mode);
    if (kind !== this.kind) {
      this.kind = kind;
      this.morph = 0.5;
      ev = 'morph';
    }
    while (this.next < this.marks.length && runner.x > this.marks[this.next]) {
      this.next++;
      if (this.time - this.lastHit > 0.8) {
        const crept = T.creep[this.diff] * Math.max(0, this.time - Math.max(this.lastMark, T.grace));
        this.gap += Math.max(T.dodgeMin, crept * T.dodge);
        this.shove = 0.35;
        ev ??= 'shove';
      }
      this.lastMark = this.time;
    }
    this.gap = Math.min(T.max, this.gap);
    this.x = runner.x - this.gap;
    // Ghosts drift after your height; zombies stick to the floor (or the ceiling with the Roller).
    const groundY = runner.gdir > 0 ? 8 - 0.6 : 0.6;
    const targetY = this.kind === 'ghost' ? runner.y + Math.sin(this.time * 2.4) * 0.35 : groundY;
    if (this.time <= dt) this.y = targetY;
    this.y += (targetY - this.y) * Math.min(1, dt * (this.kind === 'ghost' ? 2.6 : 9));
    this.flip += ((runner.gdir > 0 && this.kind === 'zombie' ? 1 : 0) - this.flip) * Math.min(1, dt * 8);
    this.lunge = Math.max(0, this.lunge - dt);
    this.shove = Math.max(0, this.shove - dt);
    this.morph = Math.max(0, this.morph - dt);
    this.danger = Math.max(0, Math.min(1, (T.start - this.gap) / (T.start - T.catchAt)));
    if (this.gap <= T.catchAt) {
      this.caught = true;
      return 'caught';
    }
    if (this.gap < T.warnAt && !this.warned) {
      this.warned = true;
      ev = 'warn';
    } else if (this.gap > T.warnAt + 0.6) this.warned = false;
    return ev;
  }

  /** A gem grabbed: shove it back. */
  onGem(value: number): ChaserEvent {
    this.gap = Math.min(CHASER_TUNING.max, this.gap + (value > 1 ? CHASER_TUNING.bigGem : CHASER_TUNING.gem));
    this.shove = 0.35;
    return 'shove';
  }

  /** A bump (with hearts left): it lunges. */
  onHit(): ChaserEvent {
    this.gap -= CHASER_TUNING.hit;
    this.lunge = 0.6;
    this.lastHit = this.time;
    return 'lunge';
  }
}
