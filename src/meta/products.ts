import { CONFIG } from '../config';
import type { SaveData } from '../state/save';
import { LEGEND_PACK_SKINS, LEGEND_PACK_TRAILS } from './catalog';

export type ProductKind = 'consumable' | 'nonconsumable';

export interface ProductDef {
  id: string;
  kind: ProductKind;
  name: string;
  desc: string;
  /** Shown only when Google Play hasn't returned a localized price yet. */
  fallbackPrice: string;
  gems?: number;
  ribbon?: string;
  featured?: boolean;
  /** Can also be bought with gems (see gemPriceOf). */
  gemPay?: boolean;
}

const P = CONFIG.iap.products;

/**
 * Create these exact product ids in Play Console > Monetize > In-app products.
 * Prices shown in-game always come from Google Play (localized).
 */
export const PRODUCTS: ProductDef[] = [
  { id: P.starterPack, kind: 'nonconsumable', name: 'Starter Pack', desc: 'No Ads + 2,500 gems + Golden skin', fallbackPrice: '$4.99', gems: 2500, ribbon: 'Best deal', featured: true },
  { id: P.removeAds, kind: 'nonconsumable', name: 'No Ads', desc: 'Remove banner & break ads forever', fallbackPrice: '$2.99' },
  { id: P.legendPack, kind: 'nonconsumable', name: 'Legend Pack', desc: '3 legendary skins + 2 legendary trails', fallbackPrice: '$3.99' },
  { id: P.gemsSmall, kind: 'consumable', name: 'Gem Pouch', desc: '600 gems', fallbackPrice: '$0.99', gems: 600 },
  { id: P.creatorSpotlight, kind: 'nonconsumable', name: 'Creator Spotlight', desc: 'Your top-rated level on your profile card: anyone who taps you can play it', fallbackPrice: '$0.99', gemPay: true },
  { id: P.builderPack, kind: 'nonconsumable', name: 'Builder Pack', desc: 'Creator Stats on your card + a gold Pro Builder tag on your card and Community levels', fallbackPrice: '$2.99', gemPay: true },
  { id: P.hauntedRegen1, kind: 'consumable', name: 'Heart Regen', desc: 'Limited-time runs: 2 fresh attempts now', fallbackPrice: '$0.99', gemPay: true },
  { id: P.hauntedRegen4, kind: 'consumable', name: '4 Heart Regens', desc: 'Limited-time runs: 4 refills, use them any time', fallbackPrice: '$2.99', gemPay: true },
  { id: P.gemsMedium, kind: 'consumable', name: 'Gem Chest', desc: '2,000 gems', fallbackPrice: '$2.99', gems: 2000, ribbon: 'Popular' },
  { id: P.gemsLarge, kind: 'consumable', name: 'Gem Vault', desc: '6,000 gems', fallbackPrice: '$6.99', gems: 6000, ribbon: 'Best value' },
];

export const productById = (id: string): ProductDef | undefined => PRODUCTS.find((p) => p.id === id);

/** Heart Regens a product gives (0 for anything else). */
export function regensIn(id: string): number {
  return id === P.hauntedRegen1 ? 1 : id === P.hauntedRegen4 ? 4 : 0;
}

/** Paying with gems costs this much more than the same money buys in gems. */
export const GEM_MARKUP = 1.1;

/**
 * Gem price of a paid item (Heart Regens, profile add-ons): the gems its
 * price buys in the gem pack at the same price, plus 10%. 0 when it can't be
 * paid with gems.
 */
export function gemPriceOf(id: string): number {
  const def = productById(id);
  if (!def?.gemPay) return 0;
  const pack = PRODUCTS.find((p) => p.gems && p.kind === 'consumable' && p.fallbackPrice === def.fallbackPrice);
  return pack?.gems ? Math.round(pack.gems * GEM_MARKUP) : 0;
}

export function isOwned(save: SaveData, id: string): boolean {
  if (id === P.removeAds) return save.purchases.noAds;
  if (id === P.starterPack) return save.purchases.starter;
  if (id === P.legendPack) return save.purchases.legend;
  if (id === P.creatorSpotlight) return save.purchases.spotlight;
  if (id === P.builderPack) return save.purchases.builder;
  return false;
}

export interface GrantResult {
  gems: number;
  noAds: boolean;
  skins: string[];
  trails: string[];
}

/**
 * Apply what a product gives. Idempotent for non-consumables (restoring twice
 * never double-grants); consumables are de-duplicated by transaction id by the
 * caller. Mutates `save`.
 */
export function grantProduct(save: SaveData, id: string): GrantResult {
  const r: GrantResult = { gems: 0, noAds: false, skins: [], trails: [] };
  const addSkin = (s: string) => {
    if (!save.skins.owned.includes(s)) {
      save.skins.owned.push(s);
      r.skins.push(s);
    }
  };
  const addTrail = (t: string) => {
    if (!save.trails.owned.includes(t)) {
      save.trails.owned.push(t);
      r.trails.push(t);
    }
  };
  switch (id) {
    case P.removeAds:
      r.noAds = !save.purchases.noAds;
      save.purchases.noAds = true;
      break;
    case P.starterPack:
      if (!save.purchases.starter) r.gems = 2500;
      save.purchases.starter = true;
      r.noAds = !save.purchases.noAds;
      save.purchases.noAds = true;
      addSkin('golden');
      break;
    case P.legendPack:
      save.purchases.legend = true;
      LEGEND_PACK_SKINS.forEach(addSkin);
      LEGEND_PACK_TRAILS.forEach(addTrail);
      break;
    case P.creatorSpotlight:
      save.purchases.spotlight = true;
      break;
    case P.builderPack:
      save.purchases.builder = true;
      break;
    case P.hauntedRegen1:
    case P.hauntedRegen4:
      save.haunted.regens += regensIn(id);
      break;
    default: {
      const def = productById(id);
      if (def?.kind === 'consumable' && def.gems) {
        r.gems = def.gems;
        save.purchases.gemPacks += 1;
      }
    }
  }
  save.gems += r.gems;
  return r;
}
