import type { Palette } from '../render/biomes';

/**
 * Seasonal events. While one is on, its cosmetics are in the shop, the menu
 * and Daily Run get its look and music, and there's a free gift to claim.
 * Anything bought or claimed stays owned for good.
 */
export type EventId = 'halloween';

export interface SeasonEvent {
  id: EventId;
  name: string;
  /** Inclusive local dates as [month (1-12), day]. */
  from: [number, number];
  to: [number, number];
  /** Free cosmetic to claim once per event. */
  gift: { kind: 'skin' | 'trail'; id: string };
}

export const EVENTS: SeasonEvent[] = [{ id: 'halloween', name: 'Spooky Season', from: [10, 1], to: [11, 7], gift: { kind: 'skin', id: 'witch' } }];

/** Query-string override for testing (?event=halloween / ?event=none). */
function forced(): EventId | 'none' | null {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('event');
  return v === 'none' || EVENTS.some((e) => e.id === v) ? (v as EventId | 'none') : null;
}

export function activeEvent(now = new Date()): SeasonEvent | null {
  const f = forced();
  if (f === 'none') return null;
  if (f) return EVENTS.find((e) => e.id === f) ?? null;
  const md = (now.getMonth() + 1) * 100 + now.getDate();
  return EVENTS.find((e) => md >= e.from[0] * 100 + e.from[1] && md <= e.to[0] * 100 + e.to[1]) ?? null;
}

export function isEventOn(id: EventId, now = new Date()): boolean {
  return activeEvent(now)?.id === id;
}

/** "until Nov 7" */
export function eventEndLabel(e: SeasonEvent): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `until ${months[e.to[0] - 1]} ${e.to[1]}`;
}

/** Key in save.tutorial marking this year's gift as claimed. */
export function giftKey(e: SeasonEvent, now = new Date()): string {
  return `gift_${e.id}_${now.getFullYear()}`;
}

/** Haunted Hollow: the Halloween look for the menu and the Daily Run. */
export const SPOOKY: Palette = {
  name: 'Haunted Hollow',
  skyTop: '#2a0f4f',
  skyBottom: '#ff7a2f',
  far: '#ffb36b',
  mid: '#4a1f6e',
  ground: '#2b1440',
  groundDark: '#150823',
  groundEdge: '#ff9a3c',
  groundTile: '#3a1c55',
  block: '#5b2d82',
  blockDark: '#2b1440',
  blockEdge: '#ffcf8a',
  hazard: '#7cff4f',
  hazardDark: '#2e8a12',
  hazardEdge: '#efffe0',
  accent: '#ff9a3c',
  stars: 0.7,
};
