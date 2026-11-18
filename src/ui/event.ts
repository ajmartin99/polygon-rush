import { openHauntedRun } from './haunted-run';
import { openHolidayRun } from './holiday-run';
import { activeEvent, eventEndLabel, giftKey } from '../meta/events';
import { skinById, trailById } from '../meta/catalog';
import { store } from '../state/store';
import { button } from './components';
import { h } from './dom';
import { nav } from './nav';
import { previewCanvas } from './preview';
import { ui } from './ui';

/** Has this year's event gift been claimed (or already owned)? */
export function giftClaimed(): boolean {
  const ev = activeEvent();
  if (!ev) return true;
  const owned = ev.gift.kind === 'skin' ? store.ownsSkin(ev.gift.id) : store.ownsTrail(ev.gift.id);
  return owned || Boolean(store.data.tutorial[giftKey(ev)]);
}

/** Menu chip for the running event (null when none). */
export function eventChip(): HTMLElement | null {
  const ev = activeEvent();
  if (!ev) return null;
  return h(
    'button.event-chip',
    { onclick: () => openEventModal(), 'aria-label': `${ev.name} event` },
    h('span.ev-pumpkin', null, ev.id === 'christmas' ? '🎄' : '🎃'),
    h('span', null, h('b', null, ev.name), h('small', null, giftClaimed() ? eventEndLabel(ev) : 'Free gift!')),
  );
}

export function openEventModal(): void {
  const ev = activeEvent();
  if (!ev) return;
  const claimed = giftClaimed();
  const giftName = ev.gift.kind === 'skin' ? skinById(ev.gift.id).name : trailById(ev.gift.id).name;
  const xmas = ev.id === 'christmas';
  const m = ui.modal(
    [
      h('h2', null, `${xmas ? '🎄' : '🎃'} ${ev.name}`),
      h(
        'p.muted',
        null,
        xmas
          ? `Snowy skins and trails, the Holiday Run, an Advent Calendar and Christmas classics, ${eventEndLabel(ev)}. Everything you get is yours to keep.`
          : `Spooky skins, trails, the Haunted Run and a Halloween tune, ${eventEndLabel(ev)}. Everything you get is yours to keep.`,
      ),
      ev.gift.kind === 'skin' ? previewCanvas({ skin: ev.gift.id, animate: true, scale: 0.6 }, 'hero-preview') : null,
      h('p', null, claimed ? `You have the ${giftName}. ${xmas ? 'Merry Christmas!' : 'Happy Halloween!'}` : `Your free gift: the ${giftName} skin!`),
      h(
        'div.actions',
        null,
        button({ label: xmas ? 'Christmas shop' : 'Halloween shop', icon: 'cart', cls: 'ghost lg', onClick: () => (m.close(), nav.go('shop')) }),
        claimed
          ? button({ label: xmas ? 'Holiday Run' : 'Haunted Run', icon: 'play', cls: 'orange lg', onClick: () => (m.close(), xmas ? openHolidayRun() : openHauntedRun()) })
          : button({
              label: 'Claim gift',
              icon: 'gift',
              cls: 'orange lg',
              onClick: () => {
                if (ev.gift.kind === 'skin') {
                  store.grantSkin(ev.gift.id);
                  store.equipSkin(ev.gift.id);
                } else {
                  store.grantTrail(ev.gift.id);
                  store.equipTrail(ev.gift.id);
                }
                store.data.tutorial[giftKey(ev)] = true;
                store.commit();
                m.close();
                ui.sfx('reward');
                ui.toast(`${giftName} unlocked and equipped!`, 'sparkle', 3000);
                nav.go('menu');
              },
            }),
      ),
    ],
    { showClose: true },
  );
}
