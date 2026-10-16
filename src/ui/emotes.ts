import { EMOTES, emoteIndex, type EmoteDef } from '../meta/emotes';
import { store } from '../state/store';
import { h } from './dom';

export function ownedEmotes(): EmoteDef[] {
  const owned = new Set(store.data.emotes.owned);
  return EMOTES.filter((e) => owned.has(e.id));
}

/** A row of the player's emotes. Taps are rate-limited to one every 1.2 s. */
export function emoteBar(onPick: (n: number) => void): HTMLElement {
  let last = 0;
  const bar = h(
    'div.emote-bar',
    { role: 'toolbar', 'aria-label': 'Emotes' },
    ownedEmotes().map((e) =>
      h(
        'button.emote-btn',
        {
          title: e.name,
          'aria-label': e.name,
          onclick: () => {
            const now = performance.now();
            if (now - last < 1200) return;
            last = now;
            onPick(emoteIndex(e.id));
            bar.classList.add('cool');
            setTimeout(() => bar.classList.remove('cool'), 1200);
          },
        },
        h('span', null, e.glyph),
      ),
    ),
  );
  return bar;
}

/** Pop an emote over a racer (anchor must be position: relative). */
export function showEmote(anchor: HTMLElement, n: number): void {
  const e = EMOTES[n];
  if (!e) return;
  anchor.querySelector('.emote-bubble')?.remove();
  const bubble = h(`span.emote-bubble.e-${e.anim}`, null, e.glyph);
  anchor.append(bubble);
  anchor.classList.remove('emo-bounce', 'emo-spin', 'emo-wave', 'emo-shake', 'emo-pop', 'emo-float');
  void anchor.offsetWidth;
  anchor.classList.add(`emo-${e.anim}`);
  setTimeout(() => {
    bubble.remove();
    anchor.classList.remove(`emo-${e.anim}`);
  }, 1800);
}
