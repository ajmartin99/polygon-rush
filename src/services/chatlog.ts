import { Emitter } from '../core/emitter';

export interface ChatLine {
  id: number;
  /** Sender's room id ('' for system lines). */
  from: string;
  name: string;
  color: number;
  text: string;
  kind: 'quick' | 'free' | 'system';
  /** Free chat: server message id (for reports). */
  msgId?: string;
  /** Free chat: sender's account id (for muting across rooms). */
  account?: string;
  mine?: boolean;
  at: number;
}

interface LogEvents extends Record<string, unknown> {
  line: ChatLine;
  update: void;
}

let ids = 1;

/** Messages shown in a room (Quick Chat, Free Chat and notices). */
export class ChatLog extends Emitter<LogEvents> {
  readonly lines: ChatLine[] = [];
  /** Room ids muted this session. */
  readonly muted = new Set<string>();

  push(line: Omit<ChatLine, 'id' | 'at'>): ChatLine | null {
    if (line.from && this.muted.has(line.from)) return null;
    const full: ChatLine = { ...line, id: ids++, at: performance.now() };
    this.lines.push(full);
    if (this.lines.length > 80) this.lines.shift();
    this.emit('line', full);
    return full;
  }

  system(text: string): void {
    this.push({ from: '', name: '', color: 0, text, kind: 'system' });
  }

  /** Hide everything from a player (and anything they send later). */
  mute(from: string): void {
    if (!from) return;
    this.muted.add(from);
    for (let i = this.lines.length - 1; i >= 0; i--) if (this.lines[i].from === from) this.lines.splice(i, 1);
    this.emit('update', undefined);
  }

  /** Remove free-chat lines (when free chat is switched off). */
  dropFree(): void {
    for (let i = this.lines.length - 1; i >= 0; i--) if (this.lines[i].kind === 'free') this.lines.splice(i, 1);
    this.emit('update', undefined);
  }
}
