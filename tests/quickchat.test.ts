import { describe, expect, it } from 'vitest';
import { PHRASE_PACKS, QUICK_LINES, packLines, quickLine, quickLinesFor } from '../src/meta/quickchat';
import { filterChat } from '../src/shared/chat-filter';

describe('Quick Chat phrase packs', () => {
  it('keeps the original phrases at their indexes (they are the wire format)', () => {
    expect(QUICK_LINES[0].text).toBe('Hi!');
    expect(QUICK_LINES[30].text).toBe('😎');
    expect(QUICK_LINES.slice(0, 31).every((l) => !l.pack)).toBe(true);
  });

  it('only offers pack phrases you own, but anyone can read them', () => {
    const free = quickLinesFor('race');
    const withSlang = quickLinesFor('race', ['slang']);
    expect(free.some(({ line }) => line.pack)).toBe(false);
    expect(withSlang.length).toBeGreaterThan(free.length);
    expect(withSlang.filter(({ line }) => line.pack).every(({ line }) => line.pack === 'slang')).toBe(true);
    const n = QUICK_LINES.findIndex((l) => l.text === 'No cap!');
    expect(quickLine(n)?.text).toBe('No cap!');
  });

  it('every pack has phrases and every phrase passes the chat filter', () => {
    for (const p of PHRASE_PACKS) expect(packLines(p.id).length).toBeGreaterThanOrEqual(5);
    for (const l of QUICK_LINES) {
      expect(l.pack === undefined || PHRASE_PACKS.some((p) => p.id === l.pack)).toBe(true);
      if (!l.emote) expect(filterChat(l.text), l.text).toMatchObject({ ok: true, text: l.text });
    }
  });
});
