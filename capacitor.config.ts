import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tndnjstl.bikeapp',
  appName: '자전거 코스',
  webDir: 'out',
  server: {
    url: 'https://web-nine-flame-55.vercel.app',
    cleartext: false,
  },
};

export default config;
