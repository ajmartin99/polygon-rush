import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { loadConfig } from '../src/config.ts';
import { createServer, type Server } from '../src/index.ts';
import { Db } from '../src/db.ts';
import { NameRegistry } from '../src/names.ts';
import { PlayerService } from '../src/players.ts';
import type { Mail, Mailer } from '../src/mailer.ts';
import { levelChecksum } from '../../src/shared/level-code.ts';

const sent: Mail[] = [];
const mailer: Mailer = {
  real: true,
  async send(m) {
    sent.push(m);
  },
};
const ADMIN = 'admin-token-for-tests-0123456789';
const YEAR = new Date().getUTCFullYear();
let srv: Server;
let base = '';

before(async () => {
  const cfg = loadConfig({ NODE_ENV: 'test', DB_FILE: ':memory:', TOKEN_SECRET: 's'.repeat(48), ADMIN_TOKEN: ADMIN, PORT: '0', IP_LIMIT_PER_HOUR: '1000', FREE_CHAT: 'true' });
  srv = createServer(cfg, { mailer, log: () => {} });
  const port = await srv.listen(0);
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await srv.close();
});

async function api(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: Record<string, any> }> {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, any> };
}

function lastCode(to: string): string {
  const m = [...sent].reverse().find((x) => x.to === to);
  assert.ok(m, `no mail to ${to}`);
  return /Code: (\d{6})/.exec(m.text)![1];
}

let n = 0;
/** Verify a fresh email and return its token. */
async function account(age: number): Promise<{ token: string; id: string; email: string }> {
  const email = `player${++n}@example.com`;
  const s = await api('POST', '/api/account/start', { email, birthYear: YEAR - age - 1 });
  assert.equal(s.status, 200, JSON.stringify(s.json));
  const v = await api('POST', '/api/account/verify', { email, code: lastCode(email) });
  assert.equal(v.status, 200, JSON.stringify(v.json));
  return { token: v.json.token, id: v.json.account.id, email };
}

class Client {
  ws: WebSocket;
  inbox: any[] = [];
  closed = false;
  constructor() {
    this.ws = new WebSocket(base.replace('http', 'ws') + '/chat');
    this.ws.addEventListener('message', (e) => this.inbox.push(JSON.parse(String(e.data))));
    this.ws.addEventListener('close', () => (this.closed = true));
  }
  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((r) => this.ws.addEventListener('open', r, { once: true }));
  }
  send(msg: object): void {
    this.ws.send(JSON.stringify(msg));
  }
  async wait(pred: (m: any) => boolean, ms = 2000): Promise<any> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const i = this.inbox.findIndex(pred);
      if (i >= 0) return this.inbox.splice(i, 1)[0];
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error(`timeout; inbox=${JSON.stringify(this.inbox)}`);
  }
  async none(pred: (m: any) => boolean, ms = 300): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
    assert.equal(this.inbox.filter(pred).length, 0, JSON.stringify(this.inbox));
  }
  close(): void {
    this.ws.close();
  }
}

async function chatter(token: string, channel: string, name: string): Promise<Client> {
  const c = new Client();
  await c.open();
  c.send({ t: 'auth', token });
  await c.wait((m) => m.t === 'ready');
  c.send({ t: 'join', channel, name });
  await c.wait((m) => m.t === 'joined');
  return c;
}

describe('accounts', () => {
  test('status and signalling are up', async () => {
    const s = await api('GET', '/api/status');
    assert.equal(s.json.ok, true);
    const id = await fetch(`${base}/peerjs/peerjs/id`).then((r) => r.text());
    assert.match(id, /^[0-9a-f-]{20,}$/);
  });

  test('16+ verify their own email', async () => {
    const email = 'Big.Kid@Example.com';
    const s = await api('POST', '/api/account/start', { email, birthYear: YEAR - 20 });
    assert.equal(s.json.consent, 'self');
    assert.equal(s.json.devCode, undefined, 'never leak codes when email works');
    const mail = sent.at(-1)!;
    assert.equal(mail.to, 'big.kid@example.com');
    assert.match(mail.subject, /code/i);
    const wrong = await api('POST', '/api/account/verify', { email, code: '000000' === lastCode('big.kid@example.com') ? '111111' : '000000' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.json.error, 'wrong_code');
    const ok = await api('POST', '/api/account/verify', { email, code: lastCode('big.kid@example.com') });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.account.consent, 'self');
    assert.equal(ok.json.account.emailHint, 'bi***@ex***.com');
    const me = await api('GET', '/api/account/me', undefined, ok.json.token);
    assert.equal(me.json.account.id, ok.json.account.id);
    // The code is single use.
    const again = await api('POST', '/api/account/verify', { email, code: lastCode('big.kid@example.com') });
    assert.equal(again.status, 400);
  });

  test('13-15 need a parent: the code goes to the parent with an explanation', async () => {
    const email = 'parent@example.com';
    const s = await api('POST', '/api/account/start', { email, birthYear: YEAR - 15 });
    assert.equal(s.json.consent, 'parent');
    const mail = sent.at(-1)!;
    assert.match(mail.subject, /parent/i);
    assert.match(mail.text, /Free Chat/);
    assert.match(mail.text, /account\/delete/);
    const v = await api('POST', '/api/account/verify', { email, code: lastCode(email) });
    assert.equal(v.json.account.consent, 'parent');
  });

  test('under-13s can never get Free Chat', async () => {
    const s = await api('POST', '/api/account/start', { email: 'kid@example.com', birthYear: YEAR - 10 });
    assert.equal(s.status, 403);
    assert.equal(s.json.error, 'too_young');
  });

  test('bad input and too many codes are refused', async () => {
    assert.equal((await api('POST', '/api/account/start', { email: 'nope', birthYear: YEAR - 20 })).status, 400);
    assert.equal((await api('POST', '/api/account/start', { email: 'x@example.com' })).status, 400);
    const email = 'spammy@example.com';
    for (let i = 0; i < 5; i++) assert.equal((await api('POST', '/api/account/start', { email, birthYear: YEAR - 30 })).status, 200);
    assert.equal((await api('POST', '/api/account/start', { email, birthYear: YEAR - 30 })).status, 429);
  });

  test('five wrong codes burn the code', async () => {
    const email = 'guesser@example.com';
    await api('POST', '/api/account/start', { email, birthYear: YEAR - 30 });
    const right = lastCode(email);
    const wrongCode = right === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) await api('POST', '/api/account/verify', { email, code: wrongCode });
    const r = await api('POST', '/api/account/verify', { email, code: right });
    assert.equal(r.status, 400);
  });

  test('accounts can be deleted in the app or on the web', async () => {
    const a = await account(20);
    assert.equal((await api('POST', '/api/account/delete', {}, a.token)).status, 200);
    assert.equal((await api('GET', '/api/account/me', undefined, a.token)).status, 401);
    const b = await account(30);
    const page = await fetch(`${base}/account/delete`).then((r) => r.text());
    assert.match(page, /Delete a Free Chat account/);
    assert.equal((await api('POST', '/api/account/delete/start', { email: b.email })).status, 200);
    assert.equal((await api('POST', '/api/account/delete/confirm', { email: b.email, code: lastCode(b.email) })).status, 200);
    assert.equal((await api('GET', '/api/account/me', undefined, b.token)).status, 401);
    // Unknown addresses get the same answer (no probing).
    assert.equal((await api('POST', '/api/account/delete/start', { email: 'nobody@example.com' })).status, 200);
  });
});

