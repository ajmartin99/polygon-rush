import type { Racer } from '../game/racer';
import { SHAPE_INFO, type ShapeMode } from '../game/shapes';
import { skinById, trailById } from '../meta/catalog';
import { drawParticleShape } from './character';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Gravity (tiles/s², negative = falls). */
  g: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  /** Size multiplier at end of life. */
  grow: number;
  color: string;
  style: string;
  rot: number;
  vr: number;
  /** Draw behind racers (trails) or in front (bursts). */
  back: boolean;
  /** Fluttery side-to-side drift (tiles/s), its speed and phase. */
  wob: number;
  wf: number;
  ph: number;
  /** Zigzag flight: average seconds between sharp changes of direction (0 = off). */
  zig: number;
  /** Time left until the next dart, which way it goes (+1 / -1), and the bank angle. */
  zt: number;
  side: number;
  tilt: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
}

const MAX_PARTICLES = 520;

/**
 * World-space particles, floating text, screen shake and flashes.
 * Everything is in tiles so each split-screen view draws it correctly.
 */
export class Effects {
  private pool: Particle[] = [];
  private live: Particle[] = [];
  private floats: FloatText[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#ff3d5a';
  quality = 1;
  reducedMotion = false;
  private trailAcc = new Map<string, number>();

  clear(): void {
    this.pool.push(...this.live);
    this.live.length = 0;
    this.floats.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.trailAcc.clear();
  }

  private spawn(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.live.length >= MAX_PARTICLES * this.quality) return;
    const o = this.pool.pop() ?? ({} as Particle);
    o.x = p.x;
    o.y = p.y;
    o.vx = p.vx ?? 0;
    o.vy = p.vy ?? 0;
    o.g = p.g ?? 0;
    o.drag = p.drag ?? 0;
    o.life = o.max = p.max ?? 0.6;
    o.size = p.size ?? 0.12;
    o.grow = p.grow ?? 0.3;
    o.color = p.color ?? '#ffffff';
    o.style = p.style ?? 'circle';
    o.rot = p.rot ?? Math.random() * Math.PI * 2;
    o.vr = p.vr ?? 0;
    o.back = p.back ?? false;
    o.wob = p.wob ?? 0;
    o.wf = p.wf ?? 0;
    o.ph = p.ph ?? 0;
    o.zig = p.zig ?? 0;
    o.zt = p.zt ?? 0;
    o.side = p.side ?? 1;
    o.tilt = 0;
    this.live.push(o);
  }

  text(x: number, y: number, text: string, color = '#ffffff', size = 0.55, max = 0.9): void {
    this.floats.push({ x, y, text, color, life: max, max, size });
    if (this.floats.length > 24) this.floats.shift();
  }

