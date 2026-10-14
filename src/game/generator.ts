import { Rng } from '../core/rng';
import { CEIL, JUMP_TIME, RACE_SPEED, endlessSpeedAt, smoothstep } from './constants';
import type { ShapeMode } from './shapes';
import type { PickupType, SolidRole, World, WorldObj } from './world';
import { MAX_OBJ_W } from './world';

export interface GenOptions {
  seed: number;
  kind: 'endless' | 'race';
  /** Race finish line distance. */
  length?: number;
  kid?: boolean;
  /** Add onboarding hints (first runs). */
  tutorial?: boolean;
  /** Race difficulty 0..1 (endless ramps with distance). */
  difficulty?: number;
  /** Player start x. */
  startX?: number;
}

interface Pattern {
  id: string;
  mode: ShapeMode;
  minD: number;
  maxD?: number;
  weight: (d: number) => number;
  run: (g: LevelGen) => void;
}

const MID = CEIL / 2;

/**
 * Procedural, seeded, chunk-based level generator. The same seed always
 * produces the same track, which is what lets races and online rooms share a
 * course without sending it over the network.
 */
export class LevelGen {
  readonly rng: Rng;
  readonly opts: GenOptions;
  readonly world: World;
  /** Generation cursor. */
  x: number;
  mode: ShapeMode = 'square';
  private sectionEnd: number;
  private groundFrom: number;
  private ceilFrom: number | null = null;
  private pending: WorldObj[] = [];
  /** Roller: which surface the player is expected to be on (-1 floor, 1 ceiling). */
  side: -1 | 1 = -1;
  private nextPickup: number;
  private nextBox: number;
  private pickupCycle = 0;
  private finished = false;
  private tutorialStep = 0;
  private lastPattern = '';
  patternsPlaced = 0;

  constructor(world: World, opts: GenOptions) {
    this.world = world;
    this.opts = opts;
    this.rng = new Rng(opts.seed);
    const start = opts.startX ?? 0;
    this.groundFrom = start - 12;
    this.x = start + (opts.kind === 'race' ? 18 : 14);
    this.sectionEnd = opts.kind === 'race' ? this.x + this.rng.range(150, 200) : 240 + this.rng.range(0, 60);
    this.nextPickup = opts.kind === 'endless' ? 160 + this.rng.range(0, 80) : Infinity;
    this.nextBox = opts.kind === 'race' ? this.x + 30 : Infinity;
    world.sections.push({ x0: -Infinity, x1: Infinity, mode: 'square', ceiling: false });
    if (opts.kind === 'race' && opts.length) world.finishX = opts.length;
    // Opening runway with a few welcoming gems.
    this.gemLine(start + 5, this.x - 1, 1.1, 1.5);
    this.flush();
  }

  // ------------------------------------------------------------------ tuning
  speedAt(x: number): number {
    return this.opts.kind === 'race' ? RACE_SPEED : endlessSpeedAt(Math.max(0, x), !!this.opts.kid);
  }

  difficultyAt(x: number): number {
    if (this.opts.difficulty !== undefined) return this.opts.difficulty;
    const d = smoothstep(150, 5200, x);
    return this.opts.kid ? d * 0.7 : d;
  }

  /** Horizontal distance of a normal square jump at x. */
  jumpLen(x = this.x): number {
    return this.speedAt(x) * JUMP_TIME;
  }

  get v(): number {
    return this.speedAt(this.x);
  }

  get d(): number {
    return this.difficultyAt(this.x);
  }

  // ------------------------------------------------------------------ main
  /** Generate track until at least `untilX`. */
  ensure(untilX: number): void {
    let guard = 0;
    while (!this.finished && this.x < untilX && guard++ < 500) {
      this.chunk();
    }
  }

  private chunk(): void {
    const race = this.opts.kind === 'race';
    if (race && this.opts.length && this.x >= this.opts.length - 30) {
      this.finishLine();
      return;
    }
    if (this.x >= this.sectionEnd) {
      this.transition();
      this.flush();
      return;
    }
    const p = this.pickPattern();
    this.lastPattern = p.id;
    p.run(this);
    this.patternsPlaced++;
    this.runway();
    this.flush();
  }

