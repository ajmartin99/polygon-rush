import { levels } from '../state/levels';
import { SECRET_LEVELS } from '../game/generator';
import { friends, type RemoteCard } from '../services/friends';
import { SKINS } from '../meta/catalog';
import { formatHandle } from '../shared/handle';
import { store } from '../state/store';
import { leagueFor } from '../meta/economy';
import { CONFIG } from '../config';
import { todayKey } from '../core/platform';
import { BETA_DAY_SECONDS, BETA_REWARD, BETA_SKIN_DAYS, BETA_TRAIL_DAYS, isBetaBuild } from '../meta/beta';
import { gemPriceOf, isOwned, productById } from '../meta/products';
import { iap } from '../services/iap';
import { buyProduct, buyWithGems } from './screens/shop';
import { ACTIVE_BADGES, BADGE_GROUPS, BADGES, BANNER_LEVELS, type BadgeGroup, BANNERS, badgeById, DEFAULT_TITLE, earnedBadges, MAX_SHOWCASE, myCard, addOns, safeCard, titleFor, type BadgeCtx, type ProfileCard } from '../meta/profile';
import type { NetPlayer } from '../services/net';
import { BaseScreen, button, confirm, titleBar } from './components';
import { playShared, proTag } from './community-levels';
import { canUseSharedLevels, serverAvailable } from '../meta/community';
import { sharedLevels } from '../services/shared-levels';
import { clear, fmt, h, ic } from './dom';
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

/** Fetch a Creator Spotlight level and play it (`exit` returns where you were). */
async function playSpotlight(id: string, exit: () => void): Promise<void> {
  if (!canUseSharedLevels(store.data)) return void ui.toast(serverAvailable() ? 'Community levels are turned off in Parental Controls.' : 'Community levels aren’t available yet.', 'lock', 3200);
  try {
    playShared(await sharedLevels.get(id), exit);
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : 'That level couldn’t be loaded.', 'info', 3200);
  }
}

export interface CardOpts {
  /** Play the Creator Spotlight level (no button without it). */
  onPlay?: (id: string) => void;
  /** Show an empty Spotlight (a preview before you've shared a level). */
  emptySpot?: boolean;
}

function spotlightSection(card: ProfileCard, o: CardOpts): HTMLElement | null {
  const s = card.spot;
  if (!s && !o.emptySpot) return null;
  return h(
    'div.pc-spot',
    null,
    h('span.pc-section', null, ic('star'), 'Creator Spotlight'),
    s
      ? h(
          'div.pc-spot-row',
          null,
          h('div.col', null, h('b', null, 'Top-rated level'), h('span.small', null, ic('thumbUp'), ` ${fmt(s.likes)}  `, ic('play'), ` ${fmt(s.plays)} plays`)),
          o.onPlay ? button({ label: 'Play', icon: 'play', cls: 'yellow sm', onClick: () => o.onPlay?.(s.id) }) : null,
        )
      : h('span.small', null, 'Share a level to Community and your best one shows here for everyone to play.'),
  );
}

function creatorStatsSection(card: ProfileCard): HTMLElement | null {
  const c = card.cs;
  if (!c) return null;
  return h(
    'div.pc-spot',
    null,
    h('span.pc-section', null, ic('build'), 'Creator Stats'),
    h(
      'div.pc-stats.four',
      null,
      h('div', null, ic('public'), h('b', null, fmt(c.shared)), h('span', null, 'Levels shared')),
      h('div', null, ic('play'), h('b', null, fmt(c.plays)), h('span', null, 'Plays')),
      h('div', null, ic('thumbUp'), h('b', null, fmt(c.likes)), h('span', null, 'Thumbs up')),
      h('div', null, ic('verified'), h('b', null, fmt(c.clears)), h('span', null, 'Clears')),
    ),
  );
}

