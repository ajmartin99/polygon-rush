import { describe, expect, it } from 'vitest';
import { ageGroupFor, createSave, migrate } from '../src/state/save';
import { applyXp, leagueFor, raceReward, xpForLevel } from '../src/meta/economy';
import { claimMission, ensureMissions, reportMission, ACTIVE_MISSIONS } from '../src/meta/missions';
import { claimDaily, dailyAvailable } from '../src/meta/daily';
import { grantProduct } from '../src/meta/products';
import { SKINS, TRAILS } from '../src/meta/catalog';
import { randomName } from '../src/meta/names';
import { isValidCode, randomCode, CODE_ALPHABET } from '../src/services/net';
import { dayDiff } from '../src/core/platform';

describe('save migration', () => {
  it('creates a valid fresh save', () => {
    const s = migrate(null);
    expect(s.gems).toBe(100);
    expect(s.skins.equipped).toBe('classic');
  });

  it('keeps known fields and drops garbage', () => {
    const s = migrate({ gems: 555, skins: { owned: ['classic', 'mint'], equipped: 'mint' }, junk: 1, settings: { music: 4 } });
    expect(s.gems).toBe(555);
    expect(s.skins.equipped).toBe('mint');
    expect(s.settings.music).toBe(1); // clamped
    expect((s as unknown as Record<string, unknown>).junk).toBeUndefined();
  });

  it('repairs an equipped item the player does not own', () => {
    const s = migrate({ skins: { owned: [], equipped: 'golden' } });
    expect(s.skins.owned).toContain('classic');
    expect(s.skins.equipped).toBe('classic');
  });

  it('rejects wrong types', () => {
    const s = migrate({ gems: 'lots', level: -3 });
    expect(s.gems).toBe(100);
    expect(s.level).toBe(1);
  });

  it('computes conservative age groups', () => {
    const now = new Date(2026, 5, 1);
    expect(ageGroupFor(2016, now)).toBe('child');
    expect(ageGroupFor(2013, now)).toBe('child'); // could still be 12
    expect(ageGroupFor(2012, now)).toBe('teen');
    expect(ageGroupFor(2000, now)).toBe('adult');
  });
});

describe('economy', () => {
  it('levels up with rewards', () => {
    const r = applyXp(1, 0, xpForLevel(1) + xpForLevel(2) + 5);
    expect(r.level).toBe(3);
    expect(r.xp).toBe(5);
    expect(r.ups).toHaveLength(2);
    expect(r.ups[1].unlockedSkins).toContain('mint');
  });

  it('maps trophies to leagues and never goes negative', () => {
    expect(leagueFor(0).id).toBe('bronze');
    expect(leagueFor(80).id).toBe('gold');
    expect(leagueFor(9999).id).toBe('legend');
    expect(raceReward(4).trophies).toBeGreaterThanOrEqual(0);
    expect(raceReward(1).gems).toBeGreaterThan(raceReward(2).gems);
  });
});

describe('missions', () => {
  it('keeps three distinct missions', () => {
    const s = createSave();
    ensureMissions(s);
    expect(s.missions.active).toHaveLength(ACTIVE_MISSIONS);
    expect(new Set(s.missions.active.map((m) => m.id)).size).toBe(ACTIVE_MISSIONS);
  });

  it('tracks progress and pays out once', () => {
    const s = createSave();
    s.missions.active = [{ id: 'jumps', target: 10, progress: 0, reward: 70, claimed: false }];
    ensureMissions(s);
    expect(reportMission(s, 'jumps', 4)).toHaveLength(0);
    expect(reportMission(s, 'jumps', 6)).toHaveLength(1);
    const idx = s.missions.active.findIndex((m) => m.id === 'jumps');
    expect(claimMission(s, idx)).toBe(70);
    expect(claimMission(s, idx)).toBe(0);
    expect(s.missions.active).toHaveLength(ACTIVE_MISSIONS);
  });

  it('max-type missions keep the best value', () => {
    const s = createSave();
    s.missions.active = [{ id: 'run_far', target: 500, progress: 0, reward: 60, claimed: false }];
    reportMission(s, 'run_distance', 300);
    reportMission(s, 'run_distance', 120);
    expect(s.missions.active[0].progress).toBe(300);
  });
});

describe('daily gift', () => {
  it('claims once per day and grants the day-7 cosmetic', () => {
    const s = createSave();
    const days = ['2026-01-01', '2026-01-02', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'];
    let total = 0;
    for (const d of days) {
      expect(dailyAvailable(s, d)).toBe(true);
      total += claimDaily(s, d)!.gems;
      expect(claimDaily(s, d)).toBeNull();
    }
    expect(total).toBe(50 + 80 + 100 + 150 + 200 + 300 + 500);
    expect(s.skins.owned).toContain('lucky');
    expect(s.daily.cycles).toBe(1);
  });

  it('computes day differences across months', () => {
    expect(dayDiff('2026-01-31', '2026-02-01')).toBe(1);
  });
});

describe('products', () => {
  it('starter pack grants once', () => {
    const s = createSave();
    const a = grantProduct(s, 'starter_pack');
    const b = grantProduct(s, 'starter_pack');
    expect(a.gems).toBe(2500);
    expect(b.gems).toBe(0);
    expect(s.purchases.noAds).toBe(true);
    expect(s.skins.owned).toContain('golden');
  });

  it('gem packs are consumable', () => {
    const s = createSave();
    grantProduct(s, 'gems_small');
    grantProduct(s, 'gems_small');
    expect(s.gems).toBe(100 + 1200);
  });

  it('legend pack unlocks every legend item', () => {
    const s = createSave();
    grantProduct(s, 'legend_pack');
    for (const sk of SKINS.filter((x) => x.unlock.kind === 'legend')) expect(s.skins.owned).toContain(sk.id);
    for (const t of TRAILS.filter((x) => x.unlock.kind === 'legend')) expect(s.trails.owned).toContain(t.id);
  });
});

describe('catalog & names', () => {
  it('has unique ids', () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
    expect(new Set(TRAILS.map((t) => t.id)).size).toBe(TRAILS.length);
  });

  it('generates kid-safe names and room codes', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomName()).toMatch(/^[A-Za-z]+ [A-Za-z]+ \d{1,2}$/);
      const c = randomCode();
      expect(isValidCode(c)).toBe(true);
      expect([...c].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    }
    expect(isValidCode('AEIO')).toBe(false);
  });
});
