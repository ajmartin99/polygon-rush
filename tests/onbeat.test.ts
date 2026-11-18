import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { LevelGen } from '../src/game/generator';
import { LevelTimeline } from '../src/game/levels';
import { BotBrain } from '../src/game/bot';
import { createBody, newEvents, stepBody } from '../src/game/physics';
import { endlessSpeedAt, type Difficulty } from '../src/game/constants';
import { TRACKS } from '../src/core/tracks';
import { beatMapFor } from '../src/core/beatmaps';

/**
 * "Just press on the beat": a player who never looks at the course, only
 * presses when the music says (on every charted tap), clears it. Early and
 * late presses within a rhythm game's usual window must work too. The Glider
 * is held rather than tapped, so it's flown by the bot.
 */
const SONGS = TRACKS.filter((t) => t.role === 'run' && !t.exclusive && !t.retired && beatMapFor(t.file));

function timeline(diff: Difficulty, rotate = 0) {
  return new LevelTimeline(
    0,
    0,
    (i) => {
      const t = SONGS[(i + rotate) % SONGS.length];
      const map = beatMapFor(t.file)!;
      return { id: i, seconds: t.duration - 0.15, grid: { bpm: map.bpm, offset: map.beats[0], map } };
    },
    (d) => endlessSpeedAt(d, false, diff),
  );
}

/** Play `distance` tiles pressing only on the beats; `early` > 0 presses that many seconds early (< 0 late). */
function beatPlayer(seed: number, diff: Difficulty, distance: number, early: number, rotate = 0) {
  const world = new World();
  const levels = timeline(diff, rotate);
  const gen = new LevelGen(world, { seed, kind: 'endless', diff, levels });
  const bot = new BotBrain({ skill: 1, seed, margin: 0.05 });
  const body = createBody(2);
  const ev = newEvents();
  const hits: { x: number; mode: string }[] = [];
  let ghost = 0;
  let next = 0;
  let holdUntil = -1;
  while (body.x < distance) {
    gen.ensure(body.x + 60);
    const speed = endlessSpeedAt(body.x, false, diff);
    const taps = gen.taps;
    while (next < taps.length && taps[next] < body.x - 2) next++;
    let held: boolean;
    if (body.mode === 'triangle') {
      held = bot.update(body, world, (x: number) => endlessSpeedAt(x, false, diff));
    } else {
      // Press when the beat comes (shifted early/late), hold it like a quick tap.
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
    world.prune(body.x - 30);
  }
  return { hits, taps: gen.taps.length };
}

describe('press on the beat and you clear it', () => {
  it('maps every regular run song', () => {
    expect(SONGS.length).toBeGreaterThan(15);
  });
  // How early (+) or late (-) a press can be and still clear everything: wide for kids, rhythm-game tight on Extreme.
  const WINDOWS: Record<Difficulty, number[]> = { easy: [0.1, 0.06, 0, -0.06, -0.09], medium: [0.06, 0, -0.06, -0.09], hard: [0.06, 0, -0.06] };
  for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
    for (const early of WINDOWS[diff]) {
      it(`${diff}, pressing ${early === 0 ? 'right on' : early > 0 ? `${Math.round(early * 1000)} ms early` : `${Math.round(-early * 1000)} ms late`}`, () => {
        for (const rotate of [0, 7, 14]) {
          const r = beatPlayer(100 + rotate, diff, 3500, early, rotate);
          expect(r.taps).toBeGreaterThan(80);
          expect(r.hits, `songs from #${rotate}: ${JSON.stringify(r.hits.slice(0, 6))}`).toEqual([]);
        }
      });
    }
  }
});
