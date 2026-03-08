import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ironlog.app',
  appName: 'IronLog',
  webDir: 'dist',
  server: {
    // During development, uncomment the next line and set your local IP:
    // url: 'http://192.168.1.XXX:5173',
    androidScheme: 'https',
  },
};

export default config;
