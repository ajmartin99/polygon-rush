import { describeGrant, grantPromo, type PromoReward } from '../meta/promos';
import { serverAvailable } from '../meta/community';
import { friends } from '../services/friends';
import { ServerError } from '../services/server';
import { store } from '../state/store';
import { alertModal, button } from './components';
import { h } from './dom';
import { ui } from './ui';

/** Settings → Redeem a code: promo codes from our posts, events and giveaways. */
export function openRedeem(): void {
  if (!serverAvailable()) return void ui.toast('Codes need the game server. Check your connection and try again.', 'wifi');
  const input = h<HTMLInputElement>('input.text-input', {
    maxlength: '24',
    placeholder: 'Type your code',
    'aria-label': 'Promo code',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    style: 'text-transform:uppercase;letter-spacing:0.12em;text-align:center;font-size:1.3rem',
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') void go();
  });
  const err = h('p.small', { style: 'color:var(--red);min-height:1.2em' });
  let busy = false;
  const go = async () => {
    if (busy) return;
    if (input.value.trim().length < 4) return void (err.textContent = 'Type the whole code.');
    busy = true;
    err.textContent = '';
    try {
      const res = await friends.authed<{ code: string; reward: PromoReward; note: string }>('/api/promos/redeem', { code: input.value });
      const got = grantPromo(store.data, res.reward);
      store.commit();
      m.close();
      const what = describeGrant(got);
      await alertModal('Code redeemed!', `${res.note ? `${res.note} ` : ''}${what ? `You got ${what}.` : 'You already had everything in this code.'}`, 'gift');
    } catch (e) {
      err.textContent = e instanceof ServerError ? e.message : 'That didn’t work. Try again.';
    } finally {
      busy = false;
    }
  };
  const m = ui.modal(
    [
      h('h2', null, 'Redeem a code'),
      h('p.muted.small', null, 'Got a code from Soft-Game Brothers, an event or a giveaway? Type it here. Each code works once per player.'),
      input,
      err,
      h('div.actions', null, button({ label: 'Redeem', icon: 'gift', cls: 'mint lg', onClick: () => void go() })),
    ],
    { showClose: true },
  );
  setTimeout(() => input.focus(), 50);
}
