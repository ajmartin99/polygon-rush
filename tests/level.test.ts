import { describe, expect, it } from 'vitest';
import {
  buildWorld,
  canPlace,
  CODE_PREFIX,
  createLevel,
  decodeLevel,
  encodeLevel,
  LevelCodeError,
  levelName,
  MAX_LENGTH,
  modeAt,
  sanitizeContent,
  sanitizeLevel,
  START_ZONE,
  type LevelContent,
  type Piece,
} from '../src/game/level';
import { MAX_OBJ_W } from '../src/game/world';
import { GameSession } from '../src/game/session';
import { decodeName, encodeName, isGeneratedName, randomName } from '../src/meta/names';

function level(pieces: Piece[], extra: Partial<LevelContent> = {}): LevelContent {
  return { name: [3, 5], authors: ['Speedy Panda 7'], theme: 2, speed: 1, hearts: 3, length: 120, pieces, ...extra };
}

describe('racer names', () => {
  it('pack into three bytes and back', () => {
    for (let i = 0; i < 200; i++) {
      const n = randomName();
      const e = encodeName(n);
      expect(e).not.toBeNull();
      expect(decodeName(e!)).toBe(n);
    }
    expect(isGeneratedName('Speedy Polygon 3')).toBe(true);
    expect(isGeneratedName('call me 5551234')).toBe(false);
    expect(isGeneratedName('Speedy Panda 100')).toBe(false);
  });
});

