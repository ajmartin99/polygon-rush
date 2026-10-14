import { freeChatReady } from '../meta/community';
import { account } from '../services/account';
import { FreeChatClient } from '../services/chat';
import type { ChatLog } from '../services/chatlog';
import type { NetRoom } from '../services/net';
import { store } from '../state/store';
import type { ChatPanel, FreeChatPort } from './chat-panel';
import { ui } from './ui';

/**
 * Free Chat for one room, when this player is eligible (verified account,
 * old enough or with a parent's OK, setting on). Lives as long as the room;
 * chat panels bind to it while they're on screen.
 */
export class RoomFreeChat {
  private client: FreeChatClient | null = null;
  private panel: ChatPanel | null = null;
  private offs: (() => void)[] = [];
  readonly port: FreeChatPort | null = null;

  constructor(room: NetRoom, log: ChatLog) {
    const d = store.data;
    if (!freeChatReady(d) || !room.chatKey || room.chatKey.length < 16) return;
    const client = new FreeChatClient(d.account.token, room.chatKey, d.profile.name || 'Rusher');
    this.client = client;
    const blocked = new Set(d.account.blocked);
    this.port = {
      get ready() {
        return client.ready;
      },
      get audience() {
        return client.audience;
      },
      send: async (text) => client.say(text),
      report: (line, reason) => (line.msgId ? client.report(line.msgId, reason) : Promise.resolve(false)),
      block: (line) => {
        if (!line.account || blocked.has(line.account)) return;
        blocked.add(line.account);
        store.data.account.blocked.push(line.account);
        store.commit();
      },
    };
    this.offs.push(
      client.on('state', () => this.panel?.setFree(this.port)),
      client.on('msg', (m) => {
        if (blocked.has(m.from)) return;
        const p = room.players.find((x) => x.name === m.name);
        log.push({ from: `acct:${m.from}`, account: m.from, msgId: m.id, name: m.name, color: p?.color ?? 0, text: m.text, kind: 'free', mine: m.from === store.data.account.id });
      }),
      client.on('blocked', (text) => ui.toast(text, 'info', 3400)),
      client.on('muted', (until) => {
        store.data.account.mutedUntil = until;
        store.commit();
        ui.toast('Your Free Chat is paused for now because other players reported messages.', 'mute', 4000);
      }),
      client.on('denied', ({ code }) => {
        if (code === 'signed_out' || code === 'banned') account.forget();
        ui.toast('Free Chat is off for this account.', 'lock', 3500);
        this.close();
        log.dropFree();
      }),
    );
  }

  /** Show the Free Chat box in a panel while it's on screen. */
  bind(panel: ChatPanel): () => void {
    this.panel = panel;
    panel.setFree(this.client ? this.port : null);
    return () => {
      if (this.panel === panel) this.panel = null;
    };
  }

  close(): void {
    for (const off of this.offs.splice(0)) off();
    this.client?.close();
    this.client = null;
    this.panel?.setFree(null);
  }
}
