import { CONFIG } from '../config';
import { canOfferFreeChat, canUsePublicRooms, freeChatPath, freeChatReady, RULES_VERSION, serverAvailable } from '../meta/community';
import { account } from '../services/account';
import { ServerError } from '../services/server';
import { store } from '../state/store';
import { button, confirm, parentalGate, toggle } from './components';
import { append, clear, h, ic } from './dom';
import { ui } from './ui';

const RULES = [
  ['heart', 'Be kind', 'No bullying, threats, mean words or rude drawings.'],
  ['privacy', 'Keep personal info private', 'Never share or ask for real names, ages, addresses, schools, phone numbers, emails, photos or usernames from other apps.'],
  ['lock', 'Stay in the game', 'Never agree to chat or meet on another app with someone you met here.'],
  ['report', 'Mute, report, tell', 'If anything feels wrong, tap the flag to mute and report, and tell a grown-up you trust.'],
  ['shield', 'We check reports', 'Free Chat messages are kept for 30 days so our safety team can look at reports. Breaking the rules gets accounts muted or banned.'],
] as const;

/** Community Rules. With `ask`, resolves true only when the player agrees. */
export function openCommunityRules(ask = false): Promise<boolean> {
  return new Promise((resolve) => {
    let agreed = false;
    const m = ui.modal(
      [
        h('h2', null, 'Community Rules'),
        h(
          'div.body-scroll.rules',
          null,
          RULES.map(([icon, title, text]) => h('div.rule', null, ic(icon), h('div', null, h('b', null, title), h('p', null, text)))),
        ),
        ask
          ? h(
              'div.actions',
              null,
              button({ label: 'Not now', cls: 'ghost lg', onClick: () => m.close(), sfx: 'back' }),
              button({
                label: 'I agree',
                icon: 'check',
                cls: 'mint lg',
                onClick: () => {
                  agreed = true;
                  store.data.account.rules = RULES_VERSION;
                  store.commit();
                  m.close();
                },
              }),
            )
          : null,
      ],
      { wide: true, showClose: !ask, onClose: () => resolve(agreed) },
    );
  });
}

export async function ensureRules(): Promise<boolean> {
  if (store.data.account.rules >= RULES_VERSION) return true;
  return openCommunityRules(true);
}

/**
 * Turn on Free Chat: 16+ verify their own email; 13-15 hand the device to a
 * parent or guardian, who passes the grown-up check and verifies THEIR email.
 */
export async function startFreeChatSignup(): Promise<boolean> {
  const path = freeChatPath(store.data.profile.birthYear);
  if (path === 'none' || !canOfferFreeChat(store.data)) return false;
  if (path === 'parent') {
    const go = await confirm(
      'Ask a parent or guardian',
      'Free Chat for players aged 13–15 needs a parent’s permission. Please hand the device to your parent or guardian: they’ll enter their own email and get a code.',
      'Continue',
      'Not now',
    );
    if (!go) return false;
    if (!(await parentalGate('This step is for a parent or guardian.'))) return false;
  }
  if (!(await ensureRules())) return false;
  return emailStep(path);
}

function emailStep(path: 'self' | 'parent'): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const body = h('div.col.signup', null);
    const err = h('p.small.error-text');
    let email = '';

    const showEmail = () => {
      clear(body);
      const input = h<HTMLInputElement>('input.text-input', { type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: path === 'parent' ? 'Parent or guardian’s email' : 'Your email', 'aria-label': 'Email address', maxlength: '254' });
      input.value = email;
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') void send();
      });
      const sendBtn = button({ label: 'Send code', icon: 'mail', cls: 'mint lg', onClick: () => void send() });
      const send = async () => {
        email = input.value.trim();
        if (!email) return;
        sendBtn.disabled = true;
        err.textContent = '';
        try {
          const r = await account.start(email);
          showCode(r.devCode);
        } catch (e) {
          err.textContent = e instanceof ServerError ? e.message : 'Something went wrong. Please try again.';
          sendBtn.disabled = false;
        }
      };
      body.append(
        h('p', null, path === 'parent' ? 'Parent or guardian: enter your email address. We’ll send you a code and explain what Free Chat is.' : 'Enter your email address and we’ll send you a 6-digit code.'),
        input,
        err,
        sendBtn,
        h(
          'p.muted.small',
          null,
          'We use the email only to verify this chat account, to contact you about it, to act on safety reports and to let you delete it. It is never shown to other players or sold. ',
          CONFIG.privacyUrl ? `Privacy policy: ${CONFIG.privacyUrl}` : '',
        ),
      );
      setTimeout(() => input.focus(), 50);
    };

    const showCode = (devCode?: string) => {
      clear(body);
      const input = h<HTMLInputElement>('input.text-input.code-input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '000000', 'aria-label': 'Code' });
      if (devCode) input.value = devCode;
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') void verify();
      });
      const verifyBtn = button({ label: 'Verify', icon: 'check', cls: 'mint lg', onClick: () => void verify() });
      const verify = async () => {
        verifyBtn.disabled = true;
        err.textContent = '';
        try {
          await account.verify(email, input.value);
          done = true;
          m.close();
          ui.sfx('reward');
          ui.toast('Free Chat is on! Be kind and stay safe.', 'verified', 3200);
        } catch (e) {
          err.textContent = e instanceof ServerError ? e.message : 'Something went wrong. Please try again.';
          verifyBtn.disabled = false;
        }
      };
      append(body, [
        h('p', null, `We sent a code to ${email}. Enter it here.`),
        devCode ? h('p.muted.small', null, '(Development server: the code was filled in for you.)') : null,
        input,
        err,
        verifyBtn,
        button({ label: 'Use a different email', cls: 'ghost sm', onClick: () => showEmail() }),
      ]);
      setTimeout(() => input.focus(), 50);
    };

    const m = ui.modal([h('h2', null, path === 'parent' ? 'Parent permission' : 'Turn on Free Chat'), body], { showClose: true, onClose: () => resolve(done) });
    showEmail();
  });
}

