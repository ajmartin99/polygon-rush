import { describe, expect, it } from 'vitest';
import { describeGrant, grantPromo } from '../src/meta/promos';
import { createSave } from '../src/state/save';

describe('promo codes', () => {
  it('gives gems, items and Heart Regens, skipping unknown, owned and purchase-only items', () => {
    const s = createSave();
    const gems = s.gems;
    const g = grantPromo(s, { gems: 500, skins: ['bubblegum', 'classic', 'rainbow', 'nope'], trails: ['lines'], emotes: ['fire', 'wave'], regens: 2 });
    expect(g).toEqual({ gems: 500, regens: 2, skins: ['bubblegum'], trails: ['lines'], emotes: ['fire'] });
    expect(s.gems).toBe(gems + 500);
    expect(s.skins.owned).toContain('bubblegum');
    expect(s.skins.owned).not.toContain('rainbow');
    expect(s.haunted.regens).toBe(2);
    expect(describeGrant(g)).toMatch(/^500 gems, the Bubblegum skin, .* and 2 Heart Regens$/);
  });

  it('ignores bad numbers', () => {
    const s = createSave();
    const g = grantPromo(s, { gems: -5, regens: 1.5 });
    expect(g.gems).toBe(0);
    expect(g.regens).toBe(0);
    expect(describeGrant(g)).toBe('');
  });
});
