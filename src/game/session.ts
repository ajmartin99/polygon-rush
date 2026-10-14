import { Emitter } from '../core/emitter';
import { Rng } from '../core/rng';
import { DT, MODE_INDEX, PLAYER_HALF, RACE_SPEED, endlessSpeedAt } from './constants';
import { LevelGen } from './generator';
import { buildWorld, levelSpeed, modeAt, type LevelContent } from './level';
import { newEvents, stepBody } from './physics';
import { Racer, type RacerSpec } from './racer';
import type { ShapeMode } from './shapes';
import { World, type PickupType, type WorldObj } from './world';

export type SessionKind = 'endless' | 'race' | 'duel' | 'online' | 'attract' | 'custom';
export type BoxItem = 'boost' | 'shield' | 'snow' | 'magnet';

export interface SessionOptions {
  kind: SessionKind;
  seed: number;
  racers: RacerSpec[];
  kid?: boolean;
  tutorial?: boolean;
  /** Race length (race/duel/online). */
  length?: number;
  /** Race difficulty 0..1. */
  difficulty?: number;
  /** Play a player-made level instead of a generated track (custom, online). */
  level?: LevelContent;
  /** Custom levels: start here instead of the beginning ("play from here"). */
  startX?: number;
}

export interface GameEvents extends Record<string, unknown> {
  jump: { racer: Racer; kind: 'jump' | 'hop' | 'flip' | 'orb' | 'pad' };
  land: { racer: Racer };
  hit: { racer: Racer; fell: boolean };
  shieldPop: { racer: Racer };
  gem: { racer: Racer; value: number; x: number; y: number };
  pickup: { racer: Racer; type: PickupType; x: number; y: number };
  box: { racer: Racer; item: BoxItem; x: number; y: number };
  snowed: { racer: Racer; from: Racer | null };
  portal: { racer: Racer; mode: ShapeMode };
  hint: { racer: Racer; key: string; text: string; sub: string };
  death: { racer: Racer };
  finish: { racer: Racer; time: number; place: number };
}

const START_X = 2;
const MAGNET_RADIUS = 4.2;
const SEARCH: WorldObj[] = [];

/**
 * Runs one game: endless, race (vs CPU), duel (2 local players), online
 * (local player + remote players) or attract (menu background demo).
 * Rendering-agnostic: the controller drives it with fixed steps and draws it.
 */
export class GameSession extends Emitter<GameEvents> {
  readonly opts: SessionOptions;
  readonly world = new World();
  /** Null for player-made levels (the whole world is built up front). */
  readonly gen: LevelGen | null;
  readonly racers: Racer[] = [];
  /** Seconds since GO. */
  time = 0;
  running = false;
  private finishCount = 0;
  private readonly ev = newEvents();
  private readonly rng: Rng;
  /** Track speed for race-likes and player levels; null = endless curve. */
  private readonly fixedSpeed: number | null;

  constructor(opts: SessionOptions) {
    super();
    this.opts = opts;
    this.rng = new Rng(opts.seed ^ 0x9e3779b9);
    const raceLike = opts.kind === 'race' || opts.kind === 'duel' || opts.kind === 'online';
    let startX = START_X;
    if (opts.level) {
      buildWorld(opts.level, this.world);
      this.gen = null;
      this.fixedSpeed = levelSpeed(opts.level);
      if (opts.kind === 'custom' && opts.startX !== undefined) startX = Math.max(START_X, Math.min(opts.level.length - 2, opts.startX));
    } else {
      this.gen = new LevelGen(this.world, {
        seed: opts.seed,
        kind: raceLike ? 'race' : 'endless',
        length: raceLike ? opts.length ?? 900 : undefined,
        kid: opts.kid,
        tutorial: opts.tutorial,
        difficulty: raceLike ? opts.difficulty ?? 0.35 : undefined,
        startX: START_X,
      });
      this.fixedSpeed = raceLike ? RACE_SPEED : null;
    }
    opts.racers.forEach((spec, i) => {
      const r = new Racer(spec, startX, opts.seed + i * 101);
      if (opts.kind === 'endless') {
        r.maxHearts = r.hearts = opts.kid ? 5 : 3;
      } else if (opts.kind === 'custom' && opts.level) {
        r.maxHearts = r.hearts = opts.level.hearts;
      }
      if (opts.level) {
        r.body.mode = modeAt(opts.level, startX);
        // Measure progress from the level start even when testing from the middle.
        r.startX = START_X;
        if (startX > START_X) r.invuln = 1;
      }
      this.racers.push(r);
    });
    this.gen?.ensure(START_X + 80);
  }


