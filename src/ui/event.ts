import { openHauntedRun } from './haunted-run';
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
    h('span.ev-pumpkin', null, '🎃'),
    h('span', null, h('b', null, ev.name), h('small', null, giftClaimed() ? eventEndLabel(ev) : 'Free gift!')),
  );
}

export function openEventModal(): void {
  const ev = activeEvent();
  if (!ev) return;
  const claimed = giftClaimed();
  const giftName = ev.gift.kind === 'skin' ? skinById(ev.gift.id).name : trailById(ev.gift.id).name;
  const m = ui.modal(
    [
      h('h2', null, `🎃 ${ev.name}`),
      h('p.muted', null, `Spooky skins, trails, the Haunted Run and a Halloween tune, ${eventEndLabel(ev)}. Everything you get is yours to keep.`),
      ev.gift.kind === 'skin' ? previewCanvas({ skin: ev.gift.id, animate: true, scale: 0.6 }, 'hero-preview') : null,
      h('p', null, claimed ? `You have the ${giftName}. Happy Halloween!` : `Your free gift: the ${giftName} skin!`),
      h(
        'div.actions',
        null,
        button({ label: 'Halloween shop', icon: 'cart', cls: 'ghost lg', onClick: () => (m.close(), nav.go('shop')) }),
        claimed
          ? button({ label: 'Haunted Run', icon: 'play', cls: 'orange lg', onClick: () => (m.close(), openHauntedRun()) })
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
