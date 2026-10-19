import { TRACK_BASE, TRACKS } from '../core/tracks';
import { Rng } from '../core/rng';
import { LEVEL_SPEEDS, type LevelContent, type LevelData, type Piece } from '../game/level';

/**
 * Boss Battles: one song against a giant polygon boss. The boss floats
 * ahead of you and throws its attacks on the beat (press on the beat and
 * you clear them). Glowing charge orbs come with its attacks: every orb you
 * grab fires straight back and knocks off a chunk of its health. Drain the
 * health bar before the song ends to win; if it's still standing when the
 * music stops, it gets away.
 */
export type BossId = 'kingcube' | 'sawqueen' | 'hexhydra';
export type BossAttack = 'stomp' | 'saw' | 'pit' | 'wall';
export type BossShape = 'square' | 'triangle' | 'hexagon';

export interface BossDef {
  id: BossId;
  name: string;
  title: string;
  shape: BossShape;
  color: string;
  /** World theme of the arena. */
  theme: number;
  /** Its song (file under public/music). */
  song: string;
  /** Speed index (LEVEL_SPEEDS). */
  speed: number;
  hearts: number;
  /** Beats between attacks (a list it cycles through, so the rhythm varies). */
  every: number[];
  attacks: BossAttack[];
  /** Gems for the first win, and for every win after. */
  reward: number;
  repeat: number;
}

export const BOSSES: BossDef[] = [
  {
    id: 'kingcube',
    name: 'King Cube',
    title: 'Ruler of Square Valley',
    shape: 'square',
    color: '#ffd23f',
    theme: 0,
    song: 'fever-stadium.mp3',
    speed: 1,
    hearts: 3,
    every: [4, 4, 4, 2],
    attacks: ['stomp', 'stomp', 'pit'],
    reward: 150,
    repeat: 20,
  },
  {
    id: 'sawqueen',
    name: 'Saw Queen',
    title: 'Spinner of Blades',
    shape: 'triangle',
    color: '#ff5fa2',
    theme: 2,
    song: 'rock-theme.mp3',
    speed: 1,
    hearts: 3,
    every: [4, 2, 4, 2, 2],
    attacks: ['saw', 'saw', 'stomp', 'pit'],
    reward: 250,
    repeat: 30,
  },
  {
    id: 'hexhydra',
    name: 'Hexa Hydra',
    title: 'Six-Sided Terror',
    shape: 'hexagon',
    color: '#3ee6b0',
    theme: 4,
    song: 'trance-boss-battle.mp3',
    speed: 2,
    hearts: 3,
    every: [2, 2, 4, 2],
    attacks: ['saw', 'stomp', 'pit', 'wall'],
    reward: 400,
    repeat: 45,
  },
];

export function bossById(id: string): BossDef | undefined {
  return BOSSES.find((b) => b.id === id);
}

/** Its song's music id. */
export function bossTrack(b: BossDef): number {
  return TRACK_BASE + TRACKS.findIndex((t) => t.file === b.song);
}

/** Runners start here (LEVEL_START_X + half a tile). */
const X0 = 2.5;
/** Big gems are the boss's charge orbs (see the renderer and controller). */
const ORB = 1;

/**
 * The fight: a charted course, the same every time (learn the boss!). Each
 * attack lands on a beat; a charge orb sits on the ground between attacks
 * (just run through it) and some float above an attack (jump on the beat).
 */
export function bossCourse(b: BossDef): LevelContent {
  const t = TRACKS.find((x) => x.file === b.song)!;
  const beat = 60 / t.bpm;
  const v = LEVEL_SPEEDS[b.speed];
  const rng = new Rng(b.id.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  const pieces = new Map<string, Piece>();
  const put = (k: Piece['t'], x: number, y = 0, pv = 0) => {
    if (x < 6 || y < 0 || y > 7) return;
    const key = k === 'pit' ? `pit:${x}` : `${x}:${y}`;
    if (!pieces.has(key)) pieces.set(key, { t: k, x, y, v: pv });
  };
  const col = (s: number) => Math.floor(X0 + v * s);
  const beatAt = (k: number) => t.offset + k * beat;
  // Ends a couple of seconds before the song does.
  const total = Math.floor((t.duration - 2 - t.offset) / beat);
  let k = 8; // two bars to get ready
  let i = 0;
  while (k < total - 4) {
    const ta = beatAt(k);
    const apex = ta + 0.25;
    const c = col(apex);
    const attack = b.attacks[Math.floor(rng.range(0, 1) * b.attacks.length)];
    if (attack === 'stomp') {
      put('spike', c);
      put('spike', c + 1);
    } else if (attack === 'saw') {
      put('saw', c, 0, 0);
    } else if (attack === 'pit') {
      put('pit', c - 1);
      put('pit', c);
      put('pit', c + 1);
    } else {
      put('block', c);
      put('block', c + 1);
      put('spike', c + 2);
    }
    // An orb over every other attack (jump on the beat to grab it)...
    if (i % 2 === 0) put('gem', c, 2, ORB);
    const gap = b.every[i % b.every.length];
    // ...and one on the ground halfway to the next attack.
    const mid = col(beatAt(k + gap / 2) + 0.1);
    if (gap >= 2 && mid > c + 3) put('gem', mid, 0, ORB);
    k += gap;
    i++;
  }
  return {
    name: [0, 0],
    title: b.name,
    authors: [],
    theme: b.theme,
    music: bossTrack(b),
    speed: b.speed,
    hearts: b.hearts,
    length: col(beatAt(total)) + 2,
    pieces: [...pieces.values()],
  };
}

/** The fight as a playable (not saved) level. */
export function bossLevel(b: BossDef): LevelData {
  return { ...bossCourse(b), id: `boss-${b.id}`, created: 0, updated: 0, verified: true, best: 0, plays: 0, origin: 'code' };
}

/** Orbs in a fight, and how many hits it takes to win (most, not all, of them). */
export function bossHealth(level: LevelContent): { orbs: number; hp: number } {
  const orbs = level.pieces.filter((p) => p.t === 'gem' && p.v === ORB).length;
  return { orbs, hp: Math.max(1, Math.ceil(orbs * 0.6)) };
}

// ------------------------------------------------------------------ progress
export interface BossRecord {
  wins: number;
  /** Best share of its health knocked off (0..1). */
  best: number;
}

export type BossProgress = Partial<Record<BossId, BossRecord>>;

/** A boss is open once the one before it has been beaten. */
export function bossUnlocked(progress: BossProgress, b: BossDef): boolean {
  const i = BOSSES.indexOf(b);
  return i <= 0 || (progress[BOSSES[i - 1].id]?.wins ?? 0) > 0;
}

/** Gems for a win: the big reward the first time, a smaller one after. */
export function bossReward(progress: BossProgress, b: BossDef): number {
  return (progress[b.id]?.wins ?? 0) > 0 ? b.repeat : b.reward;
}
