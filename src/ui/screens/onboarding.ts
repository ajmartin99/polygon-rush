import { ageGroupFor } from '../../state/save';
import { store } from '../../state/store';
import { isGeneratedName, randomName } from '../../meta/names';
import { checkDisplayText, NAME_MESSAGES } from '../../shared/chat-filter';
import { canTypeName, claimTypedName } from '../../services/names';
import { friends } from '../../services/friends';
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
    // 13+: type your own name (checked here, then claimed on the community server).
    const input = h<HTMLInputElement>('input.name-input', { type: 'text', maxlength: '16', placeholder: 'Or type your own (letters, numbers)', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', value: isGeneratedName(name) ? '' : name });
    const hint = h('p.small.name-hint', null, 'No real names, ages or phone numbers. Rude names get reset.');
    input.addEventListener('input', () => {
      const v = input.value.trim();
      const r = v ? checkDisplayText(v, 'name') : null;
      hint.textContent = !r ? 'No real names, ages or phone numbers. Rude names get reset.' : r.ok ? 'Looks good!' : NAME_MESSAGES[r.reason ?? 'empty'];
      hint.classList.toggle('bad', Boolean(r && !r.ok));
      if (r?.ok) label.textContent = r.text;
      else if (!v) label.textContent = name;
    });
    const typed = h('div.name-type', null, input);
    const reroll = button({
      icon: 'dice',
      cls: 'icon yellow',
      aria: 'New name',
      onClick: () => {
        name = randomName();
        label.textContent = name;
        input.value = '';
        hint.classList.remove('bad');
        reroll.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 400 });
      },
    });
    this.el.append(
      h(
        'div.grow.center.screen-scroll',
        null,
        h(
          'div.panel.name-panel',
          null,
          // Two columns on short landscape screens (see .name-panel), one otherwise.
          h(
            'div.name-side',
            null,
            h('h2', null, first ? 'Choose your racer name!' : 'Change your name'),
            previewCanvas({ skin: store.data.skins.equipped, animate: true, scale: 0.6 }, 'hero-preview'),
          ),
          h(
            'div.name-side',
            null,
            h('div.name-card', null, label, reroll),
            h('p.muted.small', null, canTypeName() ? 'Tap the dice for a new name, or type your own below.' : 'Tap the dice for a new name. Names are made up so everyone stays safe.'),
            canTypeName() ? typed : null,
            canTypeName() ? hint : null,
            button({
              label: first ? "Let's Rush!" : 'Save',
              icon: first ? 'play' : 'check',
              cls: 'mint lg',
              onClick: async () => {
                const want = input.value.trim();
                if (want) {
                  const r = await claimTypedName(want);
                  if (!r.ok) {
                    hint.textContent = r.message;
                    hint.classList.add('bad');
                    return;
                  }
                  name = r.name;
                }
                store.data.profile.name = name;
                store.commit();
                void friends.refresh();
                nav.go('menu');
              },
            }),
            first ? null : button({ label: 'Cancel', cls: 'ghost sm', onClick: () => nav.go('settings'), sfx: 'back' }),
          ),
        ),
      ),
    );
  }

  override back(): boolean {
    if (store.data.profile.name) nav.go('settings');
    return true;
  }
}

