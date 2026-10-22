import { VIEW_TOP } from '../game/constants';
import type { Palette } from './biomes';
import { drawPumpkin } from './spooky';

/**
 * The Haunted Run's own scenery, one look per story chapter: the Pumpkin
 * Fields at sunset, Hollow Hill Graveyard, inside the Haunted House, and
 * Grizelda's rooftop under the stolen Harvest Moon. Drawn instead of the
 * regular world backgrounds, with its own ground and block colours.
 */
export const STORY_PALETTES: Palette[] = [
  {
    name: 'The Pumpkin Fields',
    skyTop: '#2b1050',
    skyBottom: '#e0622c',
    far: '#ffb36b',
    mid: '#3a1a4a',
    ground: '#2f3a16',
    groundDark: '#151b07',
    groundEdge: '#9be05a',
    groundTile: '#3b4a1d',
    block: '#7a5130',
    blockDark: '#3d2614',
    blockEdge: '#f0b46a',
    hazard: '#ff9a3c',
    hazardDark: '#a3420c',
    hazardEdge: '#fff0d8',
    accent: '#ff9a3c',
    stars: 0.3,
  },
  {
    name: 'Hollow Hill Graveyard',
    skyTop: '#070b20',
    skyBottom: '#2c3f5c',
    far: '#9fe0c0',
    mid: '#1a2236',
    ground: '#262b38',
    groundDark: '#11141c',
    groundEdge: '#a8b8d0',
    groundTile: '#323848',
    block: '#525a6c',
    blockDark: '#2a2f3c',
    blockEdge: '#d8e0ee',
    hazard: '#7cff4f',
    hazardDark: '#2e8a12',
    hazardEdge: '#efffe0',
    accent: '#7cff9f',
    stars: 0.9,
  },
  {
    name: 'The Haunted House',
    skyTop: '#1c0a28',
    skyBottom: '#2e1238',
    far: '#ffcf7a',
    mid: '#3a1846',
    ground: '#3a2016',
    groundDark: '#1d0f09',
    groundEdge: '#d08a48',
    groundTile: '#4a2a1c',
    block: '#4b2a5e',
    blockDark: '#24122e',
    blockEdge: '#e0a8ff',
    hazard: '#ff5f8f',
    hazardDark: '#8a1440',
    hazardEdge: '#ffe0ec',
    accent: '#ffcf7a',
    stars: 0,
  },
  {
    name: 'Grizelda’s Rooftop',
    skyTop: '#14052a',
    skyBottom: '#6e1a40',
    far: '#ffa54f',
    mid: '#2a0f38',
    ground: '#2b1b30',
    groundDark: '#140b17',
    groundEdge: '#ff7a3a',
    groundTile: '#38223e',
    block: '#3a1f45',
    blockDark: '#1c0e22',
    blockEdge: '#c9a8ff',
    hazard: '#7cff4f',
    hazardDark: '#2e8a12',
    hazardEdge: '#efffe0',
    accent: '#7cff4f',
    stars: 1,
  },
];

export interface StoryView {
  /** Chapter (0..3) and how far into the fade to the next one (0..1). */
  chapter: number;
  fade: number;
  /** Grizelda has been knocked off her broom: the Harvest Moon breaks free. */
  moonFree: boolean;
}

interface Cam {
  x: number;
  scale: number;
  top: number;
}

interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Draw the scenery behind the course. */
export function drawStoryScenery(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, view: StoryView, time: number, beat: number, detail: number, calm: boolean): void {
  drawChapter(ctx, r, cam, view.chapter, view, time, beat, detail, calm);
  if (view.fade > 0 && view.chapter + 1 < STORY_PALETTES.length) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, view.fade);
    drawChapter(ctx, r, cam, view.chapter + 1, view, time, beat, detail, calm);
    ctx.restore();
  }
}

