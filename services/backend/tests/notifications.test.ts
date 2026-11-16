import assert from "node:assert/strict";
import test from "node:test";
import { createExpoPushTransport, createNotificationWorker, NEUTRAL_NOTIFICATION, NotificationWorkerError } from "../src/notifications.ts";

const id = (value: number) => `90000000-0000-0000-0000-${String(value).padStart(12, "0")}`;
const approved = { enabled: true, credentialsReady: true, ownerApprovalId: "fictional-unit-test-only", projectId: id(99), accessToken: "fictional-test-token" };
const lease = (value = 1) => ({ id: id(value), leaseToken: id(value + 100), deviceId: id(value + 200), platform: "android", token: "ExponentPushToken[fictional_unit_token_1234]", payload: { ...NEUTRAL_NOTIFICATION, data: { invalidationId: id(value) } } });
const receipt = (value = 1) => ({ id: id(value), leaseToken: id(value + 300), ticketId: `fictional-ticket-${value}` });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function fixture(responder: (url: string, body: unknown) => Response | Promise<Response> = () => json({ data: { status: "ok", id: "fictional-ticket-1" } })) {
  const calls: { name: string; args: Record<string, unknown> }[] = [], http: { url: string; body: unknown }[] = [], events: string[] = [];
  const state = { allowed: true, jobs: [lease()] as unknown[], receipts: [receipt()] as unknown[], tick: 0 };
  const serviceClient = { async rpc(name: string, args: Record<string, unknown> = {}) {
    calls.push({ name, args }); events.push(name);
    return { data: name === "lease_notifications" ? state.jobs : name === "lease_notification_receipts" ? state.receipts : name.startsWith("authorize_") ? state.allowed : name === "purge_notification_receipts" ? 1 : { status: "recorded" }, error: null };
  } };
  // All HTTP in these tests is synthetic. No default/global fetch is used by an enabled transport.
  const fakeFetch: typeof fetch = async (url, init) => {
    assert.equal(init?.redirect, "error"); assert.ok(init?.signal); assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer fictional-test-token");
    const body = JSON.parse(String(init?.body)); http.push({ url: String(url), body }); events.push("synthetic-http");
    return responder(String(url), body);
  };
  const transport = createExpoPushTransport(approved, fakeFetch);
  const worker = createNotificationWorker({ serviceClient, transport, monotonicNow: () => state.tick });
  return { state, worker, transport, calls, http, events, serviceClient, fakeFetch };
}

test("disabled and unconfigured workers make no database or HTTP calls", async () => {
  const f = fixture();
  for (const config of [{}, { enabled: true }, { ...approved, credentialsReady: false }, { ...approved, accessToken: "unsafe\nheader" }]) {
    const worker = createNotificationWorker({ serviceClient: f.serviceClient, transport: createExpoPushTransport(config, f.fakeFetch) });
    assert.equal((await worker.dispatch()).attempted, 0); assert.equal((await worker.pollReceipts()).attempted, 0);
  }
  assert.equal(f.calls.length, 0); assert.equal(f.http.length, 0);
});

test("current authorization immediately precedes the strictly neutral Expo send and atomic ticket record", async () => {
  const f = fixture(); const result = await f.worker.dispatch();
  assert.deepEqual(f.events, ["lease_notifications", "authorize_notification", "synthetic-http", "record_notification_ticket"]);
  assert.equal(f.http[0].url, "https://exp.host/--/api/v2/push/send");
  assert.deepEqual(f.http[0].body, { to: lease().token, ...NEUTRAL_NOTIFICATION, data: { invalidationId: id(1) }, ttl: 300, priority: "normal" });
  assert.equal(f.calls.at(-1)?.args.p_ticket_id, "fictional-ticket-1");
  assert.equal(result.providerAccepted, 1); assert.equal(result.deviceDelivered, false); assert.equal(result.read, false);
});

test("revoked authorization suppresses dispatch and receipt lookup without external transport", async () => {
  const f = fixture(); f.state.allowed = false;
  assert.equal((await f.worker.dispatch()).suppressed, 1); assert.equal((await f.worker.pollReceipts()).suppressed, 1);
  assert.equal(f.http.length, 0);
  assert.equal(f.calls.at(-1)?.name, "complete_notification_receipt");
});

test("private/unknown payload fields, wrong invalidation identity and oversized batches fail closed", async () => {
  for (const jobs of [
    [{ ...lease(), journal: "Fictional private marker" }],
    [{ ...lease(), payload: { ...lease().payload, body: "Fictional private marker" } }],
    [{ ...lease(), payload: { ...lease().payload, data: { invalidationId: id(2), familyId: id(9) } } }],
    Array.from({ length: 21 }, (_, index) => lease(index + 1)),
  ]) {
    const f = fixture(); f.state.jobs = jobs;
    await assert.rejects(f.worker.dispatch(), (error: unknown) => error instanceof NotificationWorkerError && error.code === "invalid_batch" && !error.message.includes("private marker"));
    assert.equal(f.http.length, 0);
  }
});

