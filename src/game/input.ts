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

  constructor(el: HTMLElement) {
    this.el = el;
    el.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', () => this.reset());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  reset(): void {
    this.pointers.clear();
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
    this.onPress(p);
  };

  private up = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
  };

  private keydown = (e: KeyboardEvent): void => {
    if (!this.enabled || e.repeat) return;
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
