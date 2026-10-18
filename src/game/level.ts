import { CEIL, ENDLESS_SPEED_START, MODE_INDEX, RACE_SPEED } from './constants';
import type { ShapeMode } from './shapes';
import { MAX_OBJ_W, World, type PickupType, type SolidRole, type WorldObj } from './world';
import { decodeName, encodeName } from '../meta/names';
import { checkDisplayText } from '../shared/chat-filter';
import { isAllowedName } from '../meta/names-policy';
import { LEVEL_CODE_PREFIX, LEVEL_CODE_VERSION, LevelCodeFormatError, levelChecksum, readLevelCode, type RawLevelCode } from '../shared/level-code';

/**
 * Player-made levels ("Create" mode). A level is a grid of pieces between the
 * floor (row 0) and the ceiling (row 7). It turns into the same World objects
 * the procedural generator emits, so physics, rendering and CPU rivals all
 * work unchanged. Levels travel as compact share codes ("PR1-…").
 */

export const LEVEL_ROWS = 8;
/** Columns 0..START_ZONE-1 stay empty so every run starts safely. */
export const START_ZONE = 6;
export const MIN_LENGTH = 30;
export const MAX_LENGTH = 1200;
export const DEFAULT_LENGTH = 160;
export const MAX_PIECES = 4000;
/** Flat ground after the finish line. */
export const RUNOUT = 120;
/** Racers start in the middle of column 2. */
export const LEVEL_START_X = 2;

export const LEVEL_SPEEDS = [ENDLESS_SPEED_START, RACE_SPEED, 11.8] as const;
export const SPEED_NAMES = ['Chill', 'Normal', 'Turbo'] as const;
export const HEART_OPTIONS = [1, 3, 5] as const;
export const THEME_COUNT = 6;

export type PieceType = 'block' | 'platform' | 'spike' | 'saw' | 'gem' | 'pad' | 'orb' | 'portal' | 'pickup' | 'pit';

export interface Piece {
  t: PieceType;
  /** Column. */
  x: number;
  /** Row (0 = sits on the floor). Column pieces (portal, pit) use 0. */
  y: number;
  /** Variant: flipped spike/pad, big saw/gem, pickup type, portal mode. */
  v: number;
}

/** How many variants each piece cycles through when tapped again. */
export const VARIANTS: Record<PieceType, number> = {
  block: 1,
  platform: 1,
  spike: 2,
  saw: 2,
  gem: 2,
  pad: 2,
  orb: 1,
  portal: 4,
  pickup: 3,
  pit: 1,
};

export const PICKUP_TYPES: PickupType[] = ['heart', 'shield', 'magnet'];

/** The shareable part of a level. */
export interface LevelContent {
  /** Generated name: [adjective index, noun index]. */
  name: [number, number];
  /** Typed title (13+ builders, filtered); shown instead of the generated name. */
  title?: string;
  /** Generated racer names of the builders (max 4). */
  authors: string[];
  theme: number;
  /** Song index, or -1 for the world's own theme. */
  music: number;
  speed: number;
  hearts: number;
  length: number;
  pieces: Piece[];
}

/** A level saved on this device. */
export interface LevelData extends LevelContent {
  id: string;
  created: number;
  updated: number;
  /** Beaten from the start by its builder since the last edit. */
  verified: boolean;
  /** Best progress 0..1 on this device. */
  best: number;
  plays: number;
  /** Where it came from. */
  origin: 'mine' | 'code' | 'coop';
}

