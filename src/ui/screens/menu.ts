import { App as CapApp } from '@capacitor/app';
import { store } from '../../state/store';
import { ads } from '../../services/ads';
import { dailyAvailable } from '../../meta/daily';
import { claimableCount } from '../../meta/missions';
import { leagueFor } from '../../meta/economy';
import { CONFIG } from '../../config';
import { BaseScreen, button, confirm, gemChip, levelChip, setBadge } from '../components';
import { h, ic, fmt } from '../dom';
import { nav } from '../nav';
import { previewCanvas } from '../preview';
import { ui } from '../ui';
import { audio } from '../../core/audio';
import { haptics } from '../../core/haptics';
import { openDailyGift } from './missions';
import { DIFFICULTY_NAMES, endlessBestKey } from '../../state/save';
import { activeEvent } from '../../meta/events';
import { unlockedLevels } from '../../meta/modes';
import { eventChip, giftClaimed, openEventModal } from '../event';
import { openNoAdsOffer } from './shop';
import { friends } from '../../services/friends';

let dailyPromptShown = false;
let eventPromptShown = false;

export class MenuScreen extends BaseScreen {
  constructor() {
    super('.menu');
    const d = store.data;
    const kid = d.settings.kidMode;
    const bestKey = endlessBestKey(d.settings);
    const best = d.best[bestKey] ?? 0;
    const league = leagueFor(d.trophies);

    const missionsBtn = button({
      label: 'Missions',
      icon: 'target',
      cls: 'orange',
      badge: claimableCount(d),
      onClick: () => nav.go('missions'),
    });
    const dailyBtn = button({
      label: 'Gift',
      icon: 'gift',
      cls: 'pink',
      badge: dailyAvailable(d) ? 1 : 0,
      onClick: () => openDailyGift(() => setBadge(dailyBtn, dailyAvailable(store.data) ? 1 : 0)),
    });
    const noAdsBtn = d.purchases.noAds
      ? null
      : button({ label: 'No Ads', icon: 'noads', cls: 'ghost', onClick: () => openNoAdsOffer() });

    const playBtn = button({
      label: 'PLAY',
      icon: 'play',
      cls: 'yellow xl pulse',
      sub: kid ? 'Endless · Kid Mode' : `Endless · ${DIFFICULTY_NAMES[d.settings.difficulty]}`,
      onClick: () => nav.play({ mode: 'endless' }),
    });
    const unlocked = unlockedLevels(d.levels[bestKey] ?? 1);
    // Level select sits on the PLAY button once there's more than one level to pick.
    const playArea =
      unlocked > 1
        ? h('div.play-wrap', null, playBtn, button({ label: `Levels 1–${unlocked}`, icon: 'target', cls: 'violet sm level-pick', onClick: () => nav.go('levels') }))
        : playBtn;

    // Friends: a badge counts requests and invites waiting.
    const friendsBtn = friends.available ? button({ icon: 'users', cls: 'icon cyan', aria: 'Friends', badge: friends.waiting, onClick: () => nav.go('pals') }) : null;
    if (friendsBtn) {
      const off = friends.on('change', () => (friendsBtn.isConnected ? setBadge(friendsBtn, friends.waiting) : off()));
    }
    this.el.append(
      h(
        'div.topbar',
        null,
        levelChip(),
        h('div.chip', { title: 'Trophies' }, ic('trophy'), h('span', null, fmt(d.trophies))),
        eventChip(),
        h('div.spacer'),
        gemChip(this),
        friendsBtn,
        button({ icon: 'cart', cls: 'icon mint', aria: 'Shop', onClick: () => nav.go('shop') }),
        button({ icon: 'gear', cls: 'icon violet', aria: 'Settings', onClick: () => nav.go('settings') }),
      ),
      h(
        'div.menu-main',
        null,
        h(
          'div.menu-left',
          null,
          h('div.logo', null, h('span.l1', null, 'POLYGON'), h('span.l2', null, 'RUSH')),
          heroPreview(),
          h('div.best-line', null, ic('crown'), 'Best', h('b', null, `${fmt(best)} m`)),
        ),
        h(
          'div.menu-right',
          null,
          playArea,
          h(
            'div.mode-grid',
            null,
            button({ label: 'Modes', icon: 'shapes', cls: 'pink stack', sub: '9 ways to play', onClick: () => nav.go('modes') }),
            button({ label: 'Race', icon: 'flag', cls: 'cyan stack', sub: league.name, onClick: () => nav.go('race') }),
            button({
              label: 'Online',
              icon: 'globe',
              cls: 'violet stack',
              sub: 'Quick Match',
              onClick: () => {
                if (!store.data.settings.onlineAllowed) {
                  ui.toast('Online play is turned off in Parental Controls.', 'lock');
                  return;
                }
                nav.go('friends');
              },
            }),
            button({ label: 'Create', icon: 'build', cls: 'orange stack', sub: 'Level maker', onClick: () => nav.go('create') }),
          ),
        ),
      ),
      h(
        'div.bottombar',
        null,
        button({ label: 'Shop', icon: 'cart', cls: 'mint', onClick: () => nav.go('shop') }),
        missionsBtn,
        dailyBtn,
        noAdsBtn,
        h('div.spacer'),
        h('span.kbd-hint', null, `v${CONFIG.version}`),
      ),
    );

    this.own(
      store.on('change', () => {
        setBadge(missionsBtn, claimableCount(store.data));
        setBadge(dailyBtn, dailyAvailable(store.data) ? 1 : 0);
      }),
    );
  }

  override enter(): void {
    void ads.showBanner();
    // Spooky Season: offer the free gift once (after onboarding).
    if (!eventPromptShown && activeEvent() && !giftClaimed() && store.data.stats.runs > 0) {
      eventPromptShown = true;
      setTimeout(() => {
        if (nav.route === 'menu' && !ui.hasModal) openEventModal();
      }, 700);
      return;
    }
    if (!dailyPromptShown && dailyAvailable(store.data) && store.data.stats.runs > 0) {
      dailyPromptShown = true;
      setTimeout(() => {
        if (nav.route === 'menu' && !ui.hasModal) openDailyGift();
      }, 600);
    }
  }

  override leave(): void {
    super.leave();
    void ads.hideBanner();
  }

  override back(): boolean {
    void confirm('Leave Polygon Rush?', 'Your progress is saved.', 'Exit', 'Stay').then(async (yes) => {
      if (!yes) return;
      try {
        await CapApp.exitApp();
      } catch {
        /* web */
      }
    });
    return true;
  }
}

/** The player's character on the home screen: tap it and it hops. */
function heroPreview(): HTMLCanvasElement {
  const c = previewCanvas({ skin: store.data.skins.equipped, animate: true, scale: 0.62 }, 'hero-preview tap');
  c.setAttribute('role', 'button');
  c.setAttribute('aria-label', 'Your racer');
  c.addEventListener('click', () => {
    c.classList.remove('hop');
    void c.offsetWidth;
    c.classList.add('hop');
    audio.play('jump');
    haptics.light();
  });
  return c;
}
