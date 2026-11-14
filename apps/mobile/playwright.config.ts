import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8081",
    channel: "chrome",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "npx expo start --web --localhost --port 8081",
    url: "http://127.0.0.1:8081",
    timeout: 120000,
    reuseExistingServer: true,
  },
  reporter: "list",
});
