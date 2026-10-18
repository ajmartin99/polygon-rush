import { ageOf, serverAvailable } from '../meta/community';
import { checkDisplayText, NAME_MESSAGES } from '../shared/chat-filter';
import { store } from '../state/store';
import { deviceKey, friends } from './friends';
import { ServerError, serverApi } from './server';

/** Typed racer names are for players 13+ (everyone else picks a generated one). */
export function canTypeName(): boolean {
  return ageOf(store.data.profile.birthYear) >= 13;
}

/**
 * Check a typed name (13+). With the community server it is also checked
 * there (bans) and gets its #tag, so many players can share the same name.
 * Returns the cleaned name or an error message.
 */
export async function claimTypedName(input: string): Promise<{ ok: true; name: string } | { ok: false; message: string }> {
  if (!canTypeName()) return { ok: false, message: 'Typed names are for players 13 and up.' };
  const r = checkDisplayText(input, 'name');
  if (!r.ok) return { ok: false, message: NAME_MESSAGES[r.reason ?? 'empty'] };
  if (!serverAvailable()) return { ok: true, name: r.text };
  try {
    const p = store.data.profile;
    const res = await serverApi<{ name: string; tag: number }>('/api/players/register', {
      body: {
        key: deviceKey(),
        name: r.text,
        kid: false,
        friendsOff: !friends.available,
        tag: p.tag,
      },
    });
    p.tag = res.tag;
    store.commit();
    return { ok: true, name: res.name };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof ServerError ? e.message : 'Couldn’t reach the server. Try again in a moment.',
    };
  }
}
