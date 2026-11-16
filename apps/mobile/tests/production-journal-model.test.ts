import assert from "node:assert/strict";
import test from "node:test";
import { createJournalModelController, type JournalModelRuntime } from "../src/production/journal-model";

const request = { text: "I had a school project today. There were several pages to finish before lunch.", role: "child" as const, contacts: [] };
const output = JSON.stringify({ suggestions: [{ draft: "Can we talk about school? I'd like you to listen first.", recipientCategory: "trusted-person", route: "in-person" }] });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function fixture() {
  let author: string | undefined = "fictional-author/session", ready = false, version = 0;
  const events: string[] = [];
  let generate = async (_signal: AbortSignal): Promise<string> => output;
  let setup: () => Promise<void> = async () => undefined;
  const runtime: JournalModelRuntime = {
    status: () => ({ available: true, ready, message: "Fictional test runtime" }),
    adapter: () => ready ? { generate: async (_request, signal) => { events.push("generate"); return generate(signal); } } : undefined,
    async download() { events.push("download"); const selected = version; await setup(); if (selected === version) ready = true; },
    async load() { events.push("load"); const selected = version; await setup(); if (selected === version) ready = true; },
    async unload() { events.push("unload"); version++; ready = false; },
  };
  const controller = createJournalModelController(runtime, () => author);
  return { controller, events, author(value: string | undefined) { author = value; }, generation(value: typeof generate) { generate = value; }, setup(value: typeof setup) { setup = value; } };
}

test("production model stays off after load until explicit use; rules work without model inference", async () => {
  const f = fixture(); assert.equal((await f.controller.suggest(request))?.source, "local-template");
  await f.controller.setup("load"); assert.equal(f.controller.state().enabled, false);
  await f.controller.suggest(request); assert.equal(f.events.includes("generate"), false);
  await f.controller.useModel(true); assert.equal((await f.controller.suggest(request))?.source, "on-device-model");
  assert.equal(f.events.filter(value => value === "generate").length, 1);
});

test("lock/account retirement cancels generation and hides every late result", async () => {
  const f = fixture(); await f.controller.setup("load"); await f.controller.useModel(true);
  const pending = deferred<string>(); let captured: AbortSignal | undefined;
  f.generation(signal => { captured = signal; return pending.promise; });
  const generating = f.controller.suggest(request); f.author(undefined); await f.controller.invalidate();
  assert.equal(captured?.aborted, true); pending.resolve(output); assert.equal(await generating, undefined); assert.equal(f.controller.state().enabled, false);
});

test("typing or same-author refresh cancels only a stale suggestion, not public model setup", async () => {
  const f = fixture(), setup = deferred<void>(); f.setup(() => setup.promise);
  const loading = f.controller.setup("download"); f.controller.cancelSuggestion(); setup.resolve();
  assert.equal(await loading, true); assert.equal(f.controller.state().ready, true); assert.equal(f.events.includes("unload"), false);
  await f.controller.useModel(true); const pending = deferred<string>(); f.generation(() => pending.promise);
  const suggesting = f.controller.suggest(request); f.controller.cancelSuggestion(); pending.resolve(output);
  assert.equal(await suggesting, undefined); assert.equal(f.controller.state().enabled, true);
});

test("setup cannot enable a changed author, and unsupported/malformed output keeps safe fallback", async () => {
  const f = fixture(), setup = deferred<void>(); f.setup(() => setup.promise);
  const loading = f.controller.setup("download"); f.author("another-author/session"); setup.resolve();
  assert.equal(await loading, false); assert.equal(f.controller.state().enabled, false); assert.equal(f.controller.state().ready, false);
  f.setup(async () => undefined); await f.controller.setup("load"); await f.controller.useModel(true);
  f.generation(async () => "You should fix this. Fictional private native error.");
  const result = await f.controller.suggest(request); assert.equal(result?.source, "local-template"); assert.equal(JSON.stringify(result).includes("private native error"), false);
});
