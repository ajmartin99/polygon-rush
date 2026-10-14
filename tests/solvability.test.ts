import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { LevelGen } from '../src/game/generator';
import { BotBrain } from '../src/game/bot';
import { createBody, newEvents, stepBody } from '../src/game/physics';
import { endlessSpeedAt, RACE_SPEED } from '../src/game/constants';

interface RunResult {
  distance: number;
  hits: { x: number; mode: string; kind: string }[];
  modes: Set<string>;
}

/** Let a perfect bot play `distance` tiles and record every failure. */
export function playLevel(seed: number, kind: 'endless' | 'race', distance: number, opts: { kid?: boolean; difficulty?: number; margin?: number } = {}): RunResult {
  const world = new World();
  const gen = new LevelGen(world, { seed, kind, kid: opts.kid, length: kind === 'race' ? distance : undefined, difficulty: opts.difficulty });
  const bot = new BotBrain({ skill: 1, seed, margin: opts.margin ?? 0.05 });
  const body = createBody(2);
  const ev = newEvents();
  const hits: RunResult['hits'] = [];
  const modes = new Set<string>();
  let ghost = 0;
  while (body.x < distance) {
    gen.ensure(body.x + 60);
    const speed = kind === 'race' ? RACE_SPEED : endlessSpeedAt(body.x, !!opts.kid);
    const held = bot.update(body, world, kind === 'race' ? RACE_SPEED : (x: number) => endlessSpeedAt(x, !!opts.kid));
    stepBody(body, held, world, { speed, ghost: ghost > 0 }, ev);
    modes.add(body.mode);
    if (ghost > 0) ghost--;
    if ((ev.hit || ev.fell) && ghost === 0) {
      hits.push({ x: Math.round(body.x * 10) / 10, mode: body.mode, kind: ev.hit ? 'hit' : 'fell' });
      ghost = 180;
      if (ev.fell) {
        const gx = world.nextGroundX(body.x);
        body.x = Number.isFinite(gx) ? gx + 0.6 : body.x;
        body.y = 0.43;
        body.vy = 0;
        body.gdir = -1;
      }
    }
    world.prune(body.x - 30);
  }
  return { distance, hits, modes };
}

describe('level generator', () => {
  it('is deterministic for a seed', () => {
    const a = new World();
    const b = new World();
    new LevelGen(a, { seed: 42, kind: 'endless' }).ensure(1500);
    new LevelGen(b, { seed: 42, kind: 'endless' }).ensure(1500);
    expect(a.objs.length).toBe(b.objs.length);
    expect(a.objs.map((o) => `${o.kind}${o.x0.toFixed(3)}`).join()).toBe(b.objs.map((o) => `${o.kind}${o.x0.toFixed(3)}`).join());
  });

  it('keeps objects sorted by x', () => {
    const w = new World();
    new LevelGen(w, { seed: 7, kind: 'endless' }).ensure(3000);
    for (let i = 1; i < w.objs.length; i++) expect(w.objs[i].x0).toBeGreaterThanOrEqual(w.objs[i - 1].x0);
    // ...and out-of-order chunks only ever touch a small tail.
    expect(w.merges).toBeLessThan(40);
  });

  it('speeds up with distance', () => {
    expect(endlessSpeedAt(5000, false)).toBeGreaterThan(endlessSpeedAt(0, false));
    expect(endlessSpeedAt(0, true)).toBeLessThan(endlessSpeedAt(0, false));
  });
});

describe('every generated level is beatable', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (const seed of seeds) {
    it(`endless seed ${seed}`, () => {
      const r = playLevel(seed, 'endless', 4500);
      expect(r.hits, JSON.stringify(r.hits)).toEqual([]);
    });
  }
  for (const seed of [21, 22, 23, 24]) {
    it(`kid mode seed ${seed}`, () => {
      const r = playLevel(seed, 'endless', 2500, { kid: true });
      expect(r.hits, JSON.stringify(r.hits)).toEqual([]);
    });
  }
  for (const seed of [31, 32, 33, 34, 35, 36]) {
    it(`race seed ${seed}`, () => {
      const r = playLevel(seed, 'race', 900, { difficulty: 0.55 });
      expect(r.hits, JSON.stringify(r.hits)).toEqual([]);
    });
  }
});
