import { readFileSync } from "node:fs";
import { localUiFixturePath } from './e2e-production/fixture-path';
import { defineConfig } from "@playwright/test";

function localFixture() {
  try {
    const fixture = JSON.parse(readFileSync(localUiFixturePath(process.env.BETWEENUS_PRODUCTION_UI_FIXTURE), "utf8"));
    for (const endpoint of [fixture.url, fixture.apiUrl]) {
      const url = new URL(endpoint);
      if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password) throw new Error();
    }
    if (typeof fixture.publicKey !== "string" || !fixture.publicKey ||
      ![fixture.parent, fixture.child].every(account => typeof account?.email === "string" && /\.test$/i.test(account.email) && typeof account?.password === "string" && account.password.length >= 12) ||
      typeof fixture.child.name !== "string" || !fixture.child.name || typeof fixture.conversation?.id !== "string") throw new Error();
    return fixture as { url: string; apiUrl: string; publicKey: string };
  } catch { throw new Error("Production UI tests require a valid ignored local fictional mobile-fixture.json with parent/child credentials, child.name and conversation.id. Fixture contents are suppressed."); }
}
const fixture = localFixture();

export default defineConfig({
  testDir: "./e2e-production",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: "./test-results/production",
  use: {
    baseURL: "http://127.0.0.1:8081",
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: {
    command: "node node_modules/expo/bin/cli start --web --localhost --port 8081",
    url: "http://127.0.0.1:8081",
    timeout: 120_000,
    // The root operator separately verifies the running Metro project and production environment.
    reuseExistingServer: process.env.BETWEENUS_REUSE_QA_METRO === "1",
    env: {
      CI: "1",
      EXPO_PUBLIC_APP_MODE: "production",
      EXPO_PUBLIC_SUPABASE_URL: fixture.url,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixture.publicKey,
      EXPO_PUBLIC_API_URL: fixture.apiUrl,
    },
  },
});
