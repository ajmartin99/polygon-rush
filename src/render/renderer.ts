import { CEIL, VIEW_BOTTOM, VIEW_H, VIEW_TOP } from '../game/constants';
import type { GameSession } from '../game/session';
import type { Racer } from '../game/racer';
import { SHAPE_INFO } from '../game/shapes';
import type { WorldObj } from '../game/world';
import { skinById } from '../meta/catalog';
import { drawCharacter } from './character';

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewSpec {
  racer: Racer;
  rect: ViewRect;
  /** Optional label (duel: "P1"). */
  label?: string;
  labelColor?: string;
}

interface Camera {
  x: number;
  scale: number;
  /** Top of the play band in canvas px (letterboxing on narrow screens). */
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAL = {
  bgTop: '#2a1b6b',
  bgBottom: '#120a33',
  ground: '#3b2a8a',
  groundEdge: '#9b84ff',
  block: '#5a3fd6',
  blockEdge: '#c9bcff',
  spike: '#ff5f7a',
  spikeEdge: '#ffffff',
  gem: '#3ad7ff',
};

const scratch: WorldObj[] = [];

// Older Android WebViews lack roundRect: provide a minimal version.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (this: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r?: number | DOMPointInit | (number | DOMPointInit)[]) {
    const rad = Math.max(0, Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2));
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
  };
}

