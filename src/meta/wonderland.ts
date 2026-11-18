import type { SaveData } from '../state/save';

/**
 * Christmas Wonderland rewards that aren't sold: the Holiday Hero skin (beat
 * the Holiday Run on Hard) and the Advent Calendar's items.
 */
export const HERO_SKIN = 'hero';

/** Give the Holiday Hero skin once. Returns true the first time. Mutates `save`. */
export function grantHolidayHero(save: SaveData): boolean {
  if (save.skins.owned.includes(HERO_SKIN)) return false;
  save.skins.owned.push(HERO_SKIN);
  return true;
}
