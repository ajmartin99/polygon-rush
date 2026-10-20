import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/preferences', () => {
  const mem = new Map<string, string>();
  return {
    Preferences: {
      get: async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null }),
      set: async ({ key, value }: { key: string; value: string }) => void mem.set(key, value),
      remove: async ({ key }: { key: string }) => void mem.delete(key),
    },
  };
});

const { makeBackup, restoreBackup, BackupError } = await import('../src/services/backup');
const { store } = await import('../src/state/store');
const { createSave, migrate, MAX_GEMS } = await import('../src/state/save');

/** Decode a code's JSON, apply `edit`, and re-encode it the way someone editing it by hand would. */
async function tamper(code: string, edit: (data: any) => void): Promise<string> {
  const body = code.slice('PRB2.'.length, code.lastIndexOf('.'));
  const b64 = body.slice(1).replace(/-/g, '+').replace(/_/g, '/');
  let bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  if (body[0] === 'z') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const data = JSON.parse(new TextDecoder().decode(bytes));
  edit(data);
  const json = new TextEncoder().encode(JSON.stringify(data));
  const out = btoa(String.fromCharCode(...json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `PRB2.j${out}.${code.slice(code.lastIndexOf('.') + 1)}`;
}

describe('backup codes', () => {
  beforeEach(() => {
    store.data = createSave();
  });

  it('round-trips progress to a new phone', async () => {
    store.data.gems = 4321;
    store.data.skins.owned.push('bubblegum');
    const code = await makeBackup();
    expect(code.startsWith('PRB2.')).toBe(true);
    store.data = createSave();
    await restoreBackup(code);
    expect(store.data.gems).toBe(4321);
    expect(store.data.skins.owned).toContain('bubblegum');
  });

  it('carries profile add-ons (they can be bought with gems, which Google Play can’t restore)', async () => {
    store.data.purchases.spotlight = true;
    store.data.purchases.noAds = true;
    const code = await makeBackup();
    store.data = createSave();
    await restoreBackup(code);
    expect(store.data.purchases.spotlight).toBe(true);
    expect(store.data.purchases.builder).toBe(false);
    expect(store.data.purchases.noAds).toBe(false);
  });

  it('refuses an edited code (decode, change gems, encode)', async () => {
    store.data.gems = 100;
    const code = await makeBackup();
    const bad = await tamper(code, (d) => (d.save.gems = 9_999_999));
    store.data = createSave();
    await expect(restoreBackup(bad)).rejects.toBeInstanceOf(BackupError);
    await expect(restoreBackup(code.slice(0, -3))).rejects.toBeInstanceOf(BackupError);
    expect(store.data.gems).toBe(createSave().gems);
  });

  it('refuses old unsigned codes and junk', async () => {
    await expect(restoreBackup('PRB1.zH4sIAAAAAAAAA')).rejects.toThrow(/older version/);
    await expect(restoreBackup('hello')).rejects.toBeInstanceOf(BackupError);
  });

  it('pack-only skins need the purchase on this device', async () => {
    // A save that claims Legend Pack skins without the purchase loses them.
    const s = createSave();
    s.skins.owned.push('rainbow', 'galaxy', 'golden');
    s.skins.equipped = 'galaxy';
    s.trails.owned.push('comet');
    const clean = migrate(JSON.parse(JSON.stringify(s)));
    expect(clean.skins.owned).not.toContain('rainbow');
    expect(clean.skins.owned).not.toContain('golden');
    expect(clean.trails.owned).not.toContain('comet');
    expect(clean.skins.equipped).toBe('classic');
    // With the purchase (restored from Google Play) they stay.
    s.purchases.legend = true;
    s.purchases.starter = true;
    const kept = migrate(JSON.parse(JSON.stringify(s)));
    expect(kept.skins.owned).toEqual(expect.arrayContaining(['rainbow', 'galaxy', 'golden']));
    expect(kept.skins.equipped).toBe('galaxy');
  });

  it('cleans nonsense values instead of crashing', () => {
    const s = migrate({ gems: 1e15, skins: { owned: [{ x: 1 }, 'classic', 'classic'], equipped: 7 }, secrets: { found: [1, 1, 99, 'x'] } });
    expect(s.gems).toBe(MAX_GEMS);
    expect(s.skins.owned).toEqual(['classic']);
    expect(s.secrets.found).toEqual([1]);
    expect(migrate({ gems: 'lots' }).gems).toBe(createSave().gems);
  });
});
