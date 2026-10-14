import { store } from '../../state/store';
import { CODE_ALPHABET, CODE_LENGTH, NetRoom, isValidCode, type NetPlayer } from '../../services/net';
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
  private code = '';
  private handedOff = false;

  constructor() {
    super('.solid');
    this.el.append(titleBar('Play with Friends', 'globe', () => this.back()), this.body);
    this.render();
  }

  override leave(): void {
    super.leave();
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
      h('p', { style: 'text-align:center;max-width:32rem' }, 'Race up to 3 friends online. Make a room and share the code out loud — no chat, no strangers.'),
      h(
        'div.row',
        { style: 'gap:1.2rem' },
        button({ label: 'Create Room', icon: 'users', cls: 'yellow xl', onClick: () => void this.create() }),
        button({
          label: 'Join Room',
          icon: 'globe',
          cls: 'cyan xl',
          onClick: () => {
            this.code = '';
            this.view = 'join';
            this.render();
          },
        }),
      ),
      h('p.muted.small', { style: 'text-align:center;max-width:34rem' }, 'Everyone needs an internet connection. Players see each other’s racer name and skin only.'),
    );
  }

  private renderBusy(text: string): void {
    this.body.append(h('div.boot-shape', { style: 'width:3rem;height:3rem' }), h('p', null, text));
  }

  private renderJoin(): void {
    const display = h('div.code-display');
    const paint = () => {
      clear(display);
      for (let i = 0; i < CODE_LENGTH; i++) display.appendChild(h(`span${this.code[i] ? '.filled' : ''}`, null, this.code[i] ?? ''));
      joinBtn.disabled = !isValidCode(this.code);
    };
    const joinBtn = button({ label: 'Join', icon: 'play', cls: 'mint lg', disabled: true, onClick: () => void this.join() });
    const keypad = h(
      'div.keypad',
      { style: 'width:min(30rem,90vw)' },
      [...CODE_ALPHABET].map((c) =>
        h(
          'button',
          {
            onclick: () => {
              if (this.code.length < CODE_LENGTH) this.code += c;
              paint();
            },
          },
          c,
        ),
      ),
      h(
        'button.wide',
        {
          'aria-label': 'Delete',
          onclick: () => {
            this.code = this.code.slice(0, -1);
            paint();
          },
        },
        '⌫',
      ),
    );
    this.body.append(h('h3', null, 'Enter the room code'), display, keypad, joinBtn);
    paint();
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
    this.room = room;
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

  private async join(): Promise<void> {
    const code = this.code;
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

