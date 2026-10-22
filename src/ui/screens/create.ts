import { contentOf, createLevel, decodeLevel, levelName, LevelCodeError, newLevelId, SPEED_NAMES, type LevelContent, type LevelData } from '../../game/level';
import { EditorSession, setActiveEditor } from '../../editor/session';
import { FEATURED, type FeaturedLevel } from '../../meta/featured';
import { levels, MAX_LEVELS } from '../../state/levels';
import { store } from '../../state/store';
import { BIOMES } from '../../render/biomes';
import { NetRoom } from '../../services/net';
import { encodeLevel } from '../../game/level';
import { BaseScreen, button, confirm, titleBar } from '../components';
import { append, clear, h, ic } from '../dom';
import { nav } from '../nav';
import { ui } from '../ui';
import { codeEntry } from '../code-entry';
import { openShareModal } from './editor';
import { publicBuildsSection, setPublicJoinHandler } from '../public-builds';
import { thumb } from '../level-thumb';
import { removeBan } from '../../services/room-bans';
import { communitySection, shareToCommunity } from '../community-levels';
import { canUseSharedLevels } from '../../meta/community';
import { IS_PORTAL } from '../../core/portal';
import { madeOnTag, openWebLink, testOnPhone } from '../web-editor';
import { cloud } from '../../services/cloud';

type Tab = 'mine' | 'community' | 'featured' | 'together';

/** Only a level's builders edit it: yours, or one you built together. Levels from codes and Community are play-only. */
export function canEditLevel(level: Pick<LevelData, 'origin'>): boolean {
  return level.origin !== 'code';
}

export function openEditor(level: LevelData): void {
  if (!canEditLevel(level)) return void ui.toast('Only the people who built this level can change it.', 'lock', 3000);
  setActiveEditor(EditorSession.solo(level));
  nav.go('editor');
}

/** Play someone's level (or your own) from the level list. */
export function playLevel(level: LevelData, stored: boolean): void {
  nav.play({
    mode: 'custom',
    level,
    exit: () => nav.go('create', { tab: level.origin === 'mine' || stored ? 'mine' : 'featured' }),
    onResult: (r) => {
      if (!stored) return;
      levels.touch(level.id, (l) => {
        l.plays += 1;
        if (r.fromStart) l.best = Math.max(l.best, r.progress);
        if (r.completed && r.fromStart && l.origin === 'mine') l.verified = true;
      });
    },
  });
}

function onlineBlocked(): boolean {
  if (!store.settings.onlineAllowed) {
    ui.toast('Online play is turned off in Parental Controls.', 'lock');
    return true;
  }
  return false;
}

/** Host a build room around a level (new or one of yours). */
export async function hostBuildRoom(level: LevelData): Promise<boolean> {
  if (onlineBlocked()) return false;
  if (!canEditLevel(level)) return void ui.toast('Only the people who built this level can change it.', 'lock', 3000), false;
  try {
    const room = await NetRoom.host(store.data.profile.name || 'Rusher', store.data.skins.equipped, { kind: 'build' });
    const session = EditorSession.host(level, room);
    room.setSnapshot(() => ({ code: encodeLevel(session.doc.toContent()), rev: 0, authors: [...session.doc.authors] }));
    setActiveEditor(session);
    nav.go('editor');
    return true;
  } catch (e) {
    ui.toast((e as Error).message, 'wifi', 3500);
    return false;
  }
}

/** Join any room by code: build rooms open the editor, race rooms the friends lobby. */
export async function joinRoomByCode(code: string, fromPublic = false): Promise<boolean> {
  if (onlineBlocked()) return false;
  try {
    const room = await NetRoom.join(code, store.data.profile.name || 'Rusher', store.data.skins.equipped);
    if (room.kind === 'build') {
      const session = EditorSession.join(room);
      session.publicRoom = fromPublic;
      setActiveEditor(session);
      nav.go('editor');
    } else {
      nav.go('friends', { room });
    }
    return true;
  } catch (e) {
    ui.toast((e as Error).message, 'wifi', 3500);
    return false;
  }
}

setPublicJoinHandler((code) => joinRoomByCode(code, true));

/** Create hub: your levels, featured levels and building together. */
export class CreateScreen extends BaseScreen {
  private tab: Tab;
  private body = h('div.grow.scroll.create-body');
  private tabsEl = h('div.tabs');

