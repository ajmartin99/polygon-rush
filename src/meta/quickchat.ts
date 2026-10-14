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
}

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
];

export function quickLine(n: number): QuickLine | null {
  return Number.isInteger(n) ? (QUICK_LINES[n] ?? null) : null;
}

export function quickLinesFor(where: 'build' | 'race'): { n: number; line: QuickLine }[] {
  return QUICK_LINES.map((line, n) => ({ n, line })).filter(({ line }) => line.where === 'any' || line.where === where);
}