/** The card other players see: name, skin, title, banner, showcase, a few numbers and any add-ons. */
export function profileCard(name: string, skin: string, card: ProfileCard, o: CardOpts = {}): HTMLElement {
  const [a, b] = BANNERS[card.banner] ?? BANNERS[0];
  const league = leagueFor(card.trophies);
  return h(
    `div.profile-card${card.pro ? '.pro' : ''}`,
    { style: `--b1:${a};--b2:${b}` },
    h(
      'div.pc-top',
      null,
      previewCanvas({ skin, animate: true, scale: 0.45 }, 'pc-skin'),
      h('div.pc-id', null, h('b.pc-name', null, name, card.pro ? proTag() : null), h('span.pc-title', null, titleFor(card.title)), h('span.pc-level', null, `Level ${card.lv} · `, h('span', { style: `color:${league.color}` }, league.name))),
    ),
    h(
      'div.pc-stats',
      null,
      h('div', null, ic('flag'), h('b', null, `${fmt(card.best)} m`), h('span', null, 'Best run')),
      h('div', null, ic('trophy'), h('b', null, fmt(card.trophies)), h('span', null, 'Trophies')),
      h('div', null, ic('crown'), h('b', null, fmt(card.wins)), h('span', null, 'Race wins')),
      h('div', null, ic('star'), h('b', null, `${Math.min(card.badges, ACTIVE_BADGES.length)}/${ACTIVE_BADGES.length}`), h('span', null, 'Badges')),
      h('div', null, ic('egg'), h('b', null, `${card.eggs}/${SECRET_LEVELS}`), h('span', null, 'Golden Shapes')),
    ),
    card.show.length ? h('div.pc-show', null, card.show.map((id) => h('div.pc-badge', null, badgeIcon(id), h('span', null, badgeById(id)?.name ?? '')))) : null,
    spotlightSection(card, o),
    creatorStatsSection(card),
  );
}

/** Tap a player in a room to see their card. */
export function openPlayerCard(p: NetPlayer): void {
  showCard({ name: p.name, skin: p.skin, card: p.card, inRoom: true });
}

interface CardTarget {
  name: string;
  skin: string;
  card?: ProfileCard;
  /** Inside a room, playing a Spotlight level asks first (it leaves the room). */
  inRoom?: boolean;
  /** Where to come back to after playing their Spotlight level. */
  back?: () => void;
}

/** Someone's card in a popup, with Add friend (13+) and their Spotlight level. */
function showCard(t: CardTarget): void {
  const tag = t.card?.tag ?? 0;
  const handle = tag ? formatHandle(t.name, tag) : '';
  // 13+ can send a request straight from a card (under-13s add by typed Name#tag only).
  const add =
    handle && friends.canAddFromCards && handle !== friends.myHandle && !friends.state.friends.some((f) => f.name === t.name && f.tag === tag)
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
  const back = t.back ?? (() => nav.go('create', { tab: 'community' }));
  const m = ui.modal(
    [
      t.card
        ? profileCard(t.name, t.skin, t.card, {
            onPlay: async (id) => {
              if (t.inRoom && !(await confirm('Play this level?', `You’ll leave the room to play ${t.name}’s top level.`, 'Play', 'Stay'))) return;
              m.close();
              void playSpotlight(id, back);
            },
          })
        : h('div.col', { style: 'align-items:center;gap:0.5rem' }, h('h2', null, t.name), h('p.muted', null, 'This player’s game doesn’t share a profile card yet.')),
      handle ? h('p.muted.small', { style: 'text-align:center' }, handle) : null,
      add ? h('div.row', { style: 'justify-content:center' }, add) : null,
    ],
    { showClose: true },
  );
}

/** A card fetched from the server: a friend's, or the builder of a Community level. */
export async function openRemoteCard(load: () => Promise<RemoteCard>, back?: () => void): Promise<void> {
  try {
    const r = await load();
    showCard({ name: r.name, skin: SKINS.some((x) => x.id === r.skin) ? r.skin : 'classic', card: safeCard(r.card), back });
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : 'Couldn’t reach the game server.', 'info', 3000);
  }
}

const ADD_ONS: string[] = [CONFIG.iap.products.creatorSpotlight, CONFIG.iap.products.builderPack];

export function isAddOn(id: string): boolean {
  return ADD_ONS.includes(id);
}

/** Your card as it looks with an add-on, before you buy it. */
function previewCard(id: string): HTMLElement {
  const d = store.data;
  const spotlight = id === CONFIG.iap.products.creatorSpotlight;
  const card = { ...localCard(), ...addOns(d, spotlight ? { spotlight: true } : { builder: true }) };
  return profileCard(d.profile.name || 'Rusher', d.skins.equipped, card, { emptySpot: spotlight && !card.spot });
}

