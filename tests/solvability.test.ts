import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { LevelGen, BEAT_LEVEL_LENGTH, type GenOptions } from '../src/game/generator';
import { BotBrain } from '../src/game/bot';
import { createBody, newEvents, stepBody } from '../src/game/physics';
import { endlessSpeedAt, RACE_SPEED, type Difficulty } from '../src/game/constants';
import { PATTERN_IDS } from '../src/game/generator';

interface RunResult {
  distance: number;
  hits: { x: number; mode: string; kind: string }[];
  modes: Set<string>;
}

/** Let a perfect bot play `distance` tiles and record every failure. */
export function playLevel(seed: number, kind: 'endless' | 'race', distance: number, opts: { kid?: boolean; difficulty?: number; margin?: number; diff?: Difficulty; start?: number; beat?: GenOptions['beat']; extra?: Partial<GenOptions> } = {}): RunResult {
  const world = new World();
  const start = opts.start ?? 0;
  const gen = new LevelGen(world, { seed, kind, kid: opts.kid, diff: opts.diff, startX: start ? 2 + start : undefined, offset: start || undefined, length: kind === 'race' ? distance : undefined, difficulty: opts.difficulty, beat: opts.beat, ...opts.extra });
  const bot = new BotBrain({ skill: 1, seed, margin: opts.margin ?? 0.05 });
  const body = createBody(2);
  body.x += start;
  const ev = newEvents();
  const hits: RunResult['hits'] = [];
  const modes = new Set<string>();
  let ghost = 0;
  while (body.x < distance) {
    gen.ensure(body.x + 60);
    const speed = kind === 'race' ? RACE_SPEED : endlessSpeedAt(body.x, !!opts.kid, opts.diff);
    const held = bot.update(body, world, kind === 'race' ? RACE_SPEED : (x: number) => endlessSpeedAt(x, !!opts.kid, opts.diff));
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

  it('gets harder sooner on Hard and later on Easy', () => {
    expect(endlessSpeedAt(0, false, 'hard')).toBeGreaterThan(endlessSpeedAt(0, false, 'medium'));
    expect(endlessSpeedAt(0, false, 'easy')).toBeLessThan(endlessSpeedAt(0, false, 'medium'));
    expect(endlessSpeedAt(2000, false, 'medium')).toBeGreaterThan(endlessSpeedAt(2000, false, 'easy'));
  });

  it('uses the new combo patterns once the run gets going', () => {
    const w = new World();
    const g = new LevelGen(w, { seed: 5, kind: 'endless', diff: 'hard' });
    const seen = new Set<string>();
    const orig = g.ensure.bind(g);
    for (let x = 200; x < 6000; x += 200) {
      orig(x);
      seen.add((g as unknown as { lastPattern: string }).lastPattern);
    }
    expect(PATTERN_IDS).toContain('sq_orb_chain');
    expect(seen.size).toBeGreaterThan(12);
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
  for (const seed of [41, 42, 43, 44, 45, 46, 47, 48]) {
    it(`hard seed ${seed}`, () => {
      const r = playLevel(seed, 'endless', 4500, { diff: 'hard' });
      expect(r.hits, JSON.stringify(r.hits)).toEqual([]);
    });
  }
  for (const [seed, level, diff] of [[71, 6, 'medium'], [72, 9, 'hard'], [73, 4, 'easy']] as const) {
    it(`starting at level ${level} (${diff}) seed ${seed}`, () => {
      const start = (level - 1) * 500;
      const r = playLevel(seed, 'endless', start + 1500, { diff, start });
      expect(r.hits, JSON.stringify(r.hits)).toEqual([]);
    });
  }
  for (const seed of [51, 52, 53]) {
    it(`easy seed ${seed}`, () => {
      const r = playLevel(seed, 'endless', 3000, { diff: 'easy' });
      expect(r.hits, JSON.stringify(r.hits)).toEqual([]);
    });
  }
  for (const seed of [61, 62, 63]) {
    it(`hard race seed ${seed}`, () => {
      const r = playLevel(seed, 'race', 900, { difficulty: 0.9 });
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

describe('beat-synced endless levels', () => {
  // A different song tempo every level, like the music shuffle.
  const songs = [{ bpm: 128, offset: 0.1 }, { bpm: 174, offset: 0.04 }, { bpm: 86, offset: 0.26 }, { bpm: 140, offset: 0.0 }, { bpm: 105, offset: 0.3 }, { bpm: 165, offset: 0.08 }];
  const beat = (level: number) => songs[level % songs.length];

  for (const [seed, diff] of [[81, 'medium'], [82, 'hard'], [83, 'easy'], [84, 'medium']] as const) {
    it(`stays beatable (${diff}) seed ${seed}`, () => {
      const r = playLevel(seed, 'endless', 4000, { diff, beat });
      expect(r.hits, JSON.stringify(r.hits)).toEqual([]);
    });
  }

  it('starts patterns on the beat of each level\'s song', () => {
    const world = new World();
    const gen = new LevelGen(world, { seed: 85, kind: 'endless', beat });
    // Record where each runway ends (= next pattern start).
    const starts: number[] = [];
    const orig = gen.ensure.bind(gen);
    let last = gen.x;
    while (gen.x < 1400) {
      orig(gen.x + 1);
      if (gen.x !== last) starts.push(gen.x);
      last = gen.x;
    }
    expect(gen.beatsHit).toBeGreaterThan(40);
    // Check timing for level 1 (128 bpm): seconds from the level start to each pattern start.
    let onBeat = 0;
    let total = 0;
    for (const x of starts.filter((x) => x > 30 && x < BEAT_LEVEL_LENGTH - 10)) {
      let t = 0;
      for (let p = 0; p + 1 <= x; p++) t += 1 / endlessSpeedAt(p + 0.5, false, 'medium');
      t += (x - Math.floor(x)) / endlessSpeedAt(Math.floor(x), false, 'medium');
      const unit = 60 / 128;
      const phase = (((t - 0.1) / unit) % 1 + 1) % 1;
      total++;
      if (phase < 0.02 || phase > 0.98) onBeat++;
    }
    expect(total).toBeGreaterThan(10);
    expect(onBeat / total).toBeGreaterThan(0.6);
  });

  it('leaves Daily Run / race courses identical without a beat', () => {
    const a = new World();
    const b = new World();
    new LevelGen(a, { seed: 7, kind: 'endless' }).ensure(1500);
    new LevelGen(b, { seed: 7, kind: 'endless', beat: () => null }).ensure(1500);
    expect(a.objs.map((o) => o.x0.toFixed(3)).join()).toBe(b.objs.map((o) => o.x0.toFixed(3)).join());
  });
});

describe('heat: long runs get chaotic but stay beatable', () => {
  for (const [seed, diff, dist] of [[91, 'hard', 7000], [92, 'hard', 7000], [93, 'hard', 7000], [101, 'hard', 6000], [102, 'hard', 6000], [103, 'hard', 6000], [104, 'hard', 6000], [94, 'medium', 7000], [95, 'medium', 6000], [105, 'medium', 6000], [106, 'medium', 6000], [96, 'easy', 5000]] as const) {
    it(`${diff} seed ${seed} to ${dist} m`, () => {
      const r = playLevel(seed, 'endless', dist, { diff });
      expect(r.hits, JSON.stringify(r.hits)).toEqual([]);
    });
  }

  it('unlocks moving hazards only once the run heats up', () => {
    const world = new World();
    const gen = new LevelGen(world, { seed: 97, kind: 'endless', diff: 'hard' });
    gen.ensure(600);
    expect(world.objs.some((o) => o.kind === 'saw' && o.move)).toBe(false);
    gen.ensure(5000);
    expect(world.objs.filter((o) => o.kind === 'saw' && o.move).length).toBeGreaterThan(10);
  });
});

describe('Daily Run twists', () => {
  const beat = (level: number) => [{ bpm: 116, offset: 0 }, { bpm: 150.3, offset: 0.09 }, { bpm: 100.2, offset: 0.27 }, { bpm: 120.3, offset: 0.36 }][level % 4];
  const twists = [
    { startMode: 'triangle', heatFloor: 0.35 },
    { startMode: 'hexagon', sectionScale: 0.55 },
    { startMode: 'diamond', heatFloor: 0.3 },
    { startMode: 'square', heatFloor: 0.15, sectionScale: 0.8, gemChance: 0.75 },
  ] as const;
  twists.forEach((t, i) => {
    it(`${JSON.stringify(t)} stays beatable`, () => {
      const r = playLevel(111 + i, 'endless', 3000, { beat, extra: t });
      expect(r.hits, JSON.stringify(r.hits)).toEqual([]);
      expect(r.modes.has(t.startMode)).toBe(true);
    });
  });

  it('a haunted daily is identical for everyone (same seed, same soundtrack)', () => {
    const a = new World();
    const b = new World();
    const opts = { seed: 2026, kind: 'endless' as const, startMode: 'triangle' as const, heatFloor: 0.35, beat };
    new LevelGen(a, opts).ensure(2000);
    new LevelGen(b, opts).ensure(2000);
    expect(a.objs.map((o) => o.x0.toFixed(3)).join()).toBe(b.objs.map((o) => o.x0.toFixed(3)).join());
    expect(a.objs.some((o) => o.kind === 'saw' && o.move)).toBe(true);
  });
});
