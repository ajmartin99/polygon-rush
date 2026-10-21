import { SONGS } from './songs';
import { activeEvent, type EventId } from '../meta/events';

/**
 * Recorded music: royalty-free tracks under licenses that allow use in a
 * commercial game (CC0, CC-BY, OGA-BY), bundled under `public/music/`.
 * Every track keeps its author, license and source for the Credits screen.
 *
 * Music ids are one number space shared by everything that picks music
 * (settings, level codes, the director):
 *   0..63    synthesised songs (SONGS index)
 *   64..199  recorded tracks (TRACKS index + 64)
 *   200..    the player's own files (My Music), never shared
 */
export const TRACK_BASE = 64;
export const USER_BASE = 200;

export type TrackRole = 'menu' | 'run';

export interface TrackDef {
  title: string;
  artist: string;
  genre: string;
  /** e.g. 'CC0', 'CC-BY 4.0', 'OGA-BY 3.0'. */
  license: string;
  /** Where it came from (shown in Credits). */
  source: string;
  /** File under public/music/. */
  file: string;
  /** Length in seconds (an Endless level lasts exactly one song). */
  duration: number;
  /** Tempo and first-beat offset (s), for the beat-synced visuals. */
  bpm: number;
  offset: number;
  role: TrackRole;
  /** Energetic enough for races. */
  fast?: boolean;
  /** Relative loudness trim (dB) to match the rest of the soundtrack. */
  gain?: number;
  /** Seasonal: only in rotation while the event runs (and always in its Daily Run). */
  event?: EventId;
  /** Belongs to one mode (the Haunted Run): never in rotation, song pickers or player levels. */
  exclusive?: 'haunted';
  /** Taken out of rotation (kept so the ids after it don't shift): never picked or offered again. */
  retired?: true;
}

/** In rotation and offered in song pickers: not owned by one mode, not retired. */
export function isRegularTrack(t: TrackDef): boolean {
  return !t.exclusive && !t.retired;
}