  private pickPattern(): Pattern {
    const d = this.d;
    if (this.opts.tutorial && this.mode === 'square' && this.tutorialStep < TUTORIAL.length) {
      const id = TUTORIAL[this.tutorialStep++];
      return PATTERNS.find((p) => p.id === id)!;
    }
    const fits = (p: Pattern) => p.mode === this.mode && d >= p.minD && (p.maxD === undefined || d <= p.maxD);
    let pool = PATTERNS.filter((p) => fits(p) && p.id !== this.lastPattern);
    if (!pool.length) pool = PATTERNS.filter(fits);
    return this.rng.weighted(pool, (p) => p.weight(d));
  }

  /** Breathing room between patterns, sometimes with gems / pickups / boxes. */
  private runway(): void {
    const v = this.v;
    const d = this.d;
    const tutorial = this.opts.tutorial && this.tutorialStep <= TUTORIAL.length;
    const secs = this.rng.range(0.42, 0.75) * (1.25 - 0.45 * d) * (tutorial ? 1.6 : 1) * (this.opts.kid ? 1.25 : 1);
    const len = Math.max(3, v * secs);
    const x0 = this.x;
    const midY = this.mode === 'square' ? 1.0 : this.mode === 'hexagon' ? (this.side < 0 ? 0.5 : CEIL - 0.5) : MID;
    if (x0 >= this.nextPickup && len >= 4) {
      const types: PickupType[] = this.opts.kid ? ['shield', 'heart', 'magnet'] : ['shield', 'magnet', 'shield', 'heart', 'magnet'];
      const t = types[this.pickupCycle++ % types.length];
      this.pickup(x0 + len / 2, this.mode === 'square' ? 1.3 : midY, t);
      this.nextPickup = x0 + this.rng.range(230, 380);
    } else if (x0 >= this.nextBox && len >= 3.5) {
      this.box(x0 + len / 2, this.mode === 'square' ? 0.9 : midY);
      this.nextBox = x0 + this.rng.range(60, 85);
    } else if (this.rng.chance(0.35)) {
      this.gemLine(x0 + 1, x0 + len - 1, midY, 1.2);
    }
    this.x += len;
  }

  private transition(force?: ShapeMode): void {
    const prev = this.mode;
    const next = force ?? this.pickNextMode(prev);
    const v = this.v;
    const px = this.x + 3;
    this.portal(px, next);
    if (next !== 'square' && this.ceilFrom === null) {
      this.ceilFrom = px - 1.5;
    }
    if (next === 'square' && this.ceilFrom !== null) {
      this.emitCeil(this.ceilFrom, px + 1.5);
      this.ceilFrom = null;
    }
    const secs = this.world.sections;
    secs[secs.length - 1].x1 = px;
    secs.push({ x0: px, x1: Infinity, mode: next, ceiling: next !== 'square' });
    this.mode = next;
    this.side = -1;
    // Settle-in runway after the portal.
    const settle = v * (next === 'square' ? 1.3 : 1.0);
    if (next === 'triangle' || next === 'diamond') this.gemLine(px + 2, px + settle, MID - 1, 1.3);
    this.x = px + settle;
    const race = this.opts.kind === 'race';
    const span = next === 'square' ? (race ? this.rng.range(110, 170) : this.rng.range(220, 360)) : race ? this.rng.range(100, 150) : this.rng.range(140, 230);
    this.sectionEnd = this.x + span;
  }

  private pickNextMode(prev: ShapeMode): ShapeMode {
    if (prev !== 'square' && this.rng.chance(0.5)) return 'square';
    const options: ShapeMode[] = (['square', 'triangle', 'hexagon', 'diamond'] as ShapeMode[]).filter((m) => m !== prev);
    return this.rng.weighted(options, (m) => (m === 'square' ? 1.4 : 1));
  }

  private finishLine(): void {
    const fx = this.opts.length!;
    // Flat stretch into the finish and well beyond it.
    if (this.mode !== 'square') {
      this.transition('square');
      this.flush();
    }
    this.x = Math.max(this.x, fx - 25);
    this.gemLine(this.x + 2, fx - 2, 1.1, 2);
    this.pending.push({ id: this.world.newId(), kind: 'finish', x: fx, x0: fx - 0.5, x1: fx + 0.5, y0: 0, y1: CEIL });
    this.x = fx + 120;
    this.flush();
    this.finished = true;
    this.world.generatedTo = Infinity;
  }

