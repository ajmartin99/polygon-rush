import { describe, expect, it } from 'vitest';
import { activeEvent } from '../src/meta/events';
import { HAUNTED_SONG, MENU_SONG, menuTheme, songsFor } from '../src/core/songs';
import { SKINS, TRAILS } from '../src/meta/catalog';

describe('Spooky Season', () => {
  it('runs from Oct 1 to Nov 7', () => {
    expect(activeEvent(new Date(2026, 8, 30))).toBeNull();
    expect(activeEvent(new Date(2026, 9, 1))?.id).toBe('halloween');
    expect(activeEvent(new Date(2026, 9, 31, 23))?.id).toBe('halloween');
    expect(activeEvent(new Date(2026, 10, 7))?.id).toBe('halloween');
    expect(activeEvent(new Date(2026, 10, 8))).toBeNull();
  });

  it('swaps the menu theme and only plays the Halloween song in season', () => {
    const oct = new Date(2026, 9, 20);
    const may = new Date(2026, 4, 20);
    expect(menuTheme(oct)).toBe(HAUNTED_SONG);
    expect(menuTheme(may)).toBe(MENU_SONG);
    expect(songsFor('menu', oct)[0]).toBe(HAUNTED_SONG);
    // Menu songs (the Halloween theme included) never play during runs.
    expect(songsFor('run', oct)).not.toContain(HAUNTED_SONG);
    for (const c of ['menu', 'run', 'race'] as const) expect(songsFor(c, may)).not.toContain(HAUNTED_SONG);
  });

  it('has a free gift plus skins and trails to buy', () => {
    const ev = activeEvent(new Date(2026, 9, 20))!;
    const items = [...SKINS, ...TRAILS].filter((i) => i.unlock.kind === 'event');
    expect(items.length).toBeGreaterThanOrEqual(8);
    expect(SKINS.find((s) => s.id === ev.gift.id)?.unlock).toEqual({ kind: 'event', event: 'halloween', price: 0 });
  });
});