// ------------------------------------------------------------------ names
const LEVEL_ADJ = [
  'Crystal', 'Turbo', 'Neon', 'Sunny', 'Spooky', 'Wobbly', 'Mega', 'Tiny', 'Jelly', 'Rainbow', 'Cosmic', 'Bouncy', 'Frosty', 'Lava', 'Pixel', 'Secret',
  'Super', 'Sneaky', 'Lucky', 'Thunder', 'Bubble', 'Candy', 'Robo', 'Star', 'Zigzag', 'Dizzy', 'Giant', 'Hyper', 'Mystic', 'Rocket', 'Shadow', 'Sparkle',
  // Appended (indexes are stored in level codes: only ever add to the end).
  'Atomic', 'Blazing', 'Bonkers', 'Breezy', 'Chaotic', 'Chilly', 'Clockwork', 'Cloudy', 'Crazy', 'Crimson', 'Dazzling', 'Desert', 'Electric', 'Emerald', 'Epic', 'Fiery',
  'Floating', 'Funky', 'Fuzzy', 'Glitchy', 'Golden', 'Groovy', 'Haunted', 'Hidden', 'Icy', 'Jazzy', 'Jumbo', 'Laser', 'Lost', 'Lunar', 'Magic', 'Midnight',
  'Misty', 'Moonlit', 'Nebula', 'Ocean', 'Orbit', 'Paper', 'Pocket', 'Polar', 'Quantum', 'Radiant', 'Retro', 'Royal', 'Ruby', 'Rusty', 'Sapphire', 'Silly',
  'Silver', 'Sky', 'Slippery', 'Solar', 'Sonic', 'Spiral', 'Steam', 'Stormy', 'Sugar', 'Sunset', 'Swift', 'Tangled', 'Tidal', 'Toxic', 'Twisty', 'Velvet',
  'Wacky', 'Wild', 'Windy', 'Wonky', 'Zany', 'Zen', 'Arctic', 'Bamboo', 'Coral', 'Cyber', 'Doodle', 'Echo', 'Fizzy', 'Frozen', 'Gummy', 'Honey',
];
const LEVEL_NOUN = [
  'Canyon', 'Castle', 'Tower', 'Highway', 'Jungle', 'Galaxy', 'Factory', 'Volcano', 'Garden', 'Maze', 'Rush', 'Run', 'Dash', 'Valley', 'Temple', 'Island',
  'Lab', 'Ladder', 'Cave', 'Bridge', 'Party', 'Express', 'Odyssey', 'Circuit', 'Peak', 'Tunnel', 'Arena', 'Palace', 'Station', 'Voyage', 'Trail', 'Kingdom',
  // Appended (indexes are stored in level codes: only ever add to the end).
  'Abyss', 'Alley', 'Asteroid', 'Bakery', 'Bay', 'Boardwalk', 'Carnival', 'Cathedral', 'Chasm', 'Citadel', 'City', 'Cliffs', 'Coaster', 'Cosmos', 'Cove', 'Crater',
  'Dojo', 'Dungeon', 'Dunes', 'Escape', 'Falls', 'Festival', 'Fortress', 'Forest', 'Frenzy', 'Gauntlet', 'Gorge', 'Grotto', 'Harbor', 'Hideout', 'Hills', 'Hive',
  'Hollow', 'Jam', 'Junction', 'Lagoon', 'Lair', 'Lane', 'Loop', 'Machine', 'Marsh', 'Meadow', 'Mine', 'Mountain', 'Nebula', 'Oasis', 'Orbit', 'Outpost',
  'Pinball', 'Pipeline', 'Plaza', 'Quest', 'Race', 'Rapids', 'Reef', 'Ridge', 'Rollercoaster', 'Ruins', 'Sanctuary', 'Showdown', 'Skyline', 'Slide', 'Spire', 'Springs',
  'Stadium', 'Storm', 'Streets', 'Summit', 'Swamp', 'Gallery', 'Theater', 'Toybox', 'Track', 'Tundra', 'Vault', 'Workshop', 'Zone', 'Arcade', 'Beach', 'Blitz',
];

/** Generated name combos available (for validation). */
export const LEVEL_NAME_SIZES: [number, number] = [LEVEL_ADJ.length, LEVEL_NOUN.length];

/** The level's typed title (13+ builders, filtered) or its generated name. */
export function levelName(l: Pick<LevelContent, 'name'> & { title?: string }): string {
  if (l.title) return l.title;
  return `${LEVEL_ADJ[l.name[0]] ?? 'Mystery'} ${LEVEL_NOUN[l.name[1]] ?? 'Level'}`;
}