/** An add-on: a live preview of your own card with it, then buy with money or gems. */
export function openAddOn(id: string, done: () => void = () => undefined): void {
  const def = productById(id);
  if (!def) return;
  const body = h('div.col.modal-scroll', { style: 'gap:0.6rem;align-items:center;text-align:center' });
  const render = () => {
    clear(body);
    const owned = isOwned(store.data, id);
    const gems = gemPriceOf(id);
    body.append(
      h('h2', null, def.name),
      h('p.muted.small', null, def.desc),
      owned
        ? h('div.owned', null, 'Owned ✓')
        : h(
            'div.actions',
            null,
            button({
              label: 'Buy',
              sub: iap.priceOf(id) || def.fallbackPrice,
              icon: 'star',
              cls: 'cyan lg',
              disabled: !iap.available,
              onClick: async () => {
                if (await buyProduct(id)) render();
                done();
              },
            }),
            button({
              label: 'Use gems',
              sub: `${fmt(gems)} gems`,
              icon: 'gem',
              cls: `${store.canAfford(gems) ? 'yellow' : 'ghost'} lg`,
              onClick: () => {
                if (!buyWithGems(id)) return;
                ui.toast(`${def.name} unlocked! It’s on your profile card.`, 'sparkle', 3000);
                render();
                done();
              },
            }),
          ),
      h('p.small', null, owned ? 'On your card now:' : 'Preview of your card:'),
      previewCard(id),
    );
    if (id === CONFIG.iap.products.builderPack) body.append(h('p.muted.small', null, 'Your Pro Builder tag also shows next to your name on levels you share to Community.'));
  };
  render();
  ui.modal(body, { showClose: true });
  // Fresh numbers for the preview (quietly; it works offline with the last ones seen).
  if (canUseSharedLevels(store.data)) void sharedLevels.refreshMine().then(() => body.isConnected && render(), () => undefined);
}

/** Beta testers: test days so far and what they unlock (hidden once everything is earned). */
function betaPanel(): HTMLElement | null {
  const b = store.data.beta;
  if (!b.tester || !isBetaBuild(CONFIG.version) || (b.claimed.includes('trail') && b.claimed.includes('skin'))) return null;
  const days = b.days.length;
  const today = b.today === todayKey() ? Math.min(BETA_DAY_SECONDS, b.todaySec) : 0;
  const tier = (need: number, what: string, done: boolean) =>
    h('div.beta-tier', null, ic(done ? 'check' : 'lock'), h('span', null, `${need} test days: ${what}`), done ? h('b', null, 'Unlocked') : h('b', null, `${Math.min(days, need)}/${need}`));
  return h(
    'div.beta-panel',
    null,
    h('h3', null, 'Beta tester rewards'),
    h('p.muted.small', null, `A test day counts after 5 minutes of play. Today: ${Math.floor(today / 60)} of 5 min${b.days.includes(todayKey()) ? ' ✓' : ''}.`),
    tier(BETA_TRAIL_DAYS, 'Debug Pixels trail + 🧪 emote', b.claimed.includes('trail')),
    tier(BETA_SKIN_DAYS, `Beta Bot skin + ${BETA_REWARD.gems} gems`, b.claimed.includes('skin')),
  );
}

export class ProfileScreen extends BaseScreen {
  constructor() {
    super('.solid');
    this.render();
    // Keep the Spotlight and Creator Stats on your card up to date.
    const d = store.data;
    if ((d.purchases.spotlight || d.purchases.builder) && canUseSharedLevels(d))
      void sharedLevels.refreshMine().then(
        () => this.el.isConnected && (this.el.replaceChildren(), this.render()),
        () => undefined,
      );
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
        const list = BADGES.filter((b) => b.group === g && (!b.retired || earned.has(b.id)));
        const got = list.filter((b) => earned.has(b.id)).length;
        return h('div.col', { style: 'gap:0.35rem' }, h('h4.badge-group', null, BADGE_GROUPS[g], h('span.muted.small', null, ` ${got}/${list.length}`)), h('div.badge-grid', null, list.map(tile)));
      }),
    );

    this.el.append(
      titleBar('Profile', 'star', () => nav.go('menu')),
      h(
        'div.scroll.grow.profile-page',
        null,
        h(
          'div.profile-left',
          null,
          profileCard(d.profile.name || 'Rusher', d.skins.equipped, card, { onPlay: (id) => void playSpotlight(id, () => nav.go('profile')) }),
          h('p.muted.small', null, 'This is what friends and other players see when they tap you in a room. It only shows game stuff — never anything personal.'),
        ),
        h(
          'div.profile-right',
          null,
          betaPanel(),
          h('h3', null, 'Title'),
          titles,
          h('h3', null, 'Banner'),
          banners,
          h('h3', null, 'Card add-ons'),
          h(
            'div.chips-row',
            null,
            ADD_ONS.map((id) =>
              button({
                label: productById(id)?.name ?? id,
                sub: isOwned(d, id) ? 'Owned ✓' : 'Preview',
                icon: id === CONFIG.iap.products.creatorSpotlight ? 'public' : 'build',
                cls: isOwned(d, id) ? 'mint' : 'yellow',
                onClick: () => openAddOn(id, () => (this.el.replaceChildren(), this.render())),
              }),
            ),
          ),
          h('h3', null, `Badges · ${[...earned].filter((id) => !badgeById(id)?.retired).length}/${ACTIVE_BADGES.length}`, h('span.muted.small', null, `  Pin up to ${MAX_SHOWCASE}`)),
          grid,
        ),
      ),
    );
  }
}
