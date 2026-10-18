import { CONFIG } from '../config';
import { levelName } from '../game/level';
import { ageOf, canUsePublicRooms, serverAvailable } from '../meta/community';
import { BIOMES } from '../render/biomes';
import { lobby, type PublicRoomInfo } from '../services/lobby';
import { ServerError } from '../services/server';
import { store } from '../state/store';
import { button } from './components';
import { clear, h, ic } from './dom';

/** Set by Create → joinRoomByCode (avoids an import cycle). */
let joinHandler: (code: string) => Promise<boolean> = async () => false;
export function setPublicJoinHandler(fn: (code: string) => Promise<boolean>): void {
  joinHandler = fn;
}

/**
 * Create → Build Together → Public build rooms (13+, needs the community
 * server). Rooms show only the level name, theme, the host's generated name
 * and how many builders are in.
 */
export function publicBuildsSection(): HTMLElement | null {
  const d = store.data;
  if (!serverAvailable() || ageOf(d.profile.birthYear) < 13) return null;
  const panel = h('div.panel.col.pub-panel');
  const head = h('div.row', { style: 'justify-content:space-between;align-items:center' }, h('h3', null, ic('public'), ' Public build rooms ', h('span.tag', null, '13+')));
  const list = h('div.pub-list');
  panel.append(head, list);
  if (!canUsePublicRooms(d)) {
    list.append(h('p.muted', null, 'Public rooms are turned off in Parental Controls.'));
    return panel;
  }
  const refresh = button({ icon: 'restore', cls: 'icon ghost', aria: 'Refresh', onClick: () => void load() });
  head.append(refresh);
  const load = async () => {
    clear(list);
    list.append(h('p.muted', null, 'Looking for rooms…'));
    let rooms: PublicRoomInfo[];
    try {
      rooms = await lobby.list();
    } catch (e) {
      clear(list);
      list.append(h('p.muted', null, e instanceof ServerError ? e.message : 'Couldn’t load public rooms.'));
      return;
    }
    clear(list);
    if (!rooms.length) {
      list.append(h('p.muted', null, 'No public rooms right now. Host a build room and tap the globe to make it public!'));
      return;
    }
    for (const r of rooms) {
      const pal = BIOMES[r.theme % BIOMES.length];
      const join = button({
        label: 'Join',
        icon: 'play',
        cls: 'mint sm',
        onClick: async () => {
          join.disabled = true;
          if (!(await joinHandler(r.code))) join.disabled = false;
        },
      });
      list.append(
        h(
          'div.pub-room',
          null,
          h('i.swatch', { style: `background:linear-gradient(180deg, ${pal.skyTop}, ${pal.skyBottom})` }),
          h('div.lbl', null, h('b', null, levelName({ name: r.name })), h('span.muted.small', null, `by ${r.host} · ${r.players}/${r.max} builders`)),
          join,
        ),
      );
    }
  };
  void load();
  panel.append(h('p.muted.small', null, `Strangers can join public rooms. Quick Chat only${CONFIG.features.freeChat ? ', unless you both verified for Free Chat' : ''}. Report anything rude with the flag button.`));
  return panel;
}
