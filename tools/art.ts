/**
 * Dev-only art generator (served by `npm run dev` at /tools/art.html).
 * Draws icons, splash screens and store graphics with the real game renderer,
 * so marketing art always matches the game. Driven by scripts/generate-art.mjs.
 */
import '@fontsource/fredoka/latin-700.css';
import { drawCharacter, drawParticleShape } from '../src/render/character';
import { BIOMES, lighten, rgba } from '../src/render/biomes';
import { skinById } from '../src/meta/catalog';
import type { ShapeMode } from '../src/game/shapes';

type Kind = 'fg' | 'bg' | 'mono' | 'legacy' | 'round' | 'store' | 'feature' | 'splash';

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function polygon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sides: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
}

function iconBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createRadialGradient(w * 0.35, h * 0.3, w * 0.05, w * 0.5, h * 0.55, w * 0.85);
  g.addColorStop(0, '#ff9ad5');
  g.addColorStop(0.45, '#8b5cf6');
  g.addColorStop(1, '#2a1260');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = w * 0.018;
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + hash(i) * 0.12})`;
    polygon(ctx, w * hash(i + 3), h * hash(i + 9), w * (0.08 + hash(i + 5) * 0.12), 3 + (i % 4), hash(i) * 6);
    ctx.stroke();
  }
}

/** The hero: classic square with speed lines, centred in a safe zone. */
function hero(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, mono = false): void {
  ctx.save();
  // Speed lines
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = mono ? '#000' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = size * 0.07;
    const y = cy - size * 0.25 + i * size * 0.25;
    const len = size * (0.45 - Math.abs(i - 1) * 0.12);
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.62 - len, y);
    ctx.lineTo(cx - size * 0.62, y);
    ctx.stroke();
  }
  if (mono) {
    ctx.fillStyle = '#000';
    ctx.translate(cx, cy);
    ctx.rotate(-0.12);
    ctx.beginPath();
    ctx.roundRect(-size * 0.5, -size * 0.5, size, size, size * 0.16);
    ctx.fill();
    ctx.restore();
    return;
  }
  drawCharacter(ctx, cx, cy, size, 'square', skinById('classic'), { rot: -0.12, faceRot: -0.12, lookX: 0.8, lookY: -0.2, time: 0 });
  // Sparkle
  ctx.fillStyle = '#ffffff';
  drawParticleShape(ctx, 'sparkle', cx + size * 0.62, cy - size * 0.55, size * 0.14, '#ffffff', 0);
  ctx.restore();
}

function title(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, align: CanvasTextAlign = 'center'): void {
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.font = `700 ${size}px Fredoka`;
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = '#1a0b45';
  ctx.strokeText('POLYGON', x, y);
  ctx.fillStyle = '#ffd23f';
  ctx.fillText('POLYGON', x, y);
  ctx.font = `700 ${size * 1.2}px Fredoka`;
  ctx.lineWidth = size * 0.18;
  ctx.strokeText('RUSH', x, y + size * 1.05);
  const g = ctx.createLinearGradient(0, y + size * 0.5, 0, y + size * 1.6);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#ff7ac6');
  ctx.fillStyle = g;
  ctx.fillText('RUSH', x, y + size * 1.05);
}

function scene(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const pal = BIOMES[0];
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(1, pal.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const sun = ctx.createRadialGradient(w * 0.8, h * 0.25, 0, w * 0.8, h * 0.25, h * 0.6);
  sun.addColorStop(0, rgba(pal.far, 0.85));
  sun.addColorStop(1, rgba(pal.far, 0));
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = h * 0.012;
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = rgba(pal.far, 0.3);
    ctx.fillStyle = rgba(pal.far, 0.08);
    polygon(ctx, w * hash(i + 1), h * (0.1 + hash(i + 2) * 0.45), h * (0.05 + hash(i + 4) * 0.09), 3 + (i % 4), hash(i) * 6);
    ctx.fill();
    ctx.stroke();
  }
  const ground = h * 0.78;
  ctx.fillStyle = rgba(pal.mid, 0.5);
  ctx.beginPath();
  ctx.moveTo(0, ground);
  for (let i = 0; i <= 14; i++) ctx.lineTo((i / 14) * w, ground - h * (0.08 + hash(i * 3) * 0.18));
  ctx.lineTo(w, ground);
  ctx.fill();
  const gg = ctx.createLinearGradient(0, ground, 0, h);
  gg.addColorStop(0, pal.ground);
  gg.addColorStop(1, pal.groundDark);
  ctx.fillStyle = gg;
  ctx.fillRect(0, ground, w, h - ground);
  ctx.fillStyle = pal.groundEdge;
  ctx.fillRect(0, ground, w, h * 0.012);
  ctx.strokeStyle = rgba(pal.groundTile, 0.9);
  ctx.lineWidth = 2;
  const tile = h * 0.08;
  for (let x = 0; x < w; x += tile) {
    ctx.beginPath();
    ctx.moveTo(x, ground);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  // Spikes
  for (const sx of [0.5, 0.54]) {
    const bx = w * sx;
    const sz = h * 0.08;
    ctx.beginPath();
    ctx.moveTo(bx - sz / 2, ground);
    ctx.lineTo(bx, ground - sz);
    ctx.lineTo(bx + sz / 2, ground);
    ctx.closePath();
    const sg = ctx.createLinearGradient(0, ground - sz, 0, ground);
    sg.addColorStop(0, lighten(pal.hazard, 0.2));
    sg.addColorStop(1, pal.hazardDark);
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = h * 0.006;
    ctx.stroke();
  }
}

function gemShape(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#3ad7ff';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.85, y - s * 0.25);
  ctx.lineTo(x - s * 0.45, y - s * 0.8);
  ctx.lineTo(x + s * 0.45, y - s * 0.8);
  ctx.lineTo(x + s * 0.85, y - s * 0.25);
  ctx.lineTo(x, y + s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = s * 0.12;
  ctx.stroke();
}

function render(kind: Kind, w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const m = Math.min(w, h);
  switch (kind) {
    case 'bg':
      iconBackground(ctx, w, h);
      break;
    case 'fg':
      // Adaptive icon: keep the art inside the central 66% safe zone.
      hero(ctx, w * 0.55, h * 0.5, m * 0.36);
      break;
    case 'mono':
      hero(ctx, w * 0.55, h * 0.5, m * 0.36, true);
      break;
    case 'legacy':
    case 'round':
    case 'store': {
      ctx.save();
      ctx.beginPath();
      if (kind === 'round') ctx.arc(w / 2, h / 2, m / 2, 0, Math.PI * 2);
      else if (kind === 'legacy') ctx.roundRect(m * 0.04, m * 0.04, m * 0.92, m * 0.92, m * 0.2);
      else ctx.rect(0, 0, w, h);
      ctx.clip();
      iconBackground(ctx, w, h);
      hero(ctx, w * 0.55, h * 0.5, m * (kind === 'store' ? 0.5 : 0.5));
      ctx.restore();
      break;
    }
    case 'feature': {
      scene(ctx, w, h);
      const ground = h * 0.78;
      const shapes: [ShapeMode, string, number, number, number][] = [
        ['square', 'classic', 0.62, ground - h * 0.32, -0.3],
        ['triangle', 'bubblegum', 0.74, h * 0.3, 0.25],
        ['hexagon', 'mint', 0.86, ground - h * 0.075, 0.4],
        ['diamond', 'sky', 0.95, h * 0.5, -0.1],
      ];
      for (const [shape, skin, fx, fy, rot] of shapes) {
        const sz = h * 0.15;
        for (let i = 1; i < 6; i++) {
          ctx.globalAlpha = 0.5 - i * 0.08;
          drawParticleShape(ctx, 'sparkle', w * fx - sz * 0.6 - i * sz * 0.35, fy + Math.sin(i) * sz * 0.1, sz * 0.12, '#ffffff', 0);
        }
        ctx.globalAlpha = 1;
        drawCharacter(ctx, w * fx, fy, sz, shape, skinById(skin), { rot, faceRot: shape === 'square' || shape === 'hexagon' ? 0 : rot, lookX: 0.8, time: 1 });
      }
      for (let i = 0; i < 5; i++) gemShape(ctx, w * (0.56 + i * 0.035), ground - h * (0.3 + Math.sin(i / 4 * Math.PI) * 0.17), h * 0.022);
      title(ctx, w * 0.27, h * 0.36, h * 0.17);
      ctx.font = `700 ${h * 0.06}px Fredoka`;
      ctx.textAlign = 'center';
      ctx.lineWidth = h * 0.012;
      ctx.strokeStyle = '#1a0b45';
      ctx.strokeText('Rush · Jump · Flip · Fly', w * 0.27, h * 0.72);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Rush · Jump · Flip · Fly', w * 0.27, h * 0.72);
      break;
    }
    case 'splash': {
      const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, '#3a1f8f');
      g.addColorStop(1, '#1a1040');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      hero(ctx, w / 2 + m * 0.03, h / 2 - m * 0.12, m * 0.22);
      title(ctx, w / 2, h / 2 + m * 0.12, m * 0.075);
      break;
    }
  }
  return c.toDataURL('image/png');
}

declare global {
  interface Window {
    renderArt: (kind: Kind, w: number, h: number) => Promise<string>;
  }
}

window.renderArt = async (kind, w, h) => {
  await document.fonts.load('700 40px Fredoka');
  await document.fonts.ready;
  return render(kind, w, h);
};
