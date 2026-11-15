import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

for (const caller of ["@expo/fingerprint", "@typescript-eslint/typescript-estree"]) {
  test(`${caller} scoped patched glob dependency preserves the caller's used APIs`, () => {
    const localRequire = createRequire(require.resolve(caller));
    const { Minimatch, minimatch } = localRequire("minimatch");
    const ignored = new Minimatch("**/{node_modules,.expo}/**", { dot: true, optimizationLevel: 1 });
    assert.equal(ignored.match("apps/mobile/node_modules/example/index.js"), true);
    assert.equal(ignored.match("apps/mobile/.expo/settings.json"), true);
    assert.equal(ignored.match("apps/mobile/src/state.tsx"), false);
    assert.equal(minimatch("src/screens/Journal.tsx", "src/**/*.tsx"), true);
    const excluded = new Minimatch("!src/private/**");
    assert.equal(excluded.negate, true);
    assert.equal(excluded.match("src/private/example.ts"), false);
    assert.equal(new Minimatch("src/**/*.ts").pattern, "src/**/*.ts");
  });
}
