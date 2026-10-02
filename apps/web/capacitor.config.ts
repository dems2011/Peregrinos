import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.peregrinos.app',
  appName: 'Peregrinos',
  webDir: 'public',
  server: {
    url: 'http://192.168.0.14:3000',
    cleartext: true
  }
};

export default config;