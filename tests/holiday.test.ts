import { describe, expect, it } from 'vitest';
import { mobAlert, sawX, sawY, World } from '../src/game/world';
import { BotBrain } from '../src/game/bot';
import { createBody, newEvents, stepBody } from '../src/game/physics';
import { buildWorld, levelSpeed, type LevelContent } from '../src/game/level';
import { holidayChapters, holidayPayout, holidayPlan, holidayTrack, HOLIDAY_RULES, type HolidayDiff, type Villain } from '../src/meta/holiday';
import { witchHealth } from '../src/meta/haunted';

/** A perfect bot plays the course; returns where it got hit (if anywhere). */
function botRun(level: LevelContent, seed: number) {
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
  return hits;
}

const VILLAINS: Villain[] = ['frost', 'krampus'];
const DIFFS: HolidayDiff[] = ['hard', 'easy'];

describe('Holiday Run', () => {
  it('is charted to the villain’s own song, in five chapters, the same all day', () => {
    for (const v of VILLAINS) {
      const { level, chapters } = holidayPlan('hard', v, 1);
      expect(level.music).toBe(holidayTrack(v));
      expect(chapters).toHaveLength(holidayChapters(v).length);
      for (let i = 1; i < chapters.length; i++) expect(chapters[i]).toBeGreaterThan(chapters[i - 1] + 40);
      expect(level.length).toBeGreaterThan(1400);
      expect(JSON.stringify(holidayPlan('hard', v, 5))).toBe(JSON.stringify(holidayPlan('hard', v, 5)));
      expect(JSON.stringify(holidayPlan('hard', v, 6))).not.toBe(JSON.stringify(holidayPlan('hard', v, 5)));
    }
    expect(holidayTrack('frost')).not.toBe(holidayTrack('krampus'));
  });

  for (const v of VILLAINS)
    for (const diff of DIFFS)
      it(`every day's ${v} ${diff} course can be finished`, () => {
        for (const seed of [11, 202, 3003, 40004]) {
          const hits = botRun(holidayPlan(diff, v, seed).level, seed);
          expect(hits, `${v} ${diff} seed ${seed}`).toEqual([]);
        }
      });

  it('each chapter brings its own monsters, and the presents are all in the lair', () => {
    const { level, chapters } = holidayPlan('hard', 'frost', 7);
    const objs = buildWorld(level, new World()).objs;
    const mobsIn = (c: number) =>
      new Set(objs.filter((o): o is Extract<typeof o, { kind: 'saw' }> => o.kind === 'saw' && !!o.mob && o.x >= chapters[c] && o.x < (chapters[c + 1] ?? Infinity)).map((o) => o.mob));
    expect(mobsIn(0)).toEqual(new Set(['snowman', 'snowball']));
    expect([...mobsIn(1)].sort()).toEqual(['icicle', 'penguin']);
    expect([...mobsIn(2)].sort()).toEqual(['jackbox', 'soldier']);
    expect(mobsIn(3)).toEqual(new Set(['snowflake']));
    const presents = level.pieces.filter((p) => p.t === 'gem' && p.v === 1);
    expect(presents.every((p) => p.x >= chapters[4])).toBe(true);
    const { orbs, hp } = witchHealth(level, chapters[4]);
    expect(orbs).toBeGreaterThan(10);
    expect(hp).toBeLessThan(orbs);
  });

  it('droppers and poppers land on their spot before you get there, and stay in their bounds', () => {
    const { level } = holidayPlan('hard', 'krampus', 3);
    const mobs = buildWorld(level, new World()).objs.filter((o): o is Extract<typeof o, { kind: 'saw' }> => o.kind === 'saw' && !!o.mob);
    for (const m of mobs) {
      for (const d of [2, 1, 0]) {
        expect(sawX(m, m.x - d)).toBeCloseTo(m.x, 5);
        expect(sawY(m, m.x - d)).toBeCloseTo(m.y, 5);
        expect(mobAlert(m, m.x - d)).toBe(1);
      }
      for (let x = m.x - 40; x <= m.x; x += 0.25) {
        expect(sawX(m, x)).toBeGreaterThanOrEqual(m.x0);
        expect(sawX(m, x)).toBeLessThanOrEqual(m.x1);
        expect(sawY(m, x)).toBeGreaterThanOrEqual(m.y0);
        expect(sawY(m, x)).toBeLessThanOrEqual(m.y1);
      }
    }
  });

  it('pays 500 on Hard and 150 on Easy for beating the villain', () => {
    expect(holidayPayout('hard', 100, true, true)).toBe(100 + HOLIDAY_RULES.villainBonus.hard);
    expect(holidayPayout('easy', 100, true, true)).toBe(50 + 150);
    expect(holidayPayout('hard', 100, true, false)).toBe(200);
    expect(holidayPayout('easy', 0, false, false)).toBe(0);
  });
});