export function randomLevelName(rand: () => number = Math.random): [number, number] {
  return [Math.floor(rand() * LEVEL_ADJ.length), Math.floor(rand() * LEVEL_NOUN.length)];
}

export function newLevelId(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 12; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)];
  return s;
}

export function createLevel(author: string, now = Date.now(), rand: () => number = Math.random): LevelData {
  return {
    id: newLevelId(rand),
    name: randomLevelName(rand),
    authors: author ? [author] : [],
    theme: Math.floor(rand() * THEME_COUNT),
    music: -1,
    speed: 1,
    hearts: 3,
    length: DEFAULT_LENGTH,
    pieces: [],
    created: now,
    updated: now,
    verified: false,
    best: 0,
    plays: 0,
    origin: 'mine',
  };
}

// ------------------------------------------------------------------ slots
/** Pieces live in slots: one per grid cell plus a pit and a portal slot per column. */
export const SLOT_PIT = 8;
export const SLOT_PORTAL = 9;

export function isColumnPiece(t: PieceType): boolean {
  return t === 'pit' || t === 'portal';
}

export function slotOf(p: Pick<Piece, 't' | 'x' | 'y'>): number {
  return p.x * 16 + (p.t === 'pit' ? SLOT_PIT : p.t === 'portal' ? SLOT_PORTAL : p.y);
}

export function slotX(slot: number): number {
  return Math.floor(slot / 16);
}

/** Can this piece go here? (The editor and the network host both check.) */
export function canPlace(p: Piece, length: number): boolean {
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || !Number.isInteger(p.v)) return false;
  if (!(p.t in VARIANTS) || p.v < 0 || p.v >= VARIANTS[p.t]) return false;
  if (p.x < START_ZONE || p.x >= length) return false;
  if (isColumnPiece(p.t)) return p.y === 0;
  return p.y >= 0 && p.y < LEVEL_ROWS;
}

export function samePiece(a: Piece | null | undefined, b: Piece | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.t === b.t && a.x === b.x && a.y === b.y && a.v === b.v;
}

/** Validate anything loaded from disk or the network. */
export function sanitizeContent(raw: unknown): LevelContent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  const length = num(r.length, MIN_LENGTH, MAX_LENGTH, DEFAULT_LENGTH);
  const nm = Array.isArray(r.name) ? r.name : [];
  const name: [number, number] = [num(nm[0], 0, LEVEL_ADJ.length - 1, 0), num(nm[1], 0, LEVEL_NOUN.length - 1, 0)];
  const authors = (Array.isArray(r.authors) ? r.authors : []).filter((a): a is string => typeof a === 'string' && isAllowedName(a)).slice(0, 4);
  const title = typeof r.title === 'string' && checkDisplayText(r.title, 'title').ok ? checkDisplayText(r.title, 'title').text : undefined;
  const hv = num(r.hearts, 1, 5, 3);
  const hearts = (HEART_OPTIONS as readonly number[]).includes(hv) ? hv : 3;
  const slots = new Map<number, Piece>();
  for (const p of Array.isArray(r.pieces) ? r.pieces : []) {
    if (slots.size >= MAX_PIECES) break;
    if (typeof p !== 'object' || p === null) continue;
    const q = p as Record<string, unknown>;
    const piece: Piece = { t: q.t as PieceType, x: q.x as number, y: q.y as number, v: (q.v as number) ?? 0 };
    if (!canPlace(piece, length)) continue;
    slots.set(slotOf(piece), piece);
  }
  return {
    name,
    ...(title ? { title } : {}),
    authors,
    theme: num(r.theme, 0, THEME_COUNT - 1, 0),
    music: num(r.music, -1, MAX_LEVEL_SONG, -1),
    speed: num(r.speed, 0, LEVEL_SPEEDS.length - 1, 1),
    hearts,
    length,
    pieces: sortPieces([...slots.values()]),
  };
}

