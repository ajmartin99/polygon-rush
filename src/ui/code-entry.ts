import { CODE_ALPHABET, CODE_LENGTH, isValidCode } from '../services/net';
import { button } from './components';
import { clear, h } from './dom';

/** On-screen keypad for 4-character room codes (no keyboard, no free text). */
export function codeEntry(onJoin: (code: string) => void, title = 'Enter the room code'): HTMLElement[] {
  let code = '';
  const display = h('div.code-display');
  const joinBtn = button({ label: 'Join', icon: 'play', cls: 'mint lg', disabled: true, onClick: () => onJoin(code) });
  const paint = () => {
    clear(display);
    for (let i = 0; i < CODE_LENGTH; i++) display.appendChild(h(`span${code[i] ? '.filled' : ''}`, null, code[i] ?? ''));
    joinBtn.disabled = !isValidCode(code);
  };
  const keypad = h(
    'div.keypad',
    { style: 'width:min(30rem,90vw)' },
    [...CODE_ALPHABET].map((c) =>
      h(
        'button',
        {
          onclick: () => {
            if (code.length < CODE_LENGTH) code += c;
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
          code = code.slice(0, -1);
          paint();
        },
      },
      '⌫',
    ),
  );
  paint();
  return [h('h3', null, title), display, keypad, joinBtn];
}
