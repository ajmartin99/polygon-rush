import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { CONFIG } from '../config';
import { Emitter } from '../core/emitter';
import type { EditOp } from '../editor/doc';
import { quickLine } from '../meta/quickchat';

/**
 * Online rooms joined with a 4-character code. Two kinds:
 *  - race:  "Play with Friends" — race a generated course together.
 *  - build: co-op level building — everyone edits one level, then races it.
 * The host relays everything (star topology) and orders every level edit.
 * Only generated names, skins, positions, level edits and Quick Chat indexes
 * travel peer-to-peer; free-text chat never does (see services/chat.ts).
 */
export const PROTOCOL_VERSION = 2;
export const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';
export const CODE_LENGTH = 4;

export type RoomKind = 'race' | 'build';

export interface NetPlayer {
  id: string;
  name: string;
  skin: string;
  host: boolean;
  /** Cursor / name-tag colour (0..3). */
  color: number;
}

/** Compact racer state: [id, x, y, rot, modeIndex, flags, speed]. */
export type NetState = [string, number, number, number, number, number, number];

export type NetMsg =
  | { t: 'hello'; v: number; name: string; skin: string }
  | { t: 'welcome'; you: string; players: NetPlayer[]; kind: RoomKind; chat: string; lock: boolean; level?: string; rev?: number; authors?: string[] }
  | { t: 'lobby'; players: NetPlayer[]; racing: boolean }
  | { t: 'reject'; reason: 'full' | 'version' | 'started' }
  | { t: 'start'; seed: number; players: NetPlayer[]; delay: number; level?: string }
  | { t: 'st'; s: NetState }
  | { t: 'snap'; p: NetState[] }
  | { t: 'fx'; from: string; kind: 'snow'; x: number }
  | { t: 'fin'; id: string; time: number }
  | { t: 'quit' }
  | { t: 'results'; order: { id: string; time: number | null }[] }
  | { t: 'ops'; seq: number; ops: EditOp[]; by?: string; rev?: number }
  | { t: 'sync' }
  | { t: 'level'; code: string; rev: number; authors: string[] }
  | { t: 'cur'; x: number; y: number; tool: number; id?: string }
  | { t: 'lock'; on: boolean }
  | { t: 'authors'; list: string[] }
  | { t: 'kick' }
  | { t: 'qc'; n: number; id?: string }
  | { t: 'bye' };

export interface RoomEvents extends Record<string, unknown> {
  lobby: NetPlayer[];
  start: { seed: number; players: NetPlayer[]; delay: number; level?: string };
  snap: NetState[];
  fx: { from: string; kind: 'snow'; x: number };
  finish: { id: string; time: number };
  results: { id: string; time: number | null }[];
  closed: { reason: string };
  /** Build rooms: the race ended, back to building. */
  raceOver: void;
  /** Ordered level edits (clients; the host gets `clientOps`). */
  ops: { by: string; seq: number; ops: EditOp[]; rev: number };
  /** Host only: a builder sent edits to be ordered. */
  clientOps: { from: string; seq: number; ops: EditOp[] };
  /** Host only: a builder needs the whole level again. */
  syncRequest: { from: string };
  /** Clients: the whole level (resync). */
  level: { code: string; rev: number; authors: string[] };
  cursor: { id: string; x: number; y: number; tool: number };
  lock: boolean;
  authors: string[];
  quick: { id: string; n: number };
}

export interface HostOptions {
  kind: RoomKind;
  /** Build rooms: current level code + revision for new builders. */
  snapshot?: () => { code: string; rev: number; authors: string[] };
}

export function randomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

function randomKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'[b & 63]).join('');
}

/** The signalling server: our own community server when configured, else the PeerJS cloud. */
function peerOptions(): PeerOptions {
  const n = CONFIG.net;
  const iceServers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (n.turnUrl) iceServers.push({ urls: n.turnUrl, username: n.turnUsername, credential: n.turnCredential });
  const opts: PeerOptions = { debug: 0, config: { iceServers } };
  if (n.host) opts.host = n.host;
  if (n.port) opts.port = n.port;
  if (n.path) opts.path = n.path;
  if (n.key) opts.key = n.key;
  if (n.secure !== undefined) opts.secure = n.secure;
  return opts;
}

export function friendlyNetError(e: unknown): string {
  const type = (e as { type?: string })?.type ?? '';
  switch (type) {
    case 'peer-unavailable':
      return 'Room not found. Check the code and try again!';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Can’t reach the game server. Check your internet connection.';
    case 'browser-incompatible':
    case 'webrtc':
      return 'Online play isn’t supported on this device.';
    default:
      return (e as Error)?.message || 'Something went wrong. Please try again.';
  }
}

