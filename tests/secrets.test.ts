import { describe, expect, it } from 'vitest';
import { World, type WorldObj } from '../src/game/world';
import { LevelGen, SECRET_LEVELS } from '../src/game/generator';
import { createBody, newEvents, stepBody } from '../src/game/physics';
import { endlessSpeedAt, type Difficulty } from '../src/game/constants';

/** Fly through one secret nook: tapping on the ring or not. */
function tryNook(world: World, egg: WorldObj & { kind: 'secret' }, diff: Difficulty, tap: boolean) {
  const orb = world.query(egg.x - 8, egg.x).filter((o) => o.kind === 'orb').pop()!;
  const pad = world.query(orb.x - 8, orb.x).filter((o) => o.kind === 'pad').pop()!;
  const body = createBody(pad.x - 4);
  const ev = newEvents();
  let got = false;
  let hit = false;
  let tapped = false;
  while (body.x < egg.x + 30) {
    const speed = endlessSpeedAt(body.x, false, diff);
    if (tap && !tapped && !body.grounded && Math.abs(orb.x - body.x) < 0.25) {
      body.lastPress = body.t;
      tapped = true;
    }
    stepBody(body, false, world, { speed, ghost: false }, ev);
    if (ev.hit || ev.fell) hit = true;
    if (Math.abs(egg.x - body.x) < 0.85 && Math.abs(egg.y - body.y) < 0.95) got = true;
    // Landed after the launch: the nook is done (what follows is the normal course).
    if (body.grounded && body.x > orb.x) break;
  }
  return { got, hit };
}

describe('secret eggs', () => {
  for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
    it(`one per level, reachable with a ring tap and safe to ignore (${diff})`, () => {
      for (const seed of [3, 17, 99]) {
        const world = new World();
        const gen = new LevelGen(world, { seed, kind: 'endless', diff, secrets: true });
        gen.ensure(10 * 500 + 50);
        const eggs = world.query(0, 10 * 500).filter((o): o is WorldObj & { kind: 'secret' } => o.kind === 'secret');
        const levels = eggs.map((e) => e.level);
        expect(new Set(levels).size).toBe(levels.length);
        // Most levels get one (a level spent in other shapes can skip it).
        expect(eggs.length).toBeGreaterThanOrEqual(7);
        for (const e of eggs) {
          expect(Math.floor((e.x - 2) / 500) + 1).toBe(e.level);
          expect(tryNook(world, e, diff, false)).toEqual({ got: false, hit: false });
          expect(tryNook(world, e, diff, true)).toEqual({ got: true, hit: false });
        }
      }
    });
  }

  it('no eggs without the option, none past the last level', () => {
    const w = new World();
    new LevelGen(w, { seed: 5, kind: 'endless' }).ensure(3000);
    expect(w.query(0, 3000).some((o) => o.kind === 'secret')).toBe(false);
    const late = new World();
    const start = SECRET_LEVELS * 500;
    new LevelGen(late, { seed: 5, kind: 'endless', secrets: true, startX: 2 + start, offset: start }).ensure(start + 1500);
    expect(late.query(start, start + 1500).some((o) => o.kind === 'secret')).toBe(false);
  });

  it('starting from a later level still hides that level’s egg', () => {
    const w = new World();
    const start = 4 * 500;
    new LevelGen(w, { seed: 8, kind: 'endless', secrets: true, startX: 2 + start, offset: start }).ensure(start + 520);
    const eggs = w.query(start, start + 520).filter((o) => o.kind === 'secret') as (WorldObj & { level: number })[];
    expect(eggs.map((e) => e.level)).toEqual([5]);
  });
});
