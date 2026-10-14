import { BotBrain } from './bot';
import { createBody, type Body } from './physics';
import type { ShapeMode } from './shapes';

export type RacerKind = 'human' | 'bot' | 'remote';

export interface RacerSpec {
  id: string;
  name: string;
  skin: string;
  trail?: string;
  kind: RacerKind;
  /** Bots only. */
  skill?: number;
  tag?: string;
}

/** Remote racer snapshot used for interpolation. */
export interface NetSample {
  at: number;
  x: number;
  y: number;
  rot: number;
  mode: ShapeMode;
  flags: number;
  speed: number;
}

export const FLAG = {
  invuln: 1,
  stun: 2,
  shield: 4,
  boost: 8,
  finished: 16,
  snow: 32,
  flipped: 64,
  magnet: 128,
} as const;

/** One participant: physics body + gameplay status + run stats. */
export class Racer {
  readonly id: string;
  readonly name: string;
  readonly skin: string;
  readonly trail: string;
  readonly kind: RacerKind;
  readonly tag: string;
  body: Body;
  bot: BotBrain | null = null;
  /** Input from the player (humans). */
  held = false;

  hearts = 3;
  maxHearts = 3;
  invuln = 0;
  stun = 0;
  shield = false;
  shieldTime = 0;
  magnet = 0;
  boost = 0;
  snow = 0;
  dead = false;
  finished = false;
  finishTime = 0;
  place = 0;
  /** Current horizontal speed (for rendering / net). */
  speed = 0;

  // Run stats
  gems = 0;
  jumps = 0;
  portals = 0;
  hits = 0;
  cleanFrom = 0;
  bestClean = 0;
  modeTime = 0;
  startX: number;
  collected = new Set<number>();
  seenHints = new Set<number>();

  // Visual state
  squash = 1;
  blinkTimer = 2 + Math.random() * 3;
  blink = 0;
  hitFlash = 0;

  // Remote interpolation
  samples: NetSample[] = [];

  constructor(spec: RacerSpec, x: number, seed: number) {
    this.id = spec.id;
    this.name = spec.name;
    this.skin = spec.skin;
    this.trail = spec.trail ?? 'none';
    this.kind = spec.kind;
    this.tag = spec.tag ?? '';
    this.body = createBody(x);
    this.startX = x;
    this.cleanFrom = x;
    if (spec.kind === 'bot') this.bot = new BotBrain({ skill: spec.skill ?? 0.7, seed });
  }

  get x(): number {
    return this.body.x;
  }

  get distance(): number {
    return Math.max(0, this.body.x - this.startX);
  }

  get ghost(): boolean {
    return this.invuln > 0 || this.boost > 0 || this.finished;
  }

  flags(): number {
    let f = 0;
    if (this.invuln > 0) f |= FLAG.invuln;
    if (this.stun > 0) f |= FLAG.stun;
    if (this.shield) f |= FLAG.shield;
    if (this.boost > 0) f |= FLAG.boost;
    if (this.finished) f |= FLAG.finished;
    if (this.snow > 0) f |= FLAG.snow;
    if (this.body.gdir > 0) f |= FLAG.flipped;
    if (this.magnet > 0) f |= FLAG.magnet;
    return f;
  }
}
