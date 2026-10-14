import { Emitter } from '../core/emitter';
import {
  canPlace,
  HEART_OPTIONS,
  LEVEL_SPEEDS,
  MAX_LENGTH,
  MAX_PIECES,
  MIN_LENGTH,
  samePiece,
  slotOf,
  slotX,
  sortPieces,
  THEME_COUNT,
  type LevelContent,
  type Piece,
} from '../game/level';

/** Level-wide settings that can be edited (and synced) like pieces. */
export interface LevelSettings {
  name: [number, number];
  theme: number;
  speed: number;
  hearts: number;
  length: number;
}

/** Set one slot (cell, pit or portal column) to a piece or clear it. */
export interface SlotOp {
  s: number;
  p: Piece | null;
}

export interface SettingsOp {
  set: Partial<LevelSettings>;
}

export type EditOp = SlotOp | SettingsOp;

export type Change =
  | { s: number; before: Piece | null; after: Piece | null }
  | { settings: true; before: LevelSettings; after: LevelSettings };

interface DocEvents extends Record<string, unknown> {
  change: Change[];
}

const isSlotOp = (op: EditOp): op is SlotOp => 's' in op;

function validSettings(set: Partial<LevelSettings>): boolean {
  const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
  if (set.theme !== undefined && (!int(set.theme) || set.theme < 0 || set.theme >= THEME_COUNT)) return false;
  if (set.speed !== undefined && (!int(set.speed) || set.speed < 0 || set.speed >= LEVEL_SPEEDS.length)) return false;
  if (set.hearts !== undefined && !(HEART_OPTIONS as readonly number[]).includes(set.hearts)) return false;
  if (set.length !== undefined && (!int(set.length) || set.length < MIN_LENGTH || set.length > MAX_LENGTH)) return false;
  if (set.name !== undefined && (!Array.isArray(set.name) || set.name.length !== 2 || !set.name.every((n) => int(n) && n >= 0 && n < 32))) return false;
  return true;
}

/**
 * The level being edited: a slot map plus settings. Every edit goes through
 * `apply`, which validates it and returns the exact changes (for undo, for
 * re-rendering and for the co-op rebase). Same ops in the same order always
 * give the same result on every device.
 */
export class LevelDoc extends Emitter<DocEvents> {
  settings: LevelSettings;
  authors: string[];
  private slots = new Map<number, Piece>();

  constructor(level: LevelContent) {
    super();
    this.settings = { name: [level.name[0], level.name[1]], theme: level.theme, speed: level.speed, hearts: level.hearts, length: level.length };
    this.authors = [...level.authors];
    for (const p of level.pieces) if (canPlace(p, level.length)) this.slots.set(slotOf(p), { ...p });
  }

  /** Replace everything (resync). */
  load(level: LevelContent): void {
    const fresh = new LevelDoc(level);
    this.settings = fresh.settings;
    this.authors = fresh.authors;
    this.slots = fresh.slots;
    this.emit('change', []);
  }

  get(slot: number): Piece | null {
    return this.slots.get(slot) ?? null;
  }

  get count(): number {
    return this.slots.size;
  }

  /** Rightmost used column (or -1). */
  lastColumn(): number {
    let m = -1;
    for (const s of this.slots.keys()) m = Math.max(m, slotX(s));
    return m;
  }

  pieces(): Piece[] {
    return [...this.slots.values()];
  }

  toContent(): LevelContent {
    return { ...this.settings, name: [this.settings.name[0], this.settings.name[1]], authors: [...this.authors], pieces: sortPieces(this.pieces().map((p) => ({ ...p }))) };
  }

  /** Apply ops in order; invalid ones are skipped. Returns what changed. */
  apply(ops: EditOp[], emit = true): Change[] {
    const changes: Change[] = [];
    for (const op of ops) {
      if (isSlotOp(op)) {
        const c = this.setSlot(op.s, op.p);
        if (c) changes.push(c);
      } else {
        if (!op.set || typeof op.set !== 'object' || !validSettings(op.set)) continue;
        const before = { ...this.settings, name: [...this.settings.name] as [number, number] };
        const after: LevelSettings = { ...before, ...op.set };
        if (after.length < before.length) {
          // Shrinking drops pieces past the new finish line (deterministically).
          for (const [s, p] of [...this.slots]) {
            if (p.x >= after.length) {
              this.slots.delete(s);
              changes.push({ s, before: p, after: null });
            }
          }
        }
        this.settings = after;
        changes.push({ settings: true, before, after: { ...after } });
      }
    }
    if (emit && changes.length) this.emit('change', changes);
    return changes;
  }

  /** Undo a list of changes exactly (no validation). */
  revert(changes: Change[], emit = true): void {
    for (let i = changes.length - 1; i >= 0; i--) {
      const c = changes[i];
      if ('settings' in c) this.settings = { ...c.before };
      else if (c.before) this.slots.set(c.s, c.before);
      else this.slots.delete(c.s);
    }
    if (emit && changes.length) this.emit('change', changes.map(flip).reverse());
  }

