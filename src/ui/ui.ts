import { h, ic, type Child } from './dom';
import type { IconName } from './icons';

export interface Screen {
  el: HTMLElement;
  /** Called after the element is attached. */
  enter?(): void;
  /** Called before the element is removed. */
  leave?(): void;
  /** Hardware back / Escape. Return true when handled. */
  back?(): boolean;
}

export interface ModalOptions {
  /** Tapping the backdrop or pressing back closes it. Default true. */
  dismissable?: boolean;
  wide?: boolean;
  showClose?: boolean;
  onClose?: () => void;
  className?: string;
}

export interface ModalHandle {
  el: HTMLElement;
  close(): void;
  readonly closed: Promise<void>;
}

type SfxHook = (name: 'click' | 'back' | 'open' | 'error' | 'reward') => void;

/** Owns the DOM layers above the game canvas: screens, modals and toasts. */
class UIManager {
  root!: HTMLElement;
  modalRoot!: HTMLElement;
  toastRoot!: HTMLElement;
  current: Screen | null = null;
  private modals: { handle: ModalHandle; opts: ModalOptions }[] = [];
  /** Wired to the audio engine by the game layer. */
  sfx: SfxHook = () => {};

  init(): void {
    this.root = document.getElementById('ui')!;
    this.modalRoot = document.getElementById('modals')!;
    this.toastRoot = document.getElementById('toasts')!;
    // One delegated listener gives every button a click sound.
    document.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target as HTMLElement | null;
        const btn = t?.closest('button');
        if (btn && !btn.disabled && !btn.dataset.silent) {
          this.sfx(btn.dataset.sfx === 'back' ? 'back' : 'click');
        }
      },
      { capture: true },
    );
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.back();
    });
  }

  show(screen: Screen): void {
    const prev = this.current;
    if (prev) {
      prev.leave?.();
      prev.el.classList.add('leaving');
      const el = prev.el;
      setTimeout(() => el.remove(), 180);
    }
    this.current = screen;
    this.root.appendChild(screen.el);
    screen.enter?.();
  }

  get hasModal(): boolean {
    return this.modals.length > 0;
  }

  modal(content: Child, opts: ModalOptions = {}): ModalHandle {
    const options: ModalOptions = { dismissable: true, showClose: false, ...opts };
    let resolveClosed!: () => void;
    const closed = new Promise<void>((r) => (resolveClosed = r));
    const box = h(`div.modal${options.wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', class: options.className }, content);
    const backdrop = h('div.modal-backdrop', null, box);
    let isClosed = false;
    const handle: ModalHandle = {
      el: box,
      closed,
      close: () => {
        if (isClosed) return;
        isClosed = true;
        this.modals = this.modals.filter((m) => m.handle !== handle);
        backdrop.classList.add('leaving');
        setTimeout(() => backdrop.remove(), 160);
        options.onClose?.();
        resolveClosed();
      },
    };
    if (options.showClose) {
      box.appendChild(
        h('button.btn.icon.red.close', { 'aria-label': 'Close', 'data-sfx': 'back', onclick: () => handle.close() }, ic('close')),
      );
    }
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop && options.dismissable) handle.close();
    });
    this.modalRoot.appendChild(backdrop);
    this.modals.push({ handle, opts: options });
    this.sfx('open');
    return handle;
  }

  closeAllModals(): void {
    for (const m of [...this.modals]) m.handle.close();
  }

  toast(text: string, iconName?: IconName, ms = 2200): void {
    const el = h('div.toast', null, iconName ? ic(iconName) : null, text);
    this.toastRoot.appendChild(el);
    while (this.toastRoot.children.length > 3) this.toastRoot.firstElementChild?.remove();
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 250);
    }, ms);
  }

  /** Hardware back button / Escape. Returns true when something handled it. */
  back(): boolean {
    const top = this.modals[this.modals.length - 1];
    if (top) {
      if (top.opts.dismissable) {
        this.sfx('back');
        top.handle.close();
      }
      return true;
    }
    if (this.current?.back?.()) {
      this.sfx('back');
      return true;
    }
    return false;
  }
}

export const ui = new UIManager();
