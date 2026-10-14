import { Rng } from '../core/rng';
import { CEIL, DT } from './constants';

const MID = CEIL / 2;
import { cloneBody, newEvents, stepBody, type Body } from './physics';
import type { World, WorldObj } from './world';

/** Steps per decision (decisions run at 30 Hz). */
const G = 4;
/** Look-ahead horizon in decisions (~1.25 s, about what a player sees on screen). */
const DEPTH = Math.ceil(1.25 / (G * DT));
const BUDGET = 700;

export interface BotOptions {
  /** 0..1 — higher makes fewer timing mistakes. 1 = perfect. */
  skill: number;
  seed: number;
  /** Hazard inflation used when planning (safety margin). */
  margin?: number;
}

/**
 * CPU racer brain. Every decision it searches press/release sequences with the
 * real physics (depth-first, memoised, budget-capped) and follows the first
 * plan that survives the horizon. Skill controls how often it fumbles a press.
 */
export class BotBrain {
  private rng: Rng;
  private plan: boolean[] = [];
  private tick = 0;
  private current = false;
  private delay = 0;
  private flipLeft = 0;
  private readonly ev = newEvents();
  private readonly near: WorldObj[] = [];
  skill: number;
  margin: number;
  /** Last search outcome (for tests/debug). */
  lastSearchOk = true;

  constructor(opts: BotOptions) {
    this.skill = opts.skill;
    this.margin = opts.margin ?? 0.04;
    this.rng = new Rng(opts.seed);
  }

  reset(): void {
    this.plan = [];
    this.tick = 0;
    this.current = false;
    this.delay = 0;
    this.flipLeft = 0;
  }

  /**
   * Called every physics step. Returns whether the button is held.
   * `speed` may be a function of x so look-ahead matches the real speed curve.
   */
  update(body: Body, world: World, speed: number | ((x: number) => number)): boolean {
    if (this.tick % G === 0) this.decide(body, world, speed);
    this.tick++;
    return this.current;
  }

  private decide(body: Body, world: World, speed: number | ((x: number) => number)): void {
    const v = typeof speed === 'number' ? speed : speed(body.x);
    if (body.mode === 'triangle' || body.mode === 'diamond') this.target = this.findTarget(body, world, v);
    const prefer = this.plan.length > 1 ? this.plan[1] : this.current;
    const plan = this.search(body, world, speed, prefer);
    this.plan = plan;
    let want = plan[0] ?? false;

    // ---- human-like mistakes
    const missChance = (1 - this.skill) * 0.33;
    if (this.delay > 0) {
      this.delay--;
      want = false;
    } else if (want && !this.current && body.mode !== 'triangle' && this.rng.chance(missChance)) {
      // Late press.
      this.delay = this.rng.int(1, 4);
      want = false;
    }
    if (body.mode === 'triangle') {
      if (this.flipLeft > 0) {
        this.flipLeft--;
        want = !want;
      } else if (this.rng.chance(missChance * 0.06)) {
        this.flipLeft = this.rng.int(2, 4);
      }
    }
    this.current = want;
  }

  /** Which action to try first: fliers steer for the next gap, tappers stay lazy. */
  private preferred(b: Body, prev: boolean): boolean {
    const predicted = b.y + b.vy * 0.12;
    switch (b.mode) {
      case 'triangle':
        if (predicted > this.target + 0.3) return false;
        if (predicted < this.target - 0.3) return true;
        return prev;
      case 'diamond':
        return predicted < this.target - 0.9 && b.vy <= 1;
      default:
        return false;
    }
  }

  /** Middle of the next opening ahead (fliers aim for it). */
  private findTarget(b: Body, world: World, speed: number): number {
    let gapLo = 0;
    let gapHi = CEIL;
    let column = Infinity;
    world.each(b.x + 0.2, b.x + speed * 1.1, (o) => {
      if (o.kind === 'solid' && o.role === 'block' && o.x1 > b.x + 0.2 && o.x0 <= column + 0.6) {
        if (o.x0 < column - 0.6) {
          column = o.x0;
          gapLo = 0;
          gapHi = CEIL;
        }
        if (o.y0 <= 0.5) gapLo = Math.max(gapLo, o.y1);
        else if (o.y1 >= CEIL - 0.5) gapHi = Math.min(gapHi, o.y0);
      }
    });
    if (column < Infinity) return (gapLo + gapHi) / 2;
    let saw = Infinity;
    let target = MID;
    world.each(b.x + 0.2, b.x + speed * 0.9, (o) => {
      if (o.kind === 'saw' && o.x < saw) {
        saw = o.x;
        target = o.y < MID ? Math.min(CEIL - 1.2, o.y + o.r + 1.8) : Math.max(1.2, o.y - o.r - 1.8);
      }
    });
    return target;
  }

  private target = MID;

  /** Can pressing now change anything? (Prunes useless branches.) */
  private pressMatters(b: Body, world: World): boolean {
    if (b.mode === 'triangle' || b.mode === 'diamond') return true;
    if (b.grounded || b.t - b.lastGround <= 0.08) return true;
    if (b.mode === 'square') {
      let orb = false;
      world.each(b.x - 1, b.x + 1.5, (o) => {
        if (o.kind === 'orb' && Math.abs(o.y - b.y) < 1.6) orb = true;
      });
      if (orb) return true;
      // About to land: a buffered press would jump on touchdown.
      return b.vy * b.gdir > 0 && b.y < 4;
    }
    return false;
  }

  /** Depth-first search for a surviving press/release sequence. */
  search(start: Body, world: World, speed: number | ((x: number) => number), preferFirst: boolean): boolean[] {
    const path: boolean[] = new Array(DEPTH).fill(false);
    const bestPath: boolean[] = [];
    let bestDepth = -1;
    let budget = BUDGET;
    const visited = new Set<string>();
    const speedFn = typeof speed === 'number' ? () => speed : speed;
    const opts = { speed: 0, ghost: false, inflate: this.margin };

    const simulate = (b: Body, held: boolean): boolean => {
      for (let i = 0; i < G; i++) {
        opts.speed = speedFn(b.x);
        stepBody(b, held, world, opts, this.ev, this.near);
        if (this.ev.hit || this.ev.fell) return false;
      }
      return true;
    };

    const dfs = (b: Body, depth: number, prev: boolean): boolean => {
      if (depth >= DEPTH) return true;
      if (--budget < 0) return false; // out of time: fall back to the longest survivor
      const key = `${depth}|${Math.round(b.y * 16)}|${Math.round(b.vy * 2)}|${b.gdir}|${b.mode}|${b.grounded ? 1 : 0}|${b.held ? 1 : 0}`;
      if (visited.has(key)) return false;
      visited.add(key);
      const first = depth === 0 && this.plan.length > 1 ? preferFirst : this.preferred(b, prev);
      const actions = this.pressMatters(b, world) ? [first, !first] : [b.held && b.mode === 'square' ? b.held : false];
      for (const action of actions) {
        const nb = cloneBody(b);
        if (!simulate(nb, action)) continue;
        path[depth] = action;
        if (depth > bestDepth) {
          bestDepth = depth;
          bestPath.length = 0;
          for (let i = 0; i <= depth; i++) bestPath.push(path[i]);
        }
        if (dfs(nb, depth + 1, action)) return true;
      }
      return false;
    };

    const ok = dfs(cloneBody(start), 0, preferFirst);
    this.lastSearchOk = ok;
    return ok ? path.slice() : bestPath.length ? bestPath : [false];
  }
}