/** Order is the id space: only ever append. */
export const TRACKS: TrackDef[] = [
  {
    title: 'Summers',
    artist: 'symphony',
    genre: 'Chill Electronic',
    license: 'CC0',
    source: 'https://opengameart.org/content/summers',
    file: 'summers.mp3',
    duration: 174.9,
    bpm: 105.5,
    offset: 0.03,
    role: 'menu',
  },
  {
    title: 'Hella Bumps',
    artist: 'cynicmusic',
    genre: 'House',
    license: 'CC0',
    source: 'https://opengameart.org/content/hella-bumps-menu-music',
    file: 'hella-bumps.mp3',
    duration: 58.7,
    bpm: 122.7,
    offset: 0.13,
    role: 'menu',
  },
  {
    title: 'Bouncy Hamster Dancing',
    artist: 'cynicmusic',
    genre: 'Bouncy House',
    license: 'CC0',
    source: 'https://opengameart.org/content/bouncy-hamster-dancing-menu-music',
    file: 'bouncy-hamster-dancing.mp3',
    duration: 65.0,
    bpm: 130.7,
    offset: 0.14,
    role: 'menu',
  },
  {
    title: 'Mocha Frapp',
    artist: 'Pro Sensory',
    genre: 'Chill Jazz-hop',
    license: 'CC0',
    source: 'https://opengameart.org/content/mocha-frapp',
    file: 'mocha-frapp.mp3',
    duration: 129.9,
    bpm: 122.7,
    offset: 0.01,
    role: 'menu',
  },
  {
    title: 'Shortcuts',
    artist: 'Zane Little Music',
    genre: 'Breakbeat',
    license: 'CC0',
    source: 'https://opengameart.org/content/shortcuts',
    file: 'shortcuts.mp3',
    duration: 289.5,
    bpm: 109.3,
    offset: 0.15,
    role: 'run',
    fast: true,
  },
  {
    title: 'Awake!',
    artist: 'cynicmusic',
    genre: 'Breakbeat Trance',
    license: 'CC0',
    source: 'https://opengameart.org/content/awake-megawall-10',
    file: 'awake.mp3',
    duration: 57.4,
    bpm: 133.6,
    offset: 0.2,
    role: 'run',
    fast: true,
  },
  {
    title: 'Black Diamond',
    artist: 'Joth',
    genre: 'Drum & Bass',
    license: 'CC0',
    source: 'https://opengameart.org/content/black-diamond',
    file: 'black-diamond.mp3',
    duration: 201.5,
    bpm: 143.2,
    offset: 0.249,
    role: 'run',
    fast: true,
  },
  {
    title: 'Hyper Ultra-Racing',
    artist: 'cynicmusic',
    genre: 'Drum & Bass',
    license: 'CC0',
    source: 'https://opengameart.org/content/hyper-ultra-racing',
    file: 'hyper-ultra-racing.mp3',
    duration: 79.7,
    bpm: 174,
    offset: 0.04,
    role: 'run',
    fast: true,
  },
  {
    title: 'WarGod',
    artist: 'Android128',
    genre: 'Dubstep',
    license: 'CC-BY 3.0',
    source: 'https://opengameart.org/content/wargod',
    file: 'wargod.mp3',
    duration: 181.8,
    bpm: 140,
    offset: 0.629,
    role: 'run',
    fast: true,
  },
  {
    title: 'Red Doors',
    artist: 'Matthew Pablo',
    genre: 'Electro',
    license: 'CC-BY 3.0',
    source: 'https://opengameart.org/content/red-doors-v20',
    file: 'red-doors.mp3',
    duration: 134.7,
    bpm: 139.9,
    offset: 0.01,
    role: 'run',
    fast: true,
  },
  {
    title: 'Chase',
    artist: 'Adiutorium',
    genre: 'Electro',
    license: 'CC0',
    source: 'https://opengameart.org/content/chase-2',
    file: 'chase.mp3',
    duration: 262.0,
    bpm: 143.2,
    offset: 0.299,
    role: 'run',
    fast: true,
  },
  {
    title: 'Liquid Flame',
    artist: 'Of Far Different Nature',
    genre: 'Electro House',
    license: 'CC0',
    source: 'https://opengameart.org/content/liquid-flame',
    file: 'liquid-flame.mp3',
    duration: 220.8,
    bpm: 130.7,
    offset: 0.249,
    role: 'run',
    fast: true,
  },
  {
    title: 'Elevate',
    artist: 'Fupi',
    genre: 'Electro Pop',
    license: 'CC0',
    source: 'https://opengameart.org/content/elevate-instrument-tracks',
    file: 'elevate.mp3',
    duration: 161.4,
    bpm: 87.2,
    offset: 0.08,
    role: 'run',
  },
  {
    title: 'Swing Along',
    artist: 'bramd',
    genre: 'Electro Swing',
    license: 'CC-BY 4.0',
    source: 'https://opengameart.org/content/swing-along',
    file: 'swing-along.mp3',
    duration: 135.0,
    bpm: 130.7,
    offset: 0.07,
    role: 'run',
    exclusive: 'haunted',
  },
  {
    title: 'Space Sprinkles',
    artist: 'Matthew Pablo',
    genre: 'Electronica',
    license: 'CC-BY 3.0',
    source: 'https://opengameart.org/content/space-sprinkles',
    file: 'space-sprinkles.mp3',
    duration: 162.5,
    bpm: 85.9,
    offset: 0.259,
    role: 'run',
  },
  {
    title: 'Fever Stadium',
    artist: 'MintoDog',
    genre: 'Eurobeat',
    license: 'CC0',
    source: 'https://opengameart.org/content/fever-stadium',
    file: 'fever-stadium.mp3',
    duration: 85.9,
    bpm: 165,
    offset: 0.08,
    role: 'run',
    fast: true,
  },
  {
    title: 'Rainbow Rush',
    artist: 'Yubatake',
    genre: 'Eurodance',
    license: 'CC-BY 4.0',
    source: 'https://opengameart.org/content/rainbow-rush',
    file: 'rainbow-rush.mp3',
    duration: 158.7,
    bpm: 89.8,
    offset: 0.589,
    role: 'run',
    fast: true,
  },
  {
    title: 'Funky Disco Beats',
    artist: 'Fupi',
    genre: 'Disco',
    license: 'CC0',
    source: 'https://opengameart.org/content/funky-disco-beats-to-boogiewoogie-to',
    file: 'funky-disco-beats.mp3',
    duration: 133.1,
    bpm: 109.3,
    offset: 0.509,
    role: 'run',
  },
  {
    title: 'Funky House',
    artist: 'Of Far Different Nature',
    genre: 'Funky House',
    license: 'CC0',
    source: 'https://opengameart.org/content/funky-house',
    file: 'funky-house.mp3',
    duration: 68.8,
    bpm: 127.9,
    offset: 0.14,
    role: 'run',
  },
  {
    title: 'Rock Theme',
    artist: 'Alexandr Zhelanov',
    genre: 'Rock',
    license: 'CC-BY 4.0',
    source: 'https://opengameart.org/content/rocktheme',
    file: 'rock-theme.mp3',
    duration: 101.7,
    bpm: 171.8,
    offset: 0.21,
    role: 'run',
    fast: true,
  },
  {
    title: 'Blossom Mountain',
    artist: 'MintoDog',
    genre: 'Racing Synth',
    license: 'CC0',
    source: 'https://opengameart.org/content/blossom-mountainremake',
    file: 'blossom-mountain.mp3',
    duration: 102.9,
    bpm: 140,
    offset: 0.389,
    role: 'run',
    fast: true,
  },
  {
    title: 'Prismatic Light',
    artist: 'tcarisland',
    genre: 'Synth Dance',
    license: 'CC-BY 4.0',
    source: 'https://opengameart.org/content/prismatic-light',
    file: 'prismatic-light.mp3',
    duration: 229.7,
    bpm: 139.9,
    offset: 0.399,
    role: 'run',
    fast: true,
  },
  {
    title: 'Maximum Overdrive',
    artist: 'Bogart VGM',
    genre: 'Synthwave',
    license: 'CC-BY 3.0',
    source: 'https://opengameart.org/content/maximum-overdrive',
    file: 'maximum-overdrive.mp3',
    duration: 210.8,
    bpm: 95.5,
    offset: 0.05,
    role: 'run',
  },
  {
    title: 'Pixel Sprinter',
    artist: 'Zane Little Music',
    genre: 'Chiptune',
    license: 'CC0',
    source: 'https://opengameart.org/content/pixel-sprinter',
    file: 'pixel-sprinter.mp3',
    duration: 44.6,
    bpm: 115.6,
    offset: 0.2,
    role: 'run',
    fast: true,
  },
  {
    title: 'Hyperflight Racing',
    artist: 'cynicmusic',
    genre: 'Trance',
    license: 'CC0',
    source: 'https://opengameart.org/content/hyperflight-racing',
    file: 'hyperflight-racing.mp3',
    duration: 60.7,
    bpm: 133.6,
    offset: 0.379,
    role: 'run',
    fast: true,
  },
  {
    title: 'Trance Boss Battle',
    artist: 'MintoDog',
    genre: 'Trance',
    license: 'CC0',
    source: 'https://opengameart.org/content/trance-boss-battle',
    file: 'trance-boss-battle.mp3',
    duration: 102.4,
    bpm: 150,
    offset: 0.07,
    role: 'run',
    fast: true,
  },
  // Spooky Season (Halloween)
  { title: '8-bit Haunted House', artist: 'Wolfgang_', genre: 'Spooky Chiptune', license: 'CC0', source: 'https://opengameart.org/content/8-bit-haunted-house-theme', file: 'haunted-house.mp3', duration: 44.9, bpm: 150.3, offset: 0.09, role: 'run', fast: true, event: 'halloween' },
  { title: 'Doll House', artist: 'Alexandr Zhelanov', genre: 'Spooky Piano', license: 'CC-BY 4.0', source: 'https://opengameart.org/content/doll-house', file: 'doll-house.mp3', duration: 24.9, bpm: 100.2, offset: 0.269, role: 'run', event: 'halloween', retired: true },
  { title: 'Dissonant Waltz', artist: 'Yubatake', genre: 'Haunted Waltz', license: 'CC-BY 4.0', source: 'https://opengameart.org/content/dissonant-waltz', file: 'dissonant-waltz.mp3', duration: 170.0, bpm: 100.2, offset: 0.429, role: 'run', event: 'halloween' },
  { title: 'The 9th Circle', artist: 'Joth', genre: 'Industrial Dubstep', license: 'CC0', source: 'https://opengameart.org/content/the-9th-circle', file: 'the-9th-circle.mp3', duration: 170.8, bpm: 120.3, offset: 0.359, role: 'run', fast: true, event: 'halloween' },
];