describe('free chat', () => {
  test('verified players chat; the filter blocks personal info and masks swearing', async () => {
    const a = await account(17);
    const b = await account(14);
    const channel = 'room-key-abcdefghijklmnop';
    const ca = await chatter(a.token, channel, 'Speedy Panda 7');
    const cb = await chatter(b.token, channel, 'Happy Otter 3');
    await ca.wait((m) => m.t === 'presence' && m.count === 2);
    ca.send({ t: 'say', text: 'nice level!' });
    const got = await cb.wait((m) => m.t === 'msg');
    assert.equal(got.text, 'nice level!');
    assert.equal(got.name, 'Speedy Panda 7');
    assert.equal(got.from, a.id);
    await ca.wait((m) => m.t === 'msg'); // echo to sender
    await new Promise((r) => setTimeout(r, 1300));
    ca.send({ t: 'say', text: 'text me 555 123 4567' });
    const blocked = await ca.wait((m) => m.t === 'blocked');
    assert.equal(blocked.reason, 'personal_info');
    await cb.none((m) => m.t === 'msg');
    await new Promise((r) => setTimeout(r, 1300));
    ca.send({ t: 'say', text: 'this jump is shit' });
    assert.equal((await cb.wait((m) => m.t === 'msg')).text, 'this jump is ****');
    // Too fast.
    ca.send({ t: 'say', text: 'again' });
    assert.equal((await ca.wait((m) => m.t === 'blocked')).reason, 'spam');
    ca.close();
    cb.close();
  });

  test('only generated names, real channels and signed-in players', async () => {
    const a = await account(18);
    const c = new Client();
    await c.open();
    c.send({ t: 'join', channel: 'room-key-abcdefghijklmnop', name: 'Speedy Panda 7' });
    await c.wait((m) => m.t === 'error' && m.code === 'signed_out');
    const d = new Client();
    await d.open();
    d.send({ t: 'auth', token: 'forged.token' });
    await d.wait((m) => m.t === 'error');
    const e = new Client();
    await e.open();
    e.send({ t: 'auth', token: a.token });
    await e.wait((m) => m.t === 'ready');
    e.send({ t: 'join', channel: 'room-key-abcdefghijklmnop', name: 'call me maybe' });
    await e.wait((m) => m.t === 'error' && m.code === 'bad_name');
    e.send({ t: 'join', channel: 'short', name: 'Speedy Panda 7' });
    await e.wait((m) => m.t === 'error' && m.code === 'bad_channel');
    c.close();
    e.close();
  });

  test('three different reporters mute a player until a moderator looks', async () => {
    const bad = await account(25);
    const others = [await account(20), await account(21), await account(22)];
    const channel = 'room-key-reports-0123456789';
    const cbad = await chatter(bad.token, channel, 'Mighty Tiger 9');
    const listeners = await Promise.all(others.map((o, i) => chatter(o.token, channel, `Sunny Fox ${i + 1}`)));
    cbad.send({ t: 'say', text: 'you are all bad at this' });
    const msg = await listeners[0].wait((m) => m.t === 'msg');
    for (const l of listeners) {
      l.send({ t: 'report', id: msg.id, reason: 'Mean or bullying' });
      await l.wait((m) => m.t === 'reported');
    }
    const muted = await cbad.wait((m) => m.t === 'muted');
    assert.ok(muted.until > Date.now());
    await new Promise((r) => setTimeout(r, 1300));
    cbad.send({ t: 'say', text: 'hello?' });
    assert.equal((await cbad.wait((m) => m.t === 'blocked')).reason, 'muted');
    // The moderation queue has the report with the conversation around it.
    const q = await api('GET', '/api/admin/reports', undefined, ADMIN);
    const r = q.json.reports.find((x: any) => x.target_account === bad.id);
    assert.ok(r);
    const detail = await api('GET', `/api/admin/reports/${r.id}`, undefined, ADMIN);
    assert.ok(detail.json.report.context.some((m: any) => m.text === 'you are all bad at this'));
    // A ban kicks them out and blocks the email.
    const ban = await api('POST', `/api/admin/accounts/${bad.id}/ban`, { days: 0, reason: 'bullying' }, ADMIN);
    assert.equal(ban.status, 200);
    await cbad.wait((m) => m.t === 'error' && m.code === 'banned');
    const again = await api('POST', '/api/account/start', { email: bad.email, birthYear: YEAR - 30 });
    assert.equal(again.status, 403);
    const exp = await api('GET', `/api/admin/accounts/${bad.id}/export`, undefined, ADMIN);
    assert.equal(exp.json.account.email, bad.email);
    assert.ok(exp.json.messages.length >= 1);
    for (const l of listeners) l.close();
  });

  test('the moderation API needs the admin token', async () => {
    assert.equal((await api('GET', '/api/admin/reports')).status, 401);
    assert.equal((await api('GET', '/api/admin/reports', undefined, 'wrong-token-wrong-token-wrong')).status, 401);
  });
});

