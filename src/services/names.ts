import { ageOf, serverAvailable } from '../meta/community';
import { isGeneratedName, randomName } from '../meta/names';
import { checkDisplayText, NAME_MESSAGES } from '../shared/chat-filter';
import { store } from '../state/store';
import { ServerError, serverApi } from './server';

/** Typed racer names are for players 13+ (everyone else picks a generated one). */
export function canTypeName(): boolean {
  return ageOf(store.data.profile.birthYear) >= 13;
}

function deviceKey(): string {
  let k = store.data.profile.nameKey;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(k)) {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    k = Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'[b & 63]).join('');
    store.data.profile.nameKey = k;
    store.commit();
  }
  return k;
}

/**
 * Check and (when the community server is available) claim a typed name so
 * nobody else can use it. Returns the cleaned name or an error message.
 */
export async function claimTypedName(input: string): Promise<{ ok: true; name: string } | { ok: false; message: string }> {
  if (!canTypeName()) return { ok: false, message: 'Typed names are for players 13 and up.' };
  const r = checkDisplayText(input, 'name');
  if (!r.ok) return { ok: false, message: NAME_MESSAGES[r.reason ?? 'empty'] };
  if (!serverAvailable()) return { ok: true, name: r.text };
  try {
    const res = await serverApi<{ name: string }>('/api/names/claim', { body: { name: r.text, key: deviceKey() } });
    return { ok: true, name: res.name };
  } catch (e) {
    return { ok: false, message: e instanceof ServerError ? e.message : 'Couldn’t reach the server. Try again in a moment.' };
  }
}

/**
 * On start: a typed name that a moderator banned (or that is no longer
 * allowed for this player) goes back to a generated one.
 */
export async function verifyOwnName(): Promise<string | null> {
  const name = store.data.profile.name;
  if (!name || isGeneratedName(name)) return null;
  const reset = (why: string) => {
    store.data.profile.name = randomName();
    store.commit();
    return why;
  };
  if (!canTypeName() || !checkDisplayText(name, 'name').ok) return reset('Your racer name was changed to a generated one.');
  if (!serverAvailable()) return null;
  try {
    const st = await serverApi<{ ok: boolean; reason?: string }>('/api/names/status', { body: { name, key: deviceKey() } });
    if (st.ok) return null;
    if (st.reason === 'unclaimed') {
      // Picked while offline: claim it now.
      const c = await claimTypedName(name);
      return c.ok ? null : reset(`Your racer name was reset: ${c.message}`);
    }
    return reset(st.reason === 'banned' ? 'Your racer name was reset by our safety team. Pick a new one!' : 'Someone else has that name now, so you got a new one.');
  } catch {
    return null; // offline: try again next time
  }
}
