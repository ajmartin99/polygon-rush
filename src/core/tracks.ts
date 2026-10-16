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
export const TRACKS: TrackDef[] = [];

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
  if (id >= 0 && id < SONGS.length) return { id, title: SONGS[id].title, genre: SONGS[id].genre, kind: 'synth' };
  const t = trackOf(id);
  if (t) return { id, title: t.title, genre: t.genre, kind: 'track', artist: t.artist, license: t.license };
  return null;
}

/** Recorded tracks for a context, as music ids. */
export function tracksFor(context: 'menu' | 'run' | 'race'): number[] {
  return TRACKS.map((t, i) => ({ t, id: TRACK_BASE + i }))
    .filter(({ t }) => (context === 'menu' ? t.role === 'menu' : context === 'race' ? t.fast === true : t.role === 'run'))
    .map(({ id }) => id);
}
