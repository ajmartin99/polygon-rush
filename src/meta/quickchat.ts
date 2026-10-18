/**
 * Quick Chat: a fixed list of friendly phrases and emotes. Only the index
 * travels over the network, so nothing personal can ever be typed or shared.
 * Append new entries at the end; never reorder (indexes are the protocol).
 */
export interface QuickLine {
  text: string;
  /** Where it's offered: anywhere, build rooms, or race lobbies. */
  where: 'any' | 'build' | 'race';
  emote?: boolean;
  /** Phrase pack it comes in (bought in the Shop); none = everyone has it. */
  pack?: string;
}

/**
 * Extra Quick Chat phrases bought with gems. Still a fixed list (only the
 * index travels), so everything stays kid-safe: friendly slang, no taunts.
 */
export interface PhrasePack {
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** Only sold during this event (kept once owned). */
  event?: 'halloween';
}

export const PHRASE_PACKS: PhrasePack[] = [
  { id: 'sport', name: 'Good Sport', blurb: 'Cheer on your rivals.', price: 200 },
  { id: 'hype', name: 'Hype Squad', blurb: 'Big energy for big runs.', price: 350 },
  { id: 'slang', name: 'Slang Pack', blurb: 'No cap, it’s bussin’.', price: 500 },
  { id: 'builder', name: 'Builder Talk', blurb: 'Plan levels together.', price: 300 },
  { id: 'spooky', name: 'Spooky Sayings', blurb: 'Halloween only!', price: 300, event: 'halloween' },
];

export const QUICK_LINES: QuickLine[] = [
  { text: 'Hi!', where: 'any' },
  { text: 'Good luck!', where: 'any' },
  { text: 'Nice!', where: 'any' },
  { text: 'Good game!', where: 'any' },
  { text: 'Let’s go!', where: 'any' },
  { text: 'Wow!', where: 'any' },
  { text: 'Oops!', where: 'any' },
  { text: 'Thanks!', where: 'any' },
  { text: 'Ready?', where: 'any' },
  { text: 'Ready!', where: 'any' },
  { text: 'One more!', where: 'any' },
  { text: 'Bye!', where: 'any' },
  { text: 'Build here!', where: 'build' },
  { text: 'Try this part!', where: 'build' },
  { text: 'Too hard!', where: 'build' },
  { text: 'Too easy!', where: 'build' },
  { text: 'Add more gems!', where: 'build' },
  { text: 'Looks awesome!', where: 'build' },
  { text: 'Let’s race it!', where: 'build' },
  { text: 'I’ll do the end!', where: 'build' },
  { text: 'Can I help?', where: 'build' },
  { text: 'Rematch?', where: 'race' },
  { text: 'So close!', where: 'race' },
  { text: '👍', where: 'any', emote: true },
  { text: '😄', where: 'any', emote: true },
  { text: '😮', where: 'any', emote: true },
  { text: '🎉', where: 'any', emote: true },
  { text: '❤️', where: 'any', emote: true },
  { text: '⭐', where: 'any', emote: true },
  { text: '🔥', where: 'any', emote: true },
  { text: '😎', where: 'any', emote: true },
  // ---- phrase packs (append only)
  { text: 'Well played!', where: 'any', pack: 'sport' },
  { text: 'You’re so fast!', where: 'any', pack: 'sport' },
  { text: 'Great race!', where: 'race', pack: 'sport' },
  { text: 'Close one!', where: 'any', pack: 'sport' },
  { text: 'Next time!', where: 'any', pack: 'sport' },
  { text: 'Teach me!', where: 'any', pack: 'sport' },
  { text: '🤝', where: 'any', emote: true, pack: 'sport' },
  { text: 'Let’s gooo!', where: 'any', pack: 'hype' },
  { text: 'No way!', where: 'any', pack: 'hype' },
  { text: 'Clutch!', where: 'any', pack: 'hype' },
  { text: 'Unstoppable!', where: 'any', pack: 'hype' },
  { text: 'Big brain!', where: 'any', pack: 'hype' },
  { text: 'That was epic!', where: 'any', pack: 'hype' },
  { text: 'Speedrun time!', where: 'race', pack: 'hype' },
  { text: '⚡', where: 'any', emote: true, pack: 'hype' },
  { text: '🚀', where: 'any', emote: true, pack: 'hype' },
  { text: 'No cap!', where: 'any', pack: 'slang' },
  { text: 'That’s bussin’!', where: 'any', pack: 'slang' },
  { text: 'W!', where: 'any', pack: 'slang' },
  { text: 'Slay!', where: 'any', pack: 'slang' },
  { text: 'Sheesh!', where: 'any', pack: 'slang' },
  { text: 'Bet!', where: 'any', pack: 'slang' },
  { text: 'GOAT!', where: 'any', pack: 'slang' },
  { text: 'Lowkey hard!', where: 'any', pack: 'slang' },
  { text: 'It’s giving speed!', where: 'any', pack: 'slang' },
  { text: 'Main character energy!', where: 'any', pack: 'slang' },
  { text: 'Vibe check!', where: 'any', pack: 'slang' },
  { text: 'We’re so cooked!', where: 'any', pack: 'slang' },
  { text: '💯', where: 'any', emote: true, pack: 'slang' },
  { text: '🐐', where: 'any', emote: true, pack: 'slang' },
  { text: 'Pro move!', where: 'build', pack: 'builder' },
  { text: 'Add a saw here!', where: 'build', pack: 'builder' },
  { text: 'Make it harder!', where: 'build', pack: 'builder' },
  { text: 'Make it easier!', where: 'build', pack: 'builder' },
  { text: 'Needs a portal!', where: 'build', pack: 'builder' },
  { text: 'Test it!', where: 'build', pack: 'builder' },
  { text: 'Ship it!', where: 'build', pack: 'builder' },
  { text: '🛠️', where: 'build', emote: true, pack: 'builder' },
  { text: 'Boo!', where: 'any', pack: 'spooky' },
  { text: 'Spooky!', where: 'any', pack: 'spooky' },
  { text: 'Trick or treat!', where: 'any', pack: 'spooky' },
  { text: 'Ghost mode!', where: 'any', pack: 'spooky' },
  { text: 'Happy Halloween!', where: 'any', pack: 'spooky' },
  { text: '🎃', where: 'any', emote: true, pack: 'spooky' },
  { text: '👻', where: 'any', emote: true, pack: 'spooky' },
];

export function quickLine(n: number): QuickLine | null {
  return Number.isInteger(n) ? (QUICK_LINES[n] ?? null) : null;
}

/** Lines a player can send here: the free ones plus their phrase packs. */
export function quickLinesFor(where: 'build' | 'race', packs: readonly string[] = []): { n: number; line: QuickLine }[] {
  return QUICK_LINES.map((line, n) => ({ n, line })).filter(({ line }) => (line.where === 'any' || line.where === where) && (!line.pack || packs.includes(line.pack)));
}

export function packLines(id: string): QuickLine[] {
  return QUICK_LINES.filter((l) => l.pack === id);
}
