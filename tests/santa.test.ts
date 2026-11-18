import { describe, expect, it } from 'vitest';
import { unwrapPresent } from '../src/meta/santa';
import { createSave } from '../src/state/save';

describe('Secret Santa presents', () => {
  it('hold gems or a Christmas emote you don’t have, the same for the same present', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = createSave();
      const before = s.gems;
      const a = unwrapPresent(s, `gift${i}`);
      const b = unwrapPresent(createSave(), `gift${i}`);
      expect(a).toEqual(b);
      if (a.emote) {
        kinds.add('emote');
        expect(s.emotes.owned).toContain(a.emote);
      } else {
        kinds.add('gems');
        expect(a.gems).toBeGreaterThanOrEqual(30);
        expect(a.gems).toBeLessThanOrEqual(120);
        expect(s.gems).toBe(before + a.gems);
      }
    }
    expect(kinds).toEqual(new Set(['gems', 'emote']));
  });
});