function drawChapter(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, c: number, view: StoryView, time: number, beat: number, detail: number, calm: boolean): void {
  const pal = STORY_PALETTES[c];
  const s = cam.scale;
  const ground = cam.top + VIEW_TOP * s;
  const sky = ctx.createLinearGradient(0, r.y, 0, ground);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(1, pal.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const along = (wx: number, par: number) => r.x + (wx - cam.x * par) * s;
  /** World cells of `cell` tiles visible at parallax `par`. */
  const cells = (par: number, cell: number): [number, number] => {
    const a = Math.floor((cam.x * par) / cell) - 1;
    return [a, a + Math.ceil(r.w / s / cell) + 2];
  };
  if (pal.stars > 0) stars(ctx, r, cam, pal.stars * detail, time);
  if (c === 0) fields(ctx, r, cam, s, ground, along, cells, time, detail);
  else if (c === 1) graveyard(ctx, r, cam, s, ground, along, cells, time, detail);
  else if (c === 2) house(ctx, r, s, ground, along, cells, time, detail, calm);
  else rooftop(ctx, r, s, ground, along, cells, time, beat, detail, view.moonFree);
}

type Along = (wx: number, par: number) => number;
type Cells = (par: number, cell: number) => [number, number];

function stars(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, amount: number, time: number): void {
  const n = Math.round(60 * amount);
  for (let i = 0; i < n; i++) {
    const px = (((hash(i) * r.w - cam.x * cam.scale * 0.03) % r.w) + r.w) % r.w;
    const py = r.y + hash(i + 99) * r.h * 0.5;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * (1 + hash(i + 7) * 2) + i));
    ctx.fillStyle = `rgba(255,255,255,${0.25 + tw * 0.5})`;
    const sz = hash(i + 3) > 0.85 ? 2.2 : 1.3;
    ctx.fillRect(r.x + px, py, sz, sz);
  }
}

/** Rolling hills: a sine-ish ridge at parallax `par`. */
function hills(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, ground: number, par: number, height: number, color: string, seed: number): void {
  const s = cam.scale;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(r.x, ground + s);
  for (let px = 0; px <= r.w + 8; px += 8) {
    const wx = (px / s + cam.x * par) * 0.35 + seed;
    const h = height * (0.55 + 0.25 * Math.sin(wx) + 0.2 * Math.sin(wx * 2.3 + 1.7));
    ctx.lineTo(r.x + px, ground - h * s);
  }
  ctx.lineTo(r.x + r.w + 8, ground + s);
  ctx.closePath();
  ctx.fill();
}

