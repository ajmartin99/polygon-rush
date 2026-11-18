import { MAX_GEMS, type SaveData } from '../state/save';

/**
 * Secret Santa (Christmas Wonderland): what's inside a present is picked
 * from its id, so the sender and the server never decide it. Most hold a
 * handful of gems; some a Christmas emote you don't have yet.
 */
export const GIVER_GEMS = 25;
const SURPRISE_EMOTES = ['xtree', 'xsnowman', 'xgift', 'xdeer', 'xbells'];

export interface PresentGrant {
  gems: number;
  emote: string | null;
}

function hash(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Unwrap a present: add what's inside to the save. Mutates `save`. */
export function unwrapPresent(save: SaveData, id: string): PresentGrant {
  const h = hash(id);
  if (h % 5 === 0) {
    const missing = SURPRISE_EMOTES.filter((e) => !save.emotes.owned.includes(e));
    if (missing.length) {
      const emote = missing[(h >>> 3) % missing.length];
      save.emotes.owned.push(emote);
      return { gems: 0, emote };
    }
  }
  const gems = 30 + ((h >>> 5) % 10) * 10;
  save.gems = Math.min(MAX_GEMS, save.gems + gems);
  return { gems, emote: null };
}
