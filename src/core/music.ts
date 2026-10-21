import { store } from '../state/store';
import { audio } from './audio';
import { menuTheme, RACE_SONG, SONGS, songsFor, WORLD_SONGS } from './songs';
import { MAIN_SONG_CHANCE, TRACK_BASE, USER_BASE, isPickable, levelSongs, trackOf, tracksFor } from './tracks';
import type { LevelSong } from '../game/levels';
import { myMusic } from '../services/mymusic';
import { activeEvent } from '../meta/events';
import { Emitter } from './emitter';
import { Rng } from './rng';

/**
 * What plays where:
 *  - menu:  the main theme first, then the calmer menu songs;
 *  - run:   each world's signature song when you reach it, the mix in between;
 *  - race:  the fast songs;
 *  - build: the level's world song, then menu songs (calm while building);
 *  - level: one song on loop (custom levels are short and pick their song).
 * Songs switched off in Settings → Soundtrack are skipped (unless every one is).
 */
/**
 * How long a synth song plays before it hands over: the 2-bar intro, then
 * whole 16-bar A-B-A-B cycles until about 105 s (see the audio engine).
 */
export function synthSongSeconds(bpm: number): number {
  const bar = 240 / bpm;
  let bars = 2 + 16;
  while (bars * bar < 105) bars += 16;
  return bars * bar;
}

export type MusicContext = 'menu' | 'run' | 'race' | 'build' | 'level';

class MusicDirector extends Emitter<{ song: number }> {
  private context: MusicContext | null = null;
  private bag: number[] = [];
  private last = -1;
  /** The song lined up to play next (already preloading when it's a track). */
  private queued = -1;

  constructor() {
    super();
    audio.onSongEnd = () => {
      // A level lasts exactly its song: the next level starts the next one.
      if (this.planning && this.context === 'run') return;
      if (this.context && this.context !== 'level') this.next();
    };
    // A track that won't load (missing file, unsupported format): move on.
    audio.onTrackError = (id) => {
      this.broken.add(id);
      if (this.context) this.next();
    };
  }

  private broken = new Set<number>();
  /** The id most recently asked for (user files load asynchronously). */
  private wanted = -1;

  get current(): number {
    return audio.targetSong;
  }

  get contextName(): MusicContext | null {
    return this.context;
  }

  /** Main menu: a random menu song, or the (seasonal) theme. */
  menu(): void {
    this.planning = false;
    // Recorded menu music when we have it (the seasonal theme still leads in season).
    // With recorded menu music, open on a random one (the seasonal theme still leads in season).
    const rec = this.recorded('menu');
    this.start('menu', rec.length && !activeEvent() && !this.mineOnly() ? -1 : menuTheme());
  }

  // ------------------------------------------------------------------ beat-synced runs
  /** Endless with beat sync: the song planned for each level (0-based from the run's start). */
  private plan = new Map<number, number>();
  private planBag: number[] = [];
  private planning = false;
  private runLevel = 0;

  /**
   * A new endless run whose levels are built on their songs' beat (not the
   * Daily Run, which must be the same for everyone). Call before the run's
   * course is generated.
   */
  resetPlan(on: boolean, fixed?: { songs: number[]; seed: number }): void {
    this.plan.clear();
    this.planBag = [];
    this.planning = on;
    this.fixed = null;
    if (on && fixed && fixed.songs.length) {
      // A set soundtrack (the Daily Run): the same songs in the same order for everyone today.
      const rng = new Rng(fixed.seed ^ 0x5eed);
      const order = fixed.songs.slice();
      for (let i = order.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [order[i], order[j]] = [order[j], order[i]];
      }
      this.fixed = order;
    }
  }

  /** The Daily Run's set soundtrack (null for normal runs). */
  private fixed: number[] | null = null;

