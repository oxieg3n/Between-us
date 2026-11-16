import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import test from "node:test";
import { installNativePkceCrypto, type AuthCryptoHost } from "../src/production/auth-crypto-policy";

const host = (): AuthCryptoHost => ({ TextEncoder, btoa });
test("native PKCE compatibility delegates randomness and SHA-256 without advertising signature verification", async () => {
  const target = host(); let fills = 0;
  assert.equal(installNativePkceCrypto(target, { fill: value => { fills++; value.fill(0x5a); }, sha256: async value => Uint8Array.from(createHash("sha256").update(value).digest()).buffer }), true);
  const backing = new Uint8Array(12); const view = new Uint32Array(backing.buffer, 4, 1);
  assert.equal(target.crypto!.getRandomValues!(view), view); assert.deepEqual([...backing], [0, 0, 0, 0, 90, 90, 90, 90, 0, 0, 0, 0]); assert.equal(fills, 2);
  const digest = await target.crypto!.subtle!.digest!("SHA-256", new TextEncoder().encode("abc"));
  assert.equal(Buffer.from(digest).toString("hex"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal("verify" in target.crypto!.subtle!, false); assert.equal("importKey" in target.crypto!.subtle!, false);
  await assert.rejects(target.crypto!.subtle!.digest!("SHA-1", new Uint8Array()));
  assert.throws(() => target.crypto!.getRandomValues!(new Float32Array(1)));
  assert.throws(() => target.crypto!.getRandomValues!(new Uint8Array(65537)));
});
test("missing native RNG, required globals or immutable host fails closed; existing crypto remains intact", () => {
  const ports = { fill: (value: Uint8Array) => { value.fill(1); }, sha256: async () => new ArrayBuffer(32) };
  const missing = host(); assert.equal(installNativePkceCrypto(missing, { ...ports, fill: () => { throw new Error("Fictional unavailable native module"); } }), false); assert.equal(missing.crypto, undefined);
  assert.equal(installNativePkceCrypto({}, ports), false); assert.equal(installNativePkceCrypto(Object.freeze(host()), ports), false);
  const existing = { getRandomValues: (value: ArrayBufferView) => value, subtle: { digest: async () => new ArrayBuffer(32) } };
  const target = { ...host(), crypto: existing }; assert.equal(installNativePkceCrypto(target, ports), true); assert.equal(target.crypto, existing); assert.equal(target.crypto.subtle, existing.subtle);
});

test("installed managed SDK sends S256 through the limited native adapter, never a plain challenge", async () => {
  const target = host(), original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  installNativePkceCrypto(target, { fill: value => { value.fill(0x6b); }, sha256: async value => Uint8Array.from(createHash("sha256").update(value).digest()).buffer });
  let method: unknown, challenge: unknown;
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: target.crypto });
    const client = createClient("https://fictional.invalid", "fictional-test-public-key", {
      auth: { flowType: "pkce", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // Fake transport only: no request leaves this test process.
      global: { fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        method = body.code_challenge_method; challenge = body.code_challenge;
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      } },
    });
    const result = await client.auth.resetPasswordForEmail("fictional@example.test");
    assert.equal(result.error, null); assert.equal(method, "s256"); assert.match(String(challenge), /^[A-Za-z0-9_-]{43}$/);
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});
