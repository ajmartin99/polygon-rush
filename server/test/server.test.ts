import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { loadConfig } from '../src/config.ts';
import { createServer, type Server } from '../src/index.ts';
import type { Mail, Mailer } from '../src/mailer.ts';

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
  const cfg = loadConfig({ NODE_ENV: 'test', DB_FILE: ':memory:', TOKEN_SECRET: 's'.repeat(48), ADMIN_TOKEN: ADMIN, PORT: '0', IP_LIMIT_PER_HOUR: '1000' });
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
