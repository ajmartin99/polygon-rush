import { shapePoints, type ShapeMode } from '../game/shapes';
import type { SkinDef } from '../meta/catalog';

export interface CharacterPose {
  /** Rotation in radians. */
  rot: number;
  /** Squash/stretch: >1 = tall, <1 = flat. */
  squash: number;
  /** Where the eyes look, -1..1. */
  lookX: number;
  lookY: number;
  /** 0 = open, 1 = closed. */
  blink: number;
  /** Seconds, for animated skins. */
  time: number;
  /** Draw at reduced alpha (ghosts / invulnerable blink). */
  alpha: number;
}

export const DEFAULT_POSE: CharacterPose = { rot: 0, squash: 1, lookX: 0.4, lookY: 0, blink: 0, time: 0, alpha: 1 };

/**
 * Draw a player polygon centred at (x, y) with the given pixel size.
 * (Simple version; the Visuals phase adds patterns and faces.)
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  shape: ShapeMode,
  skin: SkinDef,
  pose: Partial<CharacterPose> = {},
): void {
  const p = { ...DEFAULT_POSE, ...pose };
  ctx.save();
  ctx.globalAlpha *= p.alpha;
  ctx.translate(x, y);
  ctx.rotate(p.rot);
  ctx.scale(1 / Math.sqrt(p.squash), p.squash);
  const pts = shapePoints(shape);
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * size, py * size) : ctx.moveTo(px * size, py * size)));
  ctx.closePath();
  ctx.fillStyle = skin.body;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = skin.outline;
  ctx.stroke();
  // Eyes
  const eyeR = size * 0.12;
  const ex = size * 0.06;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(ex + side * size * 0.17, -size * 0.06, eyeR, eyeR * (1 - p.blink * 0.9), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    if (p.blink < 0.5) {
      ctx.beginPath();
      ctx.arc(ex + side * size * 0.17 + p.lookX * eyeR * 0.45, -size * 0.06 + p.lookY * eyeR * 0.45, eyeR * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#160a3c';
      ctx.fill();
    }
  }
  ctx.restore();
}
