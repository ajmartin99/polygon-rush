import { Emitter } from '../core/emitter';
import { contentOf, decodeLevel, encodeLevel, newLevelId, type LevelContent, type LevelData } from '../game/level';
import { levels } from '../state/levels';
import { store } from '../state/store';
import type { NetPlayer, NetRoom } from '../services/net';
import { quickLine } from '../meta/quickchat';
import { isAllowedName } from '../meta/names-policy';
import { ChatLog } from '../services/chatlog';
import { History, LevelDoc, SyncedDoc, type Change, type EditOp } from './doc';
import type { ToolId } from './tools';

export interface RemoteCursor {
  id: string;
  x: number;
  y: number;
  tool: number;
  at: number;
}

interface SessionEvents extends Record<string, unknown> {
  /** Level content changed (rebuild the world). */
  change: Change[];
  players: NetPlayer[];
  lock: boolean;
  closed: string;
  race: { seed: number; players: NetPlayer[]; delay: number; level: LevelContent };
  saved: LevelData;
}

export const PLAYER_COLORS = ['#ffd23f', '#3ad7ff', '#ff5fa2', '#3ee6b0'];

/** Edits that change how the level plays (and so un-verify it). */
function affectsPlay(c: Change): boolean {
  if (!('settings' in c)) return true;
  return c.before.length !== c.after.length || c.before.speed !== c.after.speed || c.before.hearts !== c.after.hearts;
}

/**
 * Everything about the level being edited that must survive a test run:
 * the document, undo history, camera, tool and (in co-op) the room.
 */
export class EditorSession extends Emitter<SessionEvents> {
  readonly doc: LevelDoc;
  readonly history = new History();
  /** Local copy's metadata (id, stats). */
  meta: LevelData;
  readonly room: NetRoom | null;
  private readonly sync: SyncedDoc | null;
  camX = -1;
  tool: ToolId = 'block';
  /** Remembered variant per tool (flip a spike once, keep placing flipped ones). */
  variants: Partial<Record<ToolId, number>> = {};
  readonly cursors = new Map<string, RemoteCursor>();
  readonly chat = new ChatLog();
  /** Co-op clients only save when they ask for a copy. */
  readonly autosave: boolean;
  /** Listed in public rooms (host) or joined from the public list. */
  publicRoom = false;
  /** Why the room closed (shown when you come back from a test run). */
  closedReason = 'The room closed.';
  private saveTimer = 0;
  private offs: (() => void)[] = [];
  private cleanups: (() => void)[] = [];
  private cursorAt = 0;
  private lastCursor = '';
  ended = false;

  private constructor(meta: LevelData, room: NetRoom | null, content: LevelContent) {
    super();
    this.meta = meta;
    this.room = room;
    this.doc = new LevelDoc(content);
    this.sync = room && !room.isHost ? new SyncedDoc(this.doc) : null;
    this.autosave = !room || room.isHost;
    this.offs.push(
      this.doc.on('change', (changes) => {
        if (!changes.length || changes.some(affectsPlay)) this.meta.verified = false;
        this.emit('change', changes);
        this.scheduleSave();
      }),
    );
    if (room) this.wireRoom(room);
  }

  static solo(level: LevelData): EditorSession {
    return new EditorSession(level, null, level);
  }

  /** Host a build room around one of your levels. */
  static host(level: LevelData, room: NetRoom): EditorSession {
    return new EditorSession(level, room, level);
  }

  /** Join someone's build room (the level arrives in the welcome). */
  static join(room: NetRoom): EditorSession {
    const content = decodeLevel(room.joinLevel?.code ?? '');
    content.authors = (room.joinLevel?.authors ?? content.authors).slice(0, 4);
    const now = Date.now();
    const meta: LevelData = { ...content, id: newLevelId(), created: now, updated: now, verified: false, best: 0, plays: 0, origin: 'coop' };
    return new EditorSession(meta, room, content);
  }

  get myName(): string {
    return store.data.profile.name || 'Rusher';
  }

  get canEdit(): boolean {
    return !this.room || this.room.isHost || (!this.room.locked && this.room.canBuild());
  }

  /** Current level as saved data. */
  level(): LevelData {
    return { ...this.meta, ...this.doc.toContent() };
  }

  // ------------------------------------------------------------ editing
  /** Apply your own edit (merge = part of the same drag stroke). */
  commit(ops: EditOp[], merge = false): Change[] {
    if (!ops.length || !this.canEdit || this.ended) return [];
    this.ensureAuthor(this.myName);
    let changes: Change[];
    if (this.sync) {
      const r = this.sync.local(ops);
      changes = r.changes;
      if (changes.length) this.room!.sendOps(r.seq, ops);
      else this.sync.discard(r.seq);
    } else {
      changes = this.doc.apply(ops);
      if (changes.length && this.room) this.room.publishOps(this.room.localId, 0, ops);
    }
    this.history.record(changes, merge);
    return changes;
  }

  undo(): boolean {
    const u = this.history.undo(this.doc);
    if (!u.ops.length) return false;
    u.push(this.commitRaw(u.ops));
    return true;
  }

  redo(): boolean {
    const r = this.history.redo(this.doc);
    if (!r.ops.length) return false;
    r.push(this.commitRaw(r.ops));
    return true;
  }

  private commitRaw(ops: EditOp[]): Change[] {
    if (this.sync) {
      const r = this.sync.local(ops);
      if (r.changes.length) this.room!.sendOps(r.seq, ops);
      else this.sync.discard(r.seq);
      return r.changes;
    }
    const changes = this.doc.apply(ops);
    if (changes.length && this.room) this.room.publishOps(this.room.localId, 0, ops);
    return changes;
  }

