import raw from '../data/beatmaps.json';

/**
 * Beat maps for the recorded music (made by tools/beatmap/analyze.py from
 * the audio itself). Every beat is where the drums really hit, so the
 * charts follow the song's real timing, not an ideal fixed tempo that
 * drifts away from it. Each beat and half-beat ("tick") is scored by how
 * hard the kick and drums land there: charts put their taps on the
 * strongest ticks, like a rhythm game's note chart.
 */
export interface BeatMap {
  bpm: number;
  duration: number;
  /** Which beat (mod 4) starts a bar. */
  downbeat: number;
  /** Beat times (s). */
  beats: Float64Array;
  /** Beats and half-beats (s): even indexes are beats, odd ones half-beats. */
  ticks: Float64Array;
  /** 0..1 how hard each tick hits (kick-weighted). */
  score: Float32Array;
  /** 0..1 how loud the music is around each tick (quiet = a breather). */
  energy: Float32Array;
}

interface RawMap {
  bpm: number;
  duration: number;
  downbeat: number;
  beats: number[];
  ticks: number[];
  score: string;
  energy: string;
}

const RAW = raw as unknown as Record<string, RawMap>;
const cache = new Map<string, BeatMap | null>();

function times(deltas: number[]): Float64Array {
  const out = new Float64Array(deltas.length);
  let ms = 0;
  for (let i = 0; i < deltas.length; i++) {
    ms += deltas[i];
    out[i] = ms / 1000;
  }
  return out;
}

function digits(s: string): Float32Array {
  const out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = (s.charCodeAt(i) - 48 + 0.5) / 10;
  return out;
}

/** The beat map of a track file (e.g. "summers.mp3"), or null if it has none. */
export function beatMapFor(file: string): BeatMap | null {
  if (cache.has(file)) return cache.get(file)!;
  const r = RAW[file];
  const m: BeatMap | null = r
    ? { bpm: r.bpm, duration: r.duration, downbeat: r.downbeat, beats: times(r.beats), ticks: times(r.ticks), score: digits(r.score), energy: digits(r.energy) }
    : null;
  cache.set(file, m);
  return m;
}

/** Every file that has a map. */
export function mappedFiles(): string[] {
  return Object.keys(RAW);
}

/** Seconds per beat around beat k (from the neighbouring beats). */
export function beatLength(m: BeatMap, k = 0): number {
  const n = m.beats.length;
  const i = Math.max(1, Math.min(n - 1, Math.round(k)));
  return m.beats[i] - m.beats[i - 1];
}

/** The time of beat k (fractional k interpolates; before the first or after the last, the edge tempo carries on). */
export function beatTime(m: BeatMap, k: number): number {
  const n = m.beats.length;
  if (k <= 0) return m.beats[0] + k * (m.beats[1] - m.beats[0]);
  if (k >= n - 1) return m.beats[n - 1] + (k - (n - 1)) * (m.beats[n - 1] - m.beats[n - 2]);
  const i = Math.floor(k);
  return m.beats[i] + (k - i) * (m.beats[i + 1] - m.beats[i]);
}

/** Which beat a time falls on (fractional: 2.5 = halfway between beats 2 and 3). */
export function beatIndexAt(m: BeatMap, t: number): number {
  const b = m.beats;
  const n = b.length;
  if (t <= b[0]) return (t - b[0]) / (b[1] - b[0]);
  if (t >= b[n - 1]) return n - 1 + (t - b[n - 1]) / (b[n - 1] - b[n - 2]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (b[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - b[lo]) / (b[hi] - b[lo]);
}

/** 0 on a beat, rising to 1 just before the next (for pulses that follow the song). */
export function beatPhaseAt(m: BeatMap, t: number): number {
  const k = beatIndexAt(m, t);
  return k - Math.floor(k);
}

/** First tick index at or after time t. */
function tickAfter(m: BeatMap, t: number): number {
  const ticks = m.ticks;
  let lo = 0;
  let hi = ticks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ticks[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** How loud the music is around time t (0..1). */
export function energyAt(m: BeatMap, t: number): number {
  const i = Math.min(m.ticks.length - 1, tickAfter(m, t));
  return m.energy[i] ?? 0;
}

export interface TickPick {
  t: number;
  score: number;
  /** A beat (not a half-beat). */
  onBeat: boolean;
}

/**
 * The best tick to tap on between `from` and `to` seconds: the hardest hit,
 * with beats preferred over half-beats (strongly so for young players) and
 * ticks near `target` preferred over far ones. Null when there's none.
 */
export function bestTick(m: BeatMap, from: number, to: number, target: number, opts: { beatBonus?: number } = {}): TickPick | null {
  const bonus = opts.beatBonus ?? 0.25;
  const len = beatLength(m, beatIndexAt(m, target));
  let best: TickPick | null = null;
  let bestScore = -Infinity;
  for (let i = tickAfter(m, from); i < m.ticks.length && m.ticks[i] <= to; i++) {
    const t = m.ticks[i];
    const onBeat = i % 2 === 0;
    const s = m.score[i] + (onBeat ? bonus : 0) - (0.35 * Math.abs(t - target)) / len;
    if (s > bestScore) {
      bestScore = s;
      best = { t, score: m.score[i], onBeat };
    }
  }
  return best;
}
