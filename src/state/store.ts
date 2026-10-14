import { Preferences } from '@capacitor/preferences';
import { Emitter } from '../core/emitter';
import { createSave, migrate, type SaveData, type Settings } from './save';

const KEY = 'polygon-rush.save.v1';

interface StoreEvents extends Record<string, unknown> {
  change: SaveData;
  gems: { gems: number; delta: number };
  settings: Settings;
  level: { level: number };
}

/**
 * Single source of truth for persistent player data. Writes are debounced and
 * mirrored to both Capacitor Preferences (native SharedPreferences, survives
 * WebView storage clears) and localStorage (web/dev fallback).
 */
class Store extends Emitter<StoreEvents> {
  data: SaveData = createSave();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  async load(): Promise<void> {
    let raw: string | null = null;
    try {
      raw = (await Preferences.get({ key: KEY })).value;
    } catch {
      raw = null;
    }
    if (!raw) {
      try {
        raw = localStorage.getItem(KEY);
      } catch {
        raw = null;
      }
    }
    let parsed: unknown = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    this.data = migrate(parsed);
    this.loaded = true;
    this.emit('change', this.data);
  }

  /** Mark data dirty; persists shortly after. */
  commit(): void {
    this.emit('change', this.data);
    if (!this.loaded) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), 400);
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const json = JSON.stringify(this.data);
    try {
      localStorage.setItem(KEY, json);
    } catch {
      /* storage full or unavailable */
    }
    try {
      await Preferences.set({ key: KEY, value: json });
    } catch {
      /* web without preferences */
    }
  }

  async reset(): Promise<void> {
    const keepAge = this.data.profile;
    const keepPurchases = this.data.purchases;
    this.data = createSave();
    // Purchases are restored from Google Play anyway; age answer is kept so the
    // neutral age screen isn't shown again to a child who reset progress.
    this.data.profile = { ...keepAge };
    this.data.purchases = { ...keepPurchases };
    this.commit();
    this.emit('gems', { gems: this.data.gems, delta: 0 });
    await this.flush();
  }

  // ---------------------------------------------------------------- gems
  addGems(amount: number): void {
    if (amount <= 0) return;
    this.data.gems += Math.floor(amount);
    this.emit('gems', { gems: this.data.gems, delta: Math.floor(amount) });
    this.commit();
  }

  canAfford(amount: number): boolean {
    return this.data.gems >= amount;
  }

  spendGems(amount: number): boolean {
    if (amount < 0 || this.data.gems < amount) return false;
    this.data.gems -= amount;
    this.emit('gems', { gems: this.data.gems, delta: -amount });
    this.commit();
    return true;
  }

  // ------------------------------------------------------------ settings
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.data.settings[key] = value;
    this.emit('settings', this.data.settings);
    this.commit();
  }

  get settings(): Settings {
    return this.data.settings;
  }

  // ------------------------------------------------------------ inventory
  ownsSkin(id: string): boolean {
    return this.data.skins.owned.includes(id);
  }

  ownsTrail(id: string): boolean {
    return this.data.trails.owned.includes(id);
  }

  grantSkin(id: string): void {
    if (!this.ownsSkin(id)) this.data.skins.owned.push(id);
    this.commit();
  }

  grantTrail(id: string): void {
    if (!this.ownsTrail(id)) this.data.trails.owned.push(id);
    this.commit();
  }

  equipSkin(id: string): void {
    if (this.ownsSkin(id)) {
      this.data.skins.equipped = id;
      this.commit();
    }
  }

  equipTrail(id: string): void {
    if (this.ownsTrail(id)) {
      this.data.trails.equipped = id;
      this.commit();
    }
  }

  get isChild(): boolean {
    return this.data.profile.ageGroup === 'child';
  }

  /** Grown-up check needed before purchases / external links. */
  get needsParentalGate(): boolean {
    return this.data.profile.ageGroup !== 'adult';
  }
}

export const store = new Store();
