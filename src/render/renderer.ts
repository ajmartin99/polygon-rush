import { CEIL, VIEW_BOTTOM, VIEW_H, VIEW_TOP } from '../game/constants';
import type { GameSession } from '../game/session';
import type { Racer } from '../game/racer';
import { SHAPE_INFO, type ShapeMode } from '../game/shapes';
import { sawY, type World, type WorldObj } from '../game/world';
import { skinById } from '../meta/catalog';
import { darken, lighten, rgba, type Palette } from './biomes';
import { drawCharacter } from './character';
import { Effects } from './effects';

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

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewSpec {
  racer: Racer;
  rect: ViewRect;
  /** Where the racer sits across the view (0..1, default 0.3). */
  focus?: number;
  label?: string;
  labelColor?: string;
}

export interface RenderOptions {
  /** World palette at a track position. */
  palette: (x: number) => Palette;
  /** 0 on the beat → 1 just before the next. */
  beat: number;
  /** Menu background: dim the scene behind the UI. */
  dim?: boolean;
  /** Vertical marker flags on the track (e.g. your best distance). */
  markers?: { x: number; label: string; color: string }[];
  /** Halloween dressing: moon and bats, ground fog, saws as jack-o'-lanterns. */
  haunted?: boolean;
  /** Secret eggs already found (drawn faded). */
  secretsFound?: readonly number[];
}

/** A free camera for scenes without a racer (the editor). */
export interface FreeView {
  x: number;
  scale: number;
  top: number;
  /** World → screen. */
  sx: (x: number) => number;
  sy: (y: number) => number;
  /** Screen → world. */
  wx: (px: number) => number;
  wy: (py: number) => number;
}

interface Camera {
  x: number;
  scale: number;
  top: number;
}

