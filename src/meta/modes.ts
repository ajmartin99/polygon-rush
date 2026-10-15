import type { Settings } from '../state/save';
import { endlessBestKey } from '../state/save';

/**
 * Ways to play an Endless track:
 *  - classic: the normal run at your difficulty;
 *  - daily:   one seeded course per day, the same for everyone, no revive;
 *  - oneheart: one bump and it's over, no heart pickups, no revive;
 *  - gemrush: 60 seconds to grab as many gems as you can (bumps only stun).
 */
export type EndlessVariant = 'classic' | 'daily' | 'oneheart' | 'gemrush';

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
  daily: { name: 'Daily Run', blurb: 'One course for everyone today. No revives!' },
  oneheart: { name: 'One Heart', blurb: 'One bump and it’s over. For pros.' },
  gemrush: { name: 'Gem Rush', blurb: `${GEM_RUSH_SECONDS} seconds. Grab every gem, and bumps drop 5!` },
};
