import express, { type NextFunction, type Request, type Response } from 'express';
import { ApiError, publicAccount, type AccountService } from './accounts.ts';
import type { ChatHub } from './chat.ts';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import type { Mailer } from './mailer.ts';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { BETA_ADMIN_JS, BETA_JS, betaAdminPage, betaPage, DELETE_JS, deletePage, landingPage, PROMO_ADMIN_JS, promoAdminPage } from './pages.ts';
import type { RoomDirectory } from './rooms.ts';
import type { NameRegistry } from './names.ts';
import type { PlayerService } from './players.ts';
import type { LevelService } from './levels.ts';
import type { TesterService } from './testers.ts';
import type { PromoService } from './promos.ts';
import type { CloudService } from './cloud.ts';
import { hmac, safeEqual } from './util.ts';

export interface AppDeps {
  cfg: Config;
  db: Db;
  accounts: AccountService;
  rooms: RoomDirectory;
  hub: ChatHub;
  names: NameRegistry;
  players: PlayerService;
  levels: LevelService;
  testers: TesterService;
  promos: PromoService;
  cloud: CloudService;
  mailer: Mailer;
  version: string;
}

type Handler = (req: Request, res: Response) => unknown;

/** Wrap a handler: ApiErrors become JSON responses. */
const route =
  (fn: Handler) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (e) {
      next(e);
    }
  };

