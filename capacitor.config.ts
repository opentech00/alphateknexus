import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alphateknexus.app',
  appName: 'AlphaTek Nexus',
  webDir: 'dist',
  android: {
    backgroundColor: '#0f172a',
    allowMixedContent: false,
  captureInput: true,
    webContentsDebuggingEnabled: false,
  initialZoom: 100,
  useLegacyBridge: false,
  overriddenUserInterfaceStyle: 'system',
  backgroundColorDark: '#0f172a',
  navigationHandler: {
    hideFooter: false,
  hideToolbar: false,
  hideLogo: false,
  disabled: true,
  skipLegitLinks: false,
  skipTrustedOrigins: [],
  useWebviewNavigation: false,
  logDifferences: false,
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DEFAULT',
      backgroundColor: '#0f172a',
      overlaysWebView: true,
    },
    App: {
      killOnLogout: false,
    },
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