export function sanitizeLevel(raw: unknown): LevelData | null {
  const c = sanitizeContent(raw);
  if (!c) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && /^[a-z0-9]{6,24}$/.test(r.id) ? r.id : newLevelId();
  const t = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Date.now());
  const origin = r.origin === 'code' || r.origin === 'coop' ? r.origin : 'mine';
  return {
    ...c,
    id,
    created: t(r.created),
    updated: t(r.updated),
    verified: r.verified === true,
    best: typeof r.best === 'number' ? Math.min(1, Math.max(0, r.best)) : 0,
    plays: typeof r.plays === 'number' ? Math.max(0, Math.floor(r.plays)) : 0,
    origin,
  };
}

export function sortPieces(pieces: Piece[]): Piece[] {
  return pieces.sort((a, b) => slotOf(a) - slotOf(b));
}

export function levelSpeed(l: Pick<LevelContent, 'speed'>): number {
  return LEVEL_SPEEDS[l.speed] ?? RACE_SPEED;
}

// ------------------------------------------------------------------ world
/**
 * Build the playable world. Blocks are merged into rectangles (prettier and
 * fewer objects); everything is split to MAX_OBJ_W so range queries stay valid.
 */
export function buildWorld(level: LevelContent, world = new World()): World {
  const L = level.length;
  const end = L + RUNOUT;
  const out: WorldObj[] = [];
  const id = () => world.newId();
  const pits = new Set<number>();
  const portals: { x: number; mode: ShapeMode }[] = [];
  const rows: Map<number, number>[] = [];
  const platRows: Set<number>[] = [];
  for (let y = 0; y < LEVEL_ROWS; y++) {
    rows.push(new Map());
    platRows.push(new Set());
  }

  const solid = (x0: number, y0: number, x1: number, y1: number, role: SolidRole) => {
    let a = x0;
    while (a < x1 - 1e-6) {
      const b = Math.min(x1, a + MAX_OBJ_W);
      out.push({ id: id(), kind: 'solid', role, x0: a, x1: b, y0, y1 });
      a = b;
    }
  };

  for (const p of level.pieces) {
    const cx = p.x + 0.5;
    const cy = p.y + 0.5;
    switch (p.t) {
      case 'pit':
        pits.add(p.x);
        break;
      case 'portal':
        portals.push({ x: p.x, mode: MODE_INDEX[p.v] ?? 'square' });
        break;
      case 'block':
        rows[p.y].set(p.x, 1);
        break;
      case 'platform':
        platRows[p.y].add(p.x);
        break;
      case 'spike': {
        const dir: 1 | -1 = p.v ? -1 : 1;
        const by = dir > 0 ? p.y : p.y + 1;
        out.push({ id: id(), kind: 'spike', x: cx, y: by, dir, size: 1, x0: cx - 0.5, x1: cx + 0.5, y0: dir > 0 ? by : by - 1, y1: dir > 0 ? by + 1 : by });
        break;
      }
      case 'saw': {
        const r = p.v ? 1.1 : 0.6;
        out.push({ id: id(), kind: 'saw', x: cx, y: cy, r, x0: cx - r, x1: cx + r, y0: cy - r, y1: cy + r });
        break;
      }
      case 'gem':
        out.push({ id: id(), kind: 'gem', x: cx, y: cy, big: p.v === 1, x0: cx - 0.4, x1: cx + 0.4, y0: cy - 0.4, y1: cy + 0.4 });
        break;
      case 'pad': {
        const dir: 1 | -1 = p.v ? -1 : 1;
        const py = dir > 0 ? p.y : p.y + 1;
        out.push({ id: id(), kind: 'pad', x: cx, y: py, dir, x0: cx - 0.5, x1: cx + 0.5, y0: dir > 0 ? py : py - 0.3, y1: dir > 0 ? py + 0.3 : py });
        break;
      }
      case 'orb':
        out.push({ id: id(), kind: 'orb', x: cx, y: cy, x0: cx - 0.6, x1: cx + 0.6, y0: cy - 0.6, y1: cy + 0.6 });
        break;
      case 'pickup':
        out.push({ id: id(), kind: 'pickup', x: cx, y: cy, type: PICKUP_TYPES[p.v] ?? 'heart', x0: cx - 0.5, x1: cx + 0.5, y0: cy - 0.5, y1: cy + 0.5 });
        break;
    }
  }

  // Floor with pits.
  let runFrom: number | null = null;
  for (let x = -12; x <= end; x++) {
    const hole = x === end || pits.has(x);
    if (!hole && runFrom === null) runFrom = x;
    if (hole && runFrom !== null) {
      solid(runFrom, -4, x, 0, 'ground');
      runFrom = null;
    }
  }

  // Blocks: horizontal runs, then stack identical runs into pillars.
  type Rect = { x0: number; x1: number; y0: number; y1: number };
  const rects: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let y = 0; y < LEVEL_ROWS; y++) {
    const xs = [...rows[y].keys()].sort((a, b) => a - b);
    const next = new Map<string, Rect>();
    for (let i = 0; i < xs.length; ) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      const x0 = xs[i];
      const x1 = xs[j] + 1;
      const key = `${x0}:${x1}`;
      const above = open.get(key);
      if (above) {
        above.y1 = y + 1;
        next.set(key, above);
      } else {
        const r = { x0, x1, y0: y, y1: y + 1 };
        rects.push(r);
        next.set(key, r);
      }
      i = j + 1;
    }
    open = next;
  }
  for (const r of rects) solid(r.x0, r.y0, r.x1, r.y1, 'block');
  for (let y = 0; y < LEVEL_ROWS; y++) {
    const xs = [...platRows[y]].sort((a, b) => a - b);
    for (let i = 0; i < xs.length; ) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      solid(xs[i], y + 0.5, xs[j] + 1, y + 1, 'platform');
      i = j + 1;
    }
  }

  // Shape sections, portals and ceilings (non-square shapes need a roof).
  portals.sort((a, b) => a.x - b.x);
  world.sections.push({ x0: -Infinity, x1: Infinity, mode: 'square', ceiling: false });
  let mode: ShapeMode = 'square';
  let ceilFrom: number | null = null;
  for (const p of portals) {
    const px = p.x + 0.5;
    out.push({ id: id(), kind: 'portal', x: px, y: CEIL / 2, mode: p.mode, x0: px - 0.6, x1: px + 0.6, y0: 0, y1: CEIL });
    if (p.mode === mode) continue;
    const secs = world.sections;
    secs[secs.length - 1].x1 = px;
    secs.push({ x0: px, x1: Infinity, mode: p.mode, ceiling: p.mode !== 'square' });
    if (p.mode !== 'square' && ceilFrom === null) ceilFrom = px - 1.5;
    if (p.mode === 'square' && ceilFrom !== null) {
      solid(ceilFrom, CEIL, px + 1.5, CEIL + 4, 'ceil');
      ceilFrom = null;
    }
    mode = p.mode;
  }
  if (ceilFrom !== null) solid(ceilFrom, CEIL, end, CEIL + 4, 'ceil');

  out.push({ id: id(), kind: 'finish', x: L, x0: L - 0.5, x1: L + 0.5, y0: 0, y1: CEIL });
  world.appendSorted(out);
  world.finishX = L;
  world.generatedTo = Infinity;
  return world;
}