  get raceLike(): boolean {
    return this.opts.kind === 'race' || this.opts.kind === 'duel' || this.opts.kind === 'online';
  }

  get finishX(): number {
    return this.world.finishX;
  }

  racer(id: string): Racer | undefined {
    return this.racers.find((r) => r.id === id);
  }

  /** Base track speed at x for this mode. */
  baseSpeed(x: number): number {
    if (this.fixedSpeed !== null) return this.fixedSpeed;
    return endlessSpeedAt(x - START_X, !!this.opts.kid);
  }

  /** Current multiplier from boosts, stuns, snow and rubber-banding. */
  private speedMult(r: Racer): number {
    let m = 1;
    if (r.stun > 0) m *= 0.35;
    if (r.boost > 0) m *= 1.45;
    if (r.snow > 0) m *= 0.55;
    if (r.kind === 'bot' && this.opts.kind === 'race') {
      // Gentle rubber-banding keeps races close and exciting.
      const human = this.racers.find((h) => h.kind === 'human');
      if (human && !human.finished) {
        const gap = r.x - human.x;
        if (gap > 16) m *= 0.94;
        else if (gap < -16) m *= 1.07;
      }
    }
    return m;
  }

  /** Advance one fixed step. */
  step(): void {
    if (!this.running) return;
    this.time += DT;
    let lead = -Infinity;
    for (const r of this.racers) if (!r.dead) lead = Math.max(lead, r.x);
    if (Number.isFinite(lead)) this.gen?.ensure(lead + 70);
    for (const r of this.racers) this.stepRacer(r);
    if (this.opts.kind === 'endless' || this.opts.kind === 'attract') {
      let tail = Infinity;
      for (const r of this.racers) tail = Math.min(tail, r.x);
      this.world.prune(tail - 25);
    }
  }

  private stepRacer(r: Racer): void {
    if (r.dead || r.kind === 'remote') return;
    const dt = DT;
    const mult = this.speedMult(r);
    const speed = this.baseSpeed(r.x) * mult;
    r.speed = speed;
    let held = r.held;
    if (r.bot) {
      held = r.bot.update(r.body, this.world, (x) => this.baseSpeed(x) * mult);
    }
    const prevX = r.x;
    const ev = stepBody(r.body, held, this.world, { speed, ghost: r.ghost }, this.ev);

    if (ev.jumped) {
      r.jumps++;
      r.squash = 1.25;
      this.emit('jump', { racer: r, kind: ev.pad ? 'pad' : ev.orb ? 'orb' : ev.flipped ? 'flip' : ev.hopped ? 'hop' : 'jump' });
    } else if (ev.pad) {
      r.squash = 1.3;
      this.emit('jump', { racer: r, kind: 'pad' });
    }
    if (ev.landed) {
      r.squash = 0.78;
      this.emit('land', { racer: r });
    }
    if (ev.portal) {
      r.portals++;
      this.emit('portal', { racer: r, mode: ev.portal });
    }
    if (ev.fell) this.onFall(r);
    else if (ev.hit) this.onHit(r);

    // Timers
    if (r.invuln > 0) r.invuln = Math.max(0, r.invuln - dt);
    if (r.stun > 0) r.stun = Math.max(0, r.stun - dt);
    if (r.boost > 0) r.boost = Math.max(0, r.boost - dt);
    if (r.snow > 0) r.snow = Math.max(0, r.snow - dt);
    if (r.magnet > 0) r.magnet = Math.max(0, r.magnet - dt);
    if (r.shield && r.shieldTime > 0) {
      r.shieldTime -= dt;
      if (r.shieldTime <= 0) r.shield = false;
    }
    if (r.hitFlash > 0) r.hitFlash = Math.max(0, r.hitFlash - dt);
    if (r.body.mode !== 'square') r.modeTime += dt;
    r.squash += (1 - r.squash) * Math.min(1, dt * 12);
    r.blinkTimer -= dt;
    if (r.blinkTimer <= 0) {
      r.blink = 0.14;
      r.blinkTimer = 2.2 + Math.random() * 3;
    }
    if (r.blink > 0) r.blink = Math.max(0, r.blink - dt);
    r.bestClean = Math.max(r.bestClean, r.x - r.cleanFrom);

    this.collect(r, prevX);

    if (!r.finished && r.x >= this.finishX) {
      r.finished = true;
      r.finishTime = this.time;
      r.place = ++this.finishCount;
      r.invuln = 0;
      this.emit('finish', { racer: r, time: r.finishTime, place: r.place });
    }
  }

