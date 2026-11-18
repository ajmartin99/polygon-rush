import { Capacitor, registerPlugin } from '@capacitor/core';
import { activeEvent } from '../meta/events';
import { store } from '../state/store';

/**
 * Seasonal home-screen icon (Android, from app version 1.1.0): the
 * Christmas icon during Christmas Wonderland, the classic one the rest of the
 * year. Switched only while the app goes to the background, so the launcher
 * refreshing never interrupts play. Settings → Seasonal app icon turns it off.
 */
interface IconSwitcher {
  current(): Promise<{ name: string }>;
  set(opts: { name: string }): Promise<void>;
}

const IconSwitcher = registerPlugin<IconSwitcher>('IconSwitcher');

/** The app build has the icon switcher (older builds get it with an app update). */
export function seasonalIconSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('IconSwitcher');
}

/** The icon that should show right now. */
export function wantedIcon(): string {
  return store.settings.seasonalIcon && activeEvent()?.id === 'christmas' ? 'Christmas' : 'Default';
}

/** Call when the app goes to the background: switch the icon if the season changed. */
export async function syncAppIcon(): Promise<void> {
  if (!seasonalIconSupported()) return;
  try {
    const want = wantedIcon();
    if ((await IconSwitcher.current()).name !== want) await IconSwitcher.set({ name: want });
  } catch {
    /* the launcher refused: try again next time */
  }
}
