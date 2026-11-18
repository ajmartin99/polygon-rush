import type { ShapeMode } from './shapes';

/** Fixed simulation step (seconds). Everything is deterministic at this rate. */
export const DT = 1 / 120;

/** World units are "tiles". The floor surface is y = 0, the ceiling y = CEIL. */
export const FLOOR = 0;
export const CEIL = 8;
export const VIEW_BOTTOM = -1.4;
export const VIEW_TOP = 9.1;
export const VIEW_H = VIEW_TOP - VIEW_BOTTOM;

/** Player box used against solids, and the smaller (forgiving) box against hazards. */
export const PLAYER_HALF = 0.43;
export const HAZARD_HALF = 0.27;

/** Seconds of "late jump" allowed after running off a ledge. */
export const COYOTE = 0.08;
/** Seconds a tap is remembered before landing. */
export const BUFFER = 0.12;
/** Feet within this distance of a ledge top snap up onto it instead of bumping. */
export const STEP_UP = 0.24;

export interface ModePhysics {
  gravity: number;
  maxFall: number;
  jump: number;
  pad: number;
  orb: number;
  /** Glider thrust (triangle) */
  thrust: number;
  maxRise: number;
}

export const PHYS: Record<ShapeMode, ModePhysics> = {
  // Jumper: tap to jump (~2.3 tiles high, ~0.5 s air time).
  square: { gravity: 74, maxFall: 26, jump: 18.6, pad: 26.5, orb: 18.6, thrust: 0, maxRise: 30 },
  // Glider: hold to climb, release to dive.
  triangle: { gravity: 0, maxFall: 10.5, jump: 0, pad: 0, orb: 0, thrust: 54, maxRise: 10.5 },
  // Roller: tap to flip gravity.
  hexagon: { gravity: 64, maxFall: 19, jump: 0, pad: 22, orb: 0, thrust: 0, maxRise: 19 },
  // Hopper: tap for a little hop, gentle gravity.
  diamond: { gravity: 46, maxFall: 14, jump: 13.6, pad: 0, orb: 0, thrust: 0, maxRise: 20 },
};

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
/**
 * Endless curves. 'run' is the game's one mode: it starts gentle and gets
 * harder level by level (see runTier). The three fixed difficulties remain
 * for tests and tools.
 */
export type Tuning = Difficulty | 'run';

/** Endless levels 1-2 play like Easy, 3-5 like Normal and 6 onward like Extreme. */
export function runTier(levelIndex: number): Difficulty {
  return levelIndex < 2 ? 'easy' : levelIndex < 5 ? 'medium' : 'hard';
}

export interface EndlessTuning {
  /** Speed (tiles / second) at the start, at full ramp, and the distance of the ramp. */
  speedStart: number;
  speedMax: number;
  speedRamp: number;
  /** Pattern difficulty 0..1 = base + scale * smoothstep(from, to, distance). */
  dBase: number;
  dScale: number;
  dFrom: number;
  dTo: number;
  /** Multiplier on breathing room between patterns. */
  runway: number;
  /** Hearts for an Endless run (Kid Mode always gives 5). */
  hearts: number;
}

export const ENDLESS_TUNING: Record<Tuning, EndlessTuning> = {
  run: { speedStart: 8.0, speedMax: 14.0, speedRamp: 8500, dBase: 0, dScale: 1, dFrom: 150, dTo: 7000, runway: 1, hearts: 3 },
  easy: { speedStart: 8.0, speedMax: 11.4, speedRamp: 5000, dBase: 0, dScale: 0.75, dFrom: 200, dTo: 6000, runway: 1.18, hearts: 4 },
  medium: { speedStart: 8.6, speedMax: 12.8, speedRamp: 3600, dBase: 0, dScale: 1, dFrom: 120, dTo: 4000, runway: 1, hearts: 3 },
  hard: { speedStart: 9.6, speedMax: 14.2, speedRamp: 4000, dBase: 0.3, dScale: 0.7, dFrom: 0, dTo: 2200, runway: 0.84, hearts: 3 },
};

/**
 * Heat: how chaotic Endless gets past the normal difficulty curve, like a
 * run in Jetpack Joyride. It unlocks moving hazards and tougher patterns,
 * chains patterns back to back, shortens breathers and shifts shapes more
 * often. Easy (kid friendly) barely heats up; Extreme keeps climbing.
 */
const HEAT: Record<Tuning, { max: number; from: number; to: number; speed: number }> = {
  run: { max: 1, from: 4500, to: 11000, speed: 1.2 },
  easy: { max: 0.2, from: 3000, to: 9000, speed: 0 },
  medium: { max: 0.7, from: 1500, to: 7000, speed: 0.8 },
  hard: { max: 1, from: 400, to: 4500, speed: 1.2 },
};

export function endlessHeatAt(x: number, kid: boolean, diff: Tuning = 'run'): number {
  const h = HEAT[diff];
  const v = h.max * smoothstep(h.from, h.to, x);
  return kid ? v * 0.4 : v;
}


export const ENDLESS_SPEED_START = ENDLESS_TUNING.medium.speedStart;
export const ENDLESS_SPEED_MAX = ENDLESS_TUNING.medium.speedMax;
export const KID_SPEED_FACTOR = 0.86;
export const RACE_SPEED = 10.2;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function endlessSpeedAt(x: number, kid: boolean, diff: Tuning = 'run'): number {
  const k = ENDLESS_TUNING[diff];
  // Past the normal ramp, heat keeps adding speed.
  const v = k.speedStart + (k.speedMax - k.speedStart) * smoothstep(0, k.speedRamp, x) + HEAT[diff].speed * endlessHeatAt(x, false, diff);
  return kid ? v * KID_SPEED_FACTOR : v;
}

export function endlessDifficultyAt(x: number, kid: boolean, diff: Tuning = 'run'): number {
  const k = ENDLESS_TUNING[diff];
  const d = Math.min(1, k.dBase + k.dScale * smoothstep(k.dFrom, k.dTo, x));
  return kid ? d * 0.7 : d;
}

/** Breathing room between patterns: the one mode starts roomy and tightens as the run goes on. */
export function endlessRunwayAt(x: number, diff: Tuning = 'run'): number {
  return diff === 'run' ? 1.18 - 0.34 * smoothstep(0, 7000, x) : ENDLESS_TUNING[diff].runway;
}

/** Air time of a standard square jump at normal gravity. */
export const JUMP_TIME = (2 * PHYS.square.jump) / PHYS.square.gravity;

export const MODE_INDEX: ShapeMode[] = ['square', 'triangle', 'hexagon', 'diamond'];
