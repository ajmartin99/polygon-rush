import type { EndlessVariant } from '../meta/modes';
import type { Screen } from './ui';
import { ui } from './ui';
import type { NetPlayer, NetRoom } from '../services/net';
import type { LevelContent, LevelData } from '../game/level';
import type { Scene } from '../game/scene';

export type Route = 'agegate' | 'name' | 'difficulty' | 'menu' | 'profile' | 'modes' | 'levels' | 'shop' | 'missions' | 'settings' | 'race' | 'duel' | 'friends' | 'create' | 'editor' | 'pals';

/** How a player-made level run ended (reported back to whoever started it). */
export interface LevelRunResult {
  completed: boolean;
  /** 0..1 of the way to the finish line. */
  progress: number;
  /** Started at the beginning (needed to verify a level). */
  fromStart: boolean;
  gems: number;
  hits: number;
  time: number;
}

export interface Rival {
  name: string;
  skin: string;
  skill: number;
}

export type PlayRequest =
  | { mode: 'endless'; variant?: EndlessVariant; /** Start from this Endless level (classic only). */ level?: number }
  | { mode: 'race'; seed: number; rivals: Rival[] }
  | { mode: 'duel'; seed: number; p2Skin: string }
  | {
      mode: 'online';
      room: NetRoom;
      seed: number;
      players: NetPlayer[];
      delay: number;
      /** Race a player-made level (build rooms). */
      level?: LevelContent;
      /** Build rooms stay open after the race; this returns to the editor. */
      exit?: () => void;
    }
  | {
      mode: 'custom';
      level: LevelData;
      /** Builder's test run from the editor. */
      test?: boolean;
      /** "Play from here" (tiles). */
      startX?: number;
      /** Where Back / Quit goes (editor or level list). */
      exit: () => void;
      onResult?: (r: LevelRunResult) => void;
      /** Community levels: thumbs up/down on the results screen. */
      rate?: LevelRating;
      /** Haunted Run: its difficulty (beat sync, payout, attempts). */
      haunted?: 'hard' | 'easy';
      /** Replaces Retry / Restart (the Haunted Run spends an attempt). */
      onRetry?: () => void;
    };

export interface LevelRating {
  /** 1 up, -1 down, 0 none. */
  vote: number;
  /** Send a vote; resolves to the vote the server kept. */
  onVote: (vote: -1 | 0 | 1) => Promise<number>;
}

type Factory = (params?: Record<string, unknown>) => Screen;

const routes = new Map<Route, Factory>();
let playHandler: (req: PlayRequest) => void = () => {};
let sceneHandler: (scene: Scene | null) => void = () => {};
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
  /** Hand the canvas to a scene (the editor), or give it back to the menu demo with null. */
  scene(scene: Scene | null): void {
    sceneHandler(scene);
  },
  setSceneHandler(fn: (scene: Scene | null) => void): void {
    sceneHandler = fn;
  },
};
