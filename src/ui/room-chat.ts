import { quickLine } from '../meta/quickchat';
import { ChatLog } from '../services/chatlog';
import type { NetRoom } from '../services/net';
import { store } from '../state/store';
import { ChatPanel } from './chat-panel';
import { RoomFreeChat } from './free-chat';

/** One chat log per room, so Quick Chat history follows players from lobby to podium and back. */
const logs = new WeakMap<NetRoom, ChatLog>();

export function roomChatLog(room: NetRoom): ChatLog {
  let log = logs.get(room);
  if (log) return log;
  const created = new ChatLog();
  log = created;
  logs.set(room, created);
  room.on('quick', ({ id, n }) => {
    const line = quickLine(n);
    const p = room.player(id);
    if (line && store.settings.quickChat) created.push({ from: id, name: p?.name ?? 'Player', color: p?.color ?? 0, text: line.text, kind: 'quick', mine: id === room.localId });
  });
  return created;
}

/** A chat panel (Quick Chat, plus Free Chat when both sides are verified) for a race room. */
export function roomChatPanel(room: NetRoom): { panel: ChatPanel; close: () => void } {
  const log = roomChatLog(room);
  const panel = new ChatPanel({
    where: 'race',
    log,
    onQuick: (n) => {
      room.sendQuick(n);
      // The host hears its own line back from the room; guests add theirs here.
      const line = quickLine(n);
      if (!room.isHost && line) log.push({ from: room.localId, name: 'You', color: room.player(room.localId)?.color ?? 0, text: line.text, kind: 'quick', mine: true });
    },
  });
  const free = new RoomFreeChat(room, log);
  free.bind(panel);
  return {
    panel,
    close: () => {
      panel.destroy();
      free.close();
    },
  };
}
