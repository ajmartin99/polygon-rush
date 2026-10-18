import { store } from '../state/store';
import { lane, parseMelody, SCALES, SONGS, type BassTone, type Kit, type NoteEvent, type SongDef } from './songs';

export { MENU_SONG, RACE_SONG, SONGS, WORLD_SONGS } from './songs';

/**
 * All sound is synthesised with Web Audio — no audio files, nothing to license,
 * tiny download. Includes a beat-synced chiptune sequencer with a different
 * song per world, plus every sound effect.
 */

export type Sfx =
  | 'jump'
  | 'hop'
  | 'flip'
  | 'pad'
  | 'orb'
  | 'land'
  | 'gem'
  | 'bigGem'
  | 'hit'
  | 'fall'
  | 'shield'
  | 'shieldPop'
  | 'heart'
  | 'magnet'
  | 'portal'
  | 'box'
  | 'boost'
  | 'snow'
  | 'count'
  | 'go'
  | 'finish'
  | 'win'
  | 'lose'
  | 'newBest'
  | 'click'
  | 'back'
  | 'open'
  | 'error'
  | 'reward'
  | 'levelUp'
  | 'groan'
  | 'boo';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface ParsedSong {
  def: SongDef;
  scale: number[];
  melA: NoteEvent[];
  melB: NoteEvent[];
  bass: string[];
  arp: string[];
  grooveA: { kick: string[]; snare: string[]; hat: string[] };
  grooveB: { kick: string[]; snare: string[]; hat: string[] };
}

function parseSong(def: SongDef): ParsedSong {
  const scale = SCALES[def.scale];
  const g = (x: SongDef['grooveA']) => ({ kick: lane(x.kick), snare: lane(x.snare), hat: lane(x.hat) });
  return {
    def,
    scale,
    melA: parseMelody(def.melA, scale),
    melB: parseMelody(def.melB, scale),
    bass: lane(def.bass),
    arp: lane(def.arp),
    grooveA: g(def.grooveA),
    grooveB: g(def.grooveB),
  };
}

const PARSED = SONGS.map(parseSong);
/** Seconds two recorded songs overlap when one hands over to the next. */
const CROSSFADE = 2.5;

class AudioEngine {
  ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  /** Pad/bass/arp go through here so the kick can "pump" them (side-chain). */
  private sidechain!: GainNode;
  private reverbSend!: GainNode;
  private delaySend!: GainNode;
  private noise!: AudioBuffer;
  private song: ParsedSong | null = null;
  private songIndex = -1;
  private pending = -1;
  /** 16th-note counter since the song started. */
  private step = 0;
  private nextStepTime = 0;
  private timer = 0;
  private playing = false;
  /** 0..1 — layers (arp, 16th hats, doubled lead) fade in as it rises. */
  intensity = 0.4;
  private lastGem = 0;
  private gemCombo = 0;
  /** Seconds per beat of the current song (for visual pulse). */
  beatLength = 60 / 128;
  /** Context time of the last beat (for visual pulse). */
  lastBeatTime = 0;
  /**
   * Called on a phrase boundary once the current song has played for a
   * while; the music director answers by choosing the next song (or not).
   */
  onSongEnd: (() => void) | null = null;
  /** Seconds a song plays before `onSongEnd` (it ends on a full A-B-A-B cycle). */
  songSeconds = 105;
  private songStarted = 0;