describe('players and friends', () => {
  const k = (c: string) => c.repeat(20);
  const reg = (key: string, name: string, extra: Record<string, unknown> = {}) => api('POST', '/api/players/register', { key, name, ...extra });
  const sync = (key: string, extra: Record<string, unknown> = {}) => api('POST', '/api/friends/sync', { key, ...extra });

  test('names can be shared; the #tag tells players apart', async () => {
    const a = await reg(k('a'), 'Rocket Rex');
    const b = await reg(k('b'), 'Rocket Rex');
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.notEqual(a.json.tag, b.json.tag);
    assert.ok(a.json.tag >= 1 && a.json.tag <= 9999);
    // Registering again keeps the same player and tag.
    const again = await reg(k('a'), 'Rocket Rex');
    assert.equal(again.json.id, a.json.id);
    assert.equal(again.json.tag, a.json.tag);
    // Filter, digit and reserved-word rules still apply.
    assert.equal((await reg(k('c'), 'call 5551234')).status, 400);
    assert.equal((await reg(k('c'), 'Admin')).status, 400);
    // Under-13s use generated names only.
    assert.equal((await reg(k('c'), 'Rocket Rex', { kid: true })).status, 400);
    assert.equal((await reg(k('c'), 'Speedy Panda 7', { kid: true })).status, 200);
  });

  test('add by Name#tag, accept, see online friends, invite, remove', async () => {
    const a = (await reg(k('d'), 'Comet Kid')).json;
    const b = (await reg(k('e'), 'Neon Fox')).json;
    const handle = (p: any) => `${p.name}#${String(p.tag).padStart(4, '0')}`;
    // Wrong tag: not found.
    assert.equal((await api('POST', '/api/friends/add', { key: k('d'), handle: `Neon Fox#${(b.tag % 9999) + 1}` })).status, 404);
    assert.equal((await api('POST', '/api/friends/add', { key: k('d'), handle: handle(a) })).status, 400);
    assert.equal((await api('POST', '/api/friends/add', { key: k('d'), handle: handle(b).toLowerCase() })).json.state, 'sent');
    let sb = (await sync(k('e'))).json;
    assert.deepEqual(sb.incoming.map((p: any) => p.id), [a.id]);
    // Not friends yet: no invites.
    assert.equal((await api('POST', '/api/friends/invite', { key: k('d'), id: b.id, kind: 'race', room: 'BXTW' })).status, 404);
    assert.equal((await api('POST', '/api/friends/respond', { key: k('e'), id: a.id, accept: true })).json.state, 'friends');
    const sa = (await sync(k('d'), { activity: 'race' })).json;
    assert.equal(sa.friends.length, 1);
    assert.equal(sa.friends[0].id, b.id);
    assert.equal(sa.friends[0].online, true);
    sb = (await sync(k('e'))).json;
    assert.equal(sb.friends[0].activity, 'race');
    // Invites carry only a kind and a room code.
    assert.equal((await api('POST', '/api/friends/invite', { key: k('d'), id: b.id, kind: 'race', room: 'not a code' })).status, 400);
    assert.equal((await api('POST', '/api/friends/invite', { key: k('d'), id: b.id, kind: 'build', room: 'BXTW' })).status, 200);
    sb = (await sync(k('e'))).json;
    assert.equal(sb.invites.length, 1);
    assert.deepEqual([sb.invites[0].kind, sb.invites[0].room, sb.invites[0].from.id], ['build', 'BXTW', a.id]);
    await api('POST', '/api/friends/invite/dismiss', { key: k('e'), id: sb.invites[0].id });
    assert.equal((await sync(k('e'))).json.invites.length, 0);
    await api('POST', '/api/friends/remove', { key: k('e'), id: a.id });
    assert.equal((await sync(k('d'))).json.friends.length, 0);
  });

  test('blocking hides you; parents can switch friends off', async () => {
    const a = (await reg(k('f'), 'Pixel Pal')).json;
    const b = (await reg(k('g'), 'Lemon Zest')).json;
    const hb = `Lemon Zest#${b.tag}`;
    await api('POST', '/api/friends/add', { key: k('f'), handle: hb });
    await api('POST', '/api/friends/block', { key: k('g'), id: a.id });
    assert.equal((await sync(k('g'))).json.incoming.length, 0);
    assert.equal((await api('POST', '/api/friends/add', { key: k('f'), handle: hb })).status, 404);
    // Friends switched off: invisible to requests, and its own lists are empty.
    await reg(k('h'), 'Speedy Panda 8', { kid: true, friendsOff: true });
    const c = (await sync(k('h'))).json;
    assert.equal(c.me.friendsOff, true);
    assert.equal((await api('POST', '/api/friends/add', { key: k('f'), handle: `Speedy Panda 8#${c.me.tag}` })).status, 404);
  });

  test('a banned name resets on the next sync; deleting forgets the player', async () => {
    await reg(k('i'), 'Grumpy Gus');
    const ban = await api('POST', '/api/admin/names/Grumpy%20Gus/ban', { days: 0, reason: 'test' }, ADMIN);
    assert.equal(ban.status, 200);
    assert.equal((await sync(k('i'))).json.error, 'name_banned');
    assert.equal((await reg(k('j'), 'Grumpy Gus')).status, 403);
    await api('POST', '/api/players/delete', { key: k('i') });
    assert.equal((await sync(k('i'))).status, 401);
  });

  test('typed names can host public rooms', async () => {
    const r = await api('POST', '/api/rooms/BXTW', { name: [3, 4], host: 'Comet Kid', players: 1, max: 4, theme: 1 });
    assert.equal(r.status, 200);
    await api('DELETE', '/api/rooms/BXTW', { secret: r.json.secret });
    assert.equal((await api('POST', '/api/rooms/BXTV', { name: [3, 4], host: 'call 5551234', players: 1, max: 4, theme: 1 })).status, 400);
  });

  test('inactive players and names are purged, permanent bans are kept', () => {
    const db = new Db(':memory:');
    const names = new NameRegistry(db);
    const players = new PlayerService(db, 's'.repeat(48), names);
    const DAY = 86_400_000;
    players.register({ key: 'o'.repeat(20), name: 'Old Timer' }, 'ip', 0);
    players.register({ key: 'p'.repeat(20), name: 'Fresh Face' }, 'ip', 900 * DAY);
    db.banName('Bad Name', -1, 'rude', 0);
    db.purge(900 * DAY, { messageDays: 30, reportDays: 365, inactiveDays: 730 });
    players.purge(900 * DAY, 730);
    assert.equal(players.byName('Old Timer').length, 0);
    assert.equal(players.byName('Fresh Face').length, 1);
    assert.ok(db.nameRow('bad name'));
  });
});

