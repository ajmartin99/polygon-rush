import { ageOf, serverAvailable } from '../../meta/community';
import { friends, handleOf, type Friend, type Player } from '../../services/friends';
import { parseHandle } from '../../shared/handle';
import { store } from '../../state/store';
import { activityText } from '../friend-invites';
import { BaseScreen, button, confirm, titleBar } from '../components';
import { clear, h } from '../dom';
import { nav } from '../nav';
import { joinRoomByCode } from './create';
import { ui } from '../ui';

/**
 * Friends: your Name#tag, add a friend by their Name#tag, requests, and your
 * friends with who's online. Invites to a race or a build room come from the
 * room itself ("Invite friends"), and show up here too.
 */
export class PalsScreen extends BaseScreen {
  private body = h('div.grow.col.body-scroll.pals', {
    style: 'gap:0.9rem;min-height:0',
  });
  private offs: (() => void)[] = [];
  private draft = '';

  constructor() {
    super('.solid');
    this.el.append(
      titleBar('Friends', 'users', () => this.back()),
      this.body,
    );
    this.offs.push(friends.on('change', () => this.render()));
    this.render();
    friends.setFast(true);
  }

  override leave(): void {
    super.leave();
    friends.setFast(false);
    for (const off of this.offs.splice(0)) off();
  }

  override back(): boolean {
    nav.go('menu');
    return true;
  }

  private render(): void {
    const focused = document.activeElement?.classList.contains('pal-input');
    clear(this.body);
    const d = store.data;
    if (!serverAvailable()) return void this.body.append(h('p.muted', null, 'Friends need the Polygon Rush game server, which isn’t switched on in this version yet.'));
    if (!d.settings.onlineAllowed || !d.settings.friends) {
      return void this.body.append(h('div.panel', null, h('h3', null, 'Friends are switched off'), h('p.muted', null, 'A grown-up can switch them on in Settings → Parental Controls.')));
    }
    const kid = ageOf(d.profile.birthYear) < 13;
    const st = friends.state;
    const mine = friends.myHandle;

    // ---- your handle
    this.body.append(
      h(
        'div.panel.my-handle',
        null,
        h('div.lbl', null, h('span', null, 'Your friend name'), h('b', null, mine || 'Getting your #number…')),
        mine
          ? button({
              icon: 'copy',
              label: 'Copy',
              cls: 'ghost sm',
              onClick: async () => {
                try {
                  await navigator.clipboard.writeText(mine);
                  ui.toast('Copied! Share it with your friends.', 'check');
                } catch {
                  ui.toast(mine, 'users', 4000);
                }
              },
            })
          : null,
        h(
          'p.muted.small',
          null,
          kid ? 'Only share your friend name with people you know in real life.' : 'Friends add you with your name and #number. Lots of people can have the same name; the number tells you apart.',
        ),
      ),
    );

    // ---- add a friend
    const input = h<HTMLInputElement>('input.name-input.pal-input', {
      type: 'text',
      maxlength: '30',
      placeholder: 'Name#1234',
      'aria-label': 'Friend name and number',
      autocomplete: 'off',
      spellcheck: 'false',
      value: this.draft,
    });
    input.addEventListener('input', () => (this.draft = input.value));
    const add = async () => {
      const raw = input.value.trim();
      if (!parseHandle(raw)) return ui.toast('Type their name, then # and their number, like Neon Fox#0427.', 'info', 3500);
      try {
        const r = await friends.add(raw);
        this.draft = '';
        ui.toast(r.state === 'friends' ? 'You’re now friends!' : 'Friend request sent!', 'check', 2600);
      } catch (e) {
        ui.toast((e as Error).message, 'info', 3500);
      }
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && void add());
    this.body.append(
      h(
        'div.panel.col',
        { style: 'gap:0.5rem' },
        h('h3', null, 'Add a friend'),
        h(
          'div.row',
          { style: 'gap:0.5rem;align-items:center' },
          input,
          button({
            label: 'Add',
            icon: 'users',
            cls: 'mint',
            onClick: () => void add(),
          }),
        ),
      ),
    );
    if (focused) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }

