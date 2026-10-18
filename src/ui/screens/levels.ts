import { BIOMES } from '../../render/biomes';
import { DIFFICULTY_NAMES, endlessBestKey } from '../../state/save';
import { store } from '../../state/store';
import { LEVEL_LENGTH, MAX_START_LEVEL, levelStart, levelWorld, unlockedLevels } from '../../meta/modes';
import { BaseScreen, titleBar } from '../components';
import { SECRET_LEVELS } from '../../game/generator';
import { fmt, h, ic } from '../dom';
import { nav } from '../nav';
import { ui } from '../ui';

/**
 * Endless level select: every 500 m world you have reached on this
 * difficulty can be a starting point. Speed and obstacles match that point
 * of a run, and distance keeps counting from 0 m.
 */
export class LevelsScreen extends BaseScreen {
  constructor() {
    super('.solid');
    const d = store.data;
    const best = d.best[endlessBestKey(d.settings)] ?? 0;
    const unlocked = unlockedLevels(best);
    const found = new Set(d.secrets.found);
    // Show what's open plus a peek at the next few.
    const shown = Math.min(MAX_START_LEVEL, Math.max(6, unlocked + 3));
    const tiles: HTMLElement[] = [];
    for (let n = 1; n <= shown; n++) {
      const pal = BIOMES[levelWorld(n)];
      const open = n <= unlocked;
      const reached = best >= levelStart(n + 1);
      const egg = found.has(n);
      tiles.push(
        h(
          `button.level-tile${open ? '' : '.locked'}${n === unlocked ? '.current' : ''}`,
          {
            'data-level': String(n),
            style: `background:linear-gradient(160deg, ${pal.skyTop}, ${pal.skyBottom})`,
            'aria-label': open ? `Start at level ${n}` : `Level ${n} is locked`,
            onclick: () => {
              if (!open) return ui.toast(`Reach ${fmt(levelStart(n))} m in Endless to unlock Level ${n}.`, 'lock');
              nav.play({ mode: 'endless', level: n });
            },
          },
          h('b.lt-num', null, String(n)),
          h('span.lt-world', null, pal.name),
          h('span.lt-dist', null, `${fmt(levelStart(n))} m`),
          !open ? h('span.lt-lock', null, ic('lock')) : reached ? h('span.lt-done', null, ic('check')) : h('span.lt-tag', null, 'NEXT'),
          n <= SECRET_LEVELS ? h(`span.lt-egg${egg ? '.found' : ''}`, { title: egg ? 'Golden Shape found!' : 'A Golden Shape hides in this level' }, ic('egg')) : null,
        ),
      );
    }
    this.el.append(
      titleBar('Levels', 'flag', () => nav.go('modes')),
      h(
        'p.muted.small.levels-intro',
        null,
        `${d.settings.kidMode ? 'Kid Mode' : DIFFICULTY_NAMES[d.settings.difficulty]} · Best ${fmt(best)} m · Start from any level you have reached. Every ${LEVEL_LENGTH} m opens a new one.`,
      ),
      h(
        'p.small.levels-eggs',
        null,
        ic('egg'),
        ` Golden Shapes ${found.size}/${SECRET_LEVELS}`,
        h('span.muted', null, ' · One hides in every level, high above a jump ring. Find it in Endless on any difficulty.'),
      ),
      h('div.scroll.grow', { style: 'min-height:0' }, h('div.level-grid', null, tiles)),
    );
  }

  override back(): boolean {
    nav.go('modes');
    return true;
  }
}