describe('public build rooms', () => {
  const room = { name: [3, 4], host: 'Jolly Penguin 12', players: 1, max: 4, theme: 1 };

  test('list, heartbeat, report and remove', async () => {
    const reg = await api('POST', '/api/rooms/BXQZ', room);
    assert.equal(reg.status, 200);
    const secret = reg.json.secret as string;
    let list = await api('GET', '/api/rooms');
    assert.ok(list.json.rooms.some((r: any) => r.code === 'BXQZ' && r.host === 'Jolly Penguin 12'));
    assert.equal((await api('POST', '/api/rooms/BXQZ/beat', { secret, players: 3 })).status, 200);
    assert.equal((await api('POST', '/api/rooms/BXQZ/beat', { secret: 'nope', players: 3 })).status, 404);
    list = await api('GET', '/api/rooms');
    assert.equal(list.json.rooms.find((r: any) => r.code === 'BXQZ').players, 3);
    assert.equal((await api('DELETE', '/api/rooms/BXQZ', { secret })).status, 200);
    list = await api('GET', '/api/rooms');
    assert.ok(!list.json.rooms.some((r: any) => r.code === 'BXQZ'));
  });

  test('race rooms list separately and drop off once the race starts', async () => {
    const reg = await api('POST', '/api/rooms/RTVW', { ...room, kind: 'race' });
    assert.equal(reg.status, 200);
    assert.ok(!(await api('GET', '/api/rooms')).json.rooms.some((r: any) => r.code === 'RTVW'));
    const races = (await api('GET', '/api/rooms?kind=race')).json.rooms;
    assert.ok(races.some((r: any) => r.code === 'RTVW' && r.kind === 'race'));
    assert.equal((await api('POST', '/api/rooms/RTVW/beat', { secret: reg.json.secret, players: 2, open: false })).status, 200);
    assert.ok(!(await api('GET', '/api/rooms?kind=race')).json.rooms.some((r: any) => r.code === 'RTVW'));
    await api('DELETE', '/api/rooms/RTVW', { secret: reg.json.secret });
  });

  test('typed names and bad codes are refused', async () => {
    assert.equal((await api('POST', '/api/rooms/BXQA', room)).status, 400);
    assert.equal((await api('POST', '/api/rooms/BXQW', { ...room, host: 'my real name' })).status, 400);
  });

  test('reports from three players hide a room', async () => {
    const reg = await api('POST', '/api/rooms/CDFG', room);
    assert.equal(reg.status, 200);
    const tokens = [await account(20), await account(20), await account(20)].map((a) => a.token);
    for (const t of tokens) assert.equal((await api('POST', '/api/rooms/CDFG/report', { reason: 'Rude drawing', level: 'PR1-AQQ' }, t)).status, 200);
    const list = await api('GET', '/api/rooms');
    assert.ok(!list.json.rooms.some((r: any) => r.code === 'CDFG'));
    const admin = await api('GET', '/api/admin/rooms', undefined, ADMIN);
    assert.ok(admin.json.rooms.some((r: any) => r.code === 'CDFG' && r.hidden));
  });
});

describe('review hardening', () => {
  test('deleting an account closes its chat; coming back keeps the old id and mute', async () => {
    const a = await account(20);
    const c = await chatter(a.token, 'room-key-delete-0123456789', 'Brave Fox 4');
    await api('POST', `/api/admin/accounts/${a.id}/mute`, { hours: 5 }, ADMIN);
    await c.wait((m) => m.t === 'muted');
    assert.equal((await api('POST', '/api/account/delete', {}, a.token)).status, 200);
    await c.wait((m) => m.t === 'error' && m.code === 'signed_out');
    // Re-verify the same email: same id, still muted.
    await api('POST', '/api/account/start', { email: a.email, birthYear: YEAR - 21 });
    const v = await api('POST', '/api/account/verify', { email: a.email, code: lastCode(a.email) });
    assert.equal(v.json.account.id, a.id);
    assert.ok(v.json.account.mutedUntil > Date.now());
    // A moderator can still ban the deleted-then-returned or a deleted account by id.
    assert.equal((await api('POST', `/api/account/delete`, {}, v.json.token)).status, 200);
    assert.equal((await api('POST', `/api/admin/accounts/${a.id}/ban`, { days: 0, reason: 'test' }, ADMIN)).status, 200);
    assert.equal((await api('POST', '/api/account/start', { email: a.email, birthYear: YEAR - 21 })).status, 403);
  });

  test('a parent email gives each teen their own account; the parent stays separate', async () => {
    const email = 'family@example.com';
    const verify = async (age: number) => {
      await api('POST', '/api/account/start', { email, birthYear: YEAR - age - 1 });
      return (await api('POST', '/api/account/verify', { email, code: lastCode(email) })).json.account;
    };
    const teenA = await verify(13);
    const teenB = await verify(15);
    const parent = await verify(40);
    const teenAagain = await verify(13);
    assert.notEqual(teenA.id, teenB.id);
    assert.notEqual(teenA.id, parent.id);
    assert.equal(teenAagain.id, teenA.id);
    assert.equal(teenA.consent, 'parent');
    assert.equal(parent.consent, 'self');
  });

  test('nobody can join a chat room under a name already in it', async () => {
    const a = await account(20);
    const b = await account(20);
    const channel = 'room-key-names-0123456789';
    await chatter(a.token, channel, 'Lucky Otter 8');
    const c = new Client();
    await c.open();
    c.send({ t: 'auth', token: b.token });
    await c.wait((m) => m.t === 'ready');
    c.send({ t: 'join', channel, name: 'Lucky Otter 8' });
    await c.wait((m) => m.t === 'error' && m.code === 'name_taken');
    c.close();
  });

  test('a hidden public room cannot list itself again', async () => {
    // CDFG was hidden by reports above: neither it nor its host's connection can list again for a while.
    const room = { name: [1, 1], host: 'Jolly Penguin 12', players: 1, max: 4, theme: 1 };
    assert.equal((await api('POST', '/api/rooms/CDFG', room)).status, 403);
    assert.equal((await api('POST', '/api/rooms/DFGH', room)).status, 403);
  });

  test('web deletion answers the same for unknown addresses', async () => {
    const r = await api('POST', '/api/account/delete/start', { email: 'ghost@example.com' });
    assert.deepEqual(r.json, { ok: true });
  });
});

