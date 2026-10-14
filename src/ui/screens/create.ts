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
import { publicBuildsSection } from '../public-builds';

type Tab = 'mine' | 'featured' | 'together';

const MINI: Record<string, string> = {
  block: '#c9b8ff',
  platform: '#a58cff',
  spike: '#ff4f6d',
  saw: '#ff7a3d',
  gem: '#3ad7ff',
  pad: '#ffd23f',
  orb: '#ffe066',
  portal: '#3ee6b0',
  pickup: '#ff9ad5',
  pit: '#0b0520',
};

/** A tiny overview strip of a level for its card. */
function thumb(level: LevelContent): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 220;
  c.height = 56;
  const ctx = c.getContext('2d')!;
  const pal = BIOMES[level.theme % BIOMES.length];
  const g = ctx.createLinearGradient(0, 0, 0, 56);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(1, pal.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 220, 56);
  const cell = 220 / (level.length + 4);
  const row = 44 / 9;
  ctx.fillStyle = pal.ground;
  ctx.fillRect(0, 46, 220, 10);
  for (const p of level.pieces) {
    ctx.fillStyle = MINI[p.t];
    const x = (p.x + 2) * cell;
    if (p.t === 'pit') ctx.fillRect(x, 46, Math.max(1, cell), 10);
    else if (p.t === 'portal') ctx.fillRect(x, 4, Math.max(1.5, cell), 42);
    else ctx.fillRect(x, 46 - (p.y + 1) * row, Math.max(1.5, cell), row);
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect((level.length + 2) * cell - 1, 2, 2, 52);
  return c;
}

export function openEditor(level: LevelData): void {
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
export async function joinRoomByCode(code: string): Promise<boolean> {
  if (onlineBlocked()) return false;
  try {
    const room = await NetRoom.join(code, store.data.profile.name || 'Rusher', store.data.skins.equipped);
    if (room.kind === 'build') {
      setActiveEditor(EditorSession.join(room));
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
  }

  override back(): boolean {
    nav.go('menu');
    return true;
  }

  private render(): void {
    clear(this.tabsEl);
    const tabs: [Tab, string][] = [
      ['mine', 'My Levels'],
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
    this.body.append(grid);
    if (!list.length) {
      this.body.append(h('p.muted', { style: 'text-align:center;margin-top:0.8rem' }, 'Build your own level, test it, then share the code with friends. Need ideas? Remix a Featured level!'));
    }
  }

  private card(l: LevelContent & Partial<LevelData>, onClick: () => void, sub?: string): HTMLElement {
    const pct = l.best !== undefined && l.best > 0 ? `${Math.floor(l.best * 100)}%` : '';
    return h(
      'button.level-card',
      { onclick: onClick, style: `--a:${BIOMES[l.theme % BIOMES.length].accent}` },
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
    const m = ui.modal(
      [
        h('h2', null, levelName(l)),
        thumb(l),
        h('p.muted.small', null, l.authors.length ? `by ${l.authors.join(', ')}` : ''),
        h(
          'div.actions',
          null,
          button({ label: 'Play', icon: 'play', cls: 'mint lg', onClick: () => (m.close(), playLevel(l, true)) }),
          button({ label: mine ? 'Edit' : 'Remix', icon: 'edit', cls: 'yellow lg', onClick: () => (m.close(), this.edit(l)) }),
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
        h(
          'div.actions',
          null,
          button({ label: 'Build with friends', icon: 'users', cls: 'violet sm', onClick: () => (m.close(), void hostBuildRoom(l)) }),
          button({
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

  private edit(l: LevelData): void {
    if (l.origin !== 'mine') {
      // Remixing someone's level: it becomes yours (their names stay in the credits).
      levels.touch(l.id, (x) => {
        x.origin = 'mine';
        x.verified = false;
      });
    }
    openEditor(levels.get(l.id) ?? l);
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
    const mine = levels.list();
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
    const joinCol = h('div.panel.col', { style: 'gap:0.5rem;align-items:center' }, codeEntry((code) => void joinRoomByCode(code), 'Join with a room code'));
    const wrap = h('div.together');
    append(wrap, [hostCol, joinCol]);
    this.body.append(wrap);
    const pub = publicBuildsSection();
    if (pub) this.body.append(pub);
  }
}

function featuredData(f: FeaturedLevel): LevelData {
  return { ...contentOf(f), id: `featured${f.id}`, created: 0, updated: 0, verified: true, best: 0, plays: 0, origin: 'code' };
}
