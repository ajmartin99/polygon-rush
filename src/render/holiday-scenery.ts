import { VIEW_TOP } from '../game/constants';
import type { Palette } from './biomes';
import { drawSnowfall } from './wonderland';

/**
 * The Holiday Run's scenery, one look per chapter: the Snowy Pine Forest,
 * the Frozen Lake, Santa's Workshop, Candy Cane Peaks and the villain's lair
 * (Jack Frost's Ice Palace or Krampus's Cavern).
 */
const pal = (p: Partial<Palette> & Pick<Palette, 'name' | 'skyTop' | 'skyBottom'>): Palette => ({
  far: '#ffffff',
  mid: '#2a3a6a',
  ground: '#e8f2ff',
  groundDark: '#8aa6d0',
  groundEdge: '#ffffff',
  groundTile: '#d0e2fa',
  block: '#6a8ac8',
  blockDark: '#3a5a98',
  blockEdge: '#eaf6ff',
  hazard: '#7ccfff',
  hazardDark: '#2a7ab8',
  hazardEdge: '#ffffff',
  accent: '#ffd23f',
  stars: 0.6,
  ...p,
});

export const HOLIDAY_PALETTES: Palette[] = [
  pal({ name: 'Snowy Pine Forest', skyTop: '#0b1a3e', skyBottom: '#3a5f9a', stars: 0.8, block: '#5a3a26', blockDark: '#2e1c12', blockEdge: '#ffffff' }),
  pal({ name: 'The Frozen Lake', skyTop: '#06233a', skyBottom: '#2f8aa8', ground: '#bfe8ff', groundDark: '#5aa0c8', groundEdge: '#ffffff', groundTile: '#a8dcf8', stars: 0.9 }),
  pal({
    name: 'Santa’s Workshop',
    skyTop: '#3a0e14',
    skyBottom: '#5a1a1e',
    ground: '#7a4a26',
    groundDark: '#3a2010',
    groundEdge: '#ffcf7a',
    groundTile: '#8a5a32',
    block: '#2fbf71',
    blockDark: '#126a3a',
    blockEdge: '#ffd23f',
    hazard: '#e8304a',
    hazardDark: '#8a0a1a',
    hazardEdge: '#ffffff',
    stars: 0,
  }),
  pal({ name: 'Candy Cane Peaks', skyTop: '#2a1650', skyBottom: '#ff8aa8', block: '#e8304a', blockDark: '#a01028', blockEdge: '#ffffff', hazard: '#ffffff', hazardDark: '#e8304a', hazardEdge: '#a01028', stars: 0.5 }),
  // The lair: Jack Frost's Ice Palace (Krampus's Cavern below).
  pal({ name: 'Jack Frost’s Ice Palace', skyTop: '#0a1240', skyBottom: '#4a8ad8', ground: '#cfeeff', groundDark: '#6aa8d8', groundTile: '#b8e2fa', block: '#7ccfff', blockDark: '#2a7ab8', stars: 0.4 }),
];

export const KRAMPUS_LAIR: Palette = pal({
  name: 'Krampus’s Cavern',
  skyTop: '#120606',
  skyBottom: '#3a0e0a',
  ground: '#3a2a26',
  groundDark: '#1a100c',
  groundEdge: '#ff7a3a',
  groundTile: '#4a3430',
  block: '#4a3430',
  blockDark: '#1a100c',
  blockEdge: '#ff9a5a',
  hazard: '#ff5a3a',
  hazardDark: '#7a1a0a',
  hazardEdge: '#ffd8a8',
  stars: 0,
});

/** The Christmas look for the home screen's backdrop run. */
export const WONDERLAND: Palette = pal({ name: 'Christmas Wonderland', skyTop: '#0b1a3e', skyBottom: '#5a7ac8', far: '#ffe8b0', mid: '#2a4a7a', block: '#e8304a', blockDark: '#a01028', blockEdge: '#ffffff', hazard: '#2fbf71', hazardDark: '#126a3a', hazardEdge: '#ffffff', stars: 0.9 });

