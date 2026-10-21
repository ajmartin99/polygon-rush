import { App as CapApp } from '@capacitor/app';
import { audio, WORLD_SONGS } from '../core/audio';
import { music } from '../core/music';
import { trackOf } from '../core/tracks';
import { haptics } from '../core/haptics';
import { isNative } from '../core/platform';
import { store } from '../state/store';
import { ads } from '../services/ads';
import type { NetRoom } from '../services/net';
import { applyXp, endlessXp, leagueFor, LEAGUES, raceReward, REVIVE_GEM_COST, type LevelUp } from '../meta/economy';
import { describe, reportMission, type MissionEvent } from '../meta/missions';
import { skinById, trailById } from '../meta/catalog';
import { Renderer, type BossView, type ViewSpec } from '../render/renderer';
import { BIOMES, paletteAt, paletteInLevel, type Palette } from '../render/biomes';
import { drawEndlessHud, drawRhythmHud, drawLevelHud, drawRaceHud } from '../render/hud';
import { nav, type LevelRunResult, type PlayRequest, type Rival } from '../ui/nav';
import { ui } from '../ui/ui';
import { EndlessResultsScreen, GameHud, LevelResultsScreen, RaceResultsScreen, openPause, openRevive, type RacePlacement, type RaceResultsActions } from '../ui/screens/game-ui';
import { roomChatPanel } from '../ui/room-chat';
import { FREE_EMOTES, emoteIndex } from '../meta/emotes';
import { decodeLevel, LEVEL_START_X, levelName, levelSpeed, type LevelContent } from './level';
import type { Scene } from './scene';
import { SECRET_LEVELS } from './generator';
import { DIFFICULTY_GEM_RATE, DT, MODE_INDEX, RACE_DIFFICULTY_OFFSET, RACE_SPEED } from './constants';
import { activeEvent, SPOOKY } from '../meta/events';
import { MAX_START_LEVEL, clampStartLevel, levelStart, levelWorld } from '../meta/modes';
import { endlessBestKey } from '../state/save';
import { DAILY_REWARD, DAILY_TARGET, GEM_RUSH_SECONDS, LIGHTS_OUT_GEM_RATE, VARIANT_INFO, dailyRewardKey, dailySeed, dailyTwist, pruneDaily, variantBestKey, type EndlessVariant } from '../meta/modes';
import { isRegularTrack, TRACK_BASE, TRACKS } from '../core/tracks';
import { HAUNTED_TRACK, hauntedPayout } from '../meta/haunted';
import { InputManager } from './input';
import type { Racer, RacerSpec } from './racer';
import { RhythmScore } from './rhythm';
import { BOSSES, bossById, bossHealth, bossReward, type BossDef } from '../meta/bosses';
import { GameSession, type BoxItem, type SessionKind } from './session';
import { SHAPE_INFO, type ShapeMode } from './shapes';

const BIOME_LENGTH = 500;
const START_X = 2;
const DUEL_LENGTH = 650;
const RACE_LENGTH = 900;

type Phase = 'idle' | 'countdown' | 'running' | 'paused' | 'dying' | 'finishing' | 'results';

const BOX_TEXT: Record<BoxItem, string> = {
  boost: 'BOOST!',
  shield: 'SHIELD!',
  snow: 'SNOWBALL!',
  magnet: 'MAGNET!',
};

/** Lights Out's candle at a moment: how bright it is, how hard it's being blown (0..1) and its flicker (-1..1). */
export interface CandleState {
  light: number;
  blow: number;
  flicker: number;
}

const smooth = (t: number) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/**
 * Lights Out: the runner carries a candle. On every beat it gets blown on:
 * the flame leans and the light pulls in, then it swells back. Every change
 * is smooth and stays inside the candle's glow (the dark never flashes), so
 * it's safe for players sensitive to flashing. With Reduce motion it burns
 * steady.
 */
export function candleAt(phase: number, time: number, still = false): CandleState {
  if (still) return { light: 0.75, blow: 0, flicker: 0 };
  const p = ((phase % 1) + 1) % 1;
  // A puff just after the beat, then a slower recovery.
  const blow = p < 0.3 ? smooth(p / 0.3) : 1 - smooth((p - 0.3) / 0.7);
  const flicker = 0.5 * Math.sin(time * 13.1) + 0.3 * Math.sin(time * 7.3 + 1.7) + 0.2 * Math.sin(time * 23.7 + 0.4);
  return { light: Math.min(1, Math.max(0, 0.9 - 0.4 * blow + 0.04 * flicker)), blow, flicker };
}

/** The menu backdrop stops after this long without a touch. */
const ATTRACT_IDLE_MS = 45_000;

/**
 * Owns the canvas, the main loop and whichever game is running. Bridges the
 * pure game session with rendering, audio, haptics, UI flows and rewards.
 */
