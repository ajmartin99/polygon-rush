import { mulberry32 } from '../core/rng';
import type { IconName } from '../ui/icons';
import type { MissionState, SaveData } from '../state/save';

/** Things the game reports that missions can listen to. */
export type MissionEvent =
  | 'run_distance' // value = best single-run distance this run (max-type)
  | 'distance' // value = metres added (sum-type)
  | 'gems_run' // value = gems collected in one run (max-type)
  | 'gems' // value = gems collected (sum-type)
  | 'jumps' // sum
  | 'portals' // sum
  | 'race_win' // sum
  | 'race_play' // sum
  | 'duel_play' // sum
  | 'online_play' // sum
  | 'clean_distance' // max: metres without a hit in one run
  | 'mode_time' // sum: seconds in Glider/Roller/Hopper
  | 'custom_clear' // sum: player-made levels beaten (not your own test runs)
  | 'level_verify'; // sum: own levels beaten from the start (makes them shareable)

interface Template {
  id: string;
  event: MissionEvent;
  /** max-type missions track a personal best; sum-type accumulate. */
  kind: 'max' | 'sum';
  targets: number[];
  text: (n: number) => string;
  icon: IconName;
}

export const MISSION_TEMPLATES: Template[] = [
  { id: 'run_far', event: 'run_distance', kind: 'max', targets: [250, 500, 800, 1200, 2000], text: (n) => `Rush ${n}m in one Endless run`, icon: 'flag' },
  { id: 'distance', event: 'distance', kind: 'sum', targets: [1500, 3000, 6000, 10000], text: (n) => `Rush ${n.toLocaleString('en-US')}m in total`, icon: 'motion' },
  { id: 'gems_run', event: 'gems_run', kind: 'max', targets: [25, 50, 80, 120], text: (n) => `Grab ${n} gems in one run`, icon: 'gem' },
  { id: 'gems', event: 'gems', kind: 'sum', targets: [150, 300, 600], text: (n) => `Collect ${n} gems`, icon: 'gem' },
  { id: 'jumps', event: 'jumps', kind: 'sum', targets: [75, 150, 300], text: (n) => `Jump ${n} times`, icon: 'star' },
  { id: 'portals', event: 'portals', kind: 'sum', targets: [4, 10, 20], text: (n) => `Fly through ${n} shape portals`, icon: 'shapes' },
  { id: 'race_play', event: 'race_play', kind: 'sum', targets: [2, 4, 6], text: (n) => `Play ${n} Races`, icon: 'flag' },
  { id: 'race_win', event: 'race_win', kind: 'sum', targets: [1, 2, 3], text: (n) => (n === 1 ? 'Win a Race' : `Win ${n} Races`), icon: 'trophy' },
  { id: 'duel', event: 'duel_play', kind: 'sum', targets: [1, 2], text: (n) => (n === 1 ? 'Play a 2-Player Duel' : `Play ${n} Duels`), icon: 'duel' },
  { id: 'clean', event: 'clean_distance', kind: 'max', targets: [200, 400, 700], text: (n) => `Rush ${n}m without a bump`, icon: 'shield' },
  { id: 'mode_time', event: 'mode_time', kind: 'sum', targets: [30, 60, 120], text: (n) => `Spend ${n}s as Glider, Roller or Hopper`, icon: 'shapes' },
  { id: 'custom_clear', event: 'custom_clear', kind: 'sum', targets: [1, 2, 3], text: (n) => (n === 1 ? 'Beat a level someone built' : `Beat ${n} levels other players built`), icon: 'build' },
  { id: 'level_verify', event: 'level_verify', kind: 'sum', targets: [1], text: () => 'Build a level and beat it', icon: 'build' },
];

export const ACTIVE_MISSIONS = 3;

export function templateOf(m: MissionState): Template | undefined {
  return MISSION_TEMPLATES.find((t) => t.id === m.id);
}

export function describe(m: MissionState): string {
  return templateOf(m)?.text(m.target) ?? 'Mission';
}

export function missionIcon(m: MissionState): IconName {
  return templateOf(m)?.icon ?? 'target';
}

export function isComplete(m: MissionState): boolean {
  return m.progress >= m.target;
}

/** Pick a fresh mission that isn't already active. Deterministic per counter. */
export function rollMission(save: SaveData): MissionState {
  const rng = mulberry32(0x5eed + save.missions.counter * 7919 + save.createdAt % 100000);
  save.missions.counter += 1;
  const activeIds = new Set(save.missions.active.map((m) => m.id));
  const pool = MISSION_TEMPLATES.filter((t) => !activeIds.has(t.id));
  const t = pool[Math.floor(rng() * pool.length)] ?? MISSION_TEMPLATES[0];
  // Difficulty grows gently with completed missions.
  const tier = Math.min(t.targets.length - 1, Math.floor(save.missions.completed / 4 + rng() * 1.5));
  const target = t.targets[tier];
  const reward = 60 + tier * 40 + Math.floor(rng() * 3) * 10;
  return { id: t.id, target, progress: 0, reward, claimed: false };
}

/** Keep exactly ACTIVE_MISSIONS missions. Mutates `save`. */
export function ensureMissions(save: SaveData): void {
  save.missions.active = save.missions.active.filter((m) => !m.claimed && templateOf(m));
  while (save.missions.active.length < ACTIVE_MISSIONS) save.missions.active.push(rollMission(save));
}

/**
 * Report progress. Returns the missions that just became complete.
 * Mutates `save`.
 */
export function reportMission(save: SaveData, event: MissionEvent, value: number): MissionState[] {
  const done: MissionState[] = [];
  for (const m of save.missions.active) {
    const t = templateOf(m);
    if (!t || t.event !== event || m.claimed) continue;
    const was = isComplete(m);
    m.progress = t.kind === 'max' ? Math.max(m.progress, Math.floor(value)) : m.progress + Math.floor(value);
    m.progress = Math.min(m.progress, m.target);
    if (!was && isComplete(m)) done.push(m);
  }
  return done;
}

/** Claim a completed mission: returns the gem reward and replaces it. Mutates `save`. */
export function claimMission(save: SaveData, index: number): number {
  const m = save.missions.active[index];
  if (!m || m.claimed || !isComplete(m)) return 0;
  m.claimed = true;
  save.missions.completed += 1;
  save.missions.active.splice(index, 1, rollMission(save));
  return m.reward;
}

export function claimableCount(save: SaveData): number {
  return save.missions.active.filter((m) => isComplete(m) && !m.claimed).length;
}
