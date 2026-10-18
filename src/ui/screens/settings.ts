import { store } from '../../state/store';
import { ads } from '../../services/ads';
import { iap } from '../../services/iap';
import { CONFIG } from '../../config';
import { PRIVACY_SECTIONS } from '../../meta/legal';
import { DIFFICULTY_NAMES, type GraphicsQuality } from '../../state/save';
import { DIFFICULTIES, type Difficulty } from '../../game/constants';
import { BaseScreen, button, confirm, parentalGate, segmented, slider, titleBar, toggle } from '../components';
import { h, ic, type Child } from '../dom';
import type { IconName } from '../icons';
import { nav } from '../nav';
import { ui } from '../ui';
import { openChatSettings, startFreeChatSignup } from '../community';
import { music } from '../../core/music';
import { SONGS } from '../../core/songs';
import { TRACKS } from '../../core/tracks';
import { musicCredits, openSoundtrack } from '../soundtrack';
import { canOfferFreeChat, freeChatPath, serverAvailable } from '../../meta/community';
import { BackupError, makeBackup, restoreBackup } from '../../services/backup';
import { friends } from '../../services/friends';

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
        musicCredits(),
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
  const d = store.data;
  const teenPlus = freeChatPath(d.profile.birthYear) !== 'none';
  const freeToggle = toggle(s.freeChat && Boolean(d.account.token), async (v) => {
    if (!v) {
      store.setSetting('freeChat', false);
      return;
    }
    if (d.account.token && (freeChatPath(d.profile.birthYear) === 'self' || d.account.consent === 'parent')) {
      store.setSetting('freeChat', true);
      return;
    }
    // No approved account yet: run the email approval now.
    m.close();
    await startFreeChatSignup();
  }, 'Free Chat');
  const m = ui.modal(
    [
      h('h2', null, 'Parental Controls'),
      h(
        'div.col.body-scroll',
        { style: 'text-align:left;gap:0.8rem' },
        row('globe', 'Online play', 'Allow online rooms: Play with Friends and Build Together.', toggle(s.onlineAllowed, (v) => store.setSetting('onlineAllowed', v), 'Online play')),
        serverAvailable()
          ? row('users', 'Friends', 'Add friends by their Name#number, see who’s online and get invites to their rooms. No messages.', toggle(s.friends, (v) => store.setSetting('friends', v), 'Friends'))
          : null,
        serverAvailable()
          ? row('build', 'Community levels', 'Play levels other players built and share your own. Levels carry no messages, and the builder shows by racer name only.', toggle(s.sharedLevels, (v) => store.setSetting('sharedLevels', v), 'Community levels'))
          : null,
        row('chat', 'Quick Chat', 'Preset friendly phrases and emotes in online rooms. No typing.', toggle(s.quickChat, (v) => store.setSetting('quickChat', v), 'Quick Chat')),
        teenPlus && serverAvailable()
          ? row('public', 'Public build rooms', 'Let your teen find and join build rooms hosted by other players (13+).', toggle(s.publicRooms, (v) => store.setSetting('publicRooms', v), 'Public build rooms'))
          : null,
        canOfferFreeChat(d)
          ? row(
              'verified',
              'Free Chat',
              freeChatPath(d.profile.birthYear) === 'parent'
                ? 'Typed messages with other verified players, filtered and moderated. Ages 13–15 need your email approval.'
                : 'Typed messages with other verified players, filtered and moderated.',
              freeToggle,
            )
          : null,
        row('cart', 'Purchases', 'Allow in-app purchases (a grown-up check is always shown).', toggle(s.purchasesAllowed, (v) => store.setSetting('purchasesAllowed', v), 'Purchases')),
        row('child', 'Kid Mode', 'Slower speed and extra hearts in Endless.', toggle(s.kidMode, (v) => store.setSetting('kidMode', v), 'Kid Mode')),
      ),
      h(
        'p.muted.small',
        null,
        teenPlus
          ? `Ads for players under 13 are always child-directed, non-personalised and G-rated. ${CONFIG.features.freeChat ? 'Free Chat is never available under 13.' : 'There is no typed chat, only Quick Chat.'}`
          : 'Ads for players under 13 are always child-directed, non-personalised and G-rated. Players under 13 can only use Quick Chat, never typed chat or public rooms.',
      ),
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
      button({ label: 'Move to a new phone', icon: 'share', cls: 'ghost sm', onClick: () => openBackup() }),
      button({ label: 'Parental controls', icon: 'child', cls: 'ghost sm', onClick: () => void openParentalControls() }),
      button({ label: 'Chat & Community', icon: 'chat', cls: 'ghost sm', onClick: () => openChatSettings() }),
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
            row(
              'skip',
              'Soundtrack',
              `${SONGS.length + TRACKS.length} songs + My Music · pick, skip, add your own`,
              h('div.row', { style: 'gap:0.4rem' }, button({ icon: 'skip', cls: 'icon ghost', aria: 'Skip song', onClick: () => music.skip() }), button({ label: 'Songs', cls: 'yellow sm', onClick: () => openSoundtrack() })),
            ),
            row('sound', 'Sound effects', 'Jumps, gems & more', slider(s.sfx, (v) => store.setSetting('sfx', v), 'Sound volume')),
            row('vibrate', 'Vibration', 'Buzz on bumps and pickups', toggle(s.haptics, (v) => store.setSetting('haptics', v), 'Vibration')),
            row('motion', 'Reduce motion', 'Less shaking and flashing', toggle(s.reducedMotion, (v) => store.setSetting('reducedMotion', v), 'Reduce motion')),
            row(
              'target',
              'Difficulty',
              'Endless & CPU races',
              segmented<Difficulty>(
                DIFFICULTIES.map((v) => ({ value: v, label: DIFFICULTY_NAMES[v] })),
                s.difficulty,
                (v) => store.setSetting('difficulty', v),
              ),
            ),
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

/** Settings → Move to a new phone: copy a backup code here, paste it there. */
function openBackup(): void {
  const out = h<HTMLTextAreaElement>('textarea.backup-code', {
    readonly: '',
    rows: '3',
    'aria-label': 'Your backup code',
    placeholder: 'Making your code…',
  });
  const inp = h<HTMLTextAreaElement>('textarea.backup-code', {
    rows: '3',
    'aria-label': 'Paste a backup code',
    placeholder: 'Paste the code from your old phone here',
  });
  void makeBackup().then((c) => (out.value = c));
  const m = ui.modal(
    [
      h('h2', null, 'Move to a new phone'),
      h(
        'div.col.body-scroll',
        { style: 'gap:0.7rem;text-align:left' },
        h('h3', null, 'On your old phone'),
        h(
          'p.muted.small',
          null,
          'Copy this code and send it to yourself. It holds your gems, skins, records, levels, name and friends. Keep it private: anyone with it can use your friends list. Purchases come back with Restore purchases.',
        ),
        out,
        button({
          label: 'Copy code',
          icon: 'copy',
          cls: 'mint sm',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(out.value);
              ui.toast('Backup code copied.', 'check');
            } catch {
              out.select();
            }
          },
        }),
        h('h3', null, 'On your new phone'),
        h('p.muted.small', null, 'Paste the code from your old phone. This replaces the progress on this phone.'),
        inp,
        button({
          label: 'Restore',
          icon: 'restore',
          cls: 'yellow sm',
          onClick: async () => {
            if (!inp.value.trim()) return ui.toast('Paste your backup code first.', 'info');
            if (!(await confirm('Restore this backup?', 'Progress on this phone is replaced by the backup.', 'Restore', 'Cancel', true))) return;
            try {
              const r = await restoreBackup(inp.value);
              m.close();
              void friends.refresh();
              ui.toast(`Welcome back! Progress restored${r.levels ? ` with ${r.levels} level${r.levels > 1 ? 's' : ''}` : ''}.`, 'check', 3500);
              nav.go('menu');
            } catch (e) {
              ui.toast(e instanceof BackupError ? e.message : 'That backup didn’t work. Copy the whole code and try again.', 'info', 4000);
            }
          },
        }),
      ),
    ],
    { showClose: true, wide: true },
  );
}
