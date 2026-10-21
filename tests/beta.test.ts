import { describe, expect, it } from 'vitest';
import { addBetaPlay, BETA_DAY_SECONDS, BETA_REWARD, BETA_SKIN_DAYS, BETA_TRAIL_DAYS, isBetaBuild, joinBeta } from '../src/meta/beta';
import { BADGES, earnedBadges } from '../src/meta/profile';
import { createSave, migrate } from '../src/state/save';

const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;

/** Play a full test day on each of `n` days. */
function testDays(save: ReturnType<typeof createSave>, n: number, version = '1.0.12') {
  const unlocked: string[] = [];
  for (let i = 1; i <= n; i++) unlocked.push(...addBetaPlay(save, version, BETA_DAY_SECONDS, day(i)).unlocked);
  return unlocked;
}

describe('beta tester rewards', () => {
  it('1.0.x is the beta; 1.1.0 and later are not', () => {
    expect(isBetaBuild('1.0.6')).toBe(true);
    expect(isBetaBuild('1.0.12')).toBe(true);
    expect(isBetaBuild('1.1.0')).toBe(false);
    expect(isBetaBuild('2.0.0')).toBe(false);
    expect(isBetaBuild('dev')).toBe(false);
  });

  it('joining gives the Founding Tester title now, but no items or gems', () => {
    const save = createSave();
    const gems = save.gems;
    expect(joinBeta(save, '1.0.12', 5)).toBe(true);
    expect(joinBeta(save, '1.0.12')).toBe(false);
    expect(earnedBadges({ save, levelsBuilt: 0, levelsVerified: 0 }).map((b) => b.id)).toContain('beta');
    expect(BADGES.some((b) => b.id === 'beta')).toBe(true);
    expect(save.skins.owned).not.toContain(BETA_REWARD.skin);
    expect(save.trails.owned).not.toContain(BETA_REWARD.trail);
    expect(save.gems).toBe(gems);
  });

  it('a test day needs 5 minutes of play that day, counted once', () => {
    const save = createSave();
    joinBeta(save, '1.0.12');
    expect(addBetaPlay(save, '1.0.12', BETA_DAY_SECONDS - 15, day(1)).counted).toBe(false);
    expect(addBetaPlay(save, '1.0.12', 15, day(1)).counted).toBe(true);
    expect(addBetaPlay(save, '1.0.12', 600, day(1)).counted).toBe(false);
    // Minutes don't carry over to the next day.
    expect(addBetaPlay(save, '1.0.12', BETA_DAY_SECONDS - 15, day(2)).counted).toBe(false);
    expect(save.beta.days).toEqual([day(1)]);
  });

  it(`${BETA_TRAIL_DAYS} test days unlock the trail and emote, ${BETA_SKIN_DAYS} the skin and gems`, () => {
    const save = createSave();
    joinBeta(save, '1.0.12');
    const gems = save.gems;
    expect(testDays(save, BETA_TRAIL_DAYS - 1)).toEqual([]);
    expect(addBetaPlay(save, '1.0.12', BETA_DAY_SECONDS, day(BETA_TRAIL_DAYS)).unlocked).toEqual(['trail']);
    expect(save.trails.owned).toContain(BETA_REWARD.trail);
    expect(save.emotes.owned).toContain(BETA_REWARD.emote);
    expect(save.skins.owned).not.toContain(BETA_REWARD.skin);
    for (let i = BETA_TRAIL_DAYS + 1; i <= BETA_SKIN_DAYS; i++) addBetaPlay(save, '1.0.12', BETA_DAY_SECONDS, day(i));
    expect(save.skins.owned).toContain(BETA_REWARD.skin);
    expect(save.gems).toBe(gems + BETA_REWARD.gems);
    // Paid out once.
    addBetaPlay(save, '1.0.12', BETA_DAY_SECONDS, day(20));
    expect(save.gems).toBe(gems + BETA_REWARD.gems);
  });

  it('nothing counts outside the beta or before joining', () => {
    const save = createSave();
    expect(addBetaPlay(save, '1.0.12', BETA_DAY_SECONDS, day(1)).counted).toBe(false);
    expect(joinBeta(save, '1.1.0')).toBe(false);
    expect(save.beta.tester).toBe(false);
    save.beta.tester = true;
    expect(testDays(save, 20, '1.1.0')).toEqual([]);
    expect(save.beta.days).toEqual([]);
  });

  it('early testers who already got everything keep it, without a second payout', () => {
    const old = migrate({ beta: { tester: true, version: '1.0.7', at: 5 }, skins: { owned: ['classic', 'betabot'], equipped: 'classic' }, trails: { owned: ['none', 'debug'], equipped: 'none' } });
    const gems = old.gems;
    expect(joinBeta(old, '1.0.12')).toBe(false);
    expect(old.beta.claimed).toEqual(['trail', 'skin']);
    testDays(old, BETA_SKIN_DAYS);
    expect(old.gems).toBe(gems);
    expect(old.skins.owned).toContain('betabot');
  });
});
