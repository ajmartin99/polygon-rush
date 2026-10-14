import { shapePoints, type ShapeMode } from '../game/shapes';
import type { SkinDef } from '../meta/catalog';
import { darken, lighten, rgba } from './biomes';

export interface CharacterPose {
  /** Body rotation in radians (screen space). */
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
  /** Overall opacity. */
  alpha: number;
  /** Face rotation; defaults to body rotation. Upright faces read better on rolling shapes. */
  faceRot?: number;
  /** 0..1 — shows an "ouch" face. */
  hurt?: number;
}

export const DEFAULT_POSE: CharacterPose = { rot: 0, squash: 1, lookX: 0.4, lookY: 0, blink: 0, time: 0, alpha: 1 };

/** Trace the shape outline with softly rounded corners. */
function tracePath(ctx: CanvasRenderingContext2D, shape: ShapeMode, size: number): void {
  const pts = shapePoints(shape).map(([x, y]) => [x * size, y * size] as const);
  const r = size * (shape === 'square' ? 0.14 : shape === 'triangle' ? 0.1 : 0.08);
  ctx.beginPath();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const d0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const a = [p1[0] + ((p0[0] - p1[0]) / d0) * r, p1[1] + ((p0[1] - p1[1]) / d0) * r];
    const b = [p1[0] + ((p2[0] - p1[0]) / d2) * r, p1[1] + ((p2[1] - p1[1]) / d2) * r];
    if (i === 0) ctx.moveTo(a[0], a[1]);
    else ctx.lineTo(a[0], a[1]);
    ctx.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
  }
  ctx.closePath();
}

const RAINBOW = ['#ff5f5f', '#ff9f1c', '#ffd23f', '#3ee6b0', '#4dc9ff', '#9b6bff'];

