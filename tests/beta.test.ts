import { describe, expect, it } from 'vitest';
import { BETA_REWARD, grantBeta, isBetaBuild } from '../src/meta/beta';
import { BADGES, earnedBadges } from '../src/meta/profile';
import { createSave } from '../src/state/save';

describe('beta tester rewards', () => {
  it('1.0.x is the beta; 1.1.0 and later are not', () => {
    expect(isBetaBuild('1.0.6')).toBe(true);
    expect(isBetaBuild('1.0.12')).toBe(true);
    expect(isBetaBuild('1.1.0')).toBe(false);
    expect(isBetaBuild('2.0.0')).toBe(false);
    expect(isBetaBuild('dev')).toBe(false);
  });

  it('granted once on a beta build, kept after the full release', () => {
    const save = createSave();
    const gems = save.gems;
    expect(grantBeta(save, '1.0.7', 5)).toBe(true);
    expect(save.skins.owned).toContain(BETA_REWARD.skin);
    expect(save.trails.owned).toContain(BETA_REWARD.trail);
    expect(save.emotes.owned).toContain(BETA_REWARD.emote);
    expect(save.gems).toBe(gems + BETA_REWARD.gems);
    expect(grantBeta(save, '1.0.8')).toBe(false);
    expect(save.gems).toBe(gems + BETA_REWARD.gems);
    const ctx = { save, levelsBuilt: 0, levelsVerified: 0 };
    expect(earnedBadges(ctx).map((b) => b.id)).toContain('beta');
    expect(BADGES.some((b) => b.id === 'beta')).toBe(true);
  });

  it('new players on 1.1.0 never get them', () => {
    const save = createSave();
    expect(grantBeta(save, '1.1.0')).toBe(false);
    expect(save.skins.owned).not.toContain(BETA_REWARD.skin);
    expect(save.beta.tester).toBe(false);
  });
});
