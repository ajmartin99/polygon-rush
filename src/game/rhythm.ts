/**
 * Rhythm Rush: every press (jump, hop, flip, glide) is judged against the
 * beat of the music. Presses on the beat build a combo, and the combo raises
 * a score multiplier; a press off the beat breaks it. Pure scoring, so it
 * can be tested.
 */
export type Judgement = 'perfect' | 'great' | 'miss';

export const RHYTHM = {
  /** Seconds either side of the beat. */
  perfect: 0.07,
  great: 0.14,
  points: { perfect: 100, great: 50, miss: 0 } as Record<Judgement, number>,
  /** The multiplier goes up one step every this many combo presses... */
  comboStep: 8,
  /** ...up to this. */
  maxMult: 4,
};

export function judge(error: number): Judgement {
  const a = Math.abs(error);
  return a <= RHYTHM.perfect ? 'perfect' : a <= RHYTHM.great ? 'great' : 'miss';
}

export class RhythmScore {
  score = 0;
  combo = 0;
  bestCombo = 0;
  perfects = 0;
  greats = 0;
  misses = 0;

  get mult(): number {
    return Math.min(RHYTHM.maxMult, 1 + Math.floor(this.combo / RHYTHM.comboStep));
  }

  /** Judge a press `error` seconds from the beat; returns the judgement and the points it earned. */
  press(error: number): { judgement: Judgement; points: number } {
    const j = judge(error);
    if (j === 'miss') {
      this.misses++;
      this.combo = 0;
      return { judgement: j, points: 0 };
    }
    if (j === 'perfect') this.perfects++;
    else this.greats++;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const points = RHYTHM.points[j] * this.mult;
    this.score += points;
    return { judgement: j, points };
  }
}
