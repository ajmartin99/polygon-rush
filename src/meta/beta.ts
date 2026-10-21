import type { SaveData } from '../state/save';

/**
 * Beta tester rewards. Joining the closed test (playing a 1.0.x build) gives
 * the Founding Tester title straight away. The rest is earned by actually
 * testing: a "test day" is a day with 5 minutes of active play, and the
 * trail, emote, skin and gems unlock after enough of them (any days, not in a
 * row). From 1.1.0 (the full release) nobody new can join or earn them.
 */
export const BETA_REWARD = { skin: 'betabot', trail: 'debug', emote: 'tester', gems: 500 } as const;

/** Active play that makes a day count. */
export const BETA_DAY_SECONDS = 5 * 60;
/** Test days for each reward. */
export const BETA_TRAIL_DAYS = 7;
export const BETA_SKIN_DAYS = 12;

export type BetaReward = 'trail' | 'skin';

/** 1.0.x is the beta. */
export function isBetaBuild(version: string): boolean {
  const m = /^(\d+)\.(\d+)\./.exec(version.trim());
  return !!m && Number(m[1]) === 1 && Number(m[2]) === 0;
}

/**
 * Join the beta on a beta build: the Founding Tester title now, the items
 * later. Returns true when this player joined just now. Mutates `save`.
 */
export function joinBeta(save: SaveData, version: string, now = Date.now()): boolean {
  keepEarlyRewards(save);
  if (save.beta.tester || !isBetaBuild(version)) return false;
  save.beta = { ...save.beta, tester: true, version, at: now };
  return true;
}

/** Testers from before rewards had to be earned already own everything: keep it, never pay out twice. */
function keepEarlyRewards(save: SaveData): void {
  const b = save.beta;
  if (b.tester && b.claimed.length === 0 && save.skins.owned.includes(BETA_REWARD.skin)) b.claimed = ['trail', 'skin'];
}

/**
 * Count active play towards today's test day. Returns whether today just
 * became a test day and any rewards that unlocked. Mutates `save`.
 */
export function addBetaPlay(save: SaveData, version: string, seconds: number, day: string): { counted: boolean; unlocked: BetaReward[] } {
  const b = save.beta;
  if (!b.tester || !isBetaBuild(version) || seconds <= 0) return { counted: false, unlocked: [] };
  if (b.today !== day) {
    b.today = day;
    b.todaySec = 0;
  }
  b.todaySec = Math.min(24 * 3600, b.todaySec + seconds);
  let counted = false;
  if (b.todaySec >= BETA_DAY_SECONDS && !b.days.includes(day)) {
    b.days = [...b.days, day].slice(-60);
    counted = true;
  }
  return { counted, unlocked: claimBetaRewards(save) };
}

/** Hand out every reward the test days have reached. Mutates `save`. */
export function claimBetaRewards(save: SaveData): BetaReward[] {
  const b = save.beta;
  const out: BetaReward[] = [];
  if (b.days.length >= BETA_TRAIL_DAYS && !b.claimed.includes('trail')) {
    if (!save.trails.owned.includes(BETA_REWARD.trail)) save.trails.owned.push(BETA_REWARD.trail);
    if (!save.emotes.owned.includes(BETA_REWARD.emote)) save.emotes.owned.push(BETA_REWARD.emote);
    b.claimed = [...b.claimed, 'trail'];
    out.push('trail');
  }
  if (b.days.length >= BETA_SKIN_DAYS && !b.claimed.includes('skin')) {
    if (!save.skins.owned.includes(BETA_REWARD.skin)) save.skins.owned.push(BETA_REWARD.skin);
    save.gems += BETA_REWARD.gems;
    b.claimed = [...b.claimed, 'skin'];
    out.push('skin');
  }
  return out;
}
