import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/session';
import { TRACKS, TRACK_BASE } from '../src/core/tracks';
import { BOSSES, bossCourse, bossHealth, bossLevel, bossReward, bossUnlocked, bossTrack } from '../src/meta/bosses';

/** A perfect bot fights the boss: hits taken and charge orbs grabbed. */
function fight(id: string) {
  const b = BOSSES.find((x) => x.id === id)!;
  const level = bossLevel(b);
  const s = new GameSession({ kind: 'custom', seed: 1, level, racers: [{ id: 'b', name: 'b', skin: 'classic', kind: 'bot', skill: 1 }] });
  s.running = true;
  const r = s.racers[0];
  let orbs = 0;
  s.on('gem', ({ value }) => (orbs += value > 1 ? 1 : 0));
  while (!r.finished && !r.dead && s.time < 400) s.step();
  return { r, orbs, health: bossHealth(level) };
}

describe('Boss Battles', () => {
  for (const b of BOSSES) {
    it(`${b.name}: survivable, and a perfect run can drain its health`, () => {
      const { r, orbs, health } = fight(b.id);
      expect(r.hits).toBe(0);
      expect(r.finished).toBe(true);
      expect(health.orbs).toBeGreaterThan(10);
      expect(orbs).toBeGreaterThanOrEqual(health.hp);
    });
  }

  it('each fight is the same every time, on its own song, ending with it', () => {
    for (const b of BOSSES) {
      expect(JSON.stringify(bossCourse(b))).toBe(JSON.stringify(bossCourse(b)));
      const t = TRACKS[bossTrack(b) - TRACK_BASE];
      expect(t.file).toBe(b.song);
      expect(bossCourse(b).music).toBe(bossTrack(b));
    }
  });

  it('bosses unlock in order; the first win pays the big reward', () => {
    const [a, c] = BOSSES;
    expect(bossUnlocked({}, a)).toBe(true);
    expect(bossUnlocked({}, c)).toBe(false);
    expect(bossUnlocked({ [a.id]: { wins: 1, best: 1 } }, c)).toBe(true);
    expect(bossReward({}, a)).toBe(a.reward);
    expect(bossReward({ [a.id]: { wins: 2, best: 1 } }, a)).toBe(a.repeat);
  });
});
