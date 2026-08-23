import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ammonkennedy.geofield',
  appName: 'GeoField',
  webDir: 'dist/public',
  backgroundColor: '#f8fafc',
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
