import { store } from '../state/store';
import { xpForLevel } from '../meta/economy';
import { h, ic, fmt, type Child } from './dom';
import type { IconName } from './icons';
import { ui, type Screen } from './ui';
import { nav } from './nav';

/** Helper base for screens: collects cleanup callbacks run on leave. */
export class BaseScreen implements Screen {
  el: HTMLElement;
  protected disposers: (() => void)[] = [];
  constructor(cls = '') {
    this.el = h(`div.screen${cls}`);
  }
  enter(): void {}
  leave(): void {
    for (const d of this.disposers.splice(0)) d();
  }
  back(): boolean {
    nav.go('menu');
    return true;
  }
  own(dispose: () => void): void {
    this.disposers.push(dispose);
  }
}

export function button(opts: {
  label?: Child;
  icon?: IconName;
  cls?: string;
  sub?: string;
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  badge?: number;
  aria?: string;
  sfx?: 'back';
}): HTMLButtonElement {
  const b = h<HTMLButtonElement>(
    `button.btn${opts.cls ? '.' + opts.cls.split(' ').join('.') : ''}`,
    {
      'aria-label': opts.aria,
      'data-sfx': opts.sfx,
      onclick: (e: MouseEvent) => {
        if (b.disabled) return;
        opts.onClick?.(e);
      },
    },
    opts.icon ? ic(opts.icon) : null,
    opts.sub ? h('span', null, opts.label ?? '', h('span.sub', null, opts.sub)) : (opts.label ?? null),
  );
  if (opts.sub) b.classList.add('stack');
  if (opts.disabled) b.disabled = true;
  if (opts.badge && opts.badge > 0) b.appendChild(h('span.badge', null, String(opts.badge)));
  return b;
}

export function setBadge(btn: HTMLElement, count: number): void {
  btn.querySelector('.badge')?.remove();
  if (count > 0) btn.appendChild(h('span.badge', null, String(count)));
}

/** Gem counter chip that live-updates. Tapping "+" opens the gem shop. */
export function gemChip(screen: BaseScreen, showPlus = true): HTMLElement {
  const num = h('span.num', null, fmt(store.data.gems));
  const chip = h(
    'div.chip.gems',
    null,
    ic('gem'),
    num,
    showPlus ? h('button.plus', { 'aria-label': 'Get gems', onclick: () => nav.go('shop', { tab: 'gems' }) }, '+') : null,
  );
  let shown = store.data.gems;
  let anim = 0;
  const off = store.on('gems', ({ gems }) => {
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
    // Count up/down smoothly.
    const from = shown;
    const start = performance.now();
    cancelAnimationFrame(anim);
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 500);
      shown = Math.round(from + (gems - from) * (1 - Math.pow(1 - k, 3)));
      num.textContent = fmt(shown);
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  });
  screen.own(() => {
    off();
    cancelAnimationFrame(anim);
  });
  return chip;
}

/** Level badge + XP bar + player name. */
export function levelChip(): HTMLElement {
  const d = store.data;
  const need = xpForLevel(d.level);
  const pct = Math.min(100, (d.xp / need) * 100);
  return h(
    'button.level-chip',
    { title: `${d.xp} / ${need} XP · Profile`, 'aria-label': 'Your profile', onclick: () => nav.go('profile') },
    h('div.lvl', null, h('span', null, String(d.level))),
    h('div.meta', null, h('div.name', null, d.profile.name || 'Rusher'), h('div.bar', null, h('i', { style: `width:${pct}%` }))),
  );
}

export function titleBar(title: string, iconName: IconName | null, onBack: () => void, right?: Child): HTMLElement {
  return h(
    'div.topbar',
    null,
    button({ icon: 'back', cls: 'icon ghost', onClick: onBack, aria: 'Back', sfx: 'back' }),
    h('div.screen-title', null, iconName ? h('span', { style: 'width:2rem;height:2rem;display:inline-flex' }, ic(iconName)) : null, h('h2', null, title)),
    h('div.spacer'),
    right ?? null,
  );
}

export function toggle(value: boolean, onChange: (v: boolean) => void, label = 'Toggle'): HTMLButtonElement {
  const b = h<HTMLButtonElement>(`button.switch${value ? '.on' : ''}`, { role: 'switch', 'aria-checked': String(value), 'aria-label': label });
  b.addEventListener('click', () => {
    value = !value;
    b.classList.toggle('on', value);
    b.setAttribute('aria-checked', String(value));
    onChange(value);
  });
  return b;
}

