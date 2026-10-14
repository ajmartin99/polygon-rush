import { audio } from '../../core/audio';
import { BIOMES } from '../../render/biomes';
import { Renderer } from '../../render/renderer';
import { buildWorld, encodeLevel, HEART_OPTIONS, levelName, MAX_LENGTH, MIN_LENGTH, randomLevelName, slotOf, SPEED_NAMES, START_ZONE, THEME_COUNT, type LevelContent, type Piece } from '../../game/level';
import { World } from '../../game/world';
import { EditorScene } from '../../editor/scene';
import { activeEditor, PLAYER_COLORS, setActiveEditor, type EditorSession } from '../../editor/session';
import { TOOLS, type Tool } from '../../editor/tools';
import { store } from '../../state/store';
import { BaseScreen, button, confirm, parentalGate, segmented } from '../components';
import { append, clear, h, ic } from '../dom';
import { nav } from '../nav';
import { ui } from '../ui';
import { ChatPanel } from '../chat-panel';
import { RoomFreeChat } from '../free-chat';
import { ensureRules } from '../community';
import { canUsePublicRooms } from '../../meta/community';
import { lobby, PublicListing } from '../../services/lobby';
import { ServerError } from '../../services/server';

/** Sessions whose room races are already hooked up to the game. */
const raceWired = new WeakSet<EditorSession>();
/** One Free Chat connection per build room session (survives test runs). */
const freeChats = new WeakMap<EditorSession, RoomFreeChat>();
/** Public listing of a hosted build room. */
const listings = new WeakMap<EditorSession, PublicListing>();

function freeChatFor(session: EditorSession): RoomFreeChat | null {
  if (!session.room) return null;
  let fc = freeChats.get(session);
  if (!fc) {
    const created = new RoomFreeChat(session.room, session.chat);
    freeChats.set(session, created);
    session.onEnd(() => created.close());
    fc = created;
  }
  return fc;
}

/** "Race!" in a build room: everyone plays the current level, then comes back here. */
function wireRaces(session: EditorSession): void {
  if (!session.room || raceWired.has(session)) return;
  raceWired.add(session);
  session.on('race', ({ seed, players, delay, level }) => {
    if (session.ended || !session.room) return;
    ui.closeAllModals();
    nav.play({ mode: 'online', room: session.room, seed, players, delay, level, exit: () => nav.go('editor') });
  });
}

/** Palette icons are drawn once per theme with the real game renderer. */
const iconCache = new Map<string, HTMLCanvasElement>();

