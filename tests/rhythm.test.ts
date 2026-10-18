import { describe, expect, it } from 'vitest';
import { judge, RHYTHM, RhythmScore } from '../src/game/rhythm';

describe('Rhythm Rush', () => {
  it('judges presses by how close they are to the beat', () => {
    expect(judge(0)).toBe('perfect');
    expect(judge(-0.05)).toBe('perfect');
    expect(judge(0.1)).toBe('great');
    expect(judge(-0.13)).toBe('great');
    expect(judge(0.2)).toBe('miss');
  });

  it('on-beat presses build a combo that multiplies the score; a miss breaks it', () => {
    const r = new RhythmScore();
    for (let i = 0; i < RHYTHM.comboStep; i++) r.press(0);
    expect(r.combo).toBe(RHYTHM.comboStep);
    expect(r.mult).toBe(2);
    // Seven at ×1, then the 8th press reaches the next step and counts double.
    expect(r.score).toBe((RHYTHM.comboStep - 1) * 100 + 200);
    const before = r.score;
    expect(r.press(0.01).points).toBe(200);
    expect(r.score).toBe(before + 200);
    expect(r.press(0.3).judgement).toBe('miss');
    expect(r.combo).toBe(0);
    expect(r.mult).toBe(1);
    expect(r.bestCombo).toBe(RHYTHM.comboStep + 1);
    expect([r.perfects, r.greats, r.misses]).toEqual([RHYTHM.comboStep + 1, 0, 1]);
  });

  it('the multiplier tops out', () => {
    const r = new RhythmScore();
    for (let i = 0; i < 200; i++) r.press(0);
    expect(r.mult).toBe(RHYTHM.maxMult);
  });
});
