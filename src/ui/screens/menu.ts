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
import { openDailyGift } from './missions';
import { openNoAdsOffer } from './shop';

let dailyPromptShown = false;

export class MenuScreen extends BaseScreen {
  constructor() {
    super();
    const d = store.data;
    const kid = d.settings.kidMode;
    const bestKey = kid ? 'endless_kid' : 'endless';
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
      sub: kid ? 'Endless · Kid Mode' : 'Endless Rush',
      onClick: () => nav.play({ mode: 'endless' }),
    });

    this.el.append(
      h(
        'div.topbar',
        null,
        levelChip(),
        h('div.chip', { title: 'Trophies' }, ic('trophy'), h('span', null, fmt(d.trophies))),
        h('div.spacer'),
        gemChip(this),
        button({ icon: 'cart', cls: 'icon mint', aria: 'Shop', onClick: () => nav.go('shop') }),
        button({ icon: 'gear', cls: 'icon ghost', aria: 'Settings', onClick: () => nav.go('settings') }),
      ),
      h(
        'div.menu-main',
        null,
        h(
          'div.menu-left',
          null,
          h('div.logo', null, h('span.l1', null, 'POLYGON'), h('span.l2', null, 'RUSH')),
          previewCanvas({ skin: d.skins.equipped, animate: true, scale: 0.62 }, 'hero-preview'),
          h('div.best-line', null, ic('crown'), 'Best', h('b', null, `${fmt(best)} m`)),
        ),
        h(
          'div.menu-right',
          null,
          playBtn,
          h(
            'div.mode-grid',
            null,
            button({ label: 'Race', icon: 'flag', cls: 'cyan stack', sub: league.name, onClick: () => nav.go('race') }),
            button({ label: 'Duel', icon: 'duel', cls: 'pink stack', sub: '2 players', onClick: () => nav.go('duel') }),
            button({
              label: 'Friends',
              icon: 'globe',
              cls: 'violet stack',
              sub: 'Online',
              onClick: () => {
                if (!store.data.settings.onlineAllowed) {
                  ui.toast('Online play is turned off in Parental Controls.', 'lock');
                  return;
                }
                nav.go('friends');
              },
            }),
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
      h('div.ad-safe'),
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
