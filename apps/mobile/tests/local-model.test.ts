import assert from "node:assert/strict";
import test from "node:test";
import { createPrivateModelAdapter, LOCAL_MODEL, modelAssetMatches, type PrivateModelContext } from "../src/local-model-contract";
import { getLocalModelAdapter, getLocalModelStatus, downloadAndLoadModel, loadDownloadedModel, unloadLocalModel } from "../src/local-model";

const request = { text: "Our fictional family is moving house.", role: "child" as const, contacts: [] };
const result = '{"suggestions":[{"draft":"Can we talk about moving?","recipientCategory":"trusted-person","route":"in-person"}]}';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fakeContext(events: string[]): PrivateModelContext {
  return {
    async getFormattedChat() { return { prompt: "fictional formatted prompt" }; },
    async tokenize() { return { tokens: [1, 2, 3] }; },
    async completion() { events.push("complete"); return { text: result }; },
    async stopCompletion() { events.push("stop"); },
    async clearCache(clearData) { assert.equal(clearData, true); events.push("clear"); },
    async release() { events.push("release"); },
  };
}

test("model metadata pins publisher revision, exact size and digest; base platform cannot download", async () => {
  assert.equal(modelAssetMatches(LOCAL_MODEL.bytes, LOCAL_MODEL.sha256), true);
  assert.equal(modelAssetMatches(LOCAL_MODEL.bytes - 1, LOCAL_MODEL.sha256), false);
  assert.equal(modelAssetMatches(LOCAL_MODEL.bytes, "0".repeat(64)), false);
  assert.match(LOCAL_MODEL.url, /^https:\/\/huggingface\.co\/HuggingFaceTB\/SmolLM2-360M-Instruct-GGUF\/resolve\/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f\//);
  assert.equal(getLocalModelStatus().available, false);
  assert.equal(getLocalModelStatus().ready, false);
  assert.equal(getLocalModelAdapter(), undefined);
  await assert.rejects(downloadAndLoadModel(), /unavailable/);
  await assert.rejects(loadDownloadedModel(), /unavailable/);
  await unloadLocalModel();
});

test("aborted generation settles and clears tensor data before the next request enters native completion", async () => {
  const events: string[] = [], started = deferred<void>(), finish = deferred<{ text: string }>();
  const context = fakeContext(events);
  let calls = 0;
  context.completion = async () => {
    events.push(`complete-${++calls}`);
    if (calls === 1) { started.resolve(); return finish.promise; }
    return { text: result };
  };
  const controller = createPrivateModelAdapter({ context: () => context, version: () => 0, retire: async () => assert.fail("No cleanup failure expected") });
  const cancel = new AbortController();
  const first = controller.adapter.generate(request, cancel.signal);
  const rejected = assert.rejects(first, /could not finish safely/);
  await started.promise;
  cancel.abort();
  const second = controller.adapter.generate(request, new AbortController().signal);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  finish.resolve({ text: result });
  await rejected;
  assert.equal(await second, result);
  assert.deepEqual(events, ["clear", "complete-1", "stop", "clear", "clear", "complete-2", "clear"]);
});

test("lifecycle version invalidates queued jobs and drain waits for native settlement", async () => {
  const events: string[] = [], started = deferred<void>(), finish = deferred<{ text: string }>();
  const context = fakeContext(events);
  context.completion = async () => { events.push("complete"); started.resolve(); return finish.promise; };
  let version = 0;
  const controller = createPrivateModelAdapter({ context: () => context, version: () => version, retire: async () => undefined });
  const first = controller.adapter.generate(request, new AbortController().signal);
  const firstRejected = assert.rejects(first, /could not finish safely/);
  await started.promise;
  const queued = controller.adapter.generate(request, new AbortController().signal);
  const queuedRejected = assert.rejects(queued, /unavailable or cancelled/);
  version += 1;
  let drained = false;
  const draining = controller.stopAndDrain().then(() => { drained = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(drained, false);
  finish.resolve({ text: result });
  await Promise.all([firstRejected, queuedRejected, draining]);
  assert.equal(drained, true);
  assert.equal(events.filter((event) => event === "complete").length, 1);
  assert.equal(events.at(-1), "clear");
});

test("cleanup failure retires native context and raw native errors never expose private text", async () => {
  const events: string[] = [];
  let context: PrivateModelContext | undefined = fakeContext(events);
  context.completion = async () => { throw new Error("Fictional private journal marker in native failure"); };
  let clears = 0;
  context.clearCache = async () => { if (++clears > 1) throw new Error("Native cleanup error"); };
  const controller = createPrivateModelAdapter({
    context: () => context, version: () => 0,
    retire: async (selected) => { context = undefined; await selected.release(); },
  });
  await assert.rejects(controller.adapter.generate(request, new AbortController().signal), (error: Error) => {
    assert.doesNotMatch(error.message, /private journal marker|Native/);
    return /could not finish safely/.test(error.message);
  });
  assert.equal(context, undefined);
  assert.deepEqual(events, ["release"]);
  await assert.rejects(controller.adapter.generate(request, new AbortController().signal), /unavailable/);
});

test("oversized context and pre-aborted requests never enter completion", async () => {
  const events: string[] = [], context = fakeContext(events);
  context.tokenize = async () => ({ tokens: new Array(841).fill(1) });
  const controller = createPrivateModelAdapter({ context: () => context, version: () => 0, retire: async () => undefined });
  await assert.rejects(controller.adapter.generate(request, new AbortController().signal), /could not finish safely/);
  const cancel = new AbortController(); cancel.abort();
  await assert.rejects(controller.adapter.generate(request, cancel.signal), /cancelled/);
  await assert.rejects(controller.adapter.generate({ ...request, text: "x".repeat(5001) }, new AbortController().signal), /cannot use/);
  assert.equal(events.includes("complete"), false);
  assert.deepEqual(events, ["clear", "clear"]);
});
