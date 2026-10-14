import { store } from '../state/store';
import { lane, parseMelody, SCALES, SONGS, type NoteEvent, type SongDef } from './songs';

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
  | 'levelUp';

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
    const ctx = this.ctx as AudioContext | null;
    if (ctx && ctx.state === 'running' && 'suspend' in ctx) void ctx.suspend();
  }

  resume(): void {
    const ctx = this.ctx as AudioContext | null;
    if (ctx && ctx.state === 'suspended' && 'resume' in ctx) void ctx.resume();
  }

  /** Duck everything (pause menus, ads). */
  duck(on: boolean): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime((on ? 0.12 : 1) * 0.9, this.ctx.currentTime, 0.08);
  }

  // ------------------------------------------------------------------ music
  get currentSong(): number {
    return this.songIndex;
  }

  /** Start a song, or switch at the next bar line if one is playing. */
  playSong(index: number): void {
    this.unlock();
    if (!this.ctx) return;
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
    this.song = PARSED[index % PARSED.length];
    this.beatLength = 60 / this.song.def.bpm;
    this.step = withIntro ? 0 : 32; // skip the 2-bar intro when switching mid-run
    this.nextStepTime = at;
    if (this.delay) this.delay.delayTime.setValueAtTime(this.beatLength * 0.75, at);
  }

  stopMusic(): void {
    this.playing = false;
    clearInterval(this.timer);
    this.songIndex = -1;
    this.pending = -1;
  }

  /** 0 right on a beat → 1 just before the next (for visual pulsing). */
  beatPhase(): number {
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
      // Switch songs on a bar line.
      if (this.pending >= 0 && this.step % 16 === 0) {
        this.startSong(this.pending, this.nextStepTime, false);
        this.crash(this.nextStepTime, 0.5);
        continue;
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
    const fillBar = !intro && section === 'B' && barInSection === 3;

    if (i % 4 === 0) this.lastBeatTime = t;

    // ---- drums
    if (groove.kick[i] === 'x') this.kick(t);
    if (fillBar && i >= 8) {
      if (i % 2 === 0 || i >= 12) this.snare(t, 0.18 + (i - 8) * 0.04);
    } else if (groove.snare[i] === 'x' && !(intro && bar === 0)) {
      this.snare(t, 0.4);
    }
    const h = groove.hat[i];
    if (h !== '.') {
      if (h === 'o' && hi > 0.35) this.hat(t, 0.55, true);
      else if (hi > 0.62 || i % 2 === 0) this.hat(t, i % 4 === 2 ? 0.5 : 0.3, false);
    }
    if (!intro && i === 0 && barInSection === 0 && formBar > 0) this.crash(t, 0.4);

    // ---- bass (side-chained)
    const b = s.bass[i];
    if (b !== '.' && b !== '-') {
      let len = 1;
      while (i + len < 16 && s.bass[i + len] === '-') len++;
      const semis = b === 'r' ? tones[0] : b === 't' ? tones[1] : b === 'f' ? tones[2] : tones[3];
      this.bass(mtof(root + semis - 12 - (semis >= 12 ? 12 : 0)), t, stepDur * Math.max(1.6, len));
    }

    // ---- pad chord each bar
    if (i === 0) this.pad(tones.slice(0, 3).map((x) => root + 12 + x), t, stepDur * 16);

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
      this.lead(mtof(midi), t, stepDur * n.len, s.def.lead, 1);
      if (hi > 0.8) this.lead(mtof(midi - 12), t, stepDur * n.len, 'triangle', 0.45);
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

  private kick(t: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    this.env(g, t, 0.95, 0.002, 0.24);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.28);
    // Click for definition on small phone speakers.
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2500;
    const ng = c.createGain();
    this.env(ng, t, 0.12, 0.001, 0.012);
    n.connect(f).connect(ng).connect(this.musicBus);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.02);
    this.pump(t);
  }

  private snare(t: number, vol: number): void {
    const c = this.ctx!;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2000;
    f.Q.value = 0.7;
    const g = c.createGain();
    this.env(g, t, vol, 0.002, 0.16);
    n.connect(f).connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverbSend);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.2);
    const o = c.createOscillator();
    const og = c.createGain();
    o.frequency.setValueAtTime(230, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    this.env(og, t, vol * 0.55, 0.002, 0.08);
    o.connect(og).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.1);
  }

  private hat(t: number, vol: number, open: boolean): void {
    const c = this.ctx!;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 8000;
    const g = c.createGain();
    this.env(g, t, vol * 0.42, 0.001, open ? 0.22 : 0.035);
    n.connect(f).connect(g).connect(this.musicBus);
    n.start(t, Math.random() * 0.5);
    n.stop(t + (open ? 0.26 : 0.06));
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

  private bass(freq: number, t: number, dur: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(950, t);
    f.frequency.exponentialRampToValueAtTime(220, t + Math.min(dur, 0.22));
    const g = c.createGain();
    this.env(g, t, 0.2, 0.006, dur);
    const sg = c.createGain();
    this.env(sg, t, 0.2, 0.006, dur);
    o.connect(f).connect(g).connect(this.sidechain);
    sub.connect(sg).connect(this.sidechain);
    o.start(t);
    sub.start(t);
    o.stop(t + dur + 0.05);
    sub.stop(t + dur + 0.05);
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

  private pad(midis: number[], t: number, dur: number): void {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 280;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.25);
    g.gain.setValueAtTime(0.03, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(hp).connect(g);
    g.connect(this.sidechain);
    g.connect(this.reverbSend);
    for (const m of midis) {
      for (const cents of [-6, 6]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = cents;
        o.connect(f);
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
