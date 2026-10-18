import { store } from '../../state/store';
import { NetRoom, type NetPlayer } from '../../services/net';
import { EditorSession, setActiveEditor } from '../../editor/session';
import { roomChatPanel } from '../room-chat';
import { emoteBar, showEmote } from '../emotes';
import { BIOMES } from '../../render/biomes';
import { decodeLevel, encodeLevel, levelName, type LevelContent } from '../../game/level';
import { FEATURED } from '../../meta/featured';
import { levels } from '../../state/levels';
import { codeEntry } from '../code-entry';
import { CONFIG } from '../../config';
import { BaseScreen, button, segmented, titleBar } from '../components';
import { append, h, clear } from '../dom';
import { nav } from '../nav';
import { previewCanvas } from '../preview';
import { openPlayerCard } from '../profile';
import { ui } from '../ui';
import { canUsePublicRooms, serverAvailable, ageOf } from '../../meta/community';
import { lobby, PublicListing } from '../../services/lobby';
import { ensureRules } from '../community';
import { ServerError } from '../../services/server';
import { friends as friendsSvc } from '../../services/friends';
import { openInvitePicker } from '../friend-invites';

type View = 'choose' | 'join' | 'busy' | 'lobby';

/** The level code the host picked for the next race (kept per room across screens). */
const trackCodes = new WeakMap<NetRoom, string>();

/** Seconds before a public room with 2+ racers starts on its own. */
const AUTO_START = 20;

/**
 * Online races: Quick Match (random public room, 13+), or a room of your own
 * that is private (share the 4-character code) or public (13+).
 */
export class FriendsScreen extends BaseScreen {
  private view: View = 'choose';
  private body = h('div.grow.col', { style: 'align-items:center;justify-content:center;gap:1rem;min-height:0' });
  private room: NetRoom | null = null;
  private handedOff = false;
  private chat: ReturnType<typeof roomChatPanel> | null = null;
  private roomOffs: (() => void)[] = [];
  private listing: PublicListing | null = null;
  private wantPublic = false;
  private autoAt = 0;
  private autoTimer = 0;
  private busyText = 'Connecting…';

  constructor(params?: Record<string, unknown>) {
    super('.solid');
    this.el.append(titleBar('Play Online', 'globe', () => this.back()), this.body);
    const room = params?.room as NetRoom | undefined;
    if (room && room.open) {
      this.wireRoom(room);
      // Back from a race in a public room: list it again for new racers.
      if (room.isHost && room.publicRoom) void this.setPublic(true);
    } else this.render();
  }

  override leave(): void {
    super.leave();
    this.stopListing();
    clearInterval(this.autoTimer);
    for (const off of this.roomOffs.splice(0)) off();
    this.chat?.close();
    if (this.room && !this.handedOff) this.room.leave();
  }

  override back(): boolean {
    if (this.view === 'join') {
      this.view = 'choose';
      this.render();
      return true;
    }
    if (this.room && !this.handedOff) {
      this.room.leave();
      this.room = null;
    }
    this.stopListing();
    nav.go('menu');
    return true;
  }

  private render(): void {
    clear(this.body);
    this.body.style.gap = this.view === 'lobby' ? '0.6rem' : '1rem';
    switch (this.view) {
      case 'choose':
        return this.renderChoose();
      case 'join':
        return this.renderJoin();
      case 'busy':
        return this.renderBusy(this.busyText);
      case 'lobby':
        return this.renderLobby();
    }
  }

  private renderChoose(): void {
    const d = store.data;
    const publicOk = canUsePublicRooms(d);
    const teen = serverAvailable() && ageOf(d.profile.birthYear) >= 13;
    if (!publicOk) this.wantPublic = false;
    append(this.body, [
      h('p', { style: 'text-align:center;max-width:34rem' }, publicOk ? 'Race up to 3 others online. Jump into a random race, or make a room for friends.' : 'Race up to 3 friends online. Make a room and share the code out loud.'),
      h(
        'div.row',
        { style: 'gap:1rem;flex-wrap:wrap;justify-content:center' },
        publicOk ? button({ label: 'Quick Match', icon: 'bolt', cls: 'orange xl', sub: 'Race random players', onClick: () => void this.quickMatch() }) : null,
        button({ label: 'Create Room', icon: 'users', cls: 'yellow xl', sub: this.wantPublic ? 'Public · 13+' : 'Private · code only', onClick: () => void this.create() }),
        button({
          label: 'Join Room',
          icon: 'globe',
          cls: 'cyan xl',
          sub: 'Enter a code',
          onClick: () => {
            this.view = 'join';
            this.render();
          },
        }),
      ),
      publicOk
        ? h(
            'div.row',
            { style: 'gap:0.6rem;align-items:center' },
            h('span.muted.small', null, 'New rooms are'),
            segmented(
              [
                { value: 'private', label: 'Private' },
                { value: 'public', label: 'Public' },
              ],
              this.wantPublic ? 'public' : 'private',
              (v) => {
                this.wantPublic = v === 'public';
                this.render();
              },
            ),
          )
        : null,
      h(
        'p.muted.small',
        { style: 'text-align:center;max-width:36rem' },
        publicOk
          ? `Private rooms: only people with the code. Public rooms and Quick Match: players 13+ can join. You only ever see racer names, skins and Quick Chat${CONFIG.features.freeChat ? ' (plus Free Chat if you both verified)' : ''}.`
          : teen
            ? 'Quick Match and public rooms are switched off in Parental Controls.'
            : 'Players see each other’s racer name and skin, plus Quick Chat if it’s on. Building a level together? Use Create → Build Together.',
      ),
    ]);
  }

