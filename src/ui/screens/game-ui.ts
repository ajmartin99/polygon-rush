import { store } from '../../state/store';
import { REVIVE_GEM_COST } from '../../meta/economy';
import { BaseScreen, button, slider } from '../components';
import { h, ic, fmt, formatTime, ordinal, clear } from '../dom';
import { previewCanvas } from '../preview';
import { ui, type ModalHandle } from '../ui';
import type { LevelUp } from '../../meta/economy';

/** Transparent overlay during gameplay: pause button, hints, countdown. */
export class GameHud extends BaseScreen {
  private hintEl: HTMLElement | null = null;
  private hintTimer = 0;
  private countEl = h('div.countdown');
  onPause: () => void = () => {};

  constructor(opts: { duel?: boolean } = {}) {
    super();
    this.el.className = 'hud';
    const pause = button({ icon: 'pause', cls: 'icon ghost pause-btn', aria: 'Pause', onClick: () => this.onPause() });
    pause.dataset.silent = '1';
    if (opts.duel) this.el.append(h('div.duel-split'));
    this.el.append(this.countEl, pause);
    if (opts.duel) {
      // In split screen the pause button sits on the divider.
      pause.style.top = '50%';
      pause.style.transform = 'translateY(-50%)';
    }
  }

  override back(): boolean {
    this.onPause();
    return true;
  }

  showHint(text: string, sub = '', ms = 2600, top = '30%'): void {
    this.hideHint();
    this.hintEl = h('div.hint', { style: `top:${top}` }, text, sub ? h('small', null, sub) : null);
    this.el.appendChild(this.hintEl);
    if (ms > 0) this.hintTimer = window.setTimeout(() => this.hideHint(), ms);
  }

  hideHint(): void {
    clearTimeout(this.hintTimer);
    this.hintEl?.remove();
    this.hintEl = null;
  }

  /** 3-2-1-GO. Resolves when "GO" shows. */
  countdown(from = 3, onTick?: (n: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let n = from;
      const step = () => {
        clear(this.countEl);
        const label = n > 0 ? String(n) : 'GO!';
        this.countEl.appendChild(h('span', null, label));
        onTick?.(n);
        if (n === 0) {
          resolve();
          setTimeout(() => clear(this.countEl), 800);
          return;
        }
        n -= 1;
        setTimeout(step, 750);
      };
      step();
    });
  }
}

export function openPause(opts: { onResume: () => void; onRestart?: () => void; onQuit: () => void; title?: string; quitLabel?: string }): ModalHandle {
  const s = store.settings;
  const m = ui.modal(
    [
      h('h2', null, opts.title ?? 'Paused'),
      h(
        'div.col',
        { style: 'gap:0.5rem;align-items:center' },
        h('div.setting', { style: 'width:16rem' }, ic('music'), h('div.lbl', null, h('b', null, 'Music')), slider(s.music, (v) => store.setSetting('music', v))),
        h('div.setting', { style: 'width:16rem' }, ic('sound'), h('div.lbl', null, h('b', null, 'Sounds')), slider(s.sfx, (v) => store.setSetting('sfx', v))),
      ),
      h(
        'div.actions',
        null,
        button({ label: opts.quitLabel ?? 'Home', icon: opts.quitLabel === 'Edit' ? 'edit' : opts.quitLabel ? 'back' : 'home', cls: 'ghost lg', onClick: () => (m.close(), opts.onQuit()), sfx: 'back' }),
        opts.onRestart ? button({ label: 'Restart', icon: 'restart', cls: 'orange lg', onClick: () => (m.close(), opts.onRestart!()) }) : null,
        button({ label: 'Resume', icon: 'play', cls: 'mint lg', onClick: () => m.close() }),
      ),
    ],
    { onClose: () => opts.onResume() },
  );
  return m;
}

/**
 * "Keep rushing?" — optional continue. Resolves 'ad' | 'gems' | 'no'.
 */
