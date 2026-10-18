import { contentOf, levelName, newLevelId, SPEED_NAMES, type LevelData } from '../game/level';
import { canUseSharedLevels, serverAvailable } from '../meta/community';
import { BIOMES } from '../render/biomes';
import { ServerError } from '../services/server';
import { sharedLevelData, sharedLevels, type ReportReason, type SharedLevel, type SharedScope, type SharedTab } from '../services/shared-levels';
import { levels } from '../state/levels';
import { store } from '../state/store';
import { button, confirm } from './components';
import { clear, fmt, h, ic } from './dom';
import { thumb } from './level-thumb';
import { nav } from './nav';
import { ui } from './ui';

/**
 * Create → Community: levels other players shared. Top Levels (everyone or
 * friends), Suggested (ones you haven't played) and Newest, plus your own
 * shared levels. Tap a level to play, like, save a copy or report it.
 */
const view: { tab: SharedTab; scope: SharedScope } = { tab: 'top', scope: 'all' };

const REPORTS: [ReportReason, string][] = [
  ['mean_name', 'Mean or rude name'],
  ['impossible', 'Impossible to beat'],
  ['copied', 'Copied someone else’s level'],
  ['other', 'Something else'],
];

const errText = (e: unknown, fallback: string) => (e instanceof ServerError && e.status ? e.message : fallback);

/** The Community tab body. */
export function communitySection(): HTMLElement {
  const root = h('div.col.community', { style: 'gap:0.6rem' });
  const d = store.data;
  if (!serverAvailable()) {
    root.append(h('p.muted', { style: 'text-align:center;padding:2rem' }, 'Community levels need the Polygon Rush game server, which isn’t switched on in this version yet.'));
    return root;
  }
  if (!canUseSharedLevels(d)) {
    root.append(h('div.center.col', { style: 'gap:0.6rem;text-align:center;padding:2rem' }, ic('lock'), h('p', null, 'Community levels are turned off in Parental Controls.')));
    return root;
  }
  const tabs = h('div.chips-row.community-tabs');
  const scopes = h('div.chips-row.community-scopes');
  const grid = h('div.level-grid');
  const foot = h('div.row', { style: 'justify-content:center' });
  root.append(tabs, scopes, grid, foot);
  let offset = 0;
  let seq = 0;

  const chip = (label: string, on: boolean, onClick: () => void, icon?: Parameters<typeof ic>[0]) =>
    h(`button.pick${on ? '.on' : ''}`, { onclick: onClick, 'aria-pressed': String(on) }, icon ? ic(icon) : null, label);

  const renderChips = () => {
    clear(tabs);
    clear(scopes);
    const tabList: [SharedTab, string, Parameters<typeof ic>[0]][] = [
      ['top', 'Top Levels', 'trophy'],
      ['suggested', 'Suggested', 'sparkle'],
      ['new', 'Newest', 'star'],
    ];
    for (const [id, label, icon] of tabList)
      tabs.append(
        chip(
          label,
          view.tab === id && view.scope !== 'mine',
          () => {
            view.tab = id;
            if (view.scope === 'mine' || id !== 'top') view.scope = 'all';
            void load(true);
          },
          icon,
        ),
      );
    tabs.append(
      chip(
        'My Shared',
        view.scope === 'mine',
        () => {
          view.scope = 'mine';
          void load(true);
        },
        'public',
      ),
    );
    if (view.tab === 'top' && view.scope !== 'mine') {
      scopes.append(
        chip('All', view.scope === 'all', () => ((view.scope = 'all'), void load(true)), 'globe'),
        chip('Friends', view.scope === 'friends', () => ((view.scope = 'friends'), void load(true)), 'users'),
      );
    }
  };

  const load = async (reset: boolean) => {
    const my = ++seq;
    if (reset) {
      offset = 0;
      clear(grid);
      renderChips();
      grid.append(h('p.muted', null, 'Loading levels…'));
    }
    clear(foot);
    try {
      const res = await sharedLevels.browse(view.tab, view.scope, offset);
      if (my !== seq) return;
      if (reset) clear(grid);
      offset += res.levels.length;
      for (const l of res.levels) grid.append(card(l, () => void load(true)));
      if (!grid.childElementCount) grid.append(h('p.muted', { style: 'grid-column:1/-1;text-align:center' }, emptyText()));
      if (res.more) foot.append(button({ label: 'Show more', icon: 'next', cls: 'ghost', onClick: () => void load(false) }));
      else if (view.tab === 'suggested' && res.levels.length) foot.append(button({ label: 'More suggestions', icon: 'dice', cls: 'ghost', onClick: () => void load(true) }));
    } catch (e) {
      if (my !== seq) return;
      clear(grid);
      grid.append(h('p.muted', { style: 'grid-column:1/-1;text-align:center' }, errText(e, 'Can’t reach the game server. Check your connection.')));
      foot.append(button({ label: 'Try again', icon: 'restore', cls: 'ghost', onClick: () => void load(true) }));
    }
  };
  void load(true);
  return root;
}

