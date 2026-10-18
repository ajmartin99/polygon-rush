import { store } from '../../state/store';
import { SKINS } from '../../meta/catalog';
import { BaseScreen, button, titleBar } from '../components';
import { h } from '../dom';
import { nav } from '../nav';
import { previewCanvas, updatePreview } from '../preview';

/** Local 2-player split screen on one device. */
export class DuelScreen extends BaseScreen {
  constructor() {
    super('.solid');
    const p1Skin = store.data.skins.equipped;
    // Player 2 can borrow any skin this device owns, plus the free colours.
    const choices = SKINS.filter((s) => store.ownsSkin(s.id) || ['mint', 'bubblegum', 'sky', 'tangerine', 'grape'].includes(s.id)).map((s) => s.id);
    let idx = Math.max(0, choices.findIndex((id) => id !== p1Skin));
    const p2Preview = previewCanvas({ skin: choices[idx], animate: true, scale: 0.6, shape: 'square' });
    const p2Name = h('div.nm', null, SKINS.find((s) => s.id === choices[idx])!.name);
    const cycle = (dir: number) => {
      idx = (idx + dir + choices.length) % choices.length;
      updatePreview(p2Preview, { skin: choices[idx] });
      p2Name.textContent = SKINS.find((s) => s.id === choices[idx])!.name;
    };
    this.el.append(
      titleBar('2-Player Duel', 'duel', () => nav.go('menu')),
      h(
        'div.grow.col',
        { style: 'align-items:center;justify-content:safe center;gap:0.7rem;min-height:0' },
        h('p.muted', { style: 'text-align:center;max-width:34rem' }, 'Race a friend on the same device! First to the finish line wins. Just for fun: gems grabbed in a Duel are for bragging rights only.'),
        h(
          'div.row',
          { style: 'gap:1.2rem;align-items:stretch' },
          h(
            'div.panel.col',
            { style: 'align-items:center;width:13rem;gap:0.3rem' },
            h('b', { style: 'color:var(--yellow)' }, 'PLAYER 1'),
            previewCanvas({ skin: p1Skin, animate: true, scale: 0.6 }, 'hero-preview sm'),
            h('div.nm', null, store.data.profile.name || 'Player 1'),
            h('p.muted.small', { style: 'text-align:center' }, 'Tap the TOP half of the screen'),
          ),
          h('div.center', { style: 'font-size:2rem;font-weight:700' }, 'VS'),
          h(
            'div.panel.col',
            { style: 'align-items:center;width:13rem;gap:0.3rem' },
            h('b', { style: 'color:var(--pink)' }, 'PLAYER 2'),
            h(
              'div.row',
              null,
              button({ icon: 'back', cls: 'icon ghost sm', aria: 'Previous skin', onClick: () => cycle(-1) }),
              h('div', { style: 'width:7rem;height:5.4rem;display:flex' }, p2Preview),
              button({ icon: 'next', cls: 'icon ghost sm', aria: 'Next skin', onClick: () => cycle(1) }),
            ),
            p2Name,
            h('p.muted.small', { style: 'text-align:center' }, 'Tap the BOTTOM half of the screen'),
          ),
        ),
        button({
          label: 'Start Duel',
          icon: 'play',
          cls: 'pink lg pulse',
          onClick: () => nav.play({ mode: 'duel', seed: (Math.random() * 2 ** 31) >>> 0, p2Skin: choices[idx] }),
        }),
        h('p.kbd-hint', null, 'Keyboard: Player 1 = W / Space · Player 2 = ↑ / Enter'),
      ),
    );
    p2Preview.style.width = '100%';
    p2Preview.style.height = '100%';
  }
}
