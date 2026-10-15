import { describe, expect, it } from 'vitest';
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
