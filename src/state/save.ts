/**
 * Persistent save-game schema. Bump SAVE_VERSION and extend `migrate` when the
 * shape changes so existing players never lose progress.
 */
import { DIFFICULTIES, type Difficulty } from '../game/constants';
import { FREE_EMOTES } from '../meta/emotes';
import { SKINS, TRAILS, type Unlock } from '../meta/catalog';

export const SAVE_VERSION = 1;

export type AgeGroup = 'child' | 'teen' | 'adult';
export type GraphicsQuality = 'auto' | 'high' | 'low';

export interface Settings {
  music: number; // 0..1
  sfx: number; // 0..1
  haptics: boolean;
  reducedMotion: boolean;
  /** Kid Mode: slower speed and extra hearts in Endless. */
  kidMode: boolean;
  graphics: GraphicsQuality;
  /** Parental control: allow online rooms (Play with Friends, Build Together). */
  onlineAllowed: boolean;
  /** Parental control: Quick Chat (preset phrases) in online rooms. */
  quickChat: boolean;
  /** Free Chat (typed messages) — only for verified 16+, or 13-15 with a parent's OK. */
  freeChat: boolean;
  /** Parental control (13+ only): join and host public build rooms. */
  publicRooms: boolean;
  /** Parental control: friends list, online status and room invites. */
  friends: boolean;
  /** Parental control: play, like and share levels in the Community tab. */
  sharedLevels: boolean;
  /** Parental control: allow in-app purchases. */
  purchasesAllowed: boolean;
  showFps: boolean;
  /** Endless & CPU race difficulty (picked on first launch). */
  difficulty: Difficulty;
  /** My Music (own files): off, mixed into the game's music, or only mine. */
  myMusic: 'off' | 'mix' | 'only';
  /** Include the classic synthesised songs alongside the recorded tracks. */
  classicSongs: boolean;
  /** Songs taken out of rotation in Settings → Soundtrack (indexes into SONGS). */
  musicOff: number[];
}

export interface MissionState {
  id: string; // template id
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
}

export interface Stats {
  runs: number;
  totalDistance: number;
  bestDistance: number;
  jumps: number;
  gemsCollected: number;
  portals: number;
  hits: number;
  racesPlayed: number;
  racesWon: number;
  duelsPlayed: number;
  onlinePlayed: number;
  onlineWon: number;
  playSeconds: number;
  /** Daily Runs played, and how many reached the day's target. */
  dailyRuns: number;
  dailyTargets: number;
  /** Best distance in a Haunted Daily (Halloween). */
  hauntedBest: number;
  /** Community levels beaten from the start (each counted once). */
  communityClears: number;
  /** Most friends at once. */
  friendsMax: number;
}

/** Level builder numbers for badges (community numbers come from the server). */
export interface CreatorProgress {
  /** Levels shared to Community right now. */
  shared: number;
  /** Plays, clears and likes your shared levels got (best seen). */
  plays: number;
  clears: number;
  likes: number;
  /** Local ids of levels you shared at some point. */
  sharedIds: string[];
  /** Community level ids you beat (so each counts once). */
  clearedIds: string[];
}

export function emptyCreator(): CreatorProgress {
  return { shared: 0, plays: 0, clears: 0, likes: 0, sharedIds: [], clearedIds: [] };
}

export interface SaveData {
  v: number;
  createdAt: number;
  profile: {
    name: string;
    birthYear: number | null;
    ageGroup: AgeGroup | null;
    /** Badge id whose title is shown on the profile card ('' = Rookie Rusher). */
    title: string;
    /** Banner colour index. */
    banner: number;
    /** Badge ids pinned to the card (max 3). */
    showcase: string[];
    /** Random device key that owns a typed name on the community server. */
    nameKey: string;
    /** 4-digit tag after the name ("Neon Fox#0427"), given by the server; 0 = none yet. */
    tag: number;
    /** Badges already announced ('*' first once the baseline is set). */
    badgesSeen: string[];
  };
  gems: number;
  xp: number;
  level: number;
  trophies: number;
  skins: { owned: string[]; equipped: string };
  trails: { owned: string[]; equipped: string };
  /** Emotes for podiums and lobbies (free ones are always owned). */
  emotes: { owned: string[] };
  /** Quick Chat phrase packs bought in the Shop. */
  phrases: { owned: string[] };
  /** Secret eggs found: Endless level numbers (1-based). */
  secrets: { found: number[] };
  /** Players you banned from rooms you host (anonymous room id + their name then). */
  roomBans: { rid: string; name: string; at: number }[];
  /** Played the beta (1.0.x): exclusive rewards granted. */
  beta: { tester: boolean; version: string; at: number };
  best: Record<string, number>;
  stats: Stats;
  creator: CreatorProgress;
  missions: { active: MissionState[]; completed: number; counter: number };
  daily: { lastClaim: string | null; day: number; cycles: number };
  purchases: { noAds: boolean; starter: boolean; legend: boolean; gemPacks: number; tx: string[] };
  ads: {
    runsSinceInterstitial: number;
    lastInterstitialAt: number;
    freeGemsDay: string;
    freeGemsCount: number;
  };
  tutorial: Record<string, boolean>;
  settings: Settings;
  /** Free Chat account on the community server (empty when not verified). */
  account: ChatAccount;
}

