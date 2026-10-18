import type { SaveData } from '../state/save';
import type { IconName } from '../ui/icons';
import { SKINS, TRAILS } from './catalog';

const HALLOWEEN_IDS = new Set([...SKINS, ...TRAILS].filter((i) => i.unlock.kind === 'event').map((i) => i.id));
import { leagueFor } from './economy';

/**
 * Player profiles are made only of game facts: badges earned from stats, a
 * title unlocked by a badge, a banner colour and a few numbers. Nothing is
 * typed, so a profile can be shown to friends or strangers without sharing
 * anything personal.
 */

export interface BadgeCtx {
  save: SaveData;
  /** Levels on this device that the player built (alone or together). */
  levelsBuilt: number;
  /** Of those, beaten from the start (shareable). */
  levelsVerified: number;
}

export interface Badge {
  id: string;
  name: string;
  /** Title this badge unlocks. */
  title: string;
  how: string;
  icon: IconName;
  color: string;
  earned: (c: BadgeCtx) => boolean;
}

const best = (c: BadgeCtx) => c.save.stats.bestDistance;

export const BADGES: Badge[] = [
  { id: 'rush1k', name: 'Rusher', title: 'Rusher', how: 'Reach 1,000 m in Endless', icon: 'flag', color: '#3ee6b0', earned: (c) => best(c) >= 1000 },
  { id: 'rush3k', name: 'Marathon', title: 'Marathoner', how: 'Reach 3,000 m in Endless', icon: 'flag', color: '#3ad7ff', earned: (c) => best(c) >= 3000 },
  { id: 'rush6k', name: 'Unstoppable', title: 'The Unstoppable', how: 'Reach 6,000 m in Endless', icon: 'bolt', color: '#ff7af0', earned: (c) => best(c) >= 6000 },
  { id: 'hard2k', name: 'Daredevil', title: 'Daredevil', how: 'Reach 2,000 m on Hard', icon: 'bolt', color: '#ff4f5e', earned: (c) => (c.save.best.endless_hard ?? 0) >= 2000 },
  { id: 'gems1k', name: 'Gem Hunter', title: 'Gem Hunter', how: 'Collect 1,000 gems', icon: 'gem', color: '#3ad7ff', earned: (c) => c.save.stats.gemsCollected >= 1000 },
  { id: 'gems10k', name: 'Treasure Hoard', title: 'Treasure Keeper', how: 'Collect 10,000 gems', icon: 'gem', color: '#ff5fa2', earned: (c) => c.save.stats.gemsCollected >= 10000 },
  { id: 'win10', name: 'Podium', title: 'Racer', how: 'Win 10 races', icon: 'trophy', color: '#ffd23f', earned: (c) => c.save.stats.racesWon >= 10 },
  { id: 'win50', name: 'Champion', title: 'Champion', how: 'Win 50 races', icon: 'crown', color: '#ffd23f', earned: (c) => c.save.stats.racesWon >= 50 },
  { id: 'gold', name: 'Gold League', title: 'Gold Racer', how: 'Reach the Gold league', icon: 'trophy', color: '#ffd23f', earned: (c) => leagueFor(c.save.trophies).min >= 80 },
  { id: 'legend', name: 'Legend', title: 'Polygon Legend', how: 'Reach the Polygon Legend league', icon: 'crown', color: '#ff7af0', earned: (c) => leagueFor(c.save.trophies).min >= 300 },
  { id: 'social', name: 'Team Player', title: 'Team Player', how: 'Play 10 online races', icon: 'users', color: '#7b5cff', earned: (c) => c.save.stats.onlinePlayed >= 10 },
  { id: 'builder', name: 'Builder', title: 'Builder', how: 'Build a level', icon: 'build', color: '#ff8a3d', earned: (c) => c.levelsBuilt >= 1 },
  { id: 'architect', name: 'Architect', title: 'Architect', how: 'Beat 5 of your own levels', icon: 'build', color: '#3ee6b0', earned: (c) => c.levelsVerified >= 5 },
  { id: 'bouncy', name: 'Bouncy', title: 'Bouncer', how: 'Jump 10,000 times', icon: 'shapes', color: '#ff5fa2', earned: (c) => c.save.stats.jumps >= 10000 },
  { id: 'collector', name: 'Collector', title: 'Collector', how: 'Own 8 skins', icon: 'sparkle', color: '#c27bff', earned: (c) => c.save.skins.owned.length >= 8 },
  {
    id: 'spooky',
    name: 'Trick or Treat',
    title: 'Pumpkin King',
    how: 'Collect 3 Halloween skins or trails',
    icon: 'sparkle',
    color: '#ff7a2f',
    earned: (c) => [...c.save.skins.owned, ...c.save.trails.owned].filter((id) => HALLOWEEN_IDS.has(id)).length >= 3,
  },
  { id: 'veteran', name: 'Veteran', title: 'Veteran', how: 'Play for 5 hours', icon: 'star', color: '#ffd23f', earned: (c) => c.save.stats.playSeconds >= 5 * 3600 },
];