function toolIcon(tool: Tool, theme: number): HTMLElement {
  if (tool.id === 'erase') return ic('eraser');
  if (tool.id === 'pan') return ic('hand');
  const key = `${tool.id}:${theme}`;
  let src = iconCache.get(key);
  if (!src) {
    src = document.createElement('canvas');
    src.width = src.height = 96;
    const r = new Renderer(src, { alpha: true });
    const pal = BIOMES[theme % BIOMES.length];
    const x = 10;
    const pieces: Piece[] = [];
    let cx = x + 0.5;
    let cy = 0.5;
    let span = 2;
    switch (tool.id) {
      case 'finish':
        break;
      case 'pit':
        pieces.push({ t: 'pit', x, y: 0, v: 0 });
        cy = -0.6;
        span = 3.4;
        break;
      case 'jumper':
      case 'glider':
      case 'roller':
      case 'hopper':
        pieces.push({ t: 'portal', x, y: 0, v: tool.v ?? 0 });
        cy = 4;
        span = 6.5;
        break;
      case 'saw':
        pieces.push({ t: 'saw', x, y: 0, v: 0 });
        span = 1.7;
        break;
      case 'spike':
        pieces.push({ t: 'spike', x, y: 0, v: 0 });
        cy = 0.45;
        span = 1.6;
        break;
      case 'pad':
        pieces.push({ t: 'pad', x, y: 0, v: 0 });
        cy = 0.25;
        span = 1.6;
        break;
      default:
        pieces.push({ t: tool.piece!, x, y: 0, v: 0 } as Piece);
        span = tool.id === 'platform' ? 1.6 : tool.id === 'gem' ? 1.05 : tool.id === 'pickup' ? 1.25 : tool.id === 'orb' ? 1.5 : 1.8;
    }
    const level: LevelContent = { name: [0, 0], authors: [], theme, speed: 1, hearts: 3, length: tool.id === 'finish' ? x : 60, pieces };
    const full = buildWorld(level);
    const world = new World();
    world.appendSorted(full.objs.filter((o) => (tool.id === 'pit' ? o.kind === 'solid' && o.role === 'ground' && o.x1 > x - 3 && o.x0 < x + 4 : tool.id === 'finish' ? o.kind === 'finish' : o.kind !== 'finish' && !(o.kind === 'solid' && o.role === 'ground'))));
    if (tool.id === 'finish') {
      cy = 4;
      span = 6.5;
    }
    r.drawIcon(world, cx, cy, span, pal);
    iconCache.set(key, src);
  }
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

/**
 * Create mode: build a level on a grid, test it, share it — alone or with
 * up to three friends in a build room.
 */
export class EditorScreen extends BaseScreen {
  private session: EditorSession;
  private scene: EditorScene;
  private top: HTMLElement;
  private palette: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private infoChip = h('div.chip.ed-info');
  private hintEl = h('div.ed-hint');
  private hintTimer = 0;
  private people = h('div.ed-people');
  private chat: ChatPanel | null = null;
  private resizeObs: ResizeObserver | null = null;
  private lockBtn: HTMLButtonElement | null = null;
  private publicBtn: HTMLButtonElement | null = null;
  private detachFree: (() => void) | null = null;

  constructor(params?: Record<string, unknown>) {
    super('.editor');
    const session = activeEditor();
    if (!session) throw new Error('No level is open');
    this.session = session;
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.scene = new EditorScene(session, canvas, {
      notice: (t) => this.hint(t, 2600),
      changed: () => this.refresh(),
    });
    void params;

    this.undoBtn = button({ icon: 'undo', cls: 'icon ghost', aria: 'Undo', onClick: () => (session.undo(), this.refresh()) });
    this.redoBtn = button({ icon: 'redo', cls: 'icon ghost', aria: 'Redo', onClick: () => (session.redo(), this.refresh()) });
    const room = session.room;
    const coopClient = room && !room.isHost;
    this.top = h(
      'div.ed-top',
      null,
      button({ icon: 'back', cls: 'icon ghost', aria: 'Back', sfx: 'back', onClick: () => this.back() }),
      button({ label: h('span.ed-name', null, levelName(session.doc.settings)), icon: 'gear', cls: 'ghost sm ed-title', onClick: () => this.openSettings() }),
      this.infoChip,
      h('div.spacer'),
      this.undoBtn,
      this.redoBtn,
      room?.isHost
        ? (this.lockBtn = button({ icon: 'lock', cls: 'icon ghost', aria: 'Pause building for others', onClick: () => this.toggleLock() }))
        : null,
      room?.isHost && canUsePublicRooms(store.data)
        ? (this.publicBtn = button({ icon: 'public', cls: 'icon ghost', aria: 'Make room public', onClick: () => void this.togglePublic() }))
        : null,
      room && !room.isHost && session.publicRoom ? button({ icon: 'report', cls: 'icon red', aria: 'Report this room', onClick: () => this.reportRoom() }) : null,
      button({ icon: 'flag', cls: 'icon cyan', aria: 'Test from here', onClick: () => this.test(true) }),
      button({ label: 'Test', icon: 'play', cls: 'mint', onClick: () => this.test(false) }),
      room?.isHost ? button({ label: 'Race!', icon: 'users', cls: 'yellow', onClick: () => this.race() }) : null,
      coopClient
        ? button({ icon: 'copy', cls: 'icon ghost', aria: 'Save a copy', onClick: () => this.saveCopy() })
        : button({ icon: 'share', cls: 'icon violet', aria: 'Share', onClick: () => this.share() }),
    );
    this.palette = h('div.ed-palette.scroll');
    this.buildPalette();
    this.el.append(this.top, this.palette, this.hintEl);
    if (room) {
      wireRaces(session);
      this.el.append(this.people);
      this.chat = new ChatPanel({ where: 'build', log: session.chat, onQuick: (n) => session.sendQuick(n) });
      this.el.append(this.chat.el);
      this.renderPeople();
      this.own(session.on('players', () => this.renderPeople()));
      this.own(session.on('lock', () => this.refresh()));
      this.own(session.on('closed', (reason) => this.roomClosed(reason)));
    }
    this.own(session.on('change', () => this.refresh()));
    this.refresh();
  }

  override enter(): void {
    this.scene.attach();
    nav.scene(this.scene);
    this.measure();
    this.resizeObs = new ResizeObserver(() => this.measure());
    this.resizeObs.observe(this.top);
    this.resizeObs.observe(this.palette);
    window.addEventListener('resize', this.measure);
    audio.intensity = 0.25;
    audio.playSong(this.session.doc.settings.theme % 6);
    const fc = freeChatFor(this.session);
    if (fc && this.chat) this.detachFree = fc.bind(this.chat);
    if (this.session.room && !this.session.room.open) this.roomClosed(this.session.closedReason);
    else if (!store.data.tutorial.editor_intro) {
      store.data.tutorial.editor_intro = true;
      store.commit();
      this.hint('Pick a piece, then tap or drag on the grid. Two fingers move around.', 5200);
    }
  }

  override leave(): void {
    super.leave();
    this.scene.detach();
    this.resizeObs?.disconnect();
    window.removeEventListener('resize', this.measure);
    this.chat?.destroy();
    this.detachFree?.();
    clearTimeout(this.hintTimer);
  }

  override back(): boolean {
    void this.exit();
    return true;
  }

  private measure = (): void => {
    const top = this.top.getBoundingClientRect();
    const pal = this.palette.getBoundingClientRect();
    this.scene.insets = { left: Math.ceil(pal.right), top: Math.ceil(top.bottom), right: 0, bottom: 0 };
  };

  private async exit(): Promise<void> {
    const s = this.session;
    if (s.room) {
      const msg = s.room.isHost ? 'Everyone in your build room will be sent home. Your level is saved in My Levels.' : 'You can keep a copy of the level before you go.';
      if (!(await confirm('Leave the build room?', msg, 'Leave', 'Stay'))) return;
    } else if (!s.save()) {
      ui.toast('Your device is full of levels! Delete one in My Levels.', 'info', 3500);
    }
    setActiveEditor(null);
    nav.scene(null);
    nav.go('create');
  }

  private buildPalette(): void {
    clear(this.palette);
    const theme = this.session.doc.settings.theme;
    for (const tool of TOOLS) {
      const b = h<HTMLButtonElement>(
        `button.ed-tool${this.session.tool === tool.id ? '.on' : ''}`,
        { 'aria-label': tool.label, title: tool.hint, 'data-tool': tool.id },
        toolIcon(tool, theme),
        h('span', null, tool.label),
      );
      b.addEventListener('click', () => {
        this.session.tool = tool.id;
        this.palette.querySelectorAll('.ed-tool').forEach((x) => x.classList.toggle('on', x === b));
        this.hint(tool.hint, 2600);
      });
      this.palette.appendChild(b);
    }
  }

  private refresh(): void {
    const s = this.session;
    const d = s.doc;
    this.undoBtn.disabled = !s.history.canUndo;
    this.redoBtn.disabled = !s.history.canRedo;
    const name = this.top.querySelector('.ed-name');
    if (name) name.textContent = levelName(d.settings);
    clear(this.infoChip);
    append(this.infoChip, [
      s.meta.verified ? h('span.ed-verified', { title: 'Beaten from the start — ready to share' }, ic('verified')) : null,
      h('span', null, `${d.count} pcs · ${d.settings.length}m`),
    ]);
    const flag = (b: HTMLButtonElement | null, on: boolean, cls: string) => {
      if (!b) return;
      b.classList.toggle(cls, on);
      b.classList.toggle('ghost', !on);
    };
    flag(this.lockBtn, Boolean(s.room?.locked), 'red');
    flag(this.publicBtn, listings.has(s), 'cyan');
    this.el.classList.toggle('locked', !s.canEdit);
  }

  private hint(text: string, ms: number): void {
    clearTimeout(this.hintTimer);
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('show'), ms);
  }

  // ------------------------------------------------------------ test & race
  private test(fromHere: boolean): void {
    const s = this.session;
    if (s.doc.count === 0) {
      this.hint('Add some pieces first! Try spikes, blocks and gems.', 2600);
      return;
    }
    s.save();
    const level = s.level();
    const startX = fromHere ? Math.max(START_ZONE - 2, Math.floor(s.camX + 3)) : undefined;
    nav.play({
      mode: 'custom',
      level,
      test: true,
      startX: startX !== undefined && startX > START_ZONE - 2 ? startX : undefined,
      exit: () => nav.go('editor'),
      onResult: (r) => s.recordRun(r.completed, r.fromStart, r.progress),
    });
  }

  private race(): void {
    const s = this.session;
    const room = s.room;
    if (!room?.isHost) return;
    if (room.players.length < 2) {
      this.hint('Invite a friend with the room code first!', 2600);
      return;
    }
    if (s.doc.count === 0) {
      this.hint('Build something to race on first!', 2400);
      return;
    }
    s.save();
    room.startRace(encodeLevel(s.doc.toContent()));
  }

  private toggleLock(): void {
    const room = this.session.room;
    if (!room?.isHost) return;
    room.setLock(!room.locked);
    this.hint(room.locked ? 'Only you can build right now.' : 'Everyone can build again.', 2200);
    this.refresh();
  }

  private async togglePublic(): Promise<void> {
    const s = this.session;
    const room = s.room;
    if (!room?.isHost) return;
    const existing = listings.get(s);
    if (existing) {
      existing.stop();
      listings.delete(s);
      s.publicRoom = false;
      this.hint('Your room is private again (friends with the code can still join).', 2600);
      this.refresh();
      return;
    }
    if (!(await ensureRules())) return;
    const listing = new PublicListing(room, () => ({ name: s.doc.settings.name, theme: s.doc.settings.theme }));
    try {
      await listing.start();
    } catch (e) {
      ui.toast(e instanceof ServerError ? e.message : 'Couldn’t make the room public.', 'wifi', 3200);
      return;
    }
    listings.set(s, listing);
    s.publicRoom = true;
    s.onEnd(() => listing.stop());
    this.hint('Your room is public: players 13+ can find and join it. You can remove anyone or pause building.', 4200);
    this.refresh();
  }

  private reportRoom(): void {
    const s = this.session;
    const room = s.room;
    if (!room) return;
    const m = ui.modal(
      [
        h('h2', null, 'Report this room'),
        h('p.muted', null, 'Tell our safety team what’s wrong. We’ll see the level as it looks right now.'),
        h(
          'div.col',
          { style: 'gap:0.4rem' },
          ['Rude drawing or words', 'Wrecking other people’s building', 'Someone made me feel unsafe', 'Something else'].map((reason) =>
            button({
              label: reason,
              cls: 'red',
              onClick: async () => {
                m.close();
                try {
                  await lobby.report(room.code, reason, encodeLevel(s.doc.toContent()));
                  ui.toast('Thanks for telling us. A grown-up on our team will check it.', 'report', 3500);
                } catch {
                  ui.toast('Report failed. Please try again later.', 'info');
                }
                if (await confirm('Leave this room?', 'You can leave any time with the back button.', 'Leave', 'Stay')) {
                  setActiveEditor(null);
                  nav.scene(null);
                  nav.go('create', { tab: 'together' });
                }
              },
            }),
          ),
        ),
      ],
      { showClose: true },
    );
  }

  // ------------------------------------------------------------ co-op chrome
  private renderPeople(): void {
    const room = this.session.room;
    clear(this.people);
    if (!room) return;
    append(this.people, [
      h('div.ed-code', { title: 'Room code' }, ic('users'), h('b', null, room.code)),
      room.players.map((p) =>
        h(
          'button.ed-person',
          {
            style: `--pc:${PLAYER_COLORS[p.color % PLAYER_COLORS.length]}`,
            onclick: () => this.personMenu(p.id),
          },
          h('i'),
          p.id === room.localId ? 'You' : p.name.replace(/ \d+$/, ''),
          p.host ? h('span.tag', null, 'HOST') : null,
        ),
      ),
    ]);
  }

  private personMenu(id: string): void {
    const room = this.session.room;
    const p = room?.player(id);
    if (!room || !p || id === room.localId) return;
    const m = ui.modal(
      [
        h('h2', null, p.name),
        h(
          'div.col',
          { style: 'gap:0.5rem' },
          button({
            label: 'Mute',
            icon: 'mute',
            cls: 'ghost lg',
            onClick: () => {
              this.session.chat.mute(id);
              m.close();
            },
          }),
          room.isHost
            ? button({
                label: 'Remove from room',
                icon: 'close',
                cls: 'red lg',
                onClick: () => {
                  room.kick(id);
                  m.close();
                  ui.toast(`${p.name} was removed.`, 'close');
                },
              })
            : null,
        ),
      ],
      { showClose: true },
    );
  }

  private roomClosed(reason: string): void {
    const s = this.session;
    if (!s.room || s.room.isHost) return;
    void confirm('The build room closed', `${reason} Keep a copy of this level in My Levels?`, 'Save copy', 'No thanks').then((yes) => {
      if (yes) this.saveCopy();
      setActiveEditor(null);
      nav.scene(null);
      nav.go('create');
    });
  }

  private saveCopy(): void {
    const copy = this.session.saveCopy();
    ui.toast(copy ? `Saved “${levelName(copy)}” to My Levels!` : 'Your device is full of levels! Delete one first.', copy ? 'check' : 'info', 2800);
  }

  // ------------------------------------------------------------ settings & share
  private openSettings(): void {
    const s = this.session;
    const d = s.doc;
    const canEdit = s.canEdit;
    const set = (patch: Parameters<typeof s.commit>[0][number]) => {
      s.commit([patch]);
      this.refresh();
    };
    const nameEl = h('b', null, levelName(d.settings));
    const lenEl = h('b', null, `${d.settings.length}m`);
    const changeLen = (delta: number) => {
      const length = Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, d.settings.length + delta));
      const lost = s.doc.pieces().filter((p) => p.x >= length).length;
      set({ set: { length } });
      if (lost) ui.toast(`Removed ${lost} piece${lost > 1 ? 's' : ''} past the finish (Undo brings them back).`, 'info', 3000);
      lenEl.textContent = `${d.settings.length}m`;
    };
    const themes = h(
      'div.ed-themes',
      null,
      BIOMES.slice(0, THEME_COUNT).map((pal, i) => {
        const b = h<HTMLButtonElement>(`button${d.settings.theme === i ? '.on' : ''}`, { style: `background:linear-gradient(180deg, ${pal.skyTop}, ${pal.skyBottom})`, title: pal.name, 'aria-label': pal.name });
        b.addEventListener('click', () => {
          if (!canEdit) return;
          set({ set: { theme: i } });
          themes.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          this.buildPalette();
          audio.playSong(i % 6);
        });
        return b;
      }),
    );
    ui.modal(
      [
        h('h2', null, 'Level settings'),
        h(
          'div.col.ed-settings.body-scroll',
          null,
          h(
            'div.setting',
            null,
            h('div.lbl', null, h('span', null, 'Name'), nameEl),
            button({
              icon: 'dice',
              cls: 'icon yellow',
              aria: 'New name',
              disabled: !canEdit,
              onClick: () => {
                set({ set: { name: randomLevelName() } });
                nameEl.textContent = levelName(d.settings);
              },
            }),
          ),
          h('div.setting', null, h('div.lbl', null, h('span', null, 'World'), h('b', null, 'Colours & music')), themes),
          h(
            'div.setting',
            null,
            h('div.lbl', null, h('span', null, 'Speed'), h('b', null, 'How fast you rush')),
            segmented(
              SPEED_NAMES.map((n, i) => ({ value: String(i), label: n })),
              String(d.settings.speed),
              (v) => canEdit && set({ set: { speed: Number(v) } }),
            ),
          ),
          h(
            'div.setting',
            null,
            h('div.lbl', null, h('span', null, 'Hearts'), h('b', null, 'Bumps allowed')),
            segmented(
              HEART_OPTIONS.map((n) => ({ value: String(n), label: `${n} ♥` })),
              String(d.settings.hearts),
              (v) => canEdit && set({ set: { hearts: Number(v) } }),
            ),
          ),
          h(
            'div.setting',
            null,
            h('div.lbl', null, h('span', null, 'Length'), lenEl),
            button({ label: '−', cls: 'icon ghost', aria: 'Shorter', disabled: !canEdit, onClick: () => changeLen(-20) }),
            button({ label: '+', cls: 'icon ghost', aria: 'Longer', disabled: !canEdit, onClick: () => changeLen(20) }),
          ),
          h('p.muted.small', null, d.authors.length ? `Built by ${d.authors.join(', ')}` : ''),
          canEdit
            ? button({
                label: 'Clear everything',
                icon: 'trash',
                cls: 'red sm',
                onClick: async () => {
                  if (!(await confirm('Clear the level?', 'Removes every piece. You can Undo it.', 'Clear', 'Keep', true))) return;
                  s.commit(s.doc.pieces().map((p) => ({ s: slotOf(p), p: null })));
                  this.refresh();
                },
              })
            : null,
        ),
      ],
      { wide: true, showClose: true },
    );
  }

  private share(): void {
    const s = this.session;
    if (!s.meta.verified) {
      const m = ui.modal(
        [
          h('div.reward-burst', null, ic('verified')),
          h('h2', null, 'Beat it to share it!'),
          h('p.muted', null, 'Play your level from the start and reach the finish. That proves it can be beaten, then you can share it with anyone.'),
          h('div.actions', null, button({ label: 'Not yet', cls: 'ghost lg', onClick: () => m.close() }), button({ label: 'Test it!', icon: 'play', cls: 'mint lg', onClick: () => (m.close(), this.test(false)) })),
        ],
        {},
      );
      return;
    }
    s.save();
    openShareModal(s.doc.toContent());
  }
}