const scratch: WorldObj[] = [];
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Canvas renderer for the game world (backgrounds, track, racers, effects). */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly fx = new Effects();
  dpr = 1;
  width = 1;
  height = 1;
  maxDpr = 2;
  /** 0..1 — fewer background details on low quality. */
  detail = 1;
  private cams = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement, opts: { alpha?: boolean } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: opts.alpha ?? false })!;
    this.resize();
  }

  resize(): void {
    if (!this.canvas.clientWidth) {
      // Offscreen canvas (icons): keep the size it was given.
      this.width = this.canvas.width;
      this.height = this.canvas.height;
      return;
    }
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
    this.fx.clear();
  }

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
    const target = view.racer.x - visibleW * (view.focus ?? 0.3);
    const prev = this.cams.get(view.racer.id);
    let x = target;
    if (prev !== undefined && Math.abs(target - prev) < 30 && Math.abs(target - prev) > 1.5) {
      // Smooth only big jumps (respawns); normal motion stays locked.
      x = prev + (target - prev) * Math.min(1, dt * 8);
    }
    this.cams.set(view.racer.id, x);
    return { x, scale, top };
  }

  render(session: GameSession, views: ViewSpec[], dt: number, time: number, opts: RenderOptions): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0f0828';
    ctx.fillRect(0, 0, this.width, this.height);
    this.fx.update(dt);
    for (const v of views) this.drawView(session, v, dt, time, opts);
  }

  /** The runner's x for the view being drawn (moving saws follow it). */
  private runnerX = 0;
  private haunted = false;
  private secretsFound: readonly number[] = [];

  private drawView(session: GameSession, view: ViewSpec, dt: number, time: number, opts: RenderOptions): void {
    const ctx = this.ctx;
    const cam = this.camera(view, dt);
    this.runnerX = view.racer.x;
    this.haunted = !!opts.haunted;
    this.secretsFound = opts.secretsFound ?? [];
    const r = view.rect;
    const s = cam.scale;
    const pal = opts.palette(view.racer.x);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();

    let ox = 0;
    let oy = 0;
    if (this.fx.shake > 0) {
      ox = (Math.random() - 0.5) * this.fx.shake * s;
      oy = (Math.random() - 0.5) * this.fx.shake * s;
    }
    const sx = (x: number) => r.x + (x - cam.x) * s + ox;
    const sy = (y: number) => cam.top + (VIEW_TOP - y) * s + oy;
    const x0 = cam.x - 3;
    const x1 = cam.x + r.w / s + 3;

    this.drawBackground(r, cam, pal, time, opts.beat);
    if (opts.markers) for (const m of opts.markers) if (m.x > x0 && m.x < x1) this.drawMarker(sx(m.x), sy, s, m.label, m.color, time);

    const me = view.racer;
    this.drawTrack(session.world, x0, x1, sx, sy, s, pal, time, me.collected, me.body.usedOrb);
    if (this.haunted) this.drawFog(r, sy, s, cam.x, time);

    this.fx.draw(ctx, sx, sy, s, true, x0, x1);
    for (const other of session.racers) {
      if (other === me || other.dead) continue;
      // Hide name tags of rivals overlapping you so they never cover your racer.
      const near = Math.abs(other.x - me.x) < 1.4 && Math.abs(other.body.y - me.body.y) < 1.6;
      this.drawRacer(other, sx, sy, s, time, 0.6, pal, !near);
    }
    if (!me.dead) this.drawRacer(me, sx, sy, s, time, 1, pal);
    this.fx.draw(ctx, sx, sy, s, false, x0, x1);

    if (this.fx.flash > 0) {
      const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, r.h * 0.3, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, rgba(this.fx.flashColor, this.fx.flash * 0.7));
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    if (opts.dim) {
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, 'rgba(18,8,48,0.6)');
      g.addColorStop(0.55, 'rgba(18,8,48,0.38)');
      g.addColorStop(1, 'rgba(18,8,48,0.62)');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
  }

  /** Portals, finish line, solids and objects in [x0, x1]. */
  private drawTrack(world: World, x0: number, x1: number, sx: (x: number) => number, sy: (y: number) => number, s: number, pal: Palette, time: number, collected: Set<number> | null, usedOrb: number): void {
    world.query(x0, x1, scratch);
    for (const o of scratch) {
      if (o.kind === 'portal') this.drawPortal(o.x, o.mode, sx, sy, s, time);
      else if (o.kind === 'finish') this.drawFinish(o.x, sx, sy, s, time);
    }
    this.drawSolids(pal, sx, sy, s);
    for (const o of scratch) {
      switch (o.kind) {
        case 'spike':
          this.drawSpike(pal, sx(o.x), sy(o.y), o.size * s, o.dir);
          break;
        case 'saw':
          if (this.haunted) this.drawPumpkin(sx(o.x), sy(sawY(o, this.runnerX)), o.r * s, time + o.x);
          else this.drawSaw(pal, sx(o.x), sy(sawY(o, this.runnerX)), o.r * s, time);
          break;
        case 'pad':
          this.drawPad(sx(o.x), sy(o.y), s, o.dir, time);
          break;
        case 'orb':
          this.drawOrb(sx(o.x), sy(o.y), s, time, usedOrb === o.id);
          break;
        case 'gem':
          if (!collected?.has(o.id)) this.drawGem(sx(o.x), sy(o.y) + Math.sin(time * 4 + o.x) * s * 0.06, s, o.big, time + o.x);
          break;
        case 'pickup':
          if (!collected?.has(o.id)) this.drawPickup(o.type, sx(o.x), sy(o.y) + Math.sin(time * 3) * s * 0.08, s, time);
          break;
        case 'secret':
          if (!collected?.has(o.id)) this.drawEgg(sx(o.x), sy(o.y) + Math.sin(time * 2.5) * s * 0.07, s, time, !!this.secretsFound.includes(o.level));
          break;
        case 'box':
          if (!collected?.has(o.id)) this.drawBox(sx(o.x), sy(o.y) + Math.sin(time * 3 + o.x) * s * 0.08, s, time);
          break;
        default:
          break;
      }
    }
  }

  /**
   * Fit the playfield (VIEW_BOTTOM..VIEW_TOP) into `area` with the left edge
   * at world x = camX. Used by the editor, which owns its camera.
   */
  frameView(area: ViewRect, camX: number, zoom = 1): FreeView {
    const scale = (area.h / VIEW_H) * zoom;
    const top = area.y + (area.h - VIEW_H * scale) / 2;
    return {
      x: camX,
      scale,
      top,
      sx: (x: number) => area.x + (x - camX) * scale,
      sy: (y: number) => top + (VIEW_TOP - y) * scale,
      wx: (px: number) => camX + (px - area.x) / scale,
      wy: (py: number) => VIEW_TOP - (py - top) / scale,
    };
  }

  /** Draw part of a world centred on (cx, cy), `span` tiles wide, on a transparent canvas (palette icons). */
  drawIcon(world: World, cx: number, cy: number, span: number, pal: Palette, time = 0.5): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const s = W / span;
    this.drawTrack(world, cx - span, cx + span, (x) => W / 2 + (x - cx) * s, (y) => H / 2 - (y - cy) * s, s, pal, time, null, -1);
  }

  /** Draw a world with a free camera (no racer): background, track and an overlay. */
  renderScene(world: World, view: FreeView, opts: { palette: Palette; time: number; beat: number; dt: number; overlay?: (ctx: CanvasRenderingContext2D, v: FreeView) => void }): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const full: ViewRect = { x: 0, y: 0, w: this.width, h: this.height };
    this.fx.update(opts.dt);
    ctx.save();
    this.drawBackground(full, { x: view.x, scale: view.scale, top: view.top }, opts.palette, opts.time, opts.beat);
    const x0 = view.wx(0) - 3;
    const x1 = view.wx(this.width) + 3;
    this.drawTrack(world, x0, x1, view.sx, view.sy, view.scale, opts.palette, opts.time, null, -1);
    this.fx.draw(ctx, view.sx, view.sy, view.scale, true, x0, x1);
    this.fx.draw(ctx, view.sx, view.sy, view.scale, false, x0, x1);
    opts.overlay?.(ctx, view);
    ctx.restore();
  }

  // ================================================================== background
  private drawBackground(r: ViewRect, cam: Camera, pal: Palette, time: number, beat: number): void {
    const ctx = this.ctx;
    const s = cam.scale;
    const sky = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const pulse = Math.pow(1 - beat, 3);

    if (pal.stars > 0.05) {
      const n = Math.round(70 * pal.stars * this.detail);
      const w = r.w;
      for (let i = 0; i < n; i++) {
        const px = (((hash(i) * w - cam.x * s * 0.04) % w) + w) % w;
        const py = r.y + hash(i + 99) * r.h * 0.75;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * (1 + hash(i + 7) * 2) + i));
        ctx.fillStyle = `rgba(255,255,255,${(0.3 + tw * 0.6) * pal.stars})`;
        const sz = (hash(i + 3) > 0.85 ? 2.4 : 1.4) * this.dpr;
        ctx.fillRect(r.x + px, py, sz, sz);
      }
    }

    // Big soft sun / planet that breathes with the music.
    const sunX = r.x + r.w * 0.76;
    const sunY = cam.top + s * 2.3;
    const sunR = s * (2.1 + pulse * 0.12);
    const sg = ctx.createRadialGradient(sunX, sunY, sunR * 0.15, sunX, sunY, sunR * 2.3);
    sg.addColorStop(0, rgba(pal.far, 0.8));
    sg.addColorStop(0.4, rgba(pal.far, 0.28));
    sg.addColorStop(1, rgba(pal.far, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(sunX - sunR * 2.3, sunY - sunR * 2.3, sunR * 4.6, sunR * 4.6);
    if (pal.stars > 0.9) {
      ctx.strokeStyle = rgba(pal.accent, 0.35);
      ctx.lineWidth = s * 0.12;
      ctx.beginPath();
      ctx.ellipse(sunX, sunY, sunR * 1.5, sunR * 0.35, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.haunted) this.drawMoonAndBats(r, cam, sunX, sunY, sunR, time, pulse);

    // Far floating polygons: slow parallax, gentle spin, pulse on the beat.
    const farPar = 0.12;
    const cell = 7;
    const fx0 = Math.floor((cam.x * farPar) / cell) - 1;
    const fx1 = fx0 + Math.ceil(r.w / s / cell) + 3;
    ctx.lineWidth = Math.max(2, s * 0.09);
    for (let c = fx0; c <= fx1; c++) {
      if (hash(c) < 0.25 * (2 - this.detail)) continue;
      const wx = c * cell + hash(c + 11) * cell;
      const px = r.x + (wx - cam.x * farPar) * s;
      const py = cam.top + s * (1 + hash(c + 5) * 5.5);
      const size = s * (0.9 + hash(c + 3) * 1.6) * (1 + pulse * 0.06);
      const sides = 3 + Math.floor(hash(c + 9) * 4);
      const rot = time * (hash(c + 13) - 0.5) * 0.6 + c;
      ctx.strokeStyle = rgba(pal.far, 0.22 + pulse * 0.12);
      ctx.fillStyle = rgba(pal.far, 0.07);
      ctx.beginPath();
      for (let k = 0; k <= sides; k++) {
        const a = rot + (k / sides) * Math.PI * 2;
        const vx = px + Math.cos(a) * size;
        const vy = py + Math.sin(a) * size;
        if (k === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.fill();
      ctx.stroke();
    }

    // Mid "hills" of faceted polygons near the ground.
    if (this.detail > 0.4) {
      const midPar = 0.35;
      const seg = 3;
      const mx0 = Math.floor((cam.x * midPar) / seg) - 1;
      const mx1 = mx0 + Math.ceil(r.w / s / seg) + 3;
      const baseY = cam.top + VIEW_TOP * s;
      ctx.fillStyle = rgba(pal.mid, 0.45);
      ctx.beginPath();
      ctx.moveTo(r.x + (mx0 * seg - cam.x * midPar) * s, baseY + s);
      for (let c = mx0; c <= mx1; c++) {
        const h = 1.4 + hash(c * 3.1) * 3.2;
        const px = r.x + (c * seg - cam.x * midPar) * s;
        ctx.lineTo(px, baseY - h * s);
        ctx.lineTo(px + seg * s * 0.5, baseY - (h + 0.5) * s);
      }
      ctx.lineTo(r.x + (mx1 * seg - cam.x * midPar) * s, baseY + s);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ================================================================== track
  private drawSolids(pal: Palette, sx: (x: number) => number, sy: (y: number) => number, s: number): void {
    const ctx = this.ctx;
    const groundTop = sy(0);
    const groundGrad = ctx.createLinearGradient(0, groundTop, 0, groundTop + s * 1.6);
    groundGrad.addColorStop(0, pal.ground);
    groundGrad.addColorStop(1, pal.groundDark);
    const ceilBottom = sy(CEIL);
    const ceilGrad = ctx.createLinearGradient(0, ceilBottom, 0, ceilBottom - s * 1.6);
    ceilGrad.addColorStop(0, pal.ground);
    ceilGrad.addColorStop(1, pal.groundDark);
    const edge = Math.max(2, s * 0.12);

    for (const o of scratch) {
      if (o.kind !== 'solid') continue;
      const top = Math.min(o.y1, VIEW_TOP + 1);
      const bot = Math.max(o.y0, VIEW_BOTTOM - 1);
      if (top <= bot) continue;
      const px = sx(o.x0);
      const pw = (o.x1 - o.x0) * s;
      const py = sy(top);
      const ph = (top - bot) * s;
      if (o.role === 'ground' || o.role === 'ceil') {
        ctx.fillStyle = o.role === 'ground' ? groundGrad : ceilGrad;
        ctx.fillRect(px - 0.5, py, pw + 1, ph);
        ctx.strokeStyle = rgba(pal.groundTile, 0.9);
        ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.beginPath();
        for (let x = Math.ceil(o.x0); x < o.x1; x++) {
          ctx.moveTo(sx(x), py);
          ctx.lineTo(sx(x), py + ph);
        }
        const seamY = o.role === 'ground' ? sy(-1) : sy(CEIL + 1);
        ctx.moveTo(px, seamY);
        ctx.lineTo(px + pw, seamY);
        ctx.stroke();
        ctx.fillStyle = pal.groundEdge;
        const ey = o.role === 'ground' ? sy(o.y1) : sy(o.y0) - edge;
        ctx.fillRect(px - 0.5, ey, pw + 1, edge);
        ctx.fillStyle = rgba(pal.groundEdge, 0.25);
        ctx.fillRect(px - 0.5, o.role === 'ground' ? ey + edge : ey - edge, pw + 1, edge);
      } else if (o.role === 'platform') {
        const g = ctx.createLinearGradient(0, py, 0, py + ph);
        g.addColorStop(0, lighten(pal.block, 0.15));
        g.addColorStop(1, pal.blockDark);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, ph * 0.3);
        ctx.fill();
        ctx.fillStyle = pal.blockEdge;
        ctx.fillRect(px + 2, py, pw - 4, Math.max(2, s * 0.08));
        ctx.strokeStyle = rgba(pal.blockDark, 0.8);
        ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.beginPath();
        for (let x = o.x0 + 0.5; x < o.x1 - 0.2; x += 0.5) {
          ctx.moveTo(sx(x), py + ph * 0.35);
          ctx.lineTo(sx(x) - s * 0.2, py + ph);
        }
        ctx.stroke();
      } else {
        // Block: gradient body, bright rim, inset outline, seams on tall pillars.
        const g = ctx.createLinearGradient(0, py, 0, py + ph);
        g.addColorStop(0, lighten(pal.block, 0.1));
        g.addColorStop(1, pal.blockDark);
        ctx.fillStyle = g;
        ctx.fillRect(px, py, pw, ph);
        const lw = Math.max(2, s * 0.07);
        ctx.strokeStyle = pal.blockEdge;
        ctx.lineWidth = lw;
        ctx.strokeRect(px + lw / 2, py + lw / 2, pw - lw, ph - lw);
        ctx.strokeStyle = rgba(pal.blockEdge, 0.35);
        ctx.lineWidth = Math.max(1, s * 0.035);
        const inset = s * 0.2;
        if (pw > inset * 2.5 && ph > inset * 2.5) ctx.strokeRect(px + inset, py + inset, pw - inset * 2, ph - inset * 2);
        if (ph > s * 1.5) {
          ctx.beginPath();
          for (let y = Math.ceil(bot) + 1; y < top; y++) {
            ctx.moveTo(px + inset * 0.5, sy(y));
            ctx.lineTo(px + pw - inset * 0.5, sy(y));
          }
          ctx.stroke();
        }
      }
    }
  }

  private drawSpike(pal: Palette, bx: number, by: number, size: number, dir: 1 | -1): void {
    const ctx = this.ctx;
    const hw = size * 0.5;
    const h = size * dir;
    const g = ctx.createLinearGradient(0, by - h, 0, by);
    g.addColorStop(0, lighten(pal.hazard, 0.2));
    g.addColorStop(1, pal.hazardDark);
    ctx.beginPath();
    ctx.moveTo(bx - hw, by);
    ctx.lineTo(bx, by - h);
    ctx.lineTo(bx + hw, by);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = pal.hazardEdge;
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.beginPath();
    ctx.moveTo(bx - hw * 0.45, by - h * 0.12);
    ctx.lineTo(bx - hw * 0.05, by - h * 0.75);
    ctx.stroke();
  }

  /** Halloween: a pale moon with a few bats flapping across it. */
  private drawMoonAndBats(r: ViewRect, cam: Camera, mx: number, my: number, mr: number, time: number, pulse: number): void {
    const ctx = this.ctx;
    const s = cam.scale;
    const rr = mr * 0.62;
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.arc(mx, my, rr * (1 + pulse * 0.03), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(214,190,150,0.55)';
    for (const [dx, dy, cr] of [[-0.3, -0.2, 0.16], [0.25, 0.15, 0.22], [-0.05, 0.38, 0.12]] as const) {
      ctx.beginPath();
      ctx.arc(mx + dx * rr, my + dy * rr, cr * rr, 0, Math.PI * 2);
      ctx.fill();
    }
    const n = Math.round(7 * this.detail) || 3;
    ctx.fillStyle = '#1a0b2b';
    for (let i = 0; i < n; i++) {
      const speed = 0.6 + hash(i + 41) * 0.8;
      const span = r.w + s * 6;
      const bx = r.x + span - ((((time * speed * s * 1.6 + cam.x * s * 0.08 + hash(i + 5) * span) % span) + span) % span);
      const by = r.y + r.h * (0.12 + hash(i + 13) * 0.35) + Math.sin(time * 2 + i) * s * 0.3;
      const sz = s * (0.35 + hash(i + 29) * 0.3);
      const flap = Math.sin(time * 14 + i * 2);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - sz * 0.6, by - sz * (0.2 + flap * 0.6), bx - sz * 1.3, by - sz * flap * 0.3);
      ctx.quadraticCurveTo(bx - sz * 0.7, by + sz * 0.1, bx, by + sz * 0.25);
      ctx.quadraticCurveTo(bx + sz * 0.7, by + sz * 0.1, bx + sz * 1.3, by - sz * flap * 0.3);
      ctx.quadraticCurveTo(bx + sz * 0.6, by - sz * (0.2 + flap * 0.6), bx, by);
      ctx.fill();
    }
  }

  /** Halloween: drifting fog over the ground. */
  private drawFog(r: ViewRect, sy: (y: number) => number, s: number, camX: number, time: number): void {
    const ctx = this.ctx;
    const g0 = sy(0);
    const fog = ctx.createLinearGradient(0, g0 - s * 1.6, 0, g0 + s * 0.3);
    fog.addColorStop(0, 'rgba(230,215,255,0)');
    fog.addColorStop(0.7, 'rgba(230,215,255,0.16)');
    fog.addColorStop(1, 'rgba(230,215,255,0.05)');
    ctx.fillStyle = fog;
    ctx.fillRect(r.x, g0 - s * 1.6, r.w, s * 1.9);
    ctx.fillStyle = 'rgba(240,230,255,0.09)';
    for (let i = 0; i < 5; i++) {
      const w = r.w * 0.5;
      const x = r.x + ((((i * w * 0.6 - camX * s * 0.6 - time * s * 0.8) % (r.w + w)) + r.w + w) % (r.w + w)) - w;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, g0 - s * 0.35, w / 2, s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Halloween: saws become grinning jack-o'-lanterns (same size and hitbox). */
  private drawPumpkin(cx: number, cy: number, rr: number, time: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(time * 5) * 0.18);
    const glow = ctx.createRadialGradient(0, 0, rr * 0.3, 0, 0, rr * 1.5);
    glow.addColorStop(0, 'rgba(255,170,40,0.35)');
    glow.addColorStop(1, 'rgba(255,170,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-rr * 1.5, -rr * 1.5, rr * 3, rr * 3);
    // Ribbed body.
    for (const [dx, w, c] of [[-0.45, 0.6, '#e8650f'], [0.45, 0.6, '#e8650f'], [0, 0.62, '#ff8a1f']] as const) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(dx * rr, rr * 0.05, w * rr, rr * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#a63f05';
    ctx.lineWidth = Math.max(1.2, rr * 0.06);
    ctx.stroke();
    // Stem.
    ctx.fillStyle = '#3d6b1e';
    ctx.fillRect(-rr * 0.1, -rr * 1.05, rr * 0.2, rr * 0.3);
    // Carved face with a flickering candle.
    const flick = 0.75 + 0.25 * Math.sin(time * 23) * Math.sin(time * 7);
    ctx.fillStyle = `rgba(255,${Math.round(220 * flick)},90,1)`;
    ctx.beginPath();
    ctx.moveTo(-rr * 0.5, -rr * 0.15);
    ctx.lineTo(-rr * 0.22, -rr * 0.15);
    ctx.lineTo(-rr * 0.36, -rr * 0.45);
    ctx.closePath();
    ctx.moveTo(rr * 0.5, -rr * 0.15);
    ctx.lineTo(rr * 0.22, -rr * 0.15);
    ctx.lineTo(rr * 0.36, -rr * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-rr * 0.55, rr * 0.15);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-rr * 0.55 + (i * rr * 1.1) / 6, rr * (i % 2 ? 0.28 : 0.15));
    ctx.quadraticCurveTo(0, rr * 0.75, -rr * 0.55, rr * 0.15);
    ctx.fill();
    ctx.restore();
  }

  private drawSaw(pal: Palette, cx: number, cy: number, rr: number, time: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = rgba(pal.hazard, 0.18);
    ctx.beginPath();
    ctx.arc(0, 0, rr * 1.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(time * 7);
    ctx.beginPath();
    const teeth = 12;
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rad = i % 2 ? rr * 0.76 : rr;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, rr * 0.2, 0, 0, rr);
    g.addColorStop(0, lighten(pal.hazard, 0.3));
    g.addColorStop(1, pal.hazardDark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = pal.hazardEdge;
    ctx.lineWidth = Math.max(1.5, rr * 0.07);
    ctx.stroke();
    ctx.fillStyle = darken(pal.hazardDark, 0.3);
    ctx.beginPath();
    ctx.arc(0, 0, rr * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr * 0.17, Math.sin(a) * rr * 0.17, rr * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPad(px: number, py: number, s: number, dir: 1 | -1, time: number): void {
    const ctx = this.ctx;
    const w = 0.5 * s;
    const h = 0.26 * s;
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#a86a00';
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.beginPath();
    ctx.ellipse(px, py, w, h, 0, dir > 0 ? Math.PI : 0, dir > 0 ? Math.PI * 2 : Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const k = (time * 2) % 1;
    ctx.strokeStyle = `rgba(255,230,120,${1 - k})`;
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    for (let i = 0; i < 2; i++) {
      const off = ((k + i * 0.5) % 1) * s * 0.9;
      ctx.beginPath();
      ctx.moveTo(px - w * 0.5, py - dir * (h + off));
      ctx.lineTo(px, py - dir * (h + off + s * 0.2));
      ctx.lineTo(px + w * 0.5, py - dir * (h + off));
      ctx.stroke();
    }
  }

  private drawOrb(px: number, py: number, s: number, time: number, used: boolean): void {
    const ctx = this.ctx;
    const r = 0.4 * s * (1 + Math.sin(time * 6) * 0.06);
    ctx.globalAlpha = used ? 0.35 : 1;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r * 1.8);
    g.addColorStop(0, 'rgba(255,240,150,0.9)');
    g.addColorStop(0.5, 'rgba(255,210,63,0.35)');
    g.addColorStop(1, 'rgba(255,210,63,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - r * 1.8, py - r * 1.8, r * 3.6, r * 3.6);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = Math.max(2, s * 0.11);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#fff6c8';
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.setLineDash([s * 0.12, s * 0.12]);
    ctx.lineDashOffset = -time * s;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  /** A golden egg with a soft glow and a twinkle (faded once found). */
  private drawEgg(px: number, py: number, s: number, t: number, found: boolean): void {
    const ctx = this.ctx;
    const w = 0.36 * s;
    const hgt = 0.48 * s;
    ctx.save();
    ctx.globalAlpha = found ? 0.45 : 1;
    const glow = ctx.createRadialGradient(px, py, 0, px, py, s * 1.1);
    glow.addColorStop(0, 'rgba(255,224,102,0.55)');
    glow.addColorStop(1, 'rgba(255,224,102,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(px - s * 1.1, py - s * 1.1, s * 2.2, s * 2.2);
    const body = ctx.createLinearGradient(px - w, py - hgt, px + w, py + hgt);
    body.addColorStop(0, found ? '#d8d2ff' : '#fff3b0');
    body.addColorStop(0.5, found ? '#a99cf0' : '#ffd23f');
    body.addColorStop(1, found ? '#6f62c2' : '#e09a00');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(px, py - hgt);
    ctx.bezierCurveTo(px + w * 1.05, py - hgt, px + w * 1.15, py + hgt * 0.75, px, py + hgt * 0.75);
    ctx.bezierCurveTo(px - w * 1.15, py + hgt * 0.75, px - w * 1.05, py - hgt, px, py - hgt);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,40,0,0.55)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.stroke();
    // Zigzag band.
    ctx.strokeStyle = found ? '#ffffff' : '#ff7af0';
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const x = px - w * 0.95 + (i / 6) * w * 1.9;
      const y = py + hgt * 0.05 + (i % 2 ? -1 : 1) * hgt * 0.1;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    // Twinkle.
    const tw = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * tw})`;
    const sp = s * (0.08 + 0.06 * tw);
    const cx = px + w * 0.45;
    const cy = py - hgt * 0.55;
    ctx.beginPath();
    ctx.moveTo(cx, cy - sp * 2);
    ctx.lineTo(cx + sp * 0.5, cy);
    ctx.lineTo(cx, cy + sp * 2);
    ctx.lineTo(cx - sp * 0.5, cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawGem(px: number, py: number, s: number, big: boolean, t: number): void {
    const ctx = this.ctx;
    const gs = (big ? 0.42 : 0.27) * s;
    const top = big ? '#ffc6f8' : '#c9f6ff';
    const mid = big ? '#ff7af0' : '#3ad7ff';
    const dark = big ? '#b0249e' : '#1689c4';
    if (big) {
      const g = ctx.createRadialGradient(px, py, 0, px, py, gs * 2);
      g.addColorStop(0, 'rgba(255,138,242,0.45)');
      g.addColorStop(1, 'rgba(255,138,242,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - gs * 2, py - gs * 2, gs * 4, gs * 4);
    }
    ctx.fillStyle = mid;
    ctx.beginPath();
    ctx.moveTo(px - gs * 0.85, py - gs * 0.25);
    ctx.lineTo(px - gs * 0.45, py - gs * 0.8);
    ctx.lineTo(px + gs * 0.45, py - gs * 0.8);
    ctx.lineTo(px + gs * 0.85, py - gs * 0.25);
    ctx.lineTo(px, py + gs);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(px - gs * 0.45, py - gs * 0.8);
    ctx.lineTo(px + gs * 0.45, py - gs * 0.8);
    ctx.lineTo(px + gs * 0.25, py - gs * 0.25);
    ctx.lineTo(px - gs * 0.25, py - gs * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(px + gs * 0.25, py - gs * 0.25);
    ctx.lineTo(px + gs * 0.85, py - gs * 0.25);
    ctx.lineTo(px, py + gs);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(px - gs * 0.85, py - gs * 0.25);
    ctx.lineTo(px - gs * 0.45, py - gs * 0.8);
    ctx.lineTo(px + gs * 0.45, py - gs * 0.8);
    ctx.lineTo(px + gs * 0.85, py - gs * 0.25);
    ctx.lineTo(px, py + gs);
    ctx.closePath();
    ctx.stroke();
    const tw = Math.sin(t * 3.1);
    if (tw > 0.85) {
      const k = (tw - 0.85) / 0.15;
      ctx.strokeStyle = `rgba(255,255,255,${k})`;
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath();
      ctx.moveTo(px - gs * 0.4, py - gs * 0.55);
      ctx.lineTo(px - gs * 0.4, py - gs * 0.55 - gs * k);
      ctx.moveTo(px - gs * 0.4 - gs * 0.5 * k, py - gs * 0.55 - gs * 0.5 * k);
      ctx.lineTo(px - gs * 0.4 + gs * 0.5 * k, py - gs * 0.55 - gs * 0.5 * k);
      ctx.stroke();
    }
  }

  private drawPickup(type: 'heart' | 'shield' | 'magnet', px: number, py: number, s: number, time: number): void {
    const ctx = this.ctx;
    const r = 0.46 * s;
    const color = type === 'heart' ? '#ff4f6d' : type === 'shield' ? '#3ad7ff' : '#ff5f5f';
    const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r * 1.3);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, rgba(color, 0.15));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.stroke();
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.sin(time * 2) * 0.15);
    const k = r * 0.55;
    ctx.fillStyle = color;
    ctx.strokeStyle = darken(color, 0.45);
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    if (type === 'heart') {
      ctx.moveTo(0, k * 0.8);
      ctx.bezierCurveTo(-k * 1.3, -k * 0.1, -k * 0.55, -k * 1.1, 0, -k * 0.35);
      ctx.bezierCurveTo(k * 0.55, -k * 1.1, k * 1.3, -k * 0.1, 0, k * 0.8);
    } else if (type === 'shield') {
      ctx.moveTo(0, -k);
      ctx.lineTo(k * 0.85, -k * 0.6);
      ctx.lineTo(k * 0.7, k * 0.3);
      ctx.lineTo(0, k);
      ctx.lineTo(-k * 0.7, k * 0.3);
      ctx.lineTo(-k * 0.85, -k * 0.6);
      ctx.closePath();
    } else {
      ctx.moveTo(-k * 0.8, -k * 0.8);
      ctx.lineTo(-k * 0.35, -k * 0.8);
      ctx.lineTo(-k * 0.35, k * 0.05);
      ctx.arc(0, k * 0.05, k * 0.35, Math.PI, 0, true);
      ctx.lineTo(k * 0.35, -k * 0.8);
      ctx.lineTo(k * 0.8, -k * 0.8);
      ctx.lineTo(k * 0.8, k * 0.05);
      ctx.arc(0, k * 0.05, k * 0.8, 0, Math.PI);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    if (type === 'magnet') {
      ctx.fillStyle = '#e8ecff';
      ctx.fillRect(-k * 0.8, -k * 0.8, k * 0.45, k * 0.35);
      ctx.fillRect(k * 0.35, -k * 0.8, k * 0.45, k * 0.35);
    }
    ctx.restore();
  }

  private drawBox(px: number, py: number, s: number, time: number): void {
    const ctx = this.ctx;
    const bs = 0.52 * s;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.sin(time * 2.4) * 0.08);
    const hue = (time * 120) % 360;
    ctx.fillStyle = `hsla(${hue},90%,65%,0.35)`;
    ctx.beginPath();
    ctx.roundRect(-bs * 1.2, -bs * 1.2, bs * 2.4, bs * 2.4, bs * 0.5);
    ctx.fill();
    const g = ctx.createLinearGradient(0, -bs, 0, bs);
    g.addColorStop(0, '#ffcf5a');
    g.addColorStop(1, '#ff8a1f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-bs, -bs, bs * 2, bs * 2, bs * 0.3);
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue},95%,70%)`;
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.stroke();
    ctx.font = `700 ${Math.round(bs * 1.5)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.strokeStyle = '#7a3a00';
    ctx.strokeText('?', 0, bs * 0.08);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('?', 0, bs * 0.08);
    ctx.restore();
  }

  private drawPortal(x: number, mode: ShapeMode, sx: (x: number) => number, sy: (y: number) => number, s: number, time: number): void {
    const ctx = this.ctx;
    const px = sx(x);
    const py = sy(CEIL / 2);
    const color = SHAPE_INFO[mode].color;
    const rw = 0.75 * s;
    const rh = 3.5 * s;
    const glow = ctx.createRadialGradient(px, py, rw * 0.2, px, py, rh);
    glow.addColorStop(0, rgba(color, 0.45));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(px - rh, py - rh, rh * 2, rh * 2);
    ctx.lineWidth = Math.max(3, s * 0.26);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = lighten(color, 0.5);
    for (let i = 0; i < 10; i++) {
      const a = time * 2 + (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(px + Math.cos(a) * rw * 0.75, py + Math.sin(a) * rh * 0.9, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    drawCharacter(ctx, px, py, s * 0.95, mode, { ...skinById('classic'), body: color, accent: color, outline: darken(color, 0.55) }, {
      rot: mode === 'hexagon' ? time : Math.sin(time * 3) * 0.1,
      faceRot: 0,
      lookX: 0.8,
      time,
    });
    const label = SHAPE_INFO[mode].name.toUpperCase();
    ctx.font = `700 ${Math.round(s * 0.5)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.strokeStyle = 'rgba(20,8,50,0.85)';
    ctx.strokeText(label, px, py - rh - s * 0.1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, px, py - rh - s * 0.1);
  }

  private drawFinish(x: number, sx: (x: number) => number, sy: (y: number) => number, s: number, time: number): void {
    const ctx = this.ctx;
    const px = sx(x);
    const cell = 0.5 * s;
    for (let y = 0; y < 16; y++) {
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (y + c) % 2 ? '#ffffff' : '#1a1040';
        ctx.fillRect(px - cell + c * cell, sy(CEIL) + y * cell, cell, cell);
      }
    }
    ctx.save();
    ctx.translate(px, sy(CEIL) + s * 0.8);
    ctx.rotate(Math.sin(time * 4) * 0.08);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.roundRect(-s * 2, -s * 0.5, s * 4, s * 1, s * 0.3);
    ctx.fill();
    ctx.font = `700 ${Math.round(s * 0.7)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3b2300';
    ctx.fillText('FINISH', 0, s * 0.04);
    ctx.restore();
  }

  private drawMarker(px: number, sy: (y: number) => number, s: number, label: string, color: string, time: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = rgba(color, 0.8);
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.setLineDash([s * 0.25, s * 0.18]);
    ctx.beginPath();
    ctx.moveTo(px, sy(0));
    ctx.lineTo(px, sy(CEIL - 1));
    ctx.stroke();
    ctx.setLineDash([]);
    const fy = sy(CEIL - 1);
    const wave = Math.sin(time * 5) * s * 0.08;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px, fy);
    ctx.lineTo(px + s * 1.6, fy + s * 0.3 + wave);
    ctx.lineTo(px, fy + s * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 ${Math.round(s * 0.42)}px Fredoka, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.strokeStyle = 'rgba(20,8,50,0.8)';
    ctx.strokeText(label, px + s * 0.1, fy - s * 0.05);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, px + s * 0.1, fy - s * 0.05);
  }

  // ================================================================== racers
  private drawRacer(r: Racer, sx: (x: number) => number, sy: (y: number) => number, s: number, time: number, alpha: number, pal: Palette, showName = alpha < 1): void {
    const ctx = this.ctx;
    const b = r.body;
    const px = sx(b.x);
    const py = sy(b.y);
    const blinkOut = r.invuln > 0 && r.hitFlash <= 0 && Math.floor(time * 14) % 2 === 0;
    const a = alpha * (blinkOut ? 0.4 : 1);

    // Soft contact shadow on the surface gravity pulls toward.
    const surfaceY = b.gdir < 0 ? 0 : CEIL;
    const dist = Math.abs(b.y - surfaceY) - 0.43;
    if (dist < 4 && b.mode !== 'triangle') {
      const k = Math.max(0, 1 - dist / 4);
      ctx.fillStyle = `rgba(0,0,0,${0.25 * k * alpha})`;
      ctx.beginPath();
      ctx.ellipse(px, sy(surfaceY), s * 0.45 * (0.6 + k * 0.4), s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (r.boost > 0) {
      ctx.fillStyle = rgba(pal.accent, 0.35);
      ctx.beginPath();
      ctx.arc(px, py, s * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    const upright = b.mode === 'square' || b.mode === 'hexagon';
    drawCharacter(ctx, px, py, s * 0.88, b.mode, skinById(r.skin), {
      rot: -b.rot,
      faceRot: upright ? (b.gdir > 0 ? Math.PI : 0) : -b.rot,
      squash: r.squash,
      lookX: 0.7,
      lookY: Math.max(-1, Math.min(1, -b.vy / 18)) * (b.gdir > 0 ? -1 : 1),
      blink: r.blink > 0 ? 1 : 0,
      time,
      alpha: a,
      hurt: r.hitFlash > 0 ? 1 : 0,
    });
    if (r.shield) {
      const sh = 0.75 * s * (1 + Math.sin(time * 6) * 0.03);
      const g = ctx.createRadialGradient(px - sh * 0.3, py - sh * 0.3, sh * 0.1, px, py, sh);
      g.addColorStop(0, 'rgba(255,255,255,0.08)');
      g.addColorStop(0.8, 'rgba(58,215,255,0.18)');
      g.addColorStop(1, 'rgba(127,233,255,0.55)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, sh, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,250,255,0.9)';
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.stroke();
    }
    if (r.snow > 0) {
      ctx.fillStyle = 'rgba(210,245,255,0.5)';
      ctx.beginPath();
      ctx.roundRect(px - s * 0.55, py - s * 0.55, s * 1.1, s * 1.1, s * 0.25);
      ctx.fill();
    }
    if (showName) {
      ctx.font = `600 ${Math.round(0.36 * s)}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = Math.max(2, s * 0.07);
      ctx.strokeStyle = 'rgba(20,8,50,0.7)';
      ctx.strokeText(r.name, px, py - 0.7 * s);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(r.name, px, py - 0.7 * s);
    }
  }
}
