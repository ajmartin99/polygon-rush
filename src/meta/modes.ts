import { LEVEL_NOMINAL } from '../game/levels';
import type { Settings } from '../state/save';
import { endlessBestKey } from '../state/save';

/**
 * Ways to play an Endless track:
 *  - classic: the normal run at your difficulty;
 *  - daily:   one seeded course per day, the same for everyone, no revive;
 *  - oneheart: one bump and it's over, no heart pickups, no revive;
 *  - gemrush: 60 seconds to grab as many gems as you can (bumps only stun).
 */
export type EndlessVariant = 'classic' | 'daily' | 'oneheart' | 'gemrush' | 'lightsout' | 'rhythm';

/** Lights Out pays this much more (it's run half blind). */
export const LIGHTS_OUT_GEM_RATE = 1.5;

export const GEM_RUSH_SECONDS = 60;
/** Reach this in the Daily Run for the daily reward. */
export const DAILY_TARGET = 500;
export const DAILY_REWARD = 100;

/** Local calendar day, e.g. 2026-10-31. */
export function dayKey(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Same seed for everyone on the same day. */
export function dailySeed(key = dayKey()): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Where a variant's record lives in `save.best`. Gem Rush records gems, the rest metres. */
export function variantBestKey(v: EndlessVariant, s: Pick<Settings, 'kidMode' | 'difficulty'>, now = new Date()): string {
  switch (v) {
    case 'daily':
      return `daily_${dayKey(now)}`;
    case 'oneheart':
      return `oneheart_${s.difficulty}`;
    case 'gemrush':
      return 'gemrush';
    case 'lightsout':
      return `lightsout_${s.difficulty}`;
    case 'rhythm':
      return `rhythm_${s.difficulty}`;
    default:
      return endlessBestKey(s);
  }
}

export function dailyRewardKey(now = new Date()): string {
  return `dailyrw_${dayKey(now)}`;
}

/** Keep only this week's daily entries so the save doesn't grow forever. */
export function pruneDaily(best: Record<string, number>, now = new Date()): void {
  const keep = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const k = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    keep.add(`daily_${k}`);
    keep.add(`dailyrw_${k}`);
  }
  for (const k of Object.keys(best)) if ((k.startsWith('daily_') || k.startsWith('dailyrw_')) && !keep.has(k)) delete best[k];
}

export const VARIANT_INFO: Record<EndlessVariant, { name: string; blurb: string }> = {
  classic: { name: 'Endless', blurb: 'The classic rush. How far can you go?' },
  daily: { name: 'Daily Run', blurb: 'A new course every day, the same for everyone, with its own soundtrack. No revives!' },
  oneheart: { name: 'One Heart', blurb: 'One bump and it’s over. For pros.' },
  gemrush: { name: 'Gem Rush', blurb: `${GEM_RUSH_SECONDS} seconds. Grab every gem, and bumps drop 5!` },
  rhythm: { name: 'Rhythm Rush', blurb: 'Every obstacle is set on the beat: jump, hop and flip right on it! Perfect taps build a combo and multiply your score; off-beat taps break it.' },
  lightsout: { name: 'Lights Out', blurb: 'Pitch dark! Only your candle lights the way, and the beat keeps blowing on it. Run by rhythm and memory. Pays 1.5× gems.' },
};

// ------------------------------------------------------------------ levels
/**
 * Endless is split into levels, each exactly one song long (see LevelTimeline),
 * cycling through the six worlds.
 */
export const MAX_START_LEVEL = 40;

/** Levels you can start from: every level you have reached on this difficulty. */
export function unlockedLevels(reached: number): number {
  return Math.max(1, Math.min(MAX_START_LEVEL, Math.floor(reached) || 1));
}

/** Where a run started from a later level begins (metres in, so speed and difficulty fit). */
export function levelStart(level: number): number {
  return (Math.max(1, Math.floor(level)) - 1) * LEVEL_NOMINAL;
}

/** World index (0-5) a level takes place in. */
export function levelWorld(level: number): number {
  return (Math.max(1, Math.floor(level)) - 1) % 6;
}

/** A level you're allowed to start from, given your record (falls back to 1). */
export function clampStartLevel(level: number | undefined, reached: number): number {
  const n = Math.floor(level ?? 1);
  return n >= 1 && n <= unlockedLevels(reached) ? n : 1;
}

export interface DailyTwist {
  /** The shape today's course starts in. */
  startMode: 'square' | 'triangle' | 'hexagon' | 'diamond';
  /** Moving saws from the start (heat never drops below this). */
  heatFloor: number;
  /** Shape sections are this long (shorter = more shape changes). */
  sectionScale: number;
  gemChance?: number;
  /** Short labels for the Daily card ("Glider start · Saw Storm"). */
  labels: string[];
}

const START_NAMES = { square: 'Jumper', triangle: 'Glider', hexagon: 'Roller', diamond: 'Hopper' } as const;

/**
 * Each day's course has its own character, not just a new layout: a
 * starting shape and one twist, picked from the day's seed (so everyone
 * gets the same). Spooky Season always brings the ghost saws.
 */
export function dailyTwist(seed: number, haunted: boolean): DailyTwist {
  let h = (seed ^ 0x2545f491) >>> 0;
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = (h ^ (h >>> 12)) >>> 0;
    return h / 4294967296;
  };
  const modes = ['square', 'triangle', 'hexagon', 'diamond'] as const;
  const startMode = modes[Math.floor(next() * modes.length)];
  const t: DailyTwist = { startMode, heatFloor: 0, sectionScale: 1, labels: [`${START_NAMES[startMode]} start`] };
  if (haunted) {
    t.heatFloor = 0.35;
    t.labels.push('Ghost saws');
    return t;
  }
  const twist = Math.floor(next() * 4);
  if (twist === 0) {
    t.heatFloor = 0.3;
    t.labels.push('Saw Storm');
  } else if (twist === 1) {
    t.sectionScale = 0.55;
    t.labels.push('Shape Shifter');
  } else if (twist === 2) {
    t.gemChance = 0.75;
    t.labels.push('Gem Shower');
  } else {
    t.heatFloor = 0.15;
    t.sectionScale = 0.8;
    t.labels.push('Remix');
  }
  return t;
}
