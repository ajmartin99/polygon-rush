import './styles.css';
import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { isNative } from './core/platform';
import { store } from './state/store';
import { levels } from './state/levels';
import { ensureMissions } from './meta/missions';
import { ads } from './services/ads';
import { iap } from './services/iap';
import { account } from './services/account';
import { ui } from './ui/ui';
import { nav } from './ui/nav';
import { localCard, ProfileScreen } from './ui/profile';
import { setLocalCard } from './services/net';
import { AgeGateScreen, DifficultyScreen, NameScreen } from './ui/screens/onboarding';
import { MenuScreen } from './ui/screens/menu';
import { ShopScreen } from './ui/screens/shop';
import { MissionsScreen } from './ui/screens/missions';
import { SettingsScreen } from './ui/screens/settings';
import { RaceLobbyScreen } from './ui/screens/race';
import { DuelScreen } from './ui/screens/duel';
import { FriendsScreen } from './ui/screens/friends';
import { CreateScreen } from './ui/screens/create';
import { EditorScreen } from './ui/screens/editor';
import { GameController } from './game/controller';
import { audio } from './core/audio';
import { music } from './core/music';
import { SONGS } from './core/songs';

function registerRoutes(): void {
  nav.register('agegate', () => new AgeGateScreen());
  nav.register('name', (p) => new NameScreen(p));
  nav.register('difficulty', (p) => new DifficultyScreen(p));
  nav.register('profile', () => new ProfileScreen());
  setLocalCard(localCard);
  nav.register('menu', () => new MenuScreen());
  nav.register('shop', (p) => new ShopScreen(p));
  nav.register('missions', () => new MissionsScreen());
  nav.register('settings', () => new SettingsScreen());
  nav.register('race', () => new RaceLobbyScreen());
  nav.register('duel', () => new DuelScreen());
  nav.register('friends', (p) => new FriendsScreen(p));
  nav.register('create', (p) => new CreateScreen(p));
  nav.register('editor', (p) => new EditorScreen(p));
}

async function boot(): Promise<void> {
  ui.init();
  registerRoutes();
  await Promise.all([store.load(), levels.load()]);
  ensureMissions(store.data);
  store.commit();

  document.documentElement.classList.toggle('reduced-motion', store.settings.reducedMotion);
  store.on('settings', (s) => document.documentElement.classList.toggle('reduced-motion', s.reducedMotion));

  const game = new GameController(document.getElementById('game') as HTMLCanvasElement);
  nav.setPlayHandler((req) => game.play(req));
  nav.setSceneHandler((scene) => game.setScene(scene));
  ui.sfx = (name) => audio.play(name);
  // Browsers only allow audio after a gesture: start the menu music on the first tap.
  const unlock = () => {
    audio.unlock();
    if (!game.session || nav.route) music.menu();
    window.removeEventListener('pointerdown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  game.startAttract();
  if (import.meta.env.DEV) {
    // Dev-only hooks for automated audio checks and store screenshots.
    (window as unknown as { __audio: typeof audio }).__audio = audio;
    (window as unknown as { __songs: typeof SONGS }).__songs = SONGS;
    (window as unknown as { __music: typeof music }).__music = music;
    (window as unknown as { __game: GameController }).__game = game;
  }

  if (isNative()) {
    void CapApp.addListener('backButton', () => {
      if (!ui.back()) void CapApp.exitApp();
    });
    void CapApp.addListener('pause', () => {
      void store.flush();
      void levels.flush();
    });
  }
  window.addEventListener('pagehide', () => {
    void store.flush();
    void levels.flush();
  });

  const p = store.data.profile;
  if (!p.ageGroup) nav.go('agegate');
  else if (!p.name) nav.go('name', { first: true });
  else if (!store.data.tutorial.difficulty_pick && store.data.stats.runs === 0) nav.go('difficulty', { first: true });
  else nav.go('menu');

  document.getElementById('boot')?.classList.add('hide');
  setTimeout(() => document.getElementById('boot')?.remove(), 600);
  if (isNative()) void SplashScreen.hide();

  // Monetisation services start after first paint; never block the menu.
  setTimeout(() => {
    if (store.data.profile.ageGroup) void ads.init();
    void iap.init();
    // A deleted or banned Free Chat account signs itself out.
    void account.refresh();
  }, 300);
}

void boot();
