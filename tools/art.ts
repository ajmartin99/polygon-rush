/**
 * Dev-only art generator (served by `npm run dev` at /tools/art.html).
 * Draws icons, splash screens and store graphics with the real game renderer,
 * so marketing art always matches the game. Driven by scripts/generate-art.mjs.
 */
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/fredoka/latin-500.css';
import { drawCharacter, drawParticleShape } from '../src/render/character';
import { BIOMES, lighten, rgba } from '../src/render/biomes';
import { skinById } from '../src/meta/catalog';
import type { ShapeMode } from '../src/game/shapes';
import { SPOOKY } from '../src/meta/events';
import { drawGhost, drawPumpkin, drawZombie } from '../src/render/spooky';

type Kind = 'fg' | 'bg' | 'mono' | 'legacy' | 'round' | 'store' | 'feature' | 'splash' | 'spooky-store' | 'spooky-feature' | 'spooky-cast';

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

// ------------------------------------------------------------------ Spooky Season
/** Night sky fading to a pumpkin-orange horizon, a big moon and a few bats. */
function spookySky(ctx: CanvasRenderingContext2D, w: number, h: number, moonX: number, moonY: number, moonR: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1a0838');
  sky.addColorStop(0.55, SPOOKY.mid);
  sky.addColorStop(1, SPOOKY.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(moonX, moonY, moonR * 0.8, moonX, moonY, moonR * 2.6);
  glow.addColorStop(0, 'rgba(255,243,214,0.45)');
  glow.addColorStop(1, 'rgba(255,243,214,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(214,190,150,0.55)';
  for (const [dx, dy, cr] of [[-0.3, -0.2, 0.16], [0.25, 0.15, 0.22], [-0.05, 0.38, 0.12]] as const) {
    ctx.beginPath();
    ctx.arc(moonX + dx * moonR, moonY + dy * moonR, cr * moonR, 0, Math.PI * 2);
    ctx.fill();
  }
}

function bat(ctx: CanvasRenderingContext2D, x: number, y: number, sz: number, flap = 0.6): void {
  ctx.fillStyle = '#1a0b2b';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - sz * 0.6, y - sz * (0.2 + flap * 0.6), x - sz * 1.3, y - sz * flap * 0.3);
  ctx.quadraticCurveTo(x - sz * 0.7, y + sz * 0.1, x, y + sz * 0.25);
  ctx.quadraticCurveTo(x + sz * 0.7, y + sz * 0.1, x + sz * 1.3, y - sz * flap * 0.3);
  ctx.quadraticCurveTo(x + sz * 0.6, y - sz * (0.2 + flap * 0.6), x, y);
  ctx.fill();
}

/** The classic runner in a witch hat, with speed lines. */
function spookyHero(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, rot = -0.12): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = 'rgba(255,214,150,0.9)';
    ctx.lineWidth = size * 0.07;
    const y = cy - size * 0.25 + i * size * 0.25;
    const len = size * (0.45 - Math.abs(i - 1) * 0.12);
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.62 - len, y);
    ctx.lineTo(cx - size * 0.62, y);
    ctx.stroke();
  }
  drawCharacter(ctx, cx, cy, size, 'square', { ...skinById('classic'), topper: 'witch' }, { rot, faceRot: rot, lookX: 0.8, lookY: -0.2, time: 0 });
  ctx.restore();
}

/** A zombie standing on `groundY`, facing left (toward the runner). */
function zombieAt(ctx: CanvasRenderingContext2D, x: number, groundY: number, u: number, time: number): void {
  ctx.save();
  ctx.translate(x, groundY);
  ctx.scale(-1, 1);
  drawZombie(ctx, u, time);
  ctx.restore();
}

/** A ghost centred at (x, y), facing left. */
function ghostAt(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, time: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  drawGhost(ctx, 0, 0, u, time);
  ctx.restore();
}