  /** Emit ground/ceiling up to the cursor and publish the chunk. */
  private flush(): void {
    if (this.groundFrom < this.x) {
      this.emitGround(this.groundFrom, this.x);
      this.groundFrom = this.x;
    }
    if (this.ceilFrom !== null && this.ceilFrom < this.x) {
      this.emitCeil(this.ceilFrom, this.x);
      this.ceilFrom = this.x;
    }
    this.world.appendSorted(this.pending);
    this.pending = [];
    this.world.generatedTo = Math.max(this.world.generatedTo, this.x);
  }

  // ------------------------------------------------------------------ primitives
  private emitGround(x0: number, x1: number): void {
    this.solidSplit(x0, -4, x1, 0, 'ground');
  }

  private emitCeil(x0: number, x1: number): void {
    this.solidSplit(x0, CEIL, x1, CEIL + 4, 'ceil');
  }

  private solidSplit(x0: number, y0: number, x1: number, y1: number, role: SolidRole): void {
    let a = x0;
    while (a < x1 - 1e-6) {
      const b = Math.min(x1, a + MAX_OBJ_W);
      this.pending.push({ id: this.world.newId(), kind: 'solid', role, x0: a, x1: b, y0, y1 });
      a = b;
    }
  }

  block(x0: number, y0: number, w: number, h: number, role: SolidRole = 'block'): void {
    this.solidSplit(x0, y0, x0 + w, y0 + h, role);
  }

  /** Remove the floor in [x0, x0 + w). */
  pit(x0: number, w: number): void {
    if (x0 > this.groundFrom) this.emitGround(this.groundFrom, x0);
    this.groundFrom = Math.max(this.groundFrom, x0 + w);
  }

  spike(x: number, dir: 1 | -1 = 1, y?: number, size = 1): void {
    const by = y ?? (dir > 0 ? 0 : CEIL);
    const h = size;
    this.pending.push({
      id: this.world.newId(),
      kind: 'spike',
      x,
      y: by,
      dir,
      size,
      x0: x - 0.5 * size,
      x1: x + 0.5 * size,
      y0: dir > 0 ? by : by - h,
      y1: dir > 0 ? by + h : by,
    });
  }

  spikeRow(x0: number, n: number, dir: 1 | -1 = 1, y?: number): void {
    for (let i = 0; i < n; i++) this.spike(x0 + 0.5 + i, dir, y);
  }

  saw(x: number, y: number, r: number): void {
    this.pending.push({ id: this.world.newId(), kind: 'saw', x, y, r, x0: x - r, x1: x + r, y0: y - r, y1: y + r });
  }

  gem(x: number, y: number, big = false): void {
    this.pending.push({ id: this.world.newId(), kind: 'gem', x, y, big, x0: x - 0.4, x1: x + 0.4, y0: y - 0.4, y1: y + 0.4 });
  }

  gemLine(x0: number, x1: number, y: number, step = 1.2): void {
    for (let x = x0; x <= x1; x += step) this.gem(x, y);
  }

  /** Gems along a jump arc from x0 spanning `w`, peaking at `peak` above `y0`. */
  gemArc(x0: number, w: number, y0: number, peak: number, n = 5, dir: 1 | -1 = 1): void {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      this.gem(x0 + w * t, y0 + dir * peak * 4 * t * (1 - t));
    }
  }

  pad(x: number, y = 0, dir: 1 | -1 = 1): void {
    this.pending.push({ id: this.world.newId(), kind: 'pad', x, y, dir, x0: x - 0.5, x1: x + 0.5, y0: dir > 0 ? y : y - 0.3, y1: dir > 0 ? y + 0.3 : y });
  }

  orb(x: number, y: number): void {
    this.pending.push({ id: this.world.newId(), kind: 'orb', x, y, x0: x - 0.6, x1: x + 0.6, y0: y - 0.6, y1: y + 0.6 });
  }

  portal(x: number, mode: ShapeMode): void {
    this.pending.push({ id: this.world.newId(), kind: 'portal', x, y: MID, mode, x0: x - 0.6, x1: x + 0.6, y0: 0, y1: CEIL });
  }

  pickup(x: number, y: number, type: PickupType): void {
    this.pending.push({ id: this.world.newId(), kind: 'pickup', x, y, type, x0: x - 0.5, x1: x + 0.5, y0: y - 0.5, y1: y + 0.5 });
  }

  box(x: number, y: number): void {
    this.pending.push({ id: this.world.newId(), kind: 'box', x, y, x0: x - 0.55, x1: x + 0.55, y0: y - 0.55, y1: y + 0.55 });
  }

  hint(x: number, key: string, text: string, sub = ''): void {
    this.pending.push({ id: this.world.newId(), kind: 'hint', x, x0: x, x1: x, y0: 0, y1: 0, text, sub, key });
  }
}

