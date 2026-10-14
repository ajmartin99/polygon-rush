import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { CONFIG } from '../config';
import { Emitter } from '../core/emitter';

/**
 * "Play with Friends": private peer-to-peer rooms joined with a 4-character
 * code. The host relays everything (star topology). There is no chat and no
 * public matchmaking — only generated names, skins and race positions travel.
 */
export const PROTOCOL_VERSION = 1;
export const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';
export const CODE_LENGTH = 4;

export interface NetPlayer {
  id: string;
  name: string;
  skin: string;
  host: boolean;
}

/** Compact racer state: [id, x, y, rot, modeIndex, flags, speed]. */
export type NetState = [string, number, number, number, number, number, number];

export type NetMsg =
  | { t: 'hello'; v: number; name: string; skin: string }
  | { t: 'welcome'; you: string; players: NetPlayer[] }
  | { t: 'lobby'; players: NetPlayer[] }
  | { t: 'reject'; reason: 'full' | 'version' | 'started' }
  | { t: 'start'; seed: number; players: NetPlayer[]; delay: number }
  | { t: 'st'; s: NetState }
  | { t: 'snap'; p: NetState[] }
  | { t: 'fx'; from: string; kind: 'snow'; x: number }
  | { t: 'fin'; id: string; time: number }
  | { t: 'results'; order: { id: string; time: number | null }[] }
  | { t: 'bye' };

interface RoomEvents extends Record<string, unknown> {
  lobby: NetPlayer[];
  start: { seed: number; players: NetPlayer[]; delay: number };
  snap: NetState[];
  fx: { from: string; kind: 'snow'; x: number };
  finish: { id: string; time: number };
  results: { id: string; time: number | null }[];
  closed: { reason: string };
}

export function randomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

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

export class NetRoom extends Emitter<RoomEvents> {
  readonly isHost: boolean;
  code = '';
  localId = '';
  players: NetPlayer[] = [];
  started = false;
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private states = new Map<string, NetState>();
  private snapTimer = 0;
  private finishes = new Map<string, number>();
  private resultsTimer = 0;
  private closed = false;

  private constructor(isHost: boolean) {
    super();
    this.isHost = isHost;
  }

  // -------------------------------------------------------------- creation
  static async host(name: string, skin: string): Promise<NetRoom> {
    const room = new NetRoom(true);
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomCode();
      try {
        const peer = await openPeer(CONFIG.net.roomPrefix + code);
        room.peer = peer;
        room.code = code;
        room.localId = peer.id;
        room.players = [{ id: peer.id, name, skin, host: true }];
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
          room.wireClient();
          resolve();
        } else if (msg.t === 'reject') {
          clearTimeout(timer);
          reject(
            new Error(
              msg.reason === 'full'
                ? 'That room is full (4 players max).'
                : msg.reason === 'started'
                  ? 'That race already started. Ask for a new room!'
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
      if (!this.closed && !this.started) peer.reconnect();
    });
  }

  private handleHost(conn: DataConnection, msg: NetMsg): void {
    switch (msg.t) {
      case 'hello': {
        if (msg.v !== PROTOCOL_VERSION) return void conn.send({ t: 'reject', reason: 'version' } satisfies NetMsg);
        if (this.started) return void conn.send({ t: 'reject', reason: 'started' } satisfies NetMsg);
        if (this.players.length >= CONFIG.net.maxPlayers) return void conn.send({ t: 'reject', reason: 'full' } satisfies NetMsg);
        this.conns.set(conn.peer, conn);
        this.players.push({ id: conn.peer, name: String(msg.name).slice(0, 32), skin: String(msg.skin).slice(0, 24), host: false });
        conn.send({ t: 'welcome', you: conn.peer, players: this.players } satisfies NetMsg);
        this.broadcast({ t: 'lobby', players: this.players });
        this.emit('lobby', this.players);
        break;
      }
      case 'st':
        msg.s[0] = conn.peer; // never trust the sender's id
        this.states.set(conn.peer, msg.s);
        break;
      case 'fx':
        this.broadcast({ ...msg, from: conn.peer });
        this.emit('fx', { from: conn.peer, kind: msg.kind, x: msg.x });
        break;
      case 'fin':
        this.recordFinish(conn.peer, msg.time);
        break;
      case 'bye':
        this.dropPeer(conn.peer);
        break;
      default:
        break;
    }
  }

  private dropPeer(id: string): void {
    const conn = this.conns.get(id);
    if (!conn && !this.players.some((p) => p.id === id)) return;
    this.conns.delete(id);
    conn?.close();
    if (!this.started) {
      this.players = this.players.filter((p) => p.id !== id);
      this.broadcast({ t: 'lobby', players: this.players });
      this.emit('lobby', this.players);
    } else {
      this.states.delete(id);
      this.maybeFinishRace();
    }
  }

  private broadcast(msg: NetMsg): void {
    for (const c of this.conns.values()) {
      if (c.open) c.send(msg);
    }
  }

  /** Host: start the race for everyone. */
  startRace(): void {
    if (!this.isHost || this.started) return;
    this.started = true;
    const seed = (Math.random() * 2 ** 31) >>> 0;
    const msg: NetMsg = { t: 'start', seed, players: this.players, delay: 600 };
    this.broadcast(msg);
    this.emit('start', { seed, players: this.players, delay: 600 });
    this.snapTimer = window.setInterval(() => {
      const p = [...this.states.values()];
      if (p.length) this.broadcast({ t: 'snap', p });
      this.emit('snap', p);
    }, 66);
  }

  private recordFinish(id: string, time: number): void {
    if (this.finishes.has(id)) return;
    this.finishes.set(id, time);
    this.broadcast({ t: 'fin', id, time });
    this.emit('finish', { id, time });
    if (!this.resultsTimer) this.resultsTimer = window.setTimeout(() => this.sendResults(), 25000);
    this.maybeFinishRace();
  }

  private maybeFinishRace(): void {
    const active = this.players.filter((p) => p.host || this.conns.has(p.id));
    if (active.every((p) => this.finishes.has(p.id))) this.sendResults();
  }

  private sendResults(): void {
    if (!this.isHost) return;
    clearTimeout(this.resultsTimer);
    clearInterval(this.snapTimer);
    const order = this.players
      .map((p) => ({ id: p.id, time: this.finishes.get(p.id) ?? null }))
      .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
    this.broadcast({ t: 'results', order });
    this.emit('results', order);
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
    switch (msg.t) {
      case 'lobby':
        this.players = msg.players;
        this.emit('lobby', msg.players);
        break;
      case 'start':
        this.started = true;
        this.players = msg.players;
        this.emit('start', { seed: msg.seed, players: msg.players, delay: msg.delay });
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
      default:
        break;
    }
  }

  // -------------------------------------------------------------- race API (both)
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