  /** Create the context on the first user gesture (browser autoplay rules). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.attach(new AC({ latencyHint: 'interactive' }));
      store.on('settings', () => this.applyVolumes());
    }
    const ctx = this.ctx as AudioContext;
    if (ctx.state === 'suspended') void ctx.resume();
  }

  /** Build the mixer graph on a context (realtime, or offline for renders/tests). */
  attach(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.sidechain = ctx.createGain();
    this.sidechain.connect(this.musicBus);
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    // Final brick-wall limiter so louder mixes never clip on phone speakers.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    this.master.connect(comp);
    comp.connect(limiter).connect(ctx.destination);

    // Reverb: generated stereo impulse response (soft hall, ~1.8 s).
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.28;
    const verbFilter = ctx.createBiquadFilter();
    verbFilter.type = 'highpass';
    verbFilter.frequency.value = 300;
    this.reverbSend.connect(verbFilter).connect(verb).connect(this.musicBus);

    // Echo: feedback delay with a darkening filter in the loop.
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.35;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.22;
    this.delaySend.connect(delay);
    delay.connect(tone).connect(fb).connect(delay);
    tone.connect(this.musicBus);
    this.delay = delay;

    const nlen = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  private delay: DelayNode | null = null;

  applyVolumes(): void {
    if (!this.ctx) return;
    const s = store.settings;
    this.musicBus.gain.setTargetAtTime(s.music * 0.9, this.ctx.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx * 0.7, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    // Stop the synth scheduler too: a 25 ms timer firing in the background drains the battery.
    clearInterval(this.timer);
    this.timer = 0;
    this.trackEl?.pause();
    if (this.audible && this.audible.el !== this.trackEl) this.audible.el.pause();
    const ctx = this.ctx as AudioContext | null;
    if (ctx && ctx.state === 'running' && 'suspend' in ctx) void ctx.suspend();
  }

  resume(): void {
    if (this.playing && !this.timer) this.timer = window.setInterval(() => this.schedule(this.ctx!.currentTime + 0.12), 25);
    if (this.trackEl) void this.trackEl.play().catch(() => {});
    if (this.audible && this.audible.el !== this.trackEl) void this.audible.el.play().catch(() => {});
    const ctx = this.ctx as AudioContext | null;
    if (ctx && ctx.state === 'suspended' && 'resume' in ctx) void ctx.resume();
  }

  // ------------------------------------------------------------------ recorded tracks
  /** The track we want (may still be loading). */
  private trackEl: HTMLAudioElement | null = null;
  private trackGain: GainNode | null = null;
  private trackId = -1;
  private trackOffset = 0;
  /** The track you can actually hear (the old one keeps playing while the next loads). */
  private audible: { el: HTMLAudioElement; g: GainNode } | null = null;
  /** Tracks loaded ahead of time so the next song starts instantly. */
  private prefetched = new Map<string, HTMLAudioElement>();
  /** Called when a recorded track fails to load (the director moves on). */
  onTrackError: ((id: number) => void) | null = null;

  /**
   * Start loading a track that is likely to play next, so the switch at the
   * next level is a smooth crossfade instead of a gap while it downloads.
   */
  prefetch(url: string): void {
    if (typeof Audio === 'undefined' || this.prefetched.has(url)) return;
    const el = new Audio();
    el.preload = 'auto';
    el.src = url;
    el.load();
    this.prefetched.set(url, el);
    // Keep at most two waiting.
    while (this.prefetched.size > 2) {
      const [oldUrl, old] = this.prefetched.entries().next().value as [string, HTMLAudioElement];
      this.prefetched.delete(oldUrl);
      old.removeAttribute('src');
      old.load();
    }
  }

  /** Equal-power fade of a gain from its current level to `to` over `secs`. */
  private fade(g: GainNode, to: number, secs: number): void {
    const ctx = this.ctx as AudioContext;
    const now = ctx.currentTime;
    const from = Math.max(0.0001, g.gain.value);
    const curve = new Float32Array(32);
    for (let i = 0; i < curve.length; i++) {
      const x = i / (curve.length - 1);
      // Rising fades follow sin, falling ones cos: the sum stays at constant power.
      curve[i] = to > from ? from + (to - from) * Math.sin((x * Math.PI) / 2) : to + (from - to) * Math.cos((x * Math.PI) / 2);
    }
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(from, now);
    g.gain.setValueCurveAtTime(curve, now, Math.max(0.05, secs));
  }

  /** Fade a track out and free it. */
  private release(el: HTMLAudioElement, g: GainNode, secs: number): void {
    if (!this.ctx) return;
    this.fade(g, 0.0001, secs);
    setTimeout(
      () => {
        el.pause();
        el.removeAttribute('src');
        el.load();
        g.disconnect();
      },
      secs * 1000 + 200,
    );
  }

  /**
   * Play recorded music (a bundled track or one of the player's own files).
   * Streams through a media element (low memory) into the music bus, so the
   * music volume and pause-menu ducking apply. Whatever is playing keeps
   * playing until the new track actually starts, then the two crossfade.
   */
  playTrack(id: number, url: string, bpm = 120, offset = 0, gainDb = 0): void {
    this.unlock();
    if (!this.ctx || typeof Audio === 'undefined') return;
    if (this.trackId === id && this.trackEl) return;
    const ctx = this.ctx as AudioContext;
    // A track asked for earlier that never started: drop it silently.
    if (this.trackEl && this.trackEl !== this.audible?.el && this.trackGain) this.release(this.trackEl, this.trackGain, 0.05);
    const el = this.prefetched.get(url) ?? new Audio();
    this.prefetched.delete(url);
    if (!el.src) {
      el.preload = 'auto';
      el.src = url;
    }
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    ctx.createMediaElementSource(el).connect(g).connect(this.musicBus);
    const target = Math.pow(10, gainDb / 20);
    let begun = false;
    let endSignalled = false;
    const begin = () => {
      if (begun || this.trackEl !== el) return;
      begun = true;
      const prev = this.audible;
      this.audible = { el, g };
      this.fade(g, target, prev || this.playing ? CROSSFADE : 0.8);
      if (prev && prev.el !== el) this.release(prev.el, prev.g, CROSSFADE);
      // From the synth: let its last notes ring under the fade-in.
      if (this.playing) this.stopSynth();
    };
    el.addEventListener('playing', begin);
    // Hand over to the next song a little before this one ends, so they overlap.
    el.addEventListener('timeupdate', () => {
      if (this.trackEl !== el || endSignalled || !isFinite(el.duration) || el.duration < CROSSFADE * 4) return;
      if (el.duration - el.currentTime > CROSSFADE + 0.4) return;
      endSignalled = true;
      this.onSongEnd?.();
    });
    el.addEventListener('ended', () => {
      if (this.trackEl !== el) return;
      // Nobody picked something else (a level's own song): loop it.
      endSignalled = false;
      el.currentTime = 0;
      void el.play().catch(() => {});
    });
    el.addEventListener('error', () => {
      if (this.trackEl === el) this.onTrackError?.(id);
    });
    this.trackEl = el;
    this.trackGain = g;
    this.trackId = id;
    this.trackOffset = offset;
    this.beatLength = 60 / Math.max(40, bpm);
    void el.play().catch(() => {});
    // Very slow connection: don't keep the old song going forever.
    setTimeout(() => {
      if (!begun && this.trackEl === el && this.audible && this.audible.el !== el) {
        this.release(this.audible.el, this.audible.g, 1.5);
        this.audible = null;
      }
    }, 6000);
  }

  private lastSync = 0;

  /**
   * Beat-synced levels: keep the recorded track at the song time the runner's
   * position calls for. Only nudges when it has drifted (a slow-down, a
   * boost, a loop or a late start), with a quick dip so the jump isn't heard.
   */
  syncTo(id: number, seconds: number, tolerance = 0.3, cooldownMs = 3000): void {
    const el = this.trackEl;
    if (!el || !this.ctx || this.trackId !== id || this.audible?.el !== el || el.seeking || !isFinite(el.duration) || el.duration <= 0) return;
    const want = seconds % el.duration;
    const drift = Math.abs(el.currentTime - want);
    if (drift < tolerance || drift > el.duration - tolerance) return;
    const now = performance.now();
    if (now - this.lastSync < cooldownMs) return;
    this.lastSync = now;
    const g = this.audible.g;
    const level = g.gain.value;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(level, t);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.06);
    setTimeout(() => {
      if (this.trackEl !== el || !this.ctx) return;
      el.currentTime = want + 0.12;
      const t2 = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t2);
      g.gain.setValueAtTime(0.0001, t2);
      g.gain.linearRampToValueAtTime(Math.max(level, 0.0001), t2 + 0.25);
    }, 70);
  }

