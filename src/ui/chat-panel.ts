import { quickLinesFor } from '../meta/quickchat';
import type { ChatLine, ChatLog } from '../services/chatlog';
import { PLAYER_COLORS } from '../editor/session';
import { store } from '../state/store';
import { button } from './components';
import { clear, h, ic } from './dom';
import { ui } from './ui';

/** Free Chat hook-up (services/chat.ts). Absent = Quick Chat only. */
export interface FreeChatPort {
  /** Connected and allowed to type right now. */
  readonly ready: boolean;
  /** How many people in the room can see Free Chat (including you). */
  readonly audience: number;
  send(text: string): Promise<string | null>;
  report(line: ChatLine, reason: string): Promise<boolean>;
  /** Hide this account everywhere (and report nothing). */
  block(line: ChatLine): void;
}

export interface ChatPanelOptions {
  where: 'build' | 'race';
  log: ChatLog;
  onQuick: (n: number) => void;
  free?: FreeChatPort | null;
  /** Start collapsed to a button (small screens). */
  compact?: boolean;
}

/**
 * Room chat: Quick Chat phrases for everyone (when parents allow it) and,
 * for eligible verified players, a Free Chat box. Free Chat lines are only
 * ever delivered to players who have Free Chat themselves.
 */
export class ChatPanel {
  readonly el: HTMLElement;
  private logEl = h('div.chat-log');
  private inputRow = h('div.chat-input');
  private pop: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private free: FreeChatPort | null;
  private expanded = false;

  constructor(private readonly opts: ChatPanelOptions) {
    this.free = opts.free ?? null;
    const quickBtn = button({ icon: 'chat', label: h('span.qlabel', null, 'Quick Chat'), cls: 'cyan sm quick-btn', aria: 'Quick Chat', onClick: () => this.toggleQuick() });
    const enabled = store.settings.quickChat;
    if (!enabled) quickBtn.disabled = true;
    this.el = h(
      'div.chat-panel',
      null,
      this.logEl,
      h('div.chat-bar', null, quickBtn, this.inputRow),
      enabled ? null : h('p.muted.small', null, 'Quick Chat is off in Parental Controls.'),
    );
    this.logEl.addEventListener('click', () => {
      this.expanded = !this.expanded;
      this.el.classList.toggle('expanded', this.expanded);
      this.renderLog();
    });
    this.offs.push(
      opts.log.on('line', () => this.renderLog()),
      opts.log.on('update', () => this.renderLog()),
    );
    this.renderInput();
    this.renderLog();
    const timer = window.setInterval(() => this.renderLog(), 2000);
    this.offs.push(() => clearInterval(timer));
  }

  /** Free Chat connected / disconnected / audience changed. */
  setFree(free: FreeChatPort | null): void {
    const wasReady = Boolean(this.free?.ready && this.input);
    this.free = free;
    if (wasReady && free?.ready && this.input) {
      this.input.placeholder = this.placeholder(free);
      return;
    }
    this.renderInput();
  }

  private input: HTMLInputElement | null = null;

  private placeholder(free: FreeChatPort): string {
    return free.audience > 1 ? `Type… (${free.audience - 1} can see)` : 'Type… (no one else has Free Chat)';
  }

  destroy(): void {
    for (const off of this.offs.splice(0)) off();
    this.pop?.remove();
    this.el.remove();
  }

  /** Re-render the free-chat box (after connecting/disconnecting). */
  renderInput(): void {
    clear(this.inputRow);
    this.input = null;
    const free = this.free;
    this.el.classList.toggle('has-free', Boolean(free?.ready));
    if (!free?.ready) return;
    const input = h<HTMLInputElement>('input', {
      type: 'text',
      maxlength: '120',
      placeholder: this.placeholder(free),
      autocomplete: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      enterkeyhint: 'send',
      'aria-label': 'Free Chat message',
    });
    const send = async () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      const err = await free.send(text);
      if (err) ui.toast(err, 'info', 3200);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void send();
    });
    this.input = input;
    this.inputRow.append(input, button({ icon: 'next', cls: 'icon mint', aria: 'Send', onClick: () => void send() }));
  }

  private renderLog(): void {
    clear(this.logEl);
    const now = performance.now();
    const lines = this.opts.log.lines.filter((l) => (l.kind === 'quick' ? store.settings.quickChat : true));
    const shown = this.expanded ? lines.slice(-30) : lines.filter((l) => now - l.at < 9000).slice(-4);
    for (const l of shown) {
      const row = h(
        `div.chat-line.${l.kind}`,
        null,
        l.kind === 'system' ? null : h('b', { style: `color:${PLAYER_COLORS[l.color % PLAYER_COLORS.length]}` }, l.mine ? 'You' : l.name.replace(/ \d+$/, '')),
        l.kind === 'free' ? h('span.free-tag', { title: 'Free Chat (verified)' }, ic('verified')) : null,
        h('span', null, l.text),
      );
      if (!l.mine && l.kind !== 'system' && this.expanded) {
        row.append(button({ icon: 'report', cls: 'icon ghost sm', aria: 'Report or mute', onClick: (e) => (e.stopPropagation(), this.lineMenu(l)) }));
      }
      this.logEl.appendChild(row);
    }
    this.logEl.classList.toggle('empty', !shown.length);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private lineMenu(l: ChatLine): void {
    const m = ui.modal(
      [
        h('h2', null, l.name),
        h('p.muted', null, `“${l.text}”`),
        h(
          'div.col',
          { style: 'gap:0.5rem' },
          button({
            label: 'Mute this player',
            icon: 'mute',
            cls: 'ghost lg',
            onClick: () => {
              this.opts.log.mute(l.from);
              if (l.kind === 'free') this.free?.block(l);
              m.close();
              ui.toast('Muted. You won’t see their messages.', 'mute');
            },
          }),
          l.kind === 'free' && this.free
            ? [
                h('p.small', null, 'Report this message to our safety team:'),
                h(
                  'div.actions',
                  null,
                  ['Mean or bullying', 'Asking for personal info', 'Inappropriate', 'Scary or threatening'].map((reason) =>
                    button({
                      label: reason,
                      cls: 'red sm',
                      onClick: async () => {
                        m.close();
                        const ok = await this.free!.report(l, reason);
                        this.opts.log.mute(l.from);
                        ui.toast(ok ? 'Thanks — reported and muted. A grown-up on our team will check it.' : 'Muted. Report failed, please try again later.', 'report', 3600);
                      },
                    }),
                  ),
                ),
              ]
            : null,
        ),
      ],
      { showClose: true },
    );
  }

  private toggleQuick(): void {
    if (this.pop) {
      this.pop.remove();
      this.pop = null;
      return;
    }
    const items = quickLinesFor(this.opts.where);
    const phrases = items.filter((i) => !i.line.emote);
    const emotes = items.filter((i) => i.line.emote);
    const pick = (n: number) => {
      this.opts.onQuick(n);
      this.pop?.remove();
      this.pop = null;
    };
    this.pop = h(
      'div.quick-pop',
      null,
      h('div.quick-emotes', null, emotes.map(({ n, line }) => h('button', { onclick: () => pick(n), 'aria-label': `Send ${line.text}` }, line.text))),
      h('div.quick-grid', null, phrases.map(({ n, line }) => h('button', { onclick: () => pick(n) }, line.text))),
    );
    this.el.appendChild(this.pop);
  }
}
