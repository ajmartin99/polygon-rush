import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/session';
import { createBody, newEvents, stepBody } from '../src/game/physics';
import { World } from '../src/game/world';
import { PLAYER_HALF } from '../src/game/constants';

const human = { id: 'me', name: 'Me', skin: 'classic', kind: 'human' as const };

/** Flat world with ground (and optional ceiling) split into 8-tile pieces like the generator does. */
function flatWorld(ceiling = false): World {
  const w = new World();
  for (let x = -16; x < 200; x += 8) {
    w.objs.push({ id: w.newId(), kind: 'solid', role: 'ground', x0: x, x1: x + 8, y0: -4, y1: 0 });
    if (ceiling) w.objs.push({ id: w.newId(), kind: 'solid', role: 'ceil', x0: x, x1: x + 8, y0: 8, y1: 12 });
  }
  return w;
}

function add(w: World, o: Parameters<World['appendSorted']>[0][number]): void {
  w.objs.push(o);
  w.objs.sort((a, b) => a.x0 - b.x0);
}

function run(s: GameSession, seconds: number): void {
  s.running = true;
  for (let i = 0; i < seconds * 120; i++) s.step();
}

describe('physics', () => {
  it('a square jumps about 2.3 tiles high and lands again', () => {
    const w = flatWorld();
    const b = createBody(0);
    const ev = newEvents();
    let peak = 0;
    let landed = false;
    stepBody(b, true, w, { speed: 9, ghost: false }, ev);
    expect(ev.jumped).toBe(true);
    for (let i = 0; i < 120; i++) {
      stepBody(b, false, w, { speed: 9, ghost: false }, ev);
      peak = Math.max(peak, b.y - PLAYER_HALF);
      if (ev.landed) landed = true;
    }
    expect(peak).toBeGreaterThan(2.1);
    expect(peak).toBeLessThan(2.6);
    expect(landed).toBe(true);
    expect(b.y).toBeCloseTo(PLAYER_HALF, 5);
  });

  it('spikes hurt, ghosts pass through', () => {
    const w = flatWorld();
    add(w, { id: 999, kind: 'spike', x: 3, y: 0, dir: 1, size: 1, x0: 2.5, x1: 3.5, y0: 0, y1: 1 });
    const ev = newEvents();
    for (const ghost of [false, true]) {
      const b = createBody(0);
      let hit = false;
      for (let i = 0; i < 60; i++) {
        stepBody(b, false, w, { speed: 9, ghost }, ev);
        if (ev.hit) hit = true;
      }
      expect(hit).toBe(!ghost);
    }
  });

  it('portals change shape and roller flips gravity', () => {
    const w = flatWorld(true);
    add(w, { id: 999, kind: 'portal', x: 2, y: 4, mode: 'hexagon', x0: 1.4, x1: 2.6, y0: 0, y1: 8 });
    const b = createBody(0);
    const ev = newEvents();
    let portal = null;
    for (let i = 0; i < 60; i++) {
      stepBody(b, false, w, { speed: 9, ghost: false }, ev);
      if (ev.portal) portal = ev.portal;
    }
    expect(portal).toBe('hexagon');
    stepBody(b, true, w, { speed: 9, ghost: false }, ev);
    expect(ev.flipped).toBe(true);
    for (let i = 0; i < 120; i++) stepBody(b, false, w, { speed: 9, ghost: false }, ev);
    expect(b.y).toBeCloseTo(8 - PLAYER_HALF, 3);
  });
});

describe('endless session', () => {
  it('loses hearts on hits, dies at zero, and can be revived', () => {
    const s = new GameSession({ kind: 'endless', seed: 5, racers: [human] });
    const me = s.racers[0];
    expect(me.hearts).toBe(3);
    let deaths = 0;
    s.on('death', () => deaths++);
    run(s, 40); // never pressing: the first obstacles will hurt
    expect(me.hits).toBeGreaterThan(0);
    expect(deaths).toBe(1);
    expect(me.dead).toBe(true);
    s.revive(me);
    expect(me.dead).toBe(false);
    expect(me.hearts).toBeGreaterThan(0);
    expect(me.invuln).toBeGreaterThan(0);
  });

  it('kid mode gives more hearts and runs slower', () => {
    const kid = new GameSession({ kind: 'endless', seed: 1, kid: true, racers: [human] });
    const normal = new GameSession({ kind: 'endless', seed: 1, racers: [human] });
    expect(kid.racers[0].hearts).toBe(5);
    expect(kid.baseSpeed(100)).toBeLessThan(normal.baseSpeed(100));
  });
});

describe('race session', () => {
  it('CPU rivals finish the race and get places', () => {
    const s = new GameSession({
      kind: 'race',
      seed: 77,
      length: 400,
      difficulty: 0.3,
      racers: [0, 1, 2, 3].map((i) => ({ id: `b${i}`, name: `Bot ${i}`, skin: 'classic', kind: 'bot' as const, skill: 0.85 })),
    });
    const finishes: number[] = [];
    s.on('finish', ({ place }) => finishes.push(place));
    run(s, 70);
    expect(s.racers.every((r) => r.finished)).toBe(true);
    expect(finishes.sort()).toEqual([1, 2, 3, 4]);
  });

  it('snowballs slow racers ahead unless shielded', () => {
    const s = new GameSession({
      kind: 'race',
      seed: 3,
      racers: [
        { id: 'a', name: 'A', skin: 'classic', kind: 'human' },
        { id: 'b', name: 'B', skin: 'mint', kind: 'human' },
        { id: 'c', name: 'C', skin: 'sky', kind: 'human' },
      ],
    });
    const [a, b, c] = s.racers;
    b.body.x = 30;
    c.body.x = 40;
    c.shield = true;
    s.applyBox(a, 'snow');
    expect(b.snow).toBeGreaterThan(0);
    expect(c.snow).toBe(0);
    expect(c.shield).toBe(false);
    expect(s.rankOf(a)).toBe(3);
    expect(s.rankOf(c)).toBe(1);
  });

  it('interpolates remote racers', () => {
    const s = new GameSession({
      kind: 'online',
      seed: 9,
      racers: [human, { id: 'r', name: 'R', skin: 'mint', kind: 'remote' }],
    });
    s.applyRemote('r', 10, 0.43, 0, 0, 0, 10, 1.0);
    s.applyRemote('r', 11, 0.43, 0, 0, 0, 10, 1.1);
    s.updateRemotes(1.15); // renders at 1.05: halfway
    expect(s.racer('r')!.x).toBeCloseTo(10.5, 3);
  });
});
