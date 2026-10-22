import { describe, expect, it } from 'vitest';
import { mobFacing, sawX, sawY, World } from '../src/game/world';
import { BotBrain } from '../src/game/bot';
import { createBody, newEvents, stepBody } from '../src/game/physics';
import { buildWorld, levelSpeed } from '../src/game/level';
import { attemptsLeft, emptyHaunted, hauntedCourse, hauntedPayout, refillIn, useAttempt, useRegen, HAUNTED_RULES, HAUNTED_TRACK, type HauntedDiff } from '../src/meta/haunted';

/** A perfect bot plays the course; returns where it got hit (if anywhere). */
function botRun(diff: HauntedDiff, seed: number) {
  const level = hauntedCourse(diff, seed);
  const world = buildWorld(level, new World());
  const speed = levelSpeed(level);
  const bot = new BotBrain({ skill: 1, seed, margin: 0.05 });
  const body = createBody(2);
  const ev = newEvents();
  const hits: { x: number; mode: string }[] = [];
  let ghost = 0;
  while (body.x < level.length + 2) {
    const held = bot.update(body, world, speed);
    stepBody(body, held, world, { speed, ghost: ghost > 0 }, ev);
    if (ghost > 0) ghost--;
    if ((ev.hit || ev.fell) && ghost === 0) {
      hits.push({ x: Math.round(body.x * 10) / 10, mode: body.mode });
      ghost = 180;
      if (ev.fell) {
        const gx = world.nextGroundX(body.x);
        body.x = Number.isFinite(gx) ? gx + 0.6 : body.x;
        body.y = 0.43;
        body.vy = 0;
        body.gdir = -1;
      }
    }
  }
  return { level, hits };
}

describe('Haunted Run', () => {
  it('is charted to Swing Along and ends with the song', () => {
    const c = hauntedCourse('hard', 1);
    expect(c.music).toBe(HAUNTED_TRACK);
    // ~133 s at Turbo speed.
    expect(c.length).toBeGreaterThan(1500);
    expect(hauntedCourse('easy', 1).length).toBeLessThan(c.length);
    expect(c.pieces.some((p) => p.t === 'portal')).toBe(true);
    expect(JSON.stringify(hauntedCourse('hard', 5))).toBe(JSON.stringify(hauntedCourse('hard', 5)));
    expect(JSON.stringify(hauntedCourse('hard', 6))).not.toBe(JSON.stringify(hauntedCourse('hard', 5)));
  });

  for (const diff of ['hard', 'easy'] as HauntedDiff[]) {
    it(`every day's ${diff} course can be finished`, () => {
      for (const seed of [11, 202, 3003, 40004, 505005, 6006006]) {
        const { hits } = botRun(diff, seed);
        expect(hits, `${diff} seed ${seed}`).toEqual([]);
      }
    });
  }

  it('monsters wander back and forth until they notice you, then settle in their spot before you get there', () => {
    const mobs = (['hard', 'easy'] as const).flatMap((d) => buildWorld(hauntedCourse(d, 7)).objs.filter((o): o is Extract<typeof o, { kind: 'saw' }> => o.kind === 'saw' && !!o.mob));
    expect(mobs.some((m) => m.mob === 'zombie')).toBe(true);
    expect(mobs.some((m) => m.mob === 'ghost')).toBe(true);
    let turned = 0;
    for (const m of mobs) {
      // Far off they wander: they move, and turn around.
      const xs = new Set<number>();
      const dirs = new Set<number>();
      for (let x = m.x - 40; x < m.x - 12; x += 1) {
        xs.add(Math.round(sawX(m, x) * 10));
        dirs.add(mobFacing(m, x));
      }
      if (m.move?.patrol && m.move.patrol.r - m.move.patrol.l > 0.6) {
        expect(xs.size).toBeGreaterThan(3);
        if (dirs.size === 2) turned++;
      }
      // From a couple of tiles away they hold still in their spot, facing you.
      for (const d of [2, 1, 0]) {
        expect(sawX(m, m.x - d)).toBeCloseTo(m.x, 5);
        expect(sawY(m, m.x - d)).toBeCloseTo(m.y, 5);
        expect(mobFacing(m, m.x - d)).toBe(-1);
      }
      for (let x = m.x - 40; x <= m.x; x += 0.25) {
        // Always inside its own bounds (so it's never missed by collisions or drawing)...
        expect(sawX(m, x)).toBeGreaterThanOrEqual(m.x0);
        expect(sawX(m, x)).toBeLessThanOrEqual(m.x1);
        expect(sawY(m, x)).toBeGreaterThanOrEqual(m.y0);
        expect(sawY(m, x)).toBeLessThanOrEqual(m.y1);
        // ...and never on top of you before it settles.
        if (x < m.x - 2.5) expect(sawX(m, x) - x).toBeGreaterThan(1.5);
      }
    }
    expect(turned).toBeGreaterThan(mobs.length / 3);
  });

  it('two attempts per 24 hours; Heart Regen refills them', () => {
    const h = emptyHaunted();
    const t0 = 1_000_000;
    expect(attemptsLeft(h, t0)).toBe(2);
    expect(useAttempt(h, t0)).toBe(true);
    expect(useAttempt(h, t0 + 1000)).toBe(true);
    expect(useAttempt(h, t0 + 2000)).toBe(false);
    expect(refillIn(h, t0 + 2000)).toBe(HAUNTED_RULES.windowMs - 2000);
    expect(attemptsLeft(h, t0 + HAUNTED_RULES.windowMs)).toBe(2);
    useAttempt(h, t0 + HAUNTED_RULES.windowMs);
    useAttempt(h, t0 + HAUNTED_RULES.windowMs);
    expect(useRegen(h, t0 + HAUNTED_RULES.windowMs + 5)).toBe(false);
    h.regens = 4;
    expect(useRegen(h, t0 + HAUNTED_RULES.windowMs + 5)).toBe(true);
    expect(attemptsLeft(h, t0 + HAUNTED_RULES.windowMs + 5)).toBe(2);
    expect(h.regens).toBe(3);
  });

  it('Hard pays full, Easy half, with a big bonus for reaching the end', () => {
    expect(hauntedPayout('hard', 100, false)).toBe(100);
    expect(hauntedPayout('easy', 100, false)).toBe(50);
    expect(hauntedPayout('hard', 100, true)).toBe(100 + HAUNTED_RULES.finishBonus);
    expect(hauntedPayout('easy', 100, true)).toBe((100 + HAUNTED_RULES.finishBonus) / 2);
  });
});

describe('Swing Along belongs to the Haunted Run', () => {
  it('is never in rotation or pickable, even at Halloween', async () => {
    const { tracksFor, isPickable } = await import('../src/core/tracks');
    const halloween = new Date(2026, 9, 25);
    for (const ctx of ['menu', 'run', 'race'] as const) {
      expect(tracksFor(ctx, halloween)).not.toContain(HAUNTED_TRACK);
      expect(tracksFor(ctx, new Date(2026, 5, 1))).not.toContain(HAUNTED_TRACK);
    }
    expect(isPickable(HAUNTED_TRACK)).toBe(false);
    expect(isPickable(HAUNTED_TRACK + 1)).toBe(true);
  });
});
