import type { CapacitorConfig } from '@capacitor/cli';

// Android's existing Play listing uses a different ID from the iOS app.
// Native build scripts explicitly select their target; direct CLI commands do too.
const isAndroid = process.env.GEOFIELD_NATIVE_PLATFORM === 'android'
  || process.argv.includes('android');

const config: CapacitorConfig = {
  appId: isAndroid ? 'com.geofield.mobile' : 'com.ammonkennedy.geofield',
  appName: 'GeoField',
  webDir: 'dist/public',
  backgroundColor: '#f8fafc',
  android: {
    // Keep location callbacks flowing during a user-activated background walk.
    useLegacyBridge: true,
  },
  ios: {
    // The web layout already applies safe-area padding where controls need it.
    // Automatic WKWebView insets duplicate that space and leave a blank strip
    // across the bottom of every screen.
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },
};

export default config;