/** Shape the racer should be in when starting a test run at x. */
export function modeAt(level: LevelContent, x: number): ShapeMode {
  let mode: ShapeMode = 'square';
  for (const p of level.pieces) {
    if (p.t === 'portal' && p.x + 0.5 <= x) mode = MODE_INDEX[p.v] ?? 'square';
  }
  return mode;
}

export function pieceCount(l: Pick<LevelContent, 'pieces'>): number {
  return l.pieces.length;
}

// ------------------------------------------------------------------ share codes
const TYPE_CODES: PieceType[] = ['block', 'platform', 'spike', 'saw', 'gem', 'pad', 'orb', 'portal'];
const CODE_VERSION = LEVEL_CODE_VERSION;
/**
 * Highest music id a level can pick: synth songs and recorded tracks (see
 * core/tracks). The player's own files (200+) never go into a level.
 * v1 codes carry the song in 5 bits of the theme byte; v2 has a full byte.
 */
export const MAX_LEVEL_SONG = 198;
export const CODE_PREFIX = LEVEL_CODE_PREFIX;

function pieceByte(p: Piece): number {
  if (p.t === 'pickup') return ((8 + p.v) << 4) | (p.y << 1);
  if (p.t === 'pit') return 11 << 4;
  if (p.t === 'portal') return (7 << 4) | (p.v << 1);
  return (TYPE_CODES.indexOf(p.t) << 4) | (p.y << 1) | (p.v & 1);
}

