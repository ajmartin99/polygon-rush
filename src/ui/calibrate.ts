import { audio } from '../core/audio';
import { store } from '../state/store';
import { button } from './components';
import { h } from './dom';
import { ui } from './ui';

/**
 * Settings → Beat timing: tap along to 16 clicks. How late (or early) your
 * taps land compared with when you hear the clicks becomes the game's beat
 * timing, so every phone, and every pair of headphones, feels on the beat.
 */
const CLICKS = 16;
const WARMUP = 4;
const GAP = 0.6;

export function openCalibration(): void {
  audio.unlock();
  const ctx = audio.ctx;
  if (!ctx) return void ui.toast('Sound isn’t ready yet. Tap anywhere, then try again.', 'sound');
  const status = h('p', { 'aria-live': 'polite' }, 'Tap the big button on every click. Listen, don’t watch!');
  const pad = h('button.calib-pad', { 'aria-label': 'Tap on the click' }, 'TAP');
  const result = h('p.small');
  const taps: number[] = [];
  let heard: number[] = [];
  let timer = 0;
  const start = () => {
    taps.length = 0;
    audio.duck(true);
    const t0 = ctx.currentTime + 0.8;
    heard = [];
    for (let i = 0; i < CLICKS; i++) {
      const at = t0 + i * GAP;
      audio.clickAt(at, i % 4 === 0);
      heard.push(audio.heardAt(at));
    }
    status.textContent = 'Listen… then tap on every click.';
    result.textContent = '';
    clearTimeout(timer);
    timer = window.setTimeout(finish, (0.8 + CLICKS * GAP + 0.5) * 1000);
  };
  const finish = () => {
    audio.duck(false);
    // Each tap against the click it was meant for; the first few clicks are for getting the feel.
    const errs: number[] = [];
    for (const t of taps) {
      let best = 0;
      for (let i = 1; i < heard.length; i++) if (Math.abs(heard[i] - t) < Math.abs(heard[best] - t)) best = i;
      const e = t - heard[best];
      if (best >= WARMUP && Math.abs(e) < GAP * 500) errs.push(e);
    }
    if (errs.length < 6) {
      status.textContent = 'Not enough taps on the clicks. Try again!';
      return;
    }
    errs.sort((a, b) => a - b);
    const median = errs[Math.floor(errs.length / 2)];
    const ms = Math.max(-150, Math.min(250, Math.round(median)));
    store.setSetting('audioOffset', ms);
    status.textContent = 'Done! Saved.';
    result.textContent = ms === 0 ? 'Your taps land right on the beat.' : `Your taps land ${Math.abs(ms)} ms ${ms > 0 ? 'after' : 'before'} the click: the music now runs that much ${ms > 0 ? 'ahead' : 'behind'} so the beat feels right.`;
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    taps.push(performance.now());
    pad.classList.remove('hit');
    void pad.offsetWidth;
    pad.classList.add('hit');
  });
  const m = ui.modal(
    [
      h('h2', null, '🥁 Beat timing'),
      h('p.muted.small', null, 'If the beat ever feels off (Bluetooth headphones, some phones), tap along here and the game lines the music up with you.'),
      status,
      pad,
      result,
      h(
        'div.actions',
        null,
        button({ label: 'Start', icon: 'play', cls: 'mint', onClick: () => start() }),
        button({
          label: 'Reset',
          cls: 'ghost sm',
          onClick: () => {
            store.setSetting('audioOffset', 0);
            result.textContent = 'Back to the standard timing.';
          },
        }),
      ),
      h('p.muted.small', null, `Now: ${store.settings.audioOffset} ms`),
    ],
    { showClose: true },
  );
  void m.closed.then(() => {
    clearTimeout(timer);
    audio.duck(false);
  });
}
