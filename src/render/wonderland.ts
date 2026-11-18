/**
 * Christmas Wonderland drawings: the Holiday Run's monsters, its villains
 * (Jack Frost and Krampus), the presents you throw at them, and the menu's
 * Christmas tree. Everything is drawn in code, like the rest of the game.
 */
import type { MobKind } from '../game/world';

type Ctx = CanvasRenderingContext2D;

/**
 * A Holiday Run monster centred on its hitbox (px, py), `s` px per tile,
 * facing `facing` (1 = right). `rise` (0..1) is how far a dropping or
 * popping one has come.
 */
export function drawWonderMob(ctx: Ctx, kind: MobKind, px: number, py: number, s: number, time: number, facing: 1 | -1, rise: number): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'snowman':
      ctx.translate(px, py + s * 0.6);
      ctx.scale(facing, 1);
      snowman(ctx, s, time);
      break;
    case 'penguin':
      ctx.translate(px, py + s * 0.6);
      ctx.scale(facing, 1);
      penguin(ctx, s, time);
      break;
    case 'soldier':
      ctx.translate(px, py + s * 0.6);
      ctx.scale(facing, 1);
      soldier(ctx, s, time);
      break;
    case 'snowflake':
      ctx.translate(px, py);
      snowflake(ctx, s * 0.85, time);
      break;
    case 'icicle':
      ctx.translate(px, py);
      icicle(ctx, s, rise);
      break;
    case 'jackbox':
      jackbox(ctx, px, py, s, time, rise);
      break;
    case 'snowball':
      ctx.translate(px, py);
      ctx.rotate(-time * 6);
      snowball(ctx, s * 0.55);
      break;
    default:
      break;
  }
  ctx.restore();
}

function outline(ctx: Ctx, s: number, color = '#1b2a4a'): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.stroke();
}

