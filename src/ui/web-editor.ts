import { CONFIG } from '../config';
import { IS_PORTAL } from '../core/portal';
import { levelName, type LevelData } from '../game/level';
import { ageOf } from '../meta/community';
import { gemPriceOf } from '../meta/products';
import { cloud, type TestStatus } from '../services/cloud';
import { ServerError } from '../services/server';
import { ageGroupFor } from '../state/save';
import { store } from '../state/store';
import { BaseScreen, button, confirm, parentalGate } from './components';
import { h, ic } from './dom';
import { nav } from './nav';
import { ui } from './ui';

/** Where players open the web editor. */
export function webEditorUrl(): string {
  return `${CONFIG.server.url}/build`;
}

/** "📱 Mobile" / "🖥️ Web" on your own level cards. */
export function madeOnTag(l: Pick<LevelData, 'madeOn' | 'origin'>): HTMLElement | null {
  if (l.origin !== 'mine' || !l.madeOn) return null;
  return h(`span.made-on.${l.madeOn}`, { title: l.madeOn === 'web' ? 'Built in the web editor' : 'Built in the app' }, l.madeOn === 'web' ? 'Web' : 'Mobile');
}

// ================================================================== phone
/** Create → Web Editor: link a computer's browser with a short code. */
export async function openWebLink(): Promise<void> {
  const d = store.data;
  if (!d.purchases.builder) {
    const gems = gemPriceOf(CONFIG.iap.products.builderPack);
    const m = ui.modal(
      [
        h('h2', null, 'Web Editor'),
        h('p', null, 'Build levels on a computer with a big screen, mouse and keyboard. Your levels show up on your phone too, and you can test-play them on your phone right from the browser.'),
        h('p.muted.small', null, `Comes with the Builder Pack${gems ? `, or ${gems.toLocaleString()} gems` : ''}.`),
        h('div.actions', null, button({ label: 'See the Builder Pack', icon: 'cart', cls: 'yellow lg', onClick: () => (m.close(), nav.go('shop', { tab: 'gems' })) })),
      ],
      { showClose: true },
    );
    return;
  }
  if (ageOf(d.profile.birthYear) < 13 && !(await parentalGate('Linking a computer is for grown-ups to set up.'))) return;
  const codeEl = h('div.pair-code', { 'aria-live': 'polite' }, '······');
  const note = h('p.muted.small', null, 'Making your code…');
  const linkedNote = h('p.small', { style: 'color:var(--mint);min-height:1.2em' });
  let stop = false;
  const unlink = button({
    label: 'Sign out all browsers',
    icon: 'lock',
    cls: 'red sm',
    onClick: async () => {
      if (!(await confirm('Sign out all browsers?', 'Your levels stay on this phone. You can link a browser again any time.', 'Sign out', 'Cancel', true))) return;
      try {
        await cloud.unlinkAll();
        ui.toast('All browsers signed out.', 'lock');
        m.close();
      } catch (e) {
        ui.toast(e instanceof ServerError ? e.message : 'That didn’t work. Try again.', 'wifi');
      }
    },
  });
  unlink.hidden = !d.web.linked;
  const m = ui.modal(
    [
      h('h2', null, 'Web Editor'),
      h('ol.pair-steps', null, h('li', null, 'On a computer, open ', h('b', null, webEditorUrl().replace(/^https?:\/\//, ''))), h('li', null, 'Type this code:')),
      codeEl,
      note,
      linkedNote,
      h('p.muted.small', null, 'Levels you build on either side show up on both, tagged Mobile or Web. Send a level from the browser to test it here.'),
      h('div.actions', null, unlink),
    ],
    { showClose: true },
  );
  void m.closed.then(() => (stop = true));
  let before = 0;
  try {
    before = (await cloud.status()).browsers;
    if (before) linkedNote.textContent = `${before} browser${before > 1 ? 's' : ''} linked.`;
    const p = await cloud.pair();
    codeEl.textContent = p.code;
    note.textContent = 'The code works once, for 10 minutes.';
  } catch (e) {
    note.textContent = e instanceof ServerError ? e.message : 'Can’t reach the game server. Check your connection.';
    return;
  }
  // Wait for the browser to use the code.
  const started = Date.now();
  while (!stop && Date.now() - started < 10 * 60_000) {
    await new Promise((r) => setTimeout(r, 3000));
    if (stop) return;
    try {
      const st = await cloud.status();
      if (st.browsers > before || (st.browsers > 0 && st.webActive && !store.data.web.linked)) {
        cloud.linked();
        ui.toast('Browser linked! Your levels are syncing.', 'check', 3500);
        m.close();
        return;
      }
    } catch {
      /* keep waiting */
    }
  }
}

/** Phone: a level sent from the web editor to test (shown once you're back in the menus). */
export function initWebTests(): void {
  if (IS_PORTAL) return;
  let waiting: { level: LevelData; sent: number } | null = null;
  const offer = () => {
    if (!waiting || !nav.route) return;
    const t = waiting;
    waiting = null;
    const m = ui.modal(
      [
        h('h2', null, 'Test from the web editor'),
        h('p', null, `“${levelName(t.level)}” is ready to test on this phone.`),
        h(
          'div.actions',
          null,
          button({ label: 'Not now', cls: 'ghost lg', onClick: () => m.close() }),
          button({
            label: 'Play it',
            icon: 'play',
            cls: 'mint lg',
            onClick: () => {
              m.close();
              let best = 0;
              let done = false;
              nav.play({
                mode: 'custom',
                level: t.level,
                test: true,
                exit: () => nav.go('create'),
                onResult: (r) => {
                  best = Math.max(best, r.progress);
                  done = done || r.completed;
                  cloud.report(t.sent, best, done);
                },
              });
            },
          }),
        ),
      ],
      { showClose: true },
    );
  };
  cloud.on('test', (t) => {
    waiting = t;
    offer();
  });
  setInterval(offer, 1500);
}

// ================================================================== browser
/** Web editor: what the browser's local profile needs from the linked player. */
function adoptPlayer(s: { name: string; band: 'child' | 'teen' | 'adult' }): void {
  const p = store.data.profile;
  const year = new Date().getFullYear() - (s.band === 'adult' ? 25 : s.band === 'teen' ? 15 : 10);
  p.name = s.name;
  p.birthYear = year;
  p.ageGroup = ageGroupFor(year);
  store.commit();
}

/** Web editor home: link this browser, or (once linked) open your levels. */
export class PortalScreen extends BaseScreen {
  constructor() {
    super('.solid');
    const s = cloud.web;
    if (s) adoptPlayer(s);
    const panel = h('div.panel.col.portal-panel');
    this.el.append(h('div.grow.center', null, panel));
    panel.append(h('div.logo', { style: 'transform:none' }, h('span.l1', { style: 'font-size:1.2rem' }, 'Polygon Rush'), h('span.l2', { style: 'font-size:1.8rem' }, 'WEB EDITOR')));
    if (s) {
      panel.append(
        h('p', null, 'Signed in as ', h('b', null, `${s.name}#${String(s.tag).padStart(4, '0')}`)),
        h('p.muted.small', null, 'Your levels sync with your phone. Use Test on phone in a level to play it there.'),
        h(
          'div.actions',
          null,
          button({ label: 'My Levels', icon: 'build', cls: 'yellow lg', onClick: () => nav.go('create') }),
          button({
            label: 'Sign out',
            icon: 'lock',
            cls: 'ghost lg',
            onClick: () => {
              cloud.signOut();
              nav.go('portal');
            },
          }),
        ),
      );
      return;
    }
    const input = h<HTMLInputElement>('input.text-input.pair-input', {
      maxlength: '7',
      placeholder: 'ABC123',
      'aria-label': 'Code from the game',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const err = h('p.small', { style: 'color:var(--red);min-height:1.2em' });
    const go = async () => {
      err.textContent = '';
      try {
        const session = await cloud.link(input.value);
        adoptPlayer(session);
        ui.toast(`Welcome, ${session.name}!`, 'check');
        nav.go('create');
      } catch (e) {
        err.textContent = e instanceof ServerError ? e.message : 'That didn’t work. Try again.';
      }
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void go();
    });
    panel.append(
      h(
        'ol.pair-steps',
        null,
        h('li', null, 'Open Polygon Rush on your phone.'),
        h('li', null, 'Go to ', h('b', null, 'Create → Web Editor'), ' (comes with the Builder Pack).'),
        h('li', null, 'Type the code it shows here:'),
      ),
      input,
      err,
      h('div.actions', null, button({ label: 'Link', icon: 'check', cls: 'mint lg', onClick: () => void go() })),
      h('p.muted.small', null, 'Only levels are shared between this browser and your phone. Sign out any time here, or from your phone.'),
    );
    setTimeout(() => input.focus(), 50);
  }

  override back(): boolean {
    return true;
  }
}

/** Web editor: send a level to the phone and show how the test went. */
export async function testOnPhone(level: LevelData): Promise<void> {
  const status = h('p', { 'aria-live': 'polite' }, 'Sending…');
  const detail = h('p.muted.small', null, 'Open Polygon Rush on your phone. It pops up in a few seconds.');
  let stop = false;
  const m = ui.modal([h('h2', null, 'Test on phone'), h('div.center', { style: 'font-size:2.4rem' }, ic('play')), status, detail], { showClose: true });
  void m.closed.then(() => (stop = true));
  let sent: TestStatus;
  try {
    sent = await cloud.sendTest(level);
  } catch (e) {
    status.textContent = e instanceof ServerError ? e.message : 'Can’t reach the game server.';
    return;
  }
  status.textContent = `Sent “${levelName(level)}” to your phone.`;
  const started = Date.now();
  while (!stop && Date.now() - started < 15 * 60_000) {
    await new Promise((r) => setTimeout(r, 2500));
    if (stop) return;
    const t = await cloud.testStatus().catch(() => null);
    if (!t || t.sent !== sent.sent) continue;
    if (t.result) {
      status.textContent = t.result.completed ? 'Your phone beat it from the start!' : `Your phone got ${Math.floor(t.result.progress * 100)}% of the way.`;
      detail.textContent = 'Change what you like and send it again.';
    } else if (t.delivered) {
      status.textContent = 'Your phone has it. Play away!';
      detail.textContent = 'The result shows here when the run ends.';
    }
  }
}

