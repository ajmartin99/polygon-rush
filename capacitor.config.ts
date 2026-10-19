import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.softgamebros.polygonrush',
  appName: 'Polygon Rush',
  webDir: 'dist',
  backgroundColor: '#1a1040',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      // The launch image is the studio card; the app hides it once its own (identical) card is up.
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#1a1040',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    // Live updates, run by our own code (src/services/updates.ts): no Capgo cloud, no stats sent anywhere.
    CapacitorUpdater: {
      autoUpdate: false,
      updateUrl: '',
      statsUrl: '',
      channelUrl: '',
      // A new bundle must report it started within 10 s or the app rolls back to the last good one.
      appReadyTimeout: 10000,
      // A newer app from the store replaces any downloaded bundle.
      resetWhenUpdate: true,
    },
  },
};

export default config;
