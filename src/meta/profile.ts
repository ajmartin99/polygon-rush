import type { SaveData } from '../state/save';
import type { IconName } from '../ui/icons';
import { SKINS, TRAILS } from './catalog';

const HALLOWEEN_IDS = new Set([...SKINS, ...TRAILS].filter((i) => i.unlock.kind === 'event').map((i) => i.id));

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
  /** Levels built together in a build room. */
  levelsCoop?: number;
}

export type BadgeGroup = 'run' | 'race' | 'create' | 'social' | 'collect';

export const BADGE_GROUPS: Record<BadgeGroup, string> = {
  run: 'Running',
  race: 'Racing',
  create: 'Level Creator',
  social: 'Friends & Community',
  collect: 'Collecting',
};

export interface Badge {
  id: string;
  name: string;
  /** Title this badge unlocks. */
  title: string;
  how: string;
  icon: IconName;
  color: string;
  group: BadgeGroup;
  /** Where the player is and what they need. */
  progress: (c: BadgeCtx) => [number, number];
  earned: (c: BadgeCtx) => boolean;
}

type BadgeDef = Omit<Badge, 'earned' | 'progress'> & { value: (c: BadgeCtx) => number; target: number };

function badge(d: BadgeDef): Badge {
  const { value, target, ...rest } = d;
  return { ...rest, progress: (c) => [Math.min(target, Math.floor(value(c))), target], earned: (c) => value(c) >= target };
}

const best = (c: BadgeCtx) => c.save.stats.bestDistance;
const extreme = (c: BadgeCtx) => c.save.best.endless_hard ?? 0;
const halloween = (c: BadgeCtx) => [...c.save.skins.owned, ...c.save.trails.owned].filter((id) => HALLOWEEN_IDS.has(id)).length;
const creator = (c: BadgeCtx) => c.save.creator;

