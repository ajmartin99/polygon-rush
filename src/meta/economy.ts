import { SKINS, TRAILS } from './catalog';

/** XP needed to go from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  return 120 + (level - 1) * 60;
}

export interface LevelUp {
  level: number;
  gems: number;
  unlockedSkins: string[];
  unlockedTrails: string[];
}

/** Apply XP and return every level gained (with its reward). Pure. */
export function applyXp(level: number, xp: number, gained: number): { level: number; xp: number; ups: LevelUp[] } {
  let lv = level;
  let x = xp + Math.max(0, Math.floor(gained));
  const ups: LevelUp[] = [];
  while (x >= xpForLevel(lv)) {
    x -= xpForLevel(lv);
    lv += 1;
    ups.push({
      level: lv,
      gems: 40 + lv * 10,
      unlockedSkins: SKINS.filter((s) => s.unlock.kind === 'level' && s.unlock.level === lv).map((s) => s.id),
      unlockedTrails: TRAILS.filter((t) => t.unlock.kind === 'level' && t.unlock.level === lv).map((t) => t.id),
    });
  }
  return { level: lv, xp: x, ups };
}

export interface League {
  id: string;
  name: string;
  min: number;
  color: string;
  /** Rival CPU skill (0..1) at this league. */
  botSkill: number;
}

export const LEAGUES: League[] = [
  { id: 'bronze', name: 'Bronze', min: 0, color: '#ff9f5a', botSkill: 0.45 },
  { id: 'silver', name: 'Silver', min: 30, color: '#d9e2ff', botSkill: 0.6 },
  { id: 'gold', name: 'Gold', min: 80, color: '#ffd23f', botSkill: 0.72 },
  { id: 'diamond', name: 'Diamond', min: 160, color: '#3ad7ff', botSkill: 0.84 },
  { id: 'legend', name: 'Polygon Legend', min: 300, color: '#ff7af0', botSkill: 0.93 },
];

export function leagueFor(trophies: number): League {
  let best = LEAGUES[0];
  for (const l of LEAGUES) if (trophies >= l.min) best = l;
  return best;
}

export function nextLeague(trophies: number): League | null {
  return LEAGUES.find((l) => l.min > trophies) ?? null;
}

/** Race payout by finishing place (1-based). Trophies never go down — kid friendly. */
export const RACE_REWARDS = [
  { gems: 60, trophies: 4, xp: 70 },
  { gems: 35, trophies: 2, xp: 50 },
  { gems: 20, trophies: 1, xp: 40 },
  { gems: 10, trophies: 0, xp: 30 },
];

export function raceReward(place: number): { gems: number; trophies: number; xp: number } {
  return RACE_REWARDS[Math.min(RACE_REWARDS.length - 1, Math.max(0, place - 1))];
}

/** Endless: XP per metre, plus the gems picked up during the run. */
export function endlessXp(distance: number): number {
  return Math.floor(distance / 8);
}

/** Daily gift: 7-day cycle. Day 7 of the first cycle also grants cosmetics. */
export const DAILY_REWARDS = [50, 80, 100, 150, 200, 300, 500];

export const REVIVE_GEM_COST = 100;