/** Settings → Chat & Community. */
export function openChatSettings(): void {
  const body = h('div.col', { style: 'gap:0.7rem;text-align:left' });
  const m = ui.modal([h('h2', null, 'Chat & Community'), body], { wide: true, showClose: true });
  const render = () => {
    clear(body);
    const d = store.data;
    const s = d.settings;
    body.append(
      h(
        'div.setting',
        null,
        ic('chat'),
        h('div.lbl', null, h('b', null, 'Quick Chat'), h('span', null, s.quickChat ? 'On: send friendly preset phrases and emotes in rooms.' : 'Off in Parental Controls.')),
      ),
    );
    if (canOfferFreeChat(d)) {
      const path = freeChatPath(d.profile.birthYear);
      if (d.account.token && (path === 'self' || d.account.consent === 'parent')) {
        append(body, [
          h(
            'div.setting',
            null,
            ic('verified'),
            h(
              'div.lbl',
              null,
              h('b', null, 'Free Chat'),
              h('span', null, `${d.account.consent === 'parent' ? 'Parent approved' : 'Verified'}: ${d.account.emailHint}. Type messages to other verified players in your room.`),
            ),
            toggle(
              s.freeChat,
              async (v) => {
                // A parent approved Free Chat for a 13-15 player: switching it back on needs them again.
                if (v && path === 'parent' && !(await parentalGate('Ask the grown-up who approved Free Chat.'))) {
                  render();
                  return;
                }
                store.setSetting('freeChat', v);
              },
              'Free Chat',
            ),
          ),
          d.account.mutedUntil > Date.now() ? h('p.small.error-text', null, `Free Chat is paused until ${new Date(d.account.mutedUntil).toLocaleString()} because of reports.`) : null,
          h(
            'div.row',
            { style: 'flex-wrap:wrap;gap:0.4rem' },
            button({ label: 'Community Rules', icon: 'shield', cls: 'ghost sm', onClick: () => void openCommunityRules() }),
            button({
              label: 'Delete chat account',
              icon: 'trash',
              cls: 'red sm',
              onClick: async () => {
                if (!(await confirm('Delete your chat account?', 'This deletes the account, its email address and its messages from our server. You can verify again later.', 'Delete', 'Keep', true))) return;
                try {
                  await account.remove();
                  ui.toast('Chat account deleted.', 'trash');
                } catch (e) {
                  ui.toast(e instanceof ServerError ? e.message : 'Couldn’t delete right now. Try again later.', 'info', 3200);
                }
                render();
              },
            }),
          ),
        ]);
      } else {
        body.append(
          h(
            'div.setting',
            null,
            ic('chat'),
            h(
              'div.lbl',
              null,
              h('b', null, 'Free Chat'),
              h('span', null, path === 'parent' ? 'Type messages to other verified players. Ages 13–15 need a parent’s email approval.' : 'Type messages to other verified players. Verify your email to turn it on.'),
            ),
          ),
          button({ label: 'Turn on Free Chat', icon: 'mail', cls: 'mint', onClick: async () => (await startFreeChatSignup()) && render() }),
        );
      }
    }
    if (serverAvailable() && freeChatPath(d.profile.birthYear) !== 'none') {
      body.append(
        h(
          'div.setting',
          null,
          ic('public'),
          h('div.lbl', null, h('b', null, 'Public build rooms'), h('span', null, canUsePublicRooms(d) ? 'On: you can join and host public rooms (13+).' : 'Off in Parental Controls.')),
        ),
      );
    }
    body.append(h('p.muted.small', null, freeChatReady(d) ? 'Free Chat only reaches players who also verified. Everyone else sees Quick Chat.' : 'Chat never shares your real name: everyone uses a generated racer name.'));
  };
  render();
  void m;
}
