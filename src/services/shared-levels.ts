import { contentOf, decodeLevel, encodeLevel, type LevelContent, type LevelData } from '../game/level';
import { store } from '../state/store';
import { friends } from './friends';

/**
 * Community levels on the game server: share a level you built and beat,
 * browse Trending and Highest Rated (everyone or friends), Suggested and
 * Newest, then play, rate thumbs up/down or report. Levels travel as share codes; the builder shows by racer name only.
 */
/** top = Highest Rated. */
export type SharedTab = 'top' | 'trending' | 'suggested' | 'new';
export type SharedScope = 'all' | 'friends' | 'mine';
export type ReportReason = 'mean_name' | 'impossible' | 'copied' | 'other';

export interface SharedLevel {
  id: string;
  content: LevelContent;
  author: string;
  plays: number;
  clears: number;
  likes: number;
  dislikes: number;
  liked: boolean;
  /** Your thumbs: 1 up, -1 down, 0 none. */
  vote: number;
  played: boolean;
  mine: boolean;
  friend: boolean;
  created: number;
  /** The builder has the Builder Pack (gold Pro Builder tag). */
  pro?: boolean;
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

/** Remember your highest-rated shared level (most thumbs up, then plays) for the Creator Spotlight. */
function noteTop(mine: SharedLevel[]): void {
  const best = [...mine].sort((a, b) => b.likes - a.likes || b.plays - a.plays)[0];
  const top = best ? { id: best.id, likes: best.likes, plays: best.plays } : { id: '', likes: 0, plays: 0 };
  const c = store.data.creator;
  if (top.id !== c.top.id || top.likes !== c.top.likes || top.plays !== c.top.plays) {
    store.data.creator = { ...c, top };
    store.commit();
  }
}

function decodeAll(raw: RawShared[]): SharedLevel[] {
  const levels: SharedLevel[] = [];
  for (const { code, ...rest } of raw) {
    try {
      levels.push({ ...rest, content: decodeLevel(code) });
    } catch {
      /* made by a newer version: skip */
    }
  }
  return levels;
}

export const sharedLevels = {
  async browse(tab: SharedTab, scope: SharedScope, offset = 0): Promise<{ levels: SharedLevel[]; more: boolean }> {
    const res = await friends.authed<{ levels: RawShared[]; more: boolean; stats: CreatorStats }>('/api/levels/browse', { tab, scope, offset });
    noteStats(res.stats);
    const levels = decodeAll(res.levels);
    if (scope === 'mine' && offset === 0 && !res.more) noteTop(levels);
    return { levels, more: res.more };
  },

  /** Refresh your creator numbers and top level (for the profile add-ons). */
  async refreshMine(): Promise<void> {
    await sharedLevels.browse('top', 'mine');
  },

  /** One shared level by id (a Creator Spotlight on someone's card). */
  async get(id: string): Promise<SharedLevel> {
    const res = await friends.authed<{ level: RawShared }>(`/api/levels/${encodeURIComponent(id)}/get`, {});
    const [level] = decodeAll([res.level]);
    if (!level) throw new Error('That level needs a newer version of the game.');
    return level;
  },

  /** Share (or update) one of your levels. */
  async publish(level: LevelData): Promise<{ id: string; updated: boolean }> {
    const out = await friends.authed<{ id: string; updated: boolean }>('/api/levels/publish', { localId: level.id, code: encodeLevel(level), ...(store.data.purchases.builder ? { pro: true } : {}) });
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

  vote(id: string, vote: -1 | 0 | 1): Promise<{ liked: boolean; vote: number; likes: number; dislikes: number }> {
    return friends.authed(`/api/levels/${encodeURIComponent(id)}/like`, { vote });
  },

  report(id: string, reason: ReportReason): Promise<{ hidden: boolean }> {
    return friends.authed(`/api/levels/${encodeURIComponent(id)}/report`, { reason });
  },
};