  private fadeOutTrack(secs = CROSSFADE): void {
    if (this.trackEl && this.trackGain && this.trackEl !== this.audible?.el) this.release(this.trackEl, this.trackGain, 0.05);
    if (this.audible) this.release(this.audible.el, this.audible.g, secs);
    this.audible = null;
    this.trackEl = null;
    this.trackGain = null;
    this.trackId = -1;
  }

  /** Is recorded music (not the synth) playing? */
  get trackPlaying(): boolean {
    return this.trackEl !== null;
  }

  /** Duck everything (pause menus, ads). */
  duck(on: boolean): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime((on ? 0.12 : 1) * 0.9, this.ctx.currentTime, 0.08);
  }

  // ------------------------------------------------------------------ music
  get currentSong(): number {
    return this.trackId >= 0 ? this.trackId : this.songIndex;
  }

  /** The song playing, or the one queued for the next bar line. */
  get targetSong(): number {
    if (this.trackId >= 0) return this.trackId;
    return this.pending >= 0 ? this.pending : this.songIndex;
  }

  /** Start a song, or switch at the next bar line if one is playing. */
  playSong(index: number): void {
    this.unlock();
    if (!this.ctx) return;
    if (this.trackEl) this.fadeOutTrack();
    if (this.playing && (this.songIndex === index || this.pending === index)) return;
    if (this.playing) {
      this.pending = index;
      return;
    }
    this.startSong(index, this.ctx.currentTime + 0.08, true);
    this.playing = true;
    this.timer = window.setInterval(() => this.schedule(this.ctx!.currentTime + 0.12), 25);
  }

  private startSong(index: number, at: number, withIntro: boolean): void {
    this.songIndex = index;
    this.pending = -1;
    this.songStarted = at;
    this.song = PARSED[index % PARSED.length];
    this.beatLength = 60 / this.song.def.bpm;
    this.step = withIntro ? 0 : 32; // skip the 2-bar intro when switching mid-run
    this.nextStepTime = at;
    if (this.delay) this.delay.delayTime.setValueAtTime(this.beatLength * 0.75, at);
  }

  stopMusic(): void {
    this.fadeOutTrack(1.2);
    this.stopSynth();
  }

  private stopSynth(): void {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = 0;
    this.songIndex = -1;
    this.pending = -1;
  }

  /** 0 right on a beat → 1 just before the next (for visual pulsing). */
  /**
   * Seconds from the nearest beat as the player hears it (negative = early,
   * positive = late), allowing for the device's audio output delay. Null
   * when no music is playing.
   */
  beatError(): number | null {
    const ctx = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    if (!ctx || !(this.beatLength > 0)) return null;
    const lat = ctx.outputLatency || ctx.baseLatency || 0;
    let t: number;
    if (this.trackEl) t = this.trackEl.currentTime - this.trackOffset - lat;
    else if (this.playing) t = ctx.currentTime - this.lastBeatTime - lat;
    else return null;
    const ph = (((t / this.beatLength) % 1) + 1) % 1;
    return (ph < 0.5 ? ph : ph - 1) * this.beatLength;
  }

  beatPhase(): number {
    if (this.trackEl) {
      const t = this.trackEl.currentTime - this.trackOffset;
      return t < 0 ? 0 : (t / this.beatLength) % 1;
    }
    if (!this.ctx || !this.playing) return 0;
    const t = this.ctx.currentTime - this.lastBeatTime;
    return Math.max(0, Math.min(1, t / this.beatLength));
  }

  /** Schedule every 16th note that starts before `until` (context time). */
  schedule(until: number): void {
    if (!this.ctx || !this.song) return;
    while (this.nextStepTime < until) {
      const s = this.song;
      const stepDur = 60 / s.def.bpm / 4;
      if (this.step % 16 === 0) {
        // A full A-B-A-B cycle just finished and the song has had its time: ask for the next one.
        const formBar = this.step / 16 - 2;
        if (this.pending < 0 && formBar > 0 && formBar % 16 === 0 && this.nextStepTime - this.songStarted >= this.songSeconds) this.onSongEnd?.();
        // Switch songs on a bar line.
        if (this.pending >= 0) {
          this.startSong(this.pending, this.nextStepTime, false);
          this.crash(this.nextStepTime, 0.5);
          continue;
        }
      }
      const swing = this.step % 2 === 1 ? s.def.swing * stepDur : 0;
      this.playStep(this.step, this.nextStepTime + swing, stepDur);
      this.nextStepTime += stepDur;
      this.step++;
    }
  }

  /** Render a song offline (for previews and level checks in tests/tools). */
  async renderOffline(index: number, seconds: number, intensity = 0.8, sampleRate = 44100): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const prev = { ctx: this.ctx, intensity: this.intensity };
    this.attach(ctx);
    this.intensity = intensity;
    this.startSong(index, 0.05, true);
    this.schedule(seconds);
    const buf = await ctx.startRendering();
    this.song = null;
    this.ctx = null;
    this.intensity = prev.intensity;
    if (prev.ctx) this.attach(prev.ctx);
    return buf;
  }

  private chord(bar: number, section: 'A' | 'B'): number[] {
    const s = this.song!;
    const prog = section === 'A' ? s.def.progA : s.def.progB;
    const deg = prog[bar % prog.length] - 1;
    const sc = s.scale;
    const tone = (d: number) => sc[d % 7] + 12 * Math.floor(d / 7);
    // root, third, fifth, octave (semitones from tonic)
    return [tone(deg), tone(deg + 2), tone(deg + 4), tone(deg) + 12];
  }

  private playStep(step: number, t: number, stepDur: number): void {
    const s = this.song!;
    const i = step % 16;
    const bar = Math.floor(step / 16);
    const intro = bar < 2;
    const formBar = intro ? 0 : bar - 2;
    const phrase = Math.floor(formBar / 4) % 4; // A B A B
    const section: 'A' | 'B' = phrase % 2 === 0 ? 'A' : 'B';
    const barInSection = formBar % 4;
    const groove = section === 'A' ? s.grooveA : s.grooveB;
    const tones = this.chord(barInSection, section);
    const root = s.def.root;
    const hi = this.intensity;
    const drop = s.def.form === 'drop';
    const fillBar = !intro && section === 'B' && barInSection === 3 && !drop;
    // Drop songs: the last bar of A builds up, then a beat of silence before the drop.
    const buildBar = drop && !intro && section === 'A' && barInSection === 3;
    const gap = buildBar && i >= 14;

    if (i % 4 === 0) this.lastBeatTime = t;
    if (buildBar && i === 0) this.riser(t, stepDur * 14);
    if (drop && !intro && section === 'B' && barInSection === 0 && i === 0 && phrase % 2 === 1) this.impact(t);
    if (gap) return;

    // ---- drums
    const kit: Kit = s.def.kit ?? 'punchy';
    if (groove.kick[i] === 'x' && !(buildBar && i >= 8)) this.kick(t, kit);
    const sn = groove.snare[i];
    if (buildBar) {
      // Snare roll that speeds up: quarters, eighths, then sixteenths.
      if (i < 4 ? i % 4 === 0 : i < 8 ? i % 2 === 0 : true) this.snare(t, 0.12 + i * 0.022, kit);
    } else if (fillBar && i >= 8) {
      if (i % 2 === 0 || i >= 12) this.snare(t, 0.18 + (i - 8) * 0.04, kit);
    } else if (sn === 'x' && !(intro && bar === 0)) {
      this.snare(t, 0.4, kit);
    } else if (sn === 'g' && !intro) {
      this.snare(t, 0.12, kit);
    }
    const h = groove.hat[i];
    if (h !== '.') {
      if (h === 'o' && hi > 0.35) this.hat(t, 0.55, true, kit);
      else if (h === 'r' && hi > 0.5) {
        // Trap-style roll: two 32nds.
        this.hat(t, 0.32, false, kit);
        this.hat(t + stepDur / 2, 0.26, false, kit);
      } else if (hi > 0.62 || i % 2 === 0) this.hat(t, i % 4 === 2 ? 0.5 : 0.3, false, kit);
    }
    if (!intro && i === 0 && barInSection === 0 && formBar > 0) this.crash(t, 0.4);

    // ---- bass (side-chained)
    const b = s.bass[i];
    if (b !== '.' && b !== '-') {
      let len = 1;
      while (i + len < 16 && s.bass[i + len] === '-') len++;
      const semis = b === 'r' ? tones[0] : b === 't' ? tones[1] : b === 'f' ? tones[2] : tones[3];
      // Drop songs keep the big bass for the drop; the build-up gets a clean sub.
      const tone = drop && section === 'A' ? 'sub' : undefined;
      this.bass(mtof(root + semis - 12 - (semis >= 12 ? 12 : 0)), t, stepDur * Math.max(1.6, len), tone, bar);
    }

    // ---- pad chord each bar
    if (i === 0 && s.def.padTone !== 'none') this.pad(tones.slice(0, 3).map((x) => root + 12 + x), t, stepDur * 16);

    if (intro) return;

    // ---- arpeggio layer
    const a = s.arp[i];
    if (a !== '.' && hi > 0.45) this.pluck(mtof(root + 12 + tones[Number(a)]), t, stepDur * 1.6, hi);

    // ---- lead melody
    const mel = section === 'A' ? s.melA : s.melB;
    const local = barInSection * 16 + i;
    const oct = 12 * (s.def.leadOctave ?? 1);
    for (const n of mel) {
      if (n.step !== local) continue;
      const midi = root + oct + n.semis;
      const voice = s.def.voice ?? 'synth';
      if (voice === 'synth') this.lead(mtof(midi), t, stepDur * n.len, s.def.lead, 1);
      else this.voiceNote(voice, mtof(midi), t, stepDur * n.len);
      if (hi > 0.8 && voice !== 'mallet' && voice !== 'keys') this.lead(mtof(midi - 12), t, stepDur * n.len, 'triangle', voice === 'chip' ? 0.3 : 0.45);
    }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private pump(t: number): void {
    const g = this.sidechain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.5, t);
    g.linearRampToValueAtTime(1, t + 0.17);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, q: number, vol: number, decay: number, toVerb = false): void {
    const c = this.ctx!;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, vol, 0.001, decay);
    n.connect(f).connect(g).connect(this.musicBus);
    if (toVerb) g.connect(this.reverbSend);
    n.start(t, Math.random() * 0.5);
    n.stop(t + decay + 0.05);
  }

  private tonePing(t: number, type: OscillatorType, f0: number, f1: number, vol: number, decay: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    const g = c.createGain();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.6);
    this.env(g, t, vol, 0.002, decay);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  private kick(t: number, kit: Kit = 'punchy'): void {
    switch (kit) {
      case 'chip':
        this.tonePing(t, 'square', 130, 48, 0.6, 0.11);
        break;
      case '808':
        this.tonePing(t, 'sine', 75, 40, 1, 0.7);
        this.noiseHit(t, 'highpass', 2500, 0.7, 0.08, 0.01);
        break;
      case 'lofi':
        this.tonePing(t, 'sine', 120, 45, 0.75, 0.2);
        this.noiseHit(t, 'lowpass', 1200, 0.7, 0.08, 0.02);
        break;
      case 'edm':
        // Big-room kick: long, punchy, with a bright click.
        this.tonePing(t, 'sine', 180, 42, 1, 0.34);
        this.noiseHit(t, 'highpass', 3000, 0.7, 0.2, 0.014);
        break;
      default: {
        const decay = kit === 'rock' ? 0.3 : kit === 'breaks' ? 0.18 : 0.24;
        this.tonePing(t, 'sine', 165, 45, 0.95, decay);
        // Click for definition on small phone speakers.
        this.noiseHit(t, 'highpass', 2500, 0.7, kit === 'punchy' ? 0.12 : 0.17, 0.012);
      }
    }
    this.pump(t);
  }

  private snare(t: number, vol: number, kit: Kit = 'punchy'): void {
    switch (kit) {
      case 'chip':
        this.noiseHit(t, 'bandpass', 4200, 0.8, vol * 0.8, 0.08);
        this.tonePing(t, 'square', 320, 190, vol * 0.25, 0.05);
        break;
      case '808':
        // Clap: three quick bursts.
        for (const dt of [0, 0.011, 0.023]) this.noiseHit(t + dt, 'bandpass', 1500, 1.2, vol * 0.75, 0.11, true);
        break;
      case 'lofi':
        this.noiseHit(t, 'bandpass', 1500, 0.6, vol * 0.65, 0.14, true);
        break;
      case 'edm':
        // Layered clap and snare body, big reverb.
        for (const dt of [0, 0.009, 0.019]) this.noiseHit(t + dt, 'bandpass', 1700, 1.1, vol * 0.7, 0.12, true);
        this.noiseHit(t, 'bandpass', 3500, 0.6, vol * 0.5, 0.2, true);
        this.tonePing(t, 'triangle', 240, 170, vol * 0.4, 0.08);
        break;
      case 'rock':
        this.noiseHit(t, 'bandpass', 1800, 0.6, vol * 1.05, 0.22, true);
        this.tonePing(t, 'triangle', 210, 150, vol * 0.65, 0.12);
        break;
      case 'breaks':
        this.noiseHit(t, 'bandpass', 2600, 0.8, vol, 0.12, true);
        this.tonePing(t, 'triangle', 250, 180, vol * 0.5, 0.07);
        break;
      default:
        this.noiseHit(t, 'bandpass', 2000, 0.7, vol, 0.16, true);
        this.tonePing(t, 'sine', 230, 160, vol * 0.55, 0.08);
    }
  }

  private hat(t: number, vol: number, open: boolean, kit: Kit = 'punchy'): void {
    if (kit === 'chip') return this.noiseHit(t, 'highpass', 9000, 0.7, vol * 0.36, open ? 0.12 : 0.02);
    if (kit === 'lofi') return this.noiseHit(t, 'bandpass', 7000, 0.9, vol * 0.3, open ? 0.18 : 0.03);
    this.noiseHit(t, 'highpass', 8000, 0.7, vol * 0.42, open ? 0.22 : 0.035);
  }

  private crash(t: number, vol: number): void {
    const c = this.ctx!;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 5000;
    const g = c.createGain();
    this.env(g, t, vol * 0.3, 0.003, 1.3);
    n.connect(f).connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverbSend);
    n.start(t);
    n.stop(t + 1.4);
  }

  private bass(freq: number, t: number, dur: number, override?: BassTone, bar = 0): void {
    const c = this.ctx!;
    const tone = override ?? this.song?.def.bassTone ?? 'saw';
    if (tone === 'growl') return this.growl(freq, t, dur, bar);
    const g = c.createGain();
    const out = (node: AudioNode) => node.connect(g).connect(this.sidechain);
    if (tone === 'sub') {
      // 808-style sine with a little pitch dive.
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * 1.06, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
      this.env(g, t, 0.34, 0.006, dur);
      out(o);
      o.start(t);
      o.stop(t + dur + 0.05);
      return;
    }
    const o = c.createOscillator();
    o.type = tone === 'square' ? 'square' : 'sawtooth';
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = tone === 'wobble' ? 8 : 4;
    if (tone === 'wobble') {
      // Filter opens and closes on 8th notes.
      f.frequency.value = 500;
      const lfo = c.createOscillator();
      lfo.frequency.value = (this.song ? this.song.def.bpm / 60 : 2) * 2;
      const depth = c.createGain();
      depth.gain.value = 650;
      lfo.connect(depth).connect(f.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    } else if (tone === 'slap') {
      f.frequency.setValueAtTime(2600, t);
      f.frequency.exponentialRampToValueAtTime(380, t + 0.08);
      dur = Math.min(dur, 0.2);
    } else if (tone === 'square') {
      f.frequency.value = 1700;
    } else {
      f.frequency.setValueAtTime(950, t);
      f.frequency.exponentialRampToValueAtTime(220, t + Math.min(dur, 0.22));
    }
    this.env(g, t, tone === 'square' ? 0.13 : 0.2, 0.006, dur);
    o.connect(f);
    out(f);
    o.start(t);
    o.stop(t + dur + 0.05);
    if (tone !== 'square') {
      const sub = c.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = freq / 2;
      const sg = c.createGain();
      this.env(sg, t, 0.2, 0.006, dur);
      sub.connect(sg).connect(this.sidechain);
      sub.start(t);
      sub.stop(t + dur + 0.05);
    }
  }

  private driveCurve2: Float32Array<ArrayBuffer> | null = null;

  /** Dubstep growl: detuned saws + square, driven, through a filter that wobbles at a rate that changes each bar. */
  private growl(freq: number, t: number, dur: number, bar: number): void {
    const c = this.ctx!;
    const beat = (this.song ? this.song.def.bpm : 140) / 60;
    const rates = [2, 4, 2, 3, 2, 4, 6, 8];
    const rate = beat * rates[bar % rates.length];
    if (!this.driveCurve2) {
      this.driveCurve2 = new Float32Array(1024);
      for (let k = 0; k < 1024; k++) {
        const x = (k / 1023) * 2 - 1;
        this.driveCurve2[k] = Math.tanh(x * 3);
      }
    }
    const g = c.createGain();
    this.env(g, t, 0.2, 0.004, dur);
    g.gain.setValueAtTime(0.2, t + Math.max(0.01, dur - 0.03));
    const pre = c.createGain();
    pre.gain.value = 0.5;
    const ws = c.createWaveShaper();
    ws.curve = this.driveCurve2;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 9;
    f.frequency.value = 900;
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate;
    const depth = c.createGain();
    depth.gain.value = 800;
    lfo.connect(depth).connect(f.frequency);
    pre.connect(ws).connect(f).connect(g).connect(this.sidechain);
    const parts: [OscillatorType, number, number][] = [
      ['sawtooth', 1, -12],
      ['sawtooth', 1, 12],
      ['square', 0.5, 0],
    ];
    for (const [type, mult, det] of parts) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      o.detune.value = det;
      o.connect(pre);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    // Clean sub underneath so it still thumps on phone speakers.
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    const sg = c.createGain();
    this.env(sg, t, 0.24, 0.005, dur);
    sub.connect(sg).connect(this.sidechain);
    sub.start(t);
    sub.stop(t + dur + 0.05);
  }

  /** Build-up riser: filtered noise sweeping up plus a rising tone. */
  private riser(t: number, dur: number): void {
    const c = this.ctx!;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    n.connect(f).connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverbSend);
    n.start(t);
    n.stop(t + dur + 0.05);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(1760, t + dur);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.03, t + dur);
    og.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    o.connect(og).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** The drop lands: a deep boom and a crash. */
  private impact(t: number): void {
    this.tonePing(t, 'sine', 110, 32, 0.9, 0.9);
    this.noiseHit(t, 'lowpass', 900, 0.7, 0.35, 0.5, true);
    this.crash(t, 0.7);
  }

  private pluck(freq: number, t: number, dur: number, hi: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t);
    f.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.055 + hi * 0.03, 0.003, dur);
    o.connect(f).connect(g);
    g.connect(this.sidechain);
    g.connect(this.delaySend);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Two detuned oscillators with vibrato on long notes — the hook. */
  private lead(freq: number, t: number, dur: number, wave: OscillatorType, level: number): void {
    const c = this.ctx!;
    const g = c.createGain();
    const peak = (wave === 'sawtooth' ? 0.12 : wave === 'square' ? 0.12 : 0.24) * level;
    const release = Math.min(0.12, dur * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.setValueAtTime(peak * 0.8, t + Math.max(0.01, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(wave === 'triangle' ? 8000 : 5200, t);
    f.frequency.exponentialRampToValueAtTime(wave === 'triangle' ? 5000 : 2600, t + dur + release);
    f.connect(g);
    g.connect(this.musicBus);
    g.connect(this.delaySend);
    g.connect(this.reverbSend);
    for (const cents of [-7, 7]) {
      const o = c.createOscillator();
      o.type = wave;
      o.frequency.value = freq;
      o.detune.value = cents;
      if (dur > 0.3) {
        const lfo = c.createOscillator();
        lfo.frequency.value = 5.6;
        const depth = c.createGain();
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(9, t + Math.min(0.3, dur));
        lfo.connect(depth).connect(o.detune);
        lfo.start(t);
        lfo.stop(t + dur + release + 0.05);
      }
      o.connect(f);
      o.start(t);
      o.stop(t + dur + release + 0.05);
    }
  }

  private driveCurve: Float32Array<ArrayBuffer> | null = null;

  /** Lead instruments other than the default synth. */
  private voiceNote(voice: NonNullable<SongDef['voice']>, freq: number, t: number, dur: number): void {
    const c = this.ctx!;
    const g = c.createGain();
    g.connect(this.musicBus);
    g.connect(this.delaySend);
    switch (voice) {
      case 'supersaw': {
        // EDM lead: a stack of detuned saws, bright and wide.
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(6500, t);
        f.frequency.exponentialRampToValueAtTime(3200, t + dur + 0.1);
        const release = Math.min(0.14, dur * 0.5);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.055, t + 0.01);
        g.gain.setValueAtTime(0.045, t + Math.max(0.02, dur - release));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
        f.connect(g);
        g.connect(this.reverbSend);
        for (const [mult, det] of [[1, -22], [1, -11], [1, 0], [1, 11], [1, 22], [2, 6]] as const) {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = freq * mult;
          o.detune.value = det;
          o.connect(f);
          o.start(t);
          o.stop(t + dur + release + 0.05);
        }
        break;
      }
      case 'chip': {
        // Pure square, no detune: classic handheld console.
        const o = c.createOscillator();
        o.type = 'square';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.004);
        g.gain.setValueAtTime(0.1, t + Math.max(0.01, dur - 0.02));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 0.06);
        break;
      }
      case 'guitar': {
        // Detuned saws into soft clipping: an overdriven power-chord lead.
        // One shaper per note (a shared one would keep every earlier note's output path connected).
        if (!this.driveCurve) {
          this.driveCurve = new Float32Array(1024);
          for (let k = 0; k < this.driveCurve.length; k++) {
            const x = (k / (this.driveCurve.length - 1)) * 2 - 1;
            this.driveCurve[k] = Math.tanh(x * 4) * 0.8;
          }
        }
        const ws = c.createWaveShaper();
        ws.curve = this.driveCurve;
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 3000;
        const pre = c.createGain();
        pre.gain.value = 0.35;
        this.env(g, t, 0.14, 0.006, dur + 0.08);
        pre.connect(ws).connect(f).connect(g);
        for (const [mult, det] of [[1, -9], [1, 9], [1.5, 0]] as const) {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = freq * mult;
          o.detune.value = det;
          const og = c.createGain();
          og.gain.setValueAtTime(1, t);
          og.gain.setValueAtTime(1, t + dur);
          og.gain.linearRampToValueAtTime(0, t + dur + 0.08);
          o.connect(og).connect(pre);
          o.start(t);
          o.stop(t + dur + 0.1);
        }
        break;
      }
      case 'brass': {
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.Q.value = 1.5;
        f.frequency.setValueAtTime(700, t);
        f.frequency.exponentialRampToValueAtTime(3200, t + 0.07);
        f.frequency.exponentialRampToValueAtTime(1900, t + 0.25);
        const release = Math.min(0.1, dur * 0.4);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.13, t + 0.04);
        g.gain.setValueAtTime(0.11, t + Math.max(0.05, dur - release));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
        f.connect(g);
        g.connect(this.reverbSend);
        for (const det of [-5, 5]) {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = freq;
          o.detune.value = det;
          o.connect(f);
          o.start(t);
          o.stop(t + dur + release + 0.05);
        }
        break;
      }
      case 'mallet': {
        // Marimba-ish: sine plus a bright overtone, short ring whatever the note length.
        const ring = Math.min(0.5, Math.max(0.18, dur));
        this.env(g, t, 0.3, 0.003, ring);
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        const o2 = c.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = freq * 4;
        const g2 = c.createGain();
        this.env(g2, t, 0.06, 0.002, ring * 0.3);
        o.connect(g);
        o2.connect(g2).connect(g);
        o.start(t);
        o2.start(t);
        o.stop(t + ring + 0.05);
        o2.stop(t + ring + 0.05);
        break;
      }
      case 'keys': {
        // Soft electric-piano: triangle + octave sine with a natural decay.
        const ring = Math.max(0.35, Math.min(1.1, dur * 1.4));
        this.env(g, t, 0.2, 0.004, ring);
        g.connect(this.reverbSend);
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq;
        const o2 = c.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = freq * 2;
        const g2 = c.createGain();
        g2.gain.value = 0.3;
        o.connect(g);
        o2.connect(g2).connect(g);
        o.start(t);
        o2.start(t);
        o.stop(t + ring + 0.05);
        o2.stop(t + ring + 0.05);
        break;
      }
      default:
        this.lead(freq, t, dur, 'square', 1);
    }
  }

  private pad(midis: number[], t: number, dur: number): void {
    const c = this.ctx!;
    const tone = this.song?.def.padTone ?? 'saw';
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = tone === 'strings' ? 3200 : 2600;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 280;
    const g = c.createGain();
    const level = tone === 'strings' ? 0.034 : tone === 'organ' ? 0.024 : 0.03;
    const attack = tone === 'strings' ? 0.6 : tone === 'organ' ? 0.02 : 0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.setValueAtTime(level, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(hp).connect(g);
    g.connect(this.sidechain);
    g.connect(this.reverbSend);
    for (const m of midis) {
      const layers: [OscillatorType, number, number][] =
        tone === 'organ'
          ? [
              ['sine', 0, 1],
              ['square', 1200, 0.25],
            ]
          : tone === 'strings'
            ? [
                ['sawtooth', -12, 1],
                ['sawtooth', 0, 1],
                ['sawtooth', 12, 1],
              ]
            : [
                ['sawtooth', -6, 1],
                ['sawtooth', 6, 1],
              ];
      for (const [type, cents, amp] of layers) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = mtof(m);
        o.detune.value = cents;
        if (amp !== 1) {
          const ag = c.createGain();
          ag.gain.value = amp;
          o.connect(ag).connect(f);
        } else o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  // ------------------------------------------------------------------ sfx
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, vol, 0.004, dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass', delay = 0): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    const g = c.createGain();
    this.env(g, t, vol, 0.003, dur);
    n.connect(f).connect(g).connect(this.sfxBus);
    n.start(t, Math.random() * 0.4);
    n.stop(t + dur + 0.05);
  }

  private arp(notes: number[], step: number, type: OscillatorType, vol: number, dur = 0.12): void {
    notes.forEach((m, i) => this.tone(type, mtof(m), mtof(m), dur, vol, i * step));
  }

  play(name: Sfx): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'jump':
        this.tone('square', 300, 640, 0.09, 0.16);
        break;
      case 'hop':
        this.tone('triangle', 520, 900, 0.08, 0.22);
        break;
      case 'flip':
        this.tone('sine', 900, 300, 0.12, 0.25);
        break;
      case 'pad':
        this.tone('sine', 180, 720, 0.22, 0.3);
        break;
      case 'orb':
        this.tone('triangle', 660, 1320, 0.12, 0.22);
        break;
      case 'land':
        this.burst(0.05, 0.12, 500);
        break;
      case 'gem': {
        const now = this.ctx.currentTime;
        this.gemCombo = now - this.lastGem < 0.45 ? Math.min(this.gemCombo + 1, 10) : 0;
        this.lastGem = now;
        const base = 84 + [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17][this.gemCombo];
        this.tone('sine', mtof(base), mtof(base), 0.09, 0.2);
        this.tone('sine', mtof(base + 7), mtof(base + 7), 0.12, 0.12, 0.05);
        break;
      }
      case 'bigGem':
        this.arp([84, 88, 91, 96], 0.05, 'sine', 0.2);
        break;
      case 'groan':
        // A zombie's low, wobbly moan.
        this.tone('sawtooth', 140, 82, 0.62, 0.13);
        this.tone('sawtooth', 147, 78, 0.6, 0.09, 0.03);
        this.burst(0.4, 0.12, 380);
        break;
      case 'boo':
        // A ghost's rising, then falling "boooo".
        this.tone('sine', 260, 520, 0.24, 0.2);
        this.tone('sine', 520, 230, 0.5, 0.18, 0.22);
        this.tone('triangle', 390, 780, 0.24, 0.06);
        break;
      case 'hit':
        this.burst(0.25, 0.5, 900);
        this.tone('sawtooth', 300, 70, 0.3, 0.2);
        break;
      case 'fall':
        this.tone('sine', 700, 120, 0.45, 0.25);
        break;
      case 'shield':
      case 'heart':
        this.arp([72, 76, 79, 84], 0.06, 'triangle', 0.2);
        break;
      case 'magnet':
        this.arp([67, 74, 79], 0.05, 'square', 0.12);
        break;
      case 'shieldPop':
        this.burst(0.18, 0.35, 3000, 'highpass');
        this.tone('triangle', 1200, 400, 0.18, 0.2);
        break;
      case 'portal':
        this.burst(0.5, 0.25, 1200, 'bandpass');
        this.arp([60, 67, 72, 79], 0.04, 'triangle', 0.14, 0.2);
        break;
      case 'box':
        this.arp([76, 79, 84], 0.05, 'square', 0.12);
        break;
      case 'boost':
        this.tone('sawtooth', 200, 900, 0.35, 0.18);
        break;
      case 'snow':
        this.arp([96, 91, 88, 84], 0.04, 'sine', 0.18);
        break;
      case 'count':
        this.tone('square', 440, 440, 0.14, 0.18);
        break;
      case 'go':
        this.tone('square', 880, 880, 0.3, 0.2);
        break;
      case 'finish':
        this.arp([72, 76, 79, 84, 88], 0.07, 'square', 0.15, 0.18);
        break;
      case 'win':
        this.arp([72, 76, 79, 84, 79, 84, 88], 0.09, 'square', 0.15, 0.2);
        break;
      case 'lose':
        this.arp([67, 64, 60], 0.14, 'triangle', 0.2, 0.25);
        break;
      case 'newBest':
        this.arp([72, 76, 79, 84, 88, 91, 96], 0.06, 'square', 0.13, 0.15);
        break;
      case 'click':
        this.tone('triangle', 900, 700, 0.04, 0.12);
        break;
      case 'back':
        this.tone('triangle', 600, 420, 0.05, 0.12);
        break;
      case 'open':
        this.tone('sine', 500, 900, 0.08, 0.1);
        break;
      case 'error':
        this.tone('square', 220, 180, 0.15, 0.12);
        break;
      case 'reward':
        this.arp([79, 84, 88, 91, 96], 0.05, 'sine', 0.2);
        break;
      case 'levelUp':
        this.arp([72, 79, 84, 88, 91, 96], 0.07, 'square', 0.14, 0.18);
        break;
    }
  }
}

export const audio = new AudioEngine();
