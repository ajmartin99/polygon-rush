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
  },
};

export default config;
