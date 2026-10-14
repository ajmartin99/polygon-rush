import { describe, expect, it } from 'vitest';
import { lane, parseMelody, SCALES, SONGS } from '../src/core/songs';

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
      for (const l of [song.bass, song.arp, song.grooveA.kick, song.grooveA.snare, song.grooveA.hat, song.grooveB.kick, song.grooveB.snare, song.grooveB.hat]) {
        expect(lane(l)).toHaveLength(16);
      }
      expect(song.progA).toHaveLength(4);
      expect(song.progB).toHaveLength(4);
      expect(song.bpm).toBeGreaterThanOrEqual(90);
      expect(song.bpm).toBeLessThanOrEqual(150);
    });
  }
  it('has a theme per world plus menu and race', () => {
    expect(SONGS.length).toBe(8);
    expect(new Set(SONGS.map((s) => s.title)).size).toBe(8);
  });
});
