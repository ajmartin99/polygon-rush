import { describe, expect, it } from 'vitest';
import { ADVENT_REWARDS, adventToday, adventWaiting, doorState, LATE_DOOR_GEMS, openDoor } from '../src/meta/advent';
import { createSave, migrate } from '../src/state/save';
import { SKINS, TRAILS } from '../src/meta/catalog';
import { EMOTES } from '../src/meta/emotes';

const dec = (d: number, year = 2026) => new Date(year, 11, d, 12);

describe('Advent Calendar', () => {
  it('has 25 doors whose items all exist', () => {
    expect(ADVENT_REWARDS).toHaveLength(25);
    const ids = JSON.stringify(ADVENT_REWARDS);
    for (const m of ids.matchAll(/"kind":"(skin|trail|emote)","id":"([a-z]+)"/g)) {
      const list = m[1] === 'skin' ? SKINS : m[1] === 'trail' ? TRAILS : EMOTES;
      expect(list.some((x) => x.id === m[2]), m[2]).toBe(true);
    }
  });

  it('opens today’s door free, missed doors for gems, never tomorrow’s', () => {
    const s = createSave();
    s.gems = 1000;
    expect(adventToday(dec(5))).toBe(5);
    expect(adventWaiting(s, dec(5))).toBe(1);
    expect(doorState(s, 6, dec(5))).toBe('locked');
    expect(openDoor(s, 6, dec(5))).toBeNull();
    const today = openDoor(s, 5, dec(5))!;
    expect(today.gems).toBe(150);
    expect(s.gems).toBe(1150);
    expect(openDoor(s, 5, dec(5))).toBeNull();
    expect(adventWaiting(s, dec(5))).toBe(0);
    // Door 4 (Snowfall trail) was missed: it costs gems.
    expect(doorState(s, 4, dec(5))).toBe('late');
    const late = openDoor(s, 4, dec(5))!;
    expect(late.trails).toEqual(['snowfall']);
    expect(s.gems).toBe(1150 - LATE_DOOR_GEMS);
    expect(s.trails.owned).toContain('snowfall');
  });

  it('gives gems instead of things you already own, and a big present on the 25th', () => {
    const s = createSave();
    s.emotes.owned.push('xtree');
    expect(openDoor(s, 2, dec(2))!.gems).toBeGreaterThan(0);
    const xmas = openDoor(s, 25, dec(25))!;
    expect(xmas.skins).toEqual(['starlight']);
    expect(xmas.trails).toEqual(['aurora']);
    expect(xmas.gems).toBe(500);
    // Kept through a save round trip.
    const back = migrate(JSON.parse(JSON.stringify(s)));
    expect(back.skins.owned).toContain('starlight');
    expect(back.advent.opened).toEqual([2, 25]);
  });

  it('missed doors can still be opened until Twelfth Night, and a new December starts fresh', () => {
    const s = createSave();
    s.gems = 1000;
    expect(doorState(s, 20, new Date(2027, 0, 3))).toBe('late');
    expect(openDoor(s, 20, new Date(2027, 0, 3))).not.toBeNull();
    expect(openDoor(s, 21, new Date(2027, 0, 9))).toBeNull();
    expect(doorState(s, 20, dec(20, 2027))).toBe('today');
    expect(adventToday(new Date(2026, 10, 30))).toBe(0);
  });
});