  constructor(params?: Record<string, unknown>) {
    super('.solid');
    this.tab = (params?.tab as Tab) ?? 'mine';
    this.el.append(
      titleBar('Create', 'build', () => this.back(), button({ label: 'Enter Code', icon: 'copy', cls: 'cyan sm', onClick: () => this.importCode() })),
      h('div.row', { style: 'justify-content:center;margin:0.5rem 0' }, this.tabsEl),
      this.body,
    );
    this.render();
    this.own(levels.on('change', () => this.tab === 'mine' && this.render()));
    if (IS_PORTAL) {
      this.own(cloud.on('signedOut', (why) => (why && ui.toast(why, 'lock', 4000), nav.go('portal'))));
      void cloud.sync();
    }
  }

  override back(): boolean {
    nav.go(IS_PORTAL ? 'portal' : 'menu');
    return true;
  }

  private render(): void {
    clear(this.tabsEl);
    // The web editor builds and tests; sharing and building together stay in the app.
    const tabs: [Tab, string][] = IS_PORTAL
      ? [
          ['mine', 'My Levels'],
          ['featured', 'Featured'],
        ]
      : [
          ['mine', 'My Levels'],
          ['community', 'Community'],
          ['featured', 'Featured'],
          ['together', 'Build Together'],
        ];
    for (const [id, label] of tabs) {
      const b = h(`button.tab${this.tab === id ? '.active' : ''}`, null, label);
      b.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      this.tabsEl.appendChild(b);
    }
    clear(this.body);
    if (this.tab === 'mine') this.renderMine();
    else if (this.tab === 'community') this.body.append(communitySection());
    else if (this.tab === 'featured') this.renderFeatured();
    else this.renderTogether();
  }

  // ------------------------------------------------------------ my levels
  private renderMine(): void {
    const list = levels.list();
    const grid = h('div.level-grid');
    grid.appendChild(
      h(
        'button.level-card.new',
        { onclick: () => this.newLevel() },
        h('span.plus', null, '+'),
        h('b', null, 'New Level'),
        h('span.muted.small', null, `${list.length}/${MAX_LEVELS} saved`),
      ),
    );
    for (const l of list) grid.appendChild(this.card(l, () => this.levelMenu(l)));
    if (!IS_PORTAL) this.body.append(this.webBanner());
    this.body.append(grid);
    if (!list.length) {
      this.body.append(h('p.muted', { style: 'text-align:center;margin-top:0.8rem' }, 'Build your own level, test it, then share the code with friends. Need ideas? Remix a Featured level!'));
    }
  }

  /** Builder Pack: build on a computer too. */
  private webBanner(): HTMLElement {
    const linked = store.data.web.linked && store.data.purchases.builder;
    return h(
      'button.web-banner',
      { onclick: () => void openWebLink() },
      ic('build'),
      h('span', null, h('b', null, 'Web Editor'), h('span.muted.small', null, linked ? ' · Linked: levels sync with your computer' : ' · Build on a computer with a big screen')),
      h('span.web-go', null, linked ? 'Manage' : 'Open'),
    );
  }

  private card(l: LevelContent & Partial<LevelData>, onClick: () => void, sub?: string): HTMLElement {
    const pct = l.best !== undefined && l.best > 0 ? `${Math.floor(l.best * 100)}%` : '';
    return h(
      'button.level-card',
      { onclick: onClick, style: `--a:${BIOMES[l.theme % BIOMES.length].accent}` },
      l.origin ? madeOnTag(l as LevelData) : null,
      thumb(l),
      h('b', null, levelName(l), l.verified ? h('span.ed-verified', { title: 'Beaten by its builder' }, ic('verified')) : null),
      h('span.muted.small', null, sub ?? (l.authors.length ? `by ${l.authors.join(', ')}` : 'by you')),
      h('span.small.level-meta', null, `${l.length}m · ${SPEED_NAMES[l.speed]} · ${l.hearts}♥`, pct ? h('span.best', null, ` · best ${pct}`) : null),
    );
  }

  private newLevel(): void {
    if (levels.full) {
      ui.toast(`You have ${MAX_LEVELS} levels! Delete one to make room.`, 'info', 3200);
      return;
    }
    const level = createLevel(store.data.profile.name);
    levels.put(level);
    openEditor(level);
  }