/** The witch's silhouette on her broom, for the sky in earlier chapters (you're chasing her). */
function witchSilhouette(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(20,6,30,0.85)';
  // Broom.
  ctx.fillRect(-size * 1.2, -size * 0.05, size * 2.2, size * 0.1);
  ctx.beginPath();
  ctx.moveTo(size * 1, -size * 0.05);
  ctx.lineTo(size * 1.5, -size * 0.3);
  ctx.lineTo(size * 1.5, size * 0.3);
  ctx.closePath();
  ctx.fill();
  // Cloak and hat.
  ctx.beginPath();
  ctx.moveTo(-size * 0.4, 0);
  ctx.lineTo(size * 0.3, 0);
  ctx.lineTo(0, -size * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-size * 0.05, -size * 0.85, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-size * 0.35, -size * 0.95);
  ctx.lineTo(size * 0.3, -size * 0.95);
  ctx.lineTo(size * 0.15, -size * 1.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function fields(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, s: number, ground: number, along: Along, cells: Cells, time: number, detail: number): void {
  // Sunset glow on the horizon.
  const glow = ctx.createRadialGradient(r.x + r.w * 0.7, ground, s, r.x + r.w * 0.7, ground, r.w * 0.6);
  glow.addColorStop(0, 'rgba(255,190,90,0.55)');
  glow.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  // Grizelda flying away with the moon, far ahead.
  const wx = r.x + r.w * (0.95 - ((time * 0.02) % 1) * 0.5);
  witchSilhouette(ctx, wx, r.y + r.h * 0.18 + Math.sin(time * 1.5) * s * 0.2, s * 0.45);
  hills(ctx, r, cam, ground, 0.08, 4.2, '#3a1748', 1.3);
  hills(ctx, r, cam, ground, 0.18, 2.6, '#2a1236', 4.1);
  // Rows of corn: tall stalks with leaves.
  const [a, b] = cells(0.35, 0.7);
  ctx.strokeStyle = '#2a1a1c';
  ctx.lineWidth = Math.max(1.5, s * 0.08);
  for (let i = a; i <= b; i++) {
    if (hash(i) < 0.15 * (2 - detail)) continue;
    const x = along(i * 0.7, 0.35);
    const h = s * (1.6 + hash(i + 5) * 0.9);
    const sway = Math.sin(time * 1.2 + i) * s * 0.08;
    ctx.beginPath();
    ctx.moveTo(x, ground);
    ctx.quadraticCurveTo(x + sway, ground - h * 0.6, x + sway * 2, ground - h);
    ctx.moveTo(x, ground - h * 0.45);
    ctx.lineTo(x - s * 0.35, ground - h * 0.6);
    ctx.moveTo(x + sway, ground - h * 0.7);
    ctx.lineTo(x + s * 0.35, ground - h * 0.82);
    ctx.stroke();
  }
  // A scarecrow every so often.
  const [sa, sb] = cells(0.35, 24);
  for (let i = sa; i <= sb; i++) {
    const x = along(i * 24 + hash(i) * 10, 0.35);
    scarecrow(ctx, x, ground, s, time + i);
  }
  // Fence posts and glowing jack-o'-lanterns along the field edge.
  const [fa, fb] = cells(0.6, 2);
  ctx.fillStyle = '#3a2416';
  for (let i = fa; i <= fb; i++) {
    const x = along(i * 2, 0.6);
    ctx.fillRect(x - s * 0.08, ground - s * 0.9, s * 0.16, s * 0.9);
    if (hash(i + 2) < 0.5) ctx.fillRect(x, ground - s * 0.7, s * 2, s * 0.1);
  }
  const [pa, pb] = cells(0.6, 5);
  for (let i = pa; i <= pb; i++) {
    if (hash(i + 31) < 0.45) continue;
    drawPumpkin(ctx, along(i * 5 + hash(i) * 3, 0.6), ground - s * 0.35, s * 0.38, time + i);
  }
}

function scarecrow(ctx: CanvasRenderingContext2D, x: number, ground: number, s: number, t: number): void {
  ctx.save();
  ctx.translate(x, ground);
  ctx.rotate(Math.sin(t * 0.8) * 0.04);
  ctx.fillStyle = '#4a2f1a';
  ctx.fillRect(-s * 0.08, -s * 3, s * 0.16, s * 3);
  ctx.fillRect(-s * 1, -s * 2.3, s * 2, s * 0.14);
  // Patchy shirt.
  ctx.fillStyle = '#6b3a5a';
  ctx.beginPath();
  ctx.moveTo(-s * 0.8, -s * 2.35);
  ctx.lineTo(s * 0.8, -s * 2.35);
  ctx.lineTo(s * 0.45, -s * 1.3);
  ctx.lineTo(-s * 0.45, -s * 1.3);
  ctx.closePath();
  ctx.fill();
  // Sack head, stitched grin and a floppy hat.
  ctx.fillStyle = '#c9a26a';
  ctx.beginPath();
  ctx.arc(0, -s * 2.75, s * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a2416';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 2.62);
  ctx.lineTo(s * 0.2, -s * 2.62);
  ctx.stroke();
  ctx.fillStyle = '#1b1140';
  ctx.fillRect(-s * 0.18, -s * 2.88, s * 0.09, s * 0.09);
  ctx.fillRect(s * 0.09, -s * 2.88, s * 0.09, s * 0.09);
  ctx.fillStyle = '#3a2416';
  ctx.beginPath();
  ctx.ellipse(0, -s * 3.08, s * 0.6, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 3.1);
  ctx.lineTo(s * 0.3, -s * 3.1);
  ctx.lineTo(s * 0.1, -s * 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function graveyard(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, s: number, ground: number, along: Along, cells: Cells, time: number, detail: number): void {
  // A sickly green witch-light where the moon should be.
  const gx = r.x + r.w * 0.72;
  const gy = r.y + r.h * 0.22;
  const g = ctx.createRadialGradient(gx, gy, s * 0.3, gx, gy, s * 4.5);
  g.addColorStop(0, 'rgba(160,255,190,0.35)');
  g.addColorStop(1, 'rgba(160,255,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(gx - s * 4.5, gy - s * 4.5, s * 9, s * 9);
  // Drifting clouds.
  ctx.fillStyle = 'rgba(40,52,80,0.7)';
  for (let i = 0; i < 4; i++) {
    const w = r.w * 0.35;
    const cx = r.x + ((((i * 0.31 + time * 0.008) * r.w * 1.4 - cam.x * s * 0.02) % (r.w + w)) + r.w + w) % (r.w + w) - w * 0.5;
    const cy = r.y + r.h * (0.12 + i * 0.07);
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.5, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  hills(ctx, r, cam, ground, 0.08, 3.6, '#141b2c', 2.2);
  // Dead trees.
  const [ta, tb] = cells(0.18, 11);
  ctx.strokeStyle = '#0e1220';
  ctx.lineCap = 'round';
  for (let i = ta; i <= tb; i++) {
    if (hash(i + 4) < 0.3) continue;
    const x = along(i * 11 + hash(i) * 6, 0.18);
    deadTree(ctx, x, ground - s * 0.6, s * (2.4 + hash(i + 8) * 1.2), i);
  }
  // Tombstones and crosses.
  const [ga, gb] = cells(0.42, 2.6);
  for (let i = ga; i <= gb; i++) {
    if (hash(i + 17) < 0.25 * (2 - detail)) continue;
    const x = along(i * 2.6 + hash(i) * 1.2, 0.42);
    const tilt = (hash(i + 3) - 0.5) * 0.25;
    ctx.save();
    ctx.translate(x, ground);
    ctx.rotate(tilt);
    ctx.fillStyle = '#3c4458';
    if (hash(i + 9) < 0.3) {
      ctx.fillRect(-s * 0.09, -s * 1.3, s * 0.18, s * 1.3);
      ctx.fillRect(-s * 0.4, -s * 1.0, s * 0.8, s * 0.16);
    } else {
      const w = s * (0.55 + hash(i + 2) * 0.3);
      const h = s * (0.8 + hash(i + 6) * 0.5);
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(-w / 2, -h + w / 2);
      ctx.arc(0, -h + w / 2, w / 2, Math.PI, 0);
      ctx.lineTo(w / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5a6478';
      ctx.fillRect(-w * 0.25, -h * 0.6, w * 0.5, s * 0.06);
      ctx.fillRect(-w * 0.2, -h * 0.45, w * 0.4, s * 0.06);
    }
    ctx.restore();
  }
  // Iron fence.
  const [fa, fb] = cells(0.62, 0.6);
  ctx.strokeStyle = '#0c0f18';
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  ctx.beginPath();
  for (let i = fa; i <= fb; i++) {
    const x = along(i * 0.6, 0.62);
    ctx.moveTo(x, ground);
    ctx.lineTo(x, ground - s * 1.1);
  }
  const x0 = along(fa * 0.6, 0.62);
  const x1 = along(fb * 0.6, 0.62);
  ctx.moveTo(x0, ground - s * 0.9);
  ctx.lineTo(x1, ground - s * 0.9);
  ctx.moveTo(x0, ground - s * 0.3);
  ctx.lineTo(x1, ground - s * 0.3);
  ctx.stroke();
}

function deadTree(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, seed: number): void {
  const branch = (bx: number, by: number, len: number, ang: number, w: number, depth: number) => {
    const ex = bx + Math.cos(ang) * len;
    const ey = by + Math.sin(ang) * len;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (depth <= 0) return;
    branch(ex, ey, len * 0.66, ang - 0.5 - hash(seed + depth) * 0.3, w * 0.6, depth - 1);
    branch(ex, ey, len * 0.6, ang + 0.45 + hash(seed + depth + 9) * 0.3, w * 0.6, depth - 1);
  };
  branch(x, y + h * 0.6, h * 0.6, -Math.PI / 2, Math.max(2, h * 0.09), 3);
}

function house(ctx: CanvasRenderingContext2D, r: Area, s: number, ground: number, along: Along, cells: Cells, time: number, detail: number, calm: boolean): void {
  // Striped wallpaper.
  const [wa, wb] = cells(0.5, 1.2);
  for (let i = wa; i <= wb; i++) {
    if (i % 2) continue;
    ctx.fillStyle = 'rgba(80,30,96,0.45)';
    ctx.fillRect(along(i * 1.2, 0.5), r.y, s * 1.2, ground - r.y);
  }
  // Lightning now and then (not with Reduce motion).
  const strike = calm ? 0 : Math.max(0, 1 - ((time % 7.3) / 0.25)) * (hash(Math.floor(time / 7.3)) < 0.7 ? 1 : 0);
  // Tall arched windows, portraits between them, candles.
  const [a, b] = cells(0.5, 9);
  for (let i = a; i <= b; i++) {
    const x = along(i * 9, 0.5);
    const top = ground - s * 6.4;
    const w = s * 1.8;
    const h = s * 4;
    ctx.fillStyle = strike > 0 ? `rgba(220,230,255,${0.4 + strike * 0.6})` : '#1a2a4a';
    ctx.beginPath();
    ctx.moveTo(x - w / 2, top + h);
    ctx.lineTo(x - w / 2, top + w / 2);
    ctx.arc(x, top + w / 2, w / 2, Math.PI, 0);
    ctx.lineTo(x + w / 2, top + h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#120818';
    ctx.lineWidth = Math.max(2, s * 0.14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + h);
    ctx.moveTo(x - w / 2, top + h * 0.55);
    ctx.lineTo(x + w / 2, top + h * 0.55);
    ctx.stroke();
    // A portrait whose eyes follow you.
    const px = along(i * 9 + 4.5, 0.5);
    const py = ground - s * 5.2;
    ctx.fillStyle = '#6b4a1a';
    ctx.fillRect(px - s * 0.85, py - s * 1.1, s * 1.7, s * 2.2);
    ctx.fillStyle = '#2a1830';
    ctx.fillRect(px - s * 0.65, py - s * 0.9, s * 1.3, s * 1.8);
    ctx.fillStyle = '#5a4a6a';
    ctx.beginPath();
    ctx.arc(px, py - s * 0.2, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px - s * 0.5, py + s * 0.25, s * 1, s * 0.65);
    const look = Math.max(-1, Math.min(1, (r.x + r.w * 0.3 - px) / (r.w * 0.4)));
    for (const ex of [-0.13, 0.13]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px + ex * s, py - s * 0.25, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c00';
      ctx.beginPath();
      ctx.arc(px + ex * s + look * s * 0.04, py - s * 0.25, s * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
    // Candelabra with flickering flames.
    if (detail > 0.4) {
      const cx = along(i * 9 + 2.2, 0.5);
      const cy = ground - s * 2.2;
      ctx.fillStyle = '#b8862a';
      ctx.fillRect(cx - s * 0.05, cy, s * 0.1, s * 0.9);
      ctx.fillRect(cx - s * 0.45, cy, s * 0.9, s * 0.08);
      for (const dx of [-0.4, 0, 0.4]) {
        const f = 0.8 + 0.2 * Math.sin(time * 13 + dx * 7 + i);
        const fx = cx + dx * s;
        const fg = ctx.createRadialGradient(fx, cy - s * 0.3, 0, fx, cy - s * 0.3, s * 0.6);
        fg.addColorStop(0, `rgba(255,210,120,${0.5 * f})`);
        fg.addColorStop(1, 'rgba(255,210,120,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(fx - s * 0.6, cy - s * 0.9, s * 1.2, s * 1.2);
        ctx.fillStyle = '#ffe2a0';
        ctx.beginPath();
        ctx.ellipse(fx, cy - s * 0.18, s * 0.06, s * 0.14 * f, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Cobwebs in the top corners.
  ctx.strokeStyle = 'rgba(230,230,255,0.35)';
  ctx.lineWidth = 1;
  for (const [cx, dir] of [
    [r.x, 1],
    [r.x + r.w, -1],
  ] as const) {
    const len = s * 2.2;
    ctx.beginPath();
    for (let k = 0; k <= 4; k++) {
      const ang = (k / 4) * (Math.PI / 2);
      ctx.moveTo(cx, r.y);
      ctx.lineTo(cx + dir * Math.cos(ang) * len, r.y + Math.sin(ang) * len);
    }
    for (let ring = 1; ring <= 3; ring++) {
      const rr = (len * ring) / 3.3;
      ctx.moveTo(cx + dir * rr, r.y);
      for (let k = 1; k <= 4; k++) {
        const ang = (k / 4) * (Math.PI / 2);
        ctx.lineTo(cx + dir * Math.cos(ang) * rr, r.y + Math.sin(ang) * rr);
      }
    }
    ctx.stroke();
  }
  if (strike > 0) {
    ctx.fillStyle = `rgba(200,210,255,${strike * 0.12})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}

function rooftop(ctx: CanvasRenderingContext2D, r: Area, s: number, ground: number, along: Along, cells: Cells, time: number, beat: number, detail: number, moonFree: boolean): void {
  // The Harvest Moon, trapped in the witch's green bubble until you knock her off her broom.
  const mx = r.x + r.w * 0.66;
  const my = r.y + r.h * 0.3;
  const mr = s * 2.4 * (1 + Math.pow(1 - beat, 3) * 0.03);
  const halo = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 2.6);
  halo.addColorStop(0, moonFree ? 'rgba(255,190,90,0.6)' : 'rgba(255,150,70,0.3)');
  halo.addColorStop(1, 'rgba(255,150,70,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - mr * 2.6, my - mr * 2.6, mr * 5.2, mr * 5.2);
  const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  mg.addColorStop(0, '#ffe1a0');
  mg.addColorStop(1, '#ff8a2a');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();
  if (!moonFree) {
    ctx.strokeStyle = `rgba(124,255,79,${0.45 + 0.25 * Math.sin(time * 3)})`;
    ctx.lineWidth = Math.max(2, s * 0.12);
    ctx.beginPath();
    ctx.arc(mx, my, mr * 1.18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(124,255,79,0.12)';
    ctx.fill();
  }
  // Magic sparkles swirling in the sky.
  const n = Math.round(24 * detail);
  for (let i = 0; i < n; i++) {
    const a = time * (0.3 + hash(i) * 0.4) + i;
    const rad = r.w * (0.15 + hash(i + 5) * 0.4);
    const x = mx + Math.cos(a) * rad;
    const y = my + Math.sin(a) * rad * 0.35;
    ctx.fillStyle = `rgba(124,255,79,${0.3 + 0.4 * Math.abs(Math.sin(time * 2 + i))})`;
    ctx.fillRect(x, y, 2, 2);
  }
  // The sleeping town far below.
  const [ta, tb] = cells(0.06, 1.4);
  for (let i = ta; i <= tb; i++) {
    const x = along(i * 1.4, 0.06);
    const h = s * (0.8 + hash(i) * 1.6);
    ctx.fillStyle = '#1a0a24';
    ctx.fillRect(x, ground - h - s * 1.2, s * 1.3, h);
    if (hash(i + 3) < 0.4) {
      ctx.fillStyle = 'rgba(255,200,110,0.7)';
      ctx.fillRect(x + s * 0.4, ground - h - s * 0.9, s * 0.2, s * 0.2);
    }
  }
  // Chimneys with curling smoke, and the roof ridge.
  const [ca, cb] = cells(0.45, 7);
  for (let i = ca; i <= cb; i++) {
    const x = along(i * 7 + hash(i) * 3, 0.45);
    const h = s * (1.3 + hash(i + 2) * 0.8);
    ctx.fillStyle = '#3a1a2a';
    ctx.fillRect(x - s * 0.4, ground - s * 0.6 - h, s * 0.8, h);
    ctx.fillStyle = '#4a2236';
    ctx.fillRect(x - s * 0.5, ground - s * 0.6 - h, s * 1, s * 0.2);
    for (let k = 0; k < 3; k++) {
      const t = (time * 0.5 + k / 3 + hash(i)) % 1;
      ctx.fillStyle = `rgba(150,130,170,${0.35 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(x + Math.sin(t * 6 + i) * s * 0.3, ground - s * 0.6 - h - t * s * 2.5, s * (0.2 + t * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#24112c';
  ctx.beginPath();
  ctx.moveTo(r.x, ground);
  const [ra, rb] = cells(0.45, 3);
  for (let i = ra; i <= rb; i++) {
    const x = along(i * 3, 0.45);
    ctx.lineTo(x, ground - s * 0.6);
    ctx.lineTo(x + s * 1.5, ground - s * 0.9);
  }
  ctx.lineTo(r.x + r.w, ground);
  ctx.closePath();
  ctx.fill();
}