export interface MusicInfo {
  id: number;
  title: string;
  genre: string;
  kind: 'synth' | 'track' | 'user';
  artist?: string;
  license?: string;
}

/** Songs anyone can pick (everything but tracks that belong to one mode). */
export function isPickable(id: number): boolean {
  const t = trackOf(id);
  return !t || isRegularTrack(t);
}

export function isTrackId(id: number): boolean {
  return id >= TRACK_BASE && id < TRACK_BASE + TRACKS.length;
}

export function trackOf(id: number): TrackDef | undefined {
  return isTrackId(id) ? TRACKS[id - TRACK_BASE] : undefined;
}

export function musicInfo(id: number): MusicInfo | null {
  if (id >= 0 && id < SONGS.length)
    return {
      id,
      title: SONGS[id].title,
      genre: SONGS[id].genre,
      kind: 'synth',
    };
  const t = trackOf(id);
  if (t)
    return {
      id,
      title: t.title,
      genre: t.genre,
      kind: 'track',
      artist: t.artist,
      license: t.license,
    };
  return null;
}

/** Recorded tracks for a context, as music ids. */
export function tracksFor(context: 'menu' | 'run' | 'race', now = new Date()): number[] {
  return TRACKS.map((t, i) => ({ t, id: TRACK_BASE + i }))
    .filter(({ t }) => isRegularTrack(t) && (!t.event || activeEvent(now)?.id === t.event))
    .filter(({ t }) => (context === 'menu' ? t.role === 'menu' : context === 'race' ? t.fast === true : t.role === 'run'))
    .map(({ id }) => id);
}