export class GameController {
  readonly renderer: Renderer;
  readonly input: InputManager;
  session: GameSession | null = null;
  private kind: SessionKind | null = null;
  private phase: Phase = 'idle';
  private hud: GameHud | null = null;
  private req: PlayRequest | null = null;
  private variant: EndlessVariant = 'classic';
  /** Boss Battles: the boss being fought (null in other modes). */
  private boss: (BossView & { def: BossDef }) | null = null;
  /** Rhythm Rush scoring (null in other modes). */
  private rhythm: RhythmScore | null = null;
  /** The press state last step (Rhythm Rush judges each new press). */
  private prevHeld = false;
  private startLevel = 1;
  private acc = 0;
  private last = 0;
  private time = 0;
  private timeScale = 1;
  private slowUntil = 0;
  private revived = false;
  private finishTimer = 0;
  private netTimer = 0;
  private room: NetRoom | null = null;
  private roomOff: (() => void)[] = [];
  private onlineResults: { id: string; time: number | null }[] | null = null;
  private frameTimes: number[] = [];
  private lowPerfStrikes = 0;
  private songBiome = -1;
  private syncTick = 0;
  private offs: (() => void)[] = [];
  private biomeOffset = 0;
  private lastBiome = -1;
  private lastMilestone = 0;
  private scene: Scene | null = null;
  /** Build rooms outlive the race played in them. */
  private keepRoom = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(canvas);
    this.input.onPress = () => audio.unlock();
    this.input.onSwipeDown = (player) => {
      const s = this.session;
      if (!s || this.phase !== 'running') return;
      const humans = s.racers.filter((r) => r.kind === 'human');
      const r = this.kind === 'duel' ? humans[player] : humans[0];
      if (r) r.slamReq = true;
    };
    window.addEventListener('resize', () => this.renderer.resize());
    // The canvas also changes size when the menu banner ad appears or goes.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.renderer.resize()).observe(canvas);
    this.applyGraphics();
    store.on('settings', () => this.applyGraphics());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.onBackground();
      else audio.resume();
    });
    if (isNative()) {
      void CapApp.addListener('pause', () => this.onBackground());
      void CapApp.addListener('resume', () => audio.resume());
    }
    ads.on('fullscreenStart', () => audio.duck(true));
    ads.on('fullscreenEnd', () => audio.duck(this.phase === 'paused'));
    for (const ev of ['pointerdown', 'keydown', 'wheel'] as const) window.addEventListener(ev, this.wake, { passive: true, capture: true });
    requestAnimationFrame(this.frame);
  }

  private applyGraphics(): void {
    const g = store.settings.graphics;
    this.renderer.maxDpr = g === 'low' ? 1 : g === 'high' ? 2.5 : this.lowPerfStrikes > 0 ? 1.25 : 1.5;
    // Live background blur behind panels is costly on phones: High graphics only.
    document.documentElement.classList.toggle('fx-blur', g === 'high');
    const low = g === 'low' || (g === 'auto' && this.lowPerfStrikes > 0);
    this.renderer.detail = low ? 0.5 : 1;
    this.renderer.fx.quality = low ? 0.5 : 1;
    this.renderer.fx.reducedMotion = store.settings.reducedMotion;
    this.renderer.resize();
  }

  private onBackground(): void {
    if (this.phase === 'running' || this.phase === 'countdown') this.pause();
    void store.flush();
    audio.suspend();
  }

  // ================================================================== entry points
  /** Menu background: a CPU plays an endless run behind the menus. */
  startAttract(): void {
    this.wake();
    this.teardown();
    const skin = store.data.skins.equipped;
    this.kind = 'attract';
    this.session = new GameSession({
      kind: 'attract',
      seed: (Math.random() * 2 ** 31) >>> 0,
      racers: [{ id: 'demo', name: 'Demo', skin, trail: store.data.trails.equipped, kind: 'bot', skill: 0.97 }],
    });
    this.session.running = true;
    this.phase = 'running';
    this.input.enabled = false;
    this.biomeOffset = Math.floor(Math.random() * BIOMES.length);
    this.wireSession();
    this.renderer.resetCameras();
    audio.intensity = 0.2;
    if (audio.ctx) music.menu();
  }

  /**
   * Dev/marketing helper: a CPU-played run in a chosen world, fast-forwarded
   * until a chosen shape is on screen (used to capture store screenshots).
   */
  showcase(opts: { kind: 'endless' | 'race'; world: number; mode?: ShapeMode; minDistance?: number; skin?: string; trail?: string }): void {
    this.teardown();
    const skin = opts.skin ?? 'classic';
    const kind = opts.kind;
    let seed = (Math.random() * 2 ** 31) >>> 0;
    if (kind === 'race') seed = seed - (seed % BIOMES.length) + opts.world;
    const racers: RacerSpec[] =
      kind === 'race'
        ? [
            { id: 'me', name: store.data.profile.name || 'You', skin, trail: opts.trail, kind: 'bot', skill: 1 },
            { id: 'c1', name: 'Zigzag Bot', skin: 'bubblegum', kind: 'bot', skill: 0.95 },
            { id: 'c2', name: 'Hexy Bot', skin: 'mint', kind: 'bot', skill: 0.95 },
            { id: 'c3', name: 'Comet Bot', skin: 'sky', kind: 'bot', skill: 0.95 },
          ]
        : [{ id: 'me', name: 'You', skin, trail: opts.trail, kind: 'bot', skill: 1 }];
    this.kind = kind;
    this.session = new GameSession({ kind, seed, length: 900, difficulty: 0.4, racers });
    this.biomeOffset = kind === 'endless' ? opts.world : 0;
    this.wireSession();
    this.renderer.resetCameras();
    const s = this.session;
    s.running = true;
    const me = s.racers[0];
    for (let i = 0; i < 120 * 400; i++) {
      s.step();
      if (me.distance >= (opts.minDistance ?? 60) && (!opts.mode || me.body.mode === opts.mode) && !me.dead) {
        // Settle a little into the section.
        for (let k = 0; k < 90; k++) s.step();
        break;
      }
    }
    me.hearts = me.maxHearts;
    me.dead = false;
    this.phase = 'running';
    this.input.enabled = false;
  }

  play(req: PlayRequest): void {
    this.wake();
    audio.unlock();
    this.teardown();
    this.req = req;
    this.revived = false;
    this.onlineResults = null;
    this.biomeOffset = 0;
    this.lastBiome = 0;
    this.lastMilestone = 0;
    const d = store.data;
    const me: RacerSpec = { id: 'me', name: d.profile.name || 'You', skin: d.skins.equipped, trail: d.trails.equipped, kind: 'human' };
    switch (req.mode) {
      case 'custom': {
        this.kind = 'custom';
        this.session = new GameSession({ kind: 'custom', seed: 1, level: req.level, startX: req.startX, racers: [me] });
        const def = req.boss ? bossById(req.boss) : undefined;
        if (def) {
          const { hp } = bossHealth(req.level);
          this.boss = { def, name: def.name, shape: def.shape, color: def.color, hp, max: hp, hit: 0, shot: 0, down: 0 };
        }
        break;
      }
      case 'endless': {
        this.kind = 'endless';
        const v = (this.variant = req.variant ?? 'classic');
        this.rhythm = v === 'rhythm' ? new RhythmScore() : null;
        this.prevHeld = false;
        // Classic runs can start from any level already reached on this difficulty.
        const level = (this.startLevel = v === 'classic' ? clampStartLevel(req.level, d.levels[endlessBestKey(d.settings)] ?? 1) : 1);
        // The Daily Run is the same course, rules and soundtrack for everyone,
        // with its own twist each day (Halloween: the haunted course).
        const daily = v === 'daily';
        const seed = daily ? dailySeed() : (Math.random() * 2 ** 31) >>> 0;
        const twist = daily ? dailyTwist(seed, false) : null;
        // Every run is built on the beat of the songs it will play.
        music.resetPlan(true, daily ? { songs: dailySoundtrack(), seed } : undefined);
        this.session = new GameSession({
          kind: 'endless',
          seed,
          startMode: twist?.startMode,
          heatFloor: twist?.heatFloor,
          sectionScale: twist?.sectionScale,
          kid: daily ? false : d.settings.kidMode,
          diff: daily ? 'medium' : d.settings.difficulty,
          tutorial: v === 'classic' && level === 1 && d.stats.runs < 2,
          secrets: v === 'classic',
          hearts: v === 'oneheart' ? 1 : undefined,
          noHearts: v === 'oneheart',
          stunOnly: v === 'gemrush',
          gemChance: v === 'gemrush' ? 0.9 : twist?.gemChance,
          startDistance: levelStart(level),
          startLevel: level - 1,
          levelSong: (l: number) => music.levelSong(l),
          racers: [me],
        });
        break;
      }
      case 'race': {
        this.kind = 'race';
        const li = LEAGUES.indexOf(leagueFor(d.trophies));
        this.session = new GameSession({
          kind: 'race',
          seed: req.seed,
          length: RACE_LENGTH,
          difficulty: Math.min(0.9, Math.max(0.1, 0.22 + li * 0.09 + RACE_DIFFICULTY_OFFSET[d.settings.difficulty])),
          racers: [me, ...req.rivals.map((r: Rival, i: number) => ({ id: `cpu${i}`, name: r.name, skin: r.skin, kind: 'bot' as const, skill: r.skill, tag: 'CPU' }))],
        });
        break;
      }
      case 'duel': {
        this.kind = 'duel';
        this.session = new GameSession({
          kind: 'duel',
          seed: req.seed,
          length: DUEL_LENGTH,
          difficulty: 0.3,
          racers: [
            { ...me, id: 'p1', tag: 'P1' },
            { id: 'p2', name: 'Player 2', skin: req.p2Skin, kind: 'human', tag: 'P2' },
          ],
        });
        break;
      }
      case 'online': {
        this.kind = 'online';
        this.room = req.room;
        this.keepRoom = Boolean(req.exit);
        const room = req.room;
        this.session = new GameSession({
          kind: 'online',
          seed: req.seed,
          length: RACE_LENGTH,
          difficulty: 0.35,
          level: req.level,
          racers: req.players.map((p) => ({
            id: p.id,
            name: p.name,
            skin: p.skin,
            kind: p.id === room.localId ? ('human' as const) : ('remote' as const),
            tag: p.host ? 'Host' : '',
          })),
        });
        this.wireRoom(room);
        break;
      }
    }
    this.wireSession();
    this.renderer.resetCameras();
    this.input.split = this.kind === 'duel';
    this.input.reset();
    this.input.enabled = true;

    const hud = new GameHud({ duel: this.kind === 'duel' });
    hud.onPause = () => this.pause();
    this.hud = hud;
    ui.show(hud);
    void ads.hideBanner();

    this.songBiome = -1;
    audio.intensity = 0.4;
    const level = this.level();
    if (this.kind === 'endless') {
      const world = levelWorld(this.startLevel);
      music.run(world, this.startLevel - 1);
      this.songBiome = this.startLevel - 1;
      // Starting from a later level: no "World 1" banner or milestones for metres already behind us.
      this.lastBiome = this.startLevel - 1;
      this.lastMilestone = levelStart(this.startLevel);
      if (this.startLevel > 1) hud.showHint(`Level ${this.startLevel}`, BIOMES[world].name, 2200, '24%');
      this.go();
      if (d.stats.runs === 0) hud.showHint('Tap or hold anywhere to play!', 'Avoid spikes, grab gems', 3200, '22%');
      else if (this.variant === 'lightsout') hud.showHint('Lights Out!', 'Your candle flickers with the beat. Feel the rhythm!', 2600, '24%');
    } else if (this.kind === 'custom' && req.mode === 'custom') {
      music.level(req.level.music, req.level.theme, !!req.haunted);
      const track = trackOf(req.level.music);
      if (track && !req.haunted && !req.boss) ui.toast(`♪ ${track.title} by ${track.artist} (${track.license})`, 'music', 3000);
      audio.intensity = 0.7;
      this.go();
      hud.showHint(levelName(req.level), req.level.authors.length ? `by ${req.level.authors.join(', ')}` : 'Tap or hold to play!', 1800, '40%');
    } else {
      if (level) music.level(level.music, level.theme);
      else music.race(this.kind === 'duel' ? 4 : undefined);
      this.phase = 'countdown';
      const delay = req.mode === 'online' ? req.delay : 0;
      setTimeout(() => {
        void hud.countdown(3, (n) => audio.play(n > 0 ? 'count' : 'go')).then(() => this.go());
      }, delay);
    }
  }

  private go(): void {
    if (!this.session) return;
    this.session.running = true;
    this.phase = 'running';
    this.last = performance.now();
    this.acc = 0;
  }

  /** Player-made level being played (custom runs and build-room races). */
  private level(): LevelContent | null {
    return this.session?.opts.level ?? null;
  }

  /** Give the canvas to a scene (the editor) or back to the menu demo (null). */
  setScene(scene: Scene | null): void {
    if (scene === this.scene) return;
    this.teardown();
    this.wake();
    this.scene = scene;
    if (!scene) this.startAttract();
  }

  private teardown(): void {
    this.scene = null;
    for (const off of this.offs.splice(0)) off();
    for (const off of this.roomOff.splice(0)) off();
    clearTimeout(this.finishTimer);
    if (this.room) {
      if (!this.keepRoom) this.room.leave();
      this.room = null;
    }
    this.keepRoom = false;
    this.boss = null;
    this.session = null;
    this.kind = null;
    this.phase = 'idle';
    this.hud = null;
    this.timeScale = 1;
    this.input.enabled = false;
    this.input.split = false;
  }

  /** Leave the game and go back to the main menu (or wherever the run came from). */
  quitToMenu(): void {
    ui.closeAllModals();
    const req = this.req;
    const exit = req && (req.mode === 'custom' || req.mode === 'online') ? req.exit : undefined;
    // Leaving a build-room race early: tell the host so nobody waits for us.
    if (this.keepRoom && this.room && this.phase !== 'results') this.room.sendQuit();
    this.teardown();
    if (exit) {
      exit();
      return;
    }
    this.startAttract();
    nav.go('menu');
  }

  // ================================================================== session events
  private wireSession(): void {
    const s = this.session!;
    const local = (r: Racer) => r.kind === 'human';
    this.offs.push(
      s.on('jump', ({ racer, kind }) => {
        this.renderer.fx.jump(racer, kind);
        if (!local(racer)) return;
        audio.play(kind === 'pad' ? 'pad' : kind === 'orb' ? 'orb' : kind === 'flip' ? 'flip' : kind === 'hop' ? 'hop' : 'jump');
      }),
      s.on('land', ({ racer }) => {
        this.renderer.fx.land(racer);
        if (local(racer)) audio.play('land');
      }),
      s.on('hit', ({ racer, fell }) => {
        // Shake/flash would hit both halves of a split screen, so skip them in duels.
        this.renderer.fx.hit(racer, local(racer) && this.kind !== 'attract' && this.kind !== 'duel');
        if (!local(racer)) return;
        audio.play(fell ? 'fall' : 'hit');
        haptics.heavy();
      }),
      s.on('shieldPop', ({ racer }) => {
        this.renderer.fx.shieldPop(racer);
        if (!local(racer)) return;
        audio.play('shieldPop');
        haptics.medium();
      }),
      s.on('gem', ({ racer, value, x, y }) => {
        if (this.boss && value > 1 && local(racer)) return this.bossHit(racer);
        if (local(racer) || this.kind === 'attract') this.renderer.fx.gem(x, y, value, local(racer));
        if (!local(racer)) return;
        audio.play(value > 1 ? 'bigGem' : 'gem');
        if (value > 1) haptics.light();
      }),
      s.on('secret', ({ racer, level, x, y }) => {
        if (!local(racer)) return;
        const d = store.data;
        if (d.secrets.found.includes(level)) {
          this.renderer.fx.text(x + 1.5, y - 1.4, 'Found it before!', '#ffe9a8', 0.7, 1.1);
          audio.play('gem');
          return;
        }
        d.secrets.found = [...d.secrets.found, level].sort((a, b) => a - b);
        store.commit();
        this.renderer.fx.text(x + 1.5, y - 1.4, 'GOLDEN SHAPE!', '#ffd23f', 1.1, 1.6);
        audio.play('levelUp');
        haptics.success();
        this.hud?.showHint(`Golden Shape found! Level ${level}`, `${d.secrets.found.length}/${SECRET_LEVELS} · see Levels and your profile`, 2200, '18%');
      }),
      s.on('pickup', ({ racer, type, x, y }) => {
        if (local(racer)) this.renderer.fx.pickup(x, y, type === 'heart' ? '+1 ♥' : type === 'shield' ? 'Shield!' : 'Magnet!', type === 'heart' ? '#ff7a95' : type === 'shield' ? '#7fe9ff' : '#ff8a8a');
        if (!local(racer)) return;
        audio.play(type === 'heart' ? 'heart' : type === 'shield' ? 'shield' : 'magnet');
        haptics.light();
        this.hud?.showHint(type === 'heart' ? '+1 Heart!' : type === 'shield' ? 'Shield!' : 'Gem Magnet!', '', 1100, '18%');
      }),
      s.on('box', ({ racer, item, x, y }) => {
        if (local(racer)) this.renderer.fx.pickup(x, y, BOX_TEXT[item], item === 'boost' ? '#ffd23f' : item === 'snow' ? '#bff4ff' : item === 'shield' ? '#7fe9ff' : '#ff8a8a');
        if (!local(racer)) return;
        audio.play(item === 'boost' ? 'boost' : item === 'snow' ? 'snow' : 'box');
        haptics.light();
        if (this.kind !== 'duel') this.hud?.showHint(BOX_TEXT[item], '', 1000, '18%');
        if (item === 'snow' && this.room) this.room.sendFx('snow', x);
      }),
      s.on('snowed', ({ racer }) => {
        if (local(racer)) {
          audio.play('snow');
          haptics.medium();
        }
      }),
      s.on('portal', ({ racer, mode }) => {
        this.renderer.fx.portal(racer, mode);
        if (!local(racer)) return;
        audio.play('portal');
        haptics.light();
        this.maybeModeHint(racer, mode);
      }),
      s.on('hint', ({ racer, key, text, sub }) => this.onHint(racer, key, text, sub)),
      s.on('death', ({ racer }) => {
        this.renderer.fx.death(racer);
        if (local(racer)) void this.onDeath(racer);
      }),
      s.on('finish', ({ racer, place }) => {
        if (racer.kind === 'human') this.renderer.fx.confetti(racer.x + 2, racer.body.y + 2);
        this.onFinish(racer, place);
      }),
    );
  }

  /** Boss Battles: a charge orb grabbed fires straight back at the boss. */
  private bossHit(r: Racer): void {
    const b = this.boss;
    if (!b || b.hp <= 0) return;
    b.hp -= 1;
    b.hit = 0.3;
    b.shot = 1;
    audio.play('boost');
    haptics.medium();
    if (b.hp > 0) return;
    // Defeated! It spins away; the run ends a moment later as a win.
    b.down = 1;
    r.invuln = 10;
    this.renderer.fx.addShake(0.6);
    this.hud?.showHint(`${b.name} defeated!`, 'You win!', 1800, '30%');
    setTimeout(() => audio.play('newBest'), 250);
    if (this.phase === 'running') {
      this.phase = 'finishing';
      this.finishTimer = window.setTimeout(() => this.endLevel(r, true), 1800);
    }
  }

  private maybeModeHint(racer: Racer, mode: ShapeMode): void {
    const key = `mode_${mode}`;
    if (this.kind === 'duel' || store.data.tutorial[key]) return;
    store.data.tutorial[key] = true;
    store.commit();
    const info = SHAPE_INFO[mode];
    this.hud?.showHint(`${info.name}! ${info.hint}`, info.sub, 2600, '26%');
    if (this.kind === 'endless' && racer.kind === 'human') this.slowMo(1.6);
  }

  private onHint(racer: Racer, key: string, text: string, sub: string): void {
    if (racer.kind !== 'human' || this.kind === 'duel') return;
    if (key.startsWith('mode_')) return; // shown when actually passing the portal
    if (!text || store.data.tutorial[key]) return;
    store.data.tutorial[key] = true;
    store.commit();
    this.hud?.showHint(text, sub, 2400, '24%');
    if (this.kind === 'endless') this.slowMo(1.2);
  }

  private slowMo(seconds: number): void {
    if (store.settings.reducedMotion) return;
    this.timeScale = 0.55;
    this.slowUntil = this.time + seconds;
  }

  // ================================================================== loop
  /** When the next frame is due (frame cap). */
  private nextFrame = 0;

  /** Last touch or key press (the menu backdrop rests when nobody is using the app). */
  private lastInput = performance.now();
  /** The frame loop stopped (idle menu); a touch starts it again. */
  private sleeping = false;

  /** Someone's using the app: keep the frame loop going. */
  private wake = (): void => {
    this.lastInput = performance.now();
    if (!this.sleeping) return;
    this.sleeping = false;
    this.last = 0;
    this.nextFrame = 0;
    requestAnimationFrame(this.frame);
  };

  private frame = (now: number): void => {
    // On the menu, after a while with no touches, the backdrop demo stops (saves battery).
    if (this.kind === 'attract' && this.scene === null && now - this.lastInput > ATTRACT_IDLE_MS) {
      this.sleeping = true;
      return;
    }
    requestAnimationFrame(this.frame);
    // 120 Hz phones ask for twice the frames this game needs: run at most 60 fps in play
    // and 30 fps for the menu backdrop and the editor (less heat, longer battery).
    // A schedule (not a minimum gap) so 90 Hz screens still average 60.
    const gap = this.scene !== null || this.kind === 'attract' ? 1000 / 30 : 1000 / 60;
    if (now < this.nextFrame - 2) return;
    this.nextFrame = Math.max(this.nextFrame + gap, now);
    const raw = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    this.trackPerf(raw);
    if (this.scene) {
      this.time += raw;
      this.scene.frame(this.renderer, raw, this.time);
      return;
    }
    const s = this.session;
    if (!s) return;
    this.time += raw;
    if (this.timeScale < 1 && this.time > this.slowUntil) this.timeScale = 1;

    if (this.phase === 'running' || this.phase === 'finishing') {
      this.acc += raw * this.timeScale;
      let steps = 0;
      while (this.acc >= DT && steps < 12) {
        this.applyInput();
        s.step();
        this.acc -= DT;
        steps++;
      }
      if (steps === 12) this.acc = 0;
    }
    if (this.kind === 'online') {
      s.updateRemotes(now / 1000);
      this.netTick(now);
    }
    if (this.kind === 'attract') {
      this.keepAttractAlive();
      // A full-screen page (Shop, Settings, Create…) hides the backdrop: don't draw it.
      if (ui.coversGame) return;
    }
    if (this.kind === 'endless' && this.variant === 'gemrush' && this.phase === 'running' && s.time >= GEM_RUSH_SECONDS) {
      s.running = false;
      audio.play('win');
      this.endEndless(s.racers[0]);
    }
    this.updateMusic();
    this.progressEvents();
    const b = this.boss;
    if (b && this.phase !== 'paused') {
      b.hit = Math.max(0, b.hit - raw);
      b.shot = Math.max(0, b.shot - raw * 4);
      if (b.down > 0) b.down = Math.max(0.001, b.down - raw * 0.7);
    }
    this.draw(raw);
  };

  private applyInput(): void {
    const s = this.session!;
    if (this.kind === 'duel') {
      s.racers[0].held = this.input.held(0);
      s.racers[1].held = this.input.held(1);
    } else {
      const held = this.input.held(0);
      for (const r of s.racers) if (r.kind === 'human') r.held = held;
      if (this.rhythm && held && !this.prevHeld && this.phase === 'running') this.onBeatPress();
      this.prevHeld = held;
    }
  }

  /** Rhythm Rush: judge a press against the beat. */
  private onBeatPress(): void {
    const err = audio.beatError();
    const me = this.session?.racers[0];
    // The Glider is held, not tapped: only taps are judged.
    if (err === null || !me || !this.rhythm || me.body.mode === 'triangle') return;
    const { judgement, points } = this.rhythm.press(err);
    const text = judgement === 'perfect' ? 'PERFECT!' : judgement === 'great' ? 'GREAT' : 'MISS';
    const color = judgement === 'perfect' ? '#ffd23f' : judgement === 'great' ? '#9fe8ff' : '#b9b3d6';
    this.renderer.fx.text(me.x + 0.6, me.body.y + 1.5, points ? `${text} +${points}` : text, color, judgement === 'perfect' ? 0.62 : 0.5, 0.7);
    if (judgement === 'perfect') haptics.light();
  }

  private draw(dt: number): void {
    const s = this.session!;
    const rects = this.renderer.layout(this.kind === 'duel' ? 2 : 1);
    let views: ViewSpec[];
    if (this.kind === 'duel') {
      views = [
        { racer: s.racers[0], rect: rects[0], label: 'P1', labelColor: '#ffd23f' },
        { racer: s.racers[1], rect: rects[1], label: 'P2', labelColor: '#ff7ac6' },
      ];
    } else {
      const focus = s.racers.find((r) => r.kind === 'human') ?? s.racers[0];
      // The menu demo runs in the open space right of the hero preview.
      views = [{ racer: focus, rect: rects[0], focus: this.kind === 'attract' ? 0.62 : undefined }];
    }
    const fxDt = this.phase === 'paused' || this.phase === 'dying' ? 0 : dt * this.timeScale;
    for (const r of s.racers) if (!r.dead) this.renderer.fx.racerTick(r, fxDt, r.kind === 'human');
    const markers: { x: number; label: string; color: string }[] = [];
    if (this.kind === 'endless') {
      const best = this.variant === 'gemrush' ? 0 : store.data.best[this.bestKey()] ?? 0;
      if (best > 30) markers.push({ x: START_X + best, label: 'BEST', color: '#ffd23f' });
    } else if (this.kind === 'custom' && this.req?.mode === 'custom') {
      const best = this.req.level.best;
      if (best > 0.05 && best < 1) markers.push({ x: START_X + best * (s.finishX - START_X), label: 'BEST', color: '#ffd23f' });
    }
    this.renderer.render(s, views, fxDt, this.time, {
      palette: (x) => this.paletteFor(x),
      beat: audio.beatPhase(),
      dim: this.kind === 'attract',
      markers,
      haunted: this.paletteFor(this.session?.racers[0]?.x ?? 0) === SPOOKY,
      secretsFound: store.data.secrets.found,
      boss: this.kind === 'custom' && this.phase !== 'results' ? this.boss : null,
      lightsOut: this.kind === 'endless' && this.variant === 'lightsout' ? candleAt(audio.beatPhase(), performance.now() / 1000, store.settings.reducedMotion) : undefined,
    });
    if (this.kind === 'attract' || this.phase === 'results') return;
    const ctx = this.renderer.ctx;
    for (const v of views) {
      if (this.kind === 'endless') {
        drawEndlessHud(ctx, v.rect, v.racer, store.data.best[this.bestKey()] ?? 0, this.renderer.dpr, this.variant === 'gemrush' ? { timer: Math.max(0, GEM_RUSH_SECONDS - s.time) } : this.variant === 'classic' ? undefined : { label: VARIANT_INFO[this.variant].name });
        if (this.rhythm) drawRhythmHud(ctx, v.rect, this.rhythm.score, this.rhythm.combo, this.rhythm.mult, audio.beatPhase(), this.renderer.dpr);
      } else if (this.kind === 'custom' && this.req?.mode === 'custom') {
        drawLevelHud(ctx, v.rect, s, v.racer, this.renderer.dpr, this.boss ? '' : levelName(this.req.level), this.req.level.best);
      } else {
        drawRaceHud(ctx, v.rect, s, v.racer, this.renderer.dpr, v.label, v.labelColor);
      }
    }
  }

  private paletteFor(x: number): Palette {
    const s = this.session;
    // Spooky Season: the menu backdrop and the Haunted Run are haunted.
    if (this.kind === 'attract' && activeEvent()?.id === 'halloween') return SPOOKY;
    if (this.kind === 'custom' && this.req?.mode === 'custom' && this.req.haunted) return SPOOKY;
    const level = this.level();
    if (level) return BIOMES[level.theme % BIOMES.length];
    if (s && s.raceLike) return BIOMES[(s.opts.seed >>> 0) % BIOMES.length];
    const levels = s?.levels;
    if (levels) {
      const span = levels.at(Math.max(0, x - START_X));
      return paletteInLevel(span.index, x - START_X - span.start, span.end - span.start).palette;
    }
    return paletteAt(Math.max(0, x - START_X), this.biomeOffset).palette;
  }

  /** World banners and distance milestones for the local endless runner. */
  private progressEvents(): void {
    if (this.kind !== 'endless' || this.phase !== 'running') return;
    const s = this.session!;
    const me = s.racers[0];
    const span = s.levels?.at(me.distance);
    const level = span ? span.index : Math.floor(me.distance / BIOME_LENGTH);
    if (level !== this.lastBiome) {
      this.lastBiome = level;
      const pal = BIOMES[level % BIOMES.length];
      this.hud?.showHint(`Level ${level + 1}`, pal.name, 2200, '20%');
      audio.play('portal');
      // A milestone right as a level starts would cover its banner.
      this.lastMilestone = Math.max(this.lastMilestone, Math.floor(me.distance / 250) * 250 + 250);
    }
    const milestone = Math.floor(me.distance / 250) * 250;
    if (milestone > this.lastMilestone) {
      this.lastMilestone = milestone;
      this.renderer.fx.text(me.x + 3, me.body.y + 2.2, `${milestone} m!`, '#ffd23f', 0.9, 1.4);
      audio.play('box');
    } else if (milestone > this.lastMilestone) {
      this.lastMilestone = milestone;
    }
  }

  private trackPerf(dt: number): void {
    if (store.settings.graphics !== 'auto' || this.phase !== 'running') return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 180) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 0.024 && this.lowPerfStrikes < 1) {
      this.lowPerfStrikes++;
      this.applyGraphics();
    }
  }

  private updateMusic(): void {
    const s = this.session!;
    const me = s.racers.find((r) => r.kind === 'human') ?? s.racers[0];
    if (this.kind === 'endless') {
      // A level lasts exactly its song: the next level starts the next song.
      const span = s.levels?.at(me.distance);
      const level = span ? span.index : Math.floor(me.distance / BIOME_LENGTH);
      if (level !== this.songBiome && this.phase === 'running') {
        this.songBiome = level;
        music.world(level % WORLD_SONGS, level);
      }
      // Keep the song at the time the runner's position calls for (the course is built on its beat).
      const sync = music.syncSong;
      if (sync && span && sync.level === span.index && this.phase === 'running' && ++this.syncTick % 15 === 0) audio.syncTo(sync.id, s.levels!.secondsInto(me.distance), 0.08, 1500);
      audio.intensity = Math.min(1, 0.35 + me.distance / 3000);
    } else if (this.kind === 'custom') {
      audio.intensity = Math.min(1, 0.55 + me.distance / 600);
      // Haunted Run: the course is charted to Swing Along, so keep the song exactly where the runner is.
      const req = this.req;
      if (req?.mode === 'custom' && (req.haunted || req.boss) && this.phase === 'running' && ++this.syncTick % 10 === 0) {
        audio.syncTo(req.haunted ? HAUNTED_TRACK : req.level.music, Math.max(0, (me.x - (LEVEL_START_X + 0.5)) / levelSpeed(req.level)), 0.06, 900);
      }
    } else if (this.kind !== 'attract') {
      audio.intensity = 0.8;
    }
  }

  private keepAttractAlive(): void {
    const s = this.session!;
    const r = s.racers[0];
    // Restart the demo occasionally so the menu always looks fresh.
    if (r.distance > 1600 || r.dead) this.startAttract();
  }

  // ================================================================== pause
  pause(): void {
    if (!this.session || !(this.phase === 'running' || this.phase === 'countdown')) return;
    if (ui.hasModal) return;
    const online = this.kind === 'online';
    const prevPhase = this.phase;
    if (!online) {
      this.session.running = false;
      this.phase = 'paused';
    }
    audio.duck(true);
    this.input.reset();
    openPause({
      title: online ? 'Menu' : 'Paused',
      onResume: () => {
        audio.duck(false);
        if (!this.session || this.phase !== 'paused') return;
        if (prevPhase === 'countdown') {
          this.phase = 'countdown';
          return;
        }
        // Brief grace period so resuming never causes an instant bump.
        for (const r of this.session.racers) if (r.kind === 'human') r.invuln = Math.max(r.invuln, 0.8);
        this.go();
      },
      onRestart: online || this.kind === 'race' ? undefined : () => {
        const r = this.req;
        if (r?.mode === 'custom' && r.onRetry) r.onRetry();
        else if (r) this.play(r);
      },
      onQuit: () => this.quitToMenu(),
      quitLabel: this.req?.mode === 'custom' ? (this.req.test ? 'Edit' : 'Back') : this.keepRoom ? 'Leave race' : undefined,
    });
  }

  // ================================================================== endless death / results
  private bestKey(): string {
    return variantBestKey(this.variant, store.settings);
  }

  private async onDeath(r: Racer): Promise<void> {
    const s = this.session!;
    s.running = false;
    this.phase = 'dying';
    haptics.heavy();
    await new Promise((res) => setTimeout(res, 650));
    if (!this.session || this.session !== s) return;
    if (this.kind === 'custom') {
      this.endLevel(r, false);
      return;
    }
    if (this.variant === 'classic' && !this.revived && r.distance > 60) {
      audio.duck(true);
      const choice = await openRevive(6);
      audio.duck(false);
      if (this.session !== s) return;
      let ok = false;
      if (choice === 'ad') ok = await ads.showRewarded('revive');
      else if (choice === 'gems') ok = store.spendGems(REVIVE_GEM_COST);
      if (ok && this.session === s) {
        this.revived = true;
        s.revive(r);
        this.hud?.showHint('Keep rushing!', '', 1200);
        this.go();
        return;
      }
    }
    this.endEndless(r);
  }

  private endEndless(r: Racer): void {
    const d = store.data;
    if (this.phase === 'results') return;
    this.phase = 'results';
    this.input.enabled = false;
    const v = this.variant;
    const distance = Math.floor(r.distance);
    // Gem Rush scores gems; every other variant scores metres.
    const score = v === 'gemrush' ? r.gems : v === 'rhythm' ? (this.rhythm?.score ?? 0) : distance;
    const key = this.bestKey();
    if (v === 'daily') pruneDaily(d.best);
    const prevBest = d.best[key] ?? 0;
    const newBest = score > prevBest;
    if (newBest) d.best[key] = score;
    // Levels you can start from next time: every level this run reached.
    const levels = this.session?.levels;
    if (v === 'classic' && levels) d.levels[key] = Math.min(MAX_START_LEVEL, Math.max(d.levels[key] ?? 1, levels.at(r.distance).index + 1));
    d.stats.runs += 1;
    d.stats.totalDistance += distance;
    if (v === 'classic' || v === 'oneheart') d.stats.bestDistance = Math.max(d.stats.bestDistance, distance);
    if (v === 'daily') {
      d.stats.dailyRuns += 1;
    }
    const bonus: string[] = [];
    if (v === 'daily' && distance >= DAILY_TARGET && !d.best[dailyRewardKey()]) {
      d.stats.dailyTargets += 1;
      d.best[dailyRewardKey()] = 1;
      store.addGems(DAILY_REWARD);
      bonus.push(`Daily Run: reached ${DAILY_TARGET} m! +${DAILY_REWARD} gems`);
    }
    const xp = endlessXp(distance);
    const missions = this.reportRun(r, [
      ['run_distance', distance],
      ['distance', distance],
      ['gems_run', r.gems],
      ['clean_distance', Math.floor(r.bestClean)],
    ]);
    missions.unshift(...bonus);
    const rh = this.rhythm;
    if (rh) missions.unshift(`Best combo ${rh.bestCombo} · ${rh.perfects} Perfect · ${rh.greats} Great · ${rh.misses} Miss`);
    const ups = this.grantXp(xp);
    // Gem Rush is all gems, so it pays out half of them (keeps the shop fair).
    // Extreme pays 1.3x, Easy a little less (the Daily Run is the same for everyone).
    const diff = v === 'daily' ? 'medium' : d.settings.difficulty;
    const rate = d.settings.kidMode ? 1 : DIFFICULTY_GEM_RATE[diff];
    const base = v === 'gemrush' ? Math.ceil(r.gems / 2) : r.gems;
    const dark = v === 'lightsout' ? LIGHTS_OUT_GEM_RATE : 1;
    const payout = Math.round(base * rate * dark);
    if (dark !== 1 && base > 0) missions.push(`Lights Out bonus: ${base} → ${payout} gems`);
    else if (rate !== 1 && base > 0) missions.push(rate > 1 ? `Extreme bonus: ${base} → ${payout} gems` : `Easy pays ${Math.round(rate * 100)}% gems`);
    store.addGems(payout);
    store.commit();
    void store.flush();
    audio.play(newBest ? 'newBest' : 'lose');
    void ads.afterRun().then(() => {
      const screen = new EndlessResultsScreen(
        {
          distance: score,
          best: Math.max(prevBest, score),
          newBest,
          gems: payout,
          jumps: r.jumps,
          portals: r.portals,
          xp,
          levelUps: ups,
          missionsDone: missions,
          kidMode: v === 'classic' && d.settings.kidMode,
          label: v === 'classic' ? undefined : VARIANT_INFO[v].name,
          unit: v === 'gemrush' ? 'gems' : v === 'rhythm' ? 'pts' : 'm',
        },
        {
          onAgain: () => this.play({ mode: 'endless', variant: v, level: this.startLevel }),
          onHome: () => this.quitToMenu(),
          onDouble: async () => {
            const ok = await ads.showRewarded('double_run');
            if (ok) store.addGems(payout);
            return ok;
          },
        },
      );
      ui.show(screen);
    });
  }

  /** A player-made level ended: report back, update missions and show the results. */
  private endLevel(r: Racer, completed: boolean): void {
    const s = this.session;
    const req = this.req;
    if (!s || !req || req.mode !== 'custom' || this.phase === 'results') return;
    clearTimeout(this.finishTimer);
    this.phase = 'results';
    s.running = false;
    this.input.enabled = false;
    const level = req.level;
    const total = Math.max(1, s.finishX - r.startX);
    const progress = completed ? 1 : Math.max(0, Math.min(0.99, (r.x - r.startX) / total));
    const fromStart = req.startX === undefined;
    const prevBest = level.best;
    const result: LevelRunResult = { completed, progress, fromStart, gems: r.gems, hits: r.hits, time: s.time };
    const verifiedNow = Boolean(req.test && completed && fromStart && !level.verified);
    req.onResult?.(result);
    const missions: string[] = [];
    const d = store.data;
    const report = (e: MissionEvent) => {
      for (const m of reportMission(d, e, 1)) missions.push(describe(m));
    };
    if (completed && fromStart && !req.haunted && !req.boss) {
      if (req.test && verifiedNow) report('level_verify');
      else if (!req.test && level.origin !== 'mine' && level.length >= 60) report('custom_clear');
    }
    if (req.haunted) {
      const diff = req.haunted;
      const h = d.haunted;
      const pay = hauntedPayout(diff, r.gems, completed);
      if (pay > 0) store.addGems(pay);
      h.best[diff] = Math.max(h.best[diff], progress);
      if (completed) {
        h.clears[diff] += 1;
        missions.push(`Haunted Run cleared on ${diff === 'hard' ? 'Hard' : 'Easy'}! +${pay} gems`);
      } else if (pay > 0) missions.push(`Haunted Run: +${pay} gems${diff === 'easy' ? ' (Easy pays half)' : ''}`);
      d.stats.gemsCollected += r.gems;
    }
    const boss = this.boss;
    if (req.boss && boss) {
      const def = boss.def;
      const rec = d.bosses[def.id] ?? { wins: 0, best: 0 };
      rec.best = Math.max(rec.best, 1 - boss.hp / boss.max);
      if (completed) {
        const pay = bossReward(d.bosses, def);
        rec.wins += 1;
        store.addGems(pay);
        missions.push(`${def.name} defeated! +${pay} gems`);
        const next = BOSSES[BOSSES.indexOf(def) + 1];
        if (next && rec.wins === 1) missions.push(`${next.name} is ready for you!`);
      } else missions.push(`${def.name} had ${boss.hp} of ${boss.max} health left. Grab the glowing orbs to hit it!`);
      d.bosses[def.id] = rec;
    }
    if (missions.length) {
      ui.sfx('reward');
      haptics.success();
    }
    store.commit();
    audio.play(completed ? 'win' : 'lose');
    const screen = new LevelResultsScreen(
      {
        title: levelName(level),
        completed,
        progress,
        best: Math.max(prevBest, progress),
        newBest: fromStart && progress > prevBest,
        gems: r.gems,
        time: s.time,
        hits: r.hits,
        verifiedNow,
        missionsDone: missions,
        win: req.boss && this.boss ? { big: 'VICTORY!', sub: `You beat ${this.boss.name}!` } : undefined,
        notesTitle: req.boss ? (completed ? 'Boss defeated!' : r.dead ? 'Knocked out!' : 'It got away!') : req.haunted ? 'Haunted Run' : undefined,
        rate: req.rate,
      },
      {
        onRetry: req.onRetry ?? (() => this.play(req)),
        onBack: () => this.quitToMenu(),
        backLabel: req.test ? 'Edit' : 'Back',
        backIcon: req.test ? 'edit' : 'back',
      },
    );
    ui.show(screen);
  }

  /** Update shared stats and missions for any run; returns completed mission texts. */
  private reportRun(r: Racer, extra: [MissionEvent, number][]): string[] {
    const d = store.data;
    d.stats.jumps += r.jumps;
    d.stats.gemsCollected += r.gems;
    d.stats.portals += r.portals;
    d.stats.hits += r.hits;
    const done: string[] = [];
    const report = (e: MissionEvent, v: number) => {
      if (v > 0) for (const m of reportMission(d, e, v)) done.push(describe(m));
    };
    report('jumps', r.jumps);
    report('gems', r.gems);
    report('portals', r.portals);
    report('mode_time', Math.floor(r.modeTime));
    for (const [e, v] of extra) report(e, v);
    if (done.length) {
      ui.sfx('reward');
      haptics.success();
    }
    return done;
  }

  private grantXp(xp: number): LevelUp[] {
    const d = store.data;
    const res = applyXp(d.level, d.xp, xp);
    d.level = res.level;
    d.xp = res.xp;
    for (const up of res.ups) {
      d.gems += up.gems;
      for (const sk of up.unlockedSkins) if (!d.skins.owned.includes(sk)) d.skins.owned.push(sk);
      for (const t of up.unlockedTrails) if (!d.trails.owned.includes(t)) d.trails.owned.push(t);
      const unlocks = [...up.unlockedSkins.map((x) => skinById(x).name), ...up.unlockedTrails.map((x) => trailById(x).name)];
      setTimeout(() => {
        audio.play('levelUp');
        ui.toast(`Level ${up.level}! +${up.gems} gems${unlocks.length ? ` · Unlocked ${unlocks.join(', ')}` : ''}`, 'star', 3200);
      }, 900);
    }
    if (res.ups.length) store.emit('level', { level: d.level });
    return res.ups;
  }

  // ================================================================== race / duel / online finish
  private onFinish(r: Racer, place: number): void {
    const s = this.session!;
    if (r.kind === 'human') {
      audio.play(place === 1 ? 'win' : 'finish');
      haptics.success();
      if (this.kind === 'online') this.room?.sendFinish(r.finishTime);
      if (this.kind !== 'duel' && !this.boss) this.hud?.showHint(place === 1 ? 'You win!' : 'Finished!', '', 1600, '30%');
    }
    if (this.kind === 'custom') {
      if (r.kind === 'human' && this.phase === 'running') {
        this.phase = 'finishing';
        // A boss still standing when the song ends gets away.
        const escaped = !!this.boss && this.boss.hp > 0;
        if (escaped) this.hud?.showHint(`${this.boss!.name} got away!`, '', 1600, '30%');
        this.finishTimer = window.setTimeout(() => this.endLevel(r, !escaped), 1400);
      }
      return;
    }
    const humans = s.racers.filter((x) => x.kind === 'human');
    if (this.kind === 'online') {
      if (r.kind === 'human') {
        this.phase = 'finishing';
        // Host results normally arrive; fall back if the room went quiet.
        this.finishTimer = window.setTimeout(() => this.showRaceResults(), 30000);
      }
      return;
    }
    if (humans.every((h) => h.finished) && this.phase === 'running') {
      this.phase = 'finishing';
      const waitFor = this.kind === 'duel' ? 0 : 5000;
      const check = () => {
        if (s.racers.every((x) => x.finished) || performance.now() - start > waitFor) this.showRaceResults();
        else this.finishTimer = window.setTimeout(check, 200);
      };
      const start = performance.now();
      this.finishTimer = window.setTimeout(check, this.kind === 'duel' ? 900 : 1200);
    } else if (this.kind === 'duel' && humans.some((h) => h.finished)) {
      // First duel player across the line: give the other a few seconds.
      clearTimeout(this.finishTimer);
      this.finishTimer = window.setTimeout(() => this.showRaceResults(), 4000);
    }
  }

  private placements(): RacePlacement[] {
    const s = this.session!;
    const order = this.onlineResults;
    const est = (r: Racer) => (r.finished ? r.finishTime : s.time + Math.max(0, s.finishX - r.x) / RACE_SPEED);
    let list: Racer[];
    if (order) {
      list = order.map((o) => s.racer(o.id)).filter((x): x is Racer => Boolean(x));
      for (const r of s.racers) if (!list.includes(r)) list.push(r);
    } else {
      list = [...s.racers].sort((a, b) => (a.finished === b.finished ? est(a) - est(b) : a.finished ? -1 : 1));
    }
    return list.map((r) => {
      const t = order ? order.find((o) => o.id === r.id)?.time ?? null : r.finished || this.kind === 'race' ? est(r) : null;
      return { id: r.id, name: r.name, skin: r.skin, time: t, me: r.kind === 'human' && this.kind !== 'duel', tag: r.tag };
    });
  }

  private showRaceResults(): void {
    if (this.phase === 'results' || !this.session) return;
    clearTimeout(this.finishTimer);
    this.phase = 'results';
    this.input.enabled = false;
    const s = this.session;
    const d = store.data;
    const list = this.placements();
    const me = s.racers.find((r) => r.kind === 'human')!;
    const myPlace = list.findIndex((p) => p.id === me.id) + 1;
    let reward: { gems: number; trophies: number; xp: number } | null = null;

    if (this.kind === 'race') {
      const rr = raceReward(myPlace);
      reward = { gems: rr.gems + me.gems, trophies: rr.trophies, xp: rr.xp };
      d.trophies += rr.trophies;
      d.stats.racesPlayed += 1;
      if (myPlace === 1) d.stats.racesWon += 1;
      this.reportRun(me, [
        ['race_play', 1],
        ['race_win', myPlace === 1 ? 1 : 0],
        ['distance', Math.floor(me.distance)],
      ]);
    } else if (this.kind === 'online') {
      const rr = raceReward(myPlace);
      reward = { gems: Math.round(rr.gems / 2) + me.gems, trophies: 0, xp: 40 };
      d.stats.onlinePlayed += 1;
      if (myPlace === 1) d.stats.onlineWon += 1;
      this.reportRun(me, [
        ['online_play', 1],
        ['distance', Math.floor(me.distance)],
      ]);
    } else if (this.kind === 'duel') {
      // Duels are just for fun: two players on one phone could farm them, so
      // gems, XP and run missions stay out (only "play a Duel" counts).
      d.stats.duelsPlayed += 1;
      for (const m of reportMission(d, 'duel_play', 1)) {
        ui.toast(`Mission complete: ${describe(m)}`, 'check');
        ui.sfx('reward');
      }
    }
    if (reward) {
      store.addGems(reward.gems);
      this.grantXp(reward.xp);
    }
    store.commit();
    void store.flush();
    if (this.kind !== 'duel') audio.play(myPlace === 1 ? 'win' : 'finish');

    const raceRoom = this.kind === 'online' && this.room?.kind === 'race' ? this.room : null;
    const title = this.kind === 'duel' ? (list[0].id === 'p1' ? 'Player 1 wins!' : 'Player 2 wins!') : this.kind === 'online' ? (raceRoom ? (raceRoom.publicRoom ? 'Online Race' : 'Friends Race') : 'Build Room Race') : 'Race Results';
    const req = this.req;
    void ads.afterRun().then(() => {
      if (this.phase !== 'results' || this.session !== s) return;
      const room = this.room;
      let screen: RaceResultsScreen;
      const chat = raceRoom ? roomChatPanel(raceRoom) : null;
      const actions: RaceResultsActions = { onHome: () => this.quitToMenu() };
      if (raceRoom) {
        // Race rooms stay open: back to the lobby for a rematch, or leave.
        actions.onAgain = () => this.quitToMenu();
        actions.againLabel = 'Back to lobby';
        actions.onHome = () => this.leaveRoom();
        actions.homeLabel = 'Leave';
        actions.homeIcon = 'back';
      } else if (this.keepRoom) {
        actions.homeLabel = 'Back to building';
      } else if (this.kind !== 'online') {
        actions.onAgain = () => {
          if (!req) return;
          if (req.mode === 'race') this.play({ mode: 'race', seed: (Math.random() * 2 ** 31) >>> 0, rivals: req.rivals });
          else if (req.mode === 'duel') this.play({ mode: 'duel', seed: (Math.random() * 2 ** 31) >>> 0, p2Skin: req.p2Skin });
        };
        actions.againLabel = this.kind === 'duel' ? 'Rematch!' : 'Race again';
      }
      if (room && this.kind === 'online') {
        actions.onEmote = (n) => room.sendEmote(n);
        this.roomOff.push(room.on('emote', ({ id, n }) => screen?.emote(id, n)));
      } else if (this.kind === 'race') {
        // CPU rivals answer with a friendly emote now and then.
        actions.onEmote = (n) => {
          screen.emote(me.id, n);
          const cpus = list.filter((p) => p.id !== me.id);
          if (cpus.length && Math.random() < 0.7) {
            const who = cpus[Math.floor(Math.random() * cpus.length)];
            setTimeout(() => screen.emote(who.id, emoteIndex(FREE_EMOTES[Math.floor(Math.random() * FREE_EMOTES.length)])), 500 + Math.random() * 700);
          }
        };
      }
      if (chat) actions.chat = chat.panel.el;
      screen = new RaceResultsScreen(title, list, reward, actions);
      if (chat) screen.own(chat.close);
      ui.show(screen);
    });
  }

  /** Leave an online room from the results screen and go home. */
  private leaveRoom(): void {
    ui.closeAllModals();
    this.keepRoom = false;
    this.teardown();
    this.startAttract();
    nav.go('menu');
  }

  // ================================================================== online
  private wireRoom(room: NetRoom): void {
    const s = this.session!;
    this.roomOff.push(
      room.on('snap', (states) => {
        const at = performance.now() / 1000;
        for (const st of states) {
          if (st[0] === room.localId) continue;
          s.applyRemote(st[0], st[1], st[2], st[3], st[4], st[5], st[6], at);
        }
      }),
      room.on('fx', ({ from, kind, x }) => {
        if (from === room.localId || kind !== 'snow') return;
        const me = s.racer(room.localId);
        if (me && me.x > x) s.snowRacer(me, s.racer(from) ?? null);
      }),
      room.on('finish', ({ id, time }) => {
        const r = s.racer(id);
        if (r && r.kind === 'remote' && !r.finished) {
          r.finished = true;
          r.finishTime = time;
        }
      }),
      room.on('results', (order) => {
        this.onlineResults = order;
        this.showRaceResults();
      }),
      // Host started a rematch while we were still on the podium: straight into it.
      room.on('start', ({ seed, players, delay, level }) => {
        if (room.kind !== 'race' || this.phase !== 'results') return;
        const req = this.req;
        let content: LevelContent | undefined;
        try {
          content = level ? decodeLevel(level) : undefined;
        } catch {
          content = undefined;
        }
        ui.closeAllModals();
        this.play({ mode: 'online', room, seed, players, delay, level: content, exit: req && req.mode === 'online' ? req.exit : undefined });
      }),
      room.on('closed', ({ reason }) => {
        ui.toast(reason, 'wifi', 3000);
        if (this.phase === 'running' || this.phase === 'finishing' || this.phase === 'countdown') {
          this.room = null;
          this.showRaceResults();
        }
      }),
    );
  }

  private netTick(now: number): void {
    if (!this.room || !this.session || (this.phase !== 'running' && this.phase !== 'finishing')) return;
    if (now - this.netTimer < 66) return;
    this.netTimer = now;
    const me = this.session.racer(this.room.localId);
    if (!me) return;
    const b = me.body;
    this.room.sendState([
      me.id,
      Math.round(b.x * 100) / 100,
      Math.round(b.y * 100) / 100,
      Math.round(b.rot * 100) / 100,
      MODE_INDEX.indexOf(b.mode),
      me.flags(),
      Math.round(me.speed * 10) / 10,
    ]);
  }
}

/** The Daily Run's soundtrack outside events: every regular recorded run track (not the player's own picks, so the beat is the same for everyone). */
function dailySoundtrack(): number[] {
  return TRACKS.map((t, i) => ({ t, id: TRACK_BASE + i }))
    .filter(({ t }) => t.role === 'run' && !t.event && isRegularTrack(t))
    .map(({ id }) => id);
}
