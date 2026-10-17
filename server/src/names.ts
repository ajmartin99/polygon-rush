import { isGeneratedName } from '../../src/meta/names.ts';
import { checkDisplayText } from '../../src/shared/chat-filter.ts';
import type { Db } from './db.ts';

/**
 * Which racer names are allowed: generated names, or typed names (13+) that
 * pass the shared filter and haven't been banned by a moderator. A ban covers
 * every player with that name (all #tags); their app resets it on next sync.
 * Many players can share a name: players.ts tells them apart by #tag.
 */
export class NameRegistry {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  private banned(nameLc: string, now: number): boolean {
    const row = this.db.nameRow(nameLc);
    return Boolean(row && (row.banned_until === -1 || row.banned_until > now));
  }

  /** Generated names, or typed names that pass the filter and aren't banned. */
  allowed(name: unknown, now = Date.now()): name is string {
    if (typeof name !== 'string') return false;
    if (isGeneratedName(name)) return true;
    const r = checkDisplayText(name, 'name');
    return r.ok && r.text === name && !this.banned(name.toLowerCase(), now);
  }

  ban(name: string, days: number, reason: string | null, now = Date.now()): number {
    const until = days > 0 ? now + days * 86_400_000 : -1;
    this.db.banName(name, until, reason, now);
    return until;
  }

  unban(name: string): void {
    this.db.unbanName(name);
  }
}