/** Canvas renderer for the game world and in-game HUD. */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  width = 1;
  height = 1;
  private cams = new Map<string, number>();
  maxDpr = 2;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = w;
    this.height = h;
  }

  resetCameras(): void {
    this.cams.clear();
  }

  /** Full-screen or split views for the current game mode. */
  layout(views: number): ViewRect[] {
    if (views <= 1) return [{ x: 0, y: 0, w: this.width, h: this.height }];
    const h2 = Math.floor(this.height / 2);
    return [
      { x: 0, y: 0, w: this.width, h: h2 },
      { x: 0, y: h2, w: this.width, h: this.height - h2 },
    ];
  }

  private camera(view: ViewSpec, dt: number): Camera {
    const r = view.rect;
    // Keep at least a 1.45:1 play band; letterbox on narrow (portrait) screens.
    const band = Math.min(r.h, r.w / 1.45);
    const scale = band / VIEW_H;
    const top = r.y + (r.h - band) / 2;
    const visibleW = r.w / scale;
    const target = view.racer.x - visibleW * 0.3;
    const prev = this.cams.get(view.racer.id);
    let x = target;
    if (prev !== undefined && Math.abs(target - prev) < 30) {
      // Smooth only big jumps (respawns); normal motion stays locked.
      x = Math.abs(target - prev) > 1.5 ? prev + (target - prev) * Math.min(1, dt * 8) : target;
    }
    this.cams.set(view.racer.id, x);
    return { x, scale, top, left: r.x, width: r.w, height: band };
  }

  render(session: GameSession, views: ViewSpec[], dt: number, time: number): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAL.bgBottom;
    ctx.fillRect(0, 0, this.width, this.height);
    for (const v of views) this.drawView(session, v, dt, time);
  }

  private drawView(session: GameSession, view: ViewSpec, dt: number, time: number): void {
    const ctx = this.ctx;
    const cam = this.camera(view, dt);
    const r = view.rect;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();

    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, PAL.bgTop);
    g.addColorStop(1, PAL.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    const sx = (x: number) => r.x + (x - cam.x) * cam.scale;
    const sy = (y: number) => cam.top + (VIEW_TOP - y) * cam.scale;
    const s = cam.scale;
    const x0 = cam.x - 2;
    const x1 = cam.x + r.w / s + 2;

    session.world.query(x0, x1, scratch);
    const me = view.racer;

    for (const o of scratch) {
      switch (o.kind) {
        case 'solid': {
          const top = Math.min(o.y1, VIEW_TOP + 1);
          const bot = Math.max(o.y0, VIEW_BOTTOM - 1);
          const px = sx(o.x0);
          const pw = (o.x1 - o.x0) * s + 0.5;
          const py = sy(top);
          const ph = (top - bot) * s;
          if (o.role === 'ground' || o.role === 'ceil') {
            ctx.fillStyle = PAL.ground;
            ctx.fillRect(px, py, pw, ph);
            ctx.fillStyle = PAL.groundEdge;
            const edgeY = o.role === 'ground' ? sy(o.y1) : sy(o.y0) - 3;
            ctx.fillRect(px, edgeY, pw, Math.max(2, s * 0.08));
          } else {
            ctx.fillStyle = PAL.block;
            ctx.fillRect(px, py, pw - 0.5, ph);
            ctx.strokeStyle = PAL.blockEdge;
            ctx.lineWidth = Math.max(1.5, s * 0.06);
            ctx.strokeRect(px + 1, py + 1, pw - 2.5, ph - 2);
          }
          break;
        }
        case 'spike': {
          const bx = sx(o.x);
          const by = sy(o.y);
          const hw = 0.5 * o.size * s;
          const h = o.size * s * o.dir;
          ctx.beginPath();
          ctx.moveTo(bx - hw, by);
          ctx.lineTo(bx, by - h);
          ctx.lineTo(bx + hw, by);
          ctx.closePath();
          ctx.fillStyle = PAL.spike;
          ctx.fill();
          ctx.strokeStyle = PAL.spikeEdge;
          ctx.lineWidth = Math.max(1.5, s * 0.06);
          ctx.stroke();
          break;
        }
        case 'saw': {
          const cx = sx(o.x);
          const cy = sy(o.y);
          const rr = o.r * s;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(time * 6);
          ctx.beginPath();
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const rad = i % 2 ? rr * 0.78 : rr;
            ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
          }
          ctx.closePath();
          ctx.fillStyle = PAL.spike;
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(1.5, s * 0.05);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'gem': {
          if (me.collected.has(o.id)) break;
          const gx = sx(o.x);
          const gy = sy(o.y) + Math.sin(time * 4 + o.x) * s * 0.06;
          const gs = (o.big ? 0.42 : 0.26) * s;
          ctx.beginPath();
          ctx.moveTo(gx, gy - gs);
          ctx.lineTo(gx + gs * 0.8, gy);
          ctx.lineTo(gx, gy + gs);
          ctx.lineTo(gx - gs * 0.8, gy);
          ctx.closePath();
          ctx.fillStyle = o.big ? '#ff7af0' : PAL.gem;
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(1, s * 0.035);
          ctx.stroke();
          break;
        }
        case 'pad': {
          const px = sx(o.x);
          const py = sy(o.y);
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath();
          ctx.ellipse(px, py, 0.45 * s, 0.22 * s, 0, o.dir > 0 ? Math.PI : 0, o.dir > 0 ? Math.PI * 2 : Math.PI);
          ctx.fill();
          break;
        }
        case 'orb': {
          if (me.body.usedOrb === o.id) ctx.globalAlpha = 0.35;
          ctx.strokeStyle = '#ffd23f';
          ctx.lineWidth = Math.max(2, s * 0.12);
          ctx.beginPath();
          ctx.arc(sx(o.x), sy(o.y), (0.38 + Math.sin(time * 6) * 0.04) * s, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'portal': {
          const px = sx(o.x);
          const color = SHAPE_INFO[o.mode].color;
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(3, s * 0.22);
          ctx.beginPath();
          ctx.ellipse(px, sy(CEIL / 2), 0.7 * s, 3.4 * s, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = color;
          ctx.fill();
          ctx.globalAlpha = 1;
          drawCharacter(ctx, px, sy(CEIL / 2), s * 0.8, o.mode, skinById('classic'), { alpha: 0.9, lookX: 1 });
          break;
        }
        case 'pickup': {
          if (me.collected.has(o.id)) break;
          const px = sx(o.x);
          const py = sy(o.y) + Math.sin(time * 3) * s * 0.08;
          ctx.fillStyle = o.type === 'heart' ? '#ff4f6d' : o.type === 'shield' ? '#3ad7ff' : '#ff5f5f';
          ctx.beginPath();
          ctx.arc(px, py, 0.38 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${Math.round(0.42 * s)}px Fredoka, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(o.type === 'heart' ? '♥' : o.type === 'shield' ? 'S' : 'U', px, py + 1);
          break;
        }
        case 'box': {
          if (me.collected.has(o.id)) break;
          const px = sx(o.x);
          const py = sy(o.y) + Math.sin(time * 3 + o.x) * s * 0.08;
          const bs = 0.5 * s;
          ctx.fillStyle = '#ff9f1c';
          ctx.fillRect(px - bs, py - bs, bs * 2, bs * 2);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(2, s * 0.06);
          ctx.strokeRect(px - bs, py - bs, bs * 2, bs * 2);
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${Math.round(0.7 * s)}px Fredoka, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', px, py + 2);
          break;
        }
        case 'finish': {
          const px = sx(o.x);
          const cell = 0.5 * s;
          for (let y = 0; y < 16; y++) {
            for (let c = 0; c < 2; c++) {
              ctx.fillStyle = (y + c) % 2 ? '#ffffff' : '#1a1040';
              ctx.fillRect(px - cell + c * cell, sy(CEIL) + y * cell, cell, cell);
            }
          }
          break;
        }
        default:
          break;
      }
    }

    // Racers: others first (translucent), then the view's own racer on top.
    for (const other of session.racers) {
      if (other === me || other.dead) continue;
      this.drawRacer(other, sx, sy, s, time, 0.55);
    }
    if (!me.dead) this.drawRacer(me, sx, sy, s, time, 1);

    ctx.restore();
  }

  private drawRacer(r: Racer, sx: (x: number) => number, sy: (y: number) => number, s: number, time: number, alpha: number): void {
    const ctx = this.ctx;
    const b = r.body;
    const px = sx(b.x);
    const py = sy(b.y);
    const blinkOut = r.invuln > 0 && Math.floor(time * 14) % 2 === 0;
    const a = alpha * (blinkOut ? 0.35 : 1);
    if (r.shield) {
      ctx.strokeStyle = 'rgba(58,215,255,0.8)';
      ctx.lineWidth = Math.max(2, s * 0.07);
      ctx.beginPath();
      ctx.arc(px, py, 0.72 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    const upright = b.mode === 'square' || b.mode === 'hexagon';
    drawCharacter(ctx, px, py, s * 0.86, b.mode, skinById(r.skin), {
      rot: -b.rot,
      faceRot: upright ? 0 : -b.rot,
      squash: r.squash,
      lookX: 0.6,
      lookY: Math.max(-1, Math.min(1, -b.vy / 20)),
      blink: r.blink > 0 ? 1 : 0,
      time,
      alpha: a,
    });
    if (r.snow > 0) {
      ctx.fillStyle = 'rgba(200,240,255,0.55)';
      ctx.beginPath();
      ctx.arc(px, py, 0.6 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    if (alpha < 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `600 ${Math.round(0.36 * s)}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(r.name, px, py - 0.65 * s);
    }
  }
}