/** Fill the (already clipped) body area with the skin pattern. */
function fillPattern(ctx: CanvasRenderingContext2D, skin: SkinDef, s: number, t: number): void {
  const h = s * 0.7;
  const body = skin.body;
  const acc = skin.accent;
  // Base: soft vertical shading.
  const base = ctx.createLinearGradient(0, -h, 0, h);
  base.addColorStop(0, lighten(body, 0.22));
  base.addColorStop(1, darken(body, 0.08));
  ctx.fillStyle = base;
  ctx.fillRect(-h, -h, h * 2, h * 2);
  switch (skin.pattern) {
    case 'stripes': {
      ctx.fillStyle = acc;
      const w = s * 0.16;
      ctx.save();
      ctx.rotate(-0.6);
      for (let x = -s * 1.4; x < s * 1.4; x += w * 2) ctx.fillRect(x, -s * 1.4, w, s * 2.8);
      ctx.restore();
      break;
    }
    case 'dots': {
      ctx.fillStyle = acc;
      const step = s * 0.3;
      for (let y = -h; y < h; y += step) {
        for (let x = -h + ((Math.round(y / step) % 2) * step) / 2; x < h; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, s * 0.075, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'checker': {
      ctx.fillStyle = acc;
      const c = s * 0.25;
      for (let y = -2; y < 2; y++) for (let x = -2; x < 2; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * c, y * c, c, c);
      break;
    }
    case 'gradient': {
      const g = ctx.createLinearGradient(-h, -h, h, h);
      g.addColorStop(0, body);
      g.addColorStop(1, acc);
      ctx.fillStyle = g;
      ctx.fillRect(-h, -h, h * 2, h * 2);
      break;
    }
    case 'split': {
      ctx.fillStyle = acc;
      ctx.fillRect(-h, s * 0.18, h * 2, h);
      ctx.fillStyle = lighten(acc, 0.5);
      ctx.fillRect(-h, s * 0.18, h * 2, s * 0.06);
      ctx.fillStyle = '#2b1a12';
      for (const [x, y] of [
        [-0.18, -0.12],
        [0.05, -0.2],
        [0.2, 0.0],
        [-0.05, 0.05],
      ]) {
        ctx.beginPath();
        ctx.ellipse(x * s, y * s, s * 0.025, s * 0.04, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'scales': {
      ctx.strokeStyle = rgba(acc, 0.9);
      ctx.lineWidth = Math.max(1, s * 0.035);
      const r = s * 0.12;
      for (let y = -h; y < h + r; y += r) {
        for (let x = -h + ((Math.round(y / r) % 2) * r) / 1; x < h + r; x += r * 2) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI);
          ctx.stroke();
        }
      }
      break;
    }
    case 'rainbow': {
      const band = s * 0.18;
      const off = (t * s * 0.6) % (band * RAINBOW.length);
      for (let i = -RAINBOW.length; i < RAINBOW.length * 2; i++) {
        ctx.fillStyle = RAINBOW[((i % RAINBOW.length) + RAINBOW.length) % RAINBOW.length];
        ctx.fillRect(-h, -h + i * band + off - band * RAINBOW.length, h * 2, band + 0.5);
      }
      break;
    }
    case 'galaxy': {
      const g = ctx.createRadialGradient(-s * 0.15, -s * 0.1, 0, 0, 0, h);
      g.addColorStop(0, rgba(acc, 0.85));
      g.addColorStop(0.5, rgba('#4a2bd6', 0.6));
      g.addColorStop(1, rgba(body, 1));
      ctx.fillStyle = g;
      ctx.fillRect(-h, -h, h * 2, h * 2);
      for (let i = 0; i < 9; i++) {
        const sx = Math.sin(i * 12.9898) * h * 0.8;
        const sy = Math.cos(i * 78.233) * h * 0.8;
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i);
        ctx.fillStyle = `rgba(255,255,255,${0.4 + tw * 0.6})`;
        ctx.fillRect(sx, sy, s * 0.04, s * 0.04);
      }
      break;
    }
    case 'gold': {
      const g = ctx.createLinearGradient(-h, -h, h, h);
      g.addColorStop(0, '#fff3a8');
      g.addColorStop(0.45, body);
      g.addColorStop(1, '#c98a00');
      ctx.fillStyle = g;
      ctx.fillRect(-h, -h, h * 2, h * 2);
      const sweep = ((t * 0.9) % 2) - 1;
      ctx.save();
      ctx.rotate(-0.7);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(sweep * s * 1.4 - s * 0.08, -s, s * 0.16, s * 2);
      ctx.restore();
      break;
    }
    case 'neon': {
      ctx.fillStyle = body;
      ctx.fillRect(-h, -h, h * 2, h * 2);
      ctx.strokeStyle = rgba(acc, 0.35);
      ctx.lineWidth = s * 0.03;
      for (let y = -h; y < h; y += s * 0.16) {
        ctx.beginPath();
        ctx.moveTo(-h, y + ((t * s * 0.3) % (s * 0.16)));
        ctx.lineTo(h, y + ((t * s * 0.3) % (s * 0.16)));
        ctx.stroke();
      }
      break;
    }
    case 'ice': {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.moveTo(-h, -s * 0.1);
      ctx.lineTo(-s * 0.1, -h);
      ctx.lineTo(s * 0.05, -h);
      ctx.lineTo(-h, s * 0.05);
      ctx.fill();
      ctx.fillStyle = rgba(acc, 0.5);
      ctx.beginPath();
      ctx.moveTo(h, s * 0.1);
      ctx.lineTo(s * 0.1, h);
      ctx.lineTo(h, h);
      ctx.fill();
      break;
    }
    case 'lava': {
      for (let i = 0; i < 5; i++) {
        const bx = Math.sin(t * 0.9 + i * 2.1) * s * 0.3;
        const by = Math.cos(t * 0.7 + i * 1.3) * s * 0.3;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, s * 0.22);
        g.addColorStop(0, rgba(acc, 0.95));
        g.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = g;
        ctx.fillRect(bx - s * 0.22, by - s * 0.22, s * 0.44, s * 0.44);
      }
      break;
    }
    default:
      break;
  }
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: CharacterPose, pupilColor = '#160a3c'): void {
  const open = Math.max(0.08, 1 - p.blink);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 1.12 * open, 0, 0, Math.PI * 2);
  ctx.fill();
  if (open < 0.3) return;
  const px = x + p.lookX * r * 0.38;
  const py = y + p.lookY * r * 0.38;
  ctx.fillStyle = pupilColor;
  ctx.beginPath();
  ctx.ellipse(px, py, r * 0.56, r * 0.62 * open, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px - r * 0.2, py - r * 0.22, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function happyEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.42;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y + r * 0.35, r * 0.75, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

function mouth(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, open = false): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, w * 0.28);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (open) {
    ctx.arc(x, y - w * 0.2, w * 0.7, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff7a9a';
    ctx.beginPath();
    ctx.arc(x, y + w * 0.25, w * 0.32, 0, Math.PI);
    ctx.fill();
  } else {
    ctx.arc(x, y - w * 0.35, w * 0.6, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
}

/** Faces sit slightly forward (toward travel direction) for a lively look. */
function drawFace(ctx: CanvasRenderingContext2D, skin: SkinDef, s: number, p: CharacterPose, shape: ShapeMode): void {
  const ink = darken(skin.outline, 0.1);
  const fx = s * (shape === 'triangle' ? -0.02 : 0.08);
  const fy = s * (shape === 'triangle' ? 0 : -0.04);
  const gap = s * (shape === 'triangle' ? 0.15 : 0.17);
  const r = s * (shape === 'triangle' ? 0.1 : 0.12);
  const hurt = (p.hurt ?? 0) > 0.05;
  if (hurt) {
    // >_< face
    ctx.strokeStyle = ink;
    ctx.lineWidth = r * 0.42;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const ex = fx + side * gap;
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.6 * side, fy - r * 0.6);
      ctx.lineTo(ex + r * 0.5 * side, fy);
      ctx.lineTo(ex - r * 0.6 * side, fy + r * 0.6);
      ctx.stroke();
    }
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(fx, fy + s * 0.2, r * 0.45, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  switch (skin.face) {
    case 'happy':
      happyEye(ctx, fx - gap, fy, r, ink);
      happyEye(ctx, fx + gap, fy, r, ink);
      mouth(ctx, fx, fy + s * 0.2, r, ink, true);
      break;
    case 'cool': {
      ctx.fillStyle = '#16121f';
      ctx.beginPath();
      ctx.roundRect(fx - gap - r * 1.25, fy - r * 0.9, r * 2.4, r * 1.6, r * 0.5);
      ctx.roundRect(fx + gap - r * 1.15, fy - r * 0.9, r * 2.4, r * 1.6, r * 0.5);
      ctx.fill();
      ctx.fillRect(fx - gap, fy - r * 0.75, gap * 2, r * 0.35);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(fx - gap - r * 0.8, fy - r * 0.55, r * 0.5, r * 0.25);
      ctx.fillRect(fx + gap - r * 0.7, fy - r * 0.55, r * 0.5, r * 0.25);
      ctx.strokeStyle = ink;
      ctx.lineWidth = r * 0.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fx - r * 0.6, fy + s * 0.2);
      ctx.quadraticCurveTo(fx + r * 0.3, fy + s * 0.25, fx + r * 0.9, fy + s * 0.14);
      ctx.stroke();
      break;
    }
    case 'cat':
      eye(ctx, fx - gap, fy, r, p);
      eye(ctx, fx + gap, fy, r, p);
      ctx.strokeStyle = ink;
      ctx.lineWidth = r * 0.25;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fx - r * 0.7, fy + s * 0.17);
      ctx.quadraticCurveTo(fx - r * 0.35, fy + s * 0.24, fx, fy + s * 0.17);
      ctx.quadraticCurveTo(fx + r * 0.35, fy + s * 0.24, fx + r * 0.7, fy + s * 0.17);
      ctx.stroke();
      ctx.lineWidth = r * 0.15;
      for (const side of [-1, 1]) {
        for (const dy of [-0.04, 0.03]) {
          ctx.beginPath();
          ctx.moveTo(fx + side * s * 0.2, fy + s * (0.13 + dy));
          ctx.lineTo(fx + side * s * 0.42, fy + s * (0.1 + dy * 1.6));
          ctx.stroke();
        }
      }
      break;
    case 'robot': {
      ctx.fillStyle = '#1b2233';
      ctx.beginPath();
      ctx.roundRect(fx - gap - r * 1.3, fy - r * 1.0, gap * 2 + r * 2.6, r * 2.0, r * 0.7);
      ctx.fill();
      const glow = skin.accent === '#7d8aa8' ? '#3ad7ff' : skin.accent;
      ctx.fillStyle = glow;
      const blinkH = p.blink > 0.5 ? r * 0.15 : r * 0.7;
      ctx.fillRect(fx - gap - r * 0.45 + p.lookX * r * 0.3, fy - blinkH / 2, r * 0.9, blinkH);
      ctx.fillRect(fx + gap - r * 0.45 + p.lookX * r * 0.3, fy - blinkH / 2, r * 0.9, blinkH);
      ctx.fillStyle = ink;
      ctx.fillRect(fx - r * 0.8, fy + s * 0.18, r * 1.6, r * 0.25);
      break;
    }
    case 'star':
      star(ctx, fx - gap, fy, r * 1.15, '#ffd23f');
      star(ctx, fx + gap, fy, r * 1.15, '#ffd23f');
      mouth(ctx, fx, fy + s * 0.2, r, ink, true);
      break;
    case 'sleepy':
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(fx + side * gap, fy + r * 0.25, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#160a3c';
        ctx.beginPath();
        ctx.arc(fx + side * gap + p.lookX * r * 0.3, fy + r * 0.4, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.lineWidth = r * 0.3;
        ctx.beginPath();
        ctx.moveTo(fx + side * gap - r * 1.05, fy + r * 0.1);
        ctx.lineTo(fx + side * gap + r * 1.05, fy + r * 0.1);
        ctx.stroke();
      }
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(fx, fy + s * 0.2, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'wink':
      happyEye(ctx, fx - gap, fy, r, ink);
      eye(ctx, fx + gap, fy, r, p);
      mouth(ctx, fx, fy + s * 0.2, r, ink);
      break;
    case 'dino':
      eye(ctx, fx - gap, fy, r, p);
      eye(ctx, fx + gap, fy, r, p);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(fx, fy + s * 0.13, r * 0.95, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (const tx of [-0.5, 0, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(fx + tx * r - r * 0.18, fy + s * 0.15);
        ctx.lineTo(fx + tx * r + r * 0.18, fy + s * 0.15);
        ctx.lineTo(fx + tx * r, fy + s * 0.15 + r * 0.35);
        ctx.fill();
      }
      break;
    case 'cute':
    default:
      eye(ctx, fx - gap, fy, r, p);
      eye(ctx, fx + gap, fy, r, p);
      mouth(ctx, fx, fy + s * 0.2, r * 0.8, ink);
      // Rosy cheeks
      ctx.fillStyle = 'rgba(255,110,150,0.35)';
      ctx.beginPath();
      ctx.ellipse(fx - gap - r * 0.6, fy + s * 0.15, r * 0.5, r * 0.3, 0, 0, Math.PI * 2);
      ctx.ellipse(fx + gap + r * 0.6, fy + s * 0.15, r * 0.5, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

/** Decorations that stick out of the body (ears, spikes, antenna). */
function drawExtras(ctx: CanvasRenderingContext2D, skin: SkinDef, s: number, shape: ShapeMode, behind: boolean): void {
  if (shape === 'triangle') return;
  const top = shape === 'hexagon' ? -0.5 * s : shape === 'diamond' ? -0.48 * s : -0.5 * s;
  if (skin.face === 'cat' && behind) {
    ctx.fillStyle = skin.body;
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.lineJoin = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.38, top + s * 0.12);
      ctx.lineTo(side * s * 0.3, top - s * 0.22);
      ctx.lineTo(side * s * 0.08, top + s * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (skin.face === 'dino' && behind) {
    ctx.fillStyle = skin.accent;
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = Math.max(1.2, s * 0.05);
    for (const sx of [-0.25, 0, 0.25]) {
      ctx.beginPath();
      ctx.moveTo(sx * s - s * 0.1, top + s * 0.06);
      ctx.lineTo(sx * s, top - s * 0.16);
      ctx.lineTo(sx * s + s * 0.1, top + s * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (skin.face === 'robot' && behind) {
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = Math.max(1.2, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(0, top - s * 0.18);
    ctx.stroke();
    ctx.fillStyle = '#ff5f5f';
    ctx.beginPath();
    ctx.arc(0, top - s * 0.2, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw a player polygon centred at (x, y) with the given pixel size.
 * Shared by the game renderer, menus, shop thumbnails and store art.
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
  const s = size;
  ctx.save();
  ctx.globalAlpha *= p.alpha;
  ctx.translate(x, y);
  ctx.scale(1 / Math.sqrt(p.squash), p.squash);

  ctx.save();
  ctx.rotate(p.rot);
  drawExtras(ctx, skin, s, shape, true);

  // Neon skins glow (two soft strokes instead of expensive shadowBlur).
  if (skin.pattern === 'neon') {
    tracePath(ctx, shape, s);
    ctx.strokeStyle = rgba(skin.accent, 0.25);
    ctx.lineWidth = s * 0.3;
    ctx.stroke();
    ctx.strokeStyle = rgba(skin.accent, 0.45);
    ctx.lineWidth = s * 0.17;
    ctx.stroke();
  }

  tracePath(ctx, shape, s);
  ctx.save();
  ctx.clip();
  fillPattern(ctx, skin, s, p.time);
  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.18, -s * 0.24, s * 0.22, s * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // Inner shadow at the bottom
  const sh = ctx.createLinearGradient(0, s * 0.1, 0, s * 0.6);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = sh;
  ctx.fillRect(-s, s * 0.1, s * 2, s);
  ctx.restore();

  tracePath(ctx, shape, s);
  ctx.lineWidth = Math.max(1.5, s * 0.075);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = skin.outline;
  ctx.stroke();
  ctx.restore();

  ctx.rotate(p.faceRot ?? p.rot);
  drawFace(ctx, skin, s, p, shape);
  ctx.restore();
}

/** A static trail sample for shop previews. */
export function drawTrailPreview(ctx: CanvasRenderingContext2D, style: string, colors: string[], x: number, y: number, size: number, t: number): void {
  if (style === 'none' || !colors.length) return;
  for (let i = 1; i <= 7; i++) {
    const px = x - i * size * 0.32;
    const py = y + Math.sin(t * 6 + i * 0.9) * size * 0.08;
    const a = 1 - i / 8;
    const c = colors[i % colors.length];
    ctx.save();
    ctx.globalAlpha *= a;
    drawParticleShape(ctx, style, px, py, size * (0.16 - i * 0.008), c, t * 3 + i);
    ctx.restore();
  }
}

/** Shared glyphs for trail particles. */
export function drawParticleShape(ctx: CanvasRenderingContext2D, style: string, x: number, y: number, r: number, color: string, rot: number): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (style) {
    case 'lines':
      ctx.fillRect(x - r * 2.5, y - r * 0.18, r * 5, r * 0.36);
      break;
    case 'bubbles':
      ctx.lineWidth = Math.max(1, r * 0.25);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x - r * 0.4, y - r * 0.45, r * 0.3, r * 0.3);
      break;
    case 'hearts':
      ctx.beginPath();
      ctx.moveTo(x, y + r * 0.8);
      ctx.bezierCurveTo(x - r * 1.3, y - r * 0.2, x - r * 0.5, y - r * 1.1, x, y - r * 0.35);
      ctx.bezierCurveTo(x + r * 0.5, y - r * 1.1, x + r * 1.3, y - r * 0.2, x, y + r * 0.8);
      ctx.fill();
      break;
    case 'stars':
    case 'sparkle':
      star(ctx, x, y, r * (style === 'sparkle' ? 0.9 : 1.1), color);
      break;
    case 'notes':
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.5, r * 0.55, r * 0.4, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + r * 0.35, y - r * 0.9, r * 0.2, r * 1.4);
      ctx.fillRect(x + r * 0.35, y - r * 0.9, r * 0.7, r * 0.2);
      break;
    case 'pixels':
      ctx.fillRect(x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2);
      break;
    case 'confetti':
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillRect(-r * 0.8, -r * 0.35, r * 1.6, r * 0.7);
      ctx.restore();
      break;
    case 'rainbow':
    case 'comet':
    default:
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}
