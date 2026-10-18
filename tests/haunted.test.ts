import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
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
