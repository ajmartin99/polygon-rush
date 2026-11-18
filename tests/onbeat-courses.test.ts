import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { BotBrain } from '../src/game/bot';
import { createBody, newEvents, stepBody } from '../src/game/physics';
import { buildWorld, levelSpeed, type LevelContent } from '../src/game/level';
import { hauntedPlan } from '../src/meta/haunted';
import { holidayPlan } from '../src/meta/holiday';
import { BOSSES, bossPlan } from '../src/meta/bosses';

/**
 * The seasonal runs and boss fights, played by someone who only presses when
 * the music says (early or late by a rhythm game's usual margin). The Glider
 * is held rather than tapped, so it's flown by the bot.
 */
function beatPlayer(level: LevelContent, taps: number[], early: number) {
  const world = buildWorld(level, new World());
  const speed = levelSpeed(level);
  const bot = new BotBrain({ skill: 1, seed: 1, margin: 0.05 });
  const body = createBody(2);
  const ev = newEvents();
  const hits: { x: number; mode: string }[] = [];
  let ghost = 0;
  let next = 0;
  let holdUntil = -1;
  while (body.x < level.length + 2) {
    while (next < taps.length && taps[next] < body.x - 2) next++;
    let held: boolean;
    if (body.mode === 'triangle') held = bot.update(body, world, speed);
    else {
      if (next < taps.length && body.x >= taps[next] - early * speed) {
        holdUntil = body.t + 0.09;
        next++;
      }
      held = body.t < holdUntil;
    }
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

/** Hard levels give a rhythm game's tighter window, easy ones a wider one. */
const WINDOWS = { hard: [0.06, 0, -0.06], easy: [0.1, 0, -0.08] };

describe('seasonal runs: press on the beat and you clear it', () => {
  for (const diff of ['hard', 'easy'] as const) {
    for (const early of WINDOWS[diff]) {
      const when = early === 0 ? 'right on' : early > 0 ? `${early * 1000} ms early` : `${-early * 1000} ms late`;
      it(`Haunted Run ${diff}, ${when}`, () => {
        for (const seed of [11, 202, 3003]) {
          const p = hauntedPlan(diff, seed);
          expect(beatPlayer(p.level, p.taps, early), `seed ${seed}`).toEqual([]);
        }
      });
    }
  }
  for (const early of [0.06, 0, -0.06]) {
    for (const villain of ['frost', 'krampus'] as const) {
      it(`Holiday Run (${villain}), ${early === 0 ? 'right on' : early > 0 ? '60 ms early' : '60 ms late'}`, () => {
        for (const seed of [11, 202, 3003]) {
          const p = holidayPlan(villain, seed);
          expect(beatPlayer(p.level, p.taps, early), `seed ${seed}`).toEqual([]);
        }
      });
    }
  }
  for (const early of [0.06, 0, -0.06]) {
    it(`Boss Battles, ${early === 0 ? 'right on' : early > 0 ? '60 ms early' : '60 ms late'}`, () => {
      for (const b of BOSSES) {
        const p = bossPlan(b);
        expect(beatPlayer(p.level, p.taps, early), b.id).toEqual([]);
      }
    });
  }
});