  private levelMenu(l: LevelData): void {
    const mine = l.origin === 'mine';
    const editable = canEditLevel(l);
    const m = ui.modal(
      [
        h('h2', null, levelName(l)),
        thumb(l),
        h('p.muted.small', null, l.authors.length ? `by ${l.authors.join(', ')}` : ''),
        h(
          'div.actions',
          null,
          button({ label: 'Play', icon: 'play', cls: 'mint lg', onClick: () => (m.close(), playLevel(l, true)) }),
          editable ? button({ label: 'Edit', icon: 'edit', cls: 'yellow lg', onClick: () => (m.close(), openEditor(l)) }) : null,
          button({
            label: 'Share',
            icon: 'share',
            cls: 'cyan lg',
            onClick: () => {
              m.close();
              if (mine && !l.verified) {
                ui.toast('Beat your level from the start first, then you can share it!', 'verified', 3200);
                return;
              }
              openShareModal(l);
            },
          }),
        ),
        IS_PORTAL
          ? h('div.actions', null, button({ label: 'Test on phone', icon: 'play', cls: 'cyan', onClick: () => (m.close(), void testOnPhone(l)) }))
          : null,
        mine && !IS_PORTAL && canUseSharedLevels(store.data)
          ? h(
              'div.actions',
              null,
              button({
                label: store.data.creator.sharedIds.includes(l.id) ? 'Update in Community' : 'Share to Community',
                icon: 'public',
                cls: 'orange',
                onClick: () => (m.close(), void shareToCommunity(l)),
              }),
            )
          : null,
        editable ? null : h('p.muted.small', null, 'From another player: you can play and share it, but only its builders can change it.'),
        h(
          'div.actions',
          null,
          editable && !IS_PORTAL ? button({ label: 'Build with friends', icon: 'users', cls: 'violet sm', onClick: () => (m.close(), void hostBuildRoom(l)) }) : null,
          !editable ? null : button({
            label: 'Copy',
            icon: 'copy',
            cls: 'ghost sm',
            onClick: () => {
              m.close();
              const now = Date.now();
              const copy: LevelData = { ...l, ...contentOf(l), id: newLevelId(), created: now, updated: now, verified: false, best: 0, plays: 0, origin: 'mine' };
              if (!levels.put(copy)) ui.toast('Your device is full of levels!', 'info');
            },
          }),
          button({
            label: 'Delete',
            icon: 'trash',
            cls: 'red sm',
            onClick: async () => {
              m.close();
              if (await confirm('Delete this level?', `“${levelName(l)}” will be gone for good.`, 'Delete', 'Keep', true)) levels.remove(l.id);
            },
          }),
        ),
      ],
      { showClose: true },
    );
  }

  private importCode(): void {
    const input = h<HTMLTextAreaElement>('textarea.level-code', { rows: '3', placeholder: 'PR1-…', 'aria-label': 'Level code', autocomplete: 'off', spellcheck: 'false' });
    input.addEventListener('keydown', (e) => e.stopPropagation());
    const err = h('p.small', { style: 'color:var(--red);min-height:1.2em' });
    const m = ui.modal(
      [
        h('h2', null, 'Enter a level code'),
        h('p.muted', null, 'Paste a code a friend shared with you.'),
        input,
        err,
        h(
          'div.actions',
          null,
          button({
            label: 'Paste',
            icon: 'copy',
            cls: 'ghost lg',
            onClick: async () => {
              try {
                input.value = await navigator.clipboard.readText();
              } catch {
                ui.toast('Long-press the box to paste.', 'info');
              }
            },
          }),
          button({
            label: 'Add level',
            icon: 'check',
            cls: 'mint lg',
            onClick: () => {
              try {
                const content = decodeLevel(input.value);
                if (levels.full) throw new LevelCodeError(`You have ${MAX_LEVELS} levels! Delete one first.`);
                const now = Date.now();
                const level: LevelData = { ...content, id: newLevelId(), created: now, updated: now, verified: false, best: 0, plays: 0, origin: 'code' };
                levels.put(level);
                m.close();
                ui.toast(`Added “${levelName(level)}”!`, 'check');
                this.tab = 'mine';
                this.render();
              } catch (e) {
                err.textContent = e instanceof LevelCodeError ? e.message : 'That code didn’t work.';
              }
            },
          }),
        ),
      ],
      { showClose: true, wide: true },
    );
  }