  private onHit(r: Racer): void {
    if (r.ghost) return;
    r.hitFlash = 0.35;
    if (r.shield) {
      r.shield = false;
      r.invuln = 1.1;
      this.emit('shieldPop', { racer: r });
      return;
    }
    this.takeDamage(r, false);
  }

  private onFall(r: Racer): void {
    // Rescue bubble: put the racer back on the next solid ground.
    const gx = this.world.nextGroundX(r.x);
    r.body.x = Number.isFinite(gx) ? Math.max(r.x, gx + PLAYER_HALF + 0.2) : r.x;
    r.body.y = PLAYER_HALF;
    r.body.vy = 0;
    r.body.gdir = -1;
    r.body.grounded = true;
    r.body.lastGround = r.body.t;
    if (r.ghost) return;
    r.hitFlash = 0.35;
    if (r.shield) {
      r.shield = false;
      r.invuln = 1.1;
      this.emit('shieldPop', { racer: r });
      return;
    }
    this.takeDamage(r, true);
  }

  private takeDamage(r: Racer, fell: boolean): void {
    r.hits++;
    r.cleanFrom = r.x;
    if (this.opts.kind === 'endless' || this.opts.kind === 'custom') {
      r.hearts -= 1;
      if (r.hearts <= 0) {
        r.hearts = 0;
        r.dead = true;
        this.emit('hit', { racer: r, fell });
        this.emit('death', { racer: r });
        return;
      }
      r.invuln = 1.7;
    } else if (this.opts.kind === 'attract') {
      r.invuln = 1.2;
    } else {
      r.stun = fell ? 0.9 : 0.7;
      r.invuln = 1.6;
    }
    this.emit('hit', { racer: r, fell });
  }

  /** Continue an endless run after a death (rewarded ad / gems). */
  revive(r: Racer): void {
    r.dead = false;
    r.hearts = Math.max(1, Math.ceil(r.maxHearts / 2));
    r.invuln = 2.6;
    r.body.vy = 0;
    if (r.body.y < 0) r.body.y = PLAYER_HALF;
    this.running = true;
  }

