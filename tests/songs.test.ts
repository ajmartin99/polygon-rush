import { describe, expect, it } from 'vitest';
import { lane, MENU_SONG, parseMelody, RACE_SONG, SCALES, SONGS, songsFor, WORLD_SONGS } from '../src/core/songs';
import { MAX_LEVEL_SONG } from '../src/game/level';

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
