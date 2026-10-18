import { DIFFICULTY_NAMES } from '../../state/save';
import { store } from '../../state/store';
import { DAILY_REWARD, DAILY_TARGET, GEM_RUSH_SECONDS, MAX_START_LEVEL, dailyRewardKey, dailySeed, dailyTwist, unlockedLevels, variantBestKey, VARIANT_INFO, type EndlessVariant } from '../../meta/modes';
import { leagueFor } from '../../meta/economy';
import { activeEvent } from '../../meta/events';
import { attemptsLeft, HAUNTED_RULES } from '../../meta/haunted';
import { openHauntedRun } from '../haunted-run';
import { BaseScreen, titleBar } from '../components';
import { fmt, h, ic } from '../dom';
import type { IconName } from '../icons';
import { nav } from '../nav';
import { ui } from '../ui';

interface ModeCard {
  id: string;
  name: string;
  blurb: string;
  icon: IconName;
  color: string;
  tag?: string;
  stat?: string;
  go: () => void;
}

/** Every way to play, in one place (Home → Modes). */
export class ModesScreen extends BaseScreen {
  constructor() {
    super('.solid');
    const d = store.data;
    const best = (v: EndlessVariant) => d.best[variantBestKey(v, d.settings)] ?? 0;
    const endless = (v: EndlessVariant) => () => nav.play({ mode: 'endless', variant: v });
    const dailyDone = Boolean(d.best[dailyRewardKey()]);
    const unlocked = unlockedLevels(d.levels[variantBestKey('classic', d.settings)] ?? 1);
    const haunted = activeEvent()?.id === 'halloween';
    const hs = d.haunted;
    const left = haunted ? attemptsLeft(hs) : 0;
    const cards: ModeCard[] = [
      ...(haunted
        ? [
            {
              id: 'haunted',
              name: '🎃 Haunted Run',
              blurb: 'A Halloween course charted to Swing Along. Very hard. Finish the song for a big gem bonus.',
              icon: 'sparkle' as IconName,
              color: 'orange spooky',
              tag: left > 0 ? `${left} of ${HAUNTED_RULES.attempts} attempts` : hs.regens > 0 ? `${hs.regens} Heart Regen${hs.regens > 1 ? 's' : ''}` : 'Out of attempts',
              stat: hs.best.hard || hs.best.easy ? `Best ${Math.floor(Math.max(hs.best.hard, hs.best.easy) * 100)}%` : 'Halloween only',
              go: () => openHauntedRun(),
            },
          ]
        : []),
      {
        id: 'endless',
        name: VARIANT_INFO.classic.name,
        blurb: VARIANT_INFO.classic.blurb,
        icon: 'play',
        color: 'yellow',
        tag: d.settings.kidMode ? 'Kid Mode' : DIFFICULTY_NAMES[d.settings.difficulty],
        stat: best('classic') ? `Best ${fmt(best('classic'))} m` : undefined,
        go: endless('classic'),
      },
      {
        id: 'levels',
        name: 'Levels',
        blurb: 'Start from any Endless level you’ve reached.',
        icon: 'target',
        color: 'violet',
        tag: `${unlocked} of ${MAX_START_LEVEL} open`,
        stat: unlocked > 1 ? `Up to Level ${unlocked}` : 'Reach 500 m for Level 2',
        go: () => nav.go('levels'),
      },
      {
        id: 'daily',
        name: VARIANT_INFO.daily.name,
        blurb: `${VARIANT_INFO.daily.blurb} Today: ${dailyTwist(dailySeed(), false).labels.join(' · ')}.`,
        icon: 'gift',
        color: 'mint',
        tag: dailyDone ? 'Done today ✓' : `Reach ${DAILY_TARGET} m: +${DAILY_REWARD}`,
        stat: best('daily') ? `Today ${fmt(best('daily'))} m` : 'New course today',
        go: endless('daily'),
      },
      {
        id: 'oneheart',
        name: VARIANT_INFO.oneheart.name,
        blurb: VARIANT_INFO.oneheart.blurb,
        icon: 'heart',
        color: 'red',
        tag: DIFFICULTY_NAMES[d.settings.difficulty],
        stat: best('oneheart') ? `Best ${fmt(best('oneheart'))} m` : undefined,
        go: endless('oneheart'),
      },
      {
        id: 'gemrush',
        name: VARIANT_INFO.gemrush.name,
        blurb: VARIANT_INFO.gemrush.blurb,
        icon: 'gem',
        color: 'cyan',
        tag: `${GEM_RUSH_SECONDS} s`,
        stat: best('gemrush') ? `Best ${fmt(best('gemrush'))} gems` : undefined,
        go: endless('gemrush'),
      },
      {
        id: 'race',
        name: 'Race',
        blurb: 'Beat 3 CPU rivals and climb the leagues.',
        icon: 'flag',
        color: 'cyan',
        tag: leagueFor(d.trophies).name,
        go: () => nav.go('race'),
      },
      {
        id: 'online',
        name: 'Online',
        blurb: 'Quick Match or a private room with friends.',
        icon: 'globe',
        color: 'violet',
        tag: 'Up to 4',
        go: () => {
          if (!d.settings.onlineAllowed) return ui.toast('Online play is turned off in Parental Controls.', 'lock');
          nav.go('friends');
        },
      },
      {
        id: 'duel',
        name: 'Duel',
        blurb: 'Split screen on one device.',
        icon: 'duel',
        color: 'pink',
        tag: '2 players',
        go: () => nav.go('duel'),
      },
      {
        id: 'levels',
        name: 'Player Levels',
        blurb: 'Play featured levels, codes and your own builds.',
        icon: 'build',
        color: 'orange',
        tag: 'Create',
        go: () => nav.go('create'),
      },
    ];
    this.el.append(
      titleBar('Game Modes', 'shapes', () => nav.go('menu')),
      h(
        'div.scroll.grow',
        { style: 'margin-top:0.7rem;min-height:0' },
        h(
          'div.modes-grid',
          null,
          cards.map((c) =>
            h(
              `button.mode-card.${c.color.split(' ').join('.')}`,
              { 'data-mode': c.id, onclick: () => (ui.sfx('click'), c.go()) },
              h('span.mc-icon', null, ic(c.icon)),
              h('b.mc-name', null, c.name),
              h('span.mc-blurb', null, c.blurb),
              h('span.mc-foot', null, c.tag ? h('span.mc-tag', null, c.tag) : null, c.stat ? h('span.mc-stat', null, c.stat) : null),
            ),
          ),
        ),
      ),
    );
  }
}