  private collect(r: Racer, prevX: number): void {
    const b = r.body;
    if (r.kind === 'human') {
      // Tutorial hints fire ~0.9 s before the obstacle they explain.
      this.world.each(b.x, b.x + r.speed * 0.9, (o) => {
        if (o.kind === 'hint' && !r.seenHints.has(o.id)) {
          r.seenHints.add(o.id);
          this.emit('hint', { racer: r, key: o.key, text: o.text, sub: o.sub });
        }
      });
    }
    void prevX;
    const reach = r.magnet > 0 ? MAGNET_RADIUS : 1;
    this.world.query(b.x - reach, b.x + reach, SEARCH);
    for (const o of SEARCH) {
      switch (o.kind) {
        case 'gem': {
          if (r.collected.has(o.id)) break;
          const dx = o.x - b.x;
          const dy = o.y - b.y;
          const hit = r.magnet > 0 ? dx * dx + dy * dy < MAGNET_RADIUS * MAGNET_RADIUS : Math.abs(dx) < 0.85 && Math.abs(dy) < 0.95;
          if (hit) {
            r.collected.add(o.id);
            const value = o.big ? 5 : 1;
            r.gems += value;
            this.emit('gem', { racer: r, value, x: o.x, y: o.y });
          }
          break;
        }
        case 'pickup': {
          if (r.collected.has(o.id)) break;
          if (this.raceLike && !this.opts.level) break;
          if (Math.abs(o.x - b.x) < 0.95 && Math.abs(o.y - b.y) < 1.0) {
            r.collected.add(o.id);
            if (this.raceLike) {
              // Races on player-made levels: power-ups become mystery boxes.
              const item = this.rollBox(r);
              this.applyBox(r, item);
              this.emit('box', { racer: r, item, x: o.x, y: o.y });
            } else {
              this.applyPickup(r, o.type);
              this.emit('pickup', { racer: r, type: o.type, x: o.x, y: o.y });
            }
          }
          break;
        }
        case 'box': {
          if (r.collected.has(o.id) || !this.raceLike) break;
          if (Math.abs(o.x - b.x) < 1.0 && Math.abs(o.y - b.y) < 1.05) {
            r.collected.add(o.id);
            const item = this.rollBox(r);
            this.applyBox(r, item);
            this.emit('box', { racer: r, item, x: o.x, y: o.y });
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private applyPickup(r: Racer, type: PickupType): void {
    switch (type) {
      case 'heart':
        r.hearts = Math.min(r.maxHearts + 2, r.hearts + 1);
        break;
      case 'shield':
        r.shield = true;
        r.shieldTime = 18;
        break;
      case 'magnet':
        r.magnet = 9;
        break;
    }
  }

  /** Position (1-based) among racers still in the race. */
  rankOf(r: Racer): number {
    if (r.finished) return r.place;
    let rank = 1;
    for (const o of this.racers) {
      if (o === r) continue;
      if (o.finished || o.x > r.x) rank++;
    }
    return rank;
  }

  /** Items favour whoever is behind (classic kart-racer balance). */
  private rollBox(r: Racer): BoxItem {
    const rank = this.rankOf(r);
    const n = this.racers.length;
    const behind = n > 1 ? (rank - 1) / (n - 1) : 0;
    const items: [BoxItem, number][] = [
      ['boost', 0.6 + behind * 1.6],
      ['snow', rank === 1 ? 0 : 0.4 + behind * 1.2],
      ['shield', 1.1 - behind * 0.6],
      ['magnet', 0.7],
    ];
    return this.rng.weighted(items, (i) => i[1])[0];
  }

  applyBox(r: Racer, item: BoxItem): void {
    switch (item) {
      case 'boost':
        r.boost = 2.2;
        r.stun = 0;
        break;
      case 'shield':
        r.shield = true;
        r.shieldTime = 12;
        break;
      case 'magnet':
        r.magnet = 6;
        break;
      case 'snow':
        for (const o of this.racers) {
          if (o !== r && !o.finished && o.x > r.x && o.kind !== 'remote') this.snowRacer(o, r);
        }
        break;
    }
  }

  /** Slow a racer down with a snowball (shields block it). */
  snowRacer(target: Racer, from: Racer | null): void {
    if (target.finished || target.boost > 0) return;
    if (target.shield) {
      target.shield = false;
      this.emit('shieldPop', { racer: target });
      return;
    }
    target.snow = 1.4;
    this.emit('snowed', { racer: target, from });
  }

  // ------------------------------------------------------------ online helpers
  applyRemote(id: string, x: number, y: number, rot: number, modeIndex: number, flags: number, speed: number, at: number): void {
    const r = this.racer(id);
    if (!r || r.kind !== 'remote') return;
    r.samples.push({ at, x, y, rot, mode: MODE_INDEX[modeIndex] ?? 'square', flags, speed });
    if (r.samples.length > 8) r.samples.shift();
  }

  /** Interpolate remote racers ~100 ms in the past for smooth motion. */
  updateRemotes(now: number): void {
    const renderAt = now - 0.1;
    for (const r of this.racers) {
      if (r.kind !== 'remote' || !r.samples.length) continue;
      const s = r.samples;
      let a = s[0];
      let b = s[s.length - 1];
      for (let i = 0; i < s.length - 1; i++) {
        if (s[i].at <= renderAt && s[i + 1].at >= renderAt) {
          a = s[i];
          b = s[i + 1];
          break;
        }
      }
      let x: number;
      let y: number;
      if (renderAt >= b.at) {
        // Extrapolate briefly with the last known speed.
        const ahead = Math.min(0.25, renderAt - b.at);
        x = b.x + b.speed * ahead;
        y = b.y;
      } else {
        const t = a === b ? 1 : Math.max(0, Math.min(1, (renderAt - a.at) / (b.at - a.at)));
        x = a.x + (b.x - a.x) * t;
        y = a.y + (b.y - a.y) * t;
      }
      r.body.x = x;
      r.body.y = y;
      r.body.rot = b.rot;
      r.body.mode = b.mode;
      r.body.gdir = b.flags & 64 ? 1 : -1;
      r.speed = b.speed;
      r.invuln = b.flags & 1 ? 0.1 : 0;
      r.shield = Boolean(b.flags & 4);
      r.boost = b.flags & 8 ? 0.1 : 0;
      r.snow = b.flags & 32 ? 0.1 : 0;
      if (b.flags & 16 && !r.finished) r.finished = true;
    }
  }
}
