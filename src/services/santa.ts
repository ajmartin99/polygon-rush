import { activeEvent } from '../meta/events';
import { friends } from './friends';

export interface Present {
  id: string;
  from: { id: string; name: string; tag: number };
  wrap: number;
  at: number;
}

/** Secret Santa on the game server: send today's present, see and open yours. */
export const santa = {
  /** Christmas, and friends allowed (by a parent too). */
  get available(): boolean {
    return activeEvent()?.id === 'christmas' && friends.available;
  },
  /** Who got today's present (null = not sent yet). */
  sentToday: null as string | null,

  async inbox(): Promise<Present[]> {
    const res = await friends.authed<{ presents: Present[]; sentToday: string | null }>('/api/santa/inbox', {});
    santa.sentToday = res.sentToday;
    return res.presents;
  },

  async send(id: string, wrap: number): Promise<void> {
    await friends.authed('/api/santa/send', { id, wrap });
    santa.sentToday = id;
  },

  async open(id: string): Promise<void> {
    await friends.authed('/api/santa/open', { id });
  },
};
