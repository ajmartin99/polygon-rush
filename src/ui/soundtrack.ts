import { music } from '../core/music';
import { SONGS, songRole } from '../core/songs';
import { TRACK_BASE, TRACKS, USER_BASE, musicInfo } from '../core/tracks';
import { myMusic, MAX_FILES } from '../services/mymusic';
import { store } from '../state/store';
import { button, segmented, toggle } from './components';
import { clear, h, ic } from './dom';
import { ui } from './ui';

function songText(id: number): string {
  if (id >= USER_BASE) return `${myMusic.nameOf(id) ?? 'My song'} · My Music`;
  const m = musicInfo(id);
  if (!m) return 'Music is quiet';
  return m.artist ? `${m.title} · ${m.artist}` : `${m.title} · ${m.genre}`;
}

/** "Now playing" strip with a Skip button (pause menu, settings). */
export function nowPlaying(): HTMLElement {
  const label = h('span.np-title', null, songText(music.current));
  const el = h(
    'div.now-playing',
    null,
    ic('music'),
    h('div.lbl', null, h('span', null, music.locked ? 'Level song' : 'Now playing'), label),
    // A level's song is chosen by its builder: no skipping.
    music.locked ? null : button({ icon: 'skip', cls: 'icon ghost', aria: 'Skip song', onClick: () => music.skip() }),
  );
  const off = music.on('song', (i) => {
    if (!el.isConnected) return off();
    label.textContent = songText(i);
  });
  return el;
}

function rotationToggle(id: number, name: string): HTMLElement {
  return toggle(!store.settings.musicOff.includes(id), (on) => {
    const off = store.settings.musicOff.filter((n) => n !== id);
    if (!on) off.push(id);
    store.setSetting('musicOff', off);
  }, `${name} in rotation`);
}

function songRow(id: number, title: string, sub: string, extra?: HTMLElement | null): HTMLElement {
  return h(
    'div.setting.song-row',
    { 'data-song': String(id) },
    button({ icon: 'play', cls: 'icon mint', aria: `Play ${title}`, onClick: () => music.pick(id) }),
    h('div.lbl', null, h('b', null, title), h('span', null, sub)),
    extra ?? rotationToggle(id, title),
  );
}

/**
 * Settings → Soundtrack: the game's recorded tracks (with credits), the
 * classic synth songs, and My Music (the player's own files, on this device).
 */
export function openSoundtrack(): void {
  const body = h('div.col.body-scroll.song-list');
  const render = () => {
    clear(body);
    // ---- recorded tracks
    if (TRACKS.length) {
      body.append(h('h3', null, 'Game music'));
      TRACKS.forEach((t, i) => body.append(songRow(TRACK_BASE + i, t.title, `${t.genre} · ${t.artist} · ${t.license}`)));
    }
    // ---- classic synth songs
    body.append(
      h(
        'div.setting',
        null,
        h('div.lbl', null, h('b', null, 'Classic songs'), h('span', null, TRACKS.length ? 'The original chiptune-style songs, mixed in with the rest' : 'The game’s own synth songs')),
        TRACKS.length ? toggle(store.settings.classicSongs, (v) => (store.setSetting('classicSongs', v), render()), 'Classic songs') : null,
      ),
    );
    if (!TRACKS.length || store.settings.classicSongs) SONGS.forEach((s, i) => body.append(songRow(i, s.title, `${s.genre} · ${songRole(i)}`)));
    // ---- my music
    const input = h<HTMLInputElement>('input', { type: 'file', accept: 'audio/*', multiple: '', style: 'display:none' });
    input.addEventListener('change', async () => {
      if (!input.files?.length) return;
      const r = await myMusic.add(input.files);
      ui.toast(r.added ? `Added ${r.added} song${r.added > 1 ? 's' : ''} to My Music.` : r.skipped[0] ?? 'Nothing added.', 'music', 3200);
      render();
    });
    body.append(
      h('h3', null, 'My Music'),
      h('p.muted.small', null, 'Play your own songs (MP3, WAV, OGG, M4A). They stay on this phone: nobody else hears them.'),
      h(
        'div.row',
        { style: 'gap:0.6rem;align-items:center;flex-wrap:wrap' },
        button({ label: 'Add songs', icon: 'music', cls: 'yellow sm', onClick: () => input.click(), disabled: !myMusic.available || myMusic.tracks.length >= MAX_FILES }),
        segmented(
          [
            { value: 'off', label: 'Off' },
            { value: 'mix', label: 'Mix in' },
            { value: 'only', label: 'Only mine' },
          ],
          store.settings.myMusic,
          (v) => {
            store.setSetting('myMusic', v as 'off' | 'mix' | 'only');
            music.skip();
          },
        ),
        input,
      ),
    );
    for (const t of myMusic.tracks) {
      body.append(
        songRow(
          USER_BASE + t.slot,
          t.name,
          `${(t.size / 1048576).toFixed(1)} MB`,
          button({
            icon: 'trash',
            cls: 'icon ghost',
            aria: `Remove ${t.name}`,
            onClick: async () => {
              await myMusic.remove(t.slot);
              if (music.current === USER_BASE + t.slot) music.skip();
              render();
            },
          }),
        ),
      );
    }
    mark(music.current);
  };
  const mark = (cur: number) => body.querySelectorAll<HTMLElement>('.song-row').forEach((r) => r.classList.toggle('on', Number(r.dataset.song) === cur));
  void myMusic.load().then(render);
  render();
  const off = music.on('song', mark);
  ui.modal(
    [
      h('h2', null, 'Soundtrack'),
      h('p.muted.small', null, 'Tap ▶ to listen. Switch a song off to take it out of the mix.'),
      nowPlaying(),
      body,
    ],
    { wide: true, showClose: true, onClose: off },
  );
}

/** Credits for the recorded music (shown in Settings → Credits). */
export function musicCredits(): HTMLElement | null {
  if (!TRACKS.length) return null;
  return h(
    'div',
    null,
    h('h3', null, 'Music'),
    TRACKS.map((t) => h('p.small', null, h('b', null, `“${t.title}”`), ` by ${t.artist} · ${t.license} · `, h('span.muted', null, t.source))),
    h('p.small.muted', null, 'Original synth soundtrack composed for Polygon Rush.'),
  );
}
