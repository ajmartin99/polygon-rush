import { music } from '../core/music';
import { SONGS, songRole } from '../core/songs';
import { store } from '../state/store';
import { button, toggle } from './components';
import { h, ic } from './dom';
import { ui } from './ui';

function songText(i: number): string {
  const s = SONGS[i];
  return s ? `${s.title} · ${s.genre}` : 'Music is quiet';
}

/** "Now playing" strip with a Skip button (pause menu, settings). */
export function nowPlaying(): HTMLElement {
  const label = h('span.np-title', null, songText(music.current));
  const el = h(
    'div.now-playing',
    null,
    ic('music'),
    h('div.lbl', null, h('span', null, 'Now playing'), label),
    button({ icon: 'skip', cls: 'icon ghost', aria: 'Skip song', onClick: () => music.skip() }),
  );
  const off = music.on('song', (i) => {
    if (!el.isConnected) return off();
    label.textContent = songText(i);
  });
  return el;
}

/** Every song with its genre, where it plays, a play button and an in-rotation switch. */
export function openSoundtrack(): void {
  const rows = SONGS.map((s, i) => {
    const play = button({ icon: 'play', cls: 'icon mint', aria: `Play ${s.title}`, onClick: () => music.pick(i) });
    const el = h(
      'div.setting.song-row',
      null,
      play,
      h('div.lbl', null, h('b', null, s.title), h('span', null, `${s.genre} · ${songRole(i)}`)),
      toggle(!store.settings.musicOff.includes(i), (on) => {
        const off = store.settings.musicOff.filter((n) => n !== i);
        if (!on) off.push(i);
        store.setSetting('musicOff', off);
      }, `${s.title} in rotation`),
    );
    return el;
  });
  const mark = (cur: number) => rows.forEach((r, i) => r.classList.toggle('on', i === cur));
  mark(music.current);
  const off = music.on('song', mark);
  ui.modal(
    [
      h('h2', null, 'Soundtrack'),
      h('p.muted.small', null, 'Tap ▶ to listen. Switch a song off to take it out of the mix (world themes still play when you reach their world).'),
      nowPlaying(),
      h('div.col.body-scroll.song-list', null, rows),
    ],
    { wide: true, showClose: true, onClose: off },
  );
}
