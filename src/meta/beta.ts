import type { SaveData } from '../state/save';

/**
 * Beta tester rewards. Anyone who plays a 1.0.x build (the closed test) gets
 * an exclusive skin, trail, emote, badge and a gem thank-you, theirs forever.
 * From 1.1.0 (the full release) nobody new can get them.
 */
export const BETA_REWARD = { skin: 'betabot', trail: 'debug', emote: 'tester', gems: 500 } as const;

/** 1.0.x is the beta. */
export function isBetaBuild(version: string): boolean {
  const m = /^(\d+)\.(\d+)\./.exec(version.trim());
  return !!m && Number(m[1]) === 1 && Number(m[2]) === 0;
}

/** Give this player the beta rewards (once, only on a beta build). Returns true when granted now. Mutates `save`. */
export function grantBeta(save: SaveData, version: string, now = Date.now()): boolean {
  if (save.beta.tester || !isBetaBuild(version)) return false;
  if (!save.skins.owned.includes(BETA_REWARD.skin)) save.skins.owned.push(BETA_REWARD.skin);
  if (!save.trails.owned.includes(BETA_REWARD.trail)) save.trails.owned.push(BETA_REWARD.trail);
  if (!save.emotes.owned.includes(BETA_REWARD.emote)) save.emotes.owned.push(BETA_REWARD.emote);
  save.gems += BETA_REWARD.gems;
  save.beta = { tester: true, version, at: now };
  return true;
}
