import { store } from '../state/store';
import { emptyAccount } from '../state/save';
import { serverApi, ServerError } from './server';

interface PublicAccount {
  id: string;
  consent: 'self' | 'parent';
  emailHint: string;
  mutedUntil: number;
}

/**
 * Free Chat account: verify an email (the player's own at 16+, a parent's at
 * 13-15), keep the token on the device, delete it any time. The email address
 * itself is never stored on the device.
 */
export const account = {
  get signedIn(): boolean {
    return Boolean(store.data.account.token);
  },

  /** Step 1: send a code to `email` (for 13-15 this is the parent's address). */
  async start(email: string): Promise<{ consent: 'self' | 'parent'; devCode?: string }> {
    return serverApi('/api/account/start', { body: { email, birthYear: store.data.profile.birthYear } });
  },

  /** Step 2: enter the code; on success the account is saved and Free Chat switched on. */
  async verify(email: string, code: string): Promise<void> {
    const r = await serverApi<{ token: string; account: PublicAccount }>('/api/account/verify', { body: { email, code } });
    const a = store.data.account;
    store.data.account = { ...a, token: r.token, id: r.account.id, consent: r.account.consent, emailHint: r.account.emailHint, mutedUntil: r.account.mutedUntil };
    store.setSetting('freeChat', true);
    store.commit();
    void store.flush();
  },

  /** Check the account is still valid (deleted/banned → signed out). */
  async refresh(): Promise<void> {
    const token = store.data.account.token;
    if (!token) return;
    try {
      const r = await serverApi<{ account: PublicAccount }>('/api/account/me', { token });
      store.data.account.mutedUntil = r.account.mutedUntil;
      store.data.account.emailHint = r.account.emailHint;
      store.commit();
    } catch (e) {
      if (e instanceof ServerError && (e.status === 401 || e.status === 403)) this.forget();
    }
  },

  /** Delete the account on the server (and its messages), then forget it here. */
  async remove(): Promise<void> {
    const token = store.data.account.token;
    if (token) await serverApi('/api/account/delete', { token, body: {} });
    this.forget();
  },

  forget(): void {
    const keep = store.data.account;
    store.data.account = { ...emptyAccount(), rules: keep.rules, blocked: keep.blocked };
    store.setSetting('freeChat', false);
    store.commit();
    void store.flush();
  },
};