  private renderBusy(text: string): void {
    this.body.append(h('div.boot-shape', { style: 'width:3rem;height:3rem' }), h('p', null, text));
  }

  private renderJoin(): void {
    this.body.append(...codeEntry((code) => void this.join(code)));
  }

  private renderLobby(): void {
    const room = this.room!;
    const slots: HTMLElement[] = [];
    for (let i = 0; i < CONFIG.net.maxPlayers; i++) {
      const p: NetPlayer | undefined = room.players[i];
      slots.push(
        p
          ? h(
              'button.player-slot.filled',
              { 'data-pid': p.id, style: p.id === room.localId ? 'border-color:var(--yellow)' : '', 'aria-label': `${p.name} profile`, onclick: () => openPlayerCard(p) },
              previewCanvas({ skin: p.skin, animate: p.id === room.localId, scale: 0.6 }),
              h('div.nm', null, p.name),
              p.host ? h('span.tag', null, 'HOST') : p.id === room.localId ? h('span.tag.cpu', null, 'YOU') : null,
            )
          : h('div.player-slot', null, h('span.muted.small', null, 'Waiting…')),
      );
    }
    const canStart = room.isHost && room.players.length >= 2;
    const auto = this.autoAt ? Math.max(0, Math.ceil((this.autoAt - performance.now()) / 1000)) : 0;
    append(this.body, [
      h(
        'div.lobby-head',
        null,
        h(`span.room-tag${room.publicRoom ? '.pub' : ''}`, null, room.publicRoom ? 'PUBLIC · 13+' : 'PRIVATE'),
        room.isHost && canUsePublicRooms(store.data) ? button({ label: room.publicRoom ? 'Make private' : 'Make public', icon: room.publicRoom ? 'lock' : 'public', cls: 'ghost sm', onClick: () => void this.setPublic(!room.publicRoom) }) : null,
        !room.isHost && room.publicRoom ? button({ icon: 'report', cls: 'icon red', aria: 'Report this room', onClick: () => this.report() }) : null,
        h('span.muted.small', null, room.isHost ? (room.publicRoom ? 'Racers can find you · code:' : 'Room code:') : 'Room code:'),
        h('div.code-display', null, [...room.code].map((c) => h('span', null, c))),
        friendsSvc.available && room.players.length < 4 ? button({ label: 'Invite friends', icon: 'mail', cls: 'mint sm', onClick: () => openInvitePicker('race', room.code) }) : null,
        button({ label: 'Leave', icon: 'back', cls: 'ghost sm', onClick: () => this.back(), sfx: 'back' }),
      ),
      h('div.players', { style: 'width:min(36rem,92vw)' }, slots),
      this.trackRow(room),
      h(
        'div.lobby-foot',
        null,
        emoteBar((n) => room.sendEmote(n)),
        room.isHost
          ? button({
              label: canStart ? (auto ? `Start Race! (${auto})` : 'Start Race!') : room.publicRoom ? 'Waiting for racers…' : 'Waiting for friends…',
              icon: 'flag',
              cls: `${canStart ? 'yellow pulse' : 'ghost'} lg`,
              disabled: !canStart,
              onClick: () => this.start(room),
            })
          : h('p', null, room.publicRoom && room.players.length >= 2 ? 'Starting soon…' : 'Waiting for the host to start…'),
      ),
    ]);
  }