export interface ChatAccount {
  token: string;
  id: string;
  /** 'self' = verified 16+, 'parent' = a parent approved (13-15). */
  consent: '' | 'self' | 'parent';
  emailHint: string;
  mutedUntil: number;
  /** Version of the Community Rules accepted (0 = not yet). */
  rules: number;
  /** Free Chat accounts this player blocked. */
  blocked: string[];
}

export function emptyAccount(): ChatAccount {
  return { token: '', id: '', consent: '', emailHint: '', mutedUntil: 0, rules: 0, blocked: [] };
}

export const DEFAULT_SETTINGS: Settings = {
  music: 0.7,
  sfx: 0.9,
  haptics: true,
  reducedMotion: false,
  kidMode: false,
  graphics: 'auto',
  onlineAllowed: true,
  quickChat: true,
  freeChat: false,
  publicRooms: true,
  friends: true,
  sharedLevels: true,
  purchasesAllowed: true,
  showFps: false,
  musicOff: [],
  difficulty: 'medium',
  myMusic: 'mix',
  classicSongs: false,
};

export function emptyStats(): Stats {
  return {
    runs: 0,
    totalDistance: 0,
    bestDistance: 0,
    jumps: 0,
    gemsCollected: 0,
    portals: 0,
    hits: 0,
    racesPlayed: 0,
    racesWon: 0,
    duelsPlayed: 0,
    onlinePlayed: 0,
    onlineWon: 0,
    playSeconds: 0,
    dailyRuns: 0,
    dailyTargets: 0,
    hauntedBest: 0,
    communityClears: 0,
    friendsMax: 0,
  };
}

