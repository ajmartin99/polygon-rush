import { describe, expect, it } from 'vitest';
import { formatHandle, parseHandle } from '../src/shared/handle';
import { myCard, safeCard } from '../src/meta/profile';
import { createSave, migrate } from '../src/state/save';

describe('friend handles', () => {
  it('format with a zero-padded 4-digit tag', () => {
    expect(formatHandle('Neon Fox', 427)).toBe('Neon Fox#0427');
    expect(formatHandle('Neon Fox', 0)).toBe('Neon Fox');
  });

  it('parse loosely typed handles', () => {
    expect(parseHandle('Neon Fox#0427')).toEqual({
      name: 'Neon Fox',
      tag: 427,
    });
    expect(parseHandle('  neon   fox # 427 ')).toEqual({
      name: 'neon fox',
      tag: 427,
    });
    expect(parseHandle('Speedy Panda 7#12')).toEqual({
      name: 'Speedy Panda 7',
      tag: 12,
    });
    for (const bad of ['Neon Fox', 'Neon Fox#', 'Neon Fox#12345', 'ab#12', 'Neon Fox#0000', 42]) expect(parseHandle(bad)).toBeNull();
  });
});

describe('profile card #tag', () => {
  const ctx = (birthYear: number, tag: number) => {
    const save = createSave();
    save.profile.birthYear = birthYear;
    save.profile.tag = tag;
    return { save } as Parameters<typeof myCard>[0];
  };

  it('is shared by 13+ only', () => {
    const year = new Date().getFullYear();
    expect(myCard(ctx(year - 30, 427)).tag).toBe(427);
    expect(myCard(ctx(year - 9, 427)).tag).toBeUndefined();
    expect(myCard(ctx(year - 30, 0)).tag).toBeUndefined();
  });

  it('is validated when received', () => {
    expect(safeCard({ lv: 3, tag: 427 })?.tag).toBe(427);
    expect(safeCard({ lv: 3, tag: 99999 })?.tag).toBeUndefined();
    expect(safeCard({ lv: 3, tag: '427' })?.tag).toBeUndefined();
  });

  it('survives save migration and rejects junk', () => {
    expect(migrate({ profile: { tag: 427 } }).profile.tag).toBe(427);
    expect(migrate({ profile: { tag: -5 } }).profile.tag).toBe(0);
    expect(migrate({}).settings.friends).toBe(true);
  });
});