describe('community levels', () => {
  const k = (c: string) => `lvl${c}`.repeat(6);
  const reg = (key: string, name: string, extra: Record<string, unknown> = {}) => api('POST', '/api/players/register', { key, name, ...extra });
  /** A tiny v2 level code: `spikes` spikes, optional typed title. */
  const code = (spikes: number, title = ''): string => {
    const out = [2, 1, 0, (1 << 4) | 1, 100, 0, 3, 4, 0];
    if (title) out.push(254, title.length, ...[...title].map((ch) => ch.charCodeAt(0)));
    else out.push(0);
    out.push(spikes);
    for (let i = 0; i < spikes; i++) out.push(i === 0 ? 10 : 3, 2 << 4);
    const c = levelChecksum(out);
    out.push(c >> 8, c & 0xff);
    return 'PR1-' + Buffer.from(out).toString('base64url');
  };
  const browse = (key: string, extra: Record<string, unknown> = {}) => api('POST', '/api/levels/browse', { key, ...extra });

  test('share, list newest and top, play, like, unshare', async () => {
    await reg(k('a'), 'Builder Bee');
    await reg(k('b'), 'Racing Rhino');
    assert.equal((await api('POST', '/api/levels/publish', { key: k('a'), localId: 'abc123def456', code: code(2) })).status, 400, 'too empty');
    const pub = await api('POST', '/api/levels/publish', { key: k('a'), localId: 'abc123def456', code: code(8) });
    assert.equal(pub.status, 200, JSON.stringify(pub.json));
    // Sharing the same level again updates it in place.
    const again = await api('POST', '/api/levels/publish', { key: k('a'), localId: 'abc123def456', code: code(9) });
    assert.equal(again.json.id, pub.json.id);
    assert.equal(again.json.updated, true);
    const id = pub.json.id as string;
    let list = await browse(k('b'), { tab: 'new' });
    const seen = list.json.levels.find((l: any) => l.id === id);
    assert.equal(seen.author, 'Builder Bee');
    assert.equal(seen.mine, false);
    assert.equal(seen.code, code(9));
    // Suggested shows levels you haven't played yet.
    assert.ok((await browse(k('b'), { tab: 'suggested' })).json.levels.some((l: any) => l.id === id));
    assert.equal((await api('POST', `/api/levels/${id}/play`, { key: k('b'), cleared: false })).json.plays, 1);
    const p2 = await api('POST', `/api/levels/${id}/play`, { key: k('b'), cleared: true });
    assert.deepEqual(p2.json, { plays: 1, clears: 1 });
    assert.ok(!(await browse(k('b'), { tab: 'suggested' })).json.levels.some((l: any) => l.id === id));
    // Your own plays and likes don't count.
    await api('POST', `/api/levels/${id}/play`, { key: k('a'), cleared: true });
    assert.equal((await api('POST', `/api/levels/${id}/like`, { key: k('a') })).status, 400);
    assert.equal((await api('POST', `/api/levels/${id}/like`, { key: k('b') })).json.likes, 1);
    assert.equal((await api('POST', `/api/levels/${id}/like`, { key: k('b') })).json.likes, 1);
    list = await browse(k('b'), { tab: 'top' });
    const top = list.json.levels.find((l: any) => l.id === id);
    assert.equal(top.liked, true);
    assert.equal(top.played, true);
    // The builder sees their numbers (for badges) and their own levels.
    const mine = await browse(k('a'), { tab: 'top', scope: 'mine' });
    assert.deepEqual(mine.json.stats, { shared: 1, plays: 1, clears: 1, likes: 1 });
    assert.equal(mine.json.levels[0].mine, true);
    assert.equal(mine.json.levels[0].pro, false);
    // A Creator Spotlight fetches one level by id; the Builder Pack tag rides along on publish.
    const one = await api('POST', `/api/levels/${id}/get`, { key: k('b') });
    assert.equal(one.status, 200);
    assert.equal(one.json.level.id, id);
    assert.equal(one.json.level.vote, 1);
    assert.equal((await api('POST', '/api/levels/nosuchlevel/get', { key: k('b') })).status, 404);
    await api('POST', '/api/levels/publish', { key: k('a'), localId: 'abc123def456', code: code(9), pro: true });
    assert.equal((await api('POST', `/api/levels/${id}/get`, { key: k('b') })).json.level.pro, true);
    assert.equal((await api('POST', `/api/levels/${id}/like`, { key: k('b'), like: false })).json.likes, 0);
    assert.equal((await api('POST', `/api/levels/${id}/unpublish`, { key: k('b') })).status, 200);
    assert.ok((await browse(k('b'), { tab: 'new' })).json.levels.some((l: any) => l.id === id), 'only the builder can unshare');
    await api('POST', `/api/levels/${id}/unpublish`, { key: k('a') });
    assert.ok(!(await browse(k('b'), { tab: 'new' })).json.levels.some((l: any) => l.id === id));
  });

  test('friends tab, blocks, kids and typed titles', async () => {
    const a = await reg(k('c'), 'Comet Cat');
    await reg(k('d'), 'Dizzy Duck');
    await reg(k('e'), 'Speedy Panda 7', { kid: true });
    assert.equal((await api('POST', '/api/levels/publish', { key: k('e'), localId: 'kidlevel0001', code: code(6, 'My Level') })).status, 400, 'typed titles are 13+');
    const kidPub = await api('POST', '/api/levels/publish', { key: k('e'), localId: 'kidlevel0001', code: code(6) });
    assert.equal(kidPub.status, 200);
    assert.equal((await api('POST', '/api/levels/publish', { key: k('c'), localId: 'catlevel0001', code: code(6, 'call 5551234') })).status, 400);
    const pub = await api('POST', '/api/levels/publish', { key: k('c'), localId: 'catlevel0001', code: code(6, 'Spike Party') });
    assert.equal(pub.status, 200);
    assert.equal((await browse(k('d'), { scope: 'friends' })).json.levels.length, 0);
    await api('POST', '/api/friends/add', { key: k('d'), handle: `Comet Cat#${a.json.tag}` });
    const sync = await api('POST', '/api/friends/sync', { key: k('c') });
    await api('POST', '/api/friends/respond', { key: k('c'), id: sync.json.incoming[0].id, accept: true });
    const fr = await browse(k('d'), { scope: 'friends' });
    assert.deepEqual(
      fr.json.levels.map((l: any) => [l.id, l.friend]),
      [[pub.json.id, true]],
    );
    // Profile cards: sent with sync, seen by friends and from a level's builder name.
    await api('POST', '/api/friends/sync', { key: k('c'), card: { lv: 7, tag: a.json.tag, show: [] }, skin: 'neon' });
    const fc = await api('POST', '/api/friends/card', { key: k('d'), id: a.json.id });
    assert.equal(fc.status, 200);
    assert.equal(fc.json.name, 'Comet Cat');
    assert.equal(fc.json.skin, 'neon');
    assert.equal(fc.json.card.lv, 7);
    assert.equal((await api('POST', '/api/friends/card', { key: k('e'), id: a.json.id })).status, 404, 'friends only');
    assert.equal((await api('POST', `/api/levels/${pub.json.id}/author`, { key: k('e') })).json.card.lv, 7);
    assert.equal((await api('POST', '/api/friends/sync', { key: k('c'), card: { junk: 'x'.repeat(3000) } })).status, 200);
    assert.equal((await api('POST', '/api/friends/card', { key: k('d'), id: a.json.id })).json.card.lv, 7, 'oversized cards are ignored');
    // An under-13's #number never leaves on their card.
    await api('POST', '/api/friends/sync', { key: k('e'), card: { lv: 3, tag: 1234 } });
    const kidCard = await api('POST', `/api/levels/${kidPub.json.id}/author`, { key: k('d') });
    assert.equal(kidCard.json.card.lv, 3);
    assert.equal(kidCard.json.card.tag, undefined);
    // Blocking someone hides their levels and their card.
    await api('POST', '/api/friends/block', { key: k('d'), id: a.json.id });
    assert.ok(!(await browse(k('d'), { tab: 'new' })).json.levels.some((l: any) => l.id === pub.json.id));
    assert.equal((await api('POST', `/api/levels/${pub.json.id}/author`, { key: k('d') })).status, 404);
  });

  test('thumbs up and down: Highest Rated and Trending', async () => {
    await reg(k('r1'), 'Rated Robin');
    await reg(k('r2'), 'Rated Raven');
    const good = (await api('POST', '/api/levels/publish', { key: k('r1'), localId: 'goodlevel001', code: code(10) })).json.id as string;
    const meh = (await api('POST', '/api/levels/publish', { key: k('r1'), localId: 'mehlevel0001', code: code(11) })).json.id as string;
    // Rating needs a play first.
    assert.equal((await api('POST', `/api/levels/${good}/like`, { key: k('r2'), vote: 1 })).status, 400);
    const voters = ['v1', 'v2', 'v3', 'v4'];
    for (const v of voters) {
      await reg(k(v), 'Voting Vole');
      await api('POST', `/api/levels/${good}/play`, { key: k(v), cleared: true });
      await api('POST', `/api/levels/${meh}/play`, { key: k(v), cleared: false });
      await api('POST', `/api/levels/${good}/like`, { key: k(v), vote: 1 });
    }
    // Two thumbs down on meh, one changes its mind to up.
    assert.deepEqual((await api('POST', `/api/levels/${meh}/like`, { key: k('v1'), vote: -1 })).json, { liked: false, vote: -1, likes: 0, dislikes: 1 });
    await api('POST', `/api/levels/${meh}/like`, { key: k('v2'), vote: -1 });
    assert.deepEqual((await api('POST', `/api/levels/${meh}/like`, { key: k('v2'), vote: 1 })).json, { liked: true, vote: 1, likes: 1, dislikes: 1 });
    const rated = (await browse(k('r2'), { tab: 'top' })).json.levels.map((l: any) => l.id);
    assert.ok(rated.indexOf(good) < rated.indexOf(meh));
    const mine = (await browse(k('v1'), { tab: 'top' })).json.levels.find((l: any) => l.id === meh);
    assert.equal(mine.vote, -1);
    assert.equal(mine.dislikes, 1);
    const trending = (await browse(k('r2'), { tab: 'trending' })).json.levels.map((l: any) => l.id);
    assert.equal(trending[0], good);
    // Taking a vote back.
    assert.equal((await api('POST', `/api/levels/${meh}/like`, { key: k('v1'), vote: 0 })).json.dislikes, 0);
  });

  test('three reports hide a level until a moderator restores it', async () => {
    await reg(k('f'), 'Funky Fox');
    const pub = await api('POST', '/api/levels/publish', { key: k('f'), localId: 'foxlevel0001', code: code(7) });
    const id = pub.json.id as string;
    for (const c of ['g', 'h', 'i']) {
      await reg(k(c), 'Grumpy Goat');
      await api('POST', `/api/levels/${id}/report`, { key: k(c), reason: 'impossible' });
    }
    assert.ok(!(await browse(k('g'), { tab: 'new' })).json.levels.some((l: any) => l.id === id));
    assert.equal((await api('POST', `/api/levels/${id}/play`, { key: k('g') })).status, 404);
    const listed = await api('GET', '/api/admin/levels?filter=hidden', undefined, ADMIN);
    assert.ok(listed.json.levels.some((l: any) => l.id === id && l.reasons[0].reason === 'impossible'));
    assert.equal((await api('POST', `/api/admin/levels/${id}/hide`, { hidden: false }, ADMIN)).json.ok, true);
    assert.ok((await browse(k('g'), { tab: 'new' })).json.levels.some((l: any) => l.id === id));
    assert.equal((await api('GET', '/api/admin/levels')).status, 401);
  });
});

