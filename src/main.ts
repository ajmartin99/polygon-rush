import './styles.css';
import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { isNative } from './core/platform';
import { store } from './state/store';
import { ensureMissions } from './meta/missions';
import { ads } from './services/ads';
import { iap } from './services/iap';
import { ui } from './ui/ui';
import { nav } from './ui/nav';
import { AgeGateScreen, NameScreen } from './ui/screens/onboarding';
import { MenuScreen } from './ui/screens/menu';
import { ShopScreen } from './ui/screens/shop';
import { MissionsScreen } from './ui/screens/missions';
import { SettingsScreen } from './ui/screens/settings';
import { RaceLobbyScreen } from './ui/screens/race';
import { DuelScreen } from './ui/screens/duel';
import { FriendsScreen } from './ui/screens/friends';
import { GameController } from './game/controller';
import { audio, MENU_SONG } from './core/audio';

function registerRoutes(): void {
  nav.register('agegate', () => new AgeGateScreen());
  nav.register('name', (p) => new NameScreen(p));
  nav.register('menu', () => new MenuScreen());
  nav.register('shop', (p) => new ShopScreen(p));
  nav.register('missions', () => new MissionsScreen());
  nav.register('settings', () => new SettingsScreen());
  nav.register('race', () => new RaceLobbyScreen());
  nav.register('duel', () => new DuelScreen());
  nav.register('friends', () => new FriendsScreen());
}

async function boot(): Promise<void> {
  ui.init();
  registerRoutes();
  await store.load();
  ensureMissions(store.data);
  store.commit();

  document.documentElement.classList.toggle('reduced-motion', store.settings.reducedMotion);
  store.on('settings', (s) => document.documentElement.classList.toggle('reduced-motion', s.reducedMotion));

  const game = new GameController(document.getElementById('game') as HTMLCanvasElement);
  nav.setPlayHandler((req) => game.play(req));
  ui.sfx = (name) => audio.play(name);
  // Browsers only allow audio after a gesture: start the menu music on the first tap.
  const unlock = () => {
    audio.unlock();
    if (!game.session || nav.route) audio.playSong(MENU_SONG);
    window.removeEventListener('pointerdown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  game.startAttract();

  if (isNative()) {
    void CapApp.addListener('backButton', () => {
      if (!ui.back()) void CapApp.exitApp();
    });
    void CapApp.addListener('pause', () => void store.flush());
  }
  window.addEventListener('pagehide', () => void store.flush());

  const p = store.data.profile;
  if (!p.ageGroup) nav.go('agegate');
  else if (!p.name) nav.go('name', { first: true });
  else nav.go('menu');

  document.getElementById('boot')?.classList.add('hide');
  setTimeout(() => document.getElementById('boot')?.remove(), 600);
  if (isNative()) void SplashScreen.hide();

  // Monetisation services start after first paint; never block the menu.
  setTimeout(() => {
    if (store.data.profile.ageGroup) void ads.init();
    void iap.init();
  }, 300);
}

if (import.meta.env.DEV) {
  // Dev-only hooks for automated audio checks.
  (window as unknown as { __audio: typeof audio }).__audio = audio;
}

void boot();
