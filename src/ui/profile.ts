import { levels } from '../state/levels';
import { SECRET_LEVELS } from '../game/generator';
import { friends } from '../services/friends';
import { formatHandle } from '../shared/handle';
import { store } from '../state/store';
import { leagueFor } from '../meta/economy';
import { BADGE_GROUPS, BADGES, BANNER_LEVELS, type BadgeGroup, BANNERS, badgeById, DEFAULT_TITLE, earnedBadges, MAX_SHOWCASE, myCard, titleFor, type BadgeCtx, type ProfileCard } from '../meta/profile';
import type { NetPlayer } from '../services/net';
import { BaseScreen, button, titleBar } from './components';
import { fmt, h, ic } from './dom';
import { nav } from './nav';
import { previewCanvas } from './preview';
import { ui } from './ui';

export function badgeCtx(): BadgeCtx {
  const mine = levels.list().filter((l) => l.origin !== 'code');
  return { save: store.data, levelsBuilt: mine.length, levelsVerified: mine.filter((l) => l.verified).length, levelsCoop: mine.filter((l) => l.origin === 'coop').length };
}

/**
 * Announce badges as they're earned. The first check only records what the
 * player already has, so nobody gets a pile of toasts after updating.
 */
export function watchBadges(): void {
  let timer = 0;
  const check = () => {
    timer = 0;
    const p = store.data.profile;
    const earned = earnedBadges(badgeCtx()).map((b) => b.id);
    const first = !p.badgesSeen.includes('*');
    const fresh = first ? [] : earned.filter((id) => !p.badgesSeen.includes(id));
    if (!first && !fresh.length) return;
    p.badgesSeen = ['*', ...new Set([...p.badgesSeen.filter((id) => id !== '*'), ...earned])];
    store.commit();
    fresh.forEach((id, i) => {
      const b = badgeById(id);
      if (b) setTimeout(() => ui.toast(`Badge earned: ${b.name}! New title “${b.title}” in Profile.`, 'star', 3600), 1400 + i * 3800);
    });
  };
  const soon = () => {
    if (!timer) timer = window.setTimeout(check, 1500);
  };
  store.on('change', soon);
  levels.on('change', soon);
  soon();
}

export function localCard(): ProfileCard {
  return myCard(badgeCtx());
}

function progressBar([v, t]: [number, number]): HTMLElement {
  return h('i.badge-bar', { 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round((v / Math.max(1, t)) * 100)}%` }));
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
      h('div', null, ic('egg'), h('b', null, `${card.eggs}/${SECRET_LEVELS}`), h('span', null, 'Secret eggs')),
    ),
    card.show.length ? h('div.pc-show', null, card.show.map((id) => h('div.pc-badge', null, badgeIcon(id), h('span', null, badgeById(id)?.name ?? '')))) : null,
  );
}

/** Tap a player in a room to see their card. */
export function openPlayerCard(p: NetPlayer): void {
  const tag = p.card?.tag ?? 0;
  const handle = tag ? formatHandle(p.name, tag) : '';
  // 13+ can send a request straight from a room (under-13s add by typed Name#tag only).
  const add =
    handle && friends.canAddFromCards && handle !== friends.myHandle && !friends.state.friends.some((f) => f.name === p.name && f.tag === tag)
      ? button({
          label: 'Add friend',
          icon: 'users',
          cls: 'mint sm',
          onClick: async (e: MouseEvent) => {
            const b = e.currentTarget as HTMLButtonElement;
            try {
              const r = await friends.add(handle);
              b.disabled = true;
              b.textContent = r.state === 'friends' ? 'Friends!' : 'Request sent';
            } catch (err) {
              ui.toast((err as Error).message, 'info', 3000);
            }
          },
        })
      : null;
  ui.modal(
    [
      p.card
        ? profileCard(p.name, p.skin, p.card)
        : h('div.col', { style: 'align-items:center;gap:0.5rem' }, h('h2', null, p.name), h('p.muted', null, 'This player’s game doesn’t share a profile card yet.')),
      handle ? h('p.muted.small', { style: 'text-align:center' }, handle) : null,
      add ? h('div.row', { style: 'justify-content:center' }, add) : null,
    ],
    { showClose: true },
  );
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

    const tile = (b: (typeof BADGES)[number]) => {
        const has = earned.has(b.id);
        const pinned = card.show.includes(b.id);
        return h(
          `button.badge-tile${has ? '' : '.locked'}${pinned ? '.on' : ''}`,
          {
            'aria-pressed': String(pinned),
            onclick: () => {
              if (!has) {
                const [v, t] = b.progress(ctx);
                return ui.toast(`${b.how} (${fmt(v)}/${fmt(t)})`, 'lock');
              }
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
          has ? null : progressBar(b.progress(ctx)),
          h('span', null, has ? (pinned ? 'On your card' : 'Tap to show') : b.how),
        );
    };
    const grid = h(
      'div.col',
      { style: 'gap:0.7rem' },
      (Object.keys(BADGE_GROUPS) as BadgeGroup[]).map((g) => {
        const list = BADGES.filter((b) => b.group === g);
        const got = list.filter((b) => earned.has(b.id)).length;
        return h('div.col', { style: 'gap:0.35rem' }, h('h4.badge-group', null, BADGE_GROUPS[g], h('span.muted.small', null, ` ${got}/${list.length}`)), h('div.badge-grid', null, list.map(tile)));
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
