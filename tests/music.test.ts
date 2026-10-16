import { beforeEach, describe, expect, it, vi } from 'vitest';
import { audio } from '../src/core/audio';
import { music } from '../src/core/music';
import { menuTheme, SONGS, songsFor } from '../src/core/songs';
import { store } from '../src/state/store';

const played: number[] = [];

beforeEach(() => {
  played.length = 0;
  store.data.settings.musicOff = [];
  music.stop();
  vi.spyOn(audio, 'playSong').mockImplementation((i: number) => {
    (audio as unknown as { songIndex: number }).songIndex = i;
    played.push(i);
  });
});

describe('music director', () => {
  it('opens the menu with its theme and rotates instead of repeating', () => {
    music.menu();
    expect(played).toEqual([menuTheme()]);
    for (let i = 0; i < 6; i++) audio.onSongEnd?.();
    for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    expect(new Set(played).size).toBe(songsFor('menu').length);
  });

  it('plays every run song once before repeating', () => {
    music.run(0);
    const pool = songsFor('run');
    for (let i = 0; i < pool.length - 1; i++) audio.onSongEnd?.();
    expect(new Set(played).size).toBe(pool.length);
  });

  it('plays a different song on every new level, never a menu song', () => {
    music.menu();
    const menuSong = played.at(-1)!;
    music.run(0);
    const pool = songsFor('run');
    for (let lv = 1; lv < pool.length; lv++) music.world(lv % 6);
    const runSongs = played.slice(1);
    expect(runSongs).not.toContain(menuSong);
    for (const i of runSongs) expect(songsFor('menu')).not.toContain(i);
    // A full bag: every run song once, no repeats.
    expect(new Set(runSongs).size).toBe(runSongs.length);
    expect(runSongs.length).toBe(pool.length);
  });

  it('skips songs switched off in settings', () => {
    const off = songsFor('run').filter((i) => i !== 2 && i !== 9);
    store.data.settings.musicOff = off;
    music.run(0);
    for (let i = 0; i < 8; i++) music.skip();
    expect(played.every((i) => i === 2 || i === 9)).toBe(true);
  });

  it('falls back to the full list when everything is off', () => {
    store.data.settings.musicOff = SONGS.map((_, i) => i);
    music.race();
    music.skip();
    expect(played).toHaveLength(2);
  });

  it('reports the queued song straight after a skip', () => {
    music.menu();
    (audio as unknown as { pending: number }).pending = -1;
    music.skip();
    expect(music.current).toBe(played.at(-1));
  });

  it('loops a custom level song', () => {
    music.level(15, 0);
    audio.onSongEnd?.();
    expect(played).toEqual([15]);
    music.level(-1, 4);
    expect(played.at(-1)).toBe(4);
  });
});
