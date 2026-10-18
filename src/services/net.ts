import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { CONFIG } from '../config';
import { Emitter } from '../core/emitter';
import type { EditOp } from '../editor/doc';
import { quickLine } from '../meta/quickchat';
import { validEmote } from '../meta/emotes';
import { isAllowedName } from '../meta/names-policy';
import { safeCard, type ProfileCard } from '../meta/profile';
import { SKINS } from '../meta/catalog';

/**
 * Online rooms joined with a 4-character code. Two kinds:
 *  - race:  "Play with Friends" — race a generated course together.
 *  - build: co-op level building — everyone edits one level, then races it.
 * The host relays everything (star topology) and orders every level edit.
 * Only generated names, skins, positions, level edits and Quick Chat indexes
 * travel peer-to-peer; free-text chat never does (see services/chat.ts).
 */
export const PROTOCOL_VERSION = 3;
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
  /** Game-only profile card (badges, title, numbers). */
  card?: ProfileCard;
}

let localCard: () => ProfileCard | undefined = () => undefined;
/** Where rooms get this player's profile card from. */
export function setLocalCard(fn: () => ProfileCard | undefined): void {
  localCard = fn;
}

/** Host room safety: this device's anonymous room id, and the host's ban list. */
const guards = { rid: (): string => '', banned: (_rid: string): boolean => false };
export function setRoomGuards(g: Partial<typeof guards>): void {
  Object.assign(guards, g);
}

const RID_RE = /^[a-f0-9]{16}$/;
/** A removed player can't come back for this long (a ban is for good). */
const KICK_BLOCK_MS = 10 * 60_000;

/** Compact racer state: [id, x, y, rot, modeIndex, flags, speed]. */
export type NetState = [string, number, number, number, number, number, number];

/** What the host picked for the next race (shown to everyone in the lobby). */
export interface TrackInfo {
  /** -1 random world, 0-5 a world, 6 a player-made level. */
  w: number;
  /** Level name indexes when w = 6. */
  name?: [number, number];
}

export function safeTrack(t: unknown): TrackInfo {
  if (!t || typeof t !== 'object') return { w: -1 };
  const r = t as Record<string, unknown>;
  const w = typeof r.w === 'number' && Number.isInteger(r.w) && r.w >= -1 && r.w <= 6 ? r.w : -1;
  const nm = Array.isArray(r.name) && r.name.length === 2 && r.name.every((n) => Number.isInteger(n) && n >= 0 && n < 256) ? ([r.name[0], r.name[1]] as [number, number]) : undefined;
  return w === 6 && nm ? { w, name: nm } : { w: w === 6 ? -1 : w };
}

export type NetMsg =
  /** `rid`: an anonymous id that stays the same for this device (lets a host ban someone). Only the host sees it. */
  | { t: 'hello'; v: number; name: string; skin: string; card?: ProfileCard; rid?: string }
  | { t: 'welcome'; you: string; players: NetPlayer[]; kind: RoomKind; chat: string; lock: boolean; pub?: boolean; level?: string; rev?: number; authors?: string[]; paused?: string[] }
  /** `paused`: build rooms, players the host stopped from building. */
  | { t: 'lobby'; players: NetPlayer[]; racing: boolean; pub?: boolean; track?: TrackInfo; paused?: string[] }
  | { t: 'reject'; reason: 'full' | 'version' | 'started' | 'closed' | 'banned' }
  | { t: 'chatkey'; key: string }
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
  | { t: 'emo'; n: number; id?: string }
  | { t: 'bye' };

export interface RoomEvents extends Record<string, unknown> {
  lobby: NetPlayer[];
  start: { seed: number; players: NetPlayer[]; delay: number; level?: string };
  snap: NetState[];
  fx: { from: string; kind: 'snow'; x: number };
  finish: { id: string; time: number };
  results: { id: string; time: number | null }[];
  closed: { reason: string };
  /** The race ended: back to building (build rooms) or to the lobby (race rooms). */
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
  emote: { id: string; n: number };
  /** The room's Free Chat channel moved (after someone was removed). */
  chatKey: string;
}

export interface HostOptions {
  kind: RoomKind;
  /** Build rooms: current level code + revision for new builders. */
  snapshot?: () => { code: string; rev: number; authors: string[] };
}

/** Shown instead of anything that isn't a generated racer name. */
export const FALLBACK_NAME = 'Mystery Polygon';

/** Only generated names travel between players: anything else (a modified client) is replaced. */
export function safeName(name: unknown): string {
  return isAllowedName(name) ? name : FALLBACK_NAME;
}

function safeSkin(skin: unknown): string {
  return typeof skin === 'string' && SKINS.some((s) => s.id === skin) ? skin : 'classic';
}

function safeIds(v: unknown): Set<string> {
  return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length < 80).slice(0, 8) : []);
}