/** Ids are stored on profile cards: only ever add new ones. */
export const BADGES: Badge[] = [
  // ---- running
  badge({ id: 'rush1k', name: 'Rusher', title: 'Rusher', how: 'Reach 1,000 m in Endless', icon: 'flag', color: '#3ee6b0', group: 'run', value: best, target: 1000 }),
  badge({ id: 'rush3k', name: 'Marathon', title: 'Marathoner', how: 'Reach 3,000 m in Endless', icon: 'flag', color: '#3ad7ff', group: 'run', value: best, target: 3000 }),
  badge({ id: 'rush6k', name: 'Unstoppable', title: 'The Unstoppable', how: 'Reach 6,000 m in Endless', icon: 'bolt', color: '#ff7af0', group: 'run', value: best, target: 6000 }),
  badge({ id: 'rush10k', name: 'Beyond the Map', title: 'Map Breaker', how: 'Reach 10,000 m in Endless', icon: 'crown', color: '#ffd23f', group: 'run', value: best, target: 10000 }),
  badge({ id: 'hard2k', name: 'Daredevil', title: 'Daredevil', how: 'Reach 2,000 m on Extreme', icon: 'bolt', color: '#ff4f5e', group: 'run', value: extreme, target: 2000 }),
  badge({ id: 'extreme5k', name: 'Chaos Tamer', title: 'Chaos Tamer', how: 'Reach 5,000 m on Extreme, where the saws start moving', icon: 'bolt', color: '#ff2f6d', group: 'run', value: extreme, target: 5000 }),
  badge({ id: 'daily7', name: 'Daily Rusher', title: 'Daily Rusher', how: 'Play 7 Daily Runs', icon: 'target', color: '#3ad7ff', group: 'run', value: (c) => c.save.stats.dailyRuns, target: 7 }),
  badge({ id: 'daily30', name: 'Every Day', title: 'Never Misses a Day', how: 'Reach the Daily Run target on 30 days', icon: 'target', color: '#3ee6b0', group: 'run', value: (c) => c.save.stats.dailyTargets, target: 30 }),
  badge({ id: 'haunted', name: 'Ghost Runner', title: 'Ghost Runner', how: 'Finish the Haunted Run (Halloween)', icon: 'sparkle', color: '#ff7a2f', group: 'run', value: (c) => c.save.haunted.clears.hard + c.save.haunted.clears.easy, target: 1 }),
  badge({ id: 'nightmare', name: 'Nightmare Slayer', title: 'Nightmare Slayer', how: 'Finish the Haunted Run on Hard', icon: 'crown', color: '#8b2fd0', group: 'run', value: (c) => c.save.haunted.clears.hard, target: 1 }),
  badge({ id: 'egg1', name: 'Shape Hunter', title: 'Shape Hunter', how: 'Find a Golden Shape (one hides in every Endless level)', icon: 'egg', color: '#ffd23f', group: 'run', value: (c) => c.save.secrets.found.length, target: 1 }),
  badge({ id: 'egg10', name: 'Treasure Seeker', title: 'Treasure Seeker', how: 'Find 10 Golden Shapes', icon: 'egg', color: '#ff7af0', group: 'run', value: (c) => c.save.secrets.found.length, target: 10 }),
  badge({ id: 'egg40', name: 'Golden Collector', title: 'Golden Collector', how: 'Find all 40 Golden Shapes', icon: 'egg', color: '#3ee6b0', group: 'run', value: (c) => c.save.secrets.found.length, target: 40 }),
  badge({ id: 'bouncy', name: 'Bouncy', title: 'Bouncer', how: 'Jump 10,000 times', icon: 'shapes', color: '#ff5fa2', group: 'run', value: (c) => c.save.stats.jumps, target: 10000 }),
  badge({ id: 'shifter', name: 'Shape Shifter', title: 'Shape Shifter', how: 'Fly through 500 shape portals', icon: 'shapes', color: '#7b5cff', group: 'run', value: (c) => c.save.stats.portals, target: 500 }),
  // ---- racing
  badge({ id: 'win10', name: 'Podium', title: 'Racer', how: 'Win 10 races', icon: 'trophy', color: '#ffd23f', group: 'race', value: (c) => c.save.stats.racesWon, target: 10 }),
  badge({ id: 'win50', name: 'Champion', title: 'Champion', how: 'Win 50 races', icon: 'crown', color: '#ffd23f', group: 'race', value: (c) => c.save.stats.racesWon, target: 50 }),
  badge({ id: 'gold', name: 'Gold League', title: 'Gold Racer', how: 'Reach the Gold league', icon: 'trophy', color: '#ffd23f', group: 'race', value: (c) => c.save.trophies, target: 80 }),
  badge({ id: 'legend', name: 'Legend', title: 'Polygon Legend', how: 'Reach the Polygon Legend league', icon: 'crown', color: '#ff7af0', group: 'race', value: (c) => c.save.trophies, target: 300 }),
  badge({ id: 'social', name: 'Team Player', title: 'Team Player', how: 'Play 10 online races', icon: 'users', color: '#7b5cff', group: 'race', value: (c) => c.save.stats.onlinePlayed, target: 10 }),
  // ---- level creator
  badge({ id: 'builder', name: 'Builder', title: 'Builder', how: 'Build a level', icon: 'build', color: '#ff8a3d', group: 'create', value: (c) => c.levelsBuilt, target: 1 }),
  badge({ id: 'workshop', name: 'Workshop', title: 'Level Smith', how: 'Build 10 levels', icon: 'build', color: '#ffd23f', group: 'create', value: (c) => c.levelsBuilt, target: 10 }),
  badge({ id: 'architect', name: 'Architect', title: 'Architect', how: 'Beat 5 of your own levels', icon: 'verified', color: '#3ee6b0', group: 'create', value: (c) => c.levelsVerified, target: 5 }),
  badge({ id: 'cobuild', name: 'Co-Builder', title: 'Co-Builder', how: 'Build a level together in a build room', icon: 'users', color: '#3ad7ff', group: 'create', value: (c) => c.levelsCoop ?? 0, target: 1 }),
  badge({ id: 'published', name: 'Published', title: 'Level Maker', how: 'Share a level to Community', icon: 'public', color: '#ff8a3d', group: 'create', value: (c) => creator(c).sharedIds.length, target: 1 }),
  badge({ id: 'crowd', name: 'Crowd Pleaser', title: 'Crowd Pleaser', how: 'Get 50 plays on your shared levels', icon: 'play', color: '#3ee6b0', group: 'create', value: (c) => creator(c).plays, target: 50 }),
  badge({ id: 'fans', name: 'Fan Favourite', title: 'Fan Favourite', how: 'Get 25 thumbs up on your shared levels', icon: 'heart', color: '#ff5fa2', group: 'create', value: (c) => creator(c).likes, target: 25 }),
  badge({ id: 'hall', name: 'Hall of Fame', title: 'Hall of Famer', how: 'Get 250 thumbs up on your shared levels', icon: 'crown', color: '#ff7af0', group: 'create', value: (c) => creator(c).likes, target: 250 }),
  // ---- friends & community
  badge({ id: 'explorer', name: 'Explorer', title: 'Explorer', how: 'Beat 10 Community levels', icon: 'globe', color: '#3ad7ff', group: 'social', value: (c) => c.save.stats.communityClears, target: 10 }),
  badge({ id: 'globetrot', name: 'Globetrotter', title: 'Globetrotter', how: 'Beat 50 Community levels', icon: 'globe', color: '#7b5cff', group: 'social', value: (c) => c.save.stats.communityClears, target: 50 }),
  badge({ id: 'pals', name: 'Squad', title: 'Squad Leader', how: 'Have 5 friends', icon: 'users', color: '#3ee6b0', group: 'social', value: (c) => c.save.stats.friendsMax, target: 5 }),
  // ---- collecting
  badge({ id: 'gems1k', name: 'Gem Hunter', title: 'Gem Hunter', how: 'Collect 1,000 gems', icon: 'gem', color: '#3ad7ff', group: 'collect', value: (c) => c.save.stats.gemsCollected, target: 1000 }),
  badge({ id: 'gems10k', name: 'Treasure Hoard', title: 'Treasure Keeper', how: 'Collect 10,000 gems', icon: 'gem', color: '#ff5fa2', group: 'collect', value: (c) => c.save.stats.gemsCollected, target: 10000 }),
  badge({ id: 'collector', name: 'Collector', title: 'Collector', how: 'Own 8 skins', icon: 'sparkle', color: '#c27bff', group: 'collect', value: (c) => c.save.skins.owned.length, target: 8 }),
  badge({ id: 'spooky', name: 'Trick or Treat', title: 'Pumpkin King', how: 'Collect 3 Halloween skins or trails', icon: 'sparkle', color: '#ff7a2f', group: 'collect', value: halloween, target: 3 }),
  badge({ id: 'beta', name: 'Founding Tester', title: 'Founding Tester', how: 'Beta testers only: played Polygon Rush before the full release', icon: 'verified', color: '#3ee6b0', group: 'collect', value: (c) => (c.save.beta.tester ? 1 : 0), target: 1 }),
  badge({ id: 'veteran', name: 'Veteran', title: 'Veteran', how: 'Play for 5 hours', icon: 'star', color: '#ffd23f', group: 'collect', value: (c) => c.save.stats.playSeconds, target: 5 * 3600 }),
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
  /** Golden Shapes found. */
  eggs: number;
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
    eggs: c.save.secrets.found.length,
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
    eggs: int(r.eggs, 0, 99),
    ...(typeof r.tag === 'number' && Number.isInteger(r.tag) && r.tag >= 1 && r.tag <= 9999 ? { tag: r.tag } : {}),
  };
}

export function skinName(id: string): string {
  return SKINS.find((s) => s.id === id)?.name ?? 'Classic';
}