function pieceFromByte(b: number, x: number): Piece | null {
  const code = b >> 4;
  const y = (b >> 1) & 7;
  const flag = b & 1;
  if (code <= 6) return { t: TYPE_CODES[code], x, y, v: flag };
  if (code === 7) return { t: 'portal', x, y: 0, v: y & 3 };
  if (code <= 10) return { t: 'pickup', x, y, v: code - 8 };
  if (code === 11) return { t: 'pit', x, y: 0, v: 0 };
  return null;
}

function pushVarint(out: number[], n: number): void {
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
}

function toBase64Url(bytes: number[]): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Compact, copy-pasteable level code. Only level content travels — never personal data. */
export function encodeLevel(l: LevelContent): string {
  const song = l.music >= 0 && l.music <= MAX_LEVEL_SONG ? l.music : -1;
  // v2 keeps the theme byte's top bits clear; the song gets its own byte (0 = the world's theme).
  const out: number[] = [CODE_VERSION, l.theme & 7, song + 1, (l.speed << 4) | Math.max(0, (HEART_OPTIONS as readonly number[]).indexOf(l.hearts)), l.length & 0xff, l.length >> 8, l.name[0], l.name[1]];
  const authors = l.authors.filter(isAllowedName).slice(0, 4);
  out.push(authors.length);
  for (const a of authors) {
    const gen = encodeName(a);
    // Generated names pack into 3 bytes; typed names are 254, length, ASCII.
    if (gen) out.push(...gen);
    else pushText(out, a);
  }
  const title = l.title && checkDisplayText(l.title, 'title').ok ? l.title : '';
  if (title) pushText(out, title);
  else out.push(0);
  const pieces = sortPieces([...l.pieces]);
  pushVarint(out, pieces.length);
  let lastX = 0;
  for (const p of pieces) {
    pushVarint(out, p.x - lastX);
    lastX = p.x;
    out.push(pieceByte(p));
  }
  const c = levelChecksum(out);
  out.push(c >> 8, c & 0xff);
  return CODE_PREFIX + toBase64Url(out);
}

function pushText(out: number[], text: string): void {
  out.push(254, text.length);
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0x7f);
}

export class LevelCodeError extends Error {}

export function decodeLevel(code: string): LevelContent {
  let raw: RawLevelCode;
  try {
    raw = readLevelCode(code);
  } catch (e) {
    throw new LevelCodeError(e instanceof LevelCodeFormatError ? e.message : 'That level code is damaged.');
  }
  const authors: string[] = [];
  for (const a of raw.authors) {
    if ('text' in a) {
      if (isAllowedName(a.text)) authors.push(a.text);
    } else {
      const nm = decodeName(a.gen);
      if (nm) authors.push(nm);
    }
  }
  const pieces: Piece[] = [];
  let x = 0;
  for (const q of raw.pieces) {
    x += q.dx;
    const p = pieceFromByte(q.byte, x);
    if (p) pieces.push(p);
  }
  const content = sanitizeContent({ name: raw.name, title: raw.title, authors, theme: raw.theme, music: raw.music, speed: raw.speed, hearts: HEART_OPTIONS[raw.hearts] ?? 3, length: raw.length, pieces });
  if (!content) throw new LevelCodeError('That level code is damaged.');
  return content;
}

/** Copy the shareable fields (drops local stats). */
export function contentOf(l: LevelContent): LevelContent {
  return {
    name: [l.name[0], l.name[1]],
    ...(l.title ? { title: l.title } : {}),
    authors: [...l.authors],
    theme: l.theme,
    music: l.music,
    speed: l.speed,
    hearts: l.hearts,
    length: l.length,
    pieces: l.pieces.map((p) => ({ ...p })),
  };
}
