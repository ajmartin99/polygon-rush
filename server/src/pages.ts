import type { Config } from './config.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLE = `body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#1a1040;color:#fff;line-height:1.5}
main{max-width:34rem;margin:0 auto;padding:2rem 1.2rem}h1{color:#ffd23f;font-size:1.6rem}a{color:#3ad7ff}
input,button{font:inherit;font-size:1rem;padding:.6rem .8rem;border-radius:.6rem;border:2px solid #5b48b8;background:#24186a;color:#fff;width:100%;box-sizing:border-box;margin:.3rem 0}
button{background:#ff4f5e;border-color:#ff4f5e;font-weight:700;cursor:pointer}p.muted{color:#c9c2ee;font-size:.9rem}#msg{min-height:1.5em;font-weight:600}`;

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
<p class="muted">Deleting removes the account, its email address and its chat messages. Messages that are part of an open safety report are kept until the report is closed, as described in the privacy policy. You can also delete the account inside the game: Settings → Chat → Delete chat account.</p>
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