export const DEFAULT_TITLE = 'Rookie Rusher';
export const MAX_SHOWCASE = 3;

/** Card backgrounds; banner i unlocks at player level BANNER_LEVELS[i]. */
export const BANNERS: [string, string][] = [
  ['#7b5cff', '#4b2fd0'],
  ['#3ee6b0', '#12a679'],
  ['#3ad7ff', '#1590c4'],
  ['#ff8a3d', '#c95412'],
  ['#ff5fa2', '#c8246a'],
  ['#ffd23f', '#e09a00'],
  ['#2b2b52', '#0f0828'],
  ['#ff7af0', '#3ad7ff'],
  ['#ff7a2f', '#2a0f4f'],
];
export const BANNER_LEVELS = [1, 3, 6, 10, 15, 20, 25, 30, 5];

export function badgeById(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id);
}

export function earnedBadges(c: BadgeCtx): Badge[] {
  return BADGES.filter((b) => b.earned(c));
}

export function titleFor(badgeId: string): string {
  return badgeById(badgeId)?.title ?? DEFAULT_TITLE;
}

/** What other players see. Only ids and numbers: nothing typed. */
export interface ProfileCard {
  /** Player level. */
  lv: number;
  trophies: number;
  /** Best Endless distance. */
  best: number;
  wins: number;
  /** Badge id whose title is shown ('' = default). */
  title: string;
  banner: number;
  /** Showcased badge ids (max 3). */
  show: string[];
  /** Number of badges earned. */
  badges: number;
  /** Friend tag (13+ only, so others in a room can send a request). */
  tag?: number;
}

export function myCard(c: BadgeCtx): ProfileCard {
  const p = c.save.profile;
  const earned = new Set(earnedBadges(c).map((b) => b.id));
  return {
    lv: c.save.level,
    trophies: c.save.trophies,
    best: Math.floor(c.save.stats.bestDistance),
    wins: c.save.stats.racesWon,
    title: earned.has(p.title) ? p.title : '',
    banner: c.save.level >= (BANNER_LEVELS[p.banner] ?? Infinity) ? p.banner : 0,
    show: p.showcase.filter((id) => earned.has(id)).slice(0, MAX_SHOWCASE),
    badges: earned.size,
    // Under-13s share their Name#tag in person only.
    ...(p.tag > 0 && p.birthYear !== null && new Date().getFullYear() - p.birthYear - 1 >= 13 ? { tag: p.tag } : {}),
  };
}

const int = (v: unknown, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : lo);

/** Clean a card received from another player (unknown ids dropped, numbers clamped). */
export function safeCard(raw: unknown): ProfileCard | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const known = (v: unknown): v is string => typeof v === 'string' && BADGES.some((b) => b.id === v);
  const show = Array.isArray(r.show) ? [...new Set(r.show.filter(known))].slice(0, MAX_SHOWCASE) : [];
  return {
    lv: int(r.lv, 1, 999),
    trophies: int(r.trophies, 0, 99_999),
    best: int(r.best, 0, 9_999_999),
    wins: int(r.wins, 0, 999_999),
    title: known(r.title) ? r.title : '',
    banner: int(r.banner, 0, BANNERS.length - 1),
    show,
    badges: int(r.badges, show.length, BADGES.length),
    ...(typeof r.tag === 'number' && Number.isInteger(r.tag) && r.tag >= 1 && r.tag <= 9999 ? { tag: r.tag } : {}),
  };
}

export function skinName(id: string): string {
  return SKINS.find((s) => s.id === id)?.name ?? 'Classic';
}
