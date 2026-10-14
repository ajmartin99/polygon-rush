import { App as CapApp } from '@capacitor/app';
import { audio, MENU_SONG, RACE_SONG, WORLD_SONGS } from '../core/audio';
import { haptics } from '../core/haptics';
import { isNative } from '../core/platform';
import { store } from '../state/store';
import { ads } from '../services/ads';
import type { NetRoom } from '../services/net';
import { applyXp, endlessXp, leagueFor, LEAGUES, raceReward, REVIVE_GEM_COST, type LevelUp } from '../meta/economy';
import { describe, reportMission, type MissionEvent } from '../meta/missions';
import { skinById, trailById } from '../meta/catalog';
import { Renderer, type ViewSpec } from '../render/renderer';
import { drawEndlessHud, drawRaceHud } from '../render/hud';
import { nav, type PlayRequest, type Rival } from '../ui/nav';
import { ui } from '../ui/ui';
import { EndlessResultsScreen, GameHud, RaceResultsScreen, openPause, openRevive, type RacePlacement } from '../ui/screens/game-ui';
import { DT, MODE_INDEX, RACE_SPEED } from './constants';
import { InputManager } from './input';
import type { Racer, RacerSpec } from './racer';
import { GameSession, type BoxItem, type SessionKind } from './session';
import { SHAPE_INFO, type ShapeMode } from './shapes';

const BIOME_LENGTH = 500;
const DUEL_LENGTH = 650;
const RACE_LENGTH = 900;

type Phase = 'idle' | 'countdown' | 'running' | 'paused' | 'dying' | 'finishing' | 'results';