  private ensureAuthor(name: string): void {
    const a = this.doc.authors;
    if (!isAllowedName(name) || a.includes(name) || a.length >= 4) return;
    if (this.room && !this.room.isHost) return; // the host credits builders
    a.push(name);
    this.room?.setAuthors([...a]);
  }

  // ------------------------------------------------------------ saving
  private scheduleSave(): void {
    if (!this.autosave || this.ended) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 700);
  }

  /** Save to My Levels (autosave levels only). Returns false when storage is full. */
  save(): boolean {
    clearTimeout(this.saveTimer);
    if (!this.autosave) return true;
    const level = { ...this.level(), updated: Date.now() };
    const ok = levels.put(level);
    if (ok) {
      this.meta = { ...this.meta, updated: level.updated };
      this.emit('saved', level);
    }
    return ok;
  }

  /**
   * Keep your own copy of the room's level. You can edit it later only if you
   * helped build it (your name is in its builders); otherwise it's play-only.
   */
  saveCopy(): LevelData | null {
    const now = Date.now();
    const built = this.doc.authors.includes(this.myName);
    const copy: LevelData = { ...contentOf(this.doc.toContent()), id: newLevelId(), created: now, updated: now, verified: false, best: 0, plays: 0, origin: built ? 'coop' : 'code' };
    return levels.put(copy) ? copy : null;
  }

  /** Record a test run. */
  recordRun(completed: boolean, fromStart: boolean, progress: number): void {
    if (fromStart) this.meta.best = Math.max(this.meta.best, progress);
    if (completed && fromStart) this.meta.verified = true;
    if (this.autosave) this.save();
  }

  // ------------------------------------------------------------ co-op
  private wireRoom(room: NetRoom): void {
    const doc = this.doc;
    let couldBuild = room.canBuild();
    this.offs.push(
      room.on('lobby', (players) => {
        if (!room.isHost && room.canBuild() !== couldBuild) {
          couldBuild = room.canBuild();
          this.chat.system(couldBuild ? 'The host lets you build. Have fun!' : 'The host paused your building. You can still watch and chat.');
          this.emit('lock', room.locked);
        }
        for (const id of [...this.cursors.keys()]) if (!players.some((p) => p.id === id)) this.cursors.delete(id);
        this.emit('players', players);
      }),
      room.on('closed', ({ reason }) => {
        this.closedReason = reason;
        this.chat.system(reason);
        this.emit('closed', reason);
      }),
      room.on('lock', (on) => {
        this.chat.system(on ? 'The host paused building.' : 'Building is open again!');
        this.emit('lock', on);
      }),
      room.on('cursor', (c) => this.cursors.set(c.id, { ...c, at: performance.now() })),
      room.on('quick', ({ id, n }) => {
        const line = quickLine(n);
        const p = room.player(id);
        if (line && store.settings.quickChat) this.chat.push({ from: id, name: p?.name ?? 'Player', color: p?.color ?? 0, text: line.text, kind: 'quick', mine: id === room.localId });
      }),
      room.on('authors', (list) => {
        doc.authors = list.filter((a) => typeof a === 'string').slice(0, 4);
      }),
      room.on('start', ({ seed, players, delay, level }) => {
        try {
          const content = level ? decodeLevel(level) : doc.toContent();
          this.emit('race', { seed, players, delay, level: content });
        } catch {
          this.chat.system('Couldn’t load the race level.');
        }
      }),
    );
    if (room.isHost) {
      this.offs.push(
        room.on('clientOps', ({ from, seq, ops }) => {
          const changes = doc.apply(ops);
          if (changes.length) {
            const p = room.player(from);
            if (p) this.ensureAuthor(p.name);
          }
          room.publishOps(from, seq, ops);
        }),
        room.on('syncRequest', ({ from }) => room.sendLevel(from, encodeLevel(doc.toContent()), doc.authors)),
      );
    } else {
      this.offs.push(
        room.on('ops', ({ by, seq, ops }) => this.sync!.remote(ops, by === room.localId ? seq : null)),
        room.on('level', ({ code, authors }) => {
          try {
            const content = decodeLevel(code);
            content.authors = authors;
            this.sync!.reset(content);
          } catch {
            /* ignore a damaged resync */
          }
        }),
      );
    }
  }

  /** Throttled: share where you're pointing. */
  sendCursor(x: number, y: number, tool: number): void {
    if (!this.room || this.room.racing) return;
    const key = `${x},${y},${tool}`;
    const now = performance.now();
    if (key === this.lastCursor || now - this.cursorAt < 90) return;
    this.lastCursor = key;
    this.cursorAt = now;
    this.room.sendCursor(x, y, tool);
  }

  sendQuick(n: number): void {
    if (!this.room) return;
    this.room.sendQuick(n);
    if (!this.room.isHost) {
      // Show ours right away; the host doesn't echo to the sender.
      const line = quickLine(n);
      const me = this.room.player(this.room.localId);
      if (line) this.chat.push({ from: this.room.localId, name: this.myName, color: me?.color ?? 0, text: line.text, kind: 'quick', mine: true });
    }
  }

  /** Run when the session ends (e.g. close the Free Chat connection). */
  onEnd(fn: () => void): void {
    this.cleanups.push(fn);
  }

  /** Leave the editor for good: save and leave the room. */
  end(): void {
    if (this.ended) return;
    if (this.autosave) this.save();
    this.ended = true;
    for (const fn of this.cleanups.splice(0)) fn();
    clearTimeout(this.saveTimer);
    for (const off of this.offs.splice(0)) off();
    this.room?.leave();
    this.clear();
  }
}

let active: EditorSession | null = null;

export function activeEditor(): EditorSession | null {
  return active && !active.ended ? active : null;
}

export function setActiveEditor(s: EditorSession | null): void {
  if (active && active !== s) active.end();
  active = s;
}