function emptyText(): string {
  if (view.scope === 'mine') return 'You haven’t shared a level yet. Build one, beat it, then tap it in My Levels → Share to Community.';
  if (view.scope === 'friends') return 'Your friends haven’t shared any levels yet.';
  if (view.tab === 'suggested') return 'You’ve played everything! Check Newest for fresh levels.';
  return 'No levels yet. Be the first to share one!';
}

function card(l: SharedLevel, reload: () => void): HTMLElement {
  const c = l.content;
  const pct = l.plays ? Math.round((l.clears / l.plays) * 100) : null;
  return h(
    'button.level-card.shared-card',
    { onclick: () => openLevel(l, reload), style: `--a:${BIOMES[c.theme % BIOMES.length].accent}` },
    thumb(c),
    h('b', null, levelName(c), l.friend ? h('span.tag.friend', null, 'Friend') : null, l.played ? h('span.ed-verified', { title: 'You played this' }, ic('check')) : null),
    h('span.muted.small', null, l.mine ? 'by you' : `by ${l.author}`),
    h(
      'span.small.level-meta',
      null,
      h('span', { title: 'Likes' }, ic('heart'), ` ${fmt(l.likes)}`),
      h('span', { title: 'Players' }, ic('play'), ` ${fmt(l.plays)}`),
      pct !== null ? h('span', { title: 'Players who beat it' }, `${pct}% beat it`) : null,
    ),
  );
}

/** Play a community level; plays and clears go back to the server. */
function playShared(l: SharedLevel): void {
  const level = sharedLevelData(l);
  nav.play({
    mode: 'custom',
    level,
    exit: () => nav.go('create', { tab: 'community' }),
    onResult: (r) => {
      if (!r.fromStart || l.mine) return;
      void sharedLevels.play(l.id, r.completed).catch(() => undefined);
      l.played = true;
      const c = store.data.creator;
      if (r.completed && !c.clearedIds.includes(l.id)) {
        store.data.creator = { ...c, clearedIds: [...c.clearedIds, l.id].slice(-500) };
        store.data.stats.communityClears += 1;
        store.commit();
      }
    },
  });
}