  /** Players banned from rooms you host: unban any of them. */
  private openBans(): void {
    const list = h('div.col', { style: 'gap:0.4rem;align-items:stretch' });
    const render = () => {
      clear(list);
      const bans = store.data.roomBans;
      if (!bans.length) list.append(h('p.muted', null, 'Nobody is banned.'));
      for (const b of [...bans].reverse()) {
        list.append(
          h(
            'div.row',
            { style: 'justify-content:space-between;align-items:center;gap:0.5rem' },
            h('span', null, b.name, h('span.muted.small', null, ` · ${new Date(b.at).toLocaleDateString()}`)),
            button({ label: 'Unban', cls: 'ghost sm', onClick: () => (removeBan(b.rid), render()) }),
          ),
        );
      }
    };
    render();
    const m = ui.modal([h('h2', null, 'Banned players'), h('p.muted.small', null, 'They can’t join rooms you host, on any level.'), list], { showClose: true });
    void m.closed.then(() => this.tab === 'together' && this.render());
  }

  // ------------------------------------------------------------ featured
  private renderFeatured(): void {
    const grid = h('div.level-grid');
    for (const f of FEATURED) {
      grid.appendChild(
        this.card(f, () => {
          const m = ui.modal(
            [
              h('h2', null, levelName(f)),
              thumb(f),
              h('p.muted.small', null, f.blurb),
              h(
                'div.actions',
                null,
                button({ label: 'Play', icon: 'play', cls: 'mint lg', onClick: () => (m.close(), playLevel(featuredData(f), false)) }),
                button({
                  label: 'Remix',
                  icon: 'edit',
                  cls: 'yellow lg',
                  onClick: () => {
                    m.close();
                    if (levels.full) return void ui.toast('Your device is full of levels!', 'info');
                    const now = Date.now();
                    const copy: LevelData = { ...contentOf(f), id: newLevelId(), created: now, updated: now, verified: false, best: 0, plays: 0, origin: 'mine' };
                    levels.put(copy);
                    openEditor(copy);
                  },
                }),
              ),
            ],
            { showClose: true },
          );
        }, `Polygon Rush Team · ${f.difficulty}`),
      );
    }
    this.body.append(grid);
  }

  // ------------------------------------------------------------ together
  private renderTogether(): void {
    if (!store.settings.onlineAllowed) {
      this.body.append(h('div.center.col', { style: 'gap:0.6rem;text-align:center;padding:2rem' }, ic('lock'), h('p', null, 'Online building is turned off in Parental Controls.')));
      return;
    }
    const mine = levels.list().filter(canEditLevel);
    const hostCol = h(
      'div.panel.col',
      { style: 'gap:0.6rem;align-items:stretch' },
      h('h3', null, 'Host a build room'),
      h('p.muted.small', null, 'Up to 4 builders edit one level at the same time, then race it together. Share the room code out loud or by message.'),
      button({
        label: 'New level',
        icon: 'build',
        cls: 'yellow lg',
        onClick: () => {
          if (levels.full) return void ui.toast('Your device is full of levels!', 'info');
          const level = createLevel(store.data.profile.name);
          levels.put(level);
          void hostBuildRoom(level);
        },
      }),
      mine.length
        ? h(
            'div.col',
            { style: 'gap:0.3rem' },
            h('span.muted.small', null, 'Or bring one of yours:'),
            mine.slice(0, 6).map((l) => button({ label: levelName(l), icon: 'edit', cls: 'ghost sm', onClick: () => void hostBuildRoom(l) })),
          )
        : null,
    );
    const bans = store.data.roomBans;
    if (bans.length) {
      hostCol.append(
        button({
          label: `Banned players (${bans.length})`,
          icon: 'report',
          cls: 'ghost sm',
          onClick: () => this.openBans(),
        }),
      );
    }
    // With public rooms available the keypad moves into a pop-up to make room for the list.
    const pub = publicBuildsSection();
    const joinCol = pub
      ? h(
          'div.col',
          { style: 'gap:0.6rem;align-items:stretch' },
          button({
            label: 'Join with a room code',
            icon: 'users',
            cls: 'cyan lg',
            onClick: () => {
              const m = ui.modal(
                codeEntry((code) => {
                  m.close();
                  void joinRoomByCode(code);
                }, 'Join with a room code'),
                { showClose: true, wide: true },
              );
            },
          }),
          pub,
        )
      : h('div.panel.col', { style: 'gap:0.5rem;align-items:center' }, codeEntry((code) => void joinRoomByCode(code), 'Join with a room code'));
    const wrap = h('div.together');
    append(wrap, [hostCol, joinCol]);
    this.body.append(wrap);
  }
}

function featuredData(f: FeaturedLevel): LevelData {
  return { ...contentOf(f), id: `featured${f.id}`, created: 0, updated: 0, verified: true, best: 0, plays: 0, origin: 'code' };
}
