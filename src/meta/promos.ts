import { SKINS, TRAILS, type Unlock } from './catalog';
import { EMOTES } from './emotes';
import { MAX_GEMS, type SaveData } from '../state/save';

/** What a promo code gives (checked by the server, handed out here). */
export interface PromoReward {
  gems?: number;
  skins?: string[];
  trails?: string[];
  emotes?: string[];
  regens?: number;
}

export interface PromoGrant {
  gems: number;
  regens: number;
  skins: string[];
  trails: string[];
  emotes: string[];
}

/** Items that come with a purchase stay with the purchase (Restore purchases brings them back). */
const giftable = (u: Unlock) => u.kind !== 'starter' && u.kind !== 'legend';

/** Add a redeemed code's reward to the save. Unknown or already-owned items are skipped. Mutates `save`. */
export function grantPromo(save: SaveData, reward: PromoReward): PromoGrant {
  const out: PromoGrant = { gems: 0, regens: 0, skins: [], trails: [], emotes: [] };
  const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? Math.min(max, v) : 0);
  out.gems = Math.min(n(reward.gems, 50_000), MAX_GEMS - save.gems);
  save.gems += out.gems;
  out.regens = Math.min(n(reward.regens, 20), 999 - save.haunted.regens);
  save.haunted.regens += out.regens;
  for (const id of reward.skins ?? []) {
    const def = SKINS.find((s) => s.id === id);
    if (def && giftable(def.unlock) && !save.skins.owned.includes(id)) (save.skins.owned.push(id), out.skins.push(id));
  }
  for (const id of reward.trails ?? []) {
    const def = TRAILS.find((t) => t.id === id);
    if (def && giftable(def.unlock) && !save.trails.owned.includes(id)) (save.trails.owned.push(id), out.trails.push(id));
  }
  for (const id of reward.emotes ?? []) {
    if (EMOTES.some((e) => e.id === id) && !save.emotes.owned.includes(id)) (save.emotes.owned.push(id), out.emotes.push(id));
  }
  return out;
}

/** "500 gems, the Ghost skin and 2 Heart Regens" */
export function describeGrant(g: PromoGrant): string {
  const parts: string[] = [];
  if (g.gems) parts.push(`${g.gems.toLocaleString()} gems`);
  for (const id of g.skins) parts.push(`the ${SKINS.find((s) => s.id === id)?.name ?? id} skin`);
  for (const id of g.trails) parts.push(`the ${TRAILS.find((t) => t.id === id)?.name ?? id} trail`);
  for (const id of g.emotes) parts.push(`the ${EMOTES.find((e) => e.id === id)?.name ?? id} emote`);
  if (g.regens) parts.push(`${g.regens} Heart Regen${g.regens > 1 ? 's' : ''}`);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
