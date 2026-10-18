import { drawCharacter, drawTrailPreview } from '../render/character';
import type { ShapeMode } from '../game/shapes';
import { skinById, trailById } from '../meta/catalog';

/** Prepare a canvas for crisp drawing at its CSS size. Returns the 2D context. */
export function fitCanvas(canvas: HTMLCanvasElement, maxDpr = 2): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round((rect.width || canvas.clientWidth || 100) * dpr));
  const hgt = Math.max(1, Math.round((rect.height || canvas.clientHeight || 80) * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== hgt) canvas.height = hgt;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx;
}

export interface PreviewOptions {
  skin: string;
  shape?: ShapeMode;
  /** Character size as a fraction of the canvas height. */
  scale?: number;
  animate?: boolean;
  trail?: string;
}

type Live = { canvas: HTMLCanvasElement; opts: PreviewOptions; t0: number };
const live = new Set<Live>();
const optsOf = new WeakMap<HTMLCanvasElement, PreviewOptions>();
let raf = 0;

/** When the next preview frame is due. */
let lastPaint = 0;

/** Character previews animate at 30 fps (plenty for a bob and a blink). */
function tick(now: number): void {
  raf = 0;
  if (now < lastPaint - 2) {
    if (live.size) raf = requestAnimationFrame(tick);
    return;
  }
  lastPaint = Math.max(lastPaint + 1000 / 30, now);
  for (const l of [...live]) {
    if (!l.canvas.isConnected) {
      live.delete(l);
      continue;
    }
    paint(l.canvas, l.opts, (now - l.t0) / 1000);
  }
  if (live.size) raf = requestAnimationFrame(tick);
}

function paint(canvas: HTMLCanvasElement, opts: PreviewOptions, t: number): void {
  const ctx = fitCanvas(canvas);
  const w = canvas.width;
  const hh = canvas.height;
  ctx.clearRect(0, 0, w, hh);
  const skin = skinById(opts.skin);
  // Shrink to fit: the body (plus a hat or tall outline) at the top of its bounce stays inside the canvas.
  const reach = 1.05 + (skin.topper ? 0.62 : skin.silhouette ? 0.12 : 0);
  const room = hh * (0.86 - (opts.animate ? 0.12 : 0) - 0.02);
  const size = Math.min(hh * (opts.scale ?? 0.55), room / reach);
  const bounce = opts.animate ? Math.abs(Math.sin(t * 2.6)) : 0;
  const squash = opts.animate ? 1 + Math.sin(t * 5.2) * 0.04 : 1;
  const groundY = hh * 0.86;
  // Soft shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(opts.trail && opts.trail !== 'none' ? w * 0.66 : w / 2, groundY, size * (0.55 - bounce * 0.15), size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  const blink = opts.animate && t % 3.2 > 3.05 ? 1 : 0;
  const hasTrail = Boolean(opts.trail && opts.trail !== 'none');
  const cx = hasTrail ? w * 0.66 : w / 2;
  if (hasTrail) {
    const tr = trailById(opts.trail!);
    drawTrailPreview(ctx, tr.style, tr.colors, cx - size * 0.45, groundY - size * 0.55 - bounce * hh * 0.12, size, t);
  }
  drawCharacter(ctx, cx, groundY - size * 0.55 - bounce * hh * 0.12, size, opts.shape ?? 'square', skin, {
    squash,
    lookX: opts.animate ? Math.sin(t * 0.9) * 0.6 : 0.4,
    blink,
    time: t,
    rot: opts.animate && opts.shape === 'hexagon' ? t : 0,
    faceRot: 0,
  });
}

/** Create a character preview canvas. Animated previews share one rAF loop. */
export function previewCanvas(opts: PreviewOptions, cls = ''): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  if (cls) canvas.className = cls;
  const entry: Live = { canvas, opts, t0: performance.now() };
  optsOf.set(canvas, opts);
  // Paint once attached (needs layout for size).
  requestAnimationFrame(() => {
    if (!canvas.isConnected) {
      requestAnimationFrame(() => canvas.isConnected && paint(canvas, opts, 0));
      if (opts.animate) {
        live.add(entry);
        if (!raf) raf = requestAnimationFrame(tick);
      }
      return;
    }
    paint(canvas, opts, 0);
    if (opts.animate) {
      live.add(entry);
      if (!raf) raf = requestAnimationFrame(tick);
    }
  });
  return canvas;
}

/** Change what an existing preview shows. */
export function updatePreview(canvas: HTMLCanvasElement, opts: Partial<PreviewOptions>): void {
  const current = optsOf.get(canvas);
  if (!current) return;
  Object.assign(current, opts);
  // Animated previews pick the change up on their next frame.
  for (const l of live) if (l.canvas === canvas) return;
  if (canvas.isConnected) paint(canvas, current, 0);
}
