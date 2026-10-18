import { describe, expect, it } from 'vitest';
import { createSave } from '../src/state/save';
import { BADGES, earnedBadges, myCard, safeCard } from '../src/meta/profile';
import { safePlayers } from '../src/services/net';

describe('player profiles', () => {
  it('earns badges from stats only', () => {
    const save = createSave();
    expect(earnedBadges({ save, levelsBuilt: 0, levelsVerified: 0 })).toEqual([]);
    save.stats.bestDistance = 3200;
    save.stats.racesWon = 12;
    const ids = earnedBadges({ save, levelsBuilt: 1, levelsVerified: 0 }).map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(['rush1k', 'rush3k', 'win10', 'builder']));
    expect(ids).not.toContain('rush6k');
  });

  it('creator, community and Extreme badges show progress', () => {
    const save = createSave();
    const ctx = { save, levelsBuilt: 3, levelsVerified: 1, levelsCoop: 1 };
    const byId = (id: string) => BADGES.find((b) => b.id === id)!;
    expect(byId('workshop').progress(ctx)).toEqual([3, 10]);
    save.creator.sharedIds = ['abc123def456'];
    save.creator.likes = 30;
    save.stats.communityClears = 4;
    save.best.endless_hard = 5200;
    const ids = earnedBadges(ctx).map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(['builder', 'cobuild', 'published', 'fans', 'hard2k', 'extreme5k']));
    expect(ids).not.toContain('hall');
    expect(byId('explorer').progress(ctx)).toEqual([4, 10]);
    // Progress never shows past the target.
    expect(byId('fans').progress(ctx)).toEqual([25, 25]);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });

  it('only shows titles and badges you have earned', () => {
    const save = createSave();
    save.profile.title = 'legend';
    save.profile.showcase = ['rush1k', 'legend'];
    save.profile.banner = 7;
    save.stats.bestDistance = 1500;
    const card = myCard({ save, levelsBuilt: 0, levelsVerified: 0 });
    expect(card.title).toBe('');
    expect(card.show).toEqual(['rush1k']);
    expect(card.banner).toBe(0);
  });

  it('cleans cards from other players', () => {
    const evil = { lv: 1e9, trophies: -5, best: 'lots', wins: 3.7, title: 'hello <b>', banner: 99, show: ['rush1k', 'rush1k', 'x', 'win10', 'win50', 'gold'], badges: 999, extra: 'my number is 555' };
    const c = safeCard(evil)!;
    expect(c).toEqual({ lv: 999, trophies: 0, best: 0, wins: 3, title: '', banner: 8, show: ['rush1k', 'win10', 'win50'], badges: BADGES.length, eggs: 0 });
    expect(JSON.stringify(c)).not.toContain('555');
    expect(safeCard('nope')).toBeUndefined();
    const [p] = safePlayers([{ id: 'a', name: 'Speedy Panda 7', skin: 'classic', host: false, color: 1, card: evil }]);
    expect(p.card?.show).toHaveLength(3);
  });
});