  private wireRoom(room: NetRoom): void {
    if (room.kind === 'build') {
      // A build-room code typed here: open the editor instead.
      this.handedOff = true;
      setActiveEditor(EditorSession.join(room));
      nav.go('editor');
      return;
    }
    this.room = room;
    if (!this.chat) {
      this.chat = roomChatPanel(room);
      this.chat.panel.el.classList.add('lobby-chat');
      this.el.append(this.chat.panel.el);
    }
    this.roomOffs.push(
      room.on('lobby', () => {
        this.listing?.update();
        this.scheduleAutoStart();
        if (this.view === 'lobby') this.render();
      }),
      room.on('emote', ({ id, n }) => {
        const slot = this.body.querySelector<HTMLElement>(`[data-pid="${CSS.escape(id)}"]`);
        if (slot) showEmote(slot, n);
      }),
      room.on('closed', ({ reason }) => {
        if (this.handedOff) return;
        ui.toast(reason, 'info', 3000);
        this.room = null;
        this.stopListing();
        clearInterval(this.autoTimer);
        this.autoAt = 0;
        this.chat?.close();
        this.chat = null;
        this.view = 'choose';
        this.render();
      }),
      room.on('start', ({ seed, players, delay, level }) => {
        this.handedOff = true;
        clearInterval(this.autoTimer);
        // Started races can't be joined: take the room off the public list.
        this.stopListing();
        let content: LevelContent | undefined;
        try {
          content = level ? decodeLevel(level) : undefined;
        } catch {
          content = undefined;
        }
        // After the race everyone comes back to this lobby for a rematch.
        nav.play({ mode: 'online', room, seed, players, delay, level: content, exit: () => nav.go('friends', { room }) });
      }),
    );
    this.view = 'lobby';
    this.render();
  }

  private async create(): Promise<void> {
    this.view = 'busy';
    this.render();
    try {
      if (this.wantPublic && !(await ensureRules())) {
        this.view = 'choose';
        return this.render();
      }
      const room = await NetRoom.host(store.data.profile.name || 'Rusher', store.data.skins.equipped);
      this.wireRoom(room);
      if (this.wantPublic) await this.setPublic(true);
    } catch (e) {
      ui.toast((e as Error).message, 'wifi', 3500);
      this.view = 'choose';
      this.render();
    }
  }

  private async join(code: string): Promise<void> {
    this.view = 'busy';
    this.render();
    try {
      const room = await NetRoom.join(code, store.data.profile.name || 'Rusher', store.data.skins.equipped);
      this.wireRoom(room);
    } catch (e) {
      ui.toast((e as Error).message, 'wifi', 3500);
      this.view = 'join';
      this.render();
    }
  }

  // ------------------------------------------------------------ track
  private start(room: NetRoom): void {
    const t = room.track;
    room.startRace(t.w === 6 ? trackCodes.get(room) : undefined, t.w >= 0 && t.w < 6 ? t.w : -1);
  }

  private trackLabel(room: NetRoom): string {
    const t = room.track;
    if (t.w === 6 && t.name) return levelName({ name: t.name });
    if (t.w >= 0 && t.w < 6) return BIOMES[t.w].name;
    return 'Random world';
  }

  /** Host picks the next track; everyone sees it. */
  private trackRow(room: NetRoom): HTMLElement {
    if (!room.isHost) return h('p.track-line', null, 'Track: ', h('b', null, this.trackLabel(room)));
    const t = room.track;
    const pick = (track: { w: number; name?: [number, number] }, code?: string) => {
      if (code) trackCodes.set(room, code);
      room.setTrack(track);
      this.render();
    };
    return h(
      'div.track-row',
      null,
      h('span.muted.small', null, 'Track'),
      h(`button.track-chip${t.w === -1 ? '.on' : ''}`, { onclick: () => pick({ w: -1 }) }, 'Random'),
      BIOMES.slice(0, 6).map((pal, i) =>
        h(`button.track-swatch${t.w === i ? '.on' : ''}`, { title: pal.name, 'aria-label': pal.name, style: `background:linear-gradient(180deg, ${pal.skyTop}, ${pal.skyBottom})`, onclick: () => pick({ w: i }) }),
      ),
      h(`button.track-chip${t.w === 6 ? '.on' : ''}`, { onclick: () => this.pickLevel(pick) }, t.w === 6 ? this.trackLabel(room) : 'Level…'),
    );
  }

  private pickLevel(pick: (t: { w: number; name?: [number, number] }, code?: string) => void): void {
    const mine = levels.list().filter((l) => l.verified);
    const entry = (l: LevelContent, sub: string) =>
      button({
        label: h('span.col', { style: 'align-items:flex-start' }, h('b', null, levelName(l)), h('span.muted.small', null, sub)),
        cls: 'ghost',
        onClick: () => {
          m.close();
          pick({ w: 6, name: [l.name[0], l.name[1]] }, encodeLevel(l));
        },
      });
    const m = ui.modal(
      [
        h('h2', null, 'Pick a level'),
        h(
          'div.col.body-scroll',
          { style: 'gap:0.4rem' },
          h('h3', null, 'Featured'),
          FEATURED.map((l) => entry(l, l.difficulty)),
          h('h3', null, 'My levels'),
          mine.length ? mine.map((l) => entry(l, l.authors.length ? `by ${l.authors.join(', ')}` : 'Beaten')) : h('p.muted.small', null, 'Beat one of your own levels in Create to race it here.'),
        ),
      ],
      { showClose: true },
    );
  }

