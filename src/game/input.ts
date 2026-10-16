/**
 * Maps touches / mouse / keys to up to two "buttons".
 * Single player: anywhere on the play area. Duel: top half = P1, bottom = P2.
 */
export class InputManager {
  split = false;
  enabled = false;
  private pointers = new Map<number, 0 | 1>();
  private keys = new Set<string>();
  private readonly el: HTMLElement;
  /** Fired on every new press (used to unlock audio, dismiss hints...). */
  onPress: (player: 0 | 1) => void = () => {};
  /** Fired on a quick downward swipe (or the Down key): drop faster. */
  onSwipeDown: (player: 0 | 1) => void = () => {};
  private starts = new Map<number, { y: number; t: number }>();

  constructor(el: HTMLElement) {
    this.el = el;
    el.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', () => this.reset());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  reset(): void {
    this.pointers.clear();
    this.starts.clear();
    this.keys.clear();
  }

  held(player: 0 | 1): boolean {
    if (!this.enabled) return false;
    for (const p of this.pointers.values()) if (p === player) return true;
    if (player === 0) {
      if (this.keys.has('Space') || this.keys.has('KeyW')) return true;
      if (!this.split && (this.keys.has('ArrowUp') || this.keys.has('Enter') || this.keys.has('NumpadEnter'))) return true;
    } else if (this.split) {
      if (this.keys.has('ArrowUp') || this.keys.has('Enter') || this.keys.has('NumpadEnter')) return true;
    }
    return false;
  }

  private playerFor(clientY: number): 0 | 1 {
    if (!this.split) return 0;
    const rect = this.el.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2 ? 0 : 1;
  }

  private down = (e: PointerEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this.playerFor(e.clientY);
    this.pointers.set(e.pointerId, p);
    this.starts.set(e.pointerId, { y: e.clientY, t: performance.now() });
    this.onPress(p);
  };

  /** A quick downward swipe: about 1/9 of the screen within a quarter second. */
  private move = (e: PointerEvent): void => {
    const s = this.starts.get(e.pointerId);
    const p = this.pointers.get(e.pointerId);
    if (!s || p === undefined || !this.enabled) return;
    const dy = e.clientY - s.y;
    if (performance.now() - s.t > 260) {
      this.starts.delete(e.pointerId);
      return;
    }
    if (dy > Math.max(28, window.innerHeight / 9)) {
      this.starts.delete(e.pointerId);
      // The swipe isn't a hold: release it so it doesn't keep jumping.
      this.pointers.delete(e.pointerId);
      this.onSwipeDown(p);
    }
  };

  private up = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.starts.delete(e.pointerId);
  };

  private keydown = (e: KeyboardEvent): void => {
    if (!this.enabled || e.repeat) return;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      this.onSwipeDown(this.split && e.code === 'ArrowDown' ? 1 : 0);
      return;
    }
    const relevant = ['Space', 'KeyW', 'ArrowUp', 'Enter', 'NumpadEnter'];
    if (!relevant.includes(e.code)) return;
    e.preventDefault();
    this.keys.add(e.code);
    const p: 0 | 1 = this.split && (e.code === 'ArrowUp' || e.code === 'Enter' || e.code === 'NumpadEnter') ? 1 : 0;
    this.onPress(p);
  };

  private keyup = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
}
