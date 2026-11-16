import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8084",
    channel: "chrome",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    // Run serially with production Metro: Expo's transform cache includes mode-specific public values.
    env: { EXPO_PUBLIC_APP_MODE: 'demo', CI: '1' },
    command: "node node_modules/expo/bin/cli start --web --localhost --port 8084 --clear",
    url: "http://127.0.0.1:8084",
    timeout: 120000,
    reuseExistingServer: false,
  },
  reporter: "list",
});
