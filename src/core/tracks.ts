import { SONGS } from './songs';

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
  /** Tempo and first-beat offset (s), for the beat-synced visuals. */
  bpm: number;
  offset: number;
  role: TrackRole;
  /** Energetic enough for races. */
  fast?: boolean;
  /** Relative loudness trim (dB) to match the rest of the soundtrack. */
  gain?: number;
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
    bpm: 130.7,
    offset: 0.07,
    role: 'run',
  },
  {
    title: 'Space Sprinkles',
    artist: 'Matthew Pablo',
    genre: 'Electronica',
    license: 'CC-BY 3.0',
    source: 'https://opengameart.org/content/space-sprinkles',
    file: 'space-sprinkles.mp3',
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
    bpm: 150,
    offset: 0.07,
    role: 'run',
    fast: true,
  },
];

export interface MusicInfo {
  id: number;
  title: string;
  genre: string;
  kind: 'synth' | 'track' | 'user';
  artist?: string;
  license?: string;
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
export function tracksFor(context: 'menu' | 'run' | 'race'): number[] {
  return TRACKS.map((t, i) => ({ t, id: TRACK_BASE + i }))
    .filter(({ t }) => (context === 'menu' ? t.role === 'menu' : context === 'race' ? t.fast === true : t.role === 'run'))
    .map(({ id }) => id);
}
