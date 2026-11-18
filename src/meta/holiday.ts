import { TRACK_BASE, TRACKS } from '../core/tracks';
import { Rng } from '../core/rng';
import { beatIndexAt, beatMapFor, beatTime } from '../core/beatmaps';
import { courseBuilder } from './course';
import { LEVEL_SPEEDS, SAW_ICICLE, SAW_JACKBOX, SAW_PENGUIN, SAW_SNOWBALL, SAW_SNOWFLAKE, SAW_SNOWMAN, SAW_SOLDIER, type LevelContent, type LevelData } from '../game/level';
import type { HauntedDiff } from './haunted';

/**
 * Holiday Run (Christmas Wonderland): the Haunted Run's big sister. Someone
 * has stolen Christmas: Jack Frost froze Santa's sleigh, or Krampus
 * snatched his sack of presents (the player picks the villain). Chase him
 * through five chapters, each with its own twist, charted to his song: the
 * Snowy Pine Forest (snowmen and lobbed snowballs), the Frozen Lake
 * (sliding penguins and falling icicles, as the Hopper), Santa's Workshop
 * (marching toy soldiers, jack-in-the-boxes and Roller flips), Candy Cane
 * Peaks (gliding a sleigh) and his lair, where you throw glowing presents
 * at him. A new course every day, the same for everyone.
 */
export type HolidayDiff = HauntedDiff;
export type Villain = 'frost' | 'krampus';

export interface VillainDef {
  id: Villain;
  name: string;
  /** What he did (the story's first line). */
  crime: string;
  /** His lair (the boss chapter). */
  lair: string;
  color: string;
  song: string;
}

export const VILLAINS: Record<Villain, VillainDef> = {
  frost: {
    id: 'frost',
    name: 'Jack Frost',
    crime: 'Jack Frost froze Santa’s sleigh and stole the presents!',
    lair: 'Jack Frost’s Ice Palace',
    color: '#7ccfff',
    song: 'merry-xmas.mp3',
  },
  krampus: {
    id: 'krampus',
    name: 'Krampus',
    crime: 'Krampus snatched Santa’s sack of presents!',
    lair: 'Krampus’s Cavern',
    color: '#ff5a3a',
    song: 'carol-of-the-bells.mp3',
  },
};

export interface HolidayChapter {
  id: 'forest' | 'lake' | 'workshop' | 'peaks' | 'lair';
  name: string;
  line: string;
}

/** The story, told by the chapter title cards. */
export function holidayChapters(v: Villain): HolidayChapter[] {
  const def = VILLAINS[v];
  return [
    { id: 'forest', name: 'Snowy Pine Forest', line: `${def.crime} After him!` },
    { id: 'lake', name: 'The Frozen Lake', line: 'Hop across the ice. Mind the sliding penguins!' },
    { id: 'workshop', name: 'Santa’s Workshop', line: `${def.name} turned the toys naughty!` },
    { id: 'peaks', name: 'Candy Cane Peaks', line: 'Into the sleigh: fly through the candy canes!' },
    { id: 'lair', name: def.lair, line: `Grab the glowing presents to throw them at ${def.name}!` },
  ];
}

export const HOLIDAY_RULES = {
  /** Attempts per 24 hours, shared by both difficulties (Heart Regens refill them, as in the Haunted Run). */
  attempts: 2,
  windowMs: 24 * 60 * 60 * 1000,
  gemRate: { hard: 1, easy: 0.5 } as Record<HolidayDiff, number>,
  /** Beating the villain, and reaching the end while he gets away. */
  villainBonus: { hard: 500, easy: 150 } as Record<HolidayDiff, number>,
  escapeBonus: { hard: 100, easy: 50 } as Record<HolidayDiff, number>,
  hearts: { hard: 1, easy: 3 } as Record<HolidayDiff, number>,
  speed: { hard: 2, easy: 0 } as Record<HolidayDiff, number>,
};

/** Each villain's song, and how the course is charted to it. */
interface SongChart {
  /** Chart beats are every `stride`-th beat of the song's beat map. */
  stride: number;
  /** The course ends here (s), before the song fades. */
  end: number;
  /** Beats per phrase (the course changes on phrase lines). */
  phrase: number;
  /** Beats between obstacles on foot, between Glider gates and between Roller flips. */
  step: Record<HolidayDiff, number>;
  glide: Record<HolidayDiff, number>;
  roll: Record<HolidayDiff, number>;
}

function chartFor(v: Villain): SongChart {
  const t = TRACKS.find((x) => x.file === VILLAINS[v].song)!;
  if (v === 'frost') {
    // Merry X-mas runs at 168 BPM: chart on every other beat (84 per minute).
    return { stride: 2, end: t.duration - 3, phrase: 16, step: { hard: 1, easy: 2 }, glide: { hard: 1, easy: 1 }, roll: { hard: 1, easy: 2 } };
  }
  // Carol of the Bells at 140 BPM, looped three times; it fades over the last four seconds.
  return { stride: 1, end: t.duration - 4.5, phrase: 32, step: { hard: 2, easy: 4 }, glide: { hard: 1, easy: 2 }, roll: { hard: 2, easy: 4 } };
}