/** Feet at the origin, facing +x: three snowballs, a carrot nose and a top hat, rocking as it rolls. */
function snowman(ctx: Ctx, s: number, time: number): void {
  ctx.rotate(Math.sin(time * 6) * 0.08);
  const ball = (y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(0, y, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-r * 0.3, y - r * 0.3, r * 0.1, 0, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#cfe3ff');
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx, s);
  };
  ball(-s * 0.42, s * 0.44);
  ball(-s * 1.1, s * 0.32);
  ball(-s * 1.6, s * 0.24);
  // Coal buttons and eyes, carrot nose.
  ctx.fillStyle = '#1b1140';
  for (const y of [-0.95, -1.15]) {
    ctx.beginPath();
    ctx.arc(s * 0.05, y * s, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const x of [-0.02, 0.12]) {
    ctx.beginPath();
    ctx.arc(x * s, -s * 1.66, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff8a1f';
  ctx.beginPath();
  ctx.moveTo(s * 0.12, -s * 1.6);
  ctx.lineTo(s * 0.45, -s * 1.56);
  ctx.lineTo(s * 0.12, -s * 1.52);
  ctx.closePath();
  ctx.fill();
  // Scarf and hat.
  ctx.fillStyle = '#e8304a';
  ctx.fillRect(-s * 0.28, -s * 1.42, s * 0.56, s * 0.1);
  ctx.fillRect(-s * 0.25, -s * 1.42, s * 0.1, s * 0.32);
  ctx.fillStyle = '#1b1140';
  ctx.fillRect(-s * 0.3, -s * 1.86, s * 0.6, s * 0.07);
  ctx.fillRect(-s * 0.2, -s * 2.18, s * 0.4, s * 0.33);
  ctx.fillStyle = '#e8304a';
  ctx.fillRect(-s * 0.2, -s * 1.93, s * 0.4, s * 0.06);
  // Stick arms waving.
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = Math.max(1, s * 0.06);
  const wave = Math.sin(time * 5) * 0.3;
  ctx.beginPath();
  ctx.moveTo(s * 0.25, -s * 1.1);
  ctx.lineTo(s * 0.65, -s * (1.35 + wave * 0.5));
  ctx.moveTo(-s * 0.25, -s * 1.1);
  ctx.lineTo(-s * 0.62, -s * (1.3 - wave * 0.5));
  ctx.stroke();
}

/** Feet at the origin, facing +x, sliding on its belly. */
function penguin(ctx: Ctx, s: number, time: number): void {
  const wob = Math.sin(time * 10) * 0.06;
  ctx.rotate(1.2 + wob);
  // Body lying forward.
  ctx.fillStyle = '#1b2240';
  ctx.beginPath();
  ctx.ellipse(-s * 0.55, 0, s * 0.62, s * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, s, '#0a0e1e');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-s * 0.5, s * 0.12, s * 0.45, s * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head, eye and beak.
  ctx.fillStyle = '#1b2240';
  ctx.beginPath();
  ctx.arc(-s * 1.15, -s * 0.02, s * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-s * 1.2, -s * 0.1, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffb02e';
  ctx.beginPath();
  ctx.moveTo(-s * 1.38, -s * 0.02);
  ctx.lineTo(-s * 1.62, s * 0.04);
  ctx.lineTo(-s * 1.38, s * 0.1);
  ctx.closePath();
  ctx.fill();
  // Flippers and feet.
  ctx.fillStyle = '#ffb02e';
  ctx.fillRect(s * 0.0, -s * 0.08, s * 0.22, s * 0.1);
  ctx.fillRect(s * 0.0, s * 0.06, s * 0.22, s * 0.1);
  // A little spray of snow behind it.
  ctx.rotate(-1.2 - wob);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 4; i++) {
    const t = (time * 3 + i / 4) % 1;
    ctx.beginPath();
    ctx.arc(-s * (0.3 + t * 0.8), -s * (0.1 + t * 0.5), s * 0.07 * (1 - t), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Feet at the origin, facing +x: a nutcracker-style toy soldier marching stiffly. */
function soldier(ctx: Ctx, s: number, time: number): void {
  const step = Math.sin(time * 9);
  ctx.lineWidth = Math.max(1, s * 0.05);
  // Legs: one forward, one back.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-s * 0.2 + step * s * 0.08, -s * 0.6, s * 0.16, s * 0.6);
  ctx.fillRect(s * 0.04 - step * s * 0.08, -s * 0.6, s * 0.16, s * 0.6);
  ctx.fillStyle = '#1b1140';
  ctx.fillRect(-s * 0.22 + step * s * 0.08, -s * 0.12, s * 0.2, s * 0.12);
  ctx.fillRect(s * 0.02 - step * s * 0.08, -s * 0.12, s * 0.2, s * 0.12);
  // Red coat with gold belt and buttons.
  ctx.fillStyle = '#d61f3a';
  ctx.fillRect(-s * 0.28, -s * 1.3, s * 0.56, s * 0.72);
  ctx.strokeStyle = '#5a0a1a';
  ctx.strokeRect(-s * 0.28, -s * 1.3, s * 0.56, s * 0.72);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(-s * 0.28, -s * 0.78, s * 0.56, s * 0.08);
  for (const y of [-1.18, -1.02, -0.88]) ctx.fillRect(-s * 0.03, y * s, s * 0.06, s * 0.06);
  // Arm swinging, holding a candy-cane rifle over the shoulder.
  ctx.strokeStyle = '#d61f3a';
  ctx.lineWidth = s * 0.14;
  ctx.beginPath();
  ctx.moveTo(s * 0.28, -s * 1.2);
  ctx.lineTo(s * 0.32 + step * s * 0.12, -s * 0.85);
  ctx.stroke();
  // Face and tall black hat.
  ctx.fillStyle = '#ffd9b8';
  ctx.fillRect(-s * 0.2, -s * 1.62, s * 0.4, s * 0.34);
  ctx.fillStyle = '#ff9aa8';
  ctx.beginPath();
  ctx.arc(s * 0.12, -s * 1.4, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1140';
  ctx.fillRect(s * 0.04, -s * 1.52, s * 0.05, s * 0.05);
  ctx.fillRect(-s * 0.22, -s * 2.1, s * 0.44, s * 0.5);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(-s * 0.22, -s * 1.66, s * 0.44, s * 0.05);
  ctx.beginPath();
  ctx.arc(0, -s * 1.86, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

/** A giant spinning snowflake (the Holiday Run's ghost: it drifts through anything). */
function snowflake(ctx: Ctx, s: number, time: number): void {
  ctx.rotate(time * 1.4);
  const glow = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.3);
  glow.addColorStop(0, 'rgba(180,230,255,0.5)');
  glow.addColorStop(1, 'rgba(180,230,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-s * 1.3, -s * 1.3, s * 2.6, s * 2.6);
  ctx.strokeStyle = '#eaf8ff';
  ctx.lineWidth = Math.max(2, s * 0.12);
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i / 6) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -s);
    ctx.moveTo(0, -s * 0.55);
    ctx.lineTo(-s * 0.25, -s * 0.78);
    ctx.moveTo(0, -s * 0.55);
    ctx.lineTo(s * 0.25, -s * 0.78);
    ctx.stroke();
    ctx.restore();
  }
  // Grumpy face in the middle.
  ctx.rotate(-time * 1.4);
  ctx.fillStyle = '#7ccfff';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b2a4a';
  ctx.fillRect(-s * 0.15, -s * 0.08, s * 0.08, s * 0.08);
  ctx.fillRect(s * 0.07, -s * 0.08, s * 0.08, s * 0.08);
  ctx.fillRect(-s * 0.1, s * 0.1, s * 0.2, s * 0.04);
}

/** Centred on its hitbox, point down. Before it drops (`rise` 0) it glints. */
function icicle(ctx: Ctx, s: number, rise: number): void {
  const g = ctx.createLinearGradient(0, -s * 0.8, 0, s * 0.7);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#7ccfff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-s * 0.32, -s * 0.8);
  ctx.lineTo(s * 0.32, -s * 0.8);
  ctx.lineTo(s * 0.12, s * 0.1);
  ctx.lineTo(0, s * 0.7);
  ctx.lineTo(-s * 0.12, s * 0.1);
  ctx.closePath();
  ctx.fill();
  outline(ctx, s, '#2a6a9a');
  if (rise > 0 && rise < 1) {
    // Falling: speed lines above it.
    ctx.strokeStyle = 'rgba(220,245,255,0.7)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    for (const dx of [-0.2, 0, 0.2]) {
      ctx.moveTo(dx * s, -s * 0.95);
      ctx.lineTo(dx * s, -s * (0.95 + 0.8 * (1 - rise)));
    }
    ctx.stroke();
  }
}

/** The box sits on the floor; the jack springs up to (px, py). */
function jackbox(ctx: Ctx, px: number, py: number, s: number, time: number, rise: number): void {
  const floor = py + s * 0.6 + (1 - rise) * s * 1.5;
  const base = Math.max(floor, py + s * 0.6);
  // Box (stays on the floor).
  const bx = px - s * 0.45;
  const by = base - s * 0.75;
  ctx.fillStyle = '#3e7bff';
  ctx.fillRect(bx, by, s * 0.9, s * 0.75);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(bx, by + s * 0.3, s * 0.9, s * 0.12);
  ctx.fillRect(px - s * 0.06, by, s * 0.12, s * 0.75);
  ctx.strokeStyle = '#122a6a';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.strokeRect(bx, by, s * 0.9, s * 0.75);
  if (rise <= 0.02) return;
  // Spring and the jack's grinning clown head.
  const top = py;
  ctx.strokeStyle = '#c0c8d8';
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.beginPath();
  const coils = 5;
  for (let i = 0; i <= coils * 2; i++) {
    const y = by - ((by - (top + s * 0.3)) * i) / (coils * 2);
    ctx.lineTo(px + (i % 2 ? s * 0.18 : -s * 0.18), y);
  }
  ctx.stroke();
  const bob = Math.sin(time * 12) * s * 0.04;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, top + bob, s * 0.36, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, s);
  ctx.fillStyle = '#e8304a';
  ctx.beginPath();
  ctx.arc(px - s * 0.18, top - s * 0.02 + bob, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(px - s * 0.3, top - s * 0.25 + bob);
  ctx.lineTo(px, top - s * 0.7 + bob);
  ctx.lineTo(px + s * 0.3, top - s * 0.25 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(px, top - s * 0.72 + bob, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1140';
  ctx.fillRect(px - s * 0.06, top - s * 0.12 + bob, s * 0.06, s * 0.06);
  ctx.fillRect(px + s * 0.1, top - s * 0.12 + bob, s * 0.06, s * 0.06);
  ctx.beginPath();
  ctx.arc(px + s * 0.04, top + s * 0.08 + bob, s * 0.13, 0.1, Math.PI - 0.1);
  ctx.stroke();
}

function snowball(ctx: Ctx, r: number): void {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#bcd8ff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6a8ab8';
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();
  ctx.fillStyle = 'rgba(150,180,220,0.6)';
  ctx.beginPath();
  ctx.arc(r * 0.3, r * 0.2, r * 0.18, 0, Math.PI * 2);
  ctx.arc(-r * 0.25, r * 0.35, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------------ the villains
/** Jack Frost on a cloud of snow, facing left at the runner, centred on the origin. */
export function drawJackFrost(ctx: Ctx, s: number, time: number, hit: boolean, beat: number): void {
  const pulse = Math.pow(1 - Math.min(1, Math.max(0, beat)), 3);
  ctx.save();
  const glow = ctx.createRadialGradient(0, -s * 0.3, s * 0.3, 0, -s * 0.3, s * 2);
  glow.addColorStop(0, `rgba(150,220,255,${0.3 + pulse * 0.2})`);
  glow.addColorStop(1, 'rgba(150,220,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-s * 2, -s * 2.3, s * 4, s * 4);
  ctx.rotate(Math.sin(time * 2) * 0.05);
  ctx.lineJoin = 'round';
  const line = Math.max(1.5, s * 0.06);
  // Snow cloud he rides.
  ctx.fillStyle = hit ? '#ffffff' : '#e8f4ff';
  for (const [dx, dy, r] of [
    [-0.7, 0.55, 0.45],
    [0, 0.65, 0.55],
    [0.75, 0.55, 0.42],
    [0.35, 0.4, 0.4],
    [-0.35, 0.4, 0.4],
  ] as const) {
    ctx.beginPath();
    ctx.arc(dx * s + Math.sin(time * 2 + dx) * s * 0.05, dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Robe of icy blue with frosty trim.
  ctx.fillStyle = hit ? '#ffffff' : '#3d8bdc';
  ctx.strokeStyle = '#123a6a';
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.moveTo(-s * 0.15, -s * 0.75);
  ctx.quadraticCurveTo(s * 0.55, -s * 0.2, s * 0.6, s * 0.35);
  ctx.lineTo(-s * 0.6, s * 0.35);
  ctx.quadraticCurveTo(-s * 0.55, -s * 0.2, -s * 0.15, -s * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-s * 0.6, s * 0.25, s * 1.2, s * 0.1);
  // Arm raised, casting frost.
  ctx.strokeStyle = hit ? '#ffffff' : '#3d8bdc';
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 0.35);
  ctx.lineTo(-s * 0.75, -s * (0.55 + pulse * 0.25));
  ctx.stroke();
  ctx.fillStyle = `rgba(200,240,255,${0.5 + pulse * 0.5})`;
  for (let i = 0; i < 5; i++) {
    const a = time * 4 + i * 1.3;
    ctx.beginPath();
    ctx.arc(-s * 0.85 + Math.cos(a) * s * 0.2, -s * (0.6 + pulse * 0.25) + Math.sin(a) * s * 0.2, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pale blue face, white spiky hair and icy beard.
  const hx = -s * 0.1;
  const hy = -s * 0.98;
  ctx.fillStyle = hit ? '#ffffff' : '#cfeaff';
  ctx.strokeStyle = '#2a6a9a';
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.arc(hx, hy, s * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    const rr = i % 2 ? s * 0.34 : s * 0.62;
    ctx.lineTo(hx + Math.cos(a) * rr, hy - s * 0.1 + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.25, hy + s * 0.12);
  ctx.lineTo(hx + s * 0.2, hy + s * 0.12);
  ctx.lineTo(hx - s * 0.02, hy + s * 0.55);
  ctx.closePath();
  ctx.fill();
  // Icy eyes and a smirk.
  ctx.fillStyle = '#123a6a';
  ctx.fillRect(hx - s * 0.2, hy - s * 0.06, s * 0.08, s * 0.06);
  ctx.fillRect(hx + s * 0.0, hy - s * 0.06, s * 0.08, s * 0.06);
  ctx.strokeStyle = '#123a6a';
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.18, hy + s * 0.12);
  ctx.quadraticCurveTo(hx - s * 0.05, hy + s * (0.16 + pulse * 0.06), hx + s * 0.08, hy + s * 0.08);
  ctx.stroke();
  ctx.restore();
}

/** Krampus: horned, furry and grinning, with a long tongue and rattling chains. Centred on the origin, facing left. */
export function drawKrampus(ctx: Ctx, s: number, time: number, hit: boolean, beat: number): void {
  const pulse = Math.pow(1 - Math.min(1, Math.max(0, beat)), 3);
  ctx.save();
  const glow = ctx.createRadialGradient(0, -s * 0.3, s * 0.3, 0, -s * 0.3, s * 2);
  glow.addColorStop(0, `rgba(255,80,40,${0.25 + pulse * 0.2})`);
  glow.addColorStop(1, 'rgba(255,80,40,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-s * 2, -s * 2.3, s * 4, s * 4);
  ctx.rotate(Math.sin(time * 1.8) * 0.05);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const fur = hit ? '#ffffff' : '#5a3a26';
  const dark = '#2a160c';
  // Shaggy body.
  ctx.fillStyle = fur;
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath();
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rr = s * (0.75 + (i % 2 ? 0.08 : 0));
    ctx.lineTo(Math.cos(a) * rr * 0.85, s * 0.05 + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Chains swinging.
  ctx.strokeStyle = '#b8b8c8';
  ctx.lineWidth = Math.max(1, s * 0.05);
  const sw = Math.sin(time * 3) * s * 0.15;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(-s * 0.6 + i * s * 0.22, s * (0.35 + Math.sin(i * 0.9) * 0.08) + sw * (i / 6), s * 0.09, s * 0.06, i % 2 ? 0 : Math.PI / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Goat head with curling horns.
  const hx = -s * 0.15;
  const hy = -s * 0.85;
  ctx.strokeStyle = hit ? '#ffffff' : '#2a1a10';
  ctx.lineWidth = s * 0.16;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hx + dir * s * 0.18, hy - s * 0.25);
    ctx.quadraticCurveTo(hx + dir * s * 0.65, hy - s * 0.8, hx + dir * s * 0.35, hy - s * 1.05);
    ctx.stroke();
  }
  ctx.fillStyle = fur;
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath();
  ctx.ellipse(hx, hy, s * 0.34, s * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Glowing eyes, toothy grin and long red tongue (wags on the beat).
  ctx.fillStyle = '#ffd23f';
  for (const ex of [-0.14, 0.08]) {
    ctx.beginPath();
    ctx.arc(hx + ex * s, hy - s * 0.08, s * 0.065, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1b0a0a';
  ctx.beginPath();
  ctx.ellipse(hx - s * 0.04, hy + s * 0.17, s * 0.2, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) ctx.fillRect(hx - s * 0.2 + i * s * 0.1, hy + s * 0.1, s * 0.04, s * 0.06);
  ctx.fillStyle = '#e8304a';
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.12, hy + s * 0.2);
  ctx.quadraticCurveTo(hx - s * 0.3, hy + s * (0.5 + pulse * 0.2), hx - s * 0.16, hy + s * (0.62 + pulse * 0.2));
  ctx.quadraticCurveTo(hx - s * 0.02, hy + s * 0.45, hx + s * 0.02, hy + s * 0.2);
  ctx.closePath();
  ctx.fill();
  // A bundle of birch switches raised high.
  ctx.strokeStyle = '#a07a4a';
  ctx.lineWidth = Math.max(1, s * 0.04);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, -s * 0.1);
    ctx.lineTo(-s * (1.0 + i * 0.05), -s * (0.9 + i * 0.1 + pulse * 0.2));
    ctx.stroke();
  }
  ctx.restore();
}

/** A wrapped present, glowing (the Holiday Run's charge orbs: grab one to throw it at the villain). */
export function drawPresentOrb(ctx: Ctx, px: number, py: number, s: number, t: number): void {
  const r = s * 0.42;
  const glow = ctx.createRadialGradient(px, py, r * 0.2, px, py, r * 2.2);
  glow.addColorStop(0, 'rgba(255,240,170,0.55)');
  glow.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(px - r * 2.2, py - r * 2.2, r * 4.4, r * 4.4);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.sin(t * 3) * 0.15);
  const colors = ['#e8304a', '#2fbf71', '#3e7bff', '#c27bff'];
  ctx.fillStyle = colors[Math.floor(Math.abs(px * 7.3)) % colors.length];
  ctx.fillRect(-r, -r * 0.8, r * 2, r * 1.6);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(-r * 0.15, -r * 0.8, r * 0.3, r * 1.6);
  ctx.fillRect(-r, -r * 0.15, r * 2, r * 0.3);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
  // Bow.
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.95, r * 0.3, r * 0.18, -0.5, 0, Math.PI * 2);
  ctx.ellipse(r * 0.3, -r * 0.95, r * 0.3, r * 0.18, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ home screen
/** A decorated Christmas tree, base at (x, y), `h` tall, its lights twinkling to the beat. */
export function drawChristmasTree(ctx: Ctx, x: number, y: number, h: number, time: number, beat: number): void {
  const pulse = Math.pow(1 - Math.min(1, Math.max(0, beat)), 2);
  ctx.save();
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(x - h * 0.05, y - h * 0.12, h * 0.1, h * 0.12);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const top = y - h * (0.32 + i * 0.2);
    const bot = y - h * (0.08 + i * 0.18);
    const w = h * (0.42 - i * 0.08);
    ctx.fillStyle = i % 2 ? '#1f8a4c' : '#24a058';
    ctx.beginPath();
    ctx.moveTo(x, top - h * 0.12);
    ctx.lineTo(x + w, bot);
    ctx.lineTo(x - w, bot);
    ctx.closePath();
    ctx.fill();
  }
  // Lights: blink in turn, all bright on the beat.
  const colors = ['#ff4f5e', '#ffd23f', '#3ad7ff', '#ff7ac6', '#3ee6b0'];
  for (let i = 0; i < 18; i++) {
    const row = i % 4;
    const k = (i * 0.37) % 1;
    const w = h * (0.36 - row * 0.08);
    const ly = y - h * (0.12 + row * 0.19) - k * h * 0.08;
    const lx = x + (k * 2 - 1) * w * (0.85 - k * 0.3);
    const on = (Math.floor(time * 3) + i) % 3 !== 0 || pulse > 0.5;
    ctx.fillStyle = on ? colors[i % colors.length] : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(lx, ly, h * 0.022 * (1 + pulse * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  // Star on top.
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  const sy = y - h * 1.0;
  const sr = h * 0.07 * (1 + pulse * 0.15);
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? sr * 0.45 : sr;
    ctx.lineTo(x + Math.cos(a) * rr, sy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Gently falling snow over an area (deterministic from time, no state). */
export function drawSnowfall(ctx: Ctx, r: { x: number; y: number; w: number; h: number }, time: number, amount: number, calm: boolean): void {
  const n = Math.round(70 * amount);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < n; i++) {
    const seed = Math.sin(i * 91.7) * 43758.5453;
    const h = seed - Math.floor(seed);
    const speed = calm ? 0.02 : 0.05 + h * 0.07;
    const fy = (h * 7 + time * speed) % 1;
    const fx = (((h * 13.1) % 1) + Math.sin(time * 0.7 + i) * 0.015 + 1) % 1;
    const size = 1.2 + h * 2.6;
    ctx.globalAlpha = 0.4 + h * 0.6;
    ctx.beginPath();
    ctx.arc(r.x + fx * r.w, r.y + fy * r.h, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