describe('free chat switched off', () => {
  test('without FREE_CHAT=true there is no sign-up and no chat socket', async () => {
    const cfg = loadConfig({ NODE_ENV: 'test', DB_FILE: ':memory:', TOKEN_SECRET: 't'.repeat(48), PORT: '0' });
    const off = createServer(cfg, { mailer, log: () => {} });
    const port = await off.listen(0);
    const url = `http://127.0.0.1:${port}`;
    try {
      const status = (await (await fetch(url + '/api/status')).json()) as Record<string, unknown>;
      assert.equal(status.freeChat, false);
      const start = await fetch(url + '/api/account/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@example.com', birthYear: YEAR - 30 }) });
      assert.equal(start.status, 403);
      const ws = new WebSocket(url.replace('http', 'ws') + '/chat');
      const opened = await new Promise<boolean>((r) => {
        ws.addEventListener('open', () => r(true));
        ws.addEventListener('error', () => r(false));
        ws.addEventListener('close', () => r(false));
      });
      assert.equal(opened, false);
      // Friends still work.
      assert.equal((await fetch(url + '/api/players/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'z'.repeat(20), name: 'Neon Fox' }) })).status, 200);
    } finally {
      await off.close();
    }
  });
});

describe('beta tester sign-ups', () => {
  test('sign up from the website, grown-ups only; the studio lists, updates and exports them', async () => {
    const page = await fetch(base + '/beta');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Test Polygon Rush early/);
    assert.equal((await api('POST', '/api/testers', { email: 'kid@example.com', channel: 'apk' })).status, 400, 'adult box required');
    assert.equal((await api('POST', '/api/testers', { email: 'nope', adult: true })).status, 400);
    const ok = await api('POST', '/api/testers', { email: 'Tester@Example.com', name: 'Sam', device: 'Pixel 8', channel: 'apk', note: '=cmd|calc', adult: true });
    assert.equal(ok.status, 200);
    // Same email again updates instead of duplicating; bots filling the honeypot are ignored.
    await api('POST', '/api/testers', { email: 'tester@example.com', name: 'Sam', channel: 'play', note: '=cmd|calc', adult: true });
    await api('POST', '/api/testers', { email: 'bot@example.com', adult: true, website: 'spam' });
    assert.equal((await api('GET', '/api/admin/testers')).status, 401);
    let list = (await api('GET', '/api/admin/testers', undefined, ADMIN)).json.testers;
    assert.equal(list.length, 1);
    assert.equal(list[0].channel, 'play');
    assert.equal(list[0].status, 'new');
    assert.equal((await api('POST', `/api/admin/testers/${list[0].id}`, { status: 'apk_sent' }, ADMIN)).json.ok, true);
    assert.equal((await api('POST', `/api/admin/testers/${list[0].id}`, { status: 'whatever' }, ADMIN)).status, 400);
    const csv = await (await fetch(base + '/api/admin/testers.csv', { headers: { authorization: `Bearer ${ADMIN}` } })).text();
    assert.match(csv, /^email,name,phone,wants,status,note,signed_up/);
    assert.match(csv, /"apk_sent"/);
    assert.match(csv, /"'=cmd\|calc"/, 'formulas are neutralised');
    list = (await api('GET', '/api/admin/testers?status=apk_sent', undefined, ADMIN)).json.testers;
    assert.equal(list.length, 1);
    assert.equal((await api('DELETE', `/api/admin/testers/${list[0].id}`, undefined, ADMIN)).json.ok, true);
    assert.equal((await api('GET', '/api/admin/testers', undefined, ADMIN)).json.testers.length, 0);
  });
});

