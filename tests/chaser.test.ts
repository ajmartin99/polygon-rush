import { describe, expect, it } from 'vitest';
import { Chaser, CHASER_TUNING, chaserKindFor, obstacleMarks } from '../src/game/chaser';
import { GameSession } from '../src/game/session';
import { hauntedLevel, type HauntedDiff } from '../src/meta/haunted';

const run = { x: 10, y: 0.43, mode: 'square' as const, gdir: -1 };
const DT = 1 / 120;

function chased(diff: HauntedDiff, seed: number) {
  const s = new GameSession({ kind: 'custom', seed: 1, level: hauntedLevel(diff, seed), racers: [{ id: 'b', name: 'b', skin: 'classic', kind: 'bot', skill: 1 }], chaser: diff });
  s.running = true;
  return s;
}

describe('Haunted Run chaser', () => {
  it('is a zombie on the ground and a ghost when gliding', () => {
    expect(chaserKindFor('square')).toBe('zombie');
    expect(chaserKindFor('hexagon')).toBe('zombie');
    expect(chaserKindFor('diamond')).toBe('zombie');
    expect(chaserKindFor('triangle')).toBe('ghost');
    const c = new Chaser('hard');
    c.update(DT, run);
    expect(c.update(DT, { ...run, mode: 'triangle' })).toBe('morph');
    expect(c.kind).toBe('ghost');
  });

  it('counts each obstacle once, merging close neighbours', () => {
    expect(
      obstacleMarks([
        { x0: 10, x1: 11 },
        { x0: 11, x1: 12 },
        { x0: 20, x1: 21 },
      ]),
    ).toEqual([12, 21]);
  });

  it('catches a runner who never clears anything', () => {
    const c = new Chaser('hard');
    let t = 0;
    while (!c.caught && t < 60) {
      c.update(DT, run);
      t += DT;
    }
    expect(c.caught).toBe(true);
    const expected = CHASER_TUNING.grace + (CHASER_TUNING.start - CHASER_TUNING.catchAt) / CHASER_TUNING.creep.hard;
    expect(t).toBeCloseTo(expected, 0);
  });

  it('gems shove it back; a bump lets it lunge', () => {
    const c = new Chaser('easy');
    c.update(DT, run);
    const g = c.gap;
    expect(c.onGem(1)).toBe('shove');
    expect(c.gap).toBeGreaterThan(g);
    const before = c.gap;
    expect(c.onHit()).toBe('lunge');
    expect(c.gap).toBeCloseTo(before - CHASER_TUNING.hit);
    expect(c.lunge).toBeGreaterThan(0);
  });

  for (const diff of ['hard', 'easy'] as HauntedDiff[]) {
    it(`clean ${diff} play stays ahead to the end of the song (but it gets close)`, () => {
      for (const seed of [11, 202, 3003, 40004]) {
        const s = chased(diff, seed);
        const r = s.racers[0];
        let min = Infinity;
        while (!r.finished && !r.dead && s.time < 200) {
          s.step();
          if (s.time > 3) min = Math.min(min, s.chaser!.gap);
        }
        expect(r.finished, `${diff} seed ${seed}`).toBe(true);
        expect(min, `${diff} seed ${seed}`).toBeGreaterThan(CHASER_TUNING.warnAt);
        expect(min, `${diff} seed ${seed}`).toBeLessThan(CHASER_TUNING.start);
      }
    });
  }

  it('being caught ends the run', () => {
    const s = chased('easy', 11);
    const r = s.racers[0];
    let died = false;
    let caught = false;
    s.on('death', () => (died = true));
    s.on('chaser', ({ event }) => (caught ||= event === 'caught'));
    s.chaser!.gap = CHASER_TUNING.catchAt + 0.01;
    for (let i = 0; i < 240 * 3 && !r.dead; i++) s.step();
    expect(caught).toBe(true);
    expect(died).toBe(true);
    expect(r.dead).toBe(true);
  });
});
