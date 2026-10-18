import { describe, expect, it } from 'vitest';
import { World, type WorldObj } from '../src/game/world';
import { LevelGen, SECRET_LEVELS } from '../src/game/generator';
import { LevelTimeline } from '../src/game/levels';
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

/** Song-long levels (75 s songs) for a run whose distance 0 is at world x 2. */
const timeline = (diff: Difficulty, first = 0, at = 0) => new LevelTimeline(first, at, (i) => ({ id: i, seconds: 75, grid: null }), (d) => endlessSpeedAt(d + 2, false, diff));

describe('Golden Shapes', () => {
  for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
    it(`one per level, reachable with a ring tap and safe to ignore (${diff})`, () => {
      for (const seed of [3, 17, 99]) {
        const world = new World();
        const levels = timeline(diff);
        const end = levels.span(9).end;
        const gen = new LevelGen(world, { seed, kind: 'endless', diff, secrets: true, startX: 2, levels });
        gen.ensure(end + 50);
        const eggs = world.query(0, end).filter((o): o is WorldObj & { kind: 'secret' } => o.kind === 'secret');
        const found = eggs.map((e) => e.level);
        expect(new Set(found).size).toBe(found.length);
        // Most levels get one (a level spent in other shapes can skip it).
        expect(eggs.length).toBeGreaterThanOrEqual(7);
        for (const e of eggs) {
          expect(levels.at(e.x - 2).index + 1).toBe(e.level);
          expect(tryNook(world, e, diff, false)).toEqual({ got: false, hit: false });
          expect(tryNook(world, e, diff, true)).toEqual({ got: true, hit: false });
        }
      }
    });
  }

  it('no eggs without the option, none past the last level', () => {
    const w = new World();
    new LevelGen(w, { seed: 5, kind: 'endless', levels: timeline('medium') }).ensure(3000);
    expect(w.query(0, 3000).some((o) => o.kind === 'secret')).toBe(false);
    const late = new World();
    const start = SECRET_LEVELS * 1200;
    new LevelGen(late, { seed: 5, kind: 'endless', secrets: true, startX: 2 + start, offset: start, levels: timeline('medium', SECRET_LEVELS, start) }).ensure(start + 1500);
    expect(late.query(start, start + 1500).some((o) => o.kind === 'secret')).toBe(false);
  });

  it('starting from a later level still hides that level’s egg', () => {
    const w = new World();
    const start = 4 * 1200;
    const levels = timeline('medium', 4, start);
    const end = levels.span(4).end;
    new LevelGen(w, { seed: 8, kind: 'endless', secrets: true, startX: 2 + start, offset: start, levels }).ensure(end + 20);
    const eggs = w.query(start, end).filter((o) => o.kind === 'secret') as (WorldObj & { level: number })[];
    expect(eggs.map((e) => e.level)).toEqual([5]);
  });
});
