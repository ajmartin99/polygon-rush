import { shapePoints, type ShapeMode } from '../game/shapes';
import type { Silhouette, SkinDef } from '../meta/catalog';
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

/** Body outline for silhouette skins (centred, about the same size as the shapes). */
function traceSilhouette(ctx: CanvasRenderingContext2D, sil: Silhouette, s: number): void {
  ctx.beginPath();
  switch (sil) {
    case 'ghost': {
      // Dome on top, three wavy scallops at the bottom.
      const w = s * 0.5;
      ctx.moveTo(-w, s * 0.42);
      ctx.lineTo(-w, -s * 0.05);
      ctx.arc(0, -s * 0.05, w, Math.PI, 0);
      ctx.lineTo(w, s * 0.42);
      const n = 3;
      for (let i = 0; i < n; i++) {
        const x0 = w - (i * 2 * w) / n;
        const x1 = w - ((i + 1) * 2 * w) / n;
        ctx.quadraticCurveTo((x0 + x1) / 2, s * (i % 2 ? 0.66 : 0.3), x1, s * 0.42);
      }
      break;
    }
    case 'pumpkin': {
      // Wide, lobed and a little squat.
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2;
        const r = s * 0.5 * (1 - 0.07 * Math.abs(Math.cos(a * 2.5)));
        const x = Math.cos(a) * r * 1.1;
        const y = Math.sin(a) * r * 0.92 + s * 0.03;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      break;
    }
    case 'tombstone': {
      const w = s * 0.44;
      ctx.moveTo(-w, s * 0.5);
      ctx.lineTo(-w, -s * 0.12);
      ctx.arc(0, -s * 0.12, w, Math.PI, 0);
      ctx.lineTo(w, s * 0.5);
      break;
    }
    case 'skull': {
      // Round cranium, narrower jaw.
      ctx.arc(0, -s * 0.08, s * 0.47, Math.PI * 0.8, Math.PI * 0.2);
      ctx.lineTo(s * 0.27, s * 0.5);
      ctx.quadraticCurveTo(0, s * 0.58, -s * 0.27, s * 0.5);
      break;
    }
    case 'candycorn': {
      // A rounded triangle pointing up.
      ctx.moveTo(0, -s * 0.58);
      ctx.quadraticCurveTo(s * 0.12, -s * 0.5, s * 0.5, s * 0.36);
      ctx.quadraticCurveTo(s * 0.56, s * 0.5, s * 0.36, s * 0.5);
      ctx.lineTo(-s * 0.36, s * 0.5);
      ctx.quadraticCurveTo(-s * 0.56, s * 0.5, -s * 0.5, s * 0.36);
      ctx.quadraticCurveTo(-s * 0.12, -s * 0.5, 0, -s * 0.58);
      break;
    }
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
    case 'rip': {
      // Engraved R.I.P. and a crack.
      ctx.fillStyle = rgba(acc, 0.9);
      ctx.font = `800 ${s * 0.2}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('RIP', 0, s * 0.42);
      ctx.strokeStyle = rgba(acc, 0.8);
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath();
      ctx.moveTo(s * 0.3, -s * 0.45);
      ctx.lineTo(s * 0.2, -s * 0.3);
      ctx.lineTo(s * 0.28, -s * 0.2);
      ctx.lineTo(s * 0.18, -s * 0.05);
      ctx.stroke();
      break;
    }
    case 'cornstripe': {
      // White tip, orange middle, yellow base.
      ctx.fillStyle = '#ff8a1f';
      ctx.fillRect(-h, -s * 0.15, h * 2, s * 0.32);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-h, s * 0.17, h * 2, h);
      break;
    }
    case 'pumpkin': {
      // Pumpkin ribs.
      ctx.strokeStyle = rgba(acc, 0.85);
      ctx.lineWidth = Math.max(1, s * 0.05);
      for (const k of [-0.5, -0.2, 0.2, 0.5]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.abs(k) * s * 0.85, s * 0.62, 0, k < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, k < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
        ctx.stroke();
      }
      break;
    }
    case 'wisp': {
      // Soft drifting ghost glow.
      for (let i = 0; i < 3; i++) {
        const by = ((t * 0.25 + i / 3) % 1) * s * 1.4 - s * 0.7;
        const g = ctx.createRadialGradient(Math.sin(t + i * 2) * s * 0.25, -by, 0, 0, -by, s * 0.4);
        g.addColorStop(0, rgba(acc, 0.7));
        g.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = g;
        ctx.fillRect(-h, -h, h * 2, h * 2);
      }
      break;
    }
    case 'bandage': {
      ctx.strokeStyle = rgba(acc, 0.95);
      ctx.lineWidth = Math.max(1, s * 0.07);
      for (const [y, a] of [
        [-0.42, 0.18],
        [-0.12, -0.14],
        [0.16, 0.1],
        [0.42, -0.08],
      ] as const) {
        ctx.save();
        ctx.translate(0, y * s);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-s, 0);
        ctx.lineTo(s, 0);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'cape': {
      // Dark cape with a red collar V and a pale face patch.
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.moveTo(-h, -h);
      ctx.lineTo(-s * 0.1, s * 0.1);
      ctx.lineTo(-h, s * 0.2);
      ctx.closePath();
      ctx.moveTo(h, -h);
      ctx.lineTo(s * 0.1, s * 0.1);
      ctx.lineTo(h, s * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e9e1f2';
      ctx.beginPath();
      ctx.ellipse(s * 0.05, -s * 0.06, s * 0.32, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bones': {
      ctx.strokeStyle = acc;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, s * 0.06);
      // Ribs under the face.
      for (const y of [0.28, 0.4, 0.52]) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.32, y * s);
        ctx.quadraticCurveTo(0, (y - 0.08) * s, s * 0.32, y * s);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, s * 0.2);
      ctx.lineTo(0, s * 0.6);
      ctx.stroke();
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
    case 'jack': {
      // Glowing carved face.
      const glow = '#ffe066';
      ctx.fillStyle = glow;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(fx + side * gap - r, fy + r * 0.6);
        ctx.lineTo(fx + side * gap + r, fy + r * 0.6);
        ctx.lineTo(fx + side * gap, fy - r);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      const my = fy + s * 0.17;
      const mw = gap * 1.6;
      ctx.moveTo(fx - mw, my);
      for (let i = 0; i <= 6; i++) ctx.lineTo(fx - mw + (i * mw * 2) / 6, my + (i % 2 ? r * 0.55 : 0));
      ctx.quadraticCurveTo(fx, my + r * 2.2, fx - mw, my);
      ctx.fill();
      break;
    }
    case 'ghost':
      ctx.fillStyle = '#2a2050';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(fx + side * gap + p.lookX * r * 0.2, fy, r * 0.75, r * (p.blink > 0.5 ? 0.15 : 1.05), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(fx, fy + s * 0.2, r * 0.45, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mummy': {
      // One eye peeking through the wraps.
      eye(ctx, fx + gap, fy, r, p);
      ctx.strokeStyle = ink;
      ctx.lineWidth = r * 0.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fx - gap - r, fy);
      ctx.lineTo(fx - gap + r, fy);
      ctx.stroke();
      mouth(ctx, fx, fy + s * 0.2, r * 0.7, ink);
      break;
    }
    case 'vampire':
      eye(ctx, fx - gap, fy, r, p, '#c4183a');
      eye(ctx, fx + gap, fy, r, p, '#c4183a');
      mouth(ctx, fx, fy + s * 0.2, r, '#2a0a12');
      ctx.fillStyle = '#ffffff';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(fx + side * r * 0.55 - r * 0.18, fy + s * 0.165);
        ctx.lineTo(fx + side * r * 0.55 + r * 0.18, fy + s * 0.165);
        ctx.lineTo(fx + side * r * 0.55, fy + s * 0.165 + r * 0.55);
        ctx.fill();
      }
      break;
    case 'skull': {
      const bone = '#f2f0e6';
      ctx.fillStyle = bone;
      ctx.beginPath();
      ctx.ellipse(fx, fy + r * 0.2, gap + r * 1.5, r * 2.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c1a26';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(fx + side * gap, fy, r * 0.85, r * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#7cff4f';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(fx + side * gap + p.lookX * r * 0.3, fy, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#1c1a26';
      ctx.beginPath();
      ctx.moveTo(fx - r * 0.3, fy + r * 1.2);
      ctx.lineTo(fx + r * 0.3, fy + r * 1.2);
      ctx.lineTo(fx, fy + r * 0.7);
      ctx.fill();
      for (let i = -2; i <= 2; i++) ctx.fillRect(fx + i * r * 0.45 - r * 0.06, fy + r * 1.6, r * 0.12, r * 0.6);
      break;
    }
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
  } else if (skin.topper === 'stem' && behind) {
    ctx.fillStyle = '#4caf3a';
    ctx.strokeStyle = '#173d0f';
    ctx.lineWidth = Math.max(1.2, s * 0.05);
    ctx.beginPath();
    ctx.roundRect(-s * 0.06, top - s * 0.2, s * 0.13, s * 0.26, s * 0.04);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(s * 0.17, top - s * 0.1, s * 0.14, s * 0.06, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (skin.topper === 'witch' && !behind) {
    // Pointy hat, drawn in front so the brim overlaps the body.
    ctx.fillStyle = '#21123f';
    ctx.strokeStyle = '#0b0420';
    ctx.lineWidth = Math.max(1.2, s * 0.05);
    ctx.beginPath();
    ctx.ellipse(0, top + s * 0.02, s * 0.48, s * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.26, top);
    ctx.quadraticCurveTo(-s * 0.08, top - s * 0.4, s * 0.12, top - s * 0.62);
    ctx.lineTo(s * 0.02, top - s * 0.32);
    ctx.lineTo(s * 0.26, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = skin.accent;
    ctx.fillRect(-s * 0.25, top - s * 0.09, s * 0.5, s * 0.07);
  } else if (skin.topper === 'bat' && behind) {
    // Little bat wings at the sides.
    ctx.fillStyle = '#1a0b22';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.42, -s * 0.05);
      ctx.quadraticCurveTo(side * s * 0.75, -s * 0.35, side * s * 0.82, -s * 0.05);
      ctx.quadraticCurveTo(side * s * 0.7, -s * 0.08, side * s * 0.66, s * 0.05);
      ctx.quadraticCurveTo(side * s * 0.58, -s * 0.02, side * s * 0.42, s * 0.1);
      ctx.closePath();
      ctx.fill();
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
  // Silhouette skins swap the outline; the Glider keeps its arrow so direction stays clear.
  const outline = () => (skin.silhouette && shape !== 'triangle' ? traceSilhouette(ctx, skin.silhouette, s) : tracePath(ctx, shape, s));
  ctx.save();
  ctx.globalAlpha *= p.alpha;
  ctx.translate(x, y);
  ctx.scale(1 / Math.sqrt(p.squash), p.squash);

  ctx.save();
  ctx.rotate(p.rot);
  drawExtras(ctx, skin, s, shape, true);

  // Neon skins glow (two soft strokes instead of expensive shadowBlur).
  if (skin.pattern === 'neon') {
    outline();
    ctx.strokeStyle = rgba(skin.accent, 0.25);
    ctx.lineWidth = s * 0.3;
    ctx.stroke();
    ctx.strokeStyle = rgba(skin.accent, 0.45);
    ctx.lineWidth = s * 0.17;
    ctx.stroke();
  }

  outline();
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

  outline();
  ctx.lineWidth = Math.max(1.5, s * 0.075);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = skin.outline;
  ctx.stroke();
  ctx.restore();

  ctx.rotate(p.faceRot ?? p.rot);
  drawFace(ctx, skin, s, p, shape);
  if (skin.topper) {
    ctx.rotate(p.rot - (p.faceRot ?? p.rot));
    drawExtras(ctx, skin, s, shape, false);
  }
  ctx.restore();
}

/** A static trail sample for shop previews. */
export function drawTrailPreview(ctx: CanvasRenderingContext2D, style: string, colors: string[], x: number, y: number, size: number, t: number): void {
  if (style === 'none' || !colors.length) return;
  const bats = style === 'bats';
  for (let i = 1; i <= 7; i++) {
    // Bats scatter and flutter; everything else follows a gentle wave.
    const px = x - i * size * 0.32 + (bats ? Math.cos(t * 2.3 + i * 2.1) * size * 0.08 : 0);
    const py = y + (bats ? Math.sin(t * 3 + i * 1.7) * size * (0.1 + i * 0.05) : Math.sin(t * 6 + i * 0.9) * size * 0.08);
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
    case 'bats': {
      ctx.save();
      ctx.translate(x, y);
      const flap = Math.sin(rot * 3) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.35, r * 0.45, 0, 0, Math.PI * 2);
      for (const side of [-1, 1]) {
        ctx.moveTo(side * r * 0.25, 0);
        ctx.quadraticCurveTo(side * r * 1.1, -r * (0.4 + flap * 0.8), side * r * 1.6, -r * 0.1);
        ctx.quadraticCurveTo(side * r * 1.0, r * 0.05, side * r * 0.25, r * 0.25);
      }
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'candycorn': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot * 0.3);
      const tri = (w: number, c: string) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(-w * r, r * 0.9);
        ctx.lineTo(w * r, r * 0.9);
        ctx.lineTo(0, -r * 1.1);
        ctx.closePath();
        ctx.fill();
      };
      tri(0.8, '#ffd23f');
      ctx.save();
      ctx.beginPath();
      ctx.rect(-r, -r * 1.2, r * 2, r * 1.3);
      ctx.clip();
      tri(0.8, '#ff8a1f');
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(-r, -r * 1.2, r * 2, r * 0.6);
      ctx.clip();
      tri(0.8, '#ffffff');
      ctx.restore();
      ctx.restore();
      break;
    }
    case 'mist': {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
      g.addColorStop(0, rgba(color.startsWith('#') ? color : '#ffffff', 0.55));
      g.addColorStop(1, rgba(color.startsWith('#') ? color : '#ffffff', 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
      break;
    }
    case 'rainbow':
    case 'comet':
    default:
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}
