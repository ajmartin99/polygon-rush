import { store } from '../../state/store';
import { NetRoom, type NetPlayer } from '../../services/net';
import { EditorSession, setActiveEditor } from '../../editor/session';
import { ChatLog } from '../../services/chatlog';
import { quickLine } from '../../meta/quickchat';
import { ChatPanel } from '../chat-panel';
import { attachFreeChat } from '../free-chat';
import { codeEntry } from '../code-entry';
import { CONFIG } from '../../config';
import { BaseScreen, button, titleBar } from '../components';
import { h, clear } from '../dom';
import { nav } from '../nav';
import { previewCanvas } from '../preview';
import { ui } from '../ui';

type View = 'choose' | 'join' | 'busy' | 'lobby';

/** Private online rooms with a 4-character code. */
export class FriendsScreen extends BaseScreen {
  private view: View = 'choose';
  private body = h('div.grow.col', { style: 'align-items:center;justify-content:center;gap:1rem;min-height:0' });
  private room: NetRoom | null = null;
  private handedOff = false;
  private chatLog = new ChatLog();
  private chat: ChatPanel | null = null;
  private detachFree: (() => void) | null = null;

  constructor(params?: Record<string, unknown>) {
    super('.solid');
    this.el.append(titleBar('Play with Friends', 'globe', () => this.back()), this.body);
    const room = params?.room as NetRoom | undefined;
    if (room) this.wireRoom(room);
    else this.render();
  }

  override leave(): void {
    super.leave();
    this.chat?.destroy();
    this.detachFree?.();
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
    nav.go('menu');
    return true;
  }

  private render(): void {
    clear(this.body);
    switch (this.view) {
      case 'choose':
        return this.renderChoose();
      case 'join':
        return this.renderJoin();
      case 'busy':
        return this.renderBusy('Connecting…');
      case 'lobby':
        return this.renderLobby();
    }
  }

  private renderChoose(): void {
    this.body.append(
      h('p', { style: 'text-align:center;max-width:32rem' }, 'Race up to 3 friends online. Make a room and share the code out loud — no strangers. Building a level together? Use Create → Build Together.'),
      h(
        'div.row',
        { style: 'gap:1.2rem' },
        button({ label: 'Create Room', icon: 'users', cls: 'yellow xl', onClick: () => void this.create() }),
        button({
          label: 'Join Room',
          icon: 'globe',
          cls: 'cyan xl',
          onClick: () => {
            this.view = 'join';
            this.render();
          },
        }),
      ),
      h('p.muted.small', { style: 'text-align:center;max-width:34rem' }, 'Everyone needs an internet connection. Players see each other’s racer name and skin, plus Quick Chat if it’s on.'),
    );
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
              'div.player-slot.filled',
              p.id === room.localId ? { style: 'border-color:var(--yellow)' } : null,
              previewCanvas({ skin: p.skin, animate: p.id === room.localId, scale: 0.6 }),
              h('div.nm', null, p.name),
              p.host ? h('span.tag', null, 'HOST') : p.id === room.localId ? h('span.tag.cpu', null, 'YOU') : null,
            )
          : h('div.player-slot', null, h('span.muted.small', null, 'Waiting…')),
      );
    }
    const canStart = room.isHost && room.players.length >= 2;
    this.body.append(
      h('p.muted', null, room.isHost ? 'Tell your friends this code:' : 'You’re in! Room code:'),
      h('div.code-display.big', null, [...room.code].map((c) => h('span', null, c))),
      h('div.players', { style: 'width:min(36rem,92vw)' }, slots),
      room.isHost
        ? button({
            label: canStart ? 'Start Race!' : 'Waiting for friends…',
            icon: 'flag',
            cls: `${canStart ? 'yellow pulse' : 'ghost'} lg`,
            disabled: !canStart,
            onClick: () => room.startRace(),
          })
        : h('p', null, 'Waiting for the host to start…'),
    );
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
    room.on('quick', ({ id, n }) => {
      const line = quickLine(n);
      const p = room.player(id);
      if (line && store.settings.quickChat) this.chatLog.push({ from: id, name: p?.name ?? 'Player', color: p?.color ?? 0, text: line.text, kind: 'quick', mine: id === room.localId });
    });
    if (!this.chat) {
      this.chat = new ChatPanel({
        where: 'race',
        log: this.chatLog,
        onQuick: (n) => {
          room.sendQuick(n);
          const line = quickLine(n);
          if (!room.isHost && line) this.chatLog.push({ from: room.localId, name: 'You', color: room.player(room.localId)?.color ?? 0, text: line.text, kind: 'quick', mine: true });
        },
      });
      this.chat.el.classList.add('lobby-chat');
      this.el.append(this.chat.el);
      this.detachFree = attachFreeChat(room, this.chatLog, this.chat);
    }
    room.on('lobby', () => this.view === 'lobby' && this.render());
    room.on('closed', ({ reason }) => {
      if (this.handedOff) return;
      ui.toast(reason, 'info', 3000);
      this.room = null;
      this.view = 'choose';
      this.render();
    });
    room.on('start', ({ seed, players, delay }) => {
      this.handedOff = true;
      nav.play({ mode: 'online', room, seed, players, delay });
    });
    this.view = 'lobby';
    this.render();
  }

  private async create(): Promise<void> {
    this.view = 'busy';
    this.render();
    try {
      const room = await NetRoom.host(store.data.profile.name || 'Rusher', store.data.skins.equipped);
      this.wireRoom(room);
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
}
