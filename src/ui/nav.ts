import type { Screen } from './ui';
import { ui } from './ui';
import type { NetPlayer, NetRoom } from '../services/net';

export type Route = 'agegate' | 'name' | 'menu' | 'shop' | 'missions' | 'settings' | 'race' | 'duel' | 'friends';

export interface Rival {
  name: string;
  skin: string;
  skill: number;
}

export type PlayRequest =
  | { mode: 'endless' }
  | { mode: 'race'; seed: number; rivals: Rival[] }
  | { mode: 'duel'; seed: number; p2Skin: string }
  | { mode: 'online'; room: NetRoom; seed: number; players: NetPlayer[]; delay: number };

type Factory = (params?: Record<string, unknown>) => Screen;

const routes = new Map<Route, Factory>();
let playHandler: (req: PlayRequest) => void = () => {};
let currentRoute: Route | null = null;

export const nav = {
  register(route: Route, factory: Factory): void {
    routes.set(route, factory);
  },
  go(route: Route, params?: Record<string, unknown>): void {
    const f = routes.get(route);
    if (!f) throw new Error(`Unknown route ${route}`);
    currentRoute = route;
    ui.show(f(params));
  },
  get route(): Route | null {
    return currentRoute;
  },
  /** Leave the menus and start a game. */
  play(req: PlayRequest): void {
    currentRoute = null;
    playHandler(req);
  },
  setPlayHandler(fn: (req: PlayRequest) => void): void {
    playHandler = fn;
  },
};