/** A seasonal event's own soundtrack (its recorded tracks, plus tracks tagged for it). */
export function eventTracks(event: EventId): number[] {
  return TRACKS.map((t, i) => ({ t, id: TRACK_BASE + i }))
    .filter(({ t }) => t.event === event && isRegularTrack(t))
    .map(({ id }) => id);
}

/**
 * The songs Endless levels are built on: every regular run track (not a
 * season's, not a mode's own, not retired), in id order.
 */
export function endlessSongs(): number[] {
  return TRACKS.map((t, i) => ({ t, id: TRACK_BASE + i }))
    .filter(({ t }) => t.role === 'run' && !t.event && isRegularTrack(t))
    .map(({ id }) => id);
}

/** How often a level plays its main song (otherwise its backup). */
export const MAIN_SONG_CHANCE = 0.65;

/**
 * An Endless level's two songs (0-based level index): its main song and a
 * backup, fixed for that level. During a season the backup is one of the
 * season's songs. -1 when there's no recorded music at all.
 */
export function levelSongs(level: number, now = new Date()): { main: number; backup: number } {
  const list = endlessSongs();
  const n = list.length;
  if (!n) return { main: -1, backup: -1 };
  const i = ((level % n) + n) % n;
  const main = list[i];
  const ev = activeEvent(now);
  const season = ev ? eventTracks(ev.id) : [];
  // Half a list away, so the backup is never the main song (and rarely a neighbour's).
  const backup = season.length ? season[i % season.length] : n > 1 ? list[(i + Math.max(1, Math.floor(n / 2))) % n] : main;
  return { main, backup };
}
