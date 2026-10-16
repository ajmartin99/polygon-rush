/**
 * Polygon Rush original soundtrack — 17 songs composed as data, across genres
 * from bubblegum pop and chiptune to drum & bass, rock, tropical and lo-fi.
 *
 * Notation (one token per 16th note, 16 tokens per bar, bars separated by `|`):
 *   melody:  scale degree 1-7, `'` = octave up, `,` = octave down, `#`/`b` = sharp/flat,
 *            `-` = hold previous note, `.` = rest
 *   bass:    r = chord root, t = third, f = fifth, o = octave, `-` hold, `.` rest
 *   arp:     0-3 = chord tone index (root, third, fifth, octave), `.` rest
 *   drums:   x = hit (o = open hat on the hat lane), `.` = rest
 *
 * Chords are diatonic triads built on the given scale degrees.
 * Form: 2-bar intro, then A (4 bars) → B (4 bars) → A → B (+fill), looping.
 */

import { activeEvent, type EventId } from '../meta/events';

export type Scale = 'major' | 'minor' | 'dorian' | 'mixolydian';

/** Drum sounds: punchy (default), chip (8-bit), rock, 808 (booming), lofi (soft and dusty), breaks (crisp, fast). */
export type Kit = 'punchy' | 'chip' | 'rock' | '808' | 'lofi' | 'breaks';
/** Lead instrument. */
export type Voice = 'synth' | 'chip' | 'guitar' | 'brass' | 'mallet' | 'keys';
export type BassTone = 'saw' | 'square' | 'sub' | 'wobble' | 'slap';
export type PadTone = 'saw' | 'strings' | 'organ' | 'none';
/** Where a song plays: a world's signature theme, the menus, or the general mix. */
export type SongRole = 'world' | 'menu' | 'mix';

export interface Groove {
  kick: string;
  snare: string;
  hat: string;
}

export interface SongDef {
  title: string;
  genre: string;
  role: SongRole;
  /** Energetic enough for races. */
  fast?: boolean;
  bpm: number;
  /** MIDI note of the tonic (around octave 3-4). */
  root: number;
  scale: Scale;
  /** 0..0.3 — delays every off-16th for a shuffle feel. */
  swing: number;
  progA: number[];
  progB: number[];
  melA: string;
  melB: string;
  bass: string;
  arp: string;
  grooveA: Groove;
  grooveB: Groove;
  lead: OscillatorType;
  /** Octave offset for the melody (default +1 octave over root). */
  leadOctave?: number;
  kit?: Kit;
  voice?: Voice;
  bassTone?: BassTone;
  padTone?: PadTone;
  /** Seasonal song: only in rotation while its event is on. */
  event?: EventId;
}

