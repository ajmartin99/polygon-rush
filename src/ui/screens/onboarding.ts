import { ageGroupFor } from '../../state/save';
import { store } from '../../state/store';
import { randomName } from '../../meta/names';
import { ads } from '../../services/ads';
import { BaseScreen, button } from '../components';
import { h } from '../dom';
import { nav } from '../nav';
import { previewCanvas } from '../preview';

/**
 * Neutral age screen (Google Play Families policy): asks for a birth year with
 * no default and no hint about which answer unlocks anything.
 */
export class AgeGateScreen extends BaseScreen {
  private selected: number | null = null;

  constructor() {
    super('.solid');
    const thisYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = thisYear - 3; y >= thisYear - 90; y--) years.push(y);
    const go = button({
      label: 'Continue',
      icon: 'play',
      cls: 'mint lg',
      disabled: true,
      onClick: () => this.finish(),
    });
    const grid = h(
      'div.year-grid.scroll',
      null,
      years.map((y) => {
        const b = h('button', { 'data-year': String(y) }, String(y));
        b.addEventListener('click', () => {
          grid.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          this.selected = y;
          go.disabled = false;
        });
        return b;
      }),
    );
    this.el.append(
      h(
        'div.grow.center',
        null,
        h(
          'div.panel.col',
          { style: 'width:min(38rem,94vw);max-height:calc(100vh - 1.6rem);gap:0.6rem;text-align:center;padding:0.8rem 1rem' },
          h('div.logo', { style: 'transform:none' }, h('span.l1', { style: 'font-size:1.3rem' }, 'Welcome to'), h('span.l2', { style: 'font-size:1.9rem' }, 'POLYGON RUSH')),
          h('p', null, 'What year were you born?'),
          grid,
          h('div.row', { style: 'justify-content:center' }, go),
          h('p.muted.small', null, 'We only use this to set up the game for you. It never leaves your device.'),
        ),
      ),
    );
  }

  private finish(): void {
    if (this.selected === null) return;
    store.data.profile.birthYear = this.selected;
    store.data.profile.ageGroup = ageGroupFor(this.selected);
    // Grown-up controls: kids default to purchases needing a grown-up anyway (parental gate).
    store.commit();
    void store.flush();
    void ads.init();
    nav.go('name', { first: true });
  }

  override back(): boolean {
    return true; // can't skip
  }
}

/** Pick a generated racer name (no free text = nothing personal shared). */
export class NameScreen extends BaseScreen {
  constructor(params?: Record<string, unknown>) {
    super('.solid');
    const first = Boolean(params?.first);
    let name = store.data.profile.name || randomName();
    const label = h('span', null, name);
    const reroll = button({
      icon: 'dice',
      cls: 'icon yellow',
      aria: 'New name',
      onClick: () => {
        name = randomName();
        label.textContent = name;
        reroll.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 400 });
      },
    });
    this.el.append(
      h(
        'div.grow.center',
        null,
        h(
          'div.panel.col',
          { style: 'width:min(32rem,94vw);gap:1rem;align-items:center;text-align:center' },
          h('h2', null, first ? 'Choose your racer name!' : 'Change your name'),
          previewCanvas({ skin: store.data.skins.equipped, animate: true, scale: 0.6 }, 'hero-preview'),
          h('div.name-card', null, label, reroll),
          h('p.muted.small', null, 'Tap the dice for a new name. Names are made up so everyone stays safe.'),
          button({
            label: first ? "Let's Rush!" : 'Save',
            icon: first ? 'play' : 'check',
            cls: 'mint lg',
            onClick: () => {
              store.data.profile.name = name;
              store.commit();
              nav.go('menu');
            },
          }),
          first ? null : button({ label: 'Cancel', cls: 'ghost sm', onClick: () => nav.go('settings'), sfx: 'back' }),
        ),
      ),
    );
  }

  override back(): boolean {
    if (store.data.profile.name) nav.go('settings');
    return true;
  }
}
