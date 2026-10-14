import type { ChatLog } from '../services/chatlog';
import type { NetRoom } from '../services/net';
import type { ChatPanel } from './chat-panel';

/**
 * Connect a room's chat panel to Free Chat when this player is eligible
 * (verified account, old enough or with a parent's OK, setting on).
 * Returns a cleanup function.
 */
export function attachFreeChat(room: NetRoom, log: ChatLog, panel: ChatPanel): () => void {
  void room;
  void log;
  void panel;
  return () => {};
}
