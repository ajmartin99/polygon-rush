import { dayDiff, todayKey } from '../core/platform';
import type { SaveData } from '../state/save';
import { DAILY_REWARDS } from './economy';

export function dailyAvailable(save: SaveData, today = todayKey()): boolean {
  return save.daily.lastClaim === null || dayDiff(save.daily.lastClaim, today) >= 1;
}

/** Index (0..6) of the gift that would be claimed next. */
export function nextDailyIndex(save: SaveData): number {
  return save.daily.day % DAILY_REWARDS.length;
}

export interface DailyResult {
  gems: number;
  dayIndex: number;
  skins: string[];
  trails: string[];
}

/**
 * Claim today's gift. Missing days never resets the streak (kid friendly) —
 * it just continues where you left off. Mutates `save`.
 */
export function claimDaily(save: SaveData, today = todayKey()): DailyResult | null {
  if (!dailyAvailable(save, today)) return null;
  const dayIndex = nextDailyIndex(save);
  const gems = DAILY_REWARDS[dayIndex];
  const skins: string[] = [];
  const trails: string[] = [];
  if (dayIndex === DAILY_REWARDS.length - 1) {
    if (!save.skins.owned.includes('lucky')) skins.push('lucky');
    else if (!save.trails.owned.includes('confetti')) trails.push('confetti');
    save.daily.cycles += 1;
  }
  save.daily.day += 1;
  save.daily.lastClaim = today;
  save.gems += gems;
  for (const s of skins) save.skins.owned.push(s);
  for (const t of trails) save.trails.owned.push(t);
  return { gems, dayIndex, skins, trails };
}