function openLevel(l: SharedLevel, reload: () => void): void {
  const c = l.content;
  const like = button({
    label: `${l.liked ? 'Liked' : 'Like'} · ${fmt(l.likes)}`,
    icon: 'heart',
    cls: l.liked ? 'pink lg' : 'ghost lg',
    onClick: async () => {
      if (!l.played) return void ui.toast('Play it first, then tell everyone you liked it!', 'heart');
      like.disabled = true;
      try {
        const r = await sharedLevels.like(l.id, !l.liked);
        l.liked = r.liked;
        l.likes = r.likes;
        m.close();
        openLevel(l, reload);
      } catch (e) {
        like.disabled = false;
        ui.toast(errText(e, 'Couldn’t reach the game server.'), 'info');
      }
    },
  });
  const m = ui.modal(
    [
      h('h2', null, levelName(c)),
      thumb(c),
      h('p.muted.small', null, l.mine ? 'Your level' : `by ${l.author}${l.friend ? ' (your friend)' : ''}`, ` · ${c.length}m · ${SPEED_NAMES[c.speed]} · ${c.hearts}♥`),
      h('p.small', null, `${fmt(l.plays)} players · ${fmt(l.clears)} beat it · ${fmt(l.likes)} likes`),
      h('div.actions', null, button({ label: 'Play', icon: 'play', cls: 'mint lg', onClick: () => (m.close(), playShared(l)) }), l.mine ? null : like),
      h(
        'div.actions',
        null,
        button({
          label: 'Save a copy',
          icon: 'copy',
          cls: 'ghost sm',
          onClick: () => {
            const now = Date.now();
            const copy: LevelData = { ...contentOf(c), id: newLevelId(), created: now, updated: now, verified: false, best: 0, plays: 0, origin: 'code' };
            if (!levels.put(copy)) return void ui.toast('Your device is full of levels! Delete one first.', 'info');
            ui.toast('Saved to My Levels. Remix it from there!', 'check');
          },
        }),
        l.mine
          ? button({
              label: 'Unshare',
              icon: 'trash',
              cls: 'red sm',
              onClick: async () => {
                if (!(await confirm('Unshare this level?', `“${levelName(c)}” leaves Community with its likes and plays. It stays in My Levels.`, 'Unshare', 'Keep', true))) return;
                try {
                  await sharedLevels.unpublish(l.id);
                  m.close();
                  ui.toast('Level unshared.', 'check');
                  reload();
                } catch (e) {
                  ui.toast(errText(e, 'Couldn’t reach the game server.'), 'info');
                }
              },
            })
          : button({ label: 'Report', icon: 'report', cls: 'ghost sm', onClick: () => (m.close(), openReport(l, reload)) }),
      ),
    ],
    { showClose: true },
  );
}

function openReport(l: SharedLevel, reload: () => void): void {
  const m = ui.modal(
    [
      h('h2', null, 'Report this level'),
      h('p.muted', null, 'What’s wrong with it? Our safety team takes a look, and levels with several reports are hidden right away.'),
      h(
        'div.col',
        { style: 'gap:0.4rem;align-items:stretch' },
        REPORTS.map(([reason, label]) =>
          button({
            label,
            cls: 'ghost',
            onClick: async () => {
              m.close();
              try {
                await sharedLevels.report(l.id, reason);
                ui.toast('Thanks! We’ll take a look.', 'check');
                reload();
              } catch (e) {
                ui.toast(errText(e, 'Couldn’t reach the game server.'), 'info');
              }
            },
          }),
        ),
      ),
    ],
    { showClose: true },
  );
}

/** Share (or update) one of your levels in Community. */
export async function shareToCommunity(level: LevelData): Promise<void> {
  const d = store.data;
  if (!canUseSharedLevels(d)) return void ui.toast(serverAvailable() ? 'Community levels are turned off in Parental Controls.' : 'Community levels aren’t available yet.', 'lock', 3200);
  if (!level.verified) return void ui.toast('Beat your level from the start first, then you can share it!', 'verified', 3200);
  const again = d.creator.sharedIds.includes(level.id);
  const ok = await confirm(
    again ? 'Update in Community?' : 'Share to Community?',
    again
      ? `Everyone will play your newest version of “${levelName(level)}”. Its likes and plays stay.`
      : `Anyone can play “${levelName(level)}”. It shows your racer name (no #number), and you can unshare it any time.`,
    again ? 'Update' : 'Share',
    'Not now',
  );
  if (!ok) return;
  try {
    const r = await sharedLevels.publish(level);
    ui.toast(r.updated ? 'Updated in Community!' : 'Shared! Find it in Create → Community → My Shared.', 'public', 3200);
  } catch (e) {
    ui.toast(errText(e, 'Couldn’t reach the game server.'), 'info', 3500);
  }
}