export function openRevive(seconds = 6): Promise<'ad' | 'gems' | 'no'> {
  return new Promise((resolve) => {
    let choice: 'ad' | 'gems' | 'no' = 'no';
    const total = seconds;
    let left = seconds;
    const R = 40;
    const C = 2 * Math.PI * R;
    const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fill.setAttribute('class', 'fill');
    fill.setAttribute('cx', '50');
    fill.setAttribute('cy', '50');
    fill.setAttribute('r', String(R));
    fill.setAttribute('stroke-dasharray', String(C));
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('viewBox', '0 0 100 100');
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('class', 'track');
    track.setAttribute('cx', '50');
    track.setAttribute('cy', '50');
    track.setAttribute('r', String(R));
    ring.append(track, fill);
    const num = h('span', null, String(seconds));
    const canGems = store.canAfford(REVIVE_GEM_COST);
    const m = ui.modal(
      [
        h('h2', null, 'Keep rushing?'),
        h('div.ring-timer', null, ring, num),
        h(
          'div.actions',
          null,
          button({
            label: 'Watch video',
            icon: 'video',
            cls: 'yellow lg pulse',
            onClick: () => {
              choice = 'ad';
              m.close();
            },
          }),
          button({
            label: String(REVIVE_GEM_COST),
            icon: 'gem',
            cls: `${canGems ? 'cyan' : 'ghost'} lg`,
            disabled: !canGems,
            onClick: () => {
              choice = 'gems';
              m.close();
            },
          }),
        ),
        button({ label: 'No thanks', cls: 'ghost sm', onClick: () => m.close(), sfx: 'back' }),
      ],
      { dismissable: false, onClose: () => resolve(choice) },
    );
    const start = performance.now();
    const tick = () => {
      if (!m.el.isConnected) return;
      const elapsed = (performance.now() - start) / 1000;
      left = Math.max(0, total - elapsed);
      num.textContent = String(Math.ceil(left));
      fill.setAttribute('stroke-dashoffset', String(C * (1 - left / total)));
      if (left <= 0) m.close();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export interface EndlessResult {
  distance: number;
  best: number;
  newBest: boolean;
  gems: number;
  jumps: number;
  portals: number;
  xp: number;
  levelUps: LevelUp[];
  missionsDone: string[];
  kidMode: boolean;
}

export class EndlessResultsScreen extends BaseScreen {
  constructor(r: EndlessResult, actions: { onAgain: () => void; onHome: () => void; onDouble: () => Promise<boolean> }) {
    super('.dim');
    const gemsEl = h('b', null, ic('gem'), `+${fmt(r.gems)}`);
    const doubleBtn =
      r.gems > 0
        ? button({
            label: `Double gems`,
            icon: 'video',
            cls: 'yellow',
            onClick: async () => {
              doubleBtn!.disabled = true;
              if (await actions.onDouble()) {
                gemsEl.replaceChildren(ic('gem'), `+${fmt(r.gems * 2)}`);
                doubleBtn!.remove();
              } else doubleBtn!.disabled = false;
            },
          })
        : null;
    this.el.append(
      h(
        'div.results',
        null,
        h(
          'div.col',
          { style: 'align-items:center;gap:0.4rem;text-align:center' },
          h('span.stat-label', null, r.kidMode ? 'Distance · Kid Mode' : 'Distance'),
          h('div.stat-big', null, `${fmt(r.distance)}m`),
          r.newBest ? h('span.new-best', null, 'NEW BEST!') : h('span.muted', null, `Best ${fmt(r.best)}m`),
          previewCanvas({ skin: store.data.skins.equipped, animate: true, scale: 0.6 }, 'hero-preview'),
        ),
        h(
          'div.panel.col',
          { style: 'gap:0.7rem' },
          h(
            'div.result-stats',
            null,
            h('div.card', null, gemsEl, h('span', null, 'Gems')),
            h('div.card', null, h('b', null, fmt(r.jumps)), h('span', null, 'Jumps')),
            h('div.card', null, h('b', null, fmt(r.portals)), h('span', null, 'Portals')),
          ),
          h('div.row', { style: 'justify-content:space-between' }, h('span.muted.small', null, `+${fmt(r.xp)} XP`), r.levelUps.length ? h('b', { style: 'color:var(--yellow)' }, `Level ${r.levelUps[r.levelUps.length - 1].level}!`) : null),
          r.missionsDone.length ? h('div.card', { style: 'border-color:var(--yellow)' }, h('b', null, 'Mission complete!'), r.missionsDone.map((t) => h('p.small', null, `✓ ${t}`))) : null,
          h(
            'div.row',
            { style: 'flex-wrap:wrap;justify-content:center' },
            button({ icon: 'home', cls: 'icon ghost', aria: 'Home', onClick: actions.onHome, sfx: 'back' }),
            doubleBtn,
            button({ label: 'Again!', icon: 'restart', cls: 'mint lg pulse', onClick: actions.onAgain }),
          ),
        ),
      ),
    );
    this.backAction = actions.onHome;
  }

  private backAction: () => void = () => {};

  override back(): boolean {
    this.backAction();
    return true;
  }
}

export interface RacePlacement {
  id: string;
  name: string;
  skin: string;
  time: number | null;
  me: boolean;
  tag?: string;
}

export class RaceResultsScreen extends BaseScreen {
  constructor(
    title: string,
    placements: RacePlacement[],
    reward: { gems: number; trophies: number; xp: number } | null,
    actions: { onAgain?: () => void; onHome: () => void; againLabel?: string; homeLabel?: string },
  ) {
    super('.dim');
    const myPlace = placements.findIndex((p) => p.me) + 1;
    this.el.append(
      h(
        'div.results',
        null,
        h(
          'div.col',
          { style: 'align-items:center;gap:0.5rem;text-align:center' },
          h('span.stat-label', null, title),
          h('div.stat-big', { class: myPlace > 0 && myPlace <= 3 ? `medal-${myPlace}` : '' }, myPlace > 0 ? ordinal(myPlace) : 'Finish!'),
          myPlace === 1 ? h('span.new-best', null, 'WINNER!') : null,
          reward
            ? h(
                'div.row',
                { style: 'gap:1rem;font-weight:700;font-size:1.1rem' },
                h('span', { style: 'display:inline-flex;align-items:center;gap:0.3rem' }, ic('gem'), `+${reward.gems}`),
                h('span', { style: 'display:inline-flex;align-items:center;gap:0.3rem' }, ic('trophy'), `+${reward.trophies}`),
                h('span.muted', null, `+${reward.xp} XP`),
              )
            : null,
        ),
        h(
          'div.panel.col',
          { style: 'gap:0.7rem' },
          h(
            'div.podium',
            null,
            placements.map((p, i) =>
              h(
                `div.place${p.me ? '.me' : ''}`,
                null,
                h(`span.pos.medal-${i + 1}`, null, String(i + 1)),
                previewCanvas({ skin: p.skin, scale: 0.6 }),
                h('span.who', null, p.name, p.tag ? h('span.muted.small', null, ` · ${p.tag}`) : null),
                h('span.when', null, p.time === null ? 'DNF' : formatTime(p.time)),
              ),
            ),
          ),
          h(
            'div.row',
            { style: 'justify-content:center' },
            button({ label: actions.homeLabel ?? 'Home', icon: actions.homeLabel ? 'build' : 'home', cls: `${actions.homeLabel ? 'mint' : 'ghost'} lg`, onClick: actions.onHome, sfx: 'back' }),
            actions.onAgain ? button({ label: actions.againLabel ?? 'Race again', icon: 'restart', cls: 'mint lg pulse', onClick: actions.onAgain }) : null,
          ),
        ),
      ),
    );
    this.home = actions.onHome;
  }

  private home: () => void = () => {};

  override back(): boolean {
    this.home();
    return true;
  }
}

export interface LevelResult {
  title: string;
  completed: boolean;
  progress: number;
  best: number;
  newBest: boolean;
  gems: number;
  time: number;
  hits: number;
  /** The builder just beat their level from the start. */
  verifiedNow: boolean;
  missionsDone: string[];
}

/** End of a player-made level run (test runs from the editor too). */
export class LevelResultsScreen extends BaseScreen {
  constructor(r: LevelResult, actions: { onRetry: () => void; onBack: () => void; backLabel: string; backIcon: 'edit' | 'back' }) {
    super('.dim');
    const pct = Math.floor(r.progress * 100);
    this.el.append(
      h(
        'div.results',
        null,
        h(
          'div.col',
          { style: 'align-items:center;gap:0.4rem;text-align:center' },
          h('span.stat-label', null, r.title),
          h('div.stat-big', { class: r.completed ? 'medal-1' : '' }, r.completed ? 'COMPLETE!' : `${pct}%`),
          r.verifiedNow
            ? h('span.new-best', null, 'VERIFIED! READY TO SHARE')
            : r.newBest && !r.completed
              ? h('span.new-best', null, 'NEW BEST!')
              : h('span.muted', null, r.completed ? 'You reached the finish!' : `Best ${Math.floor(r.best * 100)}%`),
          previewCanvas({ skin: store.data.skins.equipped, animate: true, scale: 0.6 }, 'hero-preview'),
        ),
        h(
          'div.panel.col',
          { style: 'gap:0.7rem' },
          h(
            'div.result-stats',
            null,
            h('div.card', null, h('b', null, ic('gem'), fmt(r.gems)), h('span', null, 'Gems')),
            h('div.card', null, h('b', null, formatTime(r.time)), h('span', null, 'Time')),
            h('div.card', null, h('b', null, fmt(r.hits)), h('span', null, 'Bumps')),
          ),
          r.missionsDone.length ? h('div.card', { style: 'border-color:var(--yellow)' }, h('b', null, 'Mission complete!'), r.missionsDone.map((t) => h('p.small', null, `✓ ${t}`))) : null,
          h(
            'div.row',
            { style: 'flex-wrap:wrap;justify-content:center' },
            button({ label: actions.backLabel, icon: actions.backIcon, cls: 'ghost lg', onClick: actions.onBack, sfx: 'back' }),
            button({ label: 'Retry', icon: 'restart', cls: 'mint lg pulse', onClick: actions.onRetry }),
          ),
        ),
      ),
    );
    this.backAction = actions.onBack;
  }

  private backAction: () => void = () => {};

  override back(): boolean {
    this.backAction();
    return true;
  }
}