/** The palette for a Holiday Run chapter (the lair depends on the villain). */
export function holidayPalette(chapter: number, krampus: boolean): Palette {
  return chapter >= 4 && krampus ? KRAMPUS_LAIR : HOLIDAY_PALETTES[Math.min(chapter, HOLIDAY_PALETTES.length - 1)];
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

export interface HolidayView {
  chapter: number;
  fade: number;
  krampus: boolean;
  /** The villain is beaten: Christmas is saved (the lair brightens). */
  saved: boolean;
}

export function drawHolidayScenery(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, view: HolidayView, time: number, beat: number, detail: number, calm: boolean): void {
  chapter(ctx, r, cam, view.chapter, view, time, beat, detail, calm);
  if (view.fade > 0 && view.chapter + 1 <= 4) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, view.fade);
    chapter(ctx, r, cam, view.chapter + 1, view, time, beat, detail, calm);
    ctx.restore();
  }
  // Snow falls everywhere outdoors.
  if (view.chapter !== 2 && !(view.chapter === 4 && view.krampus)) drawSnowfall(ctx, r, time, 0.6 * detail, calm);
}

function chapter(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, c: number, view: HolidayView, time: number, beat: number, detail: number, calm: boolean): void {
  const p = holidayPalette(c, view.krampus);
  const s = cam.scale;
  const ground = cam.top + VIEW_TOP * s;
  const sky = ctx.createLinearGradient(0, r.y, 0, ground);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(1, p.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const along = (wx: number, par: number) => r.x + (wx - cam.x * par) * s;
  const cells = (par: number, cell: number): [number, number] => {
    const a = Math.floor((cam.x * par) / cell) - 1;
    return [a, a + Math.ceil(r.w / s / cell) + 2];
  };
  if (p.stars > 0) stars(ctx, r, cam, p.stars * detail, time);
  if (c === 0) forest(ctx, r, cam, s, ground, along, cells, time);
  else if (c === 1) lake(ctx, r, cam, s, ground, along, cells, time, calm);
  else if (c === 2) workshop(ctx, r, s, ground, along, cells, time, beat);
  else if (c === 3) peaks(ctx, r, cam, s, ground, along, cells, time);
  else if (view.krampus) cavern(ctx, r, s, ground, along, cells, time, view.saved);
  else palace(ctx, r, s, ground, along, cells, time, beat, view.saved);
}

type Along = (wx: number, par: number) => number;
type Cells = (par: number, cell: number) => [number, number];

function stars(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, amount: number, time: number): void {
  const n = Math.round(60 * amount);
  for (let i = 0; i < n; i++) {
    const px = (((hash(i) * r.w - cam.x * cam.scale * 0.03) % r.w) + r.w) % r.w;
    const py = r.y + hash(i + 99) * r.h * 0.45;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * (1 + hash(i + 7) * 2) + i));
    ctx.fillStyle = `rgba(255,255,255,${0.25 + tw * 0.5})`;
    ctx.fillRect(r.x + px, py, hash(i + 3) > 0.85 ? 2.2 : 1.3, hash(i + 3) > 0.85 ? 2.2 : 1.3);
  }
}

/** Snowy hills: a soft ridge at parallax `par`. */
function snowHills(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, ground: number, par: number, height: number, color: string, seed: number): void {
  const s = cam.scale;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(r.x, ground + s);
  for (let px = 0; px <= r.w + 8; px += 8) {
    const wx = (px / s + cam.x * par) * 0.3 + seed;
    ctx.lineTo(r.x + px, ground - height * s * (0.55 + 0.25 * Math.sin(wx) + 0.2 * Math.sin(wx * 2.1 + 1.3)));
  }
  ctx.lineTo(r.x + r.w + 8, ground + s);
  ctx.closePath();
  ctx.fill();
}

/** A snow-capped pine, base at (x, y), `h` tall. */
function pine(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, green: string): void {
  ctx.fillStyle = '#3a2416';
  ctx.fillRect(x - h * 0.04, y - h * 0.12, h * 0.08, h * 0.12);
  for (let i = 0; i < 3; i++) {
    const top = y - h * (0.45 + i * 0.25);
    const bot = y - h * (0.1 + i * 0.25);
    const w = h * (0.32 - i * 0.07);
    ctx.fillStyle = green;
    ctx.beginPath();
    ctx.moveTo(x, top - h * 0.12);
    ctx.lineTo(x + w, bot);
    ctx.lineTo(x - w, bot);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, top - h * 0.12);
    ctx.lineTo(x + w * 0.45, top + h * 0.03);
    ctx.lineTo(x, top);
    ctx.lineTo(x - w * 0.45, top + h * 0.03);
    ctx.closePath();
    ctx.fill();
  }
}

