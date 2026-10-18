import type { Rarity, Unlock } from './catalog';

/**
 * Emotes: preset reactions racers can pop on the podium and in lobbies.
 * Only the emote's index travels between players, so there's nothing to
 * moderate. Cosmetic only; some are free, the rest are in the shop.
 */
export type EmoteAnim = 'bounce' | 'spin' | 'wave' | 'shake' | 'pop' | 'float';

export interface EmoteDef {
  id: string;
  name: string;
  /** What appears in the bubble (emoji or short text). */
  glyph: string;
  /** How the racer moves while emoting. */
  anim: EmoteAnim;
  rarity: Rarity;
  unlock: Unlock;
}

const gems = (price: number): Unlock => ({ kind: 'gems', price });
const spooky = (price: number): Unlock => ({ kind: 'event', event: 'halloween', price });

/** Order is the wire format: only ever append. */
export const EMOTES: EmoteDef[] = [
  { id: 'wave', name: 'Wave', glyph: '👋', anim: 'wave', rarity: 'common', unlock: { kind: 'free' } },
  { id: 'gg', name: 'GG', glyph: 'GG', anim: 'bounce', rarity: 'common', unlock: { kind: 'free' } },
  { id: 'thumbs', name: 'Thumbs Up', glyph: '👍', anim: 'pop', rarity: 'common', unlock: { kind: 'free' } },
  { id: 'laugh', name: 'Laugh', glyph: '😂', anim: 'shake', rarity: 'common', unlock: { kind: 'free' } },
  { id: 'heart', name: 'Love It', glyph: '❤️', anim: 'float', rarity: 'common', unlock: gems(200) },
  { id: 'clap', name: 'Clap', glyph: '👏', anim: 'bounce', rarity: 'common', unlock: gems(200) },
  { id: 'wow', name: 'Wow', glyph: '😮', anim: 'pop', rarity: 'rare', unlock: gems(300) },
  { id: 'fire', name: 'On Fire', glyph: '🔥', anim: 'float', rarity: 'rare', unlock: gems(400) },
  { id: 'cool', name: 'Too Cool', glyph: '😎', anim: 'spin', rarity: 'rare', unlock: gems(400) },
  { id: 'party', name: 'Party', glyph: '🎉', anim: 'spin', rarity: 'epic', unlock: gems(700) },
  { id: 'crown', name: 'Champion', glyph: '👑', anim: 'bounce', rarity: 'epic', unlock: gems(900) },
  { id: 'rocket', name: 'Blast Off', glyph: '🚀', anim: 'float', rarity: 'legendary', unlock: gems(1500) },
  // Halloween (Spooky Season)
  { id: 'boo', name: 'Boo!', glyph: '👻', anim: 'shake', rarity: 'rare', unlock: spooky(300) },
  { id: 'pumpkin', name: 'Pumpkin Pop', glyph: '🎃', anim: 'pop', rarity: 'rare', unlock: spooky(300) },
  { id: 'bat', name: 'Bat Flap', glyph: '🦇', anim: 'wave', rarity: 'epic', unlock: spooky(500) },
  { id: 'candy', name: 'Trick or Treat', glyph: '🍬', anim: 'spin', rarity: 'epic', unlock: spooky(500) },
  // Beta testers only (1.0.x)
  { id: 'tester', name: 'Beta Tester', glyph: '🧪', anim: 'bounce', rarity: 'legendary', unlock: { kind: 'beta' } },
];

export function emoteIndex(id: string): number {
  return EMOTES.findIndex((e) => e.id === id);
}

export function validEmote(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < EMOTES.length;
}

/** Free emotes everyone has. */
export const FREE_EMOTES = EMOTES.filter((e) => e.unlock.kind === 'free').map((e) => e.id);
