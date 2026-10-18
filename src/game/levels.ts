import type { BeatGrid } from './generator';

/**
 * Endless levels last exactly one song: a level starts when its song starts
 * and ends when the song does, so the music never cuts off mid-song. Levels
 * are measured in metres of run distance (0 = the run's start), worked out
 * from each song's length and the speed along the way. Built lazily, one
 * level at a time, as the course is generated.
 */
export interface LevelSong {
  id: number;
  /** How long the level lasts (the song's length). */
  seconds: number;
  grid: BeatGrid | null;
}

export interface LevelSpan {
  /** 0-based level index (Level 1 = 0). */
  index: number;
  start: number;
  end: number;
  song: LevelSong;
}

/**
 * About how far one level goes (an average song at Endless speed). Starting
 * from a later level puts you this far per level into the run, so the speed
 * and difficulty fit, and older saves' best distances convert with it.
 */
export const LEVEL_NOMINAL = 1200;

/** Songs shorter than this play twice (or more) so a level never flashes by. */
export const MIN_LEVEL_SECONDS = 40;
/** Never longer than this, whatever the song (a stuck clock or a bad file). */
const MAX_LEVEL_SECONDS = 420;

export class LevelTimeline {
  private readonly spans: LevelSpan[] = [];
  private readonly first: number;
  private readonly songFor: (index: number) => LevelSong;
  private readonly speedAt: (distance: number) => number;

  /**
   * @param first   index of the level the run starts in
   * @param startAt run distance where that level starts
   * @param songFor the song planned for a level
   * @param speedAt runner speed (m/s) at a run distance
   */
  constructor(first: number, startAt: number, songFor: (index: number) => LevelSong, speedAt: (distance: number) => number) {
    this.first = first;
    this.songFor = songFor;
    this.speedAt = speedAt;
    this.push(first, startAt);
  }

  /** The level being played at a run distance (never before the run's first level). */
  at(distance: number): LevelSpan {
    while (this.spans[this.spans.length - 1].end <= distance) {
      const last = this.spans[this.spans.length - 1];
      this.push(last.index + 1, last.end);
    }
    for (let i = this.spans.length - 1; i > 0; i--) if (this.spans[i].start <= distance) return this.spans[i];
    return this.spans[0];
  }

  /** A level by index (from the run's first level on). */
  span(index: number): LevelSpan {
    const i = Math.max(this.first, index) - this.first;
    while (this.spans.length <= i) {
      const last = this.spans[this.spans.length - 1];
      this.push(last.index + 1, last.end);
    }
    return this.spans[i];
  }

  /** Seconds from the start of the level at `distance` to `distance` (where its song should be). */
  secondsInto(distance: number): number {
    const s = this.at(distance);
    let t = 0;
    let x = s.start;
    for (; x + 1 <= distance; x++) t += 1 / this.speedAt(x + 0.5);
    return t + Math.max(0, distance - x) / this.speedAt(x);
  }

  private push(index: number, start: number): void {
    const song = this.songFor(index);
    const len = song.seconds > 0 ? song.seconds : MIN_LEVEL_SECONDS * 3;
    const seconds = Math.min(MAX_LEVEL_SECONDS, len * Math.max(1, Math.ceil(MIN_LEVEL_SECONDS / len)));
    // Walk the speed curve a metre at a time until the song is over.
    let t = 0;
    let x = start;
    while (t < seconds) {
      const step = 1 / this.speedAt(x + 0.5);
      if (t + step > seconds) {
        x += (seconds - t) / step;
        break;
      }
      t += step;
      x += 1;
    }
    this.spans.push({ index, start, end: x, song: { ...song, seconds } });
  }
}