  addShake(amount: number): void {
    if (this.reducedMotion) return;
    this.shake = Math.min(0.5, this.shake + amount);
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        this.pool.push(p);
        continue;
      }
      if (p.zig) {
        // Dart one way, then snap the other: an erratic zigzag climb, banking into each turn.
        p.zt -= dt;
        if (p.zt <= 0) {
          p.zt = p.zig * (0.5 + Math.random());
          p.side = Math.random() < 0.8 ? -p.side : p.side;
          p.vx = -0.8 + p.side * (1.6 + Math.random() * 2.6);
          p.vy = 1.3 + Math.random() * 2.4;
        }
        p.tilt += (Math.max(-0.7, Math.min(0.7, p.vx * 0.16)) - p.tilt) * Math.min(1, dt * 18);
      }
      p.vy += p.g * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.wob) {
        const a = (p.max - p.life) * p.wf + p.ph;
        p.x += Math.cos(a * 0.7) * p.wob * 0.5 * dt;
        p.y += Math.sin(a) * p.wob * dt;
      }
      p.rot += p.vr * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.y += dt * 1.2;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  draw(ctx: CanvasRenderingContext2D, sx: (x: number) => number, sy: (y: number) => number, scale: number, back: boolean, x0: number, x1: number): void {
    for (const p of this.live) {
      if (p.back !== back || p.x < x0 || p.x > x1) continue;
      const k = p.life / p.max;
      const r = p.size * scale * (p.grow + (1 - p.grow) * k);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      if (p.style === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1.5, scale * 0.08 * k);
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), p.size * scale * (1.6 - k), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.style === 'circle') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.style === 'shard') {
        ctx.save();
        ctx.translate(sx(p.x), sy(p.y));
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.6);
        ctx.lineTo(r, 0);
        ctx.lineTo(-r * 0.4, r * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.style === 'speed') {
        ctx.fillStyle = p.color;
        ctx.fillRect(sx(p.x) - r * 4, sy(p.y) - r * 0.15, r * 8, r * 0.3);
      } else {
        drawParticleShape(ctx, p.style, sx(p.x), sy(p.y), r, p.color, p.rot, p.tilt);
      }
    }
    ctx.globalAlpha = 1;
    if (!back) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const f of this.floats) {
        if (f.x < x0 || f.x > x1) continue;
        const k = f.life / f.max;
        const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
        ctx.globalAlpha = Math.min(1, k * 2.5);
        ctx.font = `700 ${Math.round(f.size * scale * pop)}px Fredoka, sans-serif`;
        ctx.lineWidth = Math.max(2, f.size * scale * 0.2);
        ctx.strokeStyle = 'rgba(20,8,50,0.85)';
        ctx.strokeText(f.text, sx(f.x), sy(f.y));
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, sx(f.x), sy(f.y));
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- emitters
  /** Continuous per-frame effects for a racer (trail, boost lines, snow). */
  racerTick(r: Racer, dt: number, isLocal: boolean): void {
    const b = r.body;
    const trail = trailById(r.trail);
    const behind = b.x - 0.35;
    if (trail.style !== 'none' && (isLocal || this.quality > 0.7)) {
      const rate = trail.style === 'rainbow' || trail.style === 'comet' ? 60 : trail.style === 'lines' ? 14 : trail.style === 'bats' ? 12 : 22;
      let acc = (this.trailAcc.get(r.id) ?? 0) + dt * rate * this.quality;
      while (acc >= 1) {
        acc -= 1;
        const c = trail.colors[Math.floor(Math.random() * trail.colors.length)];
        const jitter = (Math.random() - 0.5) * 0.4;
        switch (trail.style) {
          case 'rainbow': {
            const idx = Math.floor((performance.now() / 40) % trail.colors.length);
            for (let i = 0; i < trail.colors.length; i++) {
              this.spawn({ x: behind, y: b.y + (i - 2.5) * 0.09 + 0.05, size: 0.06, grow: 1, max: 0.45, color: trail.colors[(i + idx * 0) % trail.colors.length], back: true });
            }
            break;
          }
          case 'comet':
            this.spawn({ x: behind, y: b.y + jitter * 0.4, size: 0.26, grow: 0.05, max: 0.5, color: c, back: true });
            break;
          case 'bubbles':
            this.spawn({ x: behind, y: b.y + jitter, vx: -0.5, vy: 1.2, size: 0.12, grow: 1.3, max: 0.9, color: c, style: 'bubbles', back: true });
            break;
          case 'confetti':
            this.spawn({ x: behind, y: b.y + jitter, vx: -1, vy: 2, g: -6, size: 0.1, grow: 1, max: 0.9, color: c, style: 'confetti', vr: 8, back: true });
            break;
          case 'notes':
            this.spawn({ x: behind, y: b.y + jitter, vy: 1.4, size: 0.16, grow: 1, max: 0.9, color: c, style: 'notes', back: true });
            break;
          case 'bats': {
            // Each bat zigzags upward on its own erratic path (see update: zig).
            const side = Math.random() < 0.5 ? -1 : 1;
            this.spawn({
              x: behind,
              y: b.y + jitter,
              vx: -0.8 + side * (1.6 + Math.random() * 2.4),
              vy: 1.5 + Math.random() * 2,
              zig: 0.09 + Math.random() * 0.08,
              zt: 0.05 + Math.random() * 0.1,
              side,
              size: 0.12 + Math.random() * 0.08,
              grow: 1,
              max: 0.9 + Math.random() * 0.6,
              color: c,
              style: 'bats',
              rot: Math.random() * 6,
              vr: 14 + Math.random() * 8,
              back: true,
            });
            break;
          }
          case 'mist':
            this.spawn({ x: behind, y: b.y + jitter * 0.6, vy: 0.6, size: 0.2, grow: 1.6, max: 0.9, color: c, style: 'mist', back: true });
            break;
          default:
            this.spawn({ x: behind, y: b.y + jitter, vy: (Math.random() - 0.5) * 0.6, size: trail.style === 'lines' ? 0.08 : 0.13, grow: 0.2, max: 0.6, color: c, style: trail.style, vr: 3, back: true });
        }
      }
      this.trailAcc.set(r.id, acc);
    }
    if (r.boost > 0 && Math.random() < dt * 40) {
      this.spawn({ x: b.x + (Math.random() - 0.5) * 2, y: b.y + (Math.random() - 0.5) * 1.6, vx: -8, size: 0.12, max: 0.3, color: '#ffffff', style: 'speed', back: true });
    }
    if (r.snow > 0 && Math.random() < dt * 30) {
      this.spawn({ x: b.x + (Math.random() - 0.5) * 1.2, y: b.y + 0.8, vy: -1.5, size: 0.08, max: 0.6, color: '#e8fbff', style: 'sparkle', vr: 3 });
    }
    if (r.magnet > 0 && Math.random() < dt * 12) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({ x: b.x + Math.cos(a) * 1.8, y: b.y + Math.sin(a) * 1.8, vx: -Math.cos(a) * 3.6, vy: -Math.sin(a) * 3.6, size: 0.06, max: 0.45, color: '#ff8a8a' });
    }
  }

  jump(r: Racer, kind: string): void {
    const b = r.body;
    const down = b.gdir < 0 ? -1 : 1;
    const color = kind === 'pad' ? '#ffd23f' : kind === 'orb' ? '#fff27a' : 'rgba(255,255,255,0.85)';
    const n = kind === 'pad' || kind === 'orb' ? 10 : 5;
    for (let i = 0; i < n; i++) {
      this.spawn({ x: b.x - 0.2 + Math.random() * 0.4, y: b.y + down * 0.4, vx: (Math.random() - 0.5) * 3 - 1, vy: -down * Math.random() * 2, drag: 4, size: 0.1 + Math.random() * 0.08, max: 0.4, color });
    }
    if (kind === 'orb' || kind === 'pad') this.spawn({ x: b.x, y: b.y, size: 0.5, max: 0.35, color: '#ffd23f', style: 'ring' });
  }

  land(r: Racer): void {
    const b = r.body;
    const down = b.gdir < 0 ? -1 : 1;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      this.spawn({ x: b.x + side * 0.3, y: b.y + down * 0.42, vx: side * (1.5 + Math.random() * 2), vy: -down * 0.6, drag: 5, size: 0.09, max: 0.35, color: 'rgba(255,255,255,0.8)' });
    }
  }

  gem(x: number, y: number, value: number, local: boolean): void {
    const big = value > 1;
    const color = big ? '#ff8af2' : '#7fe9ff';
    for (let i = 0; i < (big ? 12 : 5); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      this.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, size: big ? 0.12 : 0.08, max: 0.45, color, style: 'sparkle', vr: 6 });
    }
    if (local) this.text(x, y + 0.5, `+${value}`, big ? '#ff8af2' : '#bff4ff', big ? 0.7 : 0.45, 0.7);
  }

  hit(r: Racer, local: boolean): void {
    const b = r.body;
    const skin = skinById(r.skin);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 4;
      this.spawn({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, g: -12, size: 0.14, max: 0.7, color: i % 2 ? skin.body : '#ffffff', style: 'shard', vr: 10 });
    }
    if (local) {
      this.addShake(0.28);
      this.flash = 0.45;
      this.flashColor = '#ff3d5a';
      this.text(b.x, b.y + 1, ['Ouch!', 'Oops!', 'Bonk!', 'Eep!'][Math.floor(Math.random() * 4)], '#ffd0d8', 0.6, 0.8);
    }
  }

  shieldPop(r: Racer): void {
    const b = r.body;
    this.spawn({ x: b.x, y: b.y, size: 0.7, max: 0.4, color: '#7fe9ff', style: 'ring' });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.spawn({ x: b.x + Math.cos(a) * 0.7, y: b.y + Math.sin(a) * 0.7, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, drag: 3, size: 0.1, max: 0.4, color: '#bff4ff', style: 'sparkle' });
    }
    this.addShake(0.1);
  }

  portal(r: Racer, mode: ShapeMode): void {
    const b = r.body;
    const color = SHAPE_INFO[mode].color;
    this.spawn({ x: b.x, y: b.y, size: 0.9, max: 0.5, color, style: 'ring' });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.spawn({ x: b.x, y: b.y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, drag: 4, size: 0.12, max: 0.55, color, style: 'stars', vr: 5 });
    }
  }

  pickup(x: number, y: number, label: string, color: string): void {
    this.spawn({ x, y, size: 0.7, max: 0.45, color, style: 'ring' });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.spawn({ x, y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, drag: 3, size: 0.12, max: 0.5, color, style: 'stars', vr: 4 });
    }
    this.text(x, y + 0.8, label, color, 0.6, 1);
  }

  death(r: Racer): void {
    const b = r.body;
    const skin = skinById(r.skin);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this.spawn({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 3, g: -14, size: 0.16 + Math.random() * 0.1, max: 1.1, color: [skin.body, skin.accent, '#ffffff'][i % 3], style: 'shard', vr: 12 });
    }
    this.spawn({ x: b.x, y: b.y, size: 1.2, max: 0.5, color: '#ffffff', style: 'ring' });
    this.addShake(0.4);
    this.flash = 0.6;
  }

  confetti(x: number, y: number): void {
    const colors = ['#ff5f5f', '#ffd23f', '#3ee6b0', '#4dc9ff', '#c27bff', '#ff7ac6'];
    for (let i = 0; i < 60; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 2,
        y: y + Math.random() * 2,
        vx: (Math.random() - 0.5) * 8,
        vy: 4 + Math.random() * 6,
        g: -9,
        drag: 1,
        size: 0.12,
        grow: 1,
        max: 1.6,
        color: colors[i % colors.length],
        style: 'confetti',
        vr: 10,
      });
    }
  }
}