  // ------------------------------------------------------------ public rooms
  /** Join a random open public race, or host one if there are none. */
  private async quickMatch(): Promise<void> {
    if (!canUsePublicRooms(store.data) || !(await ensureRules())) return;
    this.busyText = 'Finding racers…';
    this.view = 'busy';
    this.render();
    let rooms = await lobby.list('race').catch(() => []);
    // Fullest rooms first (they start sooner); random among equals.
    rooms = rooms
      .map((r) => ({ r, k: Math.random() }))
      .sort((a, b) => b.r.players - a.r.players || a.k - b.k)
      .map((x) => x.r);
    for (const r of rooms.slice(0, 4)) {
      try {
        const room = await NetRoom.join(r.code, store.data.profile.name || 'Rusher', store.data.skins.equipped);
        this.busyText = 'Connecting…';
        this.wireRoom(room);
        return;
      } catch {
        /* full, started or gone: try the next one */
      }
    }
    // Nobody waiting: open a public room and let others find us.
    try {
      this.busyText = 'Opening a room…';
      this.render();
      const room = await NetRoom.host(store.data.profile.name || 'Rusher', store.data.skins.equipped);
      this.wireRoom(room);
      await this.setPublic(true);
      ui.toast('No races waiting, so you’re hosting one. Racers will join soon!', 'bolt', 3500);
    } catch (e) {
      ui.toast((e as Error).message, 'wifi', 3500);
      this.view = 'choose';
      this.render();
    } finally {
      this.busyText = 'Connecting…';
    }
  }

  private async setPublic(pub: boolean): Promise<void> {
    const room = this.room;
    if (!room?.isHost) return;
    if (!pub) {
      this.stopListing();
      room.setPublic(false);
      this.render();
      return;
    }
    if (this.listing) return;
    const world = Math.floor(Math.random() * 6);
    const listing = new PublicListing(room, () => ({ name: [world, room.code.charCodeAt(0) % 32], theme: world }), 'race');
    try {
      await listing.start();
    } catch (e) {
      ui.toast(e instanceof ServerError ? e.message : 'Couldn’t make the room public.', 'wifi', 3200);
      return;
    }
    if (this.room !== room || !room.open) return listing.stop();
    this.listing = listing;
    room.setPublic(true);
    this.render();
  }

  private stopListing(): void {
    this.listing?.stop();
    this.listing = null;
  }

  /** Public rooms start on their own once two or more racers are in. */
  private scheduleAutoStart(): void {
    const room = this.room;
    const ready = Boolean(room?.isHost && room.publicRoom && !room.racing && room.players.length >= 2);
    if (!ready) {
      clearInterval(this.autoTimer);
      this.autoTimer = 0;
      this.autoAt = 0;
      return;
    }
    const full = room!.players.length >= CONFIG.net.maxPlayers;
    const at = performance.now() + (full ? 4 : AUTO_START) * 1000;
    if (!this.autoAt || at < this.autoAt) this.autoAt = at;
    if (this.autoTimer) return;
    this.autoTimer = window.setInterval(() => {
      if (!this.room || this.room.racing) return clearInterval(this.autoTimer);
      if (performance.now() >= this.autoAt) {
        clearInterval(this.autoTimer);
        this.autoTimer = 0;
        this.autoAt = 0;
        this.room.startRace();
        return;
      }
      if (this.view === 'lobby') this.render();
    }, 1000);
  }

  private report(): void {
    const room = this.room;
    if (!room) return;
    const m = ui.modal(
      [
        h('h2', null, 'Report this room'),
        h('p.muted', null, 'Tell our safety team what’s wrong.'),
        h(
          'div.col',
          { style: 'gap:0.4rem' },
          ['Rude racer or Quick Chat spam', 'Someone made me feel unsafe', 'Something else'].map((reason) =>
            button({
              label: reason,
              cls: 'red',
              onClick: async () => {
                m.close();
                try {
                  await lobby.report(room.code, reason, null);
                  ui.toast('Thanks for telling us. A grown-up on our team will check it.', 'report', 3500);
                } catch {
                  ui.toast('Report failed. Please try again later.', 'info');
                }
              },
            }),
          ),
        ),
      ],
      { showClose: true },
    );
  }
}