/** The villain's song as a music id. */
export function holidayTrack(v: Villain): number {
  return TRACK_BASE + TRACKS.findIndex((t) => t.file === VILLAINS[v].song);
}

/** Runners start at this x (LEVEL_START_X + half a tile). */
const X0 = 2.5;
const BIG = 1;

type Mode = 'square' | 'triangle' | 'hexagon' | 'diamond';
const MODE_V: Record<Mode, number> = { square: 0, triangle: 1, hexagon: 2, diamond: 3 };

export interface HolidayPlan {
  level: LevelContent;
  /** Where each chapter starts (tile x); the last is the boss fight. */
  chapters: number[];
  /** Where each press the music asks for happens (tile x; the Glider is held, not listed). */
  taps: number[];
}

/** Build the day's course. Deterministic for (difficulty, villain, seed). */
export function holidayPlan(diff: HolidayDiff, villain: Villain, seed: number): HolidayPlan {
  const hard = diff === 'hard';
  const v = LEVEL_SPEEDS[HOLIDAY_RULES.speed[diff]];
  const song = chartFor(villain);
  const rng = new Rng((seed ^ (hard ? 0x5a17 : 0x2c09) ^ (villain === 'krampus' ? 0x4b00 : 0)) >>> 0);
  const course = courseBuilder();
  const { pieces, put } = course;
  /** Where each press the music asks for happens (tile x): for the press-on-the-beat tests. */
  const taps: number[] = [];
  /** Where a runner's centre is at song time t (fractional: obstacles sit exactly on the beat). */
  const col = (t: number) => X0 + v * t;
  // The song's real beats (its beat map), counted from a bar line.
  const map = beatMapFor(VILLAINS[villain].song)!;
  const k0 = map.downbeat;
  const beatAt = (k: number) => beatTime(map, k * song.stride + k0);
  const gem = (t: number, y: number, big = false) => put('gem', col(t), y, big ? BIG : 0);

  const totalBeats = Math.floor((beatIndexAt(map, song.end) - k0) / song.stride);
  const firstBeat = song.phrase / 4;
  const phrases = Math.ceil((totalBeats - firstBeat) / song.phrase);
  // Chapters: the boss gets the last quarter, the other four share the rest.
  const bossP = Math.max(2, Math.round(phrases * 0.25));
  const rest = phrases - bossP;
  const counts = [0, 1, 2, 3].map((i) => Math.floor(rest / 4) + (i < rest % 4 ? 1 : 0));
  const chapterOf: number[] = [];
  counts.forEach((n, c) => {
    for (let i = 0; i < n; i++) chapterOf.push(c);
  });
  while (chapterOf.length < phrases) chapterOf.push(4);
  const firstPhrase = (c: number) => chapterOf.indexOf(c);

  for (let k = 0; k < firstBeat; k += 2) gem(beatAt(k) + 0.1, 0);

  let mode: Mode = 'square';
  for (let p = 0; p < phrases; p++) {
    const chapter = chapterOf[p];
    const inChapter = p - firstPhrase(chapter);
    const next: Mode = chapter === 1 ? 'diamond' : chapter === 2 ? (inChapter % 2 === 1 ? 'hexagon' : 'square') : chapter === 3 ? 'triangle' : 'square';
    const start = firstBeat + p * song.phrase;
    const end = Math.min(totalBeats - 2, start + song.phrase);
    let k = start;
    if (next !== mode) {
      put('portal', col(beatAt(start)), 0, MODE_V[next]);
      mode = next;
      k = start + Math.max(1, song.phrase / 16);
    }
    if (mode === 'triangle') chartGlider(k, end);
    else if (mode === 'hexagon') chartRoller(k, end);
    else for (; k + 1 < end; k += song.step[diff]) chartJump(chapter, mode, beatAt(k), k);
  }

  /** On foot (or hopping): one obstacle per step, landing where the jump peaks. */
  function chartJump(chapter: number, m: Mode, ta: number, k: number): void {
    const apex = m === 'diamond' ? 0.29 : 0.25;
    const c = col(ta + apex);
    taps.push(col(ta));
    const r = rng.range(0, 1);
    if (chapter === 1) {
      // The Frozen Lake (Hopper): penguins, icicles and ice spikes.
      if (r < 0.35) put('saw', c, 0, SAW_PENGUIN);
      else if (r < 0.6) put('saw', c, 0, SAW_ICICLE);
      else if (hard && r > 0.8) {
        put('spike', c - 0.5);
        put('spike', c + 0.5);
      } else put('spike', c);
      gem(ta + apex, 2);
      return;
    }
    if (chapter === 4) {
      // The lair: icicles and snowballs he throws, and a present on top of every jump.
      if (r < 0.3) put('saw', c, 0, SAW_ICICLE);
      else if (r < 0.55) put('saw', c, 0, SAW_SNOWBALL);
      else if (r < 0.75) course.pits(c, hard ? 3 : 2, hard ? 0.15 : 0.35);
      else {
        put('spike', c - 0.5);
        put('spike', c + 0.5);
      }
      gem(ta + apex, 2, true);
      return;
    }
    if (chapter === 2) {
      // Santa's Workshop: toy soldiers, jack-in-the-boxes and stacked toy blocks.
      if (r < 0.3) put('saw', c, 0, SAW_SOLDIER);
      else if (r < 0.55) put('saw', c, 0, SAW_JACKBOX);
      else if (r < 0.8) course.blocks(c, hard ? 3 : 2, hard ? 0.5 : 0);
      else {
        put('spike', c - 0.5);
        put('spike', c + 0.5);
      }
      gem(ta + apex, k % 8 === 0 ? 3 : 2);
      return;
    }
    // Snowy Pine Forest: snowmen, lobbed snowballs, drifts and frozen spikes.
    if (r < 0.32) {
      put('saw', c, 0, SAW_SNOWMAN);
    } else if (r < 0.47) put('saw', c, 0, SAW_SNOWBALL);
    else if (r < 0.65) course.pits(c, hard ? 3 : 2, hard ? 0.15 : 0.35);
    else if (r < 0.85 || !hard) course.blocks(c, hard ? 3 : 2, hard ? 0.5 : 0);
    else {
      put('spike', c - 1);
      put('spike', c);
      put('spike', c + 1);
    }
    gem(ta + apex, k % 8 === 0 ? 3 : 2);
  }

  /** Candy Cane Peaks (Glider, in a sleigh): a gate on every step, the gap swinging high and low. */
  function chartGlider(k0: number, end: number): void {
    const gap = hard ? 3 : 4;
    let low = true;
    for (let k = k0 + 1; k < end; k += song.glide[diff]) {
      const x = col(beatAt(k));
      const lo = hard ? (low ? 2 : 4) : low ? 1 : 7 - gap;
      const hi = lo + gap - 1;
      for (let y = 0; y < lo; y++) put('block', x, y);
      // Low gaps: a giant snowflake drifts above instead of a wall (fly under it).
      if (low && hi <= 4) put('saw', x, hi + 2, SAW_SNOWFLAKE);
      else for (let y = hi + 1; y < 8; y++) put('block', x, y);
      gem(beatAt(k), lo + 1);
      if (hard ? rng.range(0, 1) < 0.75 : true) low = !low;
    }
  }

  /** The workshop's conveyor (Roller): flip on the beat; spikes cover the surface you left. */
  function chartRoller(k0: number, end: number): void {
    const every = song.roll[diff];
    let onCeil = false;
    for (let k = k0 + 1; k + every <= end; k += every) {
      onCeil = !onCeil;
      taps.push(col(beatAt(k)));
      const from = col(beatAt(k) + 0.55);
      const to = col(beatAt(k + every) - 0.1);
      const len = Math.min(to - from, hard ? 5 : 3);
      const mid = Math.floor((from + to) / 2) - Math.floor(len / 2);
      for (let i = 0; i < len; i++) put('spike', mid + i + 0.5, onCeil ? 0 : 7, onCeil ? 0 : 1);
      gem(beatAt(k) + 0.3, 4);
    }
  }

  const chapters = [0, 1, 2, 3, 4].map((c) => (c === 0 ? 0 : Math.floor(col(beatAt(firstBeat + firstPhrase(c) * song.phrase)))));
  return {
    chapters,
    taps,
    level: {
      name: [0, 0],
      title: 'Holiday Run',
      authors: [],
      theme: 5,
      music: holidayTrack(villain),
      speed: HOLIDAY_RULES.speed[diff],
      hearts: HOLIDAY_RULES.hearts[diff],
      length: Math.floor(col(song.end)) + 2,
      pieces: [...pieces.values()],
    },
  };
}

/** The course as a playable (not saved) level. */
export function holidayLevel(diff: HolidayDiff, villain: Villain, seed: number): LevelData {
  return { ...holidayPlan(diff, villain, seed).level, id: `holiday-${villain}-${diff}-${seed}`, created: 0, updated: 0, verified: true, best: 0, plays: 0, origin: 'code' };
}

/**
 * Gems for a run: collected gems at the difficulty's rate, plus the big
 * bonus for beating the villain (or a smaller one for reaching the end while
 * he got away).
 */
export function holidayPayout(diff: HolidayDiff, gems: number, finished: boolean, beaten: boolean): number {
  const bonus = beaten ? HOLIDAY_RULES.villainBonus[diff] : finished ? HOLIDAY_RULES.escapeBonus[diff] : 0;
  return Math.round(gems * HOLIDAY_RULES.gemRate[diff]) + bonus;
}
