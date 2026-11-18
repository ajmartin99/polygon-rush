import type { SaveData } from '../state/save';
import { MAX_GEMS } from '../state/save';

/**
 * Advent Calendar (Christmas Wonderland): 25 doors, one a day from December
 * 1st to 25th. Today's door is free; a door you missed can still be opened
 * for gems; tomorrow's stays shut. Behind them: gems, Heart Regens,
 * Christmas items and, on the 25th, a legendary skin and trail you can't
 * get anywhere else.
 */
export const ADVENT_DAYS = 25;
/** Opening a door you missed. */
export const LATE_DOOR_GEMS = 150;

export type AdventReward =
  | { kind: 'gems'; amount: number }
  | { kind: 'regen'; amount: number }
  | { kind: 'skin'; id: string }
  | { kind: 'trail'; id: string }
  | { kind: 'emote'; id: string }
  | { kind: 'bundle'; items: AdventReward[] };

/** What's behind each door (index 0 = December 1st). Items you already own turn into gems. */
export const ADVENT_REWARDS: AdventReward[] = [
  { kind: 'gems', amount: 100 },
  { kind: 'emote', id: 'xtree' },
  { kind: 'gems', amount: 120 },
  { kind: 'trail', id: 'snowfall' },
  { kind: 'gems', amount: 150 },
  { kind: 'regen', amount: 1 },
  { kind: 'emote', id: 'xsnowman' },
  { kind: 'gems', amount: 150 },
  { kind: 'skin', id: 'gingerbread' },
  { kind: 'gems', amount: 200 },
  { kind: 'emote', id: 'xgift' },
  { kind: 'gems', amount: 200 },
  { kind: 'regen', amount: 1 },
  { kind: 'skin', id: 'reindeer' },
  { kind: 'gems', amount: 250 },
  { kind: 'emote', id: 'xdeer' },
  { kind: 'trail', id: 'canes' },
  { kind: 'gems', amount: 250 },
  { kind: 'skin', id: 'sweater' },
  { kind: 'regen', amount: 1 },
  { kind: 'emote', id: 'xbells' },
  { kind: 'gems', amount: 300 },
  { kind: 'trail', id: 'lights' },
  { kind: 'skin', id: 'elf' },
  {
    kind: 'bundle',
    items: [
      { kind: 'skin', id: 'starlight' },
      { kind: 'trail', id: 'aurora' },
      { kind: 'gems', amount: 500 },
    ],
  },
];

/** Gems an item is worth when you already own it. */
const OWNED_GEMS = 200;

export interface AdventState {
  /** The December the calendar belongs to (opened doors reset each year). */
  year: number;
  /** Door numbers (1-25) opened. */
  opened: number[];
}

export function emptyAdvent(): AdventState {
  return { year: 0, opened: [] };
}

/** Today's door (1-25), or 0 outside December 1st-25th. */
export function adventToday(now = new Date()): number {
  return now.getMonth() === 11 && now.getDate() <= ADVENT_DAYS ? now.getDate() : 0;
}

/** The calendar runs Dec 1st to Jan 6th (late doors can be opened until the event ends). */
export function adventOpen(now = new Date()): boolean {
  return now.getMonth() === 11 || (now.getMonth() === 0 && now.getDate() <= 6);
}

function adventYear(now: Date): number {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

/** The calendar for this December (last year's doors are forgotten). Mutates `save`. */
export function currentAdvent(save: SaveData, now = new Date()): AdventState {
  const year = adventYear(now);
  if (save.advent.year !== year) save.advent = { year, opened: [] };
  return save.advent;
}

export type DoorState = 'opened' | 'today' | 'late' | 'locked';

export function doorState(save: SaveData, door: number, now = new Date()): DoorState {
  const a = currentAdvent(save, now);
  if (a.opened.includes(door)) return 'opened';
  // After the 25th every door is a late one.
  const today = adventToday(now) || (adventOpen(now) ? ADVENT_DAYS + 1 : 0);
  if (door === today) return 'today';
  return door < today ? 'late' : 'locked';
}

/** Doors waiting for you right now (today's, unopened): for the menu badge. */
export function adventWaiting(save: SaveData, now = new Date()): number {
  const today = adventToday(now);
  return today && doorState(save, today, now) === 'today' ? 1 : 0;
}

export interface AdventGrant {
  gems: number;
  regens: number;
  skins: string[];
  trails: string[];
  emotes: string[];
}

function give(save: SaveData, r: AdventReward, out: AdventGrant): void {
  switch (r.kind) {
    case 'gems':
      out.gems += r.amount;
      break;
    case 'regen':
      out.regens += r.amount;
      break;
    case 'skin':
      if (save.skins.owned.includes(r.id)) out.gems += OWNED_GEMS;
      else (save.skins.owned.push(r.id), out.skins.push(r.id));
      break;
    case 'trail':
      if (save.trails.owned.includes(r.id)) out.gems += OWNED_GEMS;
      else (save.trails.owned.push(r.id), out.trails.push(r.id));
      break;
    case 'emote':
      if (save.emotes.owned.includes(r.id)) out.gems += OWNED_GEMS / 2;
      else (save.emotes.owned.push(r.id), out.emotes.push(r.id));
      break;
    case 'bundle':
      for (const item of r.items) give(save, item, out);
      break;
  }
}

/**
 * Open a door. Today's is free; a missed one costs LATE_DOOR_GEMS. Returns
 * what it gave, or null when it can't be opened (locked, already open, or
 * not enough gems). Mutates `save`.
 */
export function openDoor(save: SaveData, door: number, now = new Date()): AdventGrant | null {
  if (!adventOpen(now) || door < 1 || door > ADVENT_DAYS) return null;
  const state = doorState(save, door, now);
  if (state === 'opened' || state === 'locked') return null;
  if (state === 'late') {
    if (save.gems < LATE_DOOR_GEMS) return null;
    save.gems -= LATE_DOOR_GEMS;
  }
  const out: AdventGrant = { gems: 0, regens: 0, skins: [], trails: [], emotes: [] };
  give(save, ADVENT_REWARDS[door - 1], out);
  save.gems = Math.min(MAX_GEMS, save.gems + out.gems);
  save.haunted.regens = Math.min(999, save.haunted.regens + out.regens);
  currentAdvent(save, now).opened.push(door);
  return out;
}