function forest(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, s: number, ground: number, along: Along, cells: Cells, time: number): void {
  // Big moon and a far, snowy ridge.
  const mx = r.x + r.w * 0.75;
  const my = r.y + r.h * 0.2;
  const mg = ctx.createRadialGradient(mx, my, s * 0.5, mx, my, s * 3);
  mg.addColorStop(0, 'rgba(255,250,230,0.9)');
  mg.addColorStop(0.3, 'rgba(255,250,230,0.25)');
  mg.addColorStop(1, 'rgba(255,250,230,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(mx - s * 3, my - s * 3, s * 6, s * 6);
  snowHills(ctx, r, cam, ground, 0.06, 4.5, '#9ab4dc', 0.7);
  snowHills(ctx, r, cam, ground, 0.14, 3, '#d8e6fa', 3.1);
  const [a, b] = cells(0.3, 2.2);
  for (let i = a; i <= b; i++) {
    if (hash(i) < 0.25) continue;
    pine(ctx, along(i * 2.2 + hash(i + 2), 0.3), ground - s * 0.3, s * (2 + hash(i + 5) * 1.6), '#1d4a3a');
  }
  // A log cabin with a warm window and smoke.
  const [ca, cb] = cells(0.45, 30);
  for (let i = ca; i <= cb; i++) {
    const x = along(i * 30 + hash(i) * 10, 0.45);
    ctx.fillStyle = '#5a3a26';
    ctx.fillRect(x - s * 1.2, ground - s * 1.6, s * 2.4, s * 1.6);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x - s * 1.5, ground - s * 1.5);
    ctx.lineTo(x, ground - s * 2.6);
    ctx.lineTo(x + s * 1.5, ground - s * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,200,100,${0.8 + 0.2 * Math.sin(time * 5 + i)})`;
    ctx.fillRect(x - s * 0.3, ground - s * 1.1, s * 0.6, s * 0.5);
    for (let k = 0; k < 3; k++) {
      const t = (time * 0.4 + k / 3) % 1;
      ctx.fillStyle = `rgba(220,220,240,${0.4 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(x + s * 0.7 + Math.sin(t * 5) * s * 0.3, ground - s * 2.3 - t * s * 2, s * (0.2 + t * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const [na, nb] = cells(0.55, 1.6);
  for (let i = na; i <= nb; i++) {
    if (hash(i + 9) < 0.55) continue;
    pine(ctx, along(i * 1.6, 0.55), ground, s * (1.2 + hash(i) * 0.6), '#14382c');
  }
}

function lake(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, s: number, ground: number, along: Along, cells: Cells, time: number, calm: boolean): void {
  // Northern lights.
  for (let band = 0; band < 3; band++) {
    ctx.beginPath();
    for (let px = 0; px <= r.w + 10; px += 10) {
      const y = r.y + r.h * (0.18 + band * 0.07) + Math.sin(px * 0.006 + time * (calm ? 0.1 : 0.5) + band) * s * 0.8;
      if (px === 0) ctx.moveTo(r.x + px, y);
      else ctx.lineTo(r.x + px, y);
    }
    ctx.strokeStyle = ['rgba(80,255,170,0.25)', 'rgba(120,200,255,0.2)', 'rgba(200,120,255,0.18)'][band];
    ctx.lineWidth = s * (0.9 - band * 0.2);
    ctx.stroke();
  }
  snowHills(ctx, r, cam, ground - s * 1.2, 0.05, 3.5, '#8ab8e0', 2.4);
  // The frozen lake: a shiny sheet with cracks and reflections.
  const ice = ctx.createLinearGradient(0, ground - s * 1.4, 0, ground);
  ice.addColorStop(0, '#9ad8f8');
  ice.addColorStop(1, '#5aa8d8');
  ctx.fillStyle = ice;
  ctx.fillRect(r.x, ground - s * 1.4, r.w, s * 1.4);
  const [a, b] = cells(0.4, 3);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.04);
  for (let i = a; i <= b; i++) {
    const x = along(i * 3, 0.4);
    ctx.beginPath();
    ctx.moveTo(x, ground - s * 1.3);
    ctx.lineTo(x + s * 0.6, ground - s * 0.9);
    ctx.lineTo(x + s * 0.3, ground - s * 0.4);
    ctx.stroke();
  }
  // An ice cave roof with hanging icicles (where the falling ones come from).
  const [ia, ib] = cells(1, 0.7);
  ctx.fillStyle = '#d8f0ff';
  ctx.fillRect(r.x, r.y, r.w, s * 0.5);
  for (let i = ia; i <= ib; i++) {
    const x = along(i * 0.7, 1);
    const len = s * (0.4 + hash(i) * 0.8);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.2, r.y + s * 0.45);
    ctx.lineTo(x + s * 0.2, r.y + s * 0.45);
    ctx.lineTo(x, r.y + s * 0.45 + len);
    ctx.closePath();
    ctx.fill();
  }
}

function workshop(ctx: CanvasRenderingContext2D, r: Area, s: number, ground: number, along: Along, cells: Cells, time: number, beat: number): void {
  // Wooden plank walls.
  const [wa, wb] = cells(0.5, 1.4);
  for (let i = wa; i <= wb; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(120,60,30,0.5)' : 'rgba(150,80,40,0.5)';
    ctx.fillRect(along(i * 1.4, 0.5), r.y, s * 1.4, ground - r.y);
  }
  // Frosty windows, shelves of toys, big turning gears.
  const [a, b] = cells(0.5, 10);
  for (let i = a; i <= b; i++) {
    const x = along(i * 10, 0.5);
    ctx.fillStyle = '#1a3a6a';
    ctx.fillRect(x - s * 1, ground - s * 6, s * 2, s * 2.6);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let k = 0; k < 6; k++) ctx.fillRect(x - s * 1 + hash(i * 7 + k) * s * 2, ground - s * 6 + ((time * 0.3 + hash(k + i)) % 1) * s * 2.6, 2, 2);
    ctx.strokeStyle = '#3a2010';
    ctx.lineWidth = Math.max(2, s * 0.14);
    ctx.strokeRect(x - s * 1, ground - s * 6, s * 2, s * 2.6);
    // Shelf with toys.
    const sx = along(i * 10 + 5, 0.5);
    ctx.fillStyle = '#5a3018';
    ctx.fillRect(sx - s * 1.6, ground - s * 3.6, s * 3.2, s * 0.15);
    const toys = ['#e8304a', '#3e7bff', '#2fbf71', '#ffd23f'];
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = toys[(k + i) % 4];
      const tx = sx - s * 1.3 + k * s * 0.8;
      if (k % 2) {
        ctx.beginPath();
        ctx.arc(tx, ground - s * 3.85, s * 0.25, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(tx - s * 0.22, ground - s * 4.1, s * 0.44, s * 0.5);
    }
    // A gear turning with the music.
    gear(ctx, along(i * 10 + 7.5, 0.5), ground - s * 1.6, s * 0.9, time * 0.8 + i, '#8a6a3a');
  }
  // Garland with string lights along the top, blinking on the beat.
  const pulse = Math.pow(1 - Math.min(1, beat), 2);
  const [ga, gb] = cells(1, 1.2);
  ctx.strokeStyle = '#1f6a3a';
  ctx.lineWidth = s * 0.25;
  ctx.beginPath();
  for (let i = ga; i <= gb; i++) {
    const x = along(i * 1.2, 1);
    ctx.lineTo(x, r.y + s * 0.4 + (i % 2) * s * 0.25);
  }
  ctx.stroke();
  const colors = ['#ff4f5e', '#ffd23f', '#3ad7ff', '#3ee6b0'];
  for (let i = ga; i <= gb; i++) {
    const x = along(i * 1.2, 1);
    const on = (i + Math.floor(time * 2)) % 2 === 0 || pulse > 0.5;
    ctx.fillStyle = on ? colors[((i % 4) + 4) % 4] : 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(x, r.y + s * 0.6 + (i % 2) * s * 0.25, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function gear(ctx: CanvasRenderingContext2D, x: number, y: number, rr: number, angle: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const rad = i % 2 ? rr * 0.8 : rr;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3a2010';
  ctx.beginPath();
  ctx.arc(0, 0, rr * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function peaks(ctx: CanvasRenderingContext2D, r: Area, cam: Cam, s: number, ground: number, along: Along, cells: Cells, time: number): void {
  // Candy-cane striped mountains.
  const [a, b] = cells(0.12, 9);
  for (let i = a; i <= b; i++) {
    const x = along(i * 9 + hash(i) * 3, 0.12);
    const h = s * (4 + hash(i + 1) * 3);
    const w = s * (3 + hash(i + 2) * 1.5);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - w, ground);
    ctx.lineTo(x, ground - h);
    ctx.lineTo(x + w, ground);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = '#e8304a';
    ctx.lineWidth = s * 0.5;
    for (let k = -8; k < 8; k++) {
      ctx.beginPath();
      ctx.moveTo(x - w + k * s * 1.2, ground);
      ctx.lineTo(x - w + k * s * 1.2 + h, ground - h);
      ctx.stroke();
    }
    ctx.restore();
  }
  snowHills(ctx, r, cam, ground, 0.3, 1.6, '#fff4f8', 5.2);
  // Gumdrops and lollipops along the way.
  const [ga, gb] = cells(0.5, 3.5);
  const sweets = ['#ff7ac6', '#3ee6b0', '#ffd23f', '#3ad7ff'];
  for (let i = ga; i <= gb; i++) {
    const x = along(i * 3.5 + hash(i) * 2, 0.5);
    if (hash(i + 4) < 0.5) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.1;
      ctx.beginPath();
      ctx.moveTo(x, ground);
      ctx.lineTo(x, ground - s * 1.5);
      ctx.stroke();
      ctx.save();
      ctx.translate(x, ground - s * 1.8);
      ctx.rotate(time + i);
      ctx.fillStyle = sweets[((i % 4) + 4) % 4];
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      for (let k = 0; k < 30; k++) ctx.lineTo(Math.cos(k * 0.6) * k * s * 0.014, Math.sin(k * 0.6) * k * s * 0.014);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = sweets[((i + 1) % 4 + 4) % 4];
      ctx.beginPath();
      ctx.arc(x, ground, s * 0.5, Math.PI, 0);
      ctx.fill();
    }
  }
}

function palace(ctx: CanvasRenderingContext2D, r: Area, s: number, ground: number, along: Along, cells: Cells, time: number, beat: number, saved: boolean): void {
  // Ice-crystal pillars and frosted arches.
  const [a, b] = cells(0.45, 6);
  for (let i = a; i <= b; i++) {
    const x = along(i * 6, 0.45);
    const g = ctx.createLinearGradient(x - s * 0.5, 0, x + s * 0.5, 0);
    g.addColorStop(0, 'rgba(160,220,255,0.7)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(120,190,240,0.7)');
    ctx.fillStyle = g;
    ctx.fillRect(x - s * 0.5, r.y, s * 1, ground - r.y);
    ctx.strokeStyle = 'rgba(200,240,255,0.6)';
    ctx.lineWidth = s * 0.15;
    ctx.beginPath();
    ctx.arc(x + s * 3, ground - s * 5, s * 3, Math.PI, 0);
    ctx.stroke();
  }
  // An ice chandelier glinting on the beat.
  const pulse = Math.pow(1 - Math.min(1, beat), 3);
  const cx = r.x + r.w * 0.5;
  ctx.fillStyle = `rgba(220,245,255,${0.6 + pulse * 0.4})`;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * s * 0.5 - s * 0.15, r.y + s * 0.6);
    ctx.lineTo(cx + i * s * 0.5 + s * 0.15, r.y + s * 0.6);
    ctx.lineTo(cx + i * s * 0.5, r.y + s * (1.6 - Math.abs(i) * 0.2));
    ctx.closePath();
    ctx.fill();
  }
  if (saved) {
    // Christmas is saved: warm light melts in.
    ctx.fillStyle = `rgba(255,200,120,${0.18 + 0.05 * Math.sin(time * 2)})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}

function cavern(ctx: CanvasRenderingContext2D, r: Area, s: number, ground: number, along: Along, cells: Cells, time: number, saved: boolean): void {
  // Rocky walls lit by fire bowls, chains hanging from the dark.
  const [a, b] = cells(0.35, 2.5);
  for (let i = a; i <= b; i++) {
    const x = along(i * 2.5, 0.35);
    ctx.fillStyle = 'rgba(30,14,10,0.8)';
    ctx.beginPath();
    ctx.moveTo(x - s * 1.4, r.y);
    ctx.lineTo(x, r.y + s * (1 + hash(i) * 1.6));
    ctx.lineTo(x + s * 1.4, r.y);
    ctx.closePath();
    ctx.fill();
  }
  const [ca, cb] = cells(0.5, 5);
  for (let i = ca; i <= cb; i++) {
    const x = along(i * 5 + 1.5, 0.5);
    ctx.strokeStyle = 'rgba(160,160,170,0.6)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    const len = s * (2 + hash(i) * 2);
    const sway = Math.sin(time * 1.5 + i) * s * 0.2;
    for (let k = 0; k < len / (s * 0.25); k++) {
      ctx.beginPath();
      ctx.ellipse(x + (sway * k * s * 0.25) / len, r.y + k * s * 0.25, s * 0.07, s * 0.11, k % 2 ? 0 : Math.PI / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Fire bowl.
    const fx = along(i * 5 + 4, 0.5);
    const fy = ground - s * 1.6;
    ctx.fillStyle = '#2a1a14';
    ctx.fillRect(fx - s * 0.08, fy, s * 0.16, s * 1.6);
    ctx.beginPath();
    ctx.ellipse(fx, fy, s * 0.5, s * 0.15, 0, 0, Math.PI);
    ctx.fill();
    const fl = 0.8 + 0.2 * Math.sin(time * 15 + i);
    const g = ctx.createRadialGradient(fx, fy - s * 0.4, 0, fx, fy - s * 0.4, s * 1.4);
    g.addColorStop(0, `rgba(255,150,60,${0.55 * fl})`);
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - s * 1.4, fy - s * 1.8, s * 2.8, s * 2.8);
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath();
    ctx.ellipse(fx, fy - s * 0.3 * fl, s * 0.22, s * 0.4 * fl, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (saved) {
    ctx.fillStyle = 'rgba(255,220,160,0.15)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}

/** Santa's sleigh under the runner in Candy Cane Peaks, pulled by a reindeer. */
export function drawSleigh(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, time: number): void {
  ctx.save();
  ctx.translate(x, y);
  // Reindeer ahead, legs galloping.
  const gal = Math.sin(time * 14) * 0.3;
  ctx.fillStyle = '#8a5a32';
  ctx.beginPath();
  ctx.ellipse(s * 1.6, -s * 0.1, s * 0.45, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 2.1, -s * 0.38, s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8304a';
  ctx.beginPath();
  ctx.arc(s * 2.27, -s * 0.36, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(s * 2.05, -s * 0.52);
  ctx.lineTo(s * 1.95, -s * 0.8);
  ctx.moveTo(s * 2.15, -s * 0.52);
  ctx.lineTo(s * 2.3, -s * 0.78);
  for (const lx of [1.35, 1.85]) {
    ctx.moveTo(s * lx, s * 0.05);
    ctx.lineTo(s * (lx + gal * 0.4), s * 0.35);
  }
  ctx.stroke();
  // Reins.
  ctx.strokeStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(s * 0.6, -s * 0.15);
  ctx.lineTo(s * 1.25, -s * 0.12);
  ctx.stroke();
  // The sleigh: red body, gold runners.
  ctx.fillStyle = '#e8304a';
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.05);
  ctx.lineTo(s * 0.65, -s * 0.05);
  ctx.quadraticCurveTo(s * 0.8, s * 0.35, s * 0.4, s * 0.35);
  ctx.lineTo(-s * 0.55, s * 0.35);
  ctx.quadraticCurveTo(-s * 0.85, s * 0.2, -s * 0.7, -s * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, s * 0.5);
  ctx.lineTo(s * 0.55, s * 0.5);
  ctx.quadraticCurveTo(s * 0.85, s * 0.5, s * 0.8, s * 0.3);
  ctx.stroke();
  ctx.restore();
}
