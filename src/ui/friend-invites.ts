import { friends, handleOf, type Friend, type Invite } from '../services/friends';
import { store } from '../state/store';
import { button } from './components';
import { h, ic } from './dom';
import { nav } from './nav';
import { joinRoomByCode } from './screens/create';
import { ui } from './ui';

const ACTIVITY: Record<NonNullable<Friend['activity']>, string> = {
  menu: 'Online',
  race: 'In an online room',
  build: 'Building',
  play: 'Playing',
};

export function activityText(f: Friend): string {
  return f.online && f.activity ? ACTIVITY[f.activity] : 'Offline';
}

/** "Neon Fox#0427 invited you to race!" with Join / Not now. */
function showInvite(inv: Invite): void {
  const who = handleOf(inv.from);
  const what = inv.kind === 'race' ? 'race' : 'build a level together';
  // Mid-run: a toast only (they can answer from the Friends screen afterwards).
  if (nav.route === null) {
    ui.toast(`${who} invited you to ${what}. Open Friends to join.`, 'users', 4000);
    return;
  }
  const m = ui.modal(
    [
      h('h2', null, inv.kind === 'race' ? 'Race invite!' : 'Build invite!'),
      h('p', null, h('b', null, who), ` invited you to ${what}.`),
      h(
        'div.row',
        { style: 'gap:0.6rem;justify-content:center;flex-wrap:wrap' },
        button({
          label: 'Not now',
          cls: 'ghost',
          onClick: () => {
            void friends.dismiss(inv.id).catch(() => undefined);
            m.close();
          },
        }),
        button({
          label: 'Join',
          icon: 'play',
          cls: 'mint',
          onClick: () => {
            m.close();
            void friends.dismiss(inv.id).catch(() => undefined);
            void joinRoomByCode(inv.room);
          },
        }),
      ),
    ],
    { showClose: true },
  );
}

export function initFriendInvites(): void {
  friends.on('invite', showInvite);
  // The parents' switches changed: tell the server (and stop or start polling).
  let last = `${store.settings.onlineAllowed}:${store.settings.friends}`;
  store.on('settings', (s) => {
    const now = `${s.onlineAllowed}:${s.friends}`;
    if (now === last) return;
    last = now;
    void friends.refresh();
  });
}

/** Pick friends to invite into the room you're in. */
export function openInvitePicker(kind: 'race' | 'build', room: string): void {
  if (!friends.available) {
    ui.toast('Friends aren’t available right now.', 'lock');
    return;
  }
  const list = h('div.col.body-scroll.friend-list');
  const sent = new Set<string>();
  const render = () => {
    list.replaceChildren();
    const all = [...friends.state.friends].sort((a, b) => Number(b.online) - Number(a.online));
    if (!all.length) {
      list.append(h('p.muted', null, 'No friends yet. Add them in Friends with their Name#number.'));
      return;
    }
    for (const f of all) {
      list.append(
        h(
          'div.friend-row',
          null,
          h(`span.dot${f.online ? '.on' : ''}`, { 'aria-hidden': 'true' }),
          h('div.lbl', null, h('b', null, handleOf(f)), h('span', null, activityText(f))),
          button({
            label: sent.has(f.id) ? 'Invited' : 'Invite',
            icon: sent.has(f.id) ? 'check' : 'mail',
            cls: sent.has(f.id) ? 'ghost sm' : 'mint sm',
            disabled: sent.has(f.id),
            onClick: async () => {
              try {
                await friends.invite(f.id, kind, room);
                sent.add(f.id);
                render();
              } catch (e) {
                ui.toast((e as Error).message, 'info', 3000);
              }
            },
          }),
        ),
      );
    }
  };
  render();
  const off = friends.on('change', render);
  void friends.sync();
  ui.modal([h('h2', null, ic('users'), ' Invite friends'), h('p.muted.small', null, 'They get a pop-up to join this room.'), list], { showClose: true, onClose: off });
}
