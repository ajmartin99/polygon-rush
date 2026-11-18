import { EMOTES } from '../meta/emotes';
import { GIVER_GEMS, unwrapPresent } from '../meta/santa';
import { handleOf, type Player } from '../services/friends';
import { santa, type Present } from '../services/santa';
import { ServerError } from '../services/server';
import { store } from '../state/store';
import { button } from './components';
import { h } from './dom';
import { nav } from './nav';
import { ui } from './ui';

/** Wrapping papers (the only thing a sender chooses). */
export const WRAPS = [
  { name: 'Candy Stripe', bg: 'repeating-linear-gradient(45deg,#e8304a 0 10px,#ffffff 10px 20px)' },
  { name: 'Evergreen', bg: 'linear-gradient(160deg,#2fbf71,#0e5a2e)' },
  { name: 'Starry Night', bg: 'radial-gradient(circle at 30% 30%,#ffd23f 0 3px,transparent 4px) 0 0/18px 18px,#1a2a6a' },
  { name: 'Snowflakes', bg: 'radial-gradient(circle,#ffffff 0 2px,transparent 3px) 0 0/14px 14px,#3e7bff' },
];

function wrapEl(wrap: number, big = false): HTMLElement {
  return h(`span.santa-wrap${big ? '.big' : ''}`, { style: `background:${WRAPS[wrap % WRAPS.length].bg}` }, h('span.santa-bow', null, '🎀'));
}

/** Friends screen: send a friend today's present. */
export function presentButton(p: Player, refresh: () => void): HTMLElement | null {
  if (!santa.available) return null;
  if (santa.sentToday) return santa.sentToday === p.id ? h('span.santa-sent', null, '🎁 Sent!') : null;
  return button({ icon: 'gift', cls: 'icon pink sm', aria: `Send ${handleOf(p)} a present`, onClick: () => pickWrap(p, refresh) });
}

function pickWrap(p: Player, refresh: () => void): void {
  const m = ui.modal(
    [
      h('h2', null, '🎁 Secret Santa'),
      h('p.small', null, `Send ${handleOf(p)} a present! Pick the wrapping paper. What’s inside is a surprise for both of you. One present a day.`),
      h(
        'div.santa-papers',
        null,
        WRAPS.map((w, i) =>
          h(
            'button.santa-paper',
            {
              'aria-label': w.name,
              onclick: async () => {
                m.close();
                try {
                  await santa.send(p.id, i);
                  store.addGems(GIVER_GEMS);
                  ui.sfx('reward');
                  ui.toast(`Present sent to ${handleOf(p)}! +${GIVER_GEMS} gems for giving.`, 'gift', 3500);
                } catch (e) {
                  ui.toast(e instanceof ServerError ? e.message : 'That didn’t send. Try again.', 'info', 3200);
                }
                refresh();
              },
            },
            wrapEl(i),
            h('span.small', null, w.name),
          ),
        ),
      ),
    ],
    { showClose: true, wide: true },
  );
}

let checked = 0;

/** Home screen: unwrap presents friends sent (checked at most every few minutes). */
export async function checkPresents(): Promise<void> {
  if (!santa.available || Date.now() - checked < 3 * 60_000) return;
  checked = Date.now();
  let list: Present[];
  try {
    list = await santa.inbox();
  } catch {
    return;
  }
  if (!list.length || nav.route !== 'menu' || ui.hasModal) return;
  showPresent(list, 0);
}

function showPresent(list: Present[], i: number): void {
  const p = list[i];
  if (!p) return;
  const box = wrapEl(p.wrap, true);
  const note = h('p', null, `From ${handleOf(p.from)}`);
  const m = ui.modal(
    [
      h('h2', null, '🎁 A present for you!'),
      box,
      note,
      h(
        'div.actions',
        null,
        button({
          label: 'Unwrap',
          icon: 'gift',
          cls: 'mint lg',
          onClick: async (ev) => {
            const btn = ev?.currentTarget as HTMLButtonElement | undefined;
            if (btn) btn.disabled = true;
            try {
              await santa.open(p.id);
            } catch (e) {
              m.close();
              return void ui.toast(e instanceof ServerError ? e.message : 'Couldn’t open it right now.', 'info');
            }
            const got = unwrapPresent(store.data, p.id);
            store.commit();
            ui.sfx('reward');
            box.classList.add('opened');
            note.textContent = got.emote ? `The ${EMOTES.find((e) => e.id === got.emote)?.name} emote! From ${handleOf(p.from)}.` : `${got.gems} gems! From ${handleOf(p.from)}.`;
            btn?.remove();
            setTimeout(() => {
              m.close();
              showPresent(list, i + 1);
            }, 2200);
          },
        }),
      ),
    ],
    { showClose: true },
  );
}
