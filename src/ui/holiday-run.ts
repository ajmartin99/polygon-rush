import { CONFIG } from '../config';
import { activeEvent } from '../meta/events';
import { attemptsLeft, refillIn, useAttempt, type HauntedState } from '../meta/haunted';
import { HOLIDAY_RULES, holidayLevel, holidayPlan, VILLAINS, type Villain } from '../meta/holiday';
import { dailySeed } from '../meta/modes';
import { gemPriceOf } from '../meta/products';
import { iap } from '../services/iap';
import type { SaveData } from '../state/save';
import { store } from '../state/store';
import { button } from './components';
import { clear, fmt, h, ic } from './dom';
import { nav } from './nav';
import { buyProduct, buyWithGems } from './screens/shop';
import { ui } from './ui';

/**
 * Holiday Run (Christmas Wonderland): two attempts every 24 hours on today's
 * course, charted to the villain's song. Hard pays full gems, Easy half;
 * beating the villain pays the big bonus, and the first Hard win earns the
 * Holiday Hero skin. Heart Regens (one pool with the Haunted Run) refill it.
 */
export function holidayAvailable(): boolean {
  return activeEvent()?.id === 'christmas';
}

/** The player's villain (Jack Frost until they pick). */
export function currentVillain(): Villain {
  return store.settings.villain === 'krampus' ? 'krampus' : 'frost';
}

/** Heart Regen for the Holiday Run: from the shared pool, full attempts and a fresh 24-hour clock. */
export function useHolidayRegen(save: SaveData, now = Date.now()): boolean {
  if (save.haunted.regens <= 0) return false;
  save.haunted.regens -= 1;
  const h: HauntedState = save.holiday;
  h.windowStart = now;
  h.used = 0;
  h.best = { hard: 0, easy: 0 };
  return true;
}

