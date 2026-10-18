import { TRACK_BASE, TRACKS } from '../core/tracks';
import { Rng } from '../core/rng';
import { LEVEL_SPEEDS, type LevelContent, type LevelData, type Piece } from '../game/level';

/**
 * Haunted Run (Spooky Season): a fixed course charted to Swing Along. Every
 * action lands on the song's beat (press on the beat and you clear it), the
 * shape changes with the music's 8-bar phrases, and the finish line is the
 * end of the song. A new chart each day, the same for everyone. Hard pays
 * full gems; Easy is slower with more room and pays half.
 */
export type HauntedDiff = 'hard' | 'easy';

const SONG_FILE = 'swing-along.mp3';
/** Swing Along's track id (TRACK_BASE + index). */
export const HAUNTED_TRACK = TRACK_BASE + TRACKS.findIndex((t) => t.file === SONG_FILE);
const SONG = TRACKS.find((t) => t.file === SONG_FILE)!;
/** Song length (s) and where the course ends (just before the last notes fade). */
export const SONG_SECONDS = 134.9;
const END_AT = SONG_SECONDS - 2;
const BEAT = 60 / (SONG.bpm ?? 130.7);
const OFFSET = SONG.offset ?? 0.07;
/** Runners start at this x (LEVEL_START_X + half a tile). */
const X0 = 2.5;

export const HAUNTED_RULES = {
  /** Attempts per 24 hours, shared by both difficulties; the best run counts. */
  attempts: 2,
  windowMs: 24 * 60 * 60 * 1000,
  gemRate: { hard: 1, easy: 0.5 } as Record<HauntedDiff, number>,
  /** Paid on reaching the end of the song (scaled by the rate). */
  finishBonus: 1200,
  /** Hearts in a run: Hard is one bump and out. */
  hearts: { hard: 1, easy: 3 } as Record<HauntedDiff, number>,
  /** Speed index into LEVEL_SPEEDS. */
  speed: { hard: 2, easy: 0 } as Record<HauntedDiff, number>,
};

type Mode = 'square' | 'triangle' | 'hexagon' | 'diamond';
const MODE_V: Record<Mode, number> = { square: 0, triangle: 1, hexagon: 2, diamond: 3 };

/** Build the day's course. Deterministic for (difficulty, seed). */
export function hauntedCourse(diff: HauntedDiff, seed: number): LevelContent {
  const hard = diff === 'hard';
  const v = LEVEL_SPEEDS[HAUNTED_RULES.speed[diff]];
  const rng = new Rng((seed ^ (hard ? 0x7a11 : 0x3e5d)) >>> 0);
  const pieces = new Map<string, Piece>();
  const put = (t: Piece['t'], x: number, y = 0, pv = 0) => {
    if (x < 6 || y < 0 || y > 7) return;
    const key = t === 'pit' || t === 'portal' ? `${t}:${x}` : `${x}:${y}`;
    if (!pieces.has(key)) pieces.set(key, { t, x, y, v: pv });
  };
  /** Column a runner's centre reaches at song time t. */
  const col = (t: number) => Math.floor(X0 + v * t);
  const beatAt = (k: number) => OFFSET + k * BEAT;
  const gem = (t: number, y: number, big = false) => put('gem', col(t), y, big ? 1 : 0);

  const totalBeats = Math.floor((END_AT - OFFSET) / BEAT);
  // 8 beats of runway (the song's first two bars), then 32-beat phrases.
  const firstBeat = 8;
  const order: Mode[] = ['square'];
  const others: Mode[] = ['triangle', 'hexagon', 'diamond'];
  const phrases = Math.ceil((totalBeats - firstBeat) / 32);
  for (let i = 1; i < phrases; i++) {
    const pool = i % 2 === 1 ? others : (['square', ...others] as Mode[]);
    let m = pool[Math.floor(rng.range(0, 1) * pool.length)];
    if (m === order[i - 1]) m = pool[(pool.indexOf(m) + 1) % pool.length];
    order.push(m);
  }
  order[order.length - 1] = 'square'; // the finale is a Jumper sprint

  for (let k = 0; k < firstBeat; k += 2) gem(beatAt(k) + 0.1, 0);

  let mode: Mode = 'square';
  for (let p = 0; p < phrases; p++) {
    const start = firstBeat + p * 32;
    const end = Math.min(totalBeats - 2, start + 32);
    const next = order[p];
    let k = start;
    if (next !== mode) {
      // Portal on the downbeat, then one beat to settle.
      put('portal', col(beatAt(start)), 0, MODE_V[next]);
      mode = next;
      k = start + 2;
    }
    const step = hard ? 2 : 4;
    if (mode === 'triangle') k = chartGlider(k, end, hard);
    else if (mode === 'hexagon') chartRoller(k, end, hard);
    else for (; k + 1 < end; k += step) chartJump(mode, beatAt(k), hard, k);
  }

  function chartJump(m: Mode, ta: number, hardOn: boolean, k: number): void {
    // Press on the beat: the obstacle sits where the jump peaks.
    const apex = m === 'diamond' ? 0.29 : 0.25;
    const c = col(ta + apex);
    const r = rng.range(0, 1);
    if (m === 'diamond') {
      put('spike', c);
      if (hardOn && r < 0.5) put('spike', c + 1);
      gem(ta + apex, 2);
      return;
    }
    if (r < 0.3) {
      put('spike', c);
      if (hardOn) put('spike', c + 1);
    } else if (r < 0.5) {
      put('saw', c, 0, 0);
    } else if (r < 0.7) {
      put('pit', c - 1);
      put('pit', c);
      if (hardOn) put('pit', c + 1);
    } else if (r < 0.85 || !hardOn) {
      put('block', c);
      put('block', c + 1);
      if (hardOn) put('spike', c + 2);
    } else {
      // Spike, then a ring right above it for a second jump on the off-beat.
      put('spike', c);
      put('spike', c + 1);
      put('spike', c + 2);
    }
    gem(ta + apex, k % 8 === 0 ? 3 : 2, k % 16 === 0);
  }

  /** Glider: a gate on every beat (Easy: every other), gaps switching high and low. */
  function chartGlider(k0: number, end: number, hardOn: boolean): number {
    const gap = hardOn ? 3 : 4;
    let low = true;
    let k = k0 + 1;
    for (; k < end; k += hardOn ? 1 : 2) {
      const x = col(beatAt(k));
      // Hard: gates every beat, so the gap only moves 2 rows (rows 2-4 or 4-6); Easy swings wider.
      const lo = hardOn ? (low ? 2 : 4) : low ? 1 : 7 - gap;
      const hi = lo + gap - 1;
      for (let y = 0; y < lo; y++) put('block', x, y);
      for (let y = hi + 1; y < 8; y++) put('block', x, y);
      gem(beatAt(k), lo + 1);
      if (hardOn ? rng.range(0, 1) < 0.75 : true) low = !low;
    }
    return k;
  }

  /** Roller: flip on the beat; the surface you just left fills with spikes. */
  function chartRoller(k0: number, end: number, hardOn: boolean): void {
    const every = hardOn ? 2 : 4;
    let onCeil = false;
    for (let k = k0 + 1; k + every <= end; k += every) {
      onCeil = !onCeil;
      // Flip at beat k: you arrive about a beat later; spikes cover the surface you left until the next flip.
      const from = col(beatAt(k) + 0.55);
      const to = col(beatAt(k + every) - 0.1);
      const len = Math.min(to - from, hardOn ? 5 : 3);
      const mid = Math.floor((from + to) / 2) - Math.floor(len / 2);
      for (let i = 0; i < len; i++) put('spike', mid + i, onCeil ? 0 : 7, onCeil ? 0 : 1);
      gem(beatAt(k) + 0.3, 4);
    }
  }

  const length = col(END_AT) + 2;
  return {
    name: [55, 61],
    title: 'Haunted Run',
    authors: [],
    theme: 4,
    music: HAUNTED_TRACK,
    speed: HAUNTED_RULES.speed[diff],
    hearts: HAUNTED_RULES.hearts[diff],
    length,
    pieces: [...pieces.values()],
  };
}