test("native/malformed tokens cannot reach Expo; permanent token errors reach SQL revocation outcome", async () => {
  const f = fixture(); f.state.jobs = [{ ...lease(), token: "not-an-expo-token" }];
  assert.equal((await f.worker.dispatch()).failed, 1); assert.equal(f.http.length, 0);
  assert.equal(f.calls.at(-1)?.args.p_outcome, "invalid_token");
  const invalid = fixture(() => json({ data: { status: "error", message: "Discard private provider detail", details: { error: "DeviceNotRegistered" } } }));
  await invalid.worker.dispatch(); assert.equal(invalid.calls.at(-1)?.args.p_outcome, "invalid_token");
});

test("HTTP 429/5xx and malformed or oversized responses defer only through SQL backoff", async () => {
  for (const response of [() => json({}, 429), () => json({}, 503), () => new Response("not JSON"), () => new Response("x".repeat(65_537)), () => json({ data: { status: "error", details: { error: "MessageRateExceeded" } } })]) {
    const f = fixture(response); const result = await f.worker.dispatch();
    assert.equal(result.deferred, 1); assert.equal(f.http.length, 1); assert.equal(f.calls.at(-1)?.args.p_outcome, "retry");
  }
});

test("HTTP 400 is permanent and credentials errors halt the remaining batch", async () => {
  const bad = fixture(() => json({}, 400)); await bad.worker.dispatch(); assert.equal(bad.calls.at(-1)?.args.p_outcome, "failed");
  const denied = fixture(() => json({}, 401)); denied.state.jobs = [lease(), lease(2)];
  await denied.worker.dispatch(); assert.equal(denied.http.length, 1);
});

test("transport timeout aborts the request and schedules a bounded SQL retry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); let aborted = false;
  const request: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("Fictional native timeout detail")); });
  });
  const transport = createExpoPushTransport(approved, request);
  const sending = transport.send({ to: lease().token, ...NEUTRAL_NOTIFICATION, data: { invalidationId: id(1) }, ttl: 300, priority: "normal" });
  t.mock.timers.tick(8_000); assert.deepEqual(await sending, { outcome: "retry" }); assert.equal(aborted, true);
});

test("receipt success records provider handoff only; absence retries without sending another notification", async () => {
  const f = fixture((_url, body) => json({ data: { [(body as { ids: string[] }).ids[0]]: { status: "ok" } } }));
  const result = await f.worker.pollReceipts();
  assert.deepEqual(f.events, ["lease_notification_receipts", "authorize_notification_receipt", "synthetic-http", "complete_notification_receipt"]);
  assert.equal(f.http[0].url, "https://exp.host/--/api/v2/push/getReceipts"); assert.deepEqual(f.http[0].body, { ids: ["fictional-ticket-1"] });
  assert.equal(result.providerReceived, 1); assert.equal(result.deviceDelivered, false); assert.equal(result.read, false);
  const missing = fixture(() => json({ data: {} })); await missing.worker.pollReceipts();
  assert.equal(missing.calls.at(-1)?.args.p_outcome, "retry"); assert.equal(missing.http.some(value => value.url.endsWith("/send")), false);
  const invalid = fixture(() => json({ data: { "fictional-ticket-1": { status: "error", details: { error: "DeviceNotRegistered" } } } }));
  await invalid.worker.pollReceipts(); assert.equal(invalid.calls.at(-1)?.args.p_outcome, "invalid_token");
});

test("worker is serial, rejects overlapping runs, and leaves remaining leases after its time budget", async () => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  const f = fixture(async () => { await pending; f.state.tick = 46_000; return json({ data: { status: "ok", id: "fictional-ticket-1" } }); });
  f.state.jobs = [lease(), lease(2)];
  const running = f.worker.dispatch(); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.worker.pollReceipts()).status, "busy");
  release(); assert.equal((await running).attempted, 1); assert.equal(f.http.length, 1);
});

test("raw database failures are sanitized and receipt cleanup remains available while transport is disabled", async () => {
  const serviceClient = { async rpc() { throw new Error("Private fixture token and SQL detail"); } };
  const worker = createNotificationWorker({ serviceClient, transport: createExpoPushTransport(approved, async () => json({})) });
  await assert.rejects(worker.dispatch(), (error: unknown) => error instanceof NotificationWorkerError && !error.message.includes("Private fixture"));
  const f = fixture(); const cleanup = createNotificationWorker({ serviceClient: f.serviceClient, transport: createExpoPushTransport() });
  assert.equal(await cleanup.purgeReceipts(1), 1); assert.equal(f.http.length, 0);
  await assert.rejects(cleanup.purgeReceipts(21), NotificationWorkerError);
});
