import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { LevelGen } from '../src/game/generator';
import { LevelTimeline } from '../src/game/levels';
import { BotBrain } from '../src/game/bot';
import { createBody, newEvents, stepBody } from '../src/game/physics';
import { endlessSpeedAt, type Tuning } from '../src/game/constants';
import { levelStart } from '../src/meta/modes';
import { TRACKS } from '../src/core/tracks';
import { beatMapFor } from '../src/core/beatmaps';

/**
 * "Just press on the beat": a player who never looks at the course, only
 * presses when the music says (on every charted tap), clears it. Early and
 * late presses within a rhythm game's usual window must work too. The Glider
 * is held rather than tapped, so it's flown by the bot.
 */
const SONGS = TRACKS.filter((t) => t.role === 'run' && !t.exclusive && !t.retired && beatMapFor(t.file));

function timeline(diff: Tuning, rotate: number, first: number, offset: number) {
  return new LevelTimeline(
    first,
    offset,
    (i) => {
      const t = SONGS[(i + rotate) % SONGS.length];
      const map = beatMapFor(t.file)!;
      return { id: i, seconds: t.duration - 0.15, grid: { bpm: map.bpm, offset: map.beats[0], map } };
    },
    (d) => endlessSpeedAt(d + 2, false, diff),
  );
}

/** Play `distance` tiles pressing only on the beats; `early` > 0 presses that many seconds early (< 0 late). */
function beatPlayer(seed: number, diff: Tuning, distance: number, early: number, rotate = 0, level = 1) {
  const world = new World();
  const offset = levelStart(level);
  const levels = timeline(diff, rotate, level - 1, offset);
  const gen = new LevelGen(world, { seed, kind: 'endless', diff, levels, startX: 2 + offset, offset });
  const bot = new BotBrain({ skill: 1, seed, margin: 0.05 });
  const body = createBody(2 + offset);
  distance += offset;
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
  // The one mode gets harder level by level: the first levels forgive a lot, later ones are rhythm-game tight.
  const WINDOWS: { level: number; presses: number[] }[] = [
    { level: 1, presses: [0.1, 0.06, 0, -0.06, -0.09] },
    { level: 4, presses: [0.06, 0, -0.06, -0.09] },
    { level: 7, presses: [0.05, 0, -0.05] },
  ];
  for (const { level, presses } of WINDOWS) {
    for (const early of presses) {
      it(`from Level ${level}, pressing ${early === 0 ? 'right on' : early > 0 ? `${Math.round(early * 1000)} ms early` : `${Math.round(-early * 1000)} ms late`}`, () => {
        for (const rotate of [0, 7, 14]) {
          const r = beatPlayer(100 + rotate, 'run', 3500, early, rotate, level);
          expect(r.taps).toBeGreaterThan(80);
          expect(r.hits, `songs from #${rotate}: ${JSON.stringify(r.hits.slice(0, 6))}`).toEqual([]);
        }
      });
    }
  }
});

describe('beat maps', () => {
  it('every recorded song has one (run tools/beatmap/analyze.py after adding music)', () => {
    for (const t of TRACKS) expect(beatMapFor(t.file), t.file).not.toBeNull();
  });
  it('beats are steady, in order and land within each song', () => {
    for (const t of TRACKS) {
      const m = beatMapFor(t.file)!;
      expect(m.beats.length, t.file).toBeGreaterThan(30);
      expect(m.ticks.length).toBe(2 * m.beats.length - 1);
      expect(m.score.length).toBe(m.ticks.length);
      for (let i = 1; i < m.beats.length; i++) {
        const gap = m.beats[i] - m.beats[i - 1];
        expect(gap, `${t.file} beat ${i}`).toBeGreaterThan(0.25);
        expect(gap, `${t.file} beat ${i}`).toBeLessThan(0.8);
      }
      expect(m.beats[m.beats.length - 1]).toBeLessThan(m.duration + 0.1);
    }
  });
});
