import type { Config } from './config.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLE = `body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#1a1040;color:#fff;line-height:1.5}
main{max-width:34rem;margin:0 auto;padding:2rem 1.2rem}h1{color:#ffd23f;font-size:1.6rem}a{color:#3ad7ff}
input,button,select,textarea{font:inherit;font-size:1rem;padding:.6rem .8rem;border-radius:.6rem;border:2px solid #5b48b8;background:#24186a;color:#fff;width:100%;box-sizing:border-box;margin:.3rem 0}
button{background:#ff4f5e;border-color:#ff4f5e;font-weight:700;cursor:pointer}p.muted{color:#c9c2ee;font-size:.9rem}#msg{min-height:1.5em;font-weight:600}
label{display:block;margin-top:.7rem;font-weight:600}label.check{display:flex;gap:.6rem;align-items:flex-start;font-weight:400}label.check input{width:auto;margin-top:.35rem}
select,textarea{width:100%;box-sizing:border-box;padding:.6rem .8rem;border-radius:.6rem;border:2px solid #5b48b8;background:#24186a;color:#fff;margin:.3rem 0}
button.go{background:#3ee6b0;border-color:#3ee6b0;color:#053a2a}.hp{position:absolute;left:-9999px}
table{border-collapse:collapse;width:100%;font-size:.85rem}td,th{border-bottom:1px solid #3a2d7a;padding:.4rem;text-align:left;vertical-align:top}td button{width:auto;padding:.2rem .5rem;font-size:.8rem}`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

export function landingPage(cfg: Config): string {
  return page(
    'Polygon Rush community server',
    `<h1>Polygon Rush</h1><p>This server connects Polygon Rush players for online rooms, public build rooms and moderated Free Chat.</p>
<p><a href="/account/delete">Delete a Free Chat account</a>${cfg.supportEmail ? ` · Contact: <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a>` : ''}</p>`,
  );
}

export function deletePage(cfg: Config): string {
  return page(
    'Delete your Polygon Rush chat account',
    `<h1>Delete a Free Chat account</h1>
<p>Enter the email address used to verify the Free Chat account (for players aged 13–15 this is the parent's or guardian's email). We'll send a code to confirm.</p>
<p class="muted">Deleting removes every chat account verified with this email address (a parent's email covers each teen they approved), the email address and the chat messages. Messages that are part of an open safety report are kept until the report is closed, and a one-way hash of the email with any mute or ban is kept for 90 days so deleting can't be used to dodge safety action, as described in the privacy policy. You can also delete the account inside the game: Settings → Chat → Delete chat account.</p>
<form id="f1"><input id="email" type="email" required autocomplete="email" placeholder="Email address"><button type="submit">Send code</button></form>
<form id="f2" hidden><input id="code" inputmode="numeric" pattern="[0-9]{6}" required placeholder="6-digit code"><button type="submit">Delete account</button></form>
<p id="msg" role="status"></p>${cfg.supportEmail ? `<p class="muted">Need help? <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a></p>` : ''}
<script src="/account/delete.js"></script>`,
  );
}

export const DELETE_JS = `(() => {
  const $ = (id) => document.getElementById(id);
  const say = (t) => { $('msg').textContent = t; };
  const post = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || 'Something went wrong.');
    return j;
  };
  $('f1').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await post('/api/account/delete/start', { email: $('email').value });
      $('f1').hidden = true; $('f2').hidden = false;
      say('If that email has a chat account, a code is on its way. Check your inbox.');
    } catch (err) { say(err.message); }
  });
  $('f2').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await post('/api/account/delete/confirm', { email: $('email').value, code: $('code').value });
      $('f2').hidden = true;
      say('Done. The chat account has been deleted.');
    } catch (err) { say(err.message); }
  });
})();`;

export function betaPage(): string {
  return page(
    'Test Polygon Rush early',
    `<h1>Test Polygon Rush early</h1>
<p>Play new versions before anyone else and help us make the game better. Join and you get the <b>Founding Tester</b> title right away. Play 5 minutes a day to earn the rest: the <b>Debug Pixels</b> trail and 🧪 emote after 7 days, the <b>Beta Bot</b> skin and 500 gems after 12. They're yours forever, and gone for good at the full release.</p>
<p class="muted">For grown-ups: testers must be 18 or older, or a parent or guardian signing up for their child. Android only for now.</p>
<form id="f">
<label for="email">Email for Google Play</label>
<input id="email" type="email" required autocomplete="email" placeholder="The Google account on the phone">
<label for="name">First name (optional)</label>
<input id="name" maxlength="40" autocomplete="given-name">
<label for="device">Phone model (optional)</label>
<input id="device" maxlength="60" placeholder="e.g. Pixel 8, Galaxy A15">
<label for="channel">How would you like to test?</label>
<select id="channel"><option value="play">Google Play closed test (easiest, updates itself)</option><option value="apk">Install an APK file myself (sideload)</option><option value="either">Either is fine</option></select>
<label for="note">Anything else? (optional)</label>
<textarea id="note" maxlength="300" rows="3"></textarea>
<input class="hp" id="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<label class="check"><input id="adult" type="checkbox" required> I'm 18 or older, or I'm a parent or guardian signing up for my child.</label>
<button class="go" type="submit">Sign me up</button>
</form>
<p id="msg" role="status"></p>
<p class="muted">We only use this to invite you to the test and send you the download. Ask us to delete it any time at <a href="mailto:privacy@softgamebros.com">privacy@softgamebros.com</a>. <a href="https://softgamebros.com/polygon-rush/privacy/">Privacy policy</a></p>
<script src="/beta.js"></script>`,
  );
}

export const BETA_JS = `(() => {
  const $ = (id) => document.getElementById(id);
  $('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { email: $('email').value, name: $('name').value, device: $('device').value, channel: $('channel').value, note: $('note').value, adult: $('adult').checked, website: $('website').value };
    try {
      const r = await fetch('/api/testers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || 'Something went wrong.');
      $('f').hidden = true;
      $('msg').textContent = 'Thanks! You are on the list. We will email you an invite soon.';
    } catch (err) { $('msg').textContent = err.message; }
  });
})();`;

export function betaAdminPage(): string {
  return page(
    'Beta testers',
    `<h1>Beta testers</h1>
<form id="login"><input id="token" type="password" autocomplete="off" placeholder="Admin token (ADMIN_TOKEN on Render)"><button class="go" type="submit">Show sign-ups</button></form>
<div id="out" hidden><p><span id="count"></span> · <a href="#" id="csv">Download CSV</a></p><table><thead><tr><th>Email</th><th>Name / phone</th><th>Wants</th><th>Note</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
<p id="msg" role="status"></p>
<script src="/beta/admin.js"></script>`,
  );
}

export const BETA_ADMIN_JS = `(() => {
  const $ = (id) => document.getElementById(id);
  const WANTS = { play: 'Google Play', apk: 'APK', either: 'Either' };
  const STATUS = ['new', 'invited', 'apk_sent', 'declined'];
  let token = sessionStorage.getItem('prAdmin') || '';
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) throw new Error('Wrong admin token.');
    if (!r.ok) throw new Error('Something went wrong.');
    return r;
  };
  const cell = (tr, text) => { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; };
  const load = async () => {
    const list = (await (await api('GET', '/api/admin/testers')).json()).testers;
    sessionStorage.setItem('prAdmin', token);
    $('login').hidden = true; $('out').hidden = false; $('msg').textContent = '';
    $('count').textContent = list.length + ' sign-ups';
    const rows = $('rows'); rows.textContent = '';
    for (const t of list) {
      const tr = document.createElement('tr');
      cell(tr, t.email);
      cell(tr, [t.name, t.device].filter(Boolean).join(' · ') || '-');
      cell(tr, WANTS[t.channel] || t.channel);
      cell(tr, t.note || '');
      const sel = document.createElement('select');
      for (const s of STATUS) { const o = document.createElement('option'); o.value = s; o.textContent = s.replace('_', ' '); o.selected = s === t.status; sel.appendChild(o); }
      sel.addEventListener('change', () => api('POST', '/api/admin/testers/' + t.id, { status: sel.value }).catch((e) => ($('msg').textContent = e.message)));
      cell(tr, '').appendChild(sel);
      const del = document.createElement('button'); del.textContent = 'Delete';
      del.addEventListener('click', async () => { if (confirm('Delete ' + t.email + '?')) { await api('DELETE', '/api/admin/testers/' + t.id); load(); } });
      cell(tr, '').appendChild(del);
      rows.appendChild(tr);
    }
  };
  $('login').addEventListener('submit', (e) => { e.preventDefault(); token = $('token').value.trim(); load().catch((err) => ($('msg').textContent = err.message)); });
  $('csv').addEventListener('click', async (e) => {
    e.preventDefault();
    const blob = await (await api('GET', '/api/admin/testers.csv')).blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'polygon-rush-testers.csv'; a.click();
  });
  if (token) load().catch(() => { sessionStorage.removeItem('prAdmin'); $('login').hidden = false; });
})();`;

export function promoAdminPage(): string {
  return page(
    'Promo codes',
    `<h1>Promo codes</h1>
<form id="login"><input id="token" type="password" autocomplete="off" placeholder="Admin token (ADMIN_TOKEN on Render)"><button class="go" type="submit">Open</button></form>
<div id="out" hidden>
<h2>New code</h2>
<form id="make">
<p><input id="code" required maxlength="24" placeholder="Code, e.g. SPOOKY500 (letters and numbers)"></p>
<p><input id="gems" type="number" min="0" max="50000" placeholder="Gems"> <input id="regens" type="number" min="0" max="20" placeholder="Heart Regens"></p>
<p><input id="skins" placeholder="Skin ids, comma separated (optional)"></p>
<p><input id="trails" placeholder="Trail ids, comma separated (optional)"></p>
<p><input id="emotes" placeholder="Emote ids, comma separated (optional)"></p>
<p><input id="uses" type="number" min="0" placeholder="Max uses (empty = no limit)"> Ends <input id="ends" type="date"></p>
<p><input id="note" maxlength="80" placeholder="Message players see, e.g. Happy Halloween!"></p>
<button class="go" type="submit">Create code</button>
</form>
<p class="muted">Each player can use a code once. Item ids are listed in docs/PROMOS.md.</p>
<h2>Codes</h2>
<table><thead><tr><th>Code</th><th>Gives</th><th>Used</th><th>Ends</th><th>Note</th><th></th><th></th></tr></thead><tbody id="rows"></tbody></table>
</div>
<p id="msg" role="status"></p>
<script src="/promos/admin.js"></script>`,
  );
}

export const PROMO_ADMIN_JS = `(() => {
  const $ = (id) => document.getElementById(id);
  let token = sessionStorage.getItem('prAdmin') || '';
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Wrong admin token.');
    if (!r.ok) throw new Error(j.message || 'Something went wrong.');
    return j;
  };
  const say = (t) => { $('msg').textContent = t; };
  const ids = (v) => v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const gives = (r) => [r.gems ? r.gems + ' gems' : '', r.regens ? r.regens + ' Heart Regens' : '', ...(r.skins || []).map((s) => 'skin ' + s), ...(r.trails || []).map((s) => 'trail ' + s), ...(r.emotes || []).map((s) => 'emote ' + s)].filter(Boolean).join(', ');
  const cell = (tr, text) => { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; };
  const load = async () => {
    const list = (await api('GET', '/api/admin/promos')).promos;
    sessionStorage.setItem('prAdmin', token);
    $('login').hidden = true; $('out').hidden = false;
    const rows = $('rows'); rows.textContent = '';
    for (const p of list) {
      const tr = document.createElement('tr');
      cell(tr, p.code + (p.disabled ? ' (off)' : ''));
      cell(tr, gives(p.reward));
      cell(tr, p.uses + (p.maxUses ? ' / ' + p.maxUses : ''));
      cell(tr, p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : '-');
      cell(tr, p.note);
      const off = document.createElement('button'); off.textContent = p.disabled ? 'Turn on' : 'Turn off';
      off.addEventListener('click', () => api('POST', '/api/admin/promos/' + p.code, { disabled: !p.disabled }).then(load).catch((e) => say(e.message)));
      cell(tr, '').appendChild(off);
      const del = document.createElement('button'); del.textContent = 'Delete';
      del.addEventListener('click', async () => { if (confirm('Delete ' + p.code + '? Players who used it keep what they got.')) { await api('DELETE', '/api/admin/promos/' + p.code); load(); } });
      cell(tr, '').appendChild(del);
      rows.appendChild(tr);
    }
  };
  $('login').addEventListener('submit', (e) => { e.preventDefault(); token = $('token').value.trim(); load().catch((err) => say(err.message)); });
  $('make').addEventListener('submit', async (e) => {
    e.preventDefault();
    const num = (id) => Number($(id).value) || 0;
    const ends = $('ends').value ? new Date($('ends').value + 'T23:59:59').getTime() : 0;
    try {
      const { promo } = await api('POST', '/api/admin/promos', {
        code: $('code').value,
        reward: { gems: num('gems'), regens: num('regens'), skins: ids($('skins').value), trails: ids($('trails').value), emotes: ids($('emotes').value) },
        maxUses: num('uses'),
        expiresAt: ends,
        note: $('note').value,
      });
      say('Created ' + promo.code + '.');
      $('make').reset();
      load();
    } catch (err) { say(err.message); }
  });
  if (token) load().catch(() => { sessionStorage.removeItem('prAdmin'); $('login').hidden = false; });
})();`;