/** Clean a player list received from the host. */
export function safePlayers(list: unknown): NetPlayer[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 8).flatMap((p): NetPlayer[] => {
    if (!p || typeof p !== 'object' || typeof (p as NetPlayer).id !== 'string') return [];
    const q = p as NetPlayer;
    return [{ id: q.id.slice(0, 64), name: safeName(q.name), skin: safeSkin(q.skin), host: q.host === true, color: Number.isInteger(q.color) ? Math.abs(q.color) % 4 : 0, card: safeCard(q.card) }];
  });
}

/** Generated names only, at most 4. */
export function safeAuthors(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((a): a is string => isAllowedName(a)).slice(0, 4) : [];
}

function validState(s: unknown): s is NetState {
  return Array.isArray(s) && s.length === 7 && s.slice(1).every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6);
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
  /** Listed for strangers (Quick Match / public build rooms). Shown to everyone in the room. */
  publicRoom = false;
  /** Next race's track (host decides; everyone sees it). */
  track: TrackInfo = { w: -1 };
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
  private buckets = new Map<string, { ops: Bucket; cur: Bucket; qc: Bucket; st: Bucket; fx: Bucket; em: Bucket }>();
  private joinBlockedUntil = 0;
  private kicked = new Set<string>();
  /** Host: each player's anonymous room id, and room ids removed recently. */
  private rids = new Map<string, string>();
  private blockedRids = new Map<string, number>();
  /** Build rooms: players who may not build (host's choice). */
  paused = new Set<string>();
  /** Host: new joiners start unable to build until allowed (on for public rooms). */
  newPlayersPaused = false;

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
        room.players = [{ id: peer.id, name, skin, host: true, color: 0, card: localCard() }];
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
        const rid = guards.rid();
        conn.send({ t: 'hello', v: PROTOCOL_VERSION, name, skin, card: localCard(), ...(RID_RE.test(rid) ? { rid } : {}) } satisfies NetMsg);
      });
      conn.on('data', (data) => {
        const msg = data as NetMsg;
        if (msg.t === 'welcome') {
          clearTimeout(timer);
          peer.off('error', onError);
          room.localId = String(msg.you);
          room.players = safePlayers(msg.players);
          room.kind = msg.kind === 'build' ? 'build' : 'race';
          room.chatKey = typeof msg.chat === 'string' ? msg.chat.slice(0, 64) : '';
          room.locked = Boolean(msg.lock);
          room.publicRoom = msg.pub === true;
          room.paused = safeIds(msg.paused);
          if (room.kind === 'build' && typeof msg.level === 'string') room.joinLevel = { code: msg.level, rev: msg.rev ?? 0, authors: safeAuthors(msg.authors) };
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
                  : msg.reason === 'banned'
                  ? 'The host of that room has blocked you from joining.'
                  : msg.reason === 'closed'
                    ? 'That room isn’t taking new players right now.'
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
      b = { ops: new Bucket(80, 400), cur: new Bucket(25, 30), qc: new Bucket(1, 3), st: new Bucket(30, 40), fx: new Bucket(3, 5), em: new Bucket(1, 4) };
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
        if (member || this.kicked.has(from)) return; // one hello per connection
        if (msg.v !== PROTOCOL_VERSION) return void conn.send({ t: 'reject', reason: 'version' } satisfies NetMsg);
        const rid = typeof msg.rid === 'string' && RID_RE.test(msg.rid) ? msg.rid : '';
        if (rid && guards.banned(rid)) return void conn.send({ t: 'reject', reason: 'banned' } satisfies NetMsg);
        if (rid && (this.blockedRids.get(rid) ?? 0) > performance.now()) return void conn.send({ t: 'reject', reason: 'closed' } satisfies NetMsg);
        if (this.racing) return void conn.send({ t: 'reject', reason: 'started' } satisfies NetMsg);
        // Just removed someone on an old version (no room id): no unknown joiners for a bit.
        if (!rid && performance.now() < this.joinBlockedUntil) return void conn.send({ t: 'reject', reason: 'closed' } satisfies NetMsg);
        if (this.players.length >= CONFIG.net.maxPlayers) return void conn.send({ t: 'reject', reason: 'full' } satisfies NetMsg);
        this.conns.set(from, conn);
        const used = new Set(this.players.map((p) => p.color));
        const color = [0, 1, 2, 3].find((c) => !used.has(c)) ?? 0;
        this.players.push({ id: from, name: safeName(msg.name), skin: safeSkin(msg.skin), host: false, color, card: safeCard(msg.card) });
        if (rid) this.rids.set(from, rid);
        if (this.kind === 'build' && this.newPlayersPaused) this.paused.add(from);
        const welcome: NetMsg = { t: 'welcome', you: from, players: this.players, kind: this.kind, chat: this.chatKey, lock: this.locked, pub: this.publicRoom, paused: [...this.paused] };
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
        if (!member || !validState(msg.s) || !this.bucket(from).st.take()) return;
        msg.s[0] = from; // never trust the sender's id
        this.states.set(from, msg.s);
        break;
      case 'fx':
        if (!member || !this.bucket(from).fx.take()) return;
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
        if (this.locked || this.paused.has(from) || msg.ops.length > MAX_OPS_PER_MSG || !this.bucket(from).ops.take(msg.ops.length)) {
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
      case 'emo': {
        if (!member || !validEmote(msg.n) || !this.bucket(from).em.take()) return;
        this.broadcast({ t: 'emo', n: msg.n, id: from }, from);
        this.emit('emote', { id: from, n: msg.n });
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
    this.paused.delete(id);
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
    this.broadcast({ t: 'lobby', players: this.players, racing: this.racing, pub: this.publicRoom, track: this.track, paused: [...this.paused] });
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
  /** Host: mark the room public or private (tells everyone in it). */
  setPublic(pub: boolean): void {
    if (!this.isHost || this.publicRoom === pub) return;
    this.publicRoom = pub;
    this.broadcastLobby();
  }

  /** Host: choose the next race's track (shown in everyone's lobby). */
  setTrack(track: TrackInfo): void {
    if (!this.isHost) return;
    this.track = safeTrack(track);
    this.broadcastLobby();
  }

  startRace(level?: string, world = -1): void {
    if (!this.isHost || this.racing) return;
    this.racing = true;
    this.finishes.clear();
    this.states.clear();
    let seed = (Math.random() * 2 ** 31) >>> 0;
    // The track's colours come from seed % 6: pick a world by choosing the seed.
    if (world >= 0 && world < 6) seed = seed - (seed % 6) + world;
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
    {
      // Back to the lobby (or to building): the room stays open for rematches.
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

  /** Host: let a player build, or stop them (their edits are refused). */
  setCanBuild(id: string, can: boolean): void {
    if (!this.isHost || id === this.localId) return;
    if (can) this.paused.delete(id);
    else this.paused.add(id);
    this.broadcastLobby();
  }

  canBuild(id = this.localId): boolean {
    return !this.paused.has(id);
  }

  /**
   * Host: ban a player from your rooms for good. Returns what to keep on the
   * ban list (their anonymous room id), or null for an old version without one
   * (they're still removed).
   */
  ban(id: string): { rid: string; name: string } | null {
    const rid = this.rids.get(id);
    const name = this.player(id)?.name ?? 'Player';
    this.kick(id);
    return rid ? { rid, name } : null;
  }

  /**
   * Host: remove a player. They can't rejoin for 10 minutes (players on an
   * old version without a room id: nobody new for two minutes), and the
   * room's Free Chat channel moves to a new key only the others get.
   */
  kick(id: string): void {
    if (!this.isHost || id === this.localId) return;
    this.sendTo(id, { t: 'kick' });
    this.kicked.add(id);
    const rid = this.rids.get(id);
    if (rid) this.blockedRids.set(rid, performance.now() + KICK_BLOCK_MS);
    else this.joinBlockedUntil = performance.now() + 120_000;
    setTimeout(() => {
      this.dropPeer(id);
      this.chatKey = randomKey();
      this.broadcast({ t: 'chatkey', key: this.chatKey });
      this.emit('chatKey', this.chatKey);
    }, 120);
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
        this.players = safePlayers(msg.players);
        this.racing = Boolean(msg.racing);
        this.publicRoom = msg.pub === true;
        this.track = safeTrack(msg.track);
        this.paused = safeIds(msg.paused);
        this.emit('lobby', this.players);
        if (wasRacing && !this.racing) this.emit('raceOver', undefined);
        break;
      }
      case 'start':
        this.racing = true;
        this.players = safePlayers(msg.players);
        this.emit('start', { seed: Number(msg.seed) >>> 0, players: this.players, delay: Math.min(5000, Math.max(0, Number(msg.delay) || 0)), level: typeof msg.level === 'string' ? msg.level : undefined });
        break;
      case 'snap':
        if (Array.isArray(msg.p)) this.emit('snap', msg.p.filter(validState).slice(0, 8));
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
        if (typeof msg.code === 'string') this.emit('level', { code: msg.code, rev: Number(msg.rev) || 0, authors: safeAuthors(msg.authors) });
        break;
      case 'cur':
        if (msg.id) this.emit('cursor', { id: msg.id, x: msg.x, y: msg.y, tool: msg.tool });
        break;
      case 'lock':
        this.locked = Boolean(msg.on);
        this.emit('lock', this.locked);
        break;
      case 'authors':
        this.emit('authors', safeAuthors(msg.list));
        break;
      case 'chatkey':
        if (typeof msg.key === 'string' && msg.key.length >= 16) {
          this.chatKey = msg.key.slice(0, 64);
          this.emit('chatKey', this.chatKey);
        }
        break;
      case 'qc':
        if (msg.id && quickLine(msg.n)) this.emit('quick', { id: msg.id, n: msg.n });
        break;
      case 'emo':
        if (typeof msg.id === 'string' && validEmote(msg.n)) this.emit('emote', { id: msg.id, n: msg.n });
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

  sendEmote(n: number): void {
    if (!validEmote(n)) return;
    if (this.isHost) {
      this.broadcast({ t: 'emo', n, id: this.localId });
      this.emit('emote', { id: this.localId, n });
    } else if (this.hostConn?.open) {
      this.hostConn.send({ t: 'emo', n } satisfies NetMsg);
      this.emit('emote', { id: this.localId, n });
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
