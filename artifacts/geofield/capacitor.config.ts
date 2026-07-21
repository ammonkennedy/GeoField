import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ammonkennedy.geofield',
  appName: 'GeoField',
  webDir: 'dist/public',
  backgroundColor: '#f8fafc',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },
};

export default config;
