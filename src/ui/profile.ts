import { levels } from '../state/levels';
import { store } from '../state/store';
import { leagueFor } from '../meta/economy';
import { BADGES, BANNER_LEVELS, BANNERS, badgeById, DEFAULT_TITLE, earnedBadges, MAX_SHOWCASE, myCard, titleFor, type BadgeCtx, type ProfileCard } from '../meta/profile';
import type { NetPlayer } from '../services/net';
import { BaseScreen, titleBar } from './components';
import { fmt, h, ic } from './dom';
import { nav } from './nav';
import { previewCanvas } from './preview';
import { ui } from './ui';

export function badgeCtx(): BadgeCtx {
  const mine = levels.list().filter((l) => l.origin !== 'code');
  return { save: store.data, levelsBuilt: mine.length, levelsVerified: mine.filter((l) => l.verified).length };
}

export function localCard(): ProfileCard {
  return myCard(badgeCtx());
}

function badgeIcon(id: string, size = ''): HTMLElement | null {
  const b = badgeById(id);
  if (!b) return null;
  return h(`span.badge-ico${size}`, { style: `--bc:${b.color}`, title: b.name }, ic(b.icon));
}

/** The card other players see: name, skin, title, banner, showcase and a few numbers. */
export function profileCard(name: string, skin: string, card: ProfileCard): HTMLElement {
  const [a, b] = BANNERS[card.banner] ?? BANNERS[0];
  const league = leagueFor(card.trophies);
  return h(
    'div.profile-card',
    { style: `--b1:${a};--b2:${b}` },
    h(
      'div.pc-top',
      null,
      previewCanvas({ skin, animate: true, scale: 0.45 }, 'pc-skin'),
      h('div.pc-id', null, h('b.pc-name', null, name), h('span.pc-title', null, titleFor(card.title)), h('span.pc-level', null, `Level ${card.lv} · `, h('span', { style: `color:${league.color}` }, league.name))),
    ),
    h(
      'div.pc-stats',
      null,
      h('div', null, ic('flag'), h('b', null, `${fmt(card.best)} m`), h('span', null, 'Best run')),
      h('div', null, ic('trophy'), h('b', null, fmt(card.trophies)), h('span', null, 'Trophies')),
      h('div', null, ic('crown'), h('b', null, fmt(card.wins)), h('span', null, 'Race wins')),
      h('div', null, ic('star'), h('b', null, `${card.badges}/${BADGES.length}`), h('span', null, 'Badges')),
    ),
    card.show.length ? h('div.pc-show', null, card.show.map((id) => h('div.pc-badge', null, badgeIcon(id), h('span', null, badgeById(id)?.name ?? '')))) : null,
  );
}

/** Tap a player in a room to see their card. */
export function openPlayerCard(p: NetPlayer): void {
  ui.modal([p.card ? profileCard(p.name, p.skin, p.card) : h('div.col', { style: 'align-items:center;gap:0.5rem' }, h('h2', null, p.name), h('p.muted', null, 'This player’s game doesn’t share a profile card yet.'))], { showClose: true });
}

export class ProfileScreen extends BaseScreen {
  constructor() {
    super('.solid');
    this.render();
  }

  private render(): void {
    const d = store.data;
    const ctx = badgeCtx();
    const earned = new Set(earnedBadges(ctx).map((b) => b.id));
    const card = myCard(ctx);
    const save = (fn: () => void) => {
      fn();
      store.commit();
      this.el.replaceChildren();
      this.render();
    };

    const titles = h(
      'div.chips-row',
      null,
      [h(`button.pick${card.title === '' ? '.on' : ''}`, { onclick: () => save(() => (d.profile.title = '')) }, DEFAULT_TITLE)],
      BADGES.filter((b) => earned.has(b.id)).map((b) => h(`button.pick${card.title === b.id ? '.on' : ''}`, { onclick: () => save(() => (d.profile.title = b.id)) }, b.title)),
    );

    const banners = h(
      'div.chips-row',
      null,
      BANNERS.map(([a, b], i) => {
        const locked = d.level < BANNER_LEVELS[i];
        return h(
          `button.swatch${card.banner === i ? '.on' : ''}${locked ? '.locked' : ''}`,
          {
            style: `background:linear-gradient(135deg, ${a}, ${b})`,
            'aria-label': locked ? `Unlocks at level ${BANNER_LEVELS[i]}` : `Banner ${i + 1}`,
            title: locked ? `Level ${BANNER_LEVELS[i]}` : '',
            onclick: () => (locked ? ui.toast(`Reach level ${BANNER_LEVELS[i]} to unlock this banner.`, 'lock') : save(() => (d.profile.banner = i))),
          },
          locked ? ic('lock') : null,
        );
      }),
    );

    const grid = h(
      'div.badge-grid',
      null,
      BADGES.map((b) => {
        const has = earned.has(b.id);
        const pinned = card.show.includes(b.id);
        return h(
          `button.badge-tile${has ? '' : '.locked'}${pinned ? '.on' : ''}`,
          {
            'aria-pressed': String(pinned),
            onclick: () => {
              if (!has) return ui.toast(b.how, 'lock');
              save(() => {
                const cur = card.show.filter((id) => id !== b.id);
                if (!pinned) {
                  if (cur.length >= MAX_SHOWCASE) cur.shift();
                  cur.push(b.id);
                }
                d.profile.showcase = cur;
              });
            },
          },
          h('span.badge-ico.lg', { style: `--bc:${has ? b.color : '#666'}` }, ic(has ? b.icon : 'lock')),
          h('b', null, b.name),
          h('span', null, has ? (pinned ? 'On your card' : 'Tap to show') : b.how),
        );
      }),
    );

    this.el.append(
      titleBar('Profile', 'star', () => nav.go('menu')),
      h(
        'div.scroll.grow.profile-page',
        null,
        h('div.profile-left', null, profileCard(d.profile.name || 'Rusher', d.skins.equipped, card), h('p.muted.small', null, 'This is what friends and other players see when they tap you in a room. It only shows game stuff — never anything personal.')),
        h(
          'div.profile-right',
          null,
          h('h3', null, 'Title'),
          titles,
          h('h3', null, 'Banner'),
          banners,
          h('h3', null, `Badges · ${earned.size}/${BADGES.length}`, h('span.muted.small', null, `  Pin up to ${MAX_SHOWCASE}`)),
          grid,
        ),
      ),
    );
  }
}
