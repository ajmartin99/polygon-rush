import { contentOf, decodeLevel, encodeLevel, type LevelContent, type LevelData } from '../game/level';
import { store } from '../state/store';
import { friends } from './friends';

/**
 * Community levels on the game server: share a level you built and beat,
 * browse Top (everyone or friends), Suggested and Newest, then play, like or
 * report. Levels travel as share codes; the builder shows by racer name only.
 */
export type SharedTab = 'top' | 'suggested' | 'new';
export type SharedScope = 'all' | 'friends' | 'mine';
export type ReportReason = 'mean_name' | 'impossible' | 'copied' | 'other';

export interface SharedLevel {
  id: string;
  content: LevelContent;
  author: string;
  plays: number;
  clears: number;
  likes: number;
  liked: boolean;
  played: boolean;
  mine: boolean;
  friend: boolean;
  created: number;
}

export interface CreatorStats {
  shared: number;
  plays: number;
  clears: number;
  likes: number;
}

interface RawShared extends Omit<SharedLevel, 'content'> {
  code: string;
}

/** A shared level as a playable LevelData (not stored on the device). */
export function sharedLevelData(l: SharedLevel): LevelData {
  return { ...contentOf(l.content), id: `shared${l.id}`, created: l.created, updated: l.created, verified: true, best: 0, plays: 0, origin: 'code' };
}

/** Keep the best creator numbers seen (they drive the community badges). */
function noteStats(s: CreatorStats): void {
  const c = store.data.creator;
  const next = { shared: s.shared, plays: Math.max(c.plays, s.plays), clears: Math.max(c.clears, s.clears), likes: Math.max(c.likes, s.likes) };
  if (next.shared !== c.shared || next.plays !== c.plays || next.clears !== c.clears || next.likes !== c.likes) {
    store.data.creator = { ...c, ...next };
    store.commit();
  }
}

export const sharedLevels = {
  async browse(tab: SharedTab, scope: SharedScope, offset = 0): Promise<{ levels: SharedLevel[]; more: boolean }> {
    const res = await friends.authed<{ levels: RawShared[]; more: boolean; stats: CreatorStats }>('/api/levels/browse', { tab, scope, offset });
    noteStats(res.stats);
    const levels: SharedLevel[] = [];
    for (const { code, ...rest } of res.levels) {
      try {
        levels.push({ ...rest, content: decodeLevel(code) });
      } catch {
        /* made by a newer version: skip */
      }
    }
    return { levels, more: res.more };
  },

  /** Share (or update) one of your levels. */
  async publish(level: LevelData): Promise<{ id: string; updated: boolean }> {
    const out = await friends.authed<{ id: string; updated: boolean }>('/api/levels/publish', { localId: level.id, code: encodeLevel(level) });
    const c = store.data.creator;
    if (!c.sharedIds.includes(level.id)) {
      store.data.creator = { ...c, sharedIds: [...c.sharedIds, level.id].slice(-60), shared: Math.max(c.shared, c.sharedIds.length + 1) };
      store.commit();
    }
    return out;
  },

  unpublish(id: string): Promise<unknown> {
    return friends.authed(`/api/levels/${encodeURIComponent(id)}/unpublish`, {});
  },

  play(id: string, cleared: boolean): Promise<{ plays: number; clears: number }> {
    return friends.authed(`/api/levels/${encodeURIComponent(id)}/play`, { cleared });
  },

  like(id: string, like: boolean): Promise<{ liked: boolean; likes: number }> {
    return friends.authed(`/api/levels/${encodeURIComponent(id)}/like`, { like });
  },

  report(id: string, reason: ReportReason): Promise<{ hidden: boolean }> {
    return friends.authed(`/api/levels/${encodeURIComponent(id)}/report`, { reason });
  },
};