  private setSlot(s: number, p: Piece | null): Change | null {
    if (!Number.isInteger(s)) return null;
    const before = this.slots.get(s) ?? null;
    if (p) {
      if (typeof p !== 'object' || slotOf(p) !== s || !canPlace(p, this.settings.length)) return null;
      if (!before && this.slots.size >= MAX_PIECES) return null;
      if (samePiece(before, p)) return null;
      const copy: Piece = { t: p.t, x: p.x, y: p.y, v: p.v };
      this.slots.set(s, copy);
      return { s, before, after: copy };
    }
    if (!before) return null;
    this.slots.delete(s);
    return { s, before, after: null };
  }
}

function flip(c: Change): Change {
  return 'settings' in c ? { settings: true, before: c.after, after: c.before } : { s: c.s, before: c.after, after: c.before };
}

/**
 * Undo/redo of your own edits. In co-op, an undo only restores slots nobody
 * else has changed since, so it never wipes a friend's work.
 */
export class History {
  private undos: Change[][] = [];
  private redos: Change[][] = [];
  static readonly LIMIT = 200;

  /** `merge` folds a drag stroke into one undo step. */
  record(changes: Change[], merge = false): void {
    if (!changes.length) return;
    const last = this.undos[this.undos.length - 1];
    if (merge && last) {
      last.push(...changes);
      this.redos.length = 0;
      return;
    }
    this.undos.push(changes);
    if (this.undos.length > History.LIMIT) this.undos.shift();
    this.redos.length = 0;
  }

  get canUndo(): boolean {
    return this.undos.length > 0;
  }

  get canRedo(): boolean {
    return this.redos.length > 0;
  }

  /** Ops that undo the last edit (empty if nothing to do). */
  undo(doc: LevelDoc): { ops: EditOp[]; push: (changes: Change[]) => void } {
    const group = this.undos.pop();
    if (!group) return { ops: [], push: () => {} };
    return { ops: restoreOps(doc, group), push: (ch) => void (ch.length && this.redos.push(ch)) };
  }

  /** Redo replays the reverse of an undo (same rule: only untouched slots). */
  redo(doc: LevelDoc): { ops: EditOp[]; push: (changes: Change[]) => void } {
    const group = this.redos.pop();
    if (!group) return { ops: [], push: () => {} };
    return { ops: restoreOps(doc, group), push: (ch) => void (ch.length && this.undos.push(ch)) };
  }

  clear(): void {
    this.undos.length = 0;
    this.redos.length = 0;
  }
}

/** Ops putting each changed slot back to its `before`, newest change first. */
function restoreOps(doc: LevelDoc, group: Change[]): EditOp[] {
  const ops: EditOp[] = [];
  for (let i = group.length - 1; i >= 0; i--) {
    const c = group[i];
    if ('settings' in c) {
      ops.push({ set: { ...c.before, name: [c.before.name[0], c.before.name[1]] } });
    } else if (samePiece(doc.get(c.s), c.after)) {
      ops.push({ s: c.s, p: c.before });
    }
  }
  return ops;
}

/**
 * Co-op building: the host orders every edit. Your own edits show instantly
 * (pending) and are rebased on top of whatever the host sends, so everyone
 * always ends up with exactly the host's level.
 */
export class SyncedDoc {
  readonly doc: LevelDoc;
  private pending: { seq: number; ops: EditOp[]; changes: Change[] }[] = [];
  private seq = 0;

  constructor(doc: LevelDoc) {
    this.doc = doc;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** Apply your edit now; send `seq` with the ops so the host can echo it. */
  local(ops: EditOp[]): { seq: number; changes: Change[] } {
    const changes = this.doc.apply(ops);
    const seq = ++this.seq;
    this.pending.push({ seq, ops, changes });
    return { seq, changes };
  }

  /** Forget an edit that changed nothing (nothing to send or roll back). */
  discard(seq: number): void {
    this.pending = this.pending.filter((p) => p.seq !== seq || p.changes.length > 0);
  }

  /** Ops ordered by the host. `mine` = the echo of one of our edits. */
  remote(ops: EditOp[], mine: number | null): Change[] {
    const doc = this.doc;
    for (let i = this.pending.length - 1; i >= 0; i--) doc.revert(this.pending[i].changes, false);
    if (mine !== null) this.pending = this.pending.filter((p) => p.seq !== mine);
    const changes = doc.apply(ops, false);
    for (const p of this.pending) p.changes = doc.apply(p.ops, false);
    doc.emit('change', changes);
    return changes;
  }

  /** Full resync from the host (on join or after a hiccup). */
  reset(level: LevelContent): void {
    this.pending = [];
    this.doc.load(level);
  }
}