describe('promo codes', () => {
  const key = (c: string) => `promo${c}`.repeat(4);
  const reg = (k: string, name: string) => api('POST', '/api/players/register', { key: k, name });

  test('admin makes a code, each player redeems it once, limits and switches hold', async () => {
    await reg(key('a'), 'Builder Bee');
    await reg(key('b'), 'Racing Rhino');
    await reg(key('c'), 'Turbo Toad');
    assert.equal((await api('POST', '/api/admin/promos', { code: 'NOPE', reward: { gems: 5 } })).status, 401);
    assert.equal((await api('POST', '/api/admin/promos', { code: 'EMPTY1', reward: {} }, ADMIN)).status, 400);
    const made = await api('POST', '/api/admin/promos', { code: 'spooky-500', reward: { gems: 500, skins: ['golden', 'Bad Id!'], bogus: 1 }, maxUses: 2, note: 'Happy Halloween!' }, ADMIN);
    assert.equal(made.status, 200, JSON.stringify(made.json));
    assert.equal(made.json.promo.code, 'SPOOKY500');
    assert.deepEqual(made.json.promo.reward, { gems: 500, skins: ['golden'] });
    assert.equal((await api('POST', '/api/admin/promos', { code: 'SPOOKY500', reward: { gems: 1 } }, ADMIN)).status, 409);

    // Typed loosely: case, spaces and dashes don't matter.
    const r = await api('POST', '/api/promos/redeem', { key: key('a'), code: ' spooky 500 ' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json, { code: 'SPOOKY500', reward: { gems: 500, skins: ['golden'] }, note: 'Happy Halloween!' });
    assert.equal((await api('POST', '/api/promos/redeem', { key: key('a'), code: 'SPOOKY500' })).json.error, 'used');
    assert.equal((await api('POST', '/api/promos/redeem', { key: key('b'), code: 'SPOOKY500' })).status, 200);
    assert.equal((await api('POST', '/api/promos/redeem', { key: key('c'), code: 'SPOOKY500' })).json.error, 'used_up');
    assert.equal((await api('POST', '/api/promos/redeem', { key: key('c'), code: 'NOTACODE' })).json.error, 'bad_code');

    await api('POST', '/api/admin/promos', { code: 'GEMS100', reward: { gems: 100 } }, ADMIN);
    assert.equal((await api('POST', '/api/admin/promos/GEMS100', { disabled: true }, ADMIN)).json.ok, true);
    assert.equal((await api('POST', '/api/promos/redeem', { key: key('c'), code: 'GEMS100' })).json.error, 'bad_code');
    await api('POST', '/api/admin/promos/GEMS100', { disabled: false }, ADMIN);
    assert.equal((await api('POST', '/api/promos/redeem', { key: key('c'), code: 'GEMS100' })).json.reward.gems, 100);
    const list = (await api('GET', '/api/admin/promos', undefined, ADMIN)).json.promos;
    assert.equal(list.find((p: any) => p.code === 'SPOOKY500').uses, 2);
  });

  test('guessing codes is slowed down', async () => {
    await reg(key('d'), 'Lucky Llama');
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await api('POST', '/api/promos/redeem', { key: key('d'), code: `GUESS${i}X` })).status;
    assert.equal(last, 429);
  });
});