/** Show a level's share code with Copy (and the system share sheet for grown-ups). */
export function openShareModal(level: LevelContent): void {
  const code = encodeLevel(level);
  const codeEl = h<HTMLTextAreaElement>('textarea.level-code', { readonly: true, rows: '3', 'aria-label': 'Level code' });
  codeEl.value = code;
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      codeEl.select();
      ok = document.execCommand('copy');
    }
    ui.toast(ok ? 'Level code copied!' : 'Select the code and copy it.', ok ? 'check' : 'info');
  };
  const canShare = typeof navigator.share === 'function';
  const m = ui.modal(
    [
      h('h2', null, levelName(level)),
      h('p.muted', null, 'Send this code to a friend. They tap Create → Enter Code to play it.'),
      codeEl,
      h(
        'div.actions',
        null,
        button({ label: 'Copy', icon: 'copy', cls: 'mint lg', onClick: () => void copy() }),
        canShare
          ? button({
              label: 'Share…',
              icon: 'share',
              cls: 'cyan lg',
              onClick: async () => {
                if (!(await parentalGate('Sharing opens other apps.'))) return;
                try {
                  await navigator.share({ title: `Polygon Rush level: ${levelName(level)}`, text: `Play my Polygon Rush level “${levelName(level)}”! In the game tap Create → Enter Code:\n${code}` });
                } catch {
                  /* cancelled */
                }
              },
            })
          : null,
      ),
      h('p.muted.small', null, `${level.pieces.length} pieces · ${level.length}m · ${SPEED_NAMES[level.speed]}`),
    ],
    { showClose: true, wide: true },
  );
  void m;
}
