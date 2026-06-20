import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tndnjstl.bikeapp',
  appName: '자전거 코스',
  webDir: 'out',
  server: {
    url: 'https://bike-course-app.vercel.app',
    cleartext: false,
  },
};

export default config;
