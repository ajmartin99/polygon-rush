import { App as CapApp } from '@capacitor/app';
import { CapacitorHttp } from '@capacitor/core';
import { CapacitorUpdater, type ManifestEntry } from '@capgo/capacitor-updater';
import { CONFIG } from '../config';
import { isNative } from '../core/platform';

/**
 * Live updates: new game code (maps, obstacles, modes) reaches phones without
 * a store release. At launch the app reads a small manifest; when it lists a
 * newer web build made for this exact native build, only the changed files
 * download (anything identical to a file already in the app is reused, so
 * the music never downloads again) and the update applies the next time the
 * app goes to the background. A bundle that fails to start rolls back on its
 * own. Nothing goes to any third-party update service.
 */
export interface OtaManifest {
  /** Live update number (counts up). */
  ota: number;
  /** The native build (versionCode) this web build was made for. */
  native: number;
  /** What changed, for the toast. */
  notes?: string;
  files: ManifestEntry[];
}

/** The live update number this web build carries (0 = the one inside the app). */
export const OTA_BUILD = typeof __OTA_BUILD__ === 'number' ? __OTA_BUILD__ : 0;

/** Whether a manifest should be downloaded on this phone. */
export function shouldUpdate(m: unknown, nativeBuild: number, current: number): m is OtaManifest {
  if (!m || typeof m !== 'object') return false;
  const o = m as Partial<OtaManifest>;
  return Number.isInteger(o.ota) && o.native === nativeBuild && (o.ota as number) > current && Array.isArray(o.files) && o.files.length > 0 && o.files.some((f) => f.file_name === 'index.html');
}

class Updates {
  private started = false;

  /** Call once the game has loaded: confirms this bundle works, then looks for a newer one. */
  async start(onReady: (notes: string) => void): Promise<void> {
    if (!isNative() || this.started || !CONFIG.otaUrl) return;
    this.started = true;
    try {
      // This bundle started fine: don't roll it back.
      await CapacitorUpdater.notifyAppReady();
      const [info, res] = await Promise.all([CapApp.getInfo(), CapacitorHttp.get({ url: `${CONFIG.otaUrl}?t=${Date.now()}`, responseType: 'json' })]);
      const m: unknown = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (res.status !== 200 || !shouldUpdate(m, Number(info.build), OTA_BUILD)) return;
      const bundle = await CapacitorUpdater.download({ url: '', version: String(m.ota), manifest: m.files });
      // Applies the next time the app goes to the background (never mid-run).
      await CapacitorUpdater.next({ id: bundle.id });
      onReady(m.notes ?? '');
    } catch {
      // Offline or a bad manifest: try again next launch.
    }
  }
}

export const updates = new Updates();
