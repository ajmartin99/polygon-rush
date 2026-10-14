import { store } from '../../state/store';
import { ads } from '../../services/ads';
import { iap } from '../../services/iap';
import { CONFIG } from '../../config';
import { PRIVACY_SECTIONS } from '../../meta/legal';
import type { GraphicsQuality } from '../../state/save';
import { BaseScreen, button, confirm, parentalGate, segmented, slider, titleBar, toggle } from '../components';
import { h, ic, type Child } from '../dom';
import type { IconName } from '../icons';
import { nav } from '../nav';
import { ui } from '../ui';

function row(iconName: IconName, title: string, sub: string, control: Child): HTMLElement {
  return h('div.setting', null, h('span', { class: 'ico', style: 'display:contents' }, ic(iconName)), h('div.lbl', null, h('b', null, title), h('span', null, sub)), control);
}

export function openPrivacyPolicy(): void {
  ui.modal(
    [
      h('h2', null, 'Privacy Policy'),
      h(
        'div.body-scroll',
        null,
        PRIVACY_SECTIONS.map((s) => [h('h3', null, s.title), h('p', null, s.body)]),
        h('p', { style: 'margin-top:0.8rem' }, `Full policy: ${CONFIG.privacyUrl}`),
        CONFIG.supportEmail ? h('p', null, `Contact: ${CONFIG.supportEmail}`) : null,
      ),
    ],
    { wide: true, showClose: true },
  );
}

function openCredits(): void {
  ui.modal(
    [
      h('h2', null, 'Credits'),
      h(
        'div.body-scroll',
        { style: 'text-align:center' },
        h('p', null, h('b', null, 'Polygon Rush'), ` v${CONFIG.version}`),
        h('p', null, 'Game design, code, music & art made with ♥ for players of every age.'),
        h('h3', null, 'Built with'),
        h('p', null, 'Capacitor · Vite · TypeScript · Web Audio · Canvas'),
        h('h3', null, 'Font'),
        h('p', null, 'Fredoka by Milena Brandão & Hafontia — SIL Open Font License 1.1'),
        h('h3', null, 'Thank you'),
        h('p', null, 'To every Rusher who jumps, flips, glides and hops. Keep rushing!'),
      ),
    ],
    { wide: true, showClose: true },
  );
}

async function openParentalControls(): Promise<void> {
  if (!(await parentalGate('Parental controls are for grown-ups.'))) return;
  const s = store.settings;
  ui.modal(
    [
      h('h2', null, 'Parental Controls'),
      h(
        'div.col',
        { style: 'text-align:left;gap:0.8rem' },
        row('globe', 'Online play', 'Allow "Play with Friends" rooms (no chat).', toggle(s.onlineAllowed, (v) => store.setSetting('onlineAllowed', v), 'Online play')),
        row('cart', 'Purchases', 'Allow in-app purchases (a grown-up check is always shown).', toggle(s.purchasesAllowed, (v) => store.setSetting('purchasesAllowed', v), 'Purchases')),
        row('child', 'Kid Mode', 'Slower speed and extra hearts in Endless.', toggle(s.kidMode, (v) => store.setSetting('kidMode', v), 'Kid Mode')),
      ),
      h('p.muted.small', null, 'Ads for players under 13 are always child-directed, non-personalised and G-rated.'),
    ],
    { showClose: true },
  );
}

export class SettingsScreen extends BaseScreen {
  constructor() {
    super('.solid');
    const s = store.settings;
    const gfx = segmented<GraphicsQuality>(
      [
        { value: 'auto', label: 'Auto' },
        { value: 'high', label: 'High' },
        { value: 'low', label: 'Low' },
      ],
      s.graphics,
      (v) => store.setSetting('graphics', v),
    );

    const actions: HTMLElement[] = [
      button({ label: 'Change name', icon: 'dice', cls: 'ghost sm', onClick: () => nav.go('name') }),
      button({
        label: 'Restore purchases',
        icon: 'restore',
        cls: 'ghost sm',
        onClick: async () => {
          const n = await iap.restore();
          ui.toast(n > 0 ? `Restored ${n} purchase${n > 1 ? 's' : ''}!` : 'Everything is already up to date.', 'restore');
        },
      }),
      button({ label: 'Parental controls', icon: 'child', cls: 'ghost sm', onClick: () => void openParentalControls() }),
      button({ label: 'Privacy policy', icon: 'privacy', cls: 'ghost sm', onClick: () => openPrivacyPolicy() }),
    ];
    if (ads.privacyOptionsRequired) {
      actions.push(button({ label: 'Privacy choices', icon: 'privacy', cls: 'ghost sm', onClick: () => void ads.showPrivacyOptions() }));
    }
    actions.push(
      button({ label: 'Credits', icon: 'info', cls: 'ghost sm', onClick: () => openCredits() }),
      button({
        label: 'Reset progress',
        icon: 'trash',
        cls: 'red sm',
        onClick: async () => {
          if (!(await confirm('Reset progress?', 'This deletes your gems, skins, records and missions on this device. Purchases can be restored.', 'Reset', 'Cancel', true))) return;
          if (!(await parentalGate('Resetting progress cannot be undone.'))) return;
          await store.reset();
          ui.toast('Progress reset.', 'trash');
          nav.go('menu');
        },
      }),
    );

    this.el.append(
      titleBar('Settings', 'gear', () => nav.go('menu')),
      h(
        'div.scroll.grow',
        { style: 'margin-top:0.8rem;min-height:0' },
        h(
          'div.panel',
          null,
          h(
            'div.settings-grid',
            null,
            row('music', 'Music', 'Background beats', slider(s.music, (v) => store.setSetting('music', v), 'Music volume')),
            row('sound', 'Sound effects', 'Jumps, gems & more', slider(s.sfx, (v) => store.setSetting('sfx', v), 'Sound volume')),
            row('vibrate', 'Vibration', 'Buzz on bumps and pickups', toggle(s.haptics, (v) => store.setSetting('haptics', v), 'Vibration')),
            row('motion', 'Reduce motion', 'Less shaking and flashing', toggle(s.reducedMotion, (v) => store.setSetting('reducedMotion', v), 'Reduce motion')),
            row('child', 'Kid Mode', 'Slower Endless with 5 hearts', toggle(s.kidMode, (v) => store.setSetting('kidMode', v), 'Kid Mode')),
            row('graphics', 'Graphics', 'Lower = smoother on older phones', gfx),
          ),
        ),
        h('div.row', { style: 'flex-wrap:wrap;margin-top:0.9rem;gap:0.5rem' }, actions),
        h('p.muted.small', { style: 'margin-top:0.8rem' }, `Polygon Rush v${CONFIG.version} · ${store.data.profile.name}`),
      ),
    );
  }
}