/** Spooky Season ground: dark violet tiles with a glowing orange edge. */
function spookyGround(ctx: CanvasRenderingContext2D, w: number, h: number, ground: number): void {
  ctx.fillStyle = rgba(SPOOKY.mid, 0.85);
  ctx.beginPath();
  ctx.moveTo(0, ground);
  for (let i = 0; i <= 14; i++) ctx.lineTo((i / 14) * w, ground - h * (0.06 + hash(i * 7) * 0.14));
  ctx.lineTo(w, ground);
  ctx.fill();
  const gg = ctx.createLinearGradient(0, ground, 0, h);
  gg.addColorStop(0, SPOOKY.ground);
  gg.addColorStop(1, SPOOKY.groundDark);
  ctx.fillStyle = gg;
  ctx.fillRect(0, ground, w, h - ground);
  ctx.fillStyle = SPOOKY.groundEdge;
  ctx.fillRect(0, ground, w, Math.max(2, h * 0.012));
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
    case 'spooky-store': {
      // The Play listing icon for Spooky Season (swap it in by hand for the event).
      spookySky(ctx, w, h, w * 0.73, h * 0.27, m * 0.16);
      bat(ctx, w * 0.2, h * 0.16, m * 0.06, 0.8);
      bat(ctx, w * 0.36, h * 0.1, m * 0.04, -0.2);
      ghostAt(ctx, w * 0.2, h * 0.36, m * 0.13, 0.4);
      drawPumpkin(ctx, w * 0.82, h * 0.8, m * 0.1, 0.3);
      spookyHero(ctx, w * 0.54, h * 0.56, m * 0.42);
      break;
    }
    case 'spooky-feature': {
      spookySky(ctx, w, h, w * 0.86, h * 0.24, h * 0.14);
      const ground = h * 0.8;
      spookyGround(ctx, w, h, ground);
      for (const [bx, by, bs, f] of [[0.62, 0.14, 0.05, 0.8], [0.7, 0.08, 0.035, -0.3], [0.97, 0.45, 0.04, 0.4]] as const) bat(ctx, w * bx, h * by, h * bs, f);
      drawPumpkin(ctx, w * 0.53, ground - h * 0.05, h * 0.055, 0.2);
      spookyHero(ctx, w * 0.62, ground - h * 0.34, h * 0.17, -0.3);
      for (let i = 0; i < 4; i++) gemShape(ctx, w * (0.67 + i * 0.03), ground - h * (0.36 - i * 0.04), h * 0.02);
      zombieAt(ctx, w * 0.8, ground, h * 0.2, 0.3);
      ghostAt(ctx, w * 0.9, h * 0.42, h * 0.13, 0.8);
      drawPumpkin(ctx, w * 0.96, ground - h * 0.05, h * 0.05, 0.6);
      title(ctx, w * 0.26, h * 0.34, h * 0.17);
      ctx.font = `700 ${h * 0.065}px Fredoka`;
      ctx.textAlign = 'center';
      ctx.lineWidth = h * 0.014;
      ctx.strokeStyle = '#1a0b45';
      ctx.strokeText('The Haunted Run is here!', w * 0.26, h * 0.72);
      ctx.fillStyle = '#ffb36b';
      ctx.fillText('The Haunted Run is here!', w * 0.26, h * 0.72);
      break;
    }
    case 'spooky-cast': {
      // Transparent: the Haunted Run's cast in a row, for the website.
      const ground = h * 0.88;
      drawPumpkin(ctx, w * 0.07, ground - h * 0.09, h * 0.09, 0.2);
      spookyHero(ctx, w * 0.24, ground - h * 0.36, h * 0.3, -0.18);
      zombieAt(ctx, w * 0.48, ground, h * 0.34, 0.5);
      ghostAt(ctx, w * 0.7, h * 0.4, h * 0.22, 1.1);
      drawPumpkin(ctx, w * 0.9, ground - h * 0.1, h * 0.1, 0.7);
      break;
    }
    case 'splash': {
      // The studio card (matches the app's own boot card in index.html, so the hand-off is seamless).
      ctx.fillStyle = '#1a1040';
      ctx.fillRect(0, 0, w, h);
      studioCard(ctx, w / 2, h / 2, m);
      break;
    }
  }
  return c.toDataURL('image/png');
}

/**
 * Soft-Game Brothers card: the studio mark (square, triangle, circle), the
 * name and the website, laid out like the boot card (16px = 1rem at 360dp).
 */
function studioCard(ctx: CanvasRenderingContext2D, cx: number, cy: number, m: number): void {
  const rem = m / 22.5;
  const mark = 5.5 * rem;
  const top = cy - (mark + 0.75 * rem + 2.4 * rem + 0.35 * rem + 1.3 * rem) / 2;
  const u = mark / 34;
  const x0 = cx - mark / 2;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.roundRect(x0 + 2 * u, top + 14 * u, 14 * u, 14 * u, 3 * u);
  ctx.fill();
  ctx.fillStyle = '#3ee6b0';
  ctx.beginPath();
  ctx.moveTo(x0 + 24 * u, top + 4 * u);
  ctx.lineTo(x0 + 32 * u, top + 18 * u);
  ctx.lineTo(x0 + 16 * u, top + 18 * u);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff6fae';
  ctx.beginPath();
  ctx.arc(x0 + 25 * u, top + 26 * u, 6 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${2 * rem}px Fredoka`;
  const nameY = top + mark + 0.75 * rem + 1.2 * rem;
  ctx.fillText('Soft-Game Brothers', cx, nameY);
  ctx.fillStyle = '#3ee6b0';
  ctx.font = `500 ${1.05 * rem}px Fredoka`;
  ctx.fillText('softgamebros.com', cx, nameY + 1.2 * rem + 0.35 * rem + 0.65 * rem);
}

declare global {
  interface Window {
    renderArt: (kind: Kind, w: number, h: number) => Promise<string>;
  }
}

window.renderArt = async (kind, w, h) => {
  await document.fonts.load('700 40px Fredoka');
  await document.fonts.load('500 40px Fredoka');
  await document.fonts.ready;
  return render(kind, w, h);
};
