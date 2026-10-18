import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/preferences', () => ({ Preferences: { get: async () => ({ value: null }), set: async () => undefined, remove: async () => undefined } }));

const { store } = await import('../src/state/store');
const { createSave, migrate } = await import('../src/state/save');
const { addBan, isBanned, removeBan, roomId } = await import('../src/services/room-bans');
const { music } = await import('../src/core/music');
const { audio } = await import('../src/core/audio');

describe('room bans', () => {
  it('a stable anonymous room id per device, and a ban list that survives saving', () => {
    store.data = createSave();
    store.data.profile.nameKey = 'abcdefghijklmnopqrstuv';
    const id = roomId();
    expect(id).toMatch(/^[a-f0-9]{16}$/);
    expect(roomId()).toBe(id);
    store.data.profile.nameKey = 'zyxwvutsrqponmlkjihgfe';
    expect(roomId()).not.toBe(id);
    addBan(id, 'Grumpy Goat 4');
    addBan(id, 'Grumpy Goat 4');
    expect(store.data.roomBans).toHaveLength(1);
    expect(isBanned(id)).toBe(true);
    // Junk entries are dropped when a save loads.
    const loaded = migrate({ ...JSON.parse(JSON.stringify(store.data)), roomBans: [...store.data.roomBans, { rid: 'nope', name: 1 }] });
    expect(loaded.roomBans.map((b) => b.rid)).toEqual([id]);
    removeBan(id);
    expect(isBanned(id)).toBe(false);
  });

  it('a level’s song can’t be skipped or swapped while it plays', () => {
    const played: number[] = [];
    vi.spyOn(audio, 'playSong').mockImplementation((i: number) => void played.push(i));
    vi.spyOn(audio, 'playTrack').mockImplementation((i: number) => void played.push(i));
    vi.spyOn(audio, 'stopMusic').mockImplementation(() => undefined);
    music.level(-1, 0);
    expect(music.locked).toBe(true);
    expect(played).toHaveLength(1);
    music.skip();
    music.pick(3);
    expect(played).toHaveLength(1);
    music.stop();
    expect(music.locked).toBe(false);
  });
});
