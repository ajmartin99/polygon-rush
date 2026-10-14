import type { GameSession } from '../game/session';
import type { Racer } from '../game/racer';
import { skinById } from '../meta/catalog';
import type { ViewRect } from './renderer';

const FONT = 'Fredoka, system-ui, sans-serif';

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, align: CanvasTextAlign = 'left'): number {
  ctx.font = `700 ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.18);
  ctx.strokeStyle = 'rgba(16,8,48,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  return ctx.measureText(text).width;
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, filled: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  ctx.beginPath();
  ctx.moveTo(12, 21);
  ctx.bezierCurveTo(12, 21, 3, 15.5, 3, 9.2);
  ctx.bezierCurveTo(3, 4.5, 9.5, 2.5, 12, 7);
  ctx.bezierCurveTo(14.5, 2.5, 21, 4.5, 21, 9.2);
  ctx.bezierCurveTo(21, 15.5, 12, 21, 12, 21);
  ctx.closePath();
  ctx.fillStyle = filled ? '#ff4f6d' : 'rgba(255,255,255,0.18)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = filled ? '#7a0b22' : 'rgba(255,255,255,0.35)';
  ctx.stroke();
  ctx.restore();
}

function gemIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + s * 0.5, y - s * 0.45);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x + s * 0.5, y + s * 0.55);
  ctx.closePath();
  ctx.fillStyle = '#3ad7ff';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, s * 0.08);
  ctx.strokeStyle = '#0b3f66';
  ctx.stroke();
}

/** Small pill showing a timed power-up. */
function powerPill(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, label: string, color: string, frac: number): number {
  const w = h * 3.2;
  ctx.fillStyle = 'rgba(16,8,48,0.6)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(h, w * Math.max(0, Math.min(1, frac))), h, h / 2);
  ctx.fill();
  outlinedText(ctx, label, x + w / 2, y + h * 0.12, h * 0.72, '#fff', 'center');
  return w;
}

export function drawEndlessHud(ctx: CanvasRenderingContext2D, rect: ViewRect, r: Racer, best: number, dpr: number): void {
  const u = Math.min(rect.h, rect.w / 1.45) / 22; // HUD unit
  const pad = u * 1.1 + 6 * dpr;
  let x = rect.x + pad;
  const y = rect.y + pad;
  const dist = Math.floor(r.distance);
  outlinedText(ctx, `${dist.toLocaleString('en-US')} m`, x, y, u * 1.7, '#ffffff');
  if (best > 0) {
    const nb = dist > best;
    outlinedText(ctx, nb ? 'NEW BEST!' : `BEST ${best.toLocaleString('en-US')}`, x, y + u * 1.85, u * 0.75, nb ? '#ffd23f' : 'rgba(255,255,255,0.75)');
  }
  // Hearts
  const hy = y + u * 2.8;
  for (let i = 0; i < Math.max(r.maxHearts, r.hearts); i++) heart(ctx, x + i * u * 1.25, hy, u * 1.15, i < r.hearts);
  // Gems
  const gy = hy + u * 1.5;
  gemIcon(ctx, x, gy + u * 0.55, u * 0.95);
  outlinedText(ctx, String(r.gems), x + u * 1.2, gy, u * 1.05, '#ffffff');
  // Power-ups
  x = rect.x + rect.w * 0.36;
  if (r.shield) x += powerPill(ctx, x, y, u * 1.1, 'SHIELD', '#3ad7ff', r.shieldTime / 18) + u * 0.4;
  if (r.magnet > 0) powerPill(ctx, x, y, u * 1.1, 'MAGNET', '#ff5f5f', r.magnet / 9);
}

export function drawRaceHud(ctx: CanvasRenderingContext2D, rect: ViewRect, session: GameSession, me: Racer, dpr: number, label?: string, labelColor?: string): void {
  const u = Math.min(rect.h, rect.w / 1.45) / 22;
  const pad = u * 1.1 + 6 * dpr;
  const x = rect.x + pad;
  const y = rect.y + pad;
  const rank = session.rankOf(me);
  const n = session.racers.length;
  const suffix = ['th', 'st', 'nd', 'rd'][rank % 100 > 10 && rank % 100 < 14 ? 0 : rank % 10] ?? 'th';
  let lx = x;
  if (label) lx += outlinedText(ctx, label, x, y, u * 1.3, labelColor ?? '#ffd23f') + u * 0.6;
  outlinedText(ctx, `${rank}${suffix}`, lx, y, u * 1.7, rank === 1 ? '#ffd23f' : '#ffffff');
  outlinedText(ctx, `/ ${n}`, lx + u * 3.3, y + u * 0.6, u * 0.9, 'rgba(255,255,255,0.75)');

  // Track progress bar
  const bw = rect.w * 0.42;
  const bx = rect.x + (rect.w - bw) / 2;
  const by = y + u * 0.55;
  const bh = u * 0.5;
  ctx.fillStyle = 'rgba(16,8,48,0.6)';
  ctx.beginPath();
  ctx.roundRect(bx - u * 0.3, by - u * 0.3, bw + u * 0.6, bh + u * 0.6, u);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, bh / 2);
  ctx.fill();
  const total = session.finishX - me.startX;
  const prog = (rr: Racer) => Math.max(0, Math.min(1, (rr.x - rr.startX) / total));
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.roundRect(bx, by, Math.max(bh, bw * prog(me)), bh, bh / 2);
  ctx.fill();
  // Checkered flag at the end
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx + bw + u * 0.15, by - u * 0.35, u * 0.12, u * 1.2);
  for (const rr of session.racers) {
    const dx = bx + bw * prog(rr);
    const size = rr === me ? u * 0.95 : u * 0.7;
    ctx.fillStyle = skinById(rr.skin).body;
    ctx.strokeStyle = rr === me ? '#ffffff' : 'rgba(16,8,48,0.9)';
    ctx.lineWidth = Math.max(1.5, u * 0.14);
    ctx.beginPath();
    ctx.roundRect(dx - size / 2, by + bh / 2 - size / 2, size, size, size * 0.25);
    ctx.fill();
    ctx.stroke();
  }

  // Gems + item timers
  const gy = y + u * 2.3;
  gemIcon(ctx, x, gy + u * 0.5, u * 0.9);
  outlinedText(ctx, String(me.gems), x + u * 1.15, gy, u, '#ffffff');
  let px = x;
  const py = gy + u * 1.5;
  if (me.boost > 0) px += powerPill(ctx, px, py, u * 1.05, 'BOOST', '#ffd23f', me.boost / 2.2) + u * 0.4;
  if (me.shield) px += powerPill(ctx, px, py, u * 1.05, 'SHIELD', '#3ad7ff', me.shieldTime / 12) + u * 0.4;
  if (me.magnet > 0) px += powerPill(ctx, px, py, u * 1.05, 'MAGNET', '#ff5f5f', me.magnet / 6) + u * 0.4;
  if (me.snow > 0) powerPill(ctx, px, py, u * 1.05, 'BRRR!', '#bfefff', me.snow / 1.4);
}
