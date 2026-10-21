import { describe, expect, it } from 'vitest';
import { LEVEL_NOMINAL } from '../src/game/levels';
import { migrate } from '../src/state/save';
import { dailySeed, dayKey, pruneDaily, variantBestKey } from '../src/meta/modes';
import { GameSession } from '../src/game/session';

const me = { id: 'me', name: 'Speedy Panda 7', skin: 'classic', kind: 'human' as const };

describe('game modes', () => {
  it('gives everyone the same daily course', () => {
    const day = new Date(2026, 9, 31, 9);
    expect(dayKey(day)).toBe('2026-10-31');
    expect(dailySeed('2026-10-31')).toBe(dailySeed(dayKey(new Date(2026, 9, 31, 22))));
    expect(dailySeed('2026-10-31')).not.toBe(dailySeed('2026-11-01'));
  });

  it('keeps records apart', () => {
    const s = { kidMode: false, difficulty: 'medium' as const };
    const keys = new Set(['classic', 'daily', 'oneheart', 'gemrush'].map((v) => variantBestKey(v as never, s)));
    expect(keys.size).toBe(4);
    expect(variantBestKey('classic', s)).toBe('endless');
  });

  it('prunes old daily entries', () => {
    const now = new Date(2026, 9, 31);
    const best: Record<string, number> = { endless: 900, 'daily_2026-10-31': 400, 'daily_2026-10-01': 300, 'dailyrw_2026-10-02': 1 };
    pruneDaily(best, now);
    expect(Object.keys(best).sort()).toEqual(['daily_2026-10-31', 'endless']);
  });

  it('One Heart has one heart and no heart pickups', () => {
    const s = new GameSession({ kind: 'endless', seed: 3, hearts: 1, noHearts: true, racers: [me] });
    expect(s.racers[0].hearts).toBe(1);
    s.gen!.ensure(3000);
    expect(s.world.objs.some((o) => o.kind === 'pickup' && o.type === 'heart')).toBe(false);
  });

  it('Gem Rush never ends on a bump and has more gems', () => {
    const rush = new GameSession({ kind: 'endless', seed: 4, stunOnly: true, gemChance: 0.9, racers: [me] });
    const normal = new GameSession({ kind: 'endless', seed: 4, racers: [me] });
    rush.gen!.ensure(1500);
    normal.gen!.ensure(1500);
    const gems = (s: GameSession) => s.world.objs.filter((o) => o.kind === 'gem').length;
    expect(gems(rush)).toBeGreaterThan(gems(normal));
    expect(rush.racers[0].maxHearts).toBe(0);
    const r = rush.racers[0];
    r.gems = 12;
    (rush as unknown as { takeDamage: (r: unknown, fell: boolean) => void }).takeDamage(r, false);
    expect(r.gems).toBe(7);
    expect(r.dead).toBe(false);
  });
});

describe('Endless levels', () => {
  it('unlocks every level reached; later starts begin partway in', async () => {
    const { unlockedLevels, levelStart, clampStartLevel, levelWorld } = await import('../src/meta/modes');
    expect(unlockedLevels(0)).toBe(1);
    expect(unlockedLevels(1)).toBe(1);
    expect(unlockedLevels(6)).toBe(6);
    expect(unlockedLevels(1e9)).toBe(40);
    expect(levelStart(1)).toBe(0);
    expect(levelStart(4)).toBe(3 * LEVEL_NOMINAL);
    expect(levelWorld(7)).toBe(0);
    expect(clampStartLevel(5, 5)).toBe(5);
    expect(clampStartLevel(7, 5)).toBe(1);
    expect(clampStartLevel(0, 5)).toBe(1);
  });

  it('older saves unlock levels from their best distance', () => {
    const save = migrate({ best: { endless: 3000, endless_hard: 100, daily_2026_1_1: 9000 } });
    expect(save.levels.endless).toBe(Math.floor(3000 / LEVEL_NOMINAL) + 1);
    expect(save.levels.endless_hard).toBe(1);
    expect(save.levels.daily_2026_1_1).toBeUndefined();
    // Already converted: kept as it is.
    expect(migrate({ best: { endless: 3000 }, levels: { endless: 9 } }).levels.endless).toBe(9);
  });

  it('starts a run partway in, at that point’s speed, counting from 0 m', () => {
    const s = new GameSession({ kind: 'endless', seed: 9, startDistance: 1500, racers: [me] });
    const r = s.racers[0];
    expect(Math.round(r.distance)).toBe(1500);
    expect(s.baseSpeed(r.x)).toBeGreaterThan(new GameSession({ kind: 'endless', seed: 9, racers: [me] }).baseSpeed(2));
    // Track is generated ahead of the new start.
    expect(s.world.generatedTo).toBeGreaterThan(r.x + 60);
  });
});

describe('Lights Out', () => {
  it('the lantern breathes smoothly with the beat (no flashing), still with Reduce motion', async () => {
    const { lightsGlow } = await import('../src/game/controller');
    expect(lightsGlow(0)).toBe(1);
    expect(lightsGlow(0.5)).toBeCloseTo(0);
    // Smooth: no jump anywhere in the beat.
    for (let p = 0; p < 1; p += 0.01) expect(Math.abs(lightsGlow(p + 0.01) - lightsGlow(p))).toBeLessThan(0.04);
    expect(lightsGlow(0, true)).toBe(0.5);
    expect(lightsGlow(0.37, true)).toBe(0.5);
    expect(variantBestKey('lightsout', { kidMode: false, difficulty: 'hard' })).toBe('lightsout_hard');
  });
});
