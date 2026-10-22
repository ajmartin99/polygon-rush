import { BUFFER, CEIL, COYOTE, DT, HAZARD_HALF, PHYS, PLAYER_HALF, STEP_UP } from './constants';
import type { ShapeMode } from './shapes';
import { sawX, sawY, type Solid, type World, type WorldObj } from './world';

/** Pure physical state of a racer. Plain data so it can be cloned for AI look-ahead. */
export interface Body {
  x: number;
  y: number;
  vy: number;
  mode: ShapeMode;
  /** Direction gravity pulls along y: -1 = down (normal), +1 = up (flipped). */
  gdir: -1 | 1;
  grounded: boolean;
  /** Body clock (seconds). */
  t: number;
  lastGround: number;
  lastPress: number;
  pressUsed: number;
  held: boolean;
  usedOrb: number;
  usedPad: number;
  /** Swipe-down "slam": drop fast toward the current gravity side until landing. */
  slam: boolean;
  /** Body time of the last Roller flip (mid-air flips have a short cooldown). */
  lastFlip: number;
  /** Visual rotation (radians, world space, counter-clockwise). */
  rot: number;
}

export interface StepOpts {
  /** Horizontal speed this step (tiles/s). */
  speed: number;
  /** Invulnerable: hazards and block sides are ignored (tops still solid). */
  ghost: boolean;
  /** Extra hazard size, used by tests to demand timing slack. */
  inflate?: number;
}

export interface StepEvents {
  hit: boolean;
  fell: boolean;
  jumped: boolean;
  landed: boolean;
  flipped: boolean;
  hopped: boolean;
  pad: boolean;
  orb: boolean;
  bonk: boolean;
  portal: ShapeMode | null;
}

export function newEvents(): StepEvents {
  return { hit: false, fell: false, jumped: false, landed: false, flipped: false, hopped: false, pad: false, orb: false, bonk: false, portal: null };
}

function resetEvents(e: StepEvents): void {
  e.hit = e.fell = e.jumped = e.landed = e.flipped = e.hopped = e.pad = e.orb = e.bonk = false;
  e.portal = null;
}

export function createBody(x: number, mode: ShapeMode = 'square'): Body {
  return {
    x,
    y: PLAYER_HALF,
    vy: 0,
    mode,
    gdir: -1,
    grounded: true,
    t: 0,
    lastGround: 0,
    lastPress: -10,
    pressUsed: -10,
    held: false,
    usedOrb: -1,
    usedPad: -1,
    slam: false,
    lastFlip: -10,
    rot: 0,
  };
}

export function cloneBody(b: Body): Body {
  return { ...b };
}

// "Up-axis" helpers: work in coordinates where the player's head is always +.
const upY = (y: number, gdir: number) => (gdir < 0 ? y : -y);
const fromUp = (u: number, gdir: number) => (gdir < 0 ? u : -u);
const topUp = (s: Solid, gdir: number) => (gdir < 0 ? s.y1 : -s.y0);
const bottomUp = (s: Solid, gdir: number) => (gdir < 0 ? s.y0 : -s.y1);

const H = PLAYER_HALF;
/** Seconds between mid-air Roller flips. */
export const FLIP_COOLDOWN = 0.22;
/** How much faster than a normal fall a slam drops. */
export const SLAM_BOOST = 1.35;
const scratchNear: WorldObj[] = [];

function overlapsSolid(b: Body, s: Solid): boolean {
  return b.x + H > s.x0 && b.x - H < s.x1 && b.y + H > s.y0 && b.y - H < s.y1;
}

/**
 * Advance one fixed step. Mutates `b`, writes what happened into `ev`.
 * Shared by players, CPU rivals (look-ahead) and the solvability tests.
 */