/** Simple per-sender token bucket so one peer can't flood the room. */
class Bucket {
  private tokens: number;
  private last = performance.now();
  constructor(
    private readonly rate: number,
    private readonly burst: number,
  ) {
    this.tokens = burst;
  }
  take(n = 1): boolean {
    const now = performance.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

const MAX_OPS_PER_MSG = 300;

export class NetRoom extends Emitter<RoomEvents> {
  readonly isHost: boolean;
  kind: RoomKind = 'race';
  code = '';
  localId = '';
  players: NetPlayer[] = [];
  /** A race is running (race rooms never go back to the lobby). */
  racing = false;
  /** Build rooms: only the host may edit. */
  locked = false;
  /** Shared secret naming this room's free-chat channel on the community server. */
  chatKey = '';
  /** Level handed over on join (build rooms). */
  joinLevel: { code: string; rev: number; authors: string[] } | null = null;
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private states = new Map<string, NetState>();
  private snapTimer = 0;
  private finishes = new Map<string, number>();
  private resultsTimer = 0;
  private closed = false;
  private rev = 0;
  private snapshot: HostOptions['snapshot'];
  private buckets = new Map<string, { ops: Bucket; cur: Bucket; qc: Bucket }>();
  private kicked = new Set<string>();

  private constructor(isHost: boolean) {
    super();
    this.isHost = isHost;
  }

  /** Back-compat: race rooms reject joiners once started. */
  get started(): boolean {
    return this.racing;
  }

  get open(): boolean {
    return !this.closed;
  }

  // -------------------------------------------------------------- creation
  static async host(name: string, skin: string, opts: HostOptions = { kind: 'race' }): Promise<NetRoom> {
    const room = new NetRoom(true);
    room.kind = opts.kind;
    room.snapshot = opts.snapshot;
    room.chatKey = randomKey();
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomCode();
      try {
        const peer = await openPeer(CONFIG.net.roomPrefix + code);
        room.peer = peer;
        room.code = code;
        room.localId = peer.id;
        room.players = [{ id: peer.id, name, skin, host: true, color: 0 }];
        room.wireHost();
        return room;
      } catch (e) {
        lastErr = e;
        if ((e as { type?: string }).type !== 'unavailable-id') break;
      }
    }
    throw new Error(friendlyNetError(lastErr));
  }

  static async join(code: string, name: string, skin: string): Promise<NetRoom> {
    const room = new NetRoom(false);
    room.code = code;
    let peer: Peer;
    try {
      peer = await openPeer();
    } catch (e) {
      throw new Error(friendlyNetError(e));
    }
    room.peer = peer;
    room.localId = peer.id;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Room not found. Check the code and try again!'));
      }, 12000);
      const onError = (e: unknown) => {
        clearTimeout(timer);
        reject(new Error(friendlyNetError(e)));
      };
      peer.once('error', onError);
      const conn = peer.connect(CONFIG.net.roomPrefix + code, { reliable: true, serialization: 'json' });
      room.hostConn = conn;
      conn.on('open', () => {
        conn.send({ t: 'hello', v: PROTOCOL_VERSION, name, skin } satisfies NetMsg);
      });
      conn.on('data', (data) => {
        const msg = data as NetMsg;
        if (msg.t === 'welcome') {
          clearTimeout(timer);
          peer.off('error', onError);
          room.localId = msg.you;
          room.players = msg.players;
          room.kind = msg.kind === 'build' ? 'build' : 'race';
          room.chatKey = typeof msg.chat === 'string' ? msg.chat.slice(0, 64) : '';
          room.locked = Boolean(msg.lock);
          if (room.kind === 'build' && typeof msg.level === 'string') room.joinLevel = { code: msg.level, rev: msg.rev ?? 0, authors: msg.authors ?? [] };
          room.wireClient();
          resolve();
        } else if (msg.t === 'reject') {
          clearTimeout(timer);
          reject(
            new Error(
              msg.reason === 'full'
                ? 'That room is full (4 players max).'
                : msg.reason === 'started'
                  ? 'That room is racing right now. Try again in a minute!'
                  : 'Your friend has a different game version. Update both apps!',
            ),
          );
        } else {
          room.handleClient(msg);
        }
      });
    }).catch((e) => {
      room.leave();
      throw e;
    });
    return room;
  }

  // -------------------------------------------------------------- host side
  private wireHost(): void {
    const peer = this.peer!;
    peer.on('connection', (conn) => {
      conn.on('data', (data) => this.handleHost(conn, data as NetMsg));
      conn.on('close', () => this.dropPeer(conn.peer));
      conn.on('error', () => this.dropPeer(conn.peer));
    });
    peer.on('disconnected', () => {
      // Lost the signalling server; existing data channels keep working.
      if (!this.closed && (this.kind === 'build' || !this.racing)) peer.reconnect();
    });
  }

  private bucket(id: string) {
    let b = this.buckets.get(id);
    if (!b) {
      b = { ops: new Bucket(80, 400), cur: new Bucket(25, 30), qc: new Bucket(1, 3) };
      this.buckets.set(id, b);
    }
    return b;
  }

  private handleHost(conn: DataConnection, msg: NetMsg): void {
    if (!msg || typeof msg !== 'object') return;
    const from = conn.peer;
    const member = this.conns.has(from);
    switch (msg.t) {
      case 'hello': {
        if (this.kicked.has(from)) return void conn.close();
        if (msg.v !== PROTOCOL_VERSION) return void conn.send({ t: 'reject', reason: 'version' } satisfies NetMsg);
        if (this.racing) return void conn.send({ t: 'reject', reason: 'started' } satisfies NetMsg);
        if (this.players.length >= CONFIG.net.maxPlayers) return void conn.send({ t: 'reject', reason: 'full' } satisfies NetMsg);
        this.conns.set(from, conn);
        const used = new Set(this.players.map((p) => p.color));
        const color = [0, 1, 2, 3].find((c) => !used.has(c)) ?? 0;
        this.players.push({ id: from, name: String(msg.name).slice(0, 32), skin: String(msg.skin).slice(0, 24), host: false, color });
        const welcome: NetMsg = { t: 'welcome', you: from, players: this.players, kind: this.kind, chat: this.chatKey, lock: this.locked };
        if (this.kind === 'build' && this.snapshot) {
          const snap = this.snapshot();
          welcome.level = snap.code;
          welcome.rev = this.rev;
          welcome.authors = snap.authors;
        }
        conn.send(welcome);
        this.broadcastLobby();
        break;
      }
      case 'st':
        if (!member || !Array.isArray(msg.s)) return;
        msg.s[0] = from; // never trust the sender's id
        this.states.set(from, msg.s);
        break;
      case 'fx':
        if (!member) return;
        this.broadcast({ t: 'fx', from, kind: 'snow', x: Number(msg.x) || 0 });
        this.emit('fx', { from, kind: 'snow', x: Number(msg.x) || 0 });
        break;
      case 'fin':
        if (member) this.recordFinish(from, Number(msg.time));
        break;
      case 'quit':
        if (member && this.racing) this.recordFinish(from, Infinity);
        break;
      case 'ops': {
        if (!member || this.kind !== 'build' || this.racing || !Array.isArray(msg.ops)) return;
        const seq = Number(msg.seq) || 0;
        if (this.locked || msg.ops.length > MAX_OPS_PER_MSG || !this.bucket(from).ops.take(msg.ops.length)) {
          // Echo with no ops so the builder's preview rolls back.
          this.sendTo(from, { t: 'ops', seq, ops: [], by: from, rev: this.rev });
          return;
        }
        this.emit('clientOps', { from, seq, ops: msg.ops });
        break;
      }
      case 'sync':
        if (member && this.kind === 'build') this.emit('syncRequest', { from });
        break;
      case 'cur': {
        if (!member || !this.bucket(from).cur.take()) return;
        const cur = { t: 'cur' as const, id: from, x: Number(msg.x) || 0, y: Number(msg.y) || 0, tool: Number(msg.tool) || 0 };
        this.broadcast(cur, from);
        this.emit('cursor', { id: from, x: cur.x, y: cur.y, tool: cur.tool });
        break;
      }
      case 'qc': {
        if (!member || !quickLine(msg.n) || !this.bucket(from).qc.take()) return;
        // The sender already shows their own line.
        this.broadcast({ t: 'qc', n: msg.n, id: from }, from);
        this.emit('quick', { id: from, n: msg.n });
        break;
      }
      case 'bye':
        this.dropPeer(from);
        break;
      default:
        break;
    }
  }

  private dropPeer(id: string): void {
    const conn = this.conns.get(id);
    if (!conn && !this.players.some((p) => p.id === id && !p.host)) return;
    this.conns.delete(id);
    this.buckets.delete(id);
    conn?.close();
    if (!this.racing || this.kind === 'build') {
      this.players = this.players.filter((p) => p.id !== id);
      this.broadcastLobby();
    }
    if (this.racing) {
      this.states.delete(id);
      this.maybeFinishRace();
    }
  }

  private broadcastLobby(): void {
    this.broadcast({ t: 'lobby', players: this.players, racing: this.racing });
    this.emit('lobby', this.players);
  }

  private broadcast(msg: NetMsg, except?: string): void {
    for (const [id, c] of this.conns) {
      if (id !== except && c.open) c.send(msg);
    }
  }

  private sendTo(id: string, msg: NetMsg): void {
    const c = this.conns.get(id);
    if (c?.open) c.send(msg);
  }

  /** Host: start a race for everyone (build rooms pass the level code). */
  startRace(level?: string): void {
    if (!this.isHost || this.racing) return;
    this.racing = true;
    this.finishes.clear();
    this.states.clear();
    const seed = (Math.random() * 2 ** 31) >>> 0;
    const msg: NetMsg = { t: 'start', seed, players: this.players, delay: 600, level };
    this.broadcast(msg);
    this.emit('start', { seed, players: this.players, delay: 600, level });
    this.snapTimer = window.setInterval(() => {
      const p = [...this.states.values()];
      if (p.length) this.broadcast({ t: 'snap', p });
      this.emit('snap', p);
    }, 66);
  }

  private recordFinish(id: string, time: number): void {
    if (!this.racing || this.finishes.has(id)) return;
    this.finishes.set(id, Number.isFinite(time) ? time : Infinity);
    if (Number.isFinite(time)) {
      this.broadcast({ t: 'fin', id, time });
      this.emit('finish', { id, time });
    }
    if (!this.resultsTimer) this.resultsTimer = window.setTimeout(() => this.sendResults(), 25000);
    this.maybeFinishRace();
  }

  private maybeFinishRace(): void {
    const active = this.players.filter((p) => p.host || this.conns.has(p.id));
    if (active.every((p) => this.finishes.has(p.id))) this.sendResults();
  }

  private sendResults(): void {
    if (!this.isHost || !this.racing) return;
    clearTimeout(this.resultsTimer);
    this.resultsTimer = 0;
    clearInterval(this.snapTimer);
    const time = (id: string) => {
      const t = this.finishes.get(id);
      return t === undefined || !Number.isFinite(t) ? null : t;
    };
    const order = this.players.map((p) => ({ id: p.id, time: time(p.id) })).sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
    this.broadcast({ t: 'results', order });
    this.emit('results', order);
    if (this.kind === 'build') {
      // Back to building: the room stays open for more edits and races.
      this.racing = false;
      this.states.clear();
      this.players = this.players.filter((p) => p.host || this.conns.has(p.id));
      this.broadcastLobby();
      this.emit('raceOver', undefined);
    }
  }

  // -------------------------------------------------------------- build API (host)
  /** Host: how new builders get the current level. */
  setSnapshot(fn: NonNullable<HostOptions['snapshot']>): void {
    this.snapshot = fn;
  }

  /** Host: publish ordered edits (`by` = who made them, `seq` = their edit number). */
  publishOps(by: string, seq: number, ops: EditOp[]): void {
    if (!this.isHost) return;
    this.rev++;
    this.broadcast({ t: 'ops', seq, ops, by, rev: this.rev });
  }

  sendLevel(to: string, code: string, authors: string[]): void {
    this.sendTo(to, { t: 'level', code, rev: this.rev, authors });
  }

  setLock(on: boolean): void {
    if (!this.isHost) return;
    this.locked = on;
    this.broadcast({ t: 'lock', on });
    this.emit('lock', on);
  }

  setAuthors(list: string[]): void {
    if (this.isHost) this.broadcast({ t: 'authors', list });
  }

  /** Host: remove a player (they can't rejoin this room). */
  kick(id: string): void {
    if (!this.isHost || id === this.localId) return;
    this.sendTo(id, { t: 'kick' });
    this.kicked.add(id);
    setTimeout(() => this.dropPeer(id), 120);
  }

  // -------------------------------------------------------------- client side
  private wireClient(): void {
    const conn = this.hostConn!;
    conn.on('close', () => this.close('The host left the room.'));
    conn.on('error', () => this.close('Lost connection to the room.'));
    this.peer?.on('error', () => {
      /* handled by connection close */
    });
  }

  private handleClient(msg: NetMsg): void {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'lobby': {
        const wasRacing = this.racing;
        this.players = msg.players;
        this.racing = Boolean(msg.racing);
        this.emit('lobby', msg.players);
        if (wasRacing && !this.racing && this.kind === 'build') this.emit('raceOver', undefined);
        break;
      }
      case 'start':
        this.racing = true;
        this.players = msg.players;
        this.emit('start', { seed: msg.seed, players: msg.players, delay: msg.delay, level: msg.level });
        break;
      case 'snap':
        this.emit('snap', msg.p);
        break;
      case 'fx':
        this.emit('fx', { from: msg.from, kind: msg.kind, x: msg.x });
        break;
      case 'fin':
        this.emit('finish', { id: msg.id, time: msg.time });
        break;
      case 'results':
        this.emit('results', msg.order);
        break;
      case 'ops':
        if (Array.isArray(msg.ops)) this.emit('ops', { by: String(msg.by ?? ''), seq: Number(msg.seq) || 0, ops: msg.ops, rev: Number(msg.rev) || 0 });
        break;
      case 'level':
        this.emit('level', { code: msg.code, rev: msg.rev, authors: Array.isArray(msg.authors) ? msg.authors : [] });
        break;
      case 'cur':
        if (msg.id) this.emit('cursor', { id: msg.id, x: msg.x, y: msg.y, tool: msg.tool });
        break;
      case 'lock':
        this.locked = Boolean(msg.on);
        this.emit('lock', this.locked);
        break;
      case 'authors':
        if (Array.isArray(msg.list)) this.emit('authors', msg.list);
        break;
      case 'qc':
        if (msg.id && quickLine(msg.n)) this.emit('quick', { id: msg.id, n: msg.n });
        break;
      case 'kick':
        this.close('The host removed you from the room.');
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------- shared API
  sendState(s: NetState): void {
    if (this.isHost) {
      this.states.set(this.localId, s);
    } else if (this.hostConn?.open) {
      this.hostConn.send({ t: 'st', s } satisfies NetMsg);
    }
  }

  sendFx(kind: 'snow', x: number): void {
    if (this.isHost) {
      this.broadcast({ t: 'fx', from: this.localId, kind, x });
    } else if (this.hostConn?.open) {
      this.hostConn.send({ t: 'fx', from: this.localId, kind, x } satisfies NetMsg);
    }
  }

  sendFinish(time: number): void {
    if (this.isHost) this.recordFinish(this.localId, time);
    else if (this.hostConn?.open) this.hostConn.send({ t: 'fin', id: this.localId, time } satisfies NetMsg);
  }

  /** Left a build-room race early: don't make everyone wait. */
  sendQuit(): void {
    if (this.isHost) this.recordFinish(this.localId, Infinity);
    else if (this.hostConn?.open) this.hostConn.send({ t: 'quit' } satisfies NetMsg);
  }

  /** Client: send edits to the host to be ordered. */
  sendOps(seq: number, ops: EditOp[]): void {
    if (!this.isHost && this.hostConn?.open) this.hostConn.send({ t: 'ops', seq, ops } satisfies NetMsg);
  }

  requestSync(): void {
    if (!this.isHost && this.hostConn?.open) this.hostConn.send({ t: 'sync' } satisfies NetMsg);
  }

  sendCursor(x: number, y: number, tool: number): void {
    if (this.isHost) this.broadcast({ t: 'cur', id: this.localId, x, y, tool });
    else if (this.hostConn?.open) this.hostConn.send({ t: 'cur', x, y, tool } satisfies NetMsg);
  }

  sendQuick(n: number): void {
    if (!quickLine(n)) return;
    if (this.isHost) {
      this.broadcast({ t: 'qc', n, id: this.localId });
      this.emit('quick', { id: this.localId, n });
    } else if (this.hostConn?.open) {
      this.hostConn.send({ t: 'qc', n } satisfies NetMsg);
    }
  }

  player(id: string): NetPlayer | undefined {
    return this.players.find((p) => p.id === id);
  }

  private close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.snapTimer);
    clearTimeout(this.resultsTimer);
    this.emit('closed', { reason });
    this.destroy();
  }

  leave(): void {
    if (this.closed) return;
    try {
      if (this.isHost) this.broadcast({ t: 'bye' });
      else if (this.hostConn?.open) this.hostConn.send({ t: 'bye' } satisfies NetMsg);
    } catch {
      /* ignore */
    }
    this.closed = true;
    clearInterval(this.snapTimer);
    clearTimeout(this.resultsTimer);
    // Give the 'bye' a moment to flush.
    setTimeout(() => this.destroy(), 150);
  }

  private destroy(): void {
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    this.hostConn?.close();
    this.peer?.destroy();
    this.peer = null;
    this.clear();
  }
}

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    const timer = setTimeout(() => {
      peer.destroy();
      reject(Object.assign(new Error('timeout'), { type: 'network' }));
    }, 10000);
    peer.once('open', () => {
      clearTimeout(timer);
      resolve(peer);
    });
    peer.once('error', (e) => {
      clearTimeout(timer);
      peer.destroy();
      reject(e);
    });
  });
}
