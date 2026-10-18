import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config', async (importOriginal) => {
  const real = (await importOriginal()) as { CONFIG: Record<string, unknown> };
  return { CONFIG: { ...real.CONFIG, server: { url: 'https://community.example' } } };
});

const { ageOf, canOfferFreeChat, canUsePublicRooms, freeChatPath, freeChatReady, setServerFeatures } = await import('../src/meta/community');
const { createSave } = await import('../src/state/save');

const NOW = new Date('2026-10-14T12:00:00Z');
const born = (age: number) => NOW.getFullYear() - age - 1;

function save(age: number) {
  const s = createSave();
  s.profile.birthYear = born(age);
  return s;
}

describe('community rules', () => {
  beforeEach(() => setServerFeatures({ freeChat: true }));

  it('hides Free Chat until the server says email works', () => {
    const s = save(16);
    setServerFeatures({});
    expect(canOfferFreeChat(s, NOW)).toBe(false);
    setServerFeatures({ freeChat: true });
    expect(canOfferFreeChat(s, NOW)).toBe(true);
  });

  it('ages are conservative (birthday assumed later this year)', () => {
    expect(ageOf(2010, NOW)).toBe(15);
    expect(ageOf(null, NOW)).toBe(0);
  });

  it('under 13: Quick Chat only', () => {
    const s = save(12);
    expect(freeChatPath(s.profile.birthYear, NOW)).toBe('none');
    expect(canOfferFreeChat(s, NOW)).toBe(false);
    expect(canUsePublicRooms(s, NOW)).toBe(false);
    s.account = { ...s.account, token: 't', consent: 'parent' };
    s.settings.freeChat = true;
    expect(freeChatReady(s, NOW)).toBe(false);
  });

  it('13-15 need a parent-approved account', () => {
    const s = save(14);
    expect(freeChatPath(s.profile.birthYear, NOW)).toBe('parent');
    expect(canUsePublicRooms(s, NOW)).toBe(true);
    s.settings.freeChat = true;
    s.account = { ...s.account, token: 't', consent: 'self' };
    expect(freeChatReady(s, NOW)).toBe(false);
    s.account.consent = 'parent';
    expect(freeChatReady(s, NOW)).toBe(true);
  });

  it('16+ verify themselves; parents can switch things off', () => {
    const s = save(16);
    expect(freeChatPath(s.profile.birthYear, NOW)).toBe('self');
    s.account = { ...s.account, token: 't', consent: 'self' };
    s.settings.freeChat = true;
    expect(freeChatReady(s, NOW)).toBe(true);
    s.settings.onlineAllowed = false;
    expect(freeChatReady(s, NOW)).toBe(false);
    expect(canUsePublicRooms(s, NOW)).toBe(false);
    s.settings.onlineAllowed = true;
    s.settings.publicRooms = false;
    expect(canUsePublicRooms(s, NOW)).toBe(false);
  });
});
