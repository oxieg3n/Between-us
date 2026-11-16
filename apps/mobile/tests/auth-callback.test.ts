import assert from "node:assert/strict";
import test from "node:test";
import { authCallbackCode, AuthCallbackActiveSessionError, createAuthCallbackExchange, LOCAL_WEB_AUTH_CALLBACK, NATIVE_AUTH_CALLBACK } from "../src/production/auth-callback-policy";

const code = "12345678-1234-1234-1234-123456789abc";
const success = (redirectType: string | null = null) => ({ error: null, data: { session: { user: { id: "fictional-author" } }, user: { id: "fictional-author" }, redirectType } });
const signedOut = async () => ({ session: null, error: null });
test("callback accepts only the exact registered native/local routes and one bounded managed code", () => {
  for (const endpoint of [NATIVE_AUTH_CALLBACK, LOCAL_WEB_AUTH_CALLBACK]) assert.equal(authCallbackCode(`${endpoint}?code=${code}`, endpoint), code);
  for (const url of [
    `betweenus://auth/callback?code=${code}`, `between-us://evil/callback?code=${code}`,
    `http://localhost:8081/auth/callback?code=${code}`, `http://127.0.0.1:8081/evil?code=${code}`,
    `${NATIVE_AUTH_CALLBACK}?code=${code}&code=${code}`, `${NATIVE_AUTH_CALLBACK}?code=x`,
    `${NATIVE_AUTH_CALLBACK}?code=${"a".repeat(513)}`, `${NATIVE_AUTH_CALLBACK}?code=${code}&next=https://evil.test`,
    `${NATIVE_AUTH_CALLBACK}?code=${code}#access_token=fictional`, `${NATIVE_AUTH_CALLBACK}?code=${code}&access_token=fictional`,
    `${NATIVE_AUTH_CALLBACK}?code=${code}&type=admin`, `${NATIVE_AUTH_CALLBACK}?error=access_denied`,
  ]) assert.throws(() => authCallbackCode(url, NATIVE_AUTH_CALLBACK), /account link cannot be completed/);
});
test("only the SDK exchange result can enter recovery; URL hints cannot grant it", async () => {
  const parsed = authCallbackCode(`${NATIVE_AUTH_CALLBACK}?code=${code}&type=recovery`, NATIVE_AUTH_CALLBACK);
  assert.equal(await createAuthCallbackExchange(async () => success(), signedOut)(parsed), "/accounts");
  assert.equal(await createAuthCallbackExchange(async () => success("recovery"), signedOut)(code), "/accounts?recovery=1");
  await assert.rejects(createAuthCallbackExchange(async () => success("admin"), signedOut)(code));
  await assert.rejects(createAuthCallbackExchange(async () => ({ ...success(), data: { ...success().data, session: { user: { id: "another-fictional-author" } } } }), signedOut)(code));
  await assert.rejects(createAuthCallbackExchange(async () => ({ ...success(), error: new Error("Fictional private provider detail") }), signedOut)(code), error => error instanceof Error && !error.message.includes("provider detail"));
});
test("effect replay shares one pending exchange, another code is denied, and the next later flow works", async () => {
  let finish!: (value: ReturnType<typeof success>) => void, calls = 0;
  const exchange = createAuthCallbackExchange(async () => { calls++; return new Promise(resolve => { finish = resolve; }); }, signedOut);
  const first = exchange(code); assert.equal(exchange(code), first); await Promise.resolve(); assert.equal(calls, 1);
  await assert.rejects(exchange("another-fictional-code"));
  finish(success()); assert.equal(await first, "/accounts");
  const second = exchange("another-fictional-code"); await Promise.resolve(); assert.equal(calls, 2); finish(success("recovery")); assert.equal(await second, "/accounts?recovery=1");
});

test("any existing session or uncertain session read denies callback before exchange without signing anyone out", async () => {
  let exchanges = 0;
  const send = async () => { exchanges++; return success(); };
  for (const id of ["same-fictional-author", "another-fictional-author"]) {
    await assert.rejects(createAuthCallbackExchange(send, async () => ({ session: { user: { id } }, error: null }))(code), AuthCallbackActiveSessionError);
  }
  await assert.rejects(createAuthCallbackExchange(send, async () => ({ session: null, error: new Error("Fictional storage failure") }))(code));
  await assert.rejects(createAuthCallbackExchange(send, async () => { throw new Error("Fictional failed session read"); })(code));
  assert.equal(exchanges, 0);
});