describe('web editor', () => {
  const key = (c: string) => `cloud${c}`.repeat(4);
  const reg = (k: string, name: string) => api('POST', '/api/players/register', { key: k, name });
  const code = (spikes: number): string => {
    const out = [2, 1, 0, (1 << 4) | 1, 100, 0, 3, 4, 0, 0, spikes];
    for (let i = 0; i < spikes; i++) out.push(i === 0 ? 10 : 3, 2 << 4);
    const c = levelChecksum(out);
    out.push(c >> 8, c & 0xff);
    return 'PR1-' + Buffer.from(out).toString('base64url');
  };

  test('link a browser, levels on both sides, test on the phone', async () => {
    await reg(key('a'), 'Builder Bee');
    assert.equal((await api('POST', '/api/cloud/pair', { key: key('a') })).status, 403, 'needs the Builder Pack');
    const pair = await api('POST', '/api/cloud/pair', { key: key('a'), builder: true, band: 'adult' });
    assert.equal(pair.status, 200, JSON.stringify(pair.json));
    assert.match(pair.json.code, /^[A-Z2-9]{6}$/);
    assert.equal((await api('POST', '/api/cloud/link', { code: 'ZZZZZZ' })).status, 404);
    const link = await api('POST', '/api/cloud/link', { code: pair.json.code.toLowerCase() });
    assert.equal(link.status, 200, JSON.stringify(link.json));
    assert.equal(link.json.name, 'Builder Bee');
    assert.equal(link.json.band, 'adult');
    const web = link.json.token as string;
    // A code works once.
    assert.equal((await api('POST', '/api/cloud/link', { code: pair.json.code })).status, 404);
    assert.equal((await api('POST', '/api/cloud/me', {}, web)).json.name, 'Builder Bee');
    assert.deepEqual((await api('POST', '/api/cloud/status', { key: key('a') })).json, { browsers: 1, webActive: true });

    // Built on the web, seen on the phone with its tag.
    assert.equal((await api('POST', '/api/cloud/levels/put', { id: 'webbuilt01', code: code(6), updated: 1000 }, web)).status, 200);
    assert.equal((await api('POST', '/api/cloud/levels/put', { id: 'webbuilt01', code: 'junk', updated: 2000 }, web)).status, 400);
    let phone = (await api('POST', '/api/cloud/levels', { key: key('a') })).json.levels;
    assert.deepEqual(phone, [{ id: 'webbuilt01', code: code(6), madeOn: 'web', verified: false, updated: 1000, deleted: false }]);
    // The phone edits it: newer wins, the tag stays "web"; an older edit is ignored.
    await api('POST', '/api/cloud/levels/put', { key: key('a'), id: 'webbuilt01', code: code(7), updated: 3000, madeOn: 'mobile', verified: true });
    assert.equal((await api('POST', '/api/cloud/levels/put', { id: 'webbuilt01', code: code(5), updated: 2500 }, web)).json.stored, false);
    const [l] = (await api('POST', '/api/cloud/levels', {}, web)).json.levels;
    assert.equal(l.code, code(7));
    assert.equal(l.madeOn, 'web');
    assert.equal(l.verified, true);
    // Deleting leaves a marker for the other side.
    await api('POST', '/api/cloud/levels/delete', { key: key('a'), id: 'webbuilt01', updated: 4000 });
    phone = (await api('POST', '/api/cloud/levels', {}, web)).json.levels;
    assert.equal(phone[0].deleted, true);

    // Test on the phone: handed over once, the result comes back to the browser.
    const sent = await api('POST', '/api/cloud/test', { id: 'webbuilt02', code: code(6) }, web);
    assert.equal(sent.status, 200);
    const inbox = await api('POST', '/api/cloud/inbox', { key: key('a') });
    assert.equal(inbox.json.test.code, code(6));
    assert.equal((await api('POST', '/api/cloud/inbox', { key: key('a') })).json.test, null);
    assert.equal((await api('POST', '/api/cloud/test/status', {}, web)).json.test.delivered, true);
    await api('POST', '/api/cloud/test/result', { key: key('a'), sent: inbox.json.test.sent, progress: 0.64, completed: false });
    assert.deepEqual((await api('POST', '/api/cloud/test/status', {}, web)).json.test.result, { progress: 0.64, completed: false });

    // Signing out every browser from the phone.
    await api('POST', '/api/cloud/unlink', { key: key('a') });
    assert.equal((await api('POST', '/api/cloud/me', {}, web)).status, 401);
    assert.equal((await api('POST', '/api/cloud/levels', {}, 'not-a-token')).status, 401);
  });

  test('another player can’t see your levels', async () => {
    await reg(key('b'), 'Racing Rhino');
    await api('POST', '/api/cloud/levels/put', { key: key('b'), id: 'rhinolevel', code: code(6) });
    const pair = await api('POST', '/api/cloud/pair', { key: key('b'), builder: true });
    const web = (await api('POST', '/api/cloud/link', { code: pair.json.code })).json.token;
    const mine = (await api('POST', '/api/cloud/levels', {}, web)).json.levels.map((x: any) => x.id);
    assert.deepEqual(mine, ['rhinolevel']);
  });
});