    // ---- invites
    if (st.invites.length) {
      this.body.append(
        this.section(
          'Invites',
          st.invites.map((inv) =>
            this.row(inv.from, inv.kind === 'race' ? 'Invited you to race' : 'Invited you to build', true, [
              button({
                label: 'Join',
                icon: 'play',
                cls: 'mint sm',
                onClick: () =>
                  void friends
                    .dismiss(inv.id)
                    .catch(() => undefined)
                    .then(() => joinRoomByCode(inv.room)),
              }),
              button({
                icon: 'close',
                cls: 'icon ghost sm',
                aria: 'Dismiss',
                onClick: () => void friends.dismiss(inv.id).catch(() => undefined),
              }),
            ]),
          ),
        ),
      );
    }

    // ---- requests
    if (st.incoming.length) {
      this.body.append(
        this.section(
          'Friend requests',
          st.incoming.map((p) =>
            this.row(p, 'Wants to be friends', false, [
              button({
                label: 'Accept',
                icon: 'check',
                cls: 'mint sm',
                onClick: () => this.act(() => friends.respond(p.id, true), 'You’re now friends!'),
              }),
              button({
                label: 'No',
                cls: 'ghost sm',
                onClick: () => this.act(() => friends.respond(p.id, false)),
              }),
              this.blockBtn(p),
            ]),
          ),
        ),
      );
    }

    // ---- friends
    const list = [...st.friends].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    this.body.append(
      this.section(
        `Friends (${list.length})`,
        list.length
          ? list.map((f: Friend) =>
              this.row(f, activityText(f), f.online, [
                button({
                  icon: 'trash',
                  cls: 'icon ghost sm',
                  aria: `Remove ${handleOf(f)}`,
                  onClick: async () => {
                    if (await confirm('Remove friend?', `${handleOf(f)} will be taken off your friends list.`, 'Remove', 'Keep', true)) this.act(() => friends.remove(f.id));
                  },
                }),
                this.blockBtn(f),
              ]),
            )
          : [h('p.muted', null, 'No friends yet. Add someone with their Name#number above.')],
      ),
    );
    if (list.some((f) => f.online)) this.body.append(h('p.muted.small', null, 'To play together: make a room in Online or Create → Build Together, then tap Invite friends.'));

    // ---- sent
    if (st.outgoing.length) {
      this.body.append(
        this.section(
          'Sent requests',
          st.outgoing.map((p) =>
            this.row(p, 'Waiting for them to accept', false, [
              button({
                label: 'Cancel',
                cls: 'ghost sm',
                onClick: () => this.act(() => friends.remove(p.id)),
              }),
            ]),
          ),
        ),
      );
    }
    if (st.error) this.body.append(h('p.muted.small', null, st.error));
    this.body.append(
      button({
        label: 'Delete friends data',
        icon: 'trash',
        cls: 'ghost sm',
        onClick: async () => {
          if (
            !(await confirm(
              'Delete friends data?',
              'Removes your #number, friends list, requests and invites from our server. You get a new #number and start with no friends.',
              'Delete',
              'Keep',
              true,
            ))
          )
            return;
          this.act(() => friends.forget(), 'Friends data deleted.');
        },
      }),
    );
  }

  private section(title: string, rows: HTMLElement[]): HTMLElement {
    return h('div.col', { style: 'gap:0.4rem' }, h('h3', null, title), h('div.col.friend-list', null, rows));
  }

  private row(p: Player, sub: string, online: boolean, actions: HTMLElement[]): HTMLElement {
    return h('div.friend-row', null, h(`span.dot${online ? '.on' : ''}`, { 'aria-hidden': 'true' }), h('div.lbl', null, h('b', null, handleOf(p)), h('span', null, sub)), ...actions);
  }

  private blockBtn(p: Player): HTMLElement {
    return button({
      label: 'Block',
      cls: 'ghost sm',
      aria: `Block ${handleOf(p)}`,
      onClick: async () => {
        if (await confirm('Block this player?', `${handleOf(p)} won’t be able to send you requests or invites.`, 'Block', 'Cancel', true)) this.act(() => friends.block(p.id), 'Blocked.');
      },
    });
  }

  private act(fn: () => Promise<unknown>, done?: string): void {
    fn().then(
      () => done && ui.toast(done, 'check', 2400),
      (e: Error) => ui.toast(e.message, 'info', 3200),
    );
  }
}
