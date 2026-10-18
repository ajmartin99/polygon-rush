import type { LevelContent } from '../game/level';
import { BIOMES } from '../render/biomes';

const MINI: Record<string, string> = {
  block: '#c9b8ff',
  platform: '#a58cff',
  spike: '#ff4f6d',
  saw: '#ff7a3d',
  gem: '#3ad7ff',
  pad: '#ffd23f',
  orb: '#ffe066',
  portal: '#3ee6b0',
  pickup: '#ff9ad5',
  pit: '#0b0520',
};

/** A tiny overview strip of a level for its card. */
export function thumb(level: LevelContent): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 220;
  c.height = 56;
  const ctx = c.getContext('2d')!;
  const pal = BIOMES[level.theme % BIOMES.length];
  const g = ctx.createLinearGradient(0, 0, 0, 56);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(1, pal.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 220, 56);
  const cell = 220 / (level.length + 4);
  const row = 44 / 9;
  ctx.fillStyle = pal.ground;
  ctx.fillRect(0, 46, 220, 10);
  for (const p of level.pieces) {
    ctx.fillStyle = MINI[p.t];
    const x = (p.x + 2) * cell;
    if (p.t === 'pit') ctx.fillRect(x, 46, Math.max(1, cell), 10);
    else if (p.t === 'portal') ctx.fillRect(x, 4, Math.max(1.5, cell), 42);
    else ctx.fillRect(x, 46 - (p.y + 1) * row, Math.max(1.5, cell), row);
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect((level.length + 2) * cell - 1, 2, 2, 52);
  return c;
}
