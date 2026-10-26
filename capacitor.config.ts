import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.peregrinos.app',
  appName: 'Peregrinos',
  webDir: 'apps/web/out',
  server: {
    url: 'https://peregrinos-1.onrender.com',
    cleartext: false
  }
};

export default config;