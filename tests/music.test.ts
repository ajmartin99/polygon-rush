import { beforeEach, describe, expect, it, vi } from 'vitest';
import { audio } from '../src/core/audio';
import { music } from '../src/core/music';
import { menuTheme, SONGS, songsFor } from '../src/core/songs';
import { TRACK_BASE, TRACKS, tracksFor } from '../src/core/tracks';
import { store } from '../src/state/store';

const played: number[] = [];
type Internals = { songIndex: number; trackId: number; pending: number };
const internals = audio as unknown as Internals;

beforeEach(() => {
  played.length = 0;
  store.data.settings.musicOff = [];
  store.data.settings.classicSongs = false;
  store.data.settings.myMusic = 'mix';
  music.stop();
  internals.trackId = -1;
  vi.spyOn(audio, 'playSong').mockImplementation((i: number) => {
    internals.songIndex = i;
    internals.trackId = -1;
    played.push(i);
  });
  vi.spyOn(audio, 'playTrack').mockImplementation((id: number) => {
    internals.trackId = id;
    played.push(id);
  });
});

describe('recorded tracks', () => {
  it('have credits and valid files, and enough for every context', () => {
    for (const t of TRACKS) {
      expect(t.title && t.artist && t.source.startsWith('https://')).toBeTruthy();
      expect(['CC0', 'CC-BY 3.0', 'CC-BY 4.0', 'OGA-BY 3.0']).toContain(t.license);
      expect(t.file).toMatch(/^[a-z0-9-]+\.mp3$/);
      expect(t.bpm).toBeGreaterThan(40);
    }
    expect(TRACK_BASE + TRACKS.length).toBeLessThan(200);
    expect(tracksFor('menu').length).toBeGreaterThanOrEqual(3);
    expect(tracksFor('run').length).toBeGreaterThanOrEqual(12);
    expect(tracksFor('race').length).toBeGreaterThanOrEqual(3);
  });
});

describe('music director', () => {
  it('plays recorded menu music in the menu and rotates instead of repeating', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15));
    try {
      music.menu();
      for (let i = 0; i < 6; i++) audio.onSongEnd?.();
      for (const id of played) expect(tracksFor('menu')).toContain(id);
      for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leads with the seasonal theme in season, then the menu tracks', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20));
    try {
      music.menu();
      expect(played).toEqual([menuTheme()]);
      audio.onSongEnd?.();
      expect(tracksFor('menu')).toContain(played[1]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays a different song on every new level, never a menu song', () => {
    music.menu();
    const start = played.length;
    music.run(0);
    const pool = tracksFor('run');
    for (let lv = 1; lv < pool.length; lv++) music.world(lv % 6);
    const runSongs = played.slice(start);
    for (const i of runSongs) expect(pool).toContain(i);
    expect(new Set(runSongs).size).toBe(runSongs.length);
    expect(runSongs.length).toBe(pool.length);
  });

  it('mixes the classic synth songs back in when switched on', () => {
    store.data.settings.classicSongs = true;
    const pool = music.pool('run');
    expect(pool).toEqual(expect.arrayContaining([...tracksFor('run'), ...songsFor('run')]));
    music.run(0);
    for (let i = 0; i < pool.length - 1; i++) audio.onSongEnd?.();
    expect(new Set(played).size).toBe(pool.length);
  });

  it('skips songs switched off in settings', () => {
    const keep = tracksFor('run').slice(0, 2);
    store.data.settings.musicOff = tracksFor('run').filter((i) => !keep.includes(i));
    music.run(0);
    for (let i = 0; i < 8; i++) music.skip();
    expect(played.every((i) => keep.includes(i))).toBe(true);
  });

  it('falls back to the full list when everything is off', () => {
    store.data.settings.musicOff = [...SONGS.map((_, i) => i), ...TRACKS.map((_, i) => TRACK_BASE + i)];
    music.race();
    music.skip();
    expect(played).toHaveLength(2);
  });

  it('reports the queued song straight after a skip', () => {
    music.menu();
    internals.pending = -1;
    music.skip();
    expect(music.current).toBe(played.at(-1));
  });

  it('loops a custom level song, synth or recorded', () => {
    music.level(15, 0);
    audio.onSongEnd?.();
    expect(played).toEqual([15]);
    music.level(TRACK_BASE + 3, 0);
    audio.onSongEnd?.();
    expect(played).toEqual([15, TRACK_BASE + 3]);
    music.level(-1, 4);
    expect(played.at(-1)).toBe(4);
  });

  it('beat-synced runs: each level plays the song its course was built on', () => {
    music.resetPlan(true);
    const grids = [0, 1, 2, 3].map((l) => music.planLevel(l));
    for (const g of grids) expect(g && g.bpm).toBeGreaterThan(40);
    music.run(0, 0);
    const first = played.at(-1)!;
    expect(music.syncSong).toEqual({ id: first, level: 0 });
    music.world(1, 1);
    const second = played.at(-1)!;
    expect(second).not.toBe(first);
    expect(music.syncSong?.level).toBe(1);
    // The song a level was planned with is the one that plays (same tempo as its course).
    expect(music.planLevel(1)).toEqual(grids[1]);
    // A song ending mid-level doesn't switch away from the level's song.
    audio.onSongEnd?.();
    expect(played.at(-1)).toBe(second);
    music.resetPlan(false);
  });
});
