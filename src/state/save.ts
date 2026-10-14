/**
 * Persistent save-game schema. Bump SAVE_VERSION and extend `migrate` when the
 * shape changes so existing players never lose progress.
 */
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
  /** Parental control: allow "Play with Friends" online rooms. */
  onlineAllowed: boolean;
  /** Parental control: allow in-app purchases. */
  purchasesAllowed: boolean;
  showFps: boolean;
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
}

export interface SaveData {
  v: number;
  createdAt: number;
  profile: {
    name: string;
    birthYear: number | null;
    ageGroup: AgeGroup | null;
  };
  gems: number;
  xp: number;
  level: number;
  trophies: number;
  skins: { owned: string[]; equipped: string };
  trails: { owned: string[]; equipped: string };
  best: Record<string, number>;
  stats: Stats;
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
}

export const DEFAULT_SETTINGS: Settings = {
  music: 0.7,
  sfx: 0.9,
  haptics: true,
  reducedMotion: false,
  kidMode: false,
  graphics: 'auto',
  onlineAllowed: true,
  purchasesAllowed: true,
  showFps: false,
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
  };
}

export function createSave(now = Date.now()): SaveData {
  return {
    v: SAVE_VERSION,
    createdAt: now,
    profile: { name: '', birthYear: null, ageGroup: null },
    gems: 100,
    xp: 0,
    level: 1,
    trophies: 0,
    skins: { owned: ['classic'], equipped: 'classic' },
    trails: { owned: ['none'], equipped: 'none' },
    best: {},
    stats: emptyStats(),
    missions: { active: [], completed: 0, counter: 0 },
    daily: { lastClaim: null, day: 0, cycles: 0 },
    purchases: { noAds: false, starter: false, legend: false, gemPacks: 0, tx: [] },
    ads: { runsSinceInterstitial: 0, lastInterstitialAt: 0, freeGemsDay: '', freeGemsCount: 0 },
    tutorial: {},
    settings: { ...DEFAULT_SETTINGS },
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

/** Turn whatever is on disk into a valid, current SaveData. */
export function migrate(raw: unknown): SaveData {
  const fresh = createSave();
  if (!isObj(raw)) return fresh;
  const save = mergeShape(fresh, raw);
  save.v = SAVE_VERSION;
  // Invariants.
  if (!save.skins.owned.includes('classic')) save.skins.owned.unshift('classic');
  if (!save.skins.owned.includes(save.skins.equipped)) save.skins.equipped = 'classic';
  if (!save.trails.owned.includes('none')) save.trails.owned.unshift('none');
  if (!save.trails.owned.includes(save.trails.equipped)) save.trails.equipped = 'none';
  save.gems = Math.max(0, Math.floor(save.gems));
  save.level = Math.max(1, Math.floor(save.level));
  save.settings.music = clamp01(save.settings.music);
  save.settings.sfx = clamp01(save.settings.sfx);
  return save;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

export function ageGroupFor(birthYear: number, now = new Date()): AgeGroup {
  // Conservative: assume the birthday has not happened yet this year.
  const age = now.getFullYear() - birthYear - 1;
  if (age < 13) return 'child';
  if (age < 18) return 'teen';
  return 'adult';
}
