import { store } from '../../state/store';
import { LEAGUES, RACE_REWARDS, leagueFor, nextLeague } from '../../meta/economy';
import { SKINS } from '../../meta/catalog';
import { CPU_NAMES } from '../../meta/names';
import { Rng } from '../../core/rng';
import { BaseScreen, button, gemChip, progressBar, titleBar } from '../components';
import { h, ic, fmt, ordinal } from '../dom';
import { nav, type Rival } from '../nav';
import { previewCanvas } from '../preview';

export const RACE_LENGTH = 900;

export class RaceLobbyScreen extends BaseScreen {
  constructor() {
    super('.solid');
    const d = store.data;
    const league = leagueFor(d.trophies);
    const next = nextLeague(d.trophies);
    const seed = (Math.random() * 2 ** 31) >>> 0;
    const rng = new Rng(seed);
    const names = [...CPU_NAMES];
    const rivals: Rival[] = [];
    for (let i = 0; i < 3; i++) {
      const name = names.splice(rng.int(0, names.length - 1), 1)[0];
      const skin = rng.pick(SKINS.filter((s) => s.id !== d.skins.equipped)).id;
      // Rivals vary a little around the league skill.
      const skill = Math.min(0.97, Math.max(0.3, league.botSkill + rng.range(-0.12, 0.08)));
      rivals.push({ name, skin, skill });
    }
    const leagueIndex = LEAGUES.indexOf(league);
    const progress = next ? (d.trophies - league.min) / (next.min - league.min) : 1;

    this.el.append(
      titleBar('Race', 'flag', () => nav.go('menu'), gemChip(this, false)),
      h(
        'div.grow',
        { style: 'display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.3fr);gap:1rem;margin-top:0.8rem;min-height:0;align-items:center' },
        h(
          'div.panel.col',
          { style: 'gap:0.7rem' },
          h('div.row', null, h('span.league', { style: `background:${league.color}` }, ic('trophy'), league.name), h('div.spacer'), h('span.trophy-line', null, ic('trophy'), fmt(d.trophies))),
          progressBar(progress, 'gold thick'),
          h('p.muted.small', null, next ? `${next.min - d.trophies} trophies to ${next.name}` : 'Top league reached — you are a legend!'),
          h('div.divider'),
          h('h3', null, 'Rewards'),
          h(
            'div.col',
            { style: 'gap:0.3rem' },
            RACE_REWARDS.map((r, i) =>
              h(
                'div.row',
                { style: 'font-size:0.85rem' },
                h(`b.medal-${i + 1}`, { style: 'width:2.6rem' }, ordinal(i + 1)),
                h('span', { style: 'display:inline-flex;align-items:center;gap:0.2rem;width:4rem' }, ic('gem'), String(r.gems)),
                h('span', { style: 'display:inline-flex;align-items:center;gap:0.2rem' }, ic('trophy'), `+${r.trophies}`),
              ),
            ),
          ),
          h('p.muted.small', null, `Rival level ${leagueIndex + 1}/${LEAGUES.length}. Trophies never go down!`),
        ),
        h(
          'div.col',
          { style: 'gap:0.9rem;align-items:stretch' },
          h('h3', { style: 'text-align:center' }, `${RACE_LENGTH}m dash vs 3 CPU rivals`),
          h(
            'div.players',
            null,
            h(
              'div.player-slot.filled',
              { style: 'border-color:var(--yellow)' },
              previewCanvas({ skin: d.skins.equipped, animate: true, scale: 0.62 }),
              h('div.nm', null, d.profile.name || 'You'),
              h('span.tag', null, 'YOU'),
            ),
            rivals.map((r) =>
              h('div.player-slot.filled', null, previewCanvas({ skin: r.skin, scale: 0.62 }), h('div.nm', null, r.name), h('span.tag.cpu', null, 'CPU')),
            ),
          ),
          h('p.muted.small', { style: 'text-align:center' }, 'Grab ? boxes for boosts, shields and snowballs. Bumps slow you down!'),
          h('div.center', null, button({ label: 'Start Race', icon: 'flag', cls: 'yellow xl pulse', onClick: () => nav.play({ mode: 'race', seed, rivals }) })),
        ),
      ),
    );
  }
}