export function slider(value: number, onChange: (v: number) => void, label = 'Volume'): HTMLInputElement {
  const input = h<HTMLInputElement>('input', { type: 'range', min: '0', max: '100', step: '5', 'aria-label': label });
  input.value = String(Math.round(value * 100));
  const paint = () => input.style.setProperty('--p', `${input.value}%`);
  paint();
  input.addEventListener('input', () => {
    paint();
    onChange(Number(input.value) / 100);
  });
  return input;
}

export function segmented<T extends string>(options: { value: T; label: string }[], value: T, onChange: (v: T) => void): HTMLElement {
  const wrap = h('div.seg');
  for (const o of options) {
    const b = h<HTMLButtonElement>(`button${o.value === value ? '.on' : ''}`, null, o.label);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onChange(o.value);
    });
    wrap.appendChild(b);
  }
  return wrap;
}

export function progressBar(fraction: number, cls = ''): HTMLElement {
  return h(`div.bar${cls ? '.' + cls : ''}`, null, h('i', { style: `width:${Math.max(0, Math.min(1, fraction)) * 100}%` }));
}

export function confirm(title: string, text: string, okLabel = 'Yes', cancelLabel = 'No', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const m = ui.modal(
      [
        h('h2', null, title),
        h('p.muted', null, text),
        h(
          'div.actions',
          null,
          button({ label: cancelLabel, cls: 'ghost lg', onClick: () => m.close(), sfx: 'back' }),
          button({
            label: okLabel,
            cls: `${danger ? 'red' : 'mint'} lg`,
            onClick: () => {
              result = true;
              m.close();
            },
          }),
        ),
      ],
      { onClose: () => resolve(result) },
    );
  });
}

export function alertModal(title: string, text: string, iconName?: IconName): Promise<void> {
  const m = ui.modal(
    [
      iconName ? h('div.reward-burst', null, ic(iconName)) : null,
      h('h2', null, title),
      h('p.muted', null, text),
      h('div.actions', null, button({ label: 'OK', cls: 'mint lg', onClick: () => m.close() })),
    ],
    {},
  );
  return m.closed;
}

/** Celebratory reward popup. */
export function rewardModal(title: string, gems: number, extra?: Child, onDouble?: () => Promise<boolean>): Promise<void> {
  ui.sfx('reward');
  const amount = h('span', null, `+${fmt(gems)}`);
  const doubleBtn = onDouble
    ? button({
        label: 'Double it!',
        icon: 'video',
        cls: 'yellow lg',
        onClick: async () => {
          doubleBtn!.disabled = true;
          const ok = await onDouble();
          if (ok) {
            amount.textContent = `+${fmt(gems * 2)}`;
            doubleBtn!.remove();
          } else {
            doubleBtn!.disabled = false;
          }
        },
      })
    : null;
  const m = ui.modal(
    [
      h('h2', null, title),
      h('div.reward-burst', null, ic('gem'), amount),
      extra ?? null,
      h('div.actions', null, doubleBtn, button({ label: 'Awesome!', cls: 'mint lg', onClick: () => m.close() })),
    ],
    {},
  );
  return m.closed;
}

/**
 * Parental gate (required before purchases and external links for anyone
 * who isn't a verified adult). A simple multiplication kids can't guess.
 */
export function parentalGate(reason = 'This area is for grown-ups.'): Promise<boolean> {
  if (!store.needsParentalGate) return Promise.resolve(true);
  return new Promise((resolve) => {
    const a = 3 + Math.floor(Math.random() * 7);
    const b = 4 + Math.floor(Math.random() * 6);
    const answer = a * b;
    const options = new Set<number>([answer]);
    while (options.size < 4) {
      const delta = (Math.floor(Math.random() * 5) + 1) * (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.5 ? 1 : a);
      const v = answer + delta;
      if (v > 0) options.add(v);
    }
    const shuffled = [...options].sort(() => Math.random() - 0.5);
    let ok = false;
    const m = ui.modal(
      [
        h('h2', null, 'Ask a grown-up'),
        h('p.muted', null, reason),
        h('p', { style: 'font-size:1.3rem;font-weight:700' }, `What is ${a} × ${b}?`),
        h(
          'div.actions',
          null,
          shuffled.map((v) =>
            button({
              label: String(v),
              cls: 'cyan lg',
              onClick: () => {
                if (v === answer) {
                  ok = true;
                  m.close();
                } else {
                  ui.sfx('error');
                  ui.toast('Oops! Please ask a grown-up for help.', 'info');
                  m.close();
                }
              },
            }),
          ),
        ),
      ],
      { showClose: true, onClose: () => resolve(ok) },
    );
  });
}