export function createSave(now = Date.now()): SaveData {
  return {
    v: SAVE_VERSION,
    createdAt: now,
    profile: { name: '', birthYear: null, ageGroup: null, title: '', banner: 0, showcase: [], nameKey: '', tag: 0, badgesSeen: [] },
    gems: 100,
    xp: 0,
    level: 1,
    trophies: 0,
    skins: { owned: ['classic'], equipped: 'classic' },
    trails: { owned: ['none'], equipped: 'none' },
    emotes: { owned: [...FREE_EMOTES] },
    phrases: { owned: [] },
    secrets: { found: [] },
    roomBans: [],
    beta: { tester: false, version: '', at: 0 },
    best: {},
    stats: emptyStats(),
    creator: emptyCreator(),
    missions: { active: [], completed: 0, counter: 0 },
    daily: { lastClaim: null, day: 0, cycles: 0 },
    purchases: { noAds: false, starter: false, legend: false, gemPacks: 0, tx: [] },
    ads: { runsSinceInterstitial: 0, lastInterstitialAt: 0, freeGemsDay: '', freeGemsCount: 0 },
    tutorial: {},
    settings: { ...DEFAULT_SETTINGS },
    account: emptyAccount(),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep-merge `src` over `base`, keeping only keys/types that exist in `base`. */
function mergeShape<T>(base: T, src: unknown): T {
  if (!isObj(base) || !isObj(src)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  // Empty objects in the template are free-form maps (best, tutorial): accept primitive entries.
  const freeForm = Object.keys(base as Record<string, unknown>).length === 0;
  for (const key of Object.keys(src)) {
    const b = (base as Record<string, unknown>)[key];
    const s = src[key];
    if (b === undefined) {
      if (freeForm && (typeof s === 'number' || typeof s === 'boolean' || typeof s === 'string')) out[key] = s;
    } else if (Array.isArray(b)) {
      out[key] = Array.isArray(s) ? s : b;
    } else if (isObj(b)) {
      out[key] = isObj(s) ? mergeShape(b, s) : b;
    } else if (b === null) {
      out[key] = s;
    } else if (typeof s === typeof b) {
      out[key] = s;
    }
  }
  return out as T;
}

/** No real player gets near this; stops absurd values from overflowing the UI. */
export const MAX_GEMS = 9_999_999;

/** Turn whatever is on disk into a valid, current SaveData. */
export function migrate(raw: unknown): SaveData {
  const fresh = createSave();
  if (!isObj(raw)) return fresh;
  const save = mergeShape(fresh, raw);
  save.v = SAVE_VERSION;
  // Invariants.
  const str = (a: unknown[]) => [...new Set(a.filter((x): x is string => typeof x === 'string'))];
  save.skins.owned = str(save.skins.owned);
  save.trails.owned = str(save.trails.owned);
  save.phrases.owned = str(save.phrases.owned);
  save.roomBans = save.roomBans.filter((b) => b && typeof b.rid === 'string' && /^[a-f0-9]{16}$/.test(b.rid) && typeof b.name === 'string').slice(-200);
  save.secrets.found = [...new Set(save.secrets.found.filter((n) => Number.isInteger(n) && n >= 1 && n <= 40))];
  // Items only a purchase gives: kept only with the purchase (Google Play restores it on launch).
  const paid = (u: Unlock) => (u.kind === 'legend' && !save.purchases.legend) || (u.kind === 'starter' && !save.purchases.starter);
  save.skins.owned = save.skins.owned.filter((id) => !SKINS.some((x) => x.id === id && paid(x.unlock)));
  save.trails.owned = save.trails.owned.filter((id) => !TRAILS.some((x) => x.id === id && paid(x.unlock)));
  if (!save.skins.owned.includes('classic')) save.skins.owned.unshift('classic');
  if (!save.skins.owned.includes(save.skins.equipped)) save.skins.equipped = 'classic';
  if (!save.trails.owned.includes('none')) save.trails.owned.unshift('none');
  if (!save.trails.owned.includes(save.trails.equipped)) save.trails.equipped = 'none';
  save.emotes.owned = [...new Set([...FREE_EMOTES, ...save.emotes.owned.filter((e) => typeof e === 'string')])];
  save.gems = Number.isFinite(save.gems) ? Math.min(MAX_GEMS, Math.max(0, Math.floor(save.gems))) : 0;
  save.level = Math.max(1, Math.floor(save.level));
  if (save.account.consent !== 'self' && save.account.consent !== 'parent') save.account = { ...emptyAccount(), rules: save.account.rules };
  save.account.blocked = save.account.blocked.filter((b) => typeof b === 'string').slice(-200);
  save.profile.showcase = save.profile.showcase.filter((b) => typeof b === 'string').slice(0, 3);
  save.profile.banner = Number.isInteger(save.profile.banner) ? Math.max(0, save.profile.banner) : 0;
  save.profile.tag = Number.isInteger(save.profile.tag) && save.profile.tag >= 0 && save.profile.tag <= 9999 ? save.profile.tag : 0;
  save.settings.music = clamp01(save.settings.music);
  save.settings.sfx = clamp01(save.settings.sfx);
  if (!DIFFICULTIES.includes(save.settings.difficulty)) save.settings.difficulty = 'medium';
  if (!['off', 'mix', 'only'].includes(save.settings.myMusic)) save.settings.myMusic = 'mix';
  save.settings.musicOff = save.settings.musicOff.filter((n) => Number.isInteger(n) && n >= 0 && n < 512).slice(0, 256);
  return save;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: 'Easy', medium: 'Normal', hard: 'Extreme' };

/** Endless records are kept per difficulty (medium keeps the original key). */
export function endlessBestKey(s: Pick<Settings, 'kidMode' | 'difficulty'>): string {
  const base = s.difficulty === 'medium' ? 'endless' : `endless_${s.difficulty}`;
  return s.kidMode ? `${base}_kid` : base;
}

export function ageGroupFor(birthYear: number, now = new Date()): AgeGroup {
  // Conservative: assume the birthday has not happened yet this year.
  const age = now.getFullYear() - birthYear - 1;
  if (age < 13) return 'child';
  if (age < 18) return 'teen';
  return 'adult';
}