function timeLeft(ms: number): string {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/** Start a run on today's course (spends an attempt). */
export function startHoliday(): void {
  const hs = store.data.holiday;
  if (!holidayAvailable()) return void ui.toast('The Holiday Run is back next Christmas!', 'lock');
  if (!useAttempt(hs)) return openHolidayRun();
  store.commit();
  const villain = currentVillain();
  const seed = dailySeed();
  nav.play({
    mode: 'custom',
    level: holidayLevel(villain, seed),
    holiday: { villain },
    chapters: holidayPlan(villain, seed).chapters,
    exit: () => nav.go('modes'),
    onRetry: () => startHoliday(),
  });
}

/**
 * Who stole Christmas? Asked once when the player first opens the game in
 * December (and from Settings or the Holiday Run card any time).
 */
export function chooseVillain(onPicked?: () => void): void {
  const pick = (v: Villain) => () => {
    store.setSetting('villain', v);
    m.close();
    ui.toast(v === 'frost' ? 'Jack Frost it is! He froze Santa’s sleigh.' : 'Krampus it is! He snatched Santa’s presents.', 'gift', 3200);
    onPicked?.();
  };
  const card = (v: Villain, blurb: string, cls: string) =>
    h(
      `button.villain-card.${cls}`,
      { onclick: pick(v), 'aria-label': VILLAINS[v].name },
      h('span.villain-icon', null, v === 'frost' ? '❄️' : '😈'),
      h('b', null, VILLAINS[v].name),
      h('span.small', null, blurb),
    );
  const m = ui.modal(
    [
      h('h2', null, '🎄 Who stole Christmas?'),
      h('p.small', null, 'Pick the villain you’ll chase in the Holiday Run. You can switch any time in Settings.'),
      h(
        'div.villain-pick',
        null,
        card('frost', 'Froze Santa’s sleigh. Icy, cheeky, a techno Christmas medley.', 'frost'),
        card('krampus', 'Snatched Santa’s presents. Horns, chains and a dark Carol of the Bells.', 'krampus'),
      ),
    ],
    { showClose: true, wide: true },
  );
  void m.closed.then(() => {
    // Closed without picking: Jack Frost, and don't ask again.
    if (!store.settings.villain) store.setSetting('villain', 'frost');
  });
}

/** The Holiday Run card: villain, attempts, timer, best run, Play and Heart Regens. */
export function openHolidayRun(): void {
  const body = h('div.col.holiday.modal-scroll', { style: 'gap:0.6rem;align-items:center;text-align:center' });
  let timer = 0;
  const render = () => {
    clear(body);
    const hs = store.data.holiday;
    const regens = store.data.haunted.regens;
    const left = attemptsLeft(hs);
    const wait = refillIn(hs);
    const v = VILLAINS[currentVillain()];
    body.append(
      h('h2', null, '🎄 Holiday Run'),
      ...(left > 0 || regens > 0
        ? [
            h('p.small', null, `${v.crime} Chase ${v.name} through the Snowy Pine Forest, across the Frozen Lake, through Santa’s Workshop and over Candy Cane Peaks, all on the beat.`),
            h('p.muted.small', null, `In ${v.lair}, grab the glowing presents to throw them at him. It gets harder chapter by chapter. Beat him for the Holiday Hero skin! A new course every day.`),
          ]
        : []),
      button({ label: `Villain: ${v.name}`, icon: 'users', cls: 'ghost sm', onClick: () => chooseVillain(render) }),
      h(
        'div.hr-hearts',
        { 'aria-label': `${left} of ${HOLIDAY_RULES.attempts} attempts left` },
        Array.from({ length: HOLIDAY_RULES.attempts }, (_, i) => h(`span${i < left ? '.on' : ''}`, null, ic('heart'))),
      ),
      h('p.small', null, left > 0 ? `${left} attempt${left > 1 ? 's' : ''} left · best run counts` : `Out of attempts · refills in ${timeLeft(wait)}`),
      h(
        'div.hr-best',
        null,
        h('span', null, `Best ${Math.floor(Math.max(hs.best.hard, hs.best.easy) * 100)}%`),
        hs.clears.hard + hs.clears.easy > 0 ? h('span', null, `Cleared ${hs.clears.hard + hs.clears.easy}×`) : null,
      ),
    );
    if (left > 0) {
      body.append(
        h(
          'div.actions',
          null,
          button({ label: 'Play', sub: `3 hearts · win +${fmt(HOLIDAY_RULES.villainBonus)} gems`, icon: 'play', cls: 'red lg', onClick: () => (m.close(), startHoliday()) }),
        ),
      );
    } else if (regens > 0) {
      body.append(
        button({
          label: `Use a Heart Regen (${regens} left)`,
          icon: 'heart',
          cls: 'pink lg',
          onClick: () => {
            useHolidayRegen(store.data);
            store.commit();
            render();
          },
        }),
      );
    } else {
      const P = CONFIG.iap.products;
      const after = (id: string) => {
        // A single Heart Regen is used straight away.
        if (id === P.hauntedRegen1) useHolidayRegen(store.data);
        store.commit();
        render();
      };
      const gemButton = (id: string, label: string) => {
        const price = gemPriceOf(id);
        return button({ label, sub: `${fmt(price)} gems`, icon: 'gem', cls: `${store.canAfford(price) ? 'yellow' : 'ghost'}`, onClick: () => buyWithGems(id) && after(id) });
      };
      body.append(
        h('p.muted.small', null, 'A Heart Regen refills your attempts now. Extra regens keep for the next limited-time run.'),
        h(
          'div.actions',
          null,
          button({ label: 'Heart Regen', sub: iap.priceOf(P.hauntedRegen1), icon: 'heart', cls: 'pink', onClick: async () => (await buyProduct(P.hauntedRegen1)) && after(P.hauntedRegen1) }),
          button({ label: '4 Heart Regens', sub: iap.priceOf(P.hauntedRegen4), icon: 'heart', cls: 'violet', onClick: async () => (await buyProduct(P.hauntedRegen4)) && after(P.hauntedRegen4) }),
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
