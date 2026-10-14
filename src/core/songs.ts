/**
 * Polygon Rush original soundtrack — 8 songs composed as data.
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

export type Scale = 'major' | 'minor' | 'dorian' | 'mixolydian';

export interface Groove {
  kick: string;
  snare: string;
  hat: string;
}

export interface SongDef {
  title: string;
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
];

export const MENU_SONG = 6;
export const RACE_SONG = 7;
export const WORLD_SONGS = 6;

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
