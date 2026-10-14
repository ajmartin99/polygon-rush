import type { Renderer } from '../render/renderer';

/**
 * Something other than a game session that owns the canvas for a while
 * (the level editor). The controller's main loop calls `frame` every frame.
 */
export interface Scene {
  frame(renderer: Renderer, dt: number, time: number): void;
}
