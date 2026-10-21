import { music } from '../core/music';
import { SECRET_LEVELS } from '../game/generator';
import { endlessSongs, isRegularTrack, levelSongs, TRACKS, USER_BASE, musicInfo } from '../core/tracks';
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

/** "Now playing" strip (pause menu, settings). Songs belong to their levels: no skipping. */
export function nowPlaying(): HTMLElement {
  const label = h('span.np-title', null, songText(music.current));
  const el = h('div.now-playing', null, ic('music'), h('div.lbl', null, h('span', null, music.locked || music.contextName === 'run' ? 'Level song' : 'Now playing'), label));
  const off = music.on('song', (i) => {
    if (!el.isConnected) return off();
    label.textContent = songText(i);
  });
  return el;
}

function trackTitle(id: number): string {
  return musicInfo(id)?.title ?? '?';
}

/**
 * Settings → Soundtrack: which songs each Endless level is built on (its
 * main song and its backup), the credits, and My Music (the player's own
 * files, for menus and races).
 */
export function openSoundtrack(): void {
  const body = h('div.col.body-scroll.song-list');
  const render = () => {
    clear(body);
    // ---- level music
    if (endlessSongs().length) {
      body.append(
        h('h3', null, 'Level music'),
        h('p.muted.small', null, 'Every Endless level is built on its own song. Each run plays its main song or, now and then, its backup.'),
      );
      for (let i = 0; i < SECRET_LEVELS; i++) {
        const { main, backup } = levelSongs(i);
        body.append(h('div.setting.song-row', null, h('b.lvl-no', null, String(i + 1)), h('div.lbl', null, h('b', null, trackTitle(main)), h('span', null, main !== backup ? `Backup: ${trackTitle(backup)}` : 'Its own song'))));
      }
      body.append(h('p.muted.small', null, `Levels past ${SECRET_LEVELS} play the same songs again, in the same order.`));
    }
    // ---- credits
    if (TRACKS.length) {
      body.append(h('h3', null, 'Songs'));
      TRACKS.forEach((t) => isRegularTrack(t) && body.append(h('div.setting.song-row', null, h('div.lbl', null, h('b', null, t.title), h('span', null, `${t.genre} · ${t.artist} · ${t.license}`)))));
    }
    // ---- classic synth songs
    body.append(
      h(
        'div.setting',
        null,
        h('div.lbl', null, h('b', null, 'Classic songs'), h('span', null, 'Mix the original chiptune-style songs into the menus and races')),
        toggle(store.settings.classicSongs, (v) => (store.setSetting('classicSongs', v), render()), 'Classic songs'),
      ),
    );
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
      h('p.muted.small', null, 'Your own songs (MP3, WAV, OGG, M4A) for the menus and races. Endless levels always play their own song. Your songs stay on this phone: nobody else hears them.'),
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
            if (!music.locked && music.contextName !== 'run') music.skip();
          },
        ),
        input,
      ),
    );
    for (const t of myMusic.tracks) {
      body.append(
        h(
          'div.setting.song-row',
          null,
          h('div.lbl', null, h('b', null, t.name), h('span', null, `${(t.size / 1048576).toFixed(1)} MB`)),
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
  };
  void myMusic.load().then(render);
  render();
  ui.modal([h('h2', null, 'Soundtrack'), nowPlaying(), body], { wide: true, showClose: true });
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
