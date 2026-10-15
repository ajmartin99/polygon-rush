import { describe, expect, it } from 'vitest';
import { FEATURED } from '../src/meta/featured';
import { GameSession } from '../src/game/session';
import { sanitizeContent, encodeLevel, decodeLevel } from '../src/game/level';

/** A perfect CPU plays the level; returns where it got hit (if anywhere). */
export function botRun(level: Parameters<typeof sanitizeContent>[0] & object, seconds = 60) {
  const content = sanitizeContent(level)!;
  const s = new GameSession({ kind: 'custom', seed: 3, level: content, racers: [{ id: 'bot', name: 'Bot', skin: 'classic', kind: 'bot', skill: 1 }] });
  const hits: string[] = [];
  let finished = false;
  s.on('hit', ({ racer, fell }) => hits.push(`${fell ? 'fell' : 'hit'}@${racer.x.toFixed(1)} ${racer.body.mode}`));
  s.on('finish', () => (finished = true));
  s.on('death', () => hits.push('DEAD'));
  s.running = true;
  for (let i = 0; i < 120 * seconds && !finished && s.running && !s.racers[0].dead; i++) s.step();
  return { finished, hits, gems: s.racers[0].gems };
}

describe('featured levels', () => {
  for (const f of FEATURED) {
    it(`${f.id} is beatable without a bump and survives a share code`, () => {
      expect(f.pieces.length).toBeGreaterThan(30);
      const r = botRun(f);
      expect(r.hits).toEqual([]);
      expect(r.finished).toBe(true);
      expect(decodeLevel(encodeLevel(f)).pieces).toEqual(f.pieces);
    });
  }
});
