import { CONFIG } from '../config';
import type { SaveData } from '../state/save';

/**
 * Who may use what (mirrors the server's rules, which are the real gate):
 *  - Quick Chat: everyone, unless a parent turns it off.
 *  - Public build rooms: 13+ (device age screen), parent toggle, server needed.
 *  - Free Chat: 16+ verifying their own email, or 13-15 with a parent's
 *    email approval; never under 13. Server needed.
 */
export const RULES_VERSION = 1;

/** Age assuming the birthday hasn't happened yet this year (errs young). */
export function ageOf(birthYear: number | null, now = new Date()): number {
  return birthYear === null ? 0 : now.getFullYear() - birthYear - 1;
}

export type FreeChatPath = 'none' | 'parent' | 'self';

export function freeChatPath(birthYear: number | null, now = new Date()): FreeChatPath {
  const age = ageOf(birthYear, now);
  if (age < 13) return 'none';
  return age < 16 ? 'parent' : 'self';
}

export function serverAvailable(): boolean {
  return Boolean(CONFIG.server.url);
}

export function canUsePublicRooms(save: SaveData, now = new Date()): boolean {
  return serverAvailable() && save.settings.onlineAllowed && save.settings.publicRooms && ageOf(save.profile.birthYear, now) >= 13;
}

/** Community levels (play, like, share): server needed, online allowed and the parents' switch on. */
export function canUseSharedLevels(save: SaveData): boolean {
  return serverAvailable() && save.settings.onlineAllowed && save.settings.sharedLevels;
}

/** Free Chat can be offered (the player may start verification). */
/**
 * What the server says it can do (GET /api/status). Free Chat needs email
 * for verification, so it stays hidden until the server reports it's live.
 */
const serverFeatures = { freeChat: false };

export function setServerFeatures(f: { freeChat?: unknown }): void {
  serverFeatures.freeChat = f.freeChat === true;
}

export function canOfferFreeChat(save: SaveData, now = new Date()): boolean {
  return CONFIG.features.freeChat && serverAvailable() && serverFeatures.freeChat && save.settings.onlineAllowed && freeChatPath(save.profile.birthYear, now) !== 'none';
}

/** Verified, switched on and allowed right now. */
export function freeChatReady(save: SaveData, now = new Date()): boolean {
  const path = freeChatPath(save.profile.birthYear, now);
  if (!canOfferFreeChat(save, now) || !save.settings.freeChat || !save.account.token) return false;
  // A 13-15 player needs a parent-approved account; a self-verified one doesn't count.
  return path === 'self' || save.account.consent === 'parent';
}
