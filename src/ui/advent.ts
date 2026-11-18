import { ADVENT_DAYS, ADVENT_REWARDS, adventOpen, adventToday, adventWaiting, doorState, LATE_DOOR_GEMS, openDoor, type AdventGrant, type AdventReward } from '../meta/advent';
import { skinById, trailById } from '../meta/catalog';
import { EMOTES } from '../meta/emotes';
import { store } from '../state/store';
import { alertModal, confirm } from './components';
import { clear, fmt, h } from './dom';
import { ui } from './ui';

/** "a Heart Regen", "the Elf skin"... */
function describeGrant(g: AdventGrant): string {
  const parts: string[] = [];
  for (const id of g.skins) parts.push(`the ${skinById(id).name} skin`);
  for (const id of g.trails) parts.push(`the ${trailById(id).name} trail`);
  for (const id of g.emotes) parts.push(`the ${EMOTES.find((e) => e.id === id)?.name ?? id} emote`);
  if (g.regens) parts.push(g.regens > 1 ? `${g.regens} Heart Regens` : 'a Heart Regen');
  if (g.gems) parts.push(`${fmt(g.gems)} gems`);
  return parts.length < 2 ? parts[0] ?? '' : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** A peek at what's behind an opened door. */
function glyph(r: AdventReward): string {
  switch (r.kind) {
    case 'gems':
      return '💎';
    case 'regen':
      return '❤️';
    case 'skin':
      return '🧸';
    case 'trail':
      return '✨';
    case 'emote':
      return EMOTES.find((e) => e.id === r.id)?.glyph ?? '🎁';
    default:
      return '⭐';
  }
}

/** Home screen chip: today's door is waiting. */
export function adventChip(): HTMLElement | null {
  if (!adventOpen()) return null;
  const waiting = adventWaiting(store.data) > 0;
  const today = adventToday();
  return h(
    `button.event-chip.advent-chip${waiting ? '.waiting' : ''}`,
    { onclick: () => openAdvent(), 'aria-label': 'Advent Calendar' },
    h('span.ev-pumpkin', null, '🗓️'),
    h('span', null, h('b', null, 'Advent'), h('small', null, waiting ? `Door ${today} is ready!` : 'Calendar')),
  );
}

/** The calendar: 25 doors, today's glowing. */
export function openAdvent(): void {
  const grid = h('div.advent-grid');
  const render = () => {
    clear(grid);
    // Doors in a jumbled order, like a real calendar (the same every year).
    const order = Array.from({ length: ADVENT_DAYS }, (_, i) => i + 1).sort((a, b) => ((a * 7) % 25) - ((b * 7) % 25));
    for (const n of order) {
      const st = doorState(store.data, n);
      const door = h(
        `button.advent-door.${st}${n === 25 ? '.big' : ''}`,
        { 'aria-label': `Door ${n}, ${st}` },
        st === 'opened' ? h('span.advent-peek', null, glyph(ADVENT_REWARDS[n - 1])) : null,
        h('b', null, String(n)),
        st === 'late' ? h('small', null, `💎${LATE_DOOR_GEMS}`) : null,
      );
      door.addEventListener('click', () => void open(n, st));
      grid.append(door);
    }
  };
  const open = async (n: number, st: string) => {
    if (st === 'locked') return void ui.toast(`Door ${n} opens on December ${n}.`, 'lock');
    if (st === 'opened') return;
    if (st === 'late') {
      if (store.data.gems < LATE_DOOR_GEMS) return void ui.toast(`You need ${LATE_DOOR_GEMS} gems to open a door you missed.`, 'gem');
      if (!(await confirm(`Open door ${n}?`, `You missed this one. Open it now for ${LATE_DOOR_GEMS} gems?`, 'Open', 'Not now'))) return;
    }
    const got = openDoor(store.data, n);
    if (!got) return;
    store.commit();
    ui.sfx('reward');
    render();
    await alertModal(n === 25 ? '🎄 Merry Christmas!' : `Door ${n}`, `You got ${describeGrant(got)}!`, 'gift');
  };
  render();
  ui.modal(
    [
      h('h2', null, '🗓️ Advent Calendar'),
      h('p.muted.small', null, `A door a day until Christmas. Missed one? Open it later for ${LATE_DOOR_GEMS} gems. Door 25 hides something you can’t get anywhere else.`),
      grid,
    ],
    { showClose: true, wide: true },
  );
}