export const SCALES: Record<Scale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export const SONGS: SongDef[] = [
  // 0 — World 1: Bubblegum Bay (bright, bouncy pop)
  {
    title: 'Bubblegum Bay',
    genre: 'Bubblegum pop',
    role: 'world',
    bpm: 128,
    root: 60,
    scale: 'major',
    swing: 0,
    progA: [1, 5, 6, 4],
    progB: [4, 5, 3, 6],
    melA:
      "5 - 5 6 5 - 3 - 1 - 3 - 5 - - . | 5 - 4 - 2 - 4 - 7, - 2 - 5 - - . | 6 - 5 6 - 1' - 6 5 - 3 - 1 - - . | 4 - 3 4 - 6 - 5 4 - 3 - 2 - - .",
    melB:
      "1' - - 7 6 - 4 - 6 - 1' - 3' - - . | 2' - - 1' 7 - 5 - 7 - 2' - 4' - - . | 3' - 2' - 7 - 5 - 3' - 2' - 7 - 5 - | 6 - - - 1' - - - 3' - - 2' 1' - - -",
    bass: 'r . o . r . o . r . o . f . o .',
    arp: '0 1 2 1 3 2 1 2 0 1 2 1 3 2 1 2',
    grooveA: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' },
    grooveB: { kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'x.x.x.x.x.x.x.o.' },
    lead: 'square',
  },
  // 1 — World 2: Mint Meadow (sunny shuffle)
  {
    title: 'Mint Meadow',
    genre: 'Sunny shuffle',
    role: 'world',
    bpm: 118,
    root: 55,
    scale: 'major',
    swing: 0.14,
    progA: [1, 3, 6, 4],
    progB: [4, 1, 5, 6],
    melA:
      '3 - - 2 1 - - . 5, - 1 - 2 - 3 - | 5 - - 3 2 - 3 - 7, - - . 2 - - . | 6 - - 5 6 - 1\' - 7 - 6 - 5 - - . | 4 - 3 - 2 - 1 - 2 - - - . . . .',
    melB:
      "6 - 1' - 4' - - 3' 1' - 6 - 5 - - - | 5 - 7 - 2' - - 1' 7 - 5 - 3 - - - | 2' - - 1' 7 - 6 - 5 - 6 - 7 - - - | 6 - - 5 6 - 7 - 1' - - - - - . .",
    bass: 'r . . r . . f . r . . r . o . .',
    arp: '0 . 2 . 1 . 2 . 3 . 2 . 1 . 2 .',
    grooveA: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    grooveB: { kick: 'x.....x.x.x.....', snare: '....x.......x.x.', hat: 'x.x.x.o.x.x.x.o.' },
    lead: 'triangle',
  },
  // 2 — World 3: Sunset Circuit (driving synthwave)
  {
    title: 'Sunset Circuit',
    genre: 'Synthwave',
    role: 'world',
    fast: true,
    bpm: 132,
    root: 57,
    scale: 'minor',
    swing: 0,
    progA: [1, 6, 3, 7],
    progB: [6, 7, 5, 1],
    melA:
      "5 - 1' - 5 - 3' - 2' - 1' - 7 - 5 - | 6 - 1' - 6 - 3' - 2' - 1' - 6 - 4 - | 3' - 5' - 3' - 1' - 7 - 1' - 3' - 5 - | 2' - - 1' 7 - - 5 7 - 2' - 4' - 2' -",
    melB:
      "1' - - - 6 - 1' - 3' - - - 1' - - - | 2' - - - 7 - 2' - 4' - - - 2' - - - | 7 - - - 5 - 7 - 2' - - - 5' - - - | 1' - 2' - 3' - 5' - 3' - 2' - 1' - - -",
    bass: 'r . r . r . r . r . r . o . r .',
    arp: '0 1 2 3 0 1 2 3 0 1 2 3 0 1 2 3',
    grooveA: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '.xx..xx..xx..xx.' },
    grooveB: { kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx' },
    lead: 'sawtooth',
    leadOctave: 1,
  },
  // 3 — World 4: Ocean Prism (dreamy, half-time)
  {
    title: 'Ocean Prism',
    genre: 'Dream pop',
    role: 'world',
    bpm: 120,
    root: 62,
    scale: 'major',
    swing: 0,
    progA: [1, 4, 6, 5],
    progB: [4, 5, 3, 6],
    melA:
      "1' - - 7 6 - 5 - 3 - - - 2 - 1 - | 1' - - 7 6 - 4 - 3 - - - 2 - 3 - | 3 - 4 - 5 - 6 - 5 - 3 - 2 - 3 - | 2 - - - 7, - 2 - 5 - - - . . . .",
    melB:
      "4 - 6 - 1' - 3' - 2' - 1' - 6 - 4 - | 5 - 7 - 2' - 4' - 3' - 2' - 7 - 5 - | 3 - 5 - 7 - 2' - 1' - 7 - 5 - 3 - | 6 - - - 5 - 6 - 1' - - - 2' - 1' -",
    bass: 'r . . . f . . . o . . . f . . .',
    arp: '0 2 3 2 1 2 3 2 0 2 3 2 1 2 3 2',
    grooveA: { kick: 'x.......x..x....', snare: '....x.......x...', hat: '..x...x...x...xx' },
    grooveB: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    lead: 'triangle',
    leadOctave: 1,
  },
  // 4 — World 5: Candy Cosmos (spacey, high energy)
  {
    title: 'Candy Cosmos',
    genre: 'Space disco',
    role: 'world',
    fast: true,
    bpm: 136,
    root: 59,
    scale: 'minor',
    swing: 0,
    progA: [1, 6, 3, 7],
    progB: [4, 5, 6, 7],
    melA:
      "1 - 2 - 3 - 5 - 4 - 3 - 2 - 1 - | 3 - 5 - 1' - 5 - 6 - 5 - 3 - 5 - | 5 - 7 - 2' - 7 - 3' - 2' - 7 - 5 - | 4 - 6 - 1' - 6 - 7 - - - 5 - - -",
    melB:
      "4 - - 5 6 - - 1' 7 - 6 - 4 - - - | 5 - - 6 7 - - 2' 1' - 7 - 5 - - - | 6 - - 7 1' - - 3' 2' - 1' - 6 - - - | 7 - - 1' 2' - - 4' 3' - 2' - 7 - 5 -",
    bass: 'r . o r . o r . r . o r . o f .',
    arp: '0 1 2 3 2 1 0 1 0 1 2 3 2 1 0 1',
    grooveA: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    grooveB: { kick: 'x...x...x...x.x.', snare: '....x..x....x...', hat: 'xxoxxxoxxxoxxxox' },
    lead: 'sawtooth',
  },
  // 5 — World 6: Lemon Lab (quirky funk)
  {
    title: 'Lemon Lab',
    genre: 'Funk',
    role: 'world',
    bpm: 126,
    root: 53,
    scale: 'major',
    swing: 0.1,
    progA: [1, 4, 1, 5],
    progB: [2, 5, 1, 6],
    melA:
      "1' - . 1' - 6 - 5 - . 3 - 5 - . . | 4 - . 4 - 6 - 1' - . 6 - 4 - . . | 5 - . 5 - 3 - 1 - . 3 - 5 - 6 - | 5 - - - 7 - - - 2' - 1' - 7 - 5 -",
    melB:
      "2' - 1' - 6 - 5 - 4 - 5 - 6 - - - | 5 - 7 - 2' - 7 - 5 - 3 - 2 - - - | 1' - 3' - 5' - 3' - 1' - 6 - 5 - - - | 6 - - 5 6 - 1' - 2' - - - 1' - - -",
    bass: 'r . . r . r o . r . . r o . f .',
    arp: '0 . 1 2 . 0 2 1 0 . 1 2 . 3 2 1',
    grooveA: { kick: 'x..x..x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    grooveB: { kick: 'x..x..x..x.x....', snare: '....x..x....x...', hat: 'xxx.xxx.xxx.xxo.' },
    lead: 'square',
  },
  // 6 — Menu: Polygon Plaza (chill)
  {
    title: 'Polygon Plaza',
    genre: 'Chill hop',
    role: 'menu',
    bpm: 100,
    root: 60,
    scale: 'major',
    swing: 0.16,
    progA: [1, 6, 4, 5],
    progB: [4, 3, 2, 5],
    melA:
      "3 - - - 5 - - 3 2 - 1 - - - . . | 1 - - - 3 - - 1 7, - 6, - - - . . | 6 - - - 1' - - 6 5 - 4 - - - . . | 5 - - - 4 - 3 - 2 - - - . . . .",
    melB:
      "4 - 6 - 1' - - - 7 - 6 - 4 - - - | 3 - 5 - 7 - - - 6 - 5 - 3 - - - | 2 - 4 - 6 - - - 5 - 4 - 2 - - - | 5 - - - 7, - - - 2 - - - 5 - - -",
    bass: 'r . . . . . f . r . . . o . . .',
    arp: '0 . . 1 . . 2 . . 3 . . 2 . 1 .',
    grooveA: { kick: 'x.........x.....', snare: '........x.......', hat: '..x...x...x...x.' },
    grooveB: { kick: 'x.......x.x.....', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.' },
    lead: 'triangle',
  },
  // 7 — Race: Rush Hour (fast and fierce)
  {
    title: 'Rush Hour',
    genre: 'Electro',
    role: 'mix',
    fast: true,
    bpm: 140,
    root: 52,
    scale: 'minor',
    swing: 0,
    progA: [1, 6, 3, 7],
    progB: [4, 6, 7, 1],
    melA:
      "1' - 1' - 7 - 1' - 5 - - - 3 - 5 - | 6 - 6 - 5 - 6 - 3' - - - 1' - 6 - | 3' - 3' - 2' - 3' - 7 - - - 5 - 7 - | 2' - 2' - 1' - 2' - 4 - - - 6 - 7 -",
    melB:
      "4 - - 3 2 - 1 - 2 - 3 - 4 - 5 - | 6 - - 5 4 - 3 - 4 - 5 - 6 - 1' - | 7 - - 6 5 - 4 - 5 - 6 - 7 - 2' - | 1' - - - 7 - 5 - 1' - - - . . . .",
    bass: 'r . r . o . r . r . r . o . f .',
    arp: '0 1 2 3 0 1 2 3 0 1 2 3 3 2 1 0',
    grooveA: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx' },
    grooveB: { kick: 'x...x...x...x.xx', snare: '....x.......x...', hat: 'xxoxxxoxxxoxxxox' },
    lead: 'sawtooth',
    leadOctave: 2,
  },
  // 8 — Pixel Parade (chiptune)
  {
    title: 'Pixel Parade',
    genre: 'Chiptune',
    role: 'mix',
    fast: true,
    bpm: 150,
    root: 60,
    scale: 'major',
    swing: 0,
    progA: [1, 5, 6, 4],
    progB: [4, 5, 1, 6],
    melA:
      "1 . 3 . 5 . 1' . 7 . 5 . 3 . 5 . | 6 . 1' . 3' . 1' . 7 . 5 . 6 - - . | 4 . 6 . 1' . 6 . 5 . 4 . 3 . 4 . | 5 - 4 - 3 - 2 - 7, . 2 . 5 - - .",
    melB:
      "3' - - 2' 1' - 5 - 6 - 1' - 3' - - . | 2' - - 1' 7 - 5 - 7 - 2' - 4' - - . | 3' - 2' - 1' - 6 - 1' - 2' - 3' - - - | 4' - - 3' 2' - 1' - 7 - 5 - 1' - - -",
    bass: 'r . o . r . o . r . o . r . o .',
    arp: '0 1 2 3 0 1 2 3 0 1 2 3 0 1 2 3',
    grooveA: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    grooveB: { kick: 'x...x...x...x...', snare: '....x.......x.xx', hat: 'xxxxxxxxxxxxxxxx' },
    lead: 'square',
    kit: 'chip',
    voice: 'chip',
    bassTone: 'square',
    padTone: 'none',
  },
  // 9 — Turbo Breaks (drum & bass)
  {
    title: 'Turbo Breaks',
    genre: 'Drum & bass',
    role: 'mix',
    fast: true,
    bpm: 172,
    root: 57,
    scale: 'minor',
    swing: 0,
    progA: [1, 6, 7, 5],
    progB: [4, 6, 7, 1],
    melA:
      "1' - - - 7 - 5 - - - 3 - 5 - - - | 6 - - - 5 - 3 - - - 1 - 3 - - - | 7 - - - 6 - 5 - - - 7 - 1' - - - | 2' - - - 1' - 7 - 5 - - - - - - -",
    melB:
      "3' - - - - - 2' - 1' - - - 7 - - - | 1' - - - - - 7 - 6 - - - 5 - - - | 6 - - - 7 - 1' - 2' - - - 3' - - - | 2' - - - 1' - - - 7 - - - 5 - - -",
    bass: 'r - - . . . r . . . r - - . f .',
    arp: '0 . 2 . 3 . 2 . 0 . 2 . 3 . 1 .',
    grooveA: { kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    grooveB: { kick: 'x.........xx....', snare: '....x..g....x..g', hat: 'xxxxxxxxxxxxxxxx' },
    lead: 'sawtooth',
    kit: 'breaks',
    bassTone: 'wobble',
    padTone: 'strings',
  },
  // 10 — Disco Polygon (house)
  {
    title: 'Disco Polygon',
    genre: 'House',
    role: 'mix',
    fast: true,
    bpm: 124,
    root: 55,
    scale: 'dorian',
    swing: 0,
    progA: [1, 4, 1, 4],
    progB: [3, 4, 6, 5],
    melA:
      "5 - . 5 - . 4 - 5 . . . 7 - 5 - | 4 - . 4 - . 3 - 4 . . . 6 - 4 - | 5 - . 5 - . 4 - 5 . . . 1' - 7 - | 6 - - - 5 - 4 - 3 - - - 1 - - -",
    melB:
      "1' - - 7 1' - 3' - 1' - 7 - 5 - - - | 7 - - 6 7 - 2' - 7 - 6 - 4 - - - | 6 - - 5 6 - 1' - 6 - 5 - 3 - - - | 5 - 4 - 3 - 4 - 5 - - - - - . .",
    bass: 'r . o . r . o . r . o . r . o .',
    arp: '. . 2 . . . 2 . . . 2 . . . 2 .',
    grooveA: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..o...o...o...o.' },
    grooveB: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.' },
    lead: 'triangle',
    voice: 'keys',
    bassTone: 'slap',
    padTone: 'organ',
  },
  // 11 — Power Chord Pass (rock)
  {
    title: 'Power Chord Pass',
    genre: 'Rock',
    role: 'mix',
    fast: true,
    bpm: 144,
    root: 52,
    scale: 'minor',
    swing: 0,
    progA: [1, 6, 7, 1],
    progB: [4, 6, 7, 5],
    melA:
      "1 - 1 - 3 - 1 - 4 - 3 - 1 - 7, - | 1 - 1 - 3 - 4 - 5 - 4 - 3 - 1 - | 6 - 6 - 5 - 4 - 5 - 4 - 3 - 4 - | 5 - - - 4 - - - 3 - - - 7, - - -",
    melB:
      "5 - - - 1' - - - 7 - 6 - 5 - - - | 4 - - - 6 - - - 5 - 4 - 3 - - - | 6 - - - 1' - - - 2' - 1' - 7 - - - | 5 - - - 7 - - - 1' - - - - - - -",
    bass: 'r . r . r . r . r . r . r . r .',
    arp: '. . . . . . . . . . . . . . . .',
    grooveA: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    grooveB: { kick: 'x.x.....x.x.....', snare: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.' },
    lead: 'sawtooth',
    kit: 'rock',
    voice: 'guitar',
    padTone: 'none',
  },
  // 12 — Coconut Cruise (tropical)
  {
    title: 'Coconut Cruise',
    genre: 'Tropical',
    role: 'mix',
    bpm: 104,
    root: 62,
    scale: 'major',
    swing: 0,
    progA: [1, 5, 6, 4],
    progB: [4, 1, 5, 6],
    melA:
      "3 - 5 - 6 - 5 - 3 - 2 - 1 - - - | 2 - 3 - 5 - 3 - 2 - 1 - 7, - - - | 1 - 3 - 5 - 6 - 5 - 3 - 5 - - - | 6 - 5 - 3 - 2 - 3 - - - . . . .",
    melB:
      "1' - - 6 5 - 6 - 1' - - - 2' - 1' - | 7 - - 5 4 - 5 - 7 - - - 1' - 7 - | 6 - - 5 3 - 5 - 6 - - - 5 - 3 - | 5 - - - 4 - 3 - 2 - - - 1 - - -",
    bass: 'r - . . . . r . r - . . f . . .',
    arp: '0 . 1 2 . 1 . 2 0 . 1 2 . 1 . 2',
    grooveA: { kick: 'x...x...x...x...', snare: '...x..x....x..x.', hat: 'x.x.x.x.x.x.x.x.' },
    grooveB: { kick: 'x...x...x...x...', snare: '...x..x....x..x.', hat: 'xxx.xxx.xxx.xxx.' },
    lead: 'sine',
    leadOctave: 1,
    voice: 'mallet',
    bassTone: 'sub',
    padTone: 'none',
  },
  // 13 — Lo-fi Lagoon (lo-fi beats; second menu theme)
  {
    title: 'Lo-fi Lagoon',
    genre: 'Lo-fi beats',
    role: 'menu',
    bpm: 90,
    root: 62,
    scale: 'dorian',
    swing: 0.22,
    progA: [1, 4, 7, 3],
    progB: [6, 2, 5, 1],
    melA:
      "5 - - 4 3 - - - 1 - - - . . . . | 4 - - 3 2 - - - 7, - - - . . . . | 3 - - 5 7 - - 6 5 - - 3 4 - - - | 3 - - - 2 - - - 1 - - - . . . .",
    melB:
      "1' - - 7 6 - 5 - 3 - - - 5 - - - | 2' - - 1' 7 - 6 - 4 - - - 6 - - - | 7 - - 6 5 - 4 - 3 - - - 5 - - - | 4 - - - 3 - - - 2 - - - . . . .",
    bass: 'r . . . . . r . f . . . . . . .',
    arp: '0 . . 2 . . 1 . . 3 . . 2 . . .',
    grooveA: { kick: 'x.........x.x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    grooveB: { kick: 'x.....x...x.....', snare: '....x.......x..g', hat: 'x.x.x.x.x.x.xxx.' },
    lead: 'triangle',
    kit: 'lofi',
    voice: 'keys',
    bassTone: 'sub',
    padTone: 'strings',
  },
  // 14 — Neon Bounce (future bass)
  {
    title: 'Neon Bounce',
    genre: 'Future bass',
    role: 'mix',
    fast: true,
    bpm: 140,
    root: 53,
    scale: 'major',
    swing: 0,
    progA: [4, 5, 6, 1],
    progB: [1, 5, 6, 4],
    melA:
      "5 - - 6 5 - 3 - . . 3 - 5 - 6 - | 1' - - 7 6 - 5 - . . 5 - 6 - 7 - | 1' - - 7 1' - 2' - 3' - 2' - 1' - 6 - | 5 - - - - - - - . . . . . . . .",
    melB:
      "3' - 3' - 2' - 1' - 2' - 1' - 6 - 5 - | 3' - 3' - 2' - 1' - 2' - 3' - 5' - - - | 4' - 3' - 2' - 1' - 2' - 1' - 6 - 5 - | 6 - - - 1' - - - 1' - - - - - - -",
    bass: 'r - - - . . . . r - - . f - . .',
    arp: '0 1 2 3 2 1 0 1 0 1 2 3 2 1 0 1',
    grooveA: { kick: 'x.........x.....', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.' },
    grooveB: { kick: 'x.....x...x.....', snare: '........x.......', hat: 'x.x.xrx.x.x.xrxr' },
    lead: 'sawtooth',
    kit: '808',
    bassTone: 'sub',
    padTone: 'strings',
  },
  // 15 — Swing Square (electro swing)
  {
    title: 'Swing Square',
    genre: 'Electro swing',
    role: 'mix',
    bpm: 128,
    root: 57,
    scale: 'minor',
    swing: 0.28,
    progA: [1, 4, 5, 1],
    progB: [6, 4, 5, 1],
    melA:
      "5 . 5 6 5 . 3 . 1 . 3 . 5 - - . | 4 . 4 5 4 . 2 . 7, . 2 . 4 - - . | 6 . 6 7 6 . 4 . 2 . 4 . 6 - 5 - | 5 - - - 4 - 3 - 2 - 7, - 1 - - .",
    melB:
      "1' - - 7 6 . 5 . 6 . 7 . 1' - - . | 2' - - 1' 7 . 6 . 7 . 1' . 2' - - . | 3' - 2' - 1' . 7 . 6 . 5 . 4 . 3 . | 5 - - - 7, - - - 1 - - - . . . .",
    bass: 'r . t . f . t . r . t . f . o .',
    arp: '. . 2 . . . 2 . . . 2 . . . 2 .',
    grooveA: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    grooveB: { kick: 'x...x...x...x...', snare: '....x..g....x..g', hat: 'x.o.x.o.x.o.x.o.' },
    lead: 'sawtooth',
    voice: 'brass',
    bassTone: 'slap',
    padTone: 'none',
  },
  // 16 — Hero Ascent (epic)
  {
    title: 'Hero Ascent',
    genre: 'Epic orchestral',
    role: 'mix',
    bpm: 112,
    root: 50,
    scale: 'minor',
    swing: 0,
    progA: [1, 6, 3, 7],
    progB: [6, 7, 5, 1],
    melA:
      "1 - - - 5 - - - 4 - 3 - 2 - 3 - | 1 - - - 6, - - - 7, - 1 - 2 - - - | 3 - - - 5 - - - 6 - 5 - 4 - 3 - | 2 - - - - - - - 5, - - - - - - -",
    melB:
      "5 - - - 1' - - - 7 - 6 - 5 - - - | 6 - - - 2' - - - 1' - 7 - 6 - - - | 7 - - - 3' - - - 2' - 1' - 7 - 6 - | 5 - - - - - - - 5 - - - - - - -",
    bass: 'r - - - r - - - r - - - f - - -',
    arp: '0 . 2 . 3 . 2 . 0 . 2 . 3 . 2 .',
    grooveA: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: '..x...x...x...x.' },
    grooveB: { kick: 'x.x...x.x.x.....', snare: '....x.......x.xx', hat: 'x.x.x.x.x.x.x.x.' },
    lead: 'sawtooth',
    leadOctave: 1,
    kit: 'rock',
    voice: 'brass',
    bassTone: 'sub',
    padTone: 'strings',
  },
  // 17 — Haunted Hop (Halloween)
  {
    title: 'Haunted Hop',
    genre: 'Spooky swing',
    role: 'mix',
    event: 'halloween',
    bpm: 116,
    root: 50,
    scale: 'minor',
    swing: 0.14,
    progA: [1, 4, 6, 5],
    progB: [6, 7, 1, 5],
    melA: "1 - 3 - 5 - 4# - 5 - 3 - 1 - . . | 7, - 2 - 4 - 3 - 2 - 7, - 5, - . . | 1 - 3 - 5 - 1' - 7 - 5 - 6 - 5 - | 4# - 5 - 3 - 2 - 1 - - - . . . .",
    melB: "5 - 5 - 6 - 5 - 4# - 5 - 6 - 7 - | 1' - - - 7 - 6 - 5 - - - 3 - - - | 4 - 4 - 5 - 4 - 3 - 4 - 5 - 6 - | 5 - - - 2 - - - 1 - - - . . . .",
    bass: 'r . . r . . f . r . . r . o . .',
    arp: '0 . 1 . 2 . 1 . 0 . 1 . 2 . 3 .',
    grooveA: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: '..x...x...x...x.' },
    grooveB: { kick: 'x.....x.x.x.....', snare: '....x.......x..g', hat: 'x.x.x.x.x.x.x.x.' },
    lead: 'triangle',
    kit: 'punchy',
    voice: 'mallet',
    bassTone: 'sub',
    padTone: 'organ',
  },
];

export const MENU_SONG = 6;
export const HAUNTED_SONG = 17;

/** Is a seasonal song in season? (Songs without an event always are.) */
export function inSeason(index: number, now = new Date()): boolean {
  const e = SONGS[index]?.event;
  return !e || activeEvent(now)?.id === e;
}

/** The menu opens with this: the Halloween theme during Spooky Season. */
export function menuTheme(now = new Date()): number {
  return activeEvent(now)?.id === 'halloween' ? HAUNTED_SONG : MENU_SONG;
}
export const RACE_SONG = 7;
export const WORLD_SONGS = 6;

/** Songs for a context, in catalogue order. */
export function songsFor(context: 'menu' | 'run' | 'race', now = new Date()): number[] {
  const out = SONGS.map((s, i) => ({ s, i }))
    .filter(({ s, i }) => inSeason(i, now) && (context === 'menu' ? s.role === 'menu' : context === 'race' ? s.fast === true : s.role !== 'menu'))
    .map(({ i }) => i);
  // In season, the seasonal theme plays in the menus too.
  if (context === 'menu' && menuTheme(now) !== MENU_SONG) out.unshift(menuTheme(now));
  return out;
}

/** Short description of where a song plays (for the Soundtrack picker). */
export function songRole(index: number): string {
  const s = SONGS[index];
  if (!s) return '';
  if (s.role === 'world') return `World ${index + 1} theme`;
  if (s.event) return 'Halloween special';
  if (s.role === 'menu') return index === MENU_SONG ? 'Main menu theme' : 'Menu & building';
  return s.fast ? 'Mix · races' : 'Mix';
}

export interface NoteEvent {
  /** Step within the 4-bar phrase (0..63). */
  step: number;
  /** Semitones from the tonic. */
  semis: number;
  /** Length in steps. */
  len: number;
}

/** Parse a melody string into note events. Throws on malformed bars. */
export function parseMelody(src: string, scale: number[]): NoteEvent[] {
  const bars = src.split('|').map((b) => b.trim().split(/\s+/));
  const events: NoteEvent[] = [];
  bars.forEach((tokens, bi) => {
    if (tokens.length !== 16) throw new Error(`bar ${bi + 1} has ${tokens.length} steps (need 16): "${tokens.join(' ')}"`);
  });
  const flat = bars.flat();
  let current: NoteEvent | null = null;
  flat.forEach((tok, step) => {
    if (tok === '-') {
      if (current) current.len++;
      return;
    }
    current = null;
    if (tok === '.') return;
    const m = /^([1-7])([#b]?)([',]*)$/.exec(tok);
    if (!m) throw new Error(`bad melody token "${tok}"`);
    const deg = Number(m[1]) - 1;
    let semis = scale[deg];
    if (m[2] === '#') semis += 1;
    if (m[2] === 'b') semis -= 1;
    for (const c of m[3]) semis += c === "'" ? 12 : -12;
    current = { step, semis, len: 1 };
    events.push(current);
  });
  return events;
}

/** Validate a 16-step lane pattern. */
export function lane(src: string): string[] {
  const t = src.includes(' ') ? src.trim().split(/\s+/) : [...src];
  if (t.length !== 16) throw new Error(`pattern needs 16 steps: "${src}"`);
  return t;
}