  /**
   * Song for a level, chosen once per run. Endless levels have their own two
   * songs (main and backup, see levelSongs): one plays, picked at random.
   * Players can't skip or swap it: the level is built on that song.
   */
  private planned(level: number): number {
    let id = this.plan.get(level);
    if (id !== undefined) return id;
    if (this.fixed) {
      id = this.fixed[level % this.fixed.length];
      this.plan.set(level, id);
      return id;
    }
    const { main, backup } = levelSongs(level);
    const ok = [main, backup].filter((i) => i >= 0 && !this.broken.has(i));
    if (ok.length) {
      id = ok.length > 1 && main !== backup ? (Math.random() < MAIN_SONG_CHANCE ? main : backup) : ok[0];
      this.plan.set(level, id);
      return id;
    }
    // No recorded music at all: the classic songs, shuffled.
    const pool = songsFor('run');
    this.planBag = this.planBag.filter((i) => pool.includes(i));
    if (!this.planBag.length) {
      const prev = this.plan.get(level - 1);
      this.planBag = pool.filter((i) => i !== prev);
      if (!this.planBag.length) this.planBag = pool.slice();
      for (let i = this.planBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.planBag[i], this.planBag[j]] = [this.planBag[j], this.planBag[i]];
      }
    }
    id = this.planBag.shift()!;
    this.plan.set(level, id);
    return id;
  }

  /**
   * A level's song: which one, how long it lasts (the level lasts exactly
   * that long) and the beat its course is built on. My Music files have no
   * known length or beat, so their level runs a standard length.
   */
  levelSong(level: number): LevelSong {
    const id = this.planned(level);
    const t = trackOf(id);
    if (t) return { id, seconds: t.duration - 0.15, grid: { bpm: t.bpm, offset: t.offset } };
    if (id >= 0 && id < SONGS.length) return { id, seconds: synthSongSeconds(SONGS[id].bpm), grid: { bpm: SONGS[id].bpm, offset: 0 } };
    return { id, seconds: 120, grid: null };
  }

  /** The song planned for the level being played (for keeping the music in time). */
  get syncSong(): { id: number; level: number } | null {
    return this.planning && this.context === 'run' ? { id: this.planned(this.runLevel), level: this.runLevel } : null;
  }

  /** Endless run starting in a world (`level`: 0-based level index, for beat-synced runs). */
  run(world: number, level = 0): void {
    if (this.planning) {
      this.runLevel = level;
      this.context = null;
      this.start('run', this.planned(level), true);
      return;
    }
    // With recorded music every run starts on a random song; otherwise the world's theme.
    if (this.recorded('run').length >= 3 || this.mineOnly()) {
      this.context = null;
      this.start('run', -1);
    } else this.start('run', world % WORLD_SONGS);
  }

  /** The run reached a new world: play its signature song. */
  /**
   * The run reached a new level: switch to the next song in the shuffled
   * bag (every run song plays once before any repeats), so each level sounds
   * different instead of cycling the six world themes.
   */
  world(world: number, level = 0): void {
    if (this.context !== 'run') return this.run(world, level);
    if (this.planning) {
      this.runLevel = level;
      const id = this.planned(level);
      if (id !== audio.targetSong) this.play(id);
      return;
    }
    this.next();
  }

  race(first = RACE_SONG): void {
    this.planning = false;
    this.start('race', this.recorded('race').length >= 3 || this.mineOnly() ? -1 : first);
  }

  build(theme: number): void {
    this.start('build', theme % WORLD_SONGS);
  }

  /**
   * A custom level's song (looped). `song < 0` means its world's theme. A
   * mode's own song (Swing Along) only plays when that mode asks for it.
   */
  level(song: number, theme: number, exclusive = false): void {
    const t = trackOf(song);
    const ok = (song >= 0 && song < SONGS.length) || (t !== undefined && !this.broken.has(song) && (!t.exclusive || exclusive));
    this.start('level', ok ? song : theme % WORLD_SONGS, true);
  }

  /** A player-made level is playing: its song is part of the level and can't be changed. */
  get locked(): boolean {
    return this.context === 'level';
  }

  /** Play a specific song now (Soundtrack picker), keeping the context's rotation afterwards. */
  pick(song: number): void {
    if (this.locked || !isPickable(song)) return;
    if (!this.context) this.context = 'menu';
    this.play(song);
  }

  /** Skip to the next song in the rotation. */
  skip(): void {
    if (this.locked) return;
    if (!this.context) this.context = 'menu';
    this.next();
  }

  stop(): void {
    this.context = null;
    this.planning = false;
    audio.stopMusic();
  }

  /**
   * Songs this context rotates through, honouring Settings → Soundtrack:
   * recorded tracks, the classic synth songs (when switched on, or when
   * there aren't enough tracks yet) and My Music.
   */
  pool(context: MusicContext = this.context ?? 'menu'): number[] {
    const mine = this.mine();
    if (this.mineOnly()) return mine;
    const rec = context === 'build' ? [...this.recorded('menu'), ...this.recorded('run')] : this.recorded(context === 'level' ? 'run' : context);
    const synthCtx = context === 'level' ? 'run' : context;
    const useSynth = store.settings.classicSongs || rec.length < 3;
    const synth = !useSynth
      ? []
      : synthCtx === 'menu'
        ? songsFor('menu')
        : synthCtx === 'race'
          ? songsFor('race')
          : synthCtx === 'build'
            ? [...songsFor('menu'), ...songsFor('run').filter((i) => SONGS[i].role === 'world')]
            : songsFor('run');
    const base = [...rec, ...synth, ...(context === 'menu' || context === 'build' ? [] : mine)];
    const on = base.filter((i) => this.allowed(i));
    return on.length ? on : base;
  }

  private recorded(context: 'menu' | 'run' | 'race'): number[] {
    return tracksFor(context).filter((id) => !this.broken.has(id));
  }

  private mine(): number[] {
    return store.settings.myMusic === 'off' ? [] : myMusic.ids();
  }

  private mineOnly(): boolean {
    return store.settings.myMusic === 'only' && myMusic.ids().length > 0;
  }

  private allowed(song: number): boolean {
    return !this.broken.has(song);
  }

  private start(context: MusicContext, first: number, force = false): void {
    const changed = this.context !== context;
    this.context = context;
    if (changed) {
      this.bag = [];
      this.queued = -1;
    }
    const song = first >= 0 && (force || this.allowed(first)) ? first : this.draw();
    // Keep the current song if it already fits (e.g. back to menu from Settings).
    if (!changed && !force && this.pool().includes(audio.targetSong)) return;
    this.play(song);
  }

  private next(): void {
    const q = this.queued;
    this.queued = -1;
    this.play(q >= 0 && q !== audio.targetSong && this.pool().includes(q) ? q : this.draw());
  }

  /** Line up the following song and start loading it, so the next switch is seamless. */
  private lineUp(): void {
    if (this.context === 'level' || this.context === null) return;
    if (this.planning && this.context === 'run') {
      const t = trackOf(this.planned(this.runLevel + 1));
      if (t) audio.prefetch(`music/${t.file}`);
      return;
    }
    // A song lined up earlier but skipped past goes back in the bag.
    if (this.queued >= 0 && !this.bag.includes(this.queued)) this.bag.push(this.queued);
    this.queued = this.draw();
    const t = trackOf(this.queued);
    if (t) audio.prefetch(`music/${t.file}`);
  }

  /** Shuffle-bag draw: every song plays once before any repeats, never twice in a row. */
  private draw(): number {
    const pool = this.pool();
    this.bag = this.bag.filter((i) => pool.includes(i));
    if (!this.bag.length) {
      const fresh = pool.filter((i) => i !== audio.targetSong);
      this.bag = fresh.length ? fresh : pool.slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    let k = this.bag.findIndex((i) => i !== audio.targetSong && i !== this.last);
    if (k < 0) k = this.bag.findIndex((i) => i !== audio.targetSong);
    if (k < 0) k = 0;
    return this.bag.splice(k, 1)[0];
  }

  private play(song: number): void {
    if (song === undefined || song < 0) return;
    this.last = audio.targetSong;
    this.bag = this.bag.filter((i) => i !== song);
    this.wanted = song;
    if (song < TRACK_BASE) {
      audio.playSong(song);
      this.lineUp();
    } else if (song < USER_BASE) {
      const t = trackOf(song);
      if (!t) return;
      audio.playTrack(song, `music/${t.file}`, t.bpm, t.offset, t.gain ?? 0);
      this.lineUp();
    } else {
      void myMusic.url(song - USER_BASE).then((url) => {
        if (this.wanted !== song) return;
        if (url) audio.playTrack(song, url);
        else this.next();
      });
    }
    this.emit('song', song);
  }
}

export const music = new MusicDirector();
