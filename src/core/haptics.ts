import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './platform';
import { store } from '../state/store';

let last = 0;

function allowed(): boolean {
  if (!store.settings.haptics) return false;
  // Never buzz more than ~12 times a second.
  const now = performance.now();
  if (now - last < 80) return false;
  last = now;
  return true;
}

export const haptics = {
  light(): void {
    if (!allowed()) return;
    if (isNative()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  medium(): void {
    if (!allowed()) return;
    if (isNative()) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    else navigator.vibrate?.(25);
  },
  heavy(): void {
    if (!allowed()) return;
    if (isNative()) void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    else navigator.vibrate?.(60);
  },
  success(): void {
    if (!allowed()) return;
    if (isNative()) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
};
