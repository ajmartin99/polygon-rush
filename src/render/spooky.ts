/**
 * The Haunted Run's monsters and pumpkins, shared by the game, the home
 * screen and the art tool (icons, store and website pictures).
 */

/** Halloween: saws become grinning jack-o'-lanterns (same size and hitbox). */
export function drawPumpkin(ctx: CanvasRenderingContext2D, cx: number, cy: number, rr: number, time: number): void {
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

/** A blocky zombie, feet at the origin, reaching toward +x. */
export function drawZombie(ctx: CanvasRenderingContext2D, u: number, time: number, lunge = 0, shove = 0): void {
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
export function drawGhost(ctx: CanvasRenderingContext2D, px: number, py: number, u: number, time: number, lunge = 0, shove = 0): void {
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
