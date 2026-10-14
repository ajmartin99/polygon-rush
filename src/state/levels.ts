import { Preferences } from '@capacitor/preferences';
import { Emitter } from '../core/emitter';
import { sanitizeLevel, type LevelData } from '../game/level';

const KEY = 'polygon-rush.levels.v1';
export const MAX_LEVELS = 60;

interface LevelEvents extends Record<string, unknown> {
  change: LevelData[];
}

/**
 * Levels built or imported on this device. Kept apart from the main save so
 * big levels never slow down the frequent progress saves.
 */
class LevelStore extends Emitter<LevelEvents> {
  private levels: LevelData[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

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
    let parsed: unknown = [];
    try {
      parsed = raw ? JSON.parse(raw) : [];
    } catch {
      parsed = [];
    }
    const seen = new Set<string>();
    this.levels = [];
    for (const l of Array.isArray(parsed) ? parsed : []) {
      const level = sanitizeLevel(l);
      if (level && !seen.has(level.id)) {
        seen.add(level.id);
        this.levels.push(level);
      }
    }
    this.emit('change', this.list());
  }

  /** Newest first. */
  list(): LevelData[] {
    return [...this.levels].sort((a, b) => b.updated - a.updated);
  }

  get(id: string): LevelData | undefined {
    return this.levels.find((l) => l.id === id);
  }

  get full(): boolean {
    return this.levels.length >= MAX_LEVELS;
  }

  /** Insert or replace. Returns false when the device already holds MAX_LEVELS. */
  put(level: LevelData): boolean {
    const i = this.levels.findIndex((l) => l.id === level.id);
    if (i >= 0) this.levels[i] = level;
    else if (this.full) return false;
    else this.levels.push(level);
    this.changed();
    return true;
  }

  /** Update local stats/flags without bumping `updated`. */
  touch(id: string, fn: (l: LevelData) => void): void {
    const l = this.get(id);
    if (!l) return;
    fn(l);
    this.changed();
  }

  remove(id: string): void {
    this.levels = this.levels.filter((l) => l.id !== id);
    this.changed();
  }

  private changed(): void {
    this.emit('change', this.list());
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 300);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const json = JSON.stringify(this.levels);
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
}

export const levels = new LevelStore();
