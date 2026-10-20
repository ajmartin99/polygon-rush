import { CONFIG } from '../config';
import { activeEvent } from '../meta/events';
import { attemptsLeft, HAUNTED_RULES, hauntedLevel, refillIn, useAttempt, useRegen, type HauntedDiff } from '../meta/haunted';
import { dailySeed } from '../meta/modes';
import { gemPriceOf } from '../meta/products';
import { iap } from '../services/iap';
import { store } from '../state/store';
import { button } from './components';
import { clear, fmt, h, ic } from './dom';
import { nav } from './nav';
import { buyProduct, buyWithGems } from './screens/shop';
import { ui } from './ui';

/**
 * Haunted Run (Spooky Season): two attempts every 24 hours on today's course,
 * charted to Swing Along. Hard pays full gems, Easy half, and reaching the end
 * of the song pays a big bonus. Heart Regens refill the attempts.
 */
export function hauntedAvailable(): boolean {
  return activeEvent()?.id === 'halloween';
}

function timeLeft(ms: number): string {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/** Start a run on today's course (spends an attempt). */
export function startHaunted(diff: HauntedDiff): void {
  const hs = store.data.haunted;
  if (!hauntedAvailable()) return void ui.toast('The Haunted Run is back next Spooky Season!', 'lock');
  if (!useAttempt(hs)) return openHauntedRun();
  store.commit();
  nav.play({
    mode: 'custom',
    level: hauntedLevel(diff, dailySeed()),
    haunted: diff,
    exit: () => nav.go('modes'),
    // Retry spends another attempt (or offers a Heart Regen).
    onRetry: () => startHaunted(diff),
  });
}

/** The Haunted Run card: attempts, timer, best runs, Hard / Easy and Heart Regens. */
export function openHauntedRun(): void {
  const body = h('div.col.haunted.modal-scroll', { style: 'gap:0.6rem;align-items:center;text-align:center' });
  let timer = 0;
  const render = () => {
    clear(body);
    const hs = store.data.haunted;
    const left = attemptsLeft(hs);
    const wait = refillIn(hs);
    const bonus = (d: HauntedDiff) => fmt(Math.round(HAUNTED_RULES.finishBonus * HAUNTED_RULES.gemRate[d]));
    body.append(
      h('h2', null, '🎃 Haunted Run'),
      // Out of attempts the refill options need the room, so the course blurb steps aside.
      ...(left > 0 || hs.regens > 0
        ? [h('p.muted.small', null, 'Today’s course is charted to Swing Along: jump, flip and glide on the beat. Jump the zombies shambling in your way, and fly around the ghosts haunting the sky! Reach the end of the song for a big gem bonus.')]
        : []),
      h(
        'div.hr-hearts',
        { 'aria-label': `${left} of ${HAUNTED_RULES.attempts} attempts left` },
        Array.from({ length: HAUNTED_RULES.attempts }, (_, i) => h(`span${i < left ? '.on' : ''}`, null, ic('heart'))),
      ),
      h('p.small', null, left > 0 ? `${left} attempt${left > 1 ? 's' : ''} left · best run counts` : `Out of attempts · refills in ${timeLeft(wait)}`),
      h(
        'div.hr-best',
        null,
        h('span', null, `Hard best ${Math.floor(hs.best.hard * 100)}%`),
        h('span', null, `Easy best ${Math.floor(hs.best.easy * 100)}%`),
        hs.clears.hard + hs.clears.easy > 0 ? h('span', null, `Cleared ${hs.clears.hard} Hard · ${hs.clears.easy} Easy`) : null,
      ),
    );
    if (left > 0) {
      body.append(
        h(
          'div.actions',
          null,
          button({ label: 'Hard', sub: `1× gems · finish +${bonus('hard')}`, icon: 'bolt', cls: 'red lg', onClick: () => (m.close(), startHaunted('hard')) }),
          button({ label: 'Easy', sub: `0.5× gems · finish +${bonus('easy')}`, icon: 'play', cls: 'mint lg', onClick: () => (m.close(), startHaunted('easy')) }),
        ),
      );
    } else if (hs.regens > 0) {
      body.append(
        button({
          label: `Use a Heart Regen (${hs.regens} left)`,
          icon: 'heart',
          cls: 'pink lg',
          onClick: () => {
            useRegen(store.data.haunted);
            store.commit();
            render();
          },
        }),
      );
    } else {
      const P = CONFIG.iap.products;
      const buy = (id: string) => async () => {
        if (!(await buyProduct(id))) return;
        // A single Heart Regen is used straight away.
        if (id === P.hauntedRegen1) useRegen(store.data.haunted);
        store.commit();
        render();
      };
      const gemButton = (id: string, label: string) => {
        const price = gemPriceOf(id);
        return button({
          label,
          sub: `${fmt(price)} gems`,
          icon: 'gem',
          cls: `${store.canAfford(price) ? 'yellow' : 'ghost'}`,
          onClick: () => {
            if (!buyWithGems(id)) return;
            // A single Heart Regen is used straight away.
            if (id === P.hauntedRegen1) useRegen(store.data.haunted);
            store.commit();
            render();
          },
        });
      };
      body.append(
        h('p.muted.small', null, 'A Heart Regen refills your attempts now. Extra regens keep for the next limited-time run.'),
        h(
          'div.actions',
          null,
          button({ label: 'Heart Regen', sub: iap.priceOf(P.hauntedRegen1), icon: 'heart', cls: 'pink', onClick: buy(P.hauntedRegen1) }),
          button({ label: '4 Heart Regens', sub: iap.priceOf(P.hauntedRegen4), icon: 'heart', cls: 'violet', onClick: buy(P.hauntedRegen4) }),
        ),
        h('div.actions', null, gemButton(P.hauntedRegen1, 'Heart Regen'), gemButton(P.hauntedRegen4, '4 Heart Regens')),
      );
    }
  };
  render();
  const m = ui.modal(body, { showClose: true });
  timer = window.setInterval(() => (body.isConnected ? render() : clearInterval(timer)), 30_000);
  void m.closed.then(() => clearInterval(timer));
}
