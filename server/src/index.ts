import http from 'node:http';
import type { Duplex } from 'node:stream';
import { ExpressPeerServer } from 'peer';
import { WebSocketServer, type WebSocket } from 'ws';
import { AccountService } from './accounts.ts';
import { ChatHub } from './chat.ts';
import type { Config } from './config.ts';
import { Db } from './db.ts';
import { createApp, ipKeyFor } from './http.ts';
import { createMailer, type Mailer } from './mailer.ts';
import { RoomDirectory } from './rooms.ts';
import { NameRegistry } from './names.ts';
import { PlayerService } from './players.ts';

export const VERSION = '1.0.0';

export interface Server {
  http: http.Server;
  db: Db;
  accounts: AccountService;
  rooms: RoomDirectory;
  hub: ChatHub;
  names: NameRegistry;
  players: PlayerService;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

/** Build the whole community server (HTTP API, PeerJS signalling, Free Chat). */
export function createServer(cfg: Config, opts: { mailer?: Mailer; log?: (msg: string) => void } = {}): Server {
  const log = opts.log ?? ((m: string) => console.log(m));
  const db = new Db(cfg.dbFile);
  const mailer = opts.mailer ?? createMailer(cfg, log);
  const accounts = new AccountService(db, mailer, cfg);
  const names = new NameRegistry(db);
  const players = new PlayerService(db, cfg.secret, names);
  const rooms = new RoomDirectory(db, names);
  const hub = new ChatHub(db, accounts, names);
  const app = createApp({ cfg, db, accounts, rooms, hub, names, players, mailer, version: VERSION });
  const server = http.createServer(app);

  // PeerJS signalling for online rooms, on the same port. Its WebSocket and
  // ours share the HTTP server, so upgrades are routed by path below.
  let peerWss: WebSocketServer | null = null;
  let peerWsPath = '';
  const peer = ExpressPeerServer(server, {
    path: '/',
    key: cfg.peerKey,
    allow_discovery: false,
    proxied: cfg.trustProxy,
    createWebSocketServer: (options) => {
      peerWsPath = options.path ?? '';
      peerWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
      return peerWss;
    },
  });
  app.use(cfg.peerPath, peer);

  const chatWss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const alive = new WeakMap<WebSocket, boolean>();
  chatWss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    // Behind one proxy the real client is the last hop it added (earlier entries can be spoofed).
    const forwarded = cfg.trustProxy ? (String(req.headers['x-forwarded-for'] ?? '').split(',').map((x) => x.trim()).filter(Boolean).pop() ?? '') : '';
    const conn = {
      ipKey: ipKeyFor(cfg, forwarded || req.socket.remoteAddress),
      send: (msg: object) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code: number, reason: string) => ws.close(code, reason),
    };
    const h = hub.connect(conn);
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', (data, isBinary) => {
      if (isBinary) return ws.close(4002, 'text only');
      h.message(data.toString());
    });
    ws.on('close', () => h.close());
    ws.on('error', () => ws.terminate());
  });
  const heartbeat = setInterval(() => {
    for (const ws of chatWss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, 30_000);

  server.on('upgrade', (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/chat') {
      const origin = req.headers.origin;
      if (origin && !cfg.allowedOrigins.includes(origin)) {
        socket.destroy();
        return;
      }
      chatWss.handleUpgrade(req, socket, head, (ws) => chatWss.emit('connection', ws, req));
    } else if (peerWss && pathname === peerWsPath) {
      const wss = peerWss;
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });

  const purge = () => {
    try {
      const now = Date.now();
      const out = { ...db.purge(now, { messageDays: cfg.messageRetentionDays, reportDays: cfg.reportRetentionDays, inactiveDays: cfg.inactiveAccountDays }), ...players.purge(now, cfg.inactiveAccountDays) };
      if (Object.values(out).some((n) => n > 0)) log(`[purge] ${JSON.stringify(out)}`);
    } catch (e) {
      log(`[purge] failed: ${(e as Error).message}`);
    }
  };
  purge();
  const purgeTimer = setInterval(purge, 60 * 60 * 1000);
  purgeTimer.unref();
  heartbeat.unref();

  return {
    http: server,
    db,
    accounts,
    rooms,
    hub,
    names,
    players,
    listen(port = cfg.port) {
      return new Promise((resolve) => {
        server.listen(port, () => {
          const addr = server.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      });
    },
    close() {
      clearInterval(heartbeat);
      clearInterval(purgeTimer);
      for (const ws of chatWss.clients) ws.terminate();
      for (const ws of peerWss?.clients ?? []) ws.terminate();
      return new Promise((resolve) => {
        server.close(() => {
          db.close();
          resolve();
        });
        server.closeAllConnections();
      });
    },
  };
}