/** The course as a playable (not saved) level. */
export function hauntedLevel(diff: HauntedDiff, seed: number): LevelData {
  return { ...hauntedCourse(diff, seed), id: `haunted-${diff}-${seed}`, created: 0, updated: 0, verified: true, best: 0, plays: 0, origin: 'code' };
}

// ------------------------------------------------------------------ attempts
export interface HauntedState {
  /** Start of the current 24-hour window (0 = none yet). */
  windowStart: number;
  /** Attempts used in this window. */
  used: number;
  /** Heart Regens bought and not used yet. */
  regens: number;
  /** Best progress 0..1 in this window, per difficulty. */
  best: Record<HauntedDiff, number>;
  /** Songs finished ever, per difficulty. */
  clears: Record<HauntedDiff, number>;
}

export function emptyHaunted(): HauntedState {
  return { windowStart: 0, used: 0, regens: 0, best: { hard: 0, easy: 0 }, clears: { hard: 0, easy: 0 } };
}

/** Roll the 24-hour window over when it has passed. Mutates `h`. */
export function refreshWindow(h: HauntedState, now = Date.now()): void {
  if (h.windowStart && now - h.windowStart >= HAUNTED_RULES.windowMs) {
    h.windowStart = 0;
    h.used = 0;
    h.best = { hard: 0, easy: 0 };
  }
}

export function attemptsLeft(h: HauntedState, now = Date.now()): number {
  refreshWindow(h, now);
  return Math.max(0, HAUNTED_RULES.attempts - h.used);
}

/** Milliseconds until attempts refill (0 when some are left). */
export function refillIn(h: HauntedState, now = Date.now()): number {
  if (attemptsLeft(h, now) > 0) return 0;
  return Math.max(0, h.windowStart + HAUNTED_RULES.windowMs - now);
}

/** Spend an attempt (starts the 24-hour clock on the first one). Returns false when none are left. */
export function useAttempt(h: HauntedState, now = Date.now()): boolean {
  if (attemptsLeft(h, now) <= 0) return false;
  if (!h.windowStart) h.windowStart = now;
  h.used += 1;
  return true;
}

/** Heart Regen: full attempts again and a fresh 24-hour clock. Returns false without a regen. */
export function useRegen(h: HauntedState, now = Date.now()): boolean {
  if (h.regens <= 0) return false;
  h.regens -= 1;
  h.windowStart = now;
  h.used = 0;
  h.best = { hard: 0, easy: 0 };
  return true;
}

/** Gems for a run: collected gems plus the finish bonus, at the difficulty's rate. */
export function hauntedPayout(diff: HauntedDiff, gems: number, finished: boolean): number {
  const rate = HAUNTED_RULES.gemRate[diff];
  return Math.round((gems + (finished ? HAUNTED_RULES.finishBonus : 0)) * rate);
}