export function stepBody(b: Body, held: boolean, world: World, o: StepOpts, ev: StepEvents, near: WorldObj[] = scratchNear): StepEvents {
  resetEvents(ev);
  const dt = DT;
  b.t += dt;
  const pressEdge = held && !b.held;
  b.held = held;
  if (pressEdge) b.lastPress = b.t;
  const P = PHYS[b.mode];
  const up = -b.gdir;
  const buffered = b.lastPress > b.pressUsed && b.t - b.lastPress <= BUFFER;
  const wasGrounded = b.grounded;

  world.query(b.x - 2.5, b.x + 2.5, near);

  // ------------------------------------------------------------ actions
  switch (b.mode) {
    case 'square': {
      const canJump = b.grounded || b.t - b.lastGround <= COYOTE;
      if (canJump && (buffered || held)) {
        b.vy = P.jump * up;
        b.grounded = false;
        b.lastGround = -1e9;
        b.pressUsed = b.t;
        ev.jumped = true;
      } else if (buffered && !b.grounded) {
        for (const obj of near) {
          if (obj.kind === 'orb' && obj.id !== b.usedOrb && Math.abs(obj.x - b.x) < 0.85 && Math.abs(obj.y - b.y) < 0.85) {
            b.vy = P.orb * up;
            b.usedOrb = obj.id;
            b.pressUsed = b.t;
            ev.orb = true;
            ev.jumped = true;
            b.slam = false;
            break;
          }
        }
      }
      b.vy += b.gdir * P.gravity * dt;
      break;
    }
    case 'hexagon': {
      // Flip any time, even mid-air (a short cooldown stops hovering by mashing).
      const onSurface = b.grounded || b.t - b.lastGround <= COYOTE;
      const canFlip = onSurface || b.t - b.lastFlip >= FLIP_COOLDOWN;
      if (canFlip && buffered) {
        b.gdir = b.gdir < 0 ? 1 : -1;
        // Head for the other side straight away, keeping some momentum.
        b.vy = b.gdir * Math.max(3, Math.abs(b.vy) * 0.5);
        b.lastFlip = b.t;
        b.slam = false;
        b.grounded = false;
        b.lastGround = -1e9;
        b.pressUsed = b.t;
        ev.flipped = true;
        ev.jumped = true;
      }
      b.vy += b.gdir * P.gravity * dt;
      break;
    }
    case 'diamond': {
      if (buffered) {
        b.vy = P.jump * up;
        b.grounded = false;
        b.pressUsed = b.t;
        ev.hopped = true;
        ev.jumped = true;
        b.slam = false;
      }
      b.vy += b.gdir * P.gravity * dt;
      break;
    }
    case 'triangle': {
      // Holding again ends a dive.
      if (pressEdge) b.slam = false;
      b.vy += (held ? up : -up) * P.thrust * dt;
      break;
    }
  }
  // Slam (swipe down): dive toward the ground side, faster than a normal fall.
  if (b.slam) {
    if (b.grounded) b.slam = false;
    else if (b.mode === 'triangle') b.vy = -up * P.maxFall * SLAM_BOOST;
    else b.vy = b.gdir * P.maxFall * SLAM_BOOST;
  }
  const fall = b.vy * b.gdir;
  const maxFall = b.slam ? P.maxFall * SLAM_BOOST : P.maxFall;
  if (fall > maxFall) b.vy = maxFall * b.gdir;
  else if (-fall > P.maxRise && !(b.slam && b.mode === 'triangle')) b.vy = -P.maxRise * b.gdir;

  // ------------------------------------------------------------ move X
  const prevX = b.x;
  b.x += o.speed * dt;
  let grounded = false;
  for (const obj of near) {
    if (obj.kind !== 'solid' || !overlapsSolid(b, obj)) continue;
    const g = b.gdir;
    const feet = upY(b.y, g) - H;
    const head = upY(b.y, g) + H;
    const top = topUp(obj, g);
    const bottom = bottomUp(obj, g);
    const feetPen = top - feet;
    const headPen = head - bottom;
    if (feetPen > 0 && feetPen <= STEP_UP) {
      // Small ledge: step up onto it.
      b.y = fromUp(top + H, g);
      if (b.vy * up < 0) b.vy = 0;
      grounded = true;
      continue;
    }
    if (headPen > 0 && headPen <= 0.2 && obj.role !== 'ground') {
      // Grazed the underside corner: nudge away instead of crashing.
      b.y = fromUp(bottom - H, g);
      if (b.vy * up > 0) b.vy = 0;
      ev.bonk = true;
      continue;
    }
    if (obj.role === 'ground' || obj.role === 'ceil') {
      // Ran into the wall of a pit: fell in.
      ev.fell = true;
    } else if (!o.ghost) {
      ev.hit = true;
    }
  }

  // ------------------------------------------------------------ move Y
  const prevUp = upY(b.y, b.gdir);
  b.y += b.vy * dt;
  for (const obj of near) {
    if (obj.kind !== 'solid' || !overlapsSolid(b, obj)) continue;
    const g = b.gdir;
    const cur = upY(b.y, g);
    const top = topUp(obj, g);
    const bottom = bottomUp(obj, g);
    const movingDown = b.vy * up <= 0;
    if (movingDown && prevUp - H >= top - 0.02) {
      b.y = fromUp(top + H, g);
      b.vy = 0;
      grounded = true;
    } else if (!movingDown && prevUp + H <= bottom + 0.02) {
      if (o.ghost && (obj.role === 'block' || obj.role === 'platform')) continue;
      b.y = fromUp(bottom - H, g);
      b.vy = 0;
      ev.bonk = true;
    } else if (cur - H < top && cur - H > top - STEP_UP && movingDown) {
      b.y = fromUp(top + H, g);
      b.vy = 0;
      grounded = true;
    }
  }
  b.grounded = grounded;
  if (grounded) {
    b.lastGround = b.t;
    if (!wasGrounded) ev.landed = true;
  }

  // ------------------------------------------------------------ pads, hazards, portals
  const hh = HAZARD_HALF + (o.inflate ?? 0);
  for (const obj of near) {
    switch (obj.kind) {
      case 'pad': {
        if ((b.mode === 'square' || b.mode === 'hexagon') && obj.id !== b.usedPad && obj.dir === -b.gdir) {
          if (Math.abs(obj.x - b.x) < 0.75 && Math.abs(b.y - (obj.y + obj.dir * H)) < 0.45) {
            if (b.mode === 'hexagon') {
              // Roller pads flip gravity and fling you to the other surface.
              b.gdir = b.gdir < 0 ? 1 : -1;
              b.vy = b.gdir * 9;
            } else {
              b.vy = PHYS.square.pad * -b.gdir;
            }
            b.grounded = false;
            b.lastGround = -1e9;
            b.usedPad = obj.id;
            ev.pad = true;
          }
        }
        break;
      }
      case 'spike': {
        if (o.ghost) break;
        const hw = 0.18 * obj.size + hh;
        const hy0 = obj.dir > 0 ? obj.y : obj.y - 0.55 * obj.size;
        const hy1 = obj.dir > 0 ? obj.y + 0.55 * obj.size : obj.y;
        if (Math.abs(b.x - obj.x) < hw && b.y + hh > hy0 && b.y - hh < hy1) ev.hit = true;
        break;
      }
      case 'saw': {
        if (o.ghost) break;
        const r = obj.r * 0.78 + hh;
        const dx = b.x - sawX(obj, b.x);
        const dy = b.y - sawY(obj, b.x);
        if (dx * dx + dy * dy < r * r) ev.hit = true;
        break;
      }
      case 'portal': {
        if (prevX < obj.x && b.x >= obj.x && b.mode !== obj.mode) {
          b.mode = obj.mode;
          b.gdir = -1;
          b.grounded = false;
          if (obj.mode === 'triangle') b.vy = Math.max(-5, Math.min(5, b.vy));
          else if (obj.mode === 'diamond') b.vy = Math.max(-6, Math.min(8, b.vy));
          ev.portal = obj.mode;
        }
        break;
      }
      default:
        break;
    }
  }

  if (b.y < -3 || b.y > CEIL + 4) ev.fell = true;

  // ------------------------------------------------------------ visual rotation
  switch (b.mode) {
    case 'square':
      if (b.grounded) {
        const snap = Math.round(b.rot / (Math.PI / 2)) * (Math.PI / 2);
        b.rot += (snap - b.rot) * Math.min(1, dt * 22);
      } else {
        b.rot -= dt * 7.4 * (b.gdir < 0 ? 1 : -1);
      }
      break;
    case 'hexagon':
      b.rot -= ((o.speed * dt) / 0.5) * (b.gdir < 0 ? 1 : -1);
      break;
    case 'triangle':
      b.rot = Math.atan2(b.vy, Math.max(4, o.speed)) * 0.9;
      break;
    case 'diamond':
      b.rot = Math.max(-0.5, Math.min(0.5, b.vy * 0.035));
      break;
  }
  return ev;
}
