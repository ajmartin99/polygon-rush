import { describe, expect, it } from 'vitest';
import { ageGroupFor, createSave, migrate } from '../src/state/save';
import { applyXp, leagueFor, raceReward, xpForLevel } from '../src/meta/economy';
import { claimMission, ensureMissions, reportMission, ACTIVE_MISSIONS } from '../src/meta/missions';
import { claimDaily, dailyAvailable } from '../src/meta/daily';
import { gemPriceOf, grantProduct, isOwned } from '../src/meta/products';
import { addOns, myCard, safeCard } from '../src/meta/profile';
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

  it('Heart Regens cost the same-price gem pack plus 10% in gems', () => {
    expect(gemPriceOf('haunted_regen_1')).toBe(660); // $0.99 = 600 gems
    expect(gemPriceOf('haunted_regen_4')).toBe(2200); // $2.99 = 2,000 gems
    expect(gemPriceOf('gems_small')).toBe(0);
    expect(gemPriceOf('creator_spotlight')).toBe(660);
    expect(gemPriceOf('builder_pack')).toBe(2200);
    // No Ads: gems only during the beta (1.0.x), money always.
    expect(gemPriceOf('remove_ads', '1.0.12')).toBe(2200);
    expect(gemPriceOf('remove_ads', '1.1.0')).toBe(0);
    // The packs too, during the beta only (Gem Chest rate + 10%, to the nearest 50).
    expect(gemPriceOf('legend_pack', '1.0.12')).toBe(2950);
    expect(gemPriceOf('starter_pack', '1.0.12')).toBe(3650);
    expect(gemPriceOf('legend_pack', '1.1.0')).toBe(0);
    expect(gemPriceOf('gems_large', '1.0.12')).toBe(0);
    // A Starter Pack bought with gems doesn't hand out its bonus gems.
    const g = createSave();
    expect(grantProduct(g, 'starter_pack', true).gems).toBe(0);
    expect(g.purchases.noAds && g.skins.owned.includes('golden')).toBe(true);
    const s = createSave();
    grantProduct(s, 'haunted_regen_4');
    expect(s.haunted.regens).toBe(4);
  });
});

describe('profile add-ons', () => {
  it('only show on the card once bought, and survive a stranger’s card cleaning', () => {
    const s = createSave();
    s.creator.top = { id: 'Ab3_x-9k', likes: 12, plays: 40 };
    s.creator.plays = 40;
    expect(addOns(s)).toEqual({});
    expect(addOns(s, { spotlight: true }).spot?.id).toBe('Ab3_x-9k');
    grantProduct(s, 'creator_spotlight');
    grantProduct(s, 'builder_pack');
    expect(isOwned(s, 'builder_pack')).toBe(true);
    const card = myCard({ save: s, levelsBuilt: 0, levelsVerified: 0 });
    expect(card.spot).toEqual({ id: 'Ab3_x-9k', likes: 12, plays: 40 });
    expect(card.cs?.plays).toBe(40);
    expect(card.pro).toBe(true);
    expect(safeCard(JSON.parse(JSON.stringify(card)))).toMatchObject({ spot: card.spot, cs: card.cs, pro: true });
    // Junk from another player is dropped.
    const bad = safeCard({ ...card, spot: { id: '<script>', likes: 1, plays: 1 }, pro: 'yes', cs: { plays: -5 } });
    expect(bad?.spot).toBeUndefined();
    expect(bad?.pro).toBeUndefined();
    expect(bad?.cs?.plays).toBe(0);
  });

  it('old saves get the new fields', () => {
    const m = migrate({ purchases: { noAds: true }, creator: { plays: 3 } });
    expect(m.purchases.spotlight).toBe(false);
    expect(m.creator.top).toEqual({ id: '', likes: 0, plays: 0 });
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