function bearer(req: Request): string {
  const h = req.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

export function ipKeyFor(cfg: Config, ip: string | undefined): string {
  return hmac(cfg.secret, `ip:${ip ?? 'unknown'}`).slice(0, 32);
}

export function createApp(d: AppDeps): express.Express {
  const { cfg, db, accounts, rooms, hub, names, players, levels, testers, promos, cloud } = d;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy ? 1 : false);
  const ipKey = (req: Request) => ipKeyFor(cfg, req.ip);

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'DENY');
    const origin = req.get('origin');
    if (origin && req.path.startsWith('/api/') && !req.path.startsWith('/api/admin') && cfg.allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.set('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS' && req.path.startsWith('/api/')) {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use('/api', express.json({ limit: '24kb' }));

  // ------------------------------------------------------------ pages
  const html = (res: Response, body: string) => {
    res.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'");
    res.type('html').send(body);
  };
  app.get('/', (_req, res) => html(res, landingPage(cfg)));
  app.get('/account/delete', (_req, res) => html(res, deletePage(cfg)));
  app.get('/account/delete.js', (_req, res) => res.type('application/javascript').send(DELETE_JS));
  app.get('/beta', (_req, res) => html(res, betaPage()));
  app.get('/beta.js', (_req, res) => res.type('application/javascript').send(BETA_JS));
  app.get('/beta/admin', (_req, res) => html(res, betaAdminPage()));
  app.get('/beta/admin.js', (_req, res) => res.type('application/javascript').send(BETA_ADMIN_JS));
  app.get('/promos/admin', (_req, res) => html(res, promoAdminPage()));
  app.get('/promos/admin.js', (_req, res) => res.type('application/javascript').send(PROMO_ADMIN_JS));
  // The web editor: the game itself, built into WEB_DIR (see server/Dockerfile).
  if (cfg.webDir && existsSync(path.join(cfg.webDir, 'index.html'))) {
    app.get('/build', (_req, res) => res.redirect(301, '/build/'));
    app.use('/build', express.static(cfg.webDir, { index: 'index.html', maxAge: '1h' }));
  }
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // ------------------------------------------------------------ public API
  app.get(
    '/api/status',
    route(() => ({ ok: true, version: d.version, freeChat: cfg.freeChat && (d.mailer.real || !cfg.production), publicRooms: true, sharedLevels: true })),
  );

  // Free Chat sign-up is switched off unless FREE_CHAT=true (deleting an old account always works).
  const freeChatOn = (_req: Request, res: Response, next: NextFunction) => {
    if (cfg.freeChat) return next();
    res.status(403).json({ error: 'free_chat_off', message: 'Free Chat isn’t available.' });
  };
  app.use(['/api/account/start', '/api/account/verify'], freeChatOn);
  app.post('/api/account/start', route((req) => accounts.start(req.body ?? {}, ipKey(req))));
  app.post('/api/account/verify', route((req) => accounts.verify(req.body ?? {}, ipKey(req))));
  app.get('/api/account/me', route((req) => ({ account: publicAccount(accounts.auth(bearer(req))) })));
  // Deleting an account also closes its live chat connections.
  app.post(
    '/api/account/delete',
    route((req) => {
      const id = accounts.remove(bearer(req));
      if (id) hub.kick(id, 'This chat account was deleted.', 'signed_out');
      return { ok: true };
    }),
  );
  app.post('/api/account/delete/start', route((req) => ({ ok: true, ...accounts.deleteStart(req.body ?? {}, ipKey(req)) })));
  app.post(
    '/api/account/delete/confirm',
    route((req) => {
      for (const id of accounts.deleteConfirm(req.body ?? {}, ipKey(req))) hub.kick(id, 'This chat account was deleted.', 'signed_out');
      return { ok: true };
    }),
  );

  // Players (Name#tag) and friends. Every call is authorised by the device key.
  app.post('/api/players/register', route((req) => players.register(req.body ?? {}, ipKey(req))));
  app.post(
    '/api/players/delete',
    route((req) => {
      players.remove(req.body ?? {});
      return { ok: true };
    }),
  );
  app.post('/api/friends/sync', route((req) => players.sync(req.body ?? {})));
  app.post('/api/friends/card', route((req) => players.friendCard(req.body ?? {})));
  app.post('/api/friends/add', route((req) => players.add(req.body ?? {}, ipKey(req))));
  app.post('/api/friends/respond', route((req) => players.respond(req.body ?? {})));
  app.post(
    '/api/friends/remove',
    route((req) => {
      players.unfriend(req.body ?? {});
      return { ok: true };
    }),
  );
  app.post(
    '/api/friends/block',
    route((req) => {
      players.block(req.body ?? {});
      return { ok: true };
    }),
  );
  app.post('/api/friends/invite', route((req) => players.invite(req.body ?? {})));
  app.post(
    '/api/friends/invite/dismiss',
    route((req) => {
      players.dismissInvite(req.body ?? {});
      return { ok: true };
    }),
  );
  // Beta tester sign-ups from /beta.
  app.post('/api/testers', route((req) => testers.signup(req.body ?? {}, ipKey(req))));

  // Community levels: share, browse, play, like and report. Authorised by the device key.
  app.post('/api/levels/publish', route((req) => levels.publish(req.body ?? {}, ipKey(req))));
  app.post('/api/levels/browse', route((req) => levels.browse(req.body ?? {})));
  app.post('/api/levels/:id/author', route((req) => levels.authorCard(req.params.id, req.body ?? {})));
  app.post('/api/levels/:id/get', route((req) => levels.get(req.params.id, req.body ?? {})));
  app.post('/api/levels/:id/play', route((req) => levels.play(req.params.id, req.body ?? {})));
  app.post('/api/levels/:id/like', route((req) => levels.like(req.params.id, req.body ?? {})));
  app.post('/api/levels/:id/report', route((req) => levels.report(req.params.id, req.body ?? {})));
  app.post(
    '/api/levels/:id/unpublish',
    route((req) => {
      levels.unpublish(req.params.id, req.body ?? {});
      return { ok: true };
    }),
  );
  // Promo codes (Settings → Redeem a code).
  app.post('/api/promos/redeem', route((req) => promos.redeem(req.body ?? {})));

  // Web editor (Builder Pack): link a browser, levels on both, test on the phone.
  app.post('/api/cloud/pair', route((req) => cloud.pair(req.body ?? {})));
  app.post('/api/cloud/link', route((req) => cloud.link(req.body ?? {}, ipKey(req))));
  app.post('/api/cloud/me', route((req) => cloud.webMe(bearer(req))));
  app.post(
    '/api/cloud/logout',
    route((req) => {
      cloud.logout(bearer(req));
      return { ok: true };
    }),
  );
  app.post('/api/cloud/status', route((req) => cloud.status(req.body ?? {})));
  app.post(
    '/api/cloud/unlink',
    route((req) => {
      cloud.unlink(req.body ?? {});
      return { ok: true };
    }),
  );
  const who = (req: Request) => cloud.who(bearer(req), req.body ?? {});
  app.post('/api/cloud/levels', route((req) => ({ levels: cloud.list(who(req).id) })));
  app.post(
    '/api/cloud/levels/put',
    route((req) => {
      const w = who(req);
      return cloud.put(w.id, w.web, req.body ?? {});
    }),
  );
  app.post(
    '/api/cloud/levels/delete',
    route((req) => {
      cloud.remove(who(req).id, req.body ?? {});
      return { ok: true };
    }),
  );
  app.post('/api/cloud/test', route((req) => cloud.sendTest(who(req).id, req.body ?? {})));
  app.post('/api/cloud/test/status', route((req) => ({ test: cloud.testStatus(who(req).id) })));
  app.post('/api/cloud/inbox', route((req) => cloud.inbox(req.body ?? {})));
  app.post(
    '/api/cloud/test/result',
    route((req) => {
      cloud.testResult(req.body ?? {});
      return { ok: true };
    }),
  );
  app.get('/api/rooms', route((req) => ({ rooms: rooms.list(Date.now(), req.query.kind === 'race' ? 'race' : 'build') })));
  app.post('/api/rooms/:code', route((req) => rooms.register(req.params.code, req.body ?? {}, ipKey(req))));
  app.post(
    '/api/rooms/:code/beat',
    route((req) => {
      rooms.beat(req.params.code, req.body ?? {});
      return { ok: true };
    }),
  );
  app.delete(
    '/api/rooms/:code',
    route((req) => {
      rooms.remove(req.params.code, (req.body ?? {}).secret);
      return { ok: true };
    }),
  );
  // Same as DELETE, for navigator.sendBeacon when the app closes.
  app.post(
    '/api/rooms/:code/remove',
    express.text({ type: 'text/plain', limit: '1kb' }),
    route((req) => {
      let body: unknown = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }
      rooms.remove(req.params.code, (body as { secret?: unknown } | null)?.secret);
      return { ok: true };
    }),
  );
  app.post(
    '/api/rooms/:code/report',
    route((req) => {
      let reporter: string | null = null;
      const token = bearer(req);
      if (token) {
        try {
          reporter = accounts.auth(token).id;
        } catch {
          reporter = null;
        }
      }
      rooms.report(req.params.code, req.body ?? {}, ipKey(req), reporter);
      return { ok: true };
    }),
  );

  // ------------------------------------------------------------ moderation API
  const admin = express.Router();
  admin.use((req, res, next) => {
    if (!cfg.adminToken || !safeEqual(bearer(req), cfg.adminToken)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  });
  const actor = 'admin';
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  admin.get(
    '/reports',
    route((req) => {
      const status = req.query.status === 'resolved' || req.query.status === 'all' ? req.query.status : 'open';
      return { reports: db.reports(status, Math.min(500, Number(req.query.limit) || 100)) };
    }),
  );
  admin.get(
    '/reports/:id',
    route((req) => {
      const r = db.report(req.params.id);
      if (!r) throw new ApiError(404, 'not_found', 'No such report.');
      // Message reports point at stored messages (gone once retention ends); room reports carry a level snapshot.
      return { report: { ...r, context: r.kind === 'message' ? db.reportMessages(r.id) : (JSON.parse(r.context) as unknown) } };
    }),
  );
  admin.post(
    '/reports/:id/resolve',
    route((req) => {
      const r = db.report(req.params.id);
      if (!r) throw new ApiError(404, 'not_found', 'No such report.');
      const b = req.body ?? {};
      const note = typeof b.note === 'string' ? b.note.slice(0, 500) : null;
      if (r.target_account && b.action === 'mute') hub.notifyMute(r.target_account, accounts.mute(r.target_account, num(b.hours, 24), actor));
      if (r.target_account && b.action === 'ban') {
        accounts.ban(r.target_account, num(b.days, 0), note ?? r.reason, actor);
        hub.kick(r.target_account, 'This account can’t use Free Chat any more.');
      }
      if (r.room_code && b.action === 'hide') rooms.hide(r.room_code, true);
      db.resolveReport(r.id, `${b.action ?? 'dismiss'}${note ? `: ${note}` : ''}`, Date.now());
      db.audit(actor, 'resolve_report', r.id, String(b.action ?? 'dismiss'), Date.now());
      return { ok: true };
    }),
  );
  admin.get(
    '/accounts/:id',
    route((req) => {
      const a = db.accountById(req.params.id);
      if (!a) throw new ApiError(404, 'not_found', 'No such account.');
      return { account: a, reports: db.reportsAgainst(a.id, 50) };
    }),
  );
  admin.get(
    '/accounts/:id/export',
    route((req) => {
      // For lawful requests: everything retained about one account.
      const a = db.accountById(req.params.id);
      if (!a) throw new ApiError(404, 'not_found', 'No such account.');
      db.audit(actor, 'export', a.id, null, Date.now());
      return { exportedAt: new Date().toISOString(), account: a, messages: db.messagesByAccount(a.id, 10_000), reports: db.reportsAgainst(a.id, 1000) };
    }),
  );
  admin.post(
    '/accounts/:id/ban',
    route((req) => {
      const b = req.body ?? {};
      const until = accounts.ban(req.params.id, num(b.days, 0), typeof b.reason === 'string' ? b.reason.slice(0, 200) : 'safety', actor);
      hub.kick(req.params.id, 'This account can’t use Free Chat any more.');
      return { ok: true, until };
    }),
  );
  admin.post(
    '/accounts/:id/unban',
    route((req) => {
      accounts.unban(req.params.id, actor);
      return { ok: true };
    }),
  );
  admin.post(
    '/accounts/:id/mute',
    route((req) => {
      const until = accounts.mute(req.params.id, num((req.body ?? {}).hours, 24), actor);
      hub.notifyMute(req.params.id, until);
      return { ok: true, until };
    }),
  );
  admin.get('/rooms', route(() => ({ rooms: rooms.adminList() })));
  admin.post(
    '/rooms/:code/hide',
    route((req) => {
      const ok = rooms.hide(req.params.code, (req.body ?? {}).hidden !== false);
      db.audit(actor, 'hide_room', req.params.code, null, Date.now());
      return { ok };
    }),
  );
  admin.get(
    '/levels',
    route((req) => {
      const filter = req.query.filter === 'hidden' || req.query.filter === 'all' ? req.query.filter : 'reported';
      return { levels: levels.adminList(filter, Math.min(500, Number(req.query.limit) || 100)) };
    }),
  );
  admin.post(
    '/levels/:id/hide',
    route((req) => {
      const hidden = (req.body ?? {}).hidden !== false;
      const ok = levels.setHidden(req.params.id, hidden);
      db.audit(actor, hidden ? 'hide_level' : 'restore_level', req.params.id, null, Date.now());
      return { ok };
    }),
  );
  admin.delete(
    '/levels/:id',
    route((req) => {
      const ok = levels.remove(req.params.id);
      db.audit(actor, 'delete_level', req.params.id, null, Date.now());
      return { ok };
    }),
  );
  admin.get('/testers', route((req) => ({ testers: testers.list(typeof req.query.status === 'string' ? req.query.status : undefined) })));
  admin.get('/testers.csv', (_req, res) => {
    res.type('text/csv').set('Content-Disposition', 'attachment; filename="polygon-rush-testers.csv"').send(testers.csv());
  });
  admin.post('/testers/:id', route((req) => ({ ok: testers.setStatus(req.params.id, (req.body ?? {}).status) })));
  admin.delete(
    '/testers/:id',
    route((req) => {
      const ok = testers.remove(req.params.id);
      db.audit(actor, 'delete_tester', req.params.id, null, Date.now());
      return { ok };
    }),
  );
  admin.get('/names', route((req) => ({ banned: db.bannedNames(Math.min(1000, Number(req.query.limit) || 200)) })));
  admin.get('/names/:name', route((req) => ({ players: players.byName(req.params.name) })));
  admin.post(
    '/names/:name/ban',
    route((req) => {
      const b = req.body ?? {};
      const until = names.ban(req.params.name, num(b.days, 0), typeof b.reason === 'string' ? b.reason.slice(0, 200) : 'not allowed');
      db.audit(actor, 'ban_name', req.params.name, null, Date.now());
      return { ok: true, until };
    }),
  );
  admin.post(
    '/names/:name/unban',
    route((req) => {
      names.unban(req.params.name);
      db.audit(actor, 'unban_name', req.params.name, null, Date.now());
      return { ok: true };
    }),
  );
  admin.get('/promos', route(() => ({ promos: promos.list() })));
  admin.post(
    '/promos',
    route((req) => {
      const p = promos.create(req.body ?? {});
      db.audit(actor, 'create_promo', p.code, JSON.stringify(p.reward), Date.now());
      return { promo: p };
    }),
  );
  admin.post('/promos/:code', route((req) => ({ ok: promos.setDisabled(req.params.code, (req.body ?? {}).disabled === true) })));
  admin.delete(
    '/promos/:code',
    route((req) => {
      const ok = promos.remove(req.params.code);
      db.audit(actor, 'delete_promo', req.params.code, null, Date.now());
      return { ok };
    }),
  );
  admin.get('/audit', route((req) => ({ audit: db.auditLog(Math.min(1000, Number(req.query.limit) || 200)) })));
  app.use('/api/admin', admin);

  // ------------------------------------------------------------ errors
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    const status = (err as { status?: number; type?: string })?.status;
    if (status === 400 || status === 413) {
      res.status(status).json({ error: 'bad_request', message: 'Bad request.' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'server_error', message: 'Something went wrong.' });
  });
  return app;
}
