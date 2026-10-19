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
  /** Golden Shapes already found (drawn faded). */
  secretsFound?: readonly number[];
  /** Lights Out: the course is dark; 0..1 is how bright the beat flash is right now. */
  lightsOut?: number;
  /** Boss Battles: the boss (big gems are drawn as its charge orbs). */
  boss?: BossView | null;
}

/** What the renderer needs to draw a boss fight. */
export interface BossView {
  name: string;
  shape: 'square' | 'triangle' | 'hexagon';
  color: string;
  hp: number;
  max: number;
  /** Seconds left on the hit flash / recoil. */
  hit: number;
  /** Shot in flight: 1 just fired → 0 landed. */
  shot: number;
  /** Defeated: 1 → 0 as it shrinks away (0 = still fighting). */
  down: number;
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
  private bossFight = false;
  private beatPhase = 0;
  private secretsFound: readonly number[] = [];

  private drawView(session: GameSession, view: ViewSpec, dt: number, time: number, opts: RenderOptions): void {
    const ctx = this.ctx;
    const cam = this.camera(view, dt);
    this.runnerX = view.racer.x;
    this.haunted = !!opts.haunted;
    this.bossFight = !!opts.boss;
    this.beatPhase = opts.beat;
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
    if (opts.boss) this.drawBoss(opts.boss, r, me, sx, sy, s, time);
    if (opts.lightsOut !== undefined) this.drawDarkness(r, sx(me.x), sy(me.body.y), s, opts.lightsOut);

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
          if (o.mob) this.drawMob(o.mob, sx(o.x), sy(sawY(o, this.runnerX)), s, time + o.x);
          else if (this.haunted) this.drawPumpkin(sx(o.x), sy(sawY(o, this.runnerX)), o.r * s, time + o.x);
          else this.drawSaw(pal, sx(o.x), sy(sawY(o, this.runnerX)), o.r * s, time);
          break;
        case 'pad':
          this.drawPad(sx(o.x), sy(o.y), s, o.dir, time);
          break;
        case 'orb':
          this.drawOrb(sx(o.x), sy(o.y), s, time, usedOrb === o.id);
          break;
        case 'gem':
          if (collected?.has(o.id)) break;
          if (this.bossFight && o.big) this.drawChargeOrb(sx(o.x), sy(o.y), s, time + o.x);
          else this.drawGem(sx(o.x), sy(o.y) + Math.sin(time * 4 + o.x) * s * 0.06, s, o.big, time + o.x);
          break;
        case 'pickup':
          if (!collected?.has(o.id)) this.drawPickup(o.type, sx(o.x), sy(o.y) + Math.sin(time * 3) * s * 0.08, s, time);
          break;
        case 'secret':
          if (!collected?.has(o.id)) this.drawGoldenShape(sx(o.x), sy(o.y) + Math.sin(time * 2.5) * s * 0.07, s, time, !!this.secretsFound.includes(o.level), o.level);
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

  /**
   * A Golden Shape: a spinning gold runner form (square, triangle, hexagon or
   * diamond, by level) with a soft glow and a twinkle (faded once found).
   */
  private drawGoldenShape(px: number, py: number, s: number, t: number, found: boolean, level: number): void {
    const ctx = this.ctx;
    const r = 0.38 * s;
    const sides = [4, 3, 6, 4][(level - 1) % 4];
    const tilt = (level - 1) % 4 === 3 ? 0 : sides === 3 ? -Math.PI / 2 : sides === 4 ? Math.PI / 4 : 0;
    const spin = Math.sin(t * 1.6) * 0.35;
    ctx.save();
    ctx.globalAlpha = found ? 0.45 : 1;
    const glow = ctx.createRadialGradient(px, py, 0, px, py, s * 1.1);
    glow.addColorStop(0, 'rgba(255,224,102,0.55)');
    glow.addColorStop(1, 'rgba(255,224,102,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(px - s * 1.1, py - s * 1.1, s * 2.2, s * 2.2);
    ctx.translate(px, py);
    // A coin-like turn: squash the width as it spins.
    ctx.scale(0.55 + 0.45 * Math.abs(Math.cos(t * 2.2)), 1);
    ctx.rotate(spin);
    const pts: [number, number][] = [];
    for (let i = 0; i < sides; i++) {
      const a = tilt + (i / sides) * Math.PI * 2;
      const rr = (level - 1) % 4 === 3 && i % 2 === 0 ? r * 0.68 : r * ((level - 1) % 4 === 3 ? 1.15 : 1);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    const body = ctx.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, found ? '#d8d2ff' : '#fff3b0');
    body.addColorStop(0.5, found ? '#a99cf0' : '#ffd23f');
    body.addColorStop(1, found ? '#6f62c2' : '#e09a00');
    ctx.fillStyle = body;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,40,0,0.6)';
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.lineJoin = 'round';
    ctx.stroke();
    // Inner bevel.
    ctx.strokeStyle = found ? 'rgba(255,255,255,0.7)' : 'rgba(255,248,210,0.9)';
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * 0.6, y * 0.6) : ctx.moveTo(x * 0.6, y * 0.6)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = found ? 0.45 : 1;
    // Twinkle.
    const tw = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * tw})`;
    const sp = s * (0.08 + 0.06 * tw);
    const cx = px + r * 0.55;
    const cy = py - r * 0.65;
    ctx.beginPath();
    ctx.moveTo(cx, cy - sp * 2);
    ctx.lineTo(cx + sp * 0.5, cy);
    ctx.lineTo(cx, cy + sp * 2);
    ctx.lineTo(cx - sp * 0.5, cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Lights Out: darkness everywhere but a small glow around the runner. On a
   * beat the glow opens wide and the dark thins, lighting the way ahead.
   */
  private drawDarkness(r: ViewRect, px: number, py: number, s: number, flash: number): void {
    const ctx = this.ctx;
    const a = 0.97 - 0.72 * flash;
    // Centre the light a little ahead of the runner (that's where you need to see).
    const cx = px + s * (1 + flash * 3);
    const g = ctx.createRadialGradient(cx, py, s * (0.9 + flash), cx, py, s * (3 + flash * 7));
    g.addColorStop(0, 'rgba(4,2,14,0)');
    g.addColorStop(0.55, `rgba(4,2,14,${a * 0.75})`);
    g.addColorStop(1, `rgba(4,2,14,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  /** Boss Battles: the boss floating ahead, its health bar, and your shots flying back at it. */
  private drawBoss(b: BossView, r: ViewRect, me: Racer, sx: (x: number) => number, sy: (y: number) => number, s: number, time: number): void {
    const ctx = this.ctx;
    const bx = r.x + r.w * 0.8 + b.hit * s * 1.2;
    const by = sy(4.4) + Math.sin(time * 2.2) * s * 0.35;
    const size = s * 1.6 * (b.down > 0 ? b.down : 1) * (1 + 0.06 * Math.max(0, 1 - this.beatPhase * 4));
    // A shot from the runner to the boss.
    if (b.shot > 0) {
      const k = 1 - b.shot;
      const px = sx(me.x) + (bx - sx(me.x)) * k;
      const py = sy(me.body.y) + (by - sy(me.body.y)) * k - Math.sin(k * Math.PI) * s * 1.5;
      const g = ctx.createRadialGradient(px, py, 0, px, py, s * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(120,240,255,0.9)');
      g.addColorStop(1, 'rgba(120,240,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - s * 0.6, py - s * 0.6, s * 1.2, s * 1.2);
    }
    if (size > 1) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(b.down > 0 ? (1 - b.down) * 6 : Math.sin(time * 1.3) * 0.08);
      ctx.globalAlpha = b.down > 0 ? b.down : 1;
      const sides = b.shape === 'square' ? 4 : b.shape === 'triangle' ? 3 : 6;
      const rot = b.shape === 'square' ? Math.PI / 4 : b.shape === 'triangle' ? -Math.PI / 2 : 0;
      const glow = ctx.createRadialGradient(0, 0, size * 0.4, 0, 0, size * 1.6);
      glow.addColorStop(0, rgba(b.color, 0.45));
      glow.addColorStop(1, rgba(b.color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(-size * 1.6, -size * 1.6, size * 3.2, size * 3.2);
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const x = Math.cos(a) * size;
        const y = Math.sin(a) * size;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = b.hit > 0 ? '#ffffff' : b.color;
      ctx.fill();
      ctx.lineWidth = Math.max(2, s * 0.12);
      ctx.strokeStyle = darken(b.color, 0.45);
      ctx.stroke();
      // Angry eyes looking at you (left), brows down.
      const ey = -size * 0.12;
      for (const ex of [-size * 0.32, size * 0.08]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(ex, ey, size * 0.15, size * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1b1140';
        ctx.beginPath();
        ctx.arc(ex - size * 0.05, ey + size * 0.03, size * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#1b1140';
      ctx.lineWidth = Math.max(2, size * 0.07);
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, ey - size * 0.3);
      ctx.lineTo(-size * 0.18, ey - size * 0.2);
      ctx.moveTo(size * 0.25, ey - size * 0.3);
      ctx.lineTo(-size * 0.07, ey - size * 0.2);
      ctx.stroke();
      // Grimace.
      ctx.beginPath();
      ctx.moveTo(-size * 0.35, size * 0.3);
      for (let i = 1; i <= 4; i++) ctx.lineTo(-size * 0.35 + i * size * 0.15, size * (i % 2 ? 0.22 : 0.3));
      ctx.stroke();
      // A crown for the king of the world.
      ctx.fillStyle = '#ffd23f';
      ctx.strokeStyle = '#a06a00';
      ctx.lineWidth = Math.max(1, size * 0.04);
      const cy = b.shape === 'triangle' ? -size * 1.05 : -size * 0.95;
      ctx.beginPath();
      ctx.moveTo(-size * 0.35, cy + size * 0.2);
      ctx.lineTo(-size * 0.35, cy - size * 0.05);
      ctx.lineTo(-size * 0.17, cy + size * 0.07);
      ctx.lineTo(0, cy - size * 0.15);
      ctx.lineTo(size * 0.17, cy + size * 0.07);
      ctx.lineTo(size * 0.35, cy - size * 0.05);
      ctx.lineTo(size * 0.35, cy + size * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // Health bar with the boss's name.
    const u = Math.min(r.h, r.w / 1.45) / 22;
    const bw = r.w * 0.36;
    const x0 = r.x + (r.w - bw) / 2;
    // Under the level's progress bar, its name where the level title would be.
    const y0 = r.y + u * 4.2;
    ctx.fillStyle = 'rgba(16,8,48,0.7)';
    ctx.beginPath();
    ctx.roundRect(x0 - u * 0.3, y0 - u * 0.3, bw + u * 0.6, u * 1.3, u * 0.6);
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.roundRect(x0, y0, Math.max(0, bw * (b.hp / b.max)), u * 0.7, u * 0.35);
    ctx.fill();
    ctx.font = `700 ${Math.round(u * 0.85)}px Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(2, u * 0.16);
    ctx.strokeStyle = 'rgba(16,8,48,0.85)';
    ctx.strokeText(b.name, r.x + r.w / 2, y0 - u * 0.4);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(b.name, r.x + r.w / 2, y0 - u * 0.4);
  }

  /** Boss Battles: a charge orb (grab it to fire it back at the boss). */
  private drawChargeOrb(px: number, py: number, s: number, t: number): void {
    const ctx = this.ctx;
    const rr = s * (0.34 + 0.04 * Math.sin(t * 6));
    const g = ctx.createRadialGradient(px, py, 0, px, py, rr * 2.2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(120,240,255,0.95)');
    g.addColorStop(0.6, 'rgba(80,140,255,0.45)');
    g.addColorStop(1, 'rgba(80,140,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - rr * 2.2, py - rr * 2.2, rr * 4.4, rr * 4.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.arc(px, py, rr * 1.3, t * 3, t * 3 + Math.PI * 1.2);
    ctx.stroke();
  }

  /** Haunted Run monsters standing (or floating) in the way, facing the runner. */
  private drawMob(kind: 'zombie' | 'ghost', px: number, py: number, s: number, time: number): void {
    const ctx = this.ctx;
    ctx.save();
    if (kind === 'ghost') {
      // Face left, toward the runner coming at it.
      ctx.translate(px, py);
      ctx.scale(-1.15, 1.15);
      this.drawGhost(0, 0, s, time);
    } else {
      // Feet on the floor (the hit circle sits 0.6 up), reaching left.
      ctx.translate(px, py + s * 0.6);
      ctx.scale(-1.05, 1.05);
      this.drawZombie(s, time);
    }
    ctx.restore();
  }

  /** A blocky zombie, feet at the origin, reaching toward +x. */
  private drawZombie(u: number, time: number, lunge = 0, shove = 0): void {
    const ctx = this.ctx;
    const step = Math.sin(time * 7.5);
    const lean = 0.18 + lunge * 0.7 - shove * 0.9;
    const reach = 0.55 + lunge * 0.6;
    const skin = '#7ed957';
    const dark = '#2e5e1f';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, u * 0.05);
    ctx.strokeStyle = dark;
    // Legs: a stiff shamble.
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * u * 0.1, -u * 0.55);
      ctx.rotate(step * 0.45 * side);
      ctx.fillStyle = '#2b2350';
      ctx.fillRect(-u * 0.09, 0, u * 0.18, u * 0.5);
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(-u * 0.1, u * 0.44, u * 0.26, u * 0.1);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(0, -u * 0.55 + Math.abs(step) * u * 0.04);
    ctx.rotate(lean);
    // Torso: a torn purple shirt.
    ctx.fillStyle = '#5b3fa8';
    ctx.beginPath();
    ctx.moveTo(-u * 0.27, 0);
    ctx.lineTo(-u * 0.25, -u * 0.62);
    ctx.lineTo(u * 0.25, -u * 0.62);
    ctx.lineTo(u * 0.27, 0);
    ctx.lineTo(u * 0.12, -u * 0.1);
    ctx.lineTo(0, 0);
    ctx.lineTo(-u * 0.14, -u * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Arms: straight out, grabbing.
    const bob = Math.sin(time * 7.5 + 1) * u * 0.05;
    for (const [dy, len] of [
      [-u * 0.52, reach],
      [-u * 0.38, reach * 0.9],
    ]) {
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.roundRect(u * 0.05, dy + bob, u * len, u * 0.13, u * 0.05);
      ctx.fill();
      ctx.stroke();
    }
    // Head: a green square (this is a polygon world), wobbling.
    ctx.save();
    ctx.translate(0, -u * 0.88);
    ctx.rotate(Math.sin(time * 3.2) * 0.12);
    const h = u * 0.5;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.roundRect(-h / 2, -h / 2, h, h, u * 0.06);
    ctx.fill();
    ctx.stroke();
    // Messy hair.
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-h / 2, -h / 2);
    for (let i = 0; i <= 4; i++) ctx.lineTo(-h / 2 + (i / 4) * h, -h / 2 - (i % 2 ? u * 0.1 : 0));
    ctx.lineTo(h / 2, -h / 2 + u * 0.08);
    ctx.lineTo(-h / 2, -h / 2 + u * 0.08);
    ctx.closePath();
    ctx.fill();
    // Eyes: one big, one small, red pupils looking ahead.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(h * 0.12, -h * 0.05, u * 0.1, 0, Math.PI * 2);
    ctx.arc(h * 0.36, -h * 0.02, u * 0.065, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff3355';
    ctx.beginPath();
    ctx.arc(h * 0.15, -h * 0.04, u * 0.045, 0, Math.PI * 2);
    ctx.arc(h * 0.38, -h * 0.01, u * 0.03, 0, Math.PI * 2);
    ctx.fill();
    // Stitched mouth (gaping when it lunges).
    if (lunge > 0) {
      ctx.fillStyle = '#3a0d1a';
      ctx.beginPath();
      ctx.ellipse(h * 0.22, h * 0.28, u * 0.09, u * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#1a3311';
      ctx.lineWidth = Math.max(1, u * 0.035);
      ctx.beginPath();
      ctx.moveTo(-h * 0.05, h * 0.27);
      ctx.lineTo(h * 0.42, h * 0.24);
      for (let i = 0; i < 4; i++) {
        const x = -h * 0.02 + i * h * 0.13;
        ctx.moveTo(x, h * 0.19);
        ctx.lineTo(x, h * 0.34);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  /** A swooping sheet ghost centred at (px, py), reaching toward +x. */
  private drawGhost(px: number, py: number, u: number, time: number, lunge = 0, shove = 0): void {
    const ctx = this.ctx;
    const r = u * 0.48;
    ctx.translate(px, py);
    ctx.rotate(0.12 + lunge * 0.5 - shove * 0.6);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, u * 1.2);
    glow.addColorStop(0, 'rgba(200,230,255,0.35)');
    glow.addColorStop(1, 'rgba(200,230,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-u * 1.2, -u * 1.2, u * 2.4, u * 2.4);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = '#f4f7ff';
    ctx.beginPath();
    ctx.arc(0, -r * 0.2, r, Math.PI, 0);
    ctx.lineTo(r, r * 1.05);
    // Wavy tail, rippling as it flies.
    for (let i = 0; i <= 6; i++) {
      const x = r - (i / 6) * r * 2;
      ctx.lineTo(x - r * 0.2, r * 1.05 + Math.sin(time * 9 + i * 1.7) * r * 0.18 + (i % 2 ? -r * 0.15 : 0));
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(80,90,160,0.5)';
    ctx.lineWidth = Math.max(1, u * 0.04);
    ctx.stroke();
    // Little arms reaching forward.
    ctx.fillStyle = '#f4f7ff';
    ctx.beginPath();
    ctx.ellipse(r * 0.95 + lunge * r * 0.5, r * 0.25, r * (0.35 + lunge * 0.3), r * 0.13, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Hollow eyes and an "O" mouth that opens wider when it lunges.
    ctx.fillStyle = '#1b1140';
    ctx.beginPath();
    ctx.ellipse(r * 0.1, -r * 0.3, r * 0.13, r * 0.2, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.5, -r * 0.28, r * 0.11, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 0.32, r * 0.15, r * (0.1 + lunge * 0.12), r * (0.14 + lunge * 0.16 + Math.abs(Math.sin(time * 4)) * 0.04), 0, 0, Math.PI * 2);
    ctx.fill();
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