const BOX_TEXT: Record<BoxItem, string> = {
  boost: 'BOOST!',
  shield: 'SHIELD!',
  snow: 'SNOWBALL!',
  magnet: 'MAGNET!',
};

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
  private offs: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(canvas);
    this.input.onPress = () => audio.unlock();
    window.addEventListener('resize', () => this.renderer.resize());
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
    requestAnimationFrame(this.frame);
  }

  private applyGraphics(): void {
    const g = store.settings.graphics;
    this.renderer.maxDpr = g === 'low' ? 1 : g === 'high' ? 2.5 : this.lowPerfStrikes > 0 ? 1.25 : 2;
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
    this.renderer.resetCameras();
    audio.intensity = 0.2;
    if (audio.ctx) audio.playSong(MENU_SONG);
  }

  play(req: PlayRequest): void {
    audio.unlock();
    this.teardown();
    this.req = req;
    this.revived = false;
    this.onlineResults = null;
    const d = store.data;
    const me: RacerSpec = { id: 'me', name: d.profile.name || 'You', skin: d.skins.equipped, trail: d.trails.equipped, kind: 'human' };
    switch (req.mode) {
      case 'endless': {
        this.kind = 'endless';
        this.session = new GameSession({
          kind: 'endless',
          seed: (Math.random() * 2 ** 31) >>> 0,
          kid: d.settings.kidMode,
          tutorial: d.stats.runs < 2,
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
          difficulty: 0.22 + li * 0.09,
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
        const room = req.room;
        this.session = new GameSession({
          kind: 'online',
          seed: req.seed,
          length: RACE_LENGTH,
          difficulty: 0.35,
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
    if (this.kind === 'endless') {
      audio.playSong(0);
      this.songBiome = 0;
      this.go();
      if (d.stats.runs === 0) hud.showHint('Tap or hold anywhere to play!', 'Avoid spikes, grab gems', 3200, '22%');
    } else {
      audio.playSong(this.kind === 'duel' ? 4 : RACE_SONG);
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

  private teardown(): void {
    for (const off of this.offs.splice(0)) off();
    for (const off of this.roomOff.splice(0)) off();
    clearTimeout(this.finishTimer);
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
    this.session = null;
    this.kind = null;
    this.phase = 'idle';
    this.hud = null;
    this.timeScale = 1;
    this.input.enabled = false;
    this.input.split = false;
  }

  /** Leave the game and go back to the main menu. */
  quitToMenu(): void {
    ui.closeAllModals();
    this.teardown();
    this.startAttract();
    nav.go('menu');
  }

  // ================================================================== session events
  private wireSession(): void {
    const s = this.session!;
    const local = (r: Racer) => r.kind === 'human';
    this.offs.push(
      s.on('jump', ({ racer, kind }) => {
        if (!local(racer)) return;
        audio.play(kind === 'pad' ? 'pad' : kind === 'orb' ? 'orb' : kind === 'flip' ? 'flip' : kind === 'hop' ? 'hop' : 'jump');
      }),
      s.on('land', ({ racer }) => {
        if (local(racer)) audio.play('land');
      }),
      s.on('hit', ({ racer, fell }) => {
        if (!local(racer)) return;
        audio.play(fell ? 'fall' : 'hit');
        haptics.heavy();
      }),
      s.on('shieldPop', ({ racer }) => {
        if (!local(racer)) return;
        audio.play('shieldPop');
        haptics.medium();
      }),
      s.on('gem', ({ racer, value }) => {
        if (!local(racer)) return;
        audio.play(value > 1 ? 'bigGem' : 'gem');
        if (value > 1) haptics.light();
      }),
      s.on('pickup', ({ racer, type }) => {
        if (!local(racer)) return;
        audio.play(type === 'heart' ? 'heart' : type === 'shield' ? 'shield' : 'magnet');
        haptics.light();
        this.hud?.showHint(type === 'heart' ? '+1 Heart!' : type === 'shield' ? 'Shield!' : 'Gem Magnet!', '', 1100, '18%');
      }),
      s.on('box', ({ racer, item, x }) => {
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
        if (!local(racer)) return;
        audio.play('portal');
        haptics.light();
        this.maybeModeHint(racer, mode);
      }),
      s.on('hint', ({ racer, key, text, sub }) => this.onHint(racer, key, text, sub)),
      s.on('death', ({ racer }) => {
        if (local(racer)) void this.onDeath(racer);
      }),
      s.on('finish', ({ racer, place }) => this.onFinish(racer, place)),
    );
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
  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const raw = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    this.trackPerf(raw);
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
    if (this.kind === 'attract') this.keepAttractAlive();
    this.updateMusic();
    this.draw(raw);
  };

  private applyInput(): void {
    const s = this.session!;
    if (this.kind === 'duel') {
      s.racers[0].held = this.input.held(0);
      s.racers[1].held = this.input.held(1);
    } else {
      for (const r of s.racers) if (r.kind === 'human') r.held = this.input.held(0);
    }
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
      views = [{ racer: focus, rect: rects[0] }];
    }
    this.renderer.render(s, views, dt, this.time);
    if (this.kind === 'attract' || this.phase === 'results') return;
    const ctx = this.renderer.ctx;
    for (const v of views) {
      if (this.kind === 'endless') {
        drawEndlessHud(ctx, v.rect, v.racer, store.data.best[this.bestKey()] ?? 0, this.renderer.dpr);
      } else {
        drawRaceHud(ctx, v.rect, s, v.racer, this.renderer.dpr, v.label, v.labelColor);
      }
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
      const biome = Math.floor(me.distance / BIOME_LENGTH) % WORLD_SONGS;
      if (biome !== this.songBiome && this.phase === 'running') {
        this.songBiome = biome;
        audio.playSong(biome);
      }
      audio.intensity = Math.min(1, 0.35 + me.distance / 3000);
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
      onRestart: online || this.kind === 'race' ? undefined : () => this.req && this.play(this.req),
      onQuit: () => this.quitToMenu(),
    });
  }

  // ================================================================== endless death / results
  private bestKey(): string {
    return store.settings.kidMode ? 'endless_kid' : 'endless';
  }

  private async onDeath(r: Racer): Promise<void> {
    const s = this.session!;
    s.running = false;
    this.phase = 'dying';
    haptics.heavy();
    await new Promise((res) => setTimeout(res, 650));
    if (!this.session || this.session !== s) return;
    if (!this.revived && r.distance > 60) {
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
    this.phase = 'results';
    this.input.enabled = false;
    const distance = Math.floor(r.distance);
    const key = this.bestKey();
    const prevBest = d.best[key] ?? 0;
    const newBest = distance > prevBest;
    if (newBest) d.best[key] = distance;
    d.stats.runs += 1;
    d.stats.totalDistance += distance;
    d.stats.bestDistance = Math.max(d.stats.bestDistance, distance);
    const xp = endlessXp(distance);
    const missions = this.reportRun(r, [
      ['run_distance', distance],
      ['distance', distance],
      ['gems_run', r.gems],
      ['clean_distance', Math.floor(r.bestClean)],
    ]);
    const ups = this.grantXp(xp);
    store.addGems(r.gems);
    store.commit();
    void store.flush();
    audio.play(newBest ? 'newBest' : 'lose');
    void ads.afterRun().then(() => {
      const screen = new EndlessResultsScreen(
        { distance, best: Math.max(prevBest, distance), newBest, gems: r.gems, jumps: r.jumps, portals: r.portals, xp, levelUps: ups, missionsDone: missions, kidMode: d.settings.kidMode },
        {
          onAgain: () => this.play({ mode: 'endless' }),
          onHome: () => this.quitToMenu(),
          onDouble: async () => {
            const ok = await ads.showRewarded('double_run');
            if (ok) store.addGems(r.gems);
            return ok;
          },
        },
      );
      ui.show(screen);
    });
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
      if (this.kind !== 'duel') this.hud?.showHint(place === 1 ? 'You win!' : 'Finished!', '', 1600, '30%');
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
      const p1 = s.racers[0];
      reward = { gems: p1.gems + 15, trophies: 0, xp: 25 };
      d.stats.duelsPlayed += 1;
      this.reportRun(p1, [['duel_play', 1]]);
    }
    if (reward) {
      store.addGems(reward.gems);
      this.grantXp(reward.xp);
    }
    store.commit();
    void store.flush();
    if (this.kind !== 'duel') audio.play(myPlace === 1 ? 'win' : 'finish');

    const title = this.kind === 'duel' ? (list[0].id === 'p1' ? 'Player 1 wins!' : 'Player 2 wins!') : this.kind === 'online' ? 'Friends Race' : 'Race Results';
    const req = this.req;
    void ads.afterRun().then(() => {
      const screen = new RaceResultsScreen(title, list, reward, {
        onHome: () => this.quitToMenu(),
        onAgain:
          this.kind === 'online'
            ? undefined
            : () => {
                if (!req) return;
                if (req.mode === 'race') this.play({ mode: 'race', seed: (Math.random() * 2 ** 31) >>> 0, rivals: req.rivals });
                else if (req.mode === 'duel') this.play({ mode: 'duel', seed: (Math.random() * 2 ** 31) >>> 0, p2Skin: req.p2Skin });
              },
        againLabel: this.kind === 'duel' ? 'Rematch!' : 'Race again',
      });
      ui.show(screen);
    });
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
