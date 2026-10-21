import { describe, expect, it } from 'vitest';
import { lane, MENU_SONG, parseMelody, RACE_SONG, SCALES, SONGS, songsFor, WORLD_SONGS } from '../src/core/songs';
import { MAX_LEVEL_SONG } from '../src/game/level';
import { endlessSongs, levelSongs, trackOf } from '../src/core/tracks';

describe('soundtrack', () => {
  for (const song of SONGS) {
    it(`"${song.title}" is well formed`, () => {
      const scale = SCALES[song.scale];
      const a = parseMelody(song.melA, scale);
      const b = parseMelody(song.melB, scale);
      expect(a.length).toBeGreaterThan(12);
      expect(b.length).toBeGreaterThan(8);
      for (const n of [...a, ...b]) {
        expect(n.step).toBeGreaterThanOrEqual(0);
        expect(n.step + n.len).toBeLessThanOrEqual(64);
        // Keep the hook in a comfortable, non-shrill range.
        expect(song.root + 12 * (song.leadOctave ?? 1) + n.semis).toBeLessThanOrEqual(96);
      }
      const lanes: [string, RegExp][] = [
        [song.bass, /^[rtfo.-]$/],
        [song.arp, /^[0-3.]$/],
        [song.grooveA.kick, /^[x.]$/],
        [song.grooveB.kick, /^[x.]$/],
        [song.grooveA.snare, /^[xg.]$/],
        [song.grooveB.snare, /^[xg.]$/],
        [song.grooveA.hat, /^[xor.]$/],
        [song.grooveB.hat, /^[xor.]$/],
      ];
      for (const [l, ok] of lanes) {
        const steps = lane(l);
        expect(steps).toHaveLength(16);
        for (const t of steps) expect(t, l).toMatch(ok);
      }
      expect(song.progA).toHaveLength(4);
      expect(song.progB).toHaveLength(4);
      expect(song.bpm).toBeGreaterThanOrEqual(85);
      expect(song.bpm).toBeLessThanOrEqual(180);
      expect(song.genre.length).toBeGreaterThan(2);
    });
  }
  it('has a theme per world, a menu theme, race songs and a varied mix', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(16);
    expect(SONGS.length).toBeLessThanOrEqual(MAX_LEVEL_SONG + 1);
    expect(new Set(SONGS.map((s) => s.title)).size).toBe(SONGS.length);
    expect(new Set(SONGS.map((s) => s.genre)).size).toBeGreaterThanOrEqual(12);
    for (let w = 0; w < WORLD_SONGS; w++) expect(SONGS[w].role).toBe('world');
    expect(SONGS[MENU_SONG].role).toBe('menu');
    expect(songsFor('menu')).toContain(MENU_SONG);
    expect(songsFor('race')).toContain(RACE_SONG);
    expect(songsFor('race').length).toBeGreaterThanOrEqual(3);
    expect(songsFor('run').length).toBeGreaterThanOrEqual(12);
    expect(songsFor('run')).not.toContain(MENU_SONG);
  });
});

describe('Endless level songs', () => {
  it('every level has a main song and a different backup, the same every time', () => {
    const off = new Date(2026, 5, 1);
    const list = endlessSongs();
    expect(list.length).toBeGreaterThan(10);
    for (let i = 0; i < 40; i++) {
      const a = levelSongs(i, off);
      expect(a).toEqual(levelSongs(i, off));
      expect(a.main).not.toBe(a.backup);
      expect(list).toContain(a.main);
      expect(list).toContain(a.backup);
    }
    // Each song is a main song once before any repeats.
    expect(new Set(Array.from({ length: list.length }, (_, i) => levelSongs(i, off).main)).size).toBe(list.length);
  });

  it('never uses a season’s, a mode’s own or a retired song as a main song', () => {
    for (const id of endlessSongs()) {
      const t = trackOf(id)!;
      expect(t.event).toBeUndefined();
      expect(t.exclusive).toBeUndefined();
      expect(t.retired).toBeUndefined();
    }
  });

  it('in season, the backup is one of the season’s songs', () => {
    const halloween = new Date(2026, 9, 20);
    for (let i = 0; i < 10; i++) expect(trackOf(levelSongs(i, halloween).backup)?.event).toBe('halloween');
  });
});
