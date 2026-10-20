import { App as CapApp } from '@capacitor/app';
import { CapacitorHttp } from '@capacitor/core';
import { CapacitorUpdater, type BundleInfo, type ManifestEntry } from '@capgo/capacitor-updater';
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

/**
 * A downloaded update still waiting to be switched to. The updater only
 * switches while the app is in the background, so closing the app (swiping
 * it away) leaves it waiting: it's applied at the next launch instead.
 */
export function pendingToApply(next: Pick<BundleInfo, 'version' | 'status'> | null | undefined, current: number): boolean {
  if (!next || (next.status !== 'pending' && next.status !== 'success')) return false;
  const v = Number(next.version);
  return Number.isInteger(v) && v > current;
}

class Updates {
  private started = false;

  /**
   * Call first thing at launch (before the game draws). Confirms this bundle
   * started, then switches to a waiting update if there is one. Returns true
   * when the app is about to reload into it (stop booting).
   */
  async applyPending(): Promise<boolean> {
    if (!isNative() || !CONFIG.otaUrl) return false;
    try {
      // This bundle started: don't roll it back.
      await CapacitorUpdater.notifyAppReady();
      const next = await CapacitorUpdater.getNextBundle();
      if (!next || !pendingToApply(next, OTA_BUILD)) return false;
      await CapacitorUpdater.set({ id: next.id });
      return true;
    } catch {
      return false;
    }
  }

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
      // Already downloaded (and not failed) on an earlier launch: reuse it.
      const { bundles } = await CapacitorUpdater.list();
      const have = bundles.find((b) => b.version === String(m.ota) && (b.status === 'success' || b.status === 'pending'));
      const bundle = have ?? (await CapacitorUpdater.download({ url: '', version: String(m.ota), manifest: m.files }));
      // Applies the next time the app goes to the background (never mid-run), or at the next launch.
      await CapacitorUpdater.next({ id: bundle.id });
      onReady(m.notes ?? '');
    } catch {
      // Offline or a bad manifest: try again next launch.
    }
  }
}

export const updates = new Updates();
