import { describe, expect, it } from 'vitest';
import { checkDisplayText } from '../src/shared/chat-filter';
import { isAllowedName } from '../src/meta/names-policy';
import { CODE_PREFIX, decodeLevel, encodeLevel, levelName, MAX_LEVEL_SONG, type LevelContent } from '../src/game/level';
import { encodeName } from '../src/meta/names';

const base = (extra: Partial<LevelContent> = {}): LevelContent => ({
  name: [3, 5],
  authors: ['Speedy Panda 7'],
  theme: 2,
  music: -1,
  speed: 1,
  hearts: 3,
  length: 120,
  pieces: [{ t: 'spike', x: 20, y: 0, v: 0 }],
  ...extra,
});

describe('typed names', () => {
  it('accepts friendly names and tidies spacing', () => {
    expect(checkDisplayText('Rocket Kid', 'name')).toMatchObject({ ok: true, text: 'Rocket Kid' });
    expect(checkDisplayText('  Neon   Fox 42 ', 'name')).toMatchObject({ ok: true, text: 'Neon Fox 42' });
    expect(checkDisplayText('Spike Canyon!', 'title').ok).toBe(true);
  });

  it('rejects names that could share contact details or impersonate', () => {
    for (const bad of ['ab', 'x'.repeat(17), '42 Fox', 'call 5551234', 'Fox 1 2 3 4', 'me@mail', 'Admin', 'Polygon Rush Staff', 'Moderator Bob']) {
      expect(checkDisplayText(bad, 'name').ok, bad).toBe(false);
    }
  });

  it('runs the chat filter, including glued and CamelCase words', () => {
    for (const bad of ['Shit Racer', 'ShitRacer', 'shitracer', 'Fuuuuck']) expect(checkDisplayText(bad, 'name').ok, bad).toBe(false);
    // Innocent words that contain filtered fragments stay allowed.
    for (const good of ['Class Act', 'Grass Hopper', 'Assassin Ace', 'Looping Star']) expect(checkDisplayText(good, 'name').ok, good).toBe(true);
    // Names are stricter than chat: longer swears hidden inside a word block it (kids' game, by design).
    expect(checkDisplayText('Scunthorpe Fan', 'name').ok).toBe(false);
  });

  it('isAllowedName takes generated names and exact clean typed names only', () => {
    expect(isAllowedName('Speedy Panda 7')).toBe(true);
    expect(isAllowedName('Rocket Kid')).toBe(true);
    expect(isAllowedName('Rocket  Kid')).toBe(false);
    expect(isAllowedName('Admin')).toBe(false);
    expect(isAllowedName(42)).toBe(false);
  });
});

describe('level codes v2', () => {
  it('round-trip a typed title, typed authors and a recorded track', () => {
    const l = base({ title: 'Spike Canyon', authors: ['Rocket Kid', 'Speedy Panda 7'], music: 70 });
    const back = decodeLevel(encodeLevel(l));
    expect(back.title).toBe('Spike Canyon');
    expect(levelName(back)).toBe('Spike Canyon');
    expect(back.authors).toEqual(['Rocket Kid', 'Speedy Panda 7']);
    expect(back.music).toBe(70);
  });

  it('never packs My Music ids or blocked text into a code', () => {
    const back = decodeLevel(encodeLevel(base({ music: 205, title: 'Shit Level', authors: ['Admin', 'Rocket Kid'] })));
    expect(back.music).toBe(-1);
    expect(back.title).toBeUndefined();
    expect(back.authors).toEqual(['Rocket Kid']);
    expect(MAX_LEVEL_SONG).toBeLessThan(200);
  });

  it('still reads v1 codes (song in the theme byte)', () => {
    const bytes = [1, 2 | ((16 + 1) << 3), (1 << 4) | 1, 120, 0, 3, 5, 1, ...encodeName('Speedy Panda 7')!, 1, 20, 2 << 4];
    let a = 1;
    let b = 0;
    for (const x of bytes) {
      a = (a + x) % 251;
      b = (b + a) % 251;
    }
    bytes.push(b, a);
    const code = CODE_PREFIX + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const l = decodeLevel(code);
    expect(l.music).toBe(16);
    expect(l.theme).toBe(2);
    expect(l.authors).toEqual(['Speedy Panda 7']);
    expect(l.title).toBeUndefined();
    expect(l.pieces).toEqual([{ t: 'spike', x: 20, y: 0, v: 0 }]);
  });
});