describe('level codes', () => {
  it('round-trip every piece type and setting', () => {
    const pieces: Piece[] = [
      { t: 'block', x: 10, y: 0, v: 0 },
      { t: 'block', x: 10, y: 1, v: 0 },
      { t: 'platform', x: 12, y: 3, v: 0 },
      { t: 'spike', x: 14, y: 0, v: 0 },
      { t: 'spike', x: 14, y: 7, v: 1 },
      { t: 'saw', x: 20, y: 4, v: 1 },
      { t: 'gem', x: 21, y: 2, v: 1 },
      { t: 'pad', x: 22, y: 0, v: 0 },
      { t: 'orb', x: 24, y: 3, v: 0 },
      { t: 'portal', x: 30, y: 0, v: 2 },
      { t: 'pickup', x: 31, y: 5, v: 2 },
      { t: 'pit', x: 40, y: 0, v: 0 },
      { t: 'gem', x: 1100, y: 6, v: 0 },
    ];
    const l = level(pieces, { length: 1150, speed: 2, hearts: 5, theme: 5 });
    const code = encodeLevel(l);
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
    expect(code).toMatch(/^PR1-[A-Za-z0-9_-]+$/);
    const back = decodeLevel(`  ${code}\n`);
    expect(back).toEqual(sanitizeContent(l));
    expect(back.authors).toEqual(['Speedy Panda 7']);
  });

  it('stays compact (about two bytes per piece)', () => {
    const pieces: Piece[] = [];
    for (let x = START_ZONE; x < 600; x++) pieces.push({ t: 'block', x, y: x % 8, v: 0 });
    const code = encodeLevel(level(pieces, { length: 700 }));
    expect(code.length).toBeLessThan(pieces.length * 2.9 + 40);
  });

  it('rejects typos, junk and future versions', () => {
    const code = encodeLevel(level([{ t: 'spike', x: 10, y: 0, v: 0 }]));
    const typo = code.slice(0, -3) + (code.at(-3) === 'A' ? 'B' : 'A') + code.slice(-2);
    expect(() => decodeLevel(typo)).toThrow(LevelCodeError);
    expect(() => decodeLevel('hello there')).toThrow(LevelCodeError);
    expect(() => decodeLevel('PR1-')).toThrow(LevelCodeError);
    expect(() => decodeLevel(code.slice(0, 12))).toThrow(LevelCodeError);
  });

  it('drops pieces that are out of bounds or in the start zone', () => {
    const c = sanitizeContent(
      level([
        { t: 'block', x: 2, y: 0, v: 0 },
        { t: 'block', x: 500, y: 0, v: 0 },
        { t: 'spike', x: 10, y: 9, v: 0 },
        { t: 'portal', x: 10, y: 3, v: 0 },
        { t: 'gem', x: 11, y: 1, v: 7 },
        { t: 'nope' as Piece['t'], x: 12, y: 1, v: 0 },
        { t: 'orb', x: 13, y: 2, v: 0 },
      ]),
    )!;
    expect(c.pieces).toEqual([{ t: 'orb', x: 13, y: 2, v: 0 }]);
    expect(sanitizeContent(level([], { length: 99999 }))!.length).toBe(MAX_LENGTH);
    expect(sanitizeContent(null)).toBeNull();
  });

  it('keeps one piece per slot (last write wins)', () => {
    const c = sanitizeContent(level([{ t: 'block', x: 10, y: 0, v: 0 }, { t: 'spike', x: 10, y: 0, v: 0 }, { t: 'pit', x: 10, y: 0, v: 0 }]))!;
    expect(c.pieces.map((p) => p.t)).toEqual(['spike', 'pit']);
  });

  it('sanitizes stored levels and names them', () => {
    const l = createLevel('Speedy Panda 7', 1000, () => 0.5);
    expect(levelName(l)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    const back = sanitizeLevel(JSON.parse(JSON.stringify(l)));
    expect(back).toEqual(l);
    expect(canPlace({ t: 'block', x: START_ZONE - 1, y: 0, v: 0 }, 100)).toBe(false);
    expect(canPlace({ t: 'block', x: START_ZONE, y: 7, v: 0 }, 100)).toBe(true);
  });
});

describe('level world', () => {
  it('merges blocks into pillars and keeps every object within MAX_OBJ_W', () => {
    const pieces: Piece[] = [];
    for (let x = 10; x < 30; x++) for (let y = 0; y < 3; y++) pieces.push({ t: 'block', x, y, v: 0 });
    const w = buildWorld(level(pieces));
    const blocks = w.objs.filter((o) => o.kind === 'solid' && o.role === 'block');
    // 20 wide x 3 tall becomes 3 rectangles of <= 8 tiles, each 3 tall.
    expect(blocks.length).toBe(3);
    for (const b of blocks) expect(b.y1 - b.y0).toBe(3);
    for (const o of w.objs) expect(o.x1 - o.x0).toBeLessThanOrEqual(MAX_OBJ_W + 1e-9);
    for (let i = 1; i < w.objs.length; i++) expect(w.objs[i].x0).toBeGreaterThanOrEqual(w.objs[i - 1].x0);
    expect(w.finishX).toBe(120);
  });

  it('cuts pits into the floor and adds a ceiling for flying shapes', () => {
    const w = buildWorld(
      level([
        { t: 'pit', x: 20, y: 0, v: 0 },
        { t: 'pit', x: 21, y: 0, v: 0 },
        { t: 'portal', x: 40, y: 0, v: 1 },
        { t: 'portal', x: 70, y: 0, v: 0 },
      ]),
    );
    const ground = w.objs.filter((o) => o.kind === 'solid' && o.role === 'ground');
    const covers = (x: number) => ground.some((g) => g.x0 <= x && g.x1 >= x + 1);
    expect(covers(19)).toBe(true);
    expect(covers(20)).toBe(false);
    expect(covers(21)).toBe(false);
    expect(covers(22)).toBe(true);
    const ceil = w.objs.filter((o) => o.kind === 'solid' && o.role === 'ceil');
    expect(Math.min(...ceil.map((c) => c.x0))).toBeCloseTo(39);
    expect(Math.max(...ceil.map((c) => c.x1))).toBeCloseTo(72);
    expect(w.sectionAt(50)?.mode).toBe('triangle');
    expect(w.sectionAt(80)?.mode).toBe('square');
    expect(modeAt(level([{ t: 'portal', x: 40, y: 0, v: 3 }]), 60)).toBe('diamond');
  });

  it('a CPU can finish a simple player-made level', () => {
    const pieces: Piece[] = [
      { t: 'spike', x: 20, y: 0, v: 0 },
      { t: 'block', x: 34, y: 0, v: 0 },
      { t: 'block', x: 35, y: 0, v: 0 },
      { t: 'gem', x: 34, y: 2, v: 0 },
      { t: 'pit', x: 50, y: 0, v: 0 },
      { t: 'pit', x: 51, y: 0, v: 0 },
      { t: 'spike', x: 65, y: 0, v: 0 },
      { t: 'spike', x: 66, y: 0, v: 0 },
    ];
    const s = new GameSession({ kind: 'custom', seed: 1, level: level(pieces), racers: [{ id: 'bot', name: 'Bot', skin: 'classic', kind: 'bot', skill: 1 }] });
    let finished = false;
    s.on('finish', () => (finished = true));
    s.running = true;
    for (let i = 0; i < 120 * 30 && !finished; i++) s.step();
    expect(finished).toBe(true);
    expect(s.racers[0].hits).toBe(0);
    expect(s.racers[0].gems).toBe(1);
  });

  it('player levels cost hearts and can be started mid-way in the right shape', () => {
    const s = new GameSession({
      kind: 'custom',
      seed: 1,
      level: level([{ t: 'portal', x: 30, y: 0, v: 2 }], { hearts: 1 }),
      startX: 60,
      racers: [{ id: 'me', name: 'Me', skin: 'classic', kind: 'human' }],
    });
    const me = s.racers[0];
    expect(me.hearts).toBe(1);
    expect(me.body.mode).toBe('hexagon');
    expect(me.x).toBe(60);
    expect(me.distance).toBe(58);
    expect(s.baseSpeed(0)).toBeCloseTo(10.2);
  });
});