// ==================================================================== patterns
const w = (base: number, grow = 0) => (d: number) => Math.max(0.05, base + grow * d);

const TUTORIAL = ['sq_single', 'sq_block', 'sq_single', 'sq_pit', 'sq_double', 'sq_block', 'sq_pit'];

const PATTERNS: Pattern[] = [
  // ------------------------------------------------------------ Jumper (square)
  {
    id: 'sq_single',
    mode: 'square',
    minD: 0,
    weight: w(1.4, -0.9),
    run: (g) => {
      const x = g.x + 1;
      if (g.opts.tutorial && g.patternsPlaced === 0) g.hint(x, 'tap_jump', 'TAP to jump!', 'Hop over the spikes');
      g.spike(x);
      g.gemArc(x - g.jumpLen() / 2, g.jumpLen(), 0.9, 1.9, 4);
      g.x = x + 1.5;
    },
  },
  {
    id: 'sq_double',
    mode: 'square',
    minD: 0.06,
    weight: w(1, 0.2),
    run: (g) => {
      const x = g.x + 1;
      g.spikeRow(x, 2);
      g.gemArc(x + 1 - g.jumpLen() / 2, g.jumpLen(), 0.9, 1.9, 5);
      g.x = x + 2.5;
    },
  },
  {
    id: 'sq_triple',
    mode: 'square',
    minD: 0.42,
    weight: w(0.2, 0.9),
    run: (g) => {
      if (g.v < 9.8) {
        g.spikeRow(g.x + 1, 2);
        g.x += 3.5;
        return;
      }
      const x = g.x + 1;
      g.spikeRow(x, 3);
      g.gem(x + 1.5, 2.6, true);
      g.x = x + 3.5;
    },
  },
  {
    id: 'sq_rhythm',
    mode: 'square',
    minD: 0.28,
    weight: w(0.3, 0.7),
    run: (g) => {
      // Spikes spaced one jump apart: hold to bounce through.
      const n = g.rng.int(3, 4);
      const gap = g.jumpLen() * 1.12 + 0.6;
      g.hint(g.x + 1, 'hold_bounce', 'HOLD to keep jumping!', '');
      for (let i = 0; i < n; i++) {
        const x = g.x + 1 + i * gap;
        g.spike(x);
        g.gem(x, 2.4);
      }
      g.x += 1 + (n - 1) * gap + 1.5;
    },
  },
  {
    id: 'sq_block',
    mode: 'square',
    minD: 0,
    weight: w(1.1, -0.4),
    run: (g) => {
      const bw = g.rng.int(2, 4);
      const x = g.x + 1;
      g.block(x, 0, bw, 1);
      g.gemLine(x + 0.5, x + bw - 0.5, 1.9, 1);
      g.x = x + bw + 0.5;
    },
  },
  {
    id: 'sq_steps',
    mode: 'square',
    minD: 0.12,
    weight: w(0.8, 0.2),
    run: (g) => {
      // A jump that lands one step higher covers ~0.88 J. Steps at least that
      // long mean "land, jump again" never drifts off the end of a step.
      const J = g.jumpLen();
      const x = g.x + 1;
      const s1 = Math.max(3, J * g.rng.range(0.95, 1.1));
      const s2 = Math.max(3, J * g.rng.range(0.95, 1.1));
      const s3 = Math.max(3, J * g.rng.range(0.7, 0.95));
      g.block(x, 0, s1, 1);
      g.block(x + s1, 0, s2, 2);
      const tall = g.d > 0.3;
      g.block(x + s1 + s2, 0, s3, tall ? 3 : 2);
      g.gem(x + s1 + s2 + s3 / 2, tall ? 4.2 : 3.2, g.d > 0.3);
      let end = x + s1 + s2 + s3;
      if (g.d > 0.5 && g.rng.chance(0.5)) {
        // Spike waiting after the drop (time to land, then hop it).
        g.spike(end + g.v * 0.8);
        end += g.v * 0.8 + 1;
      }
      g.x = end + 0.5;
    },
  },
  {
    id: 'sq_pit',
    mode: 'square',
    minD: 0,
    weight: w(1, 0.2),
    run: (g) => {
      const J = g.jumpLen();
      const width = Math.min(J * 0.68 + 0.4, 2 + g.d * 1.8 + g.rng.range(0, 0.6));
      const x = g.x + 1;
      if (g.opts.tutorial && g.patternsPlaced === 3) g.hint(x, 'jump_gap', 'Jump the gaps!', 'Falling costs a heart');
      g.pit(x, width);
      g.gemArc(x + width / 2 - J / 2, J, 0.9, 1.9, 5);
      g.x = x + width + 0.5;
    },
  },
  {
    id: 'sq_platforms',
    mode: 'square',
    minD: 0.18,
    weight: w(0.7, 0.4),
    run: (g) => {
      // Floating platforms over a pit, sized from the jump length so the
      // natural rhythm (jump near the end of each platform) always works.
      // One platform + one gap is slightly MORE than one jump, so each
      // landing drifts earlier (you can always wait) rather than later
      // (which would eventually force an overshoot).
      const J = g.jumpLen();
      const n = g.rng.int(2, 4);
      const top = 1;
      const start = g.x + 1;
      const period = J * g.rng.range(1.04, 1.12);
      const gap = Math.min(2.4, period * 0.32);
      const pw = period - gap;
      let x = start + gap;
      for (let i = 0; i < n; i++) {
        g.block(x, top - 0.5, pw, 0.5, 'platform');
        g.gem(x + pw / 2, top + 0.8);
        x += pw;
        if (i < n - 1) x += gap;
      }
      const end = x + gap;
      g.pit(start, end - start);
      g.x = end + 0.5;
    },
  },
  {
    id: 'sq_pad_wall',
    mode: 'square',
    minD: 0.16,
    weight: w(0.6, 0.3),
    run: (g) => {
      const x = g.x + 1;
      g.hint(x, 'pad', 'Yellow pads launch you!', '');
      g.pad(x + 0.5);
      const wh = g.d > 0.45 && g.rng.chance(0.5) ? 4 : 3;
      const wallX = x + 0.5 + 0.6 + g.v * (wh === 4 ? 0.36 : 0.26);
      const ww = g.rng.int(2, 4);
      g.block(wallX, 0, ww, wh);
      g.gemArc(x + 0.5, wallX + ww - x, 1, wh + 0.8, 5);
      g.x = wallX + ww + 0.5;
    },
  },
  {
    id: 'sq_orb',
    mode: 'square',
    minD: 0.32,
    weight: w(0.3, 0.6),
    run: (g) => {
      const J = g.jumpLen();
      const width = J * 1.45;
      const x = g.x + 1;
      g.hint(x, 'orb', 'Tap in the air on yellow rings!', 'They give an extra jump');
      g.pit(x, width);
      const orbX = x + J * 0.62;
      g.orb(orbX, 2.3);
      g.gemArc(orbX, J, 2.3, 1.8, 4);
      g.x = x + width + 0.5;
    },
  },
  {
    id: 'sq_block_spike',
    mode: 'square',
    minD: 0.36,
    weight: w(0.2, 0.7),
    run: (g) => {
      // Land on the row first, then hop the spike on top.
      const J = g.jumpLen();
      const x = g.x + 1;
      const spikeAt = x + J * 1.15 + 0.6;
      const len = spikeAt - x + J * 0.75 + 1;
      g.block(x, 0, len, 1);
      g.spike(spikeAt, 1, 1);
      g.gem(spikeAt, 3.3, true);
      g.x = x + len + 0.5;
    },
  },
  {
    id: 'sq_spike_pit',
    mode: 'square',
    minD: 0.5,
    weight: w(0.1, 0.6),
    run: (g) => {
      const J = g.jumpLen();
      const x = g.x + 1;
      g.spike(x);
      const pw = Math.min(J * 0.5, 2.2);
      g.pit(x + 1, pw);
      g.gemArc(x - 0.5, J, 0.9, 2, 4);
      g.x = x + 1 + pw + 0.5;
    },
  },
  {
    id: 'sq_breather',
    mode: 'square',
    minD: 0,
    weight: w(0.6, -0.5),
    run: (g) => {
      const len = g.v * 0.8;
      g.gemLine(g.x + 1, g.x + len, 1.1, 1);
      g.x += len;
    },
  },

  // ------------------------------------------------------------ Roller (hexagon)
  {
    id: 'hx_open',
    mode: 'hexagon',
    minD: 0,
    weight: w(0.35, -0.25),
    run: (g) => {
      const len = g.v * 0.7;
      g.gemLine(g.x + 1, g.x + len, g.side < 0 ? 0.6 : CEIL - 0.6, 1.1);
      g.x += len;
    },
  },
  {
    id: 'hx_cluster',
    mode: 'hexagon',
    minD: 0,
    weight: w(1.2),
    run: (g) => {
      const n = g.rng.int(2, 3 + Math.round(g.d * 2));
      const x = g.x + g.v * 0.45;
      const dir: 1 | -1 = g.side < 0 ? 1 : -1;
      g.spikeRow(x, n, dir);
      g.gemLine(x, x + n, MID, 1);
      g.side = g.side < 0 ? 1 : -1;
      g.x = x + n + g.v * 0.55;
    },
  },
  {
    id: 'hx_zigzag',
    mode: 'hexagon',
    minD: 0.25,
    weight: w(0.4, 0.8),
    run: (g) => {
      const k = g.rng.int(2, 3);
      let x = g.x + g.v * 0.45;
      for (let i = 0; i < k; i++) {
        const n = g.rng.int(2, 4);
        const dir: 1 | -1 = g.side < 0 ? 1 : -1;
        g.spikeRow(x, n, dir);
        g.gem(x + n / 2, MID);
        g.side = g.side < 0 ? 1 : -1;
        x += n + g.v * (0.95 - g.d * 0.25);
      }
      g.x = x;
    },
  },
  {
    id: 'hx_block',
    mode: 'hexagon',
    minD: 0.15,
    weight: w(0.6, 0.2),
    run: (g) => {
      const x = g.x + g.v * 0.45;
      const bw = g.rng.int(2, 3);
      const h = g.rng.pick([1.5, 2]);
      if (g.side < 0) g.block(x, 0, bw, h);
      else g.block(x, CEIL - h, bw, h);
      g.gem(x + bw / 2, MID);
      g.side = g.side < 0 ? 1 : -1;
      g.x = x + bw + g.v * 0.55;
    },
  },
  {
    id: 'hx_pad',
    mode: 'hexagon',
    minD: 0.3,
    weight: w(0.25, 0.3),
    run: (g) => {
      // Pad on the current surface throws you to the other side.
      const x = g.x + 1.5;
      if (g.side < 0) g.pad(x, 0, 1);
      else g.pad(x, CEIL, -1);
      g.gemLine(x + 1, x + g.v * 0.4, MID, 1);
      g.side = g.side < 0 ? 1 : -1;
      g.x = x + g.v * 0.9;
    },
  },

  // ------------------------------------------------------------ Glider (triangle)
  {
    id: 'tr_open',
    mode: 'triangle',
    minD: 0,
    weight: w(0.35, -0.25),
    run: (g) => {
      const len = g.v * 0.8;
      g.gemArc(g.x + 1, len - 1, MID - 2, 4, 6);
      g.x += len;
    },
  },
  {
    id: 'tr_gates',
    mode: 'triangle',
    minD: 0,
    weight: w(1.3),
    run: (g) => {
      const n = g.rng.int(3, 5);
      const gap = 4.4 - g.d * 1.3;
      let c = MID + g.rng.range(-1.2, 1.2);
      let x = g.x + 2;
      const climb = (10.5 / g.v) * 0.5;
      for (let i = 0; i < n; i++) {
        const gw = g.rng.range(1, 2.2);
        const lo = c - gap / 2;
        const hi = c + gap / 2;
        if (lo > 0.4) g.block(x, 0, gw, lo);
        if (hi < CEIL - 0.4) g.block(x, hi, gw, CEIL - hi);
        g.gem(x + gw / 2, c);
        const dist = g.v * g.rng.range(0.7, 1.0);
        const maxShift = Math.min(2.6, dist * climb);
        c = Math.min(CEIL - 0.9 - gap / 2, Math.max(0.9 + gap / 2, c + g.rng.range(-maxShift, maxShift)));
        x += gw + dist;
      }
      g.x = x;
    },
  },
  {
    id: 'tr_saws',
    mode: 'triangle',
    minD: 0.25,
    weight: w(0.5, 0.5),
    run: (g) => {
      const n = g.rng.int(2, 4);
      let x = g.x + 3;
      let top = g.rng.chance(0.5);
      for (let i = 0; i < n; i++) {
        const r = g.rng.range(0.9, 1.3);
        const y = top ? CEIL - 1.6 - g.rng.range(0, 0.6) : 1.6 + g.rng.range(0, 0.6);
        g.saw(x, y, r);
        g.gem(x, top ? y - 3 : y + 3);
        top = !top;
        x += g.v * g.rng.range(0.6, 0.85);
      }
      g.x = x;
    },
  },
  {
    id: 'tr_tunnel',
    mode: 'triangle',
    minD: 0.4,
    weight: w(0.2, 0.6),
    run: (g) => {
      const len = g.rng.int(10, 16);
      const gap = 3.8 - g.d * 0.6;
      let c = MID;
      const slope = (10.5 / g.v) * 0.42;
      let x = g.x + 2;
      for (let i = 0; i < len; i++) {
        c = Math.min(CEIL - 0.6 - gap / 2, Math.max(0.6 + gap / 2, c + g.rng.range(-slope, slope)));
        g.block(x, 0, 1, c - gap / 2);
        g.block(x, c + gap / 2, 1, CEIL - (c + gap / 2));
        if (i % 2 === 0) g.gem(x + 0.5, c);
        x += 1;
      }
      g.x = x;
    },
  },

  // ------------------------------------------------------------ Hopper (diamond)
  {
    id: 'di_open',
    mode: 'diamond',
    minD: 0,
    weight: w(0.35, -0.25),
    run: (g) => {
      const len = g.v * 0.8;
      g.gemArc(g.x + 1, len - 1, 1.5, 3, 6);
      g.x += len;
    },
  },
  {
    id: 'di_gates',
    mode: 'diamond',
    minD: 0,
    weight: w(1.2),
    run: (g) => {
      const n = g.rng.int(3, 4);
      // Hops are coarse (~2 tiles each), so gates stay roomy even when fast.
      const gap = Math.max(4.3, 5.0 - g.d * 0.8);
      let c = MID + g.rng.range(-1, 0.6);
      let x = g.x + 2;
      for (let i = 0; i < n; i++) {
        const gw = g.rng.range(1, 1.8);
        const lo = c - gap / 2;
        const hi = c + gap / 2;
        if (lo > 0.4) g.block(x, 0, gw, lo);
        if (hi < CEIL - 0.4) g.block(x, hi, gw, CEIL - hi);
        g.gem(x + gw / 2, c);
        c = Math.min(CEIL - 1 - gap / 2, Math.max(1 + gap / 2, c + g.rng.range(-1.6, 1.6)));
        x += gw + g.v * g.rng.range(0.8, 1.05);
      }
      g.x = x;
    },
  },
  {
    id: 'di_spikefloor',
    mode: 'diamond',
    minD: 0.2,
    weight: w(0.5, 0.4),
    run: (g) => {
      const n = g.rng.int(5, 9);
      const x = g.x + 2;
      g.hint(x, 'keep_hopping', 'Keep hopping!', '');
      g.spikeRow(x, n, 1);
      if (g.d > 0.55) g.spikeRow(x + 1, n - 2, -1);
      g.gemLine(x + 0.5, x + n - 0.5, 2.6, 1.5);
      g.x = x + n + 2 + g.v * 0.5;
    },
  },
  {
    id: 'di_saws',
    mode: 'diamond',
    minD: 0.35,
    weight: w(0.3, 0.5),
    run: (g) => {
      const n = g.rng.int(2, 3);
      let x = g.x + 3;
      for (let i = 0; i < n; i++) {
        const low = g.rng.chance(0.5);
        g.saw(x, low ? 1.4 : CEIL - 1.4, 1.1);
        g.gem(x, low ? 4.6 : 3.2);
        x += g.v * 0.9;
      }
      g.x = x;
    },
  },
];

/** Exposed for tests. */
export const PATTERN_IDS = PATTERNS.map((p) => p.id);
