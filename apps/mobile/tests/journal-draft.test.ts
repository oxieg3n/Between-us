import assert from "node:assert/strict";
import test from "node:test";
import { createJournalDraftProtection, type JournalDraftStatus } from "../src/production/journal-draft";
import type { PrivateDraft, SaveDraft } from "../src/production/vault";

const blank = { title: "", body: "" };
const writing = { title: "Fictional page", body: "Fictional private school writing" };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function row(input: SaveDraft, id = "private-draft-one"): PrivateDraft {
  return { ...input, id: input.id ?? id, revision: (input.expectedRevision ?? 0) + 1, createdAt: "2026-11-16T12:00:00Z", updatedAt: "2026-11-16T12:01:00Z" };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function fixture() {
  let author: string | undefined = "author-A/session/editor-one";
  let save: (input: SaveDraft) => Promise<PrivateDraft> = async input => row(input);
  const requests: SaveDraft[] = [], states: { stamp: string; status: JournalDraftStatus; draft?: PrivateDraft }[] = [];
  const timers: { run: () => void; cancelled: boolean }[] = [];
  const helper = createJournalDraftProtection({
    authorized: stamp => author === stamp,
    // Explicitly fake vault port: actual SQLCipher/lifecycle transactions are covered by vault tests.
    save: input => { requests.push(input); return save(input); },
    changed: value => states.push(value),
    delay: (run, ms) => { assert.equal(ms, 1000); const timer = { run, cancelled: false }; timers.push(timer); return () => { timer.cancelled = true; }; },
  });
  helper.open(author!, blank);
  return { helper, requests, states, setAuthor(value: string | undefined) { author = value; }, save(value: typeof save) { save = value; }, fire() { const timer = timers.find(value => !value.cancelled); if (timer) { timer.cancelled = true; timer.run(); } }, pendingTimers: () => timers.filter(timer => !timer.cancelled).length };
}

test("typing debounces only the newest writing into the separate journal draft vault port; unchanged text does not write", async () => {
  const f = fixture(); f.helper.update(blank); assert.equal(f.pendingTimers(), 0);
  f.helper.update({ ...writing, body: "First fictional edit" }); f.helper.update(writing);
  assert.equal(f.requests.length, 0); assert.equal(f.pendingTimers(), 1); assert.equal(f.states.at(-1)?.status, "pending");
  f.fire(); await tick();
  assert.deepEqual(f.requests, [{ ...writing, id: undefined, expectedRevision: null, kind: "journal-editor", recipientCandidate: null, responsePreference: null }]);
  assert.equal(f.states.at(-1)?.status, "protected");
  f.helper.update(writing); assert.equal(f.pendingTimers(), 0); await f.helper.flush(); assert.equal(f.requests.length, 1);
});

test("typing during a pending write and an explicit flush reuse the confirmed draft ID and revision", async () => {
  const f = fixture(), first = deferred<PrivateDraft>(); f.save(async input => f.requests.length === 1 ? first.promise : row(input));
  f.helper.update(writing); f.fire(); await tick();
  const latest = { ...writing, body: "Newer fictional edits while storage awaits" }; f.helper.update(latest);
  const flushing = f.helper.flush(); first.resolve(row(f.requests[0])); assert.equal(await flushing, true);
  assert.equal(f.requests.length, 2); assert.equal(f.requests[1].id, "private-draft-one"); assert.equal(f.requests[1].expectedRevision, 1); assert.equal(f.requests[1].body, latest.body);
  assert.equal(f.helper.draft()?.revision, 2); assert.equal(f.states.at(-1)?.status, "protected"); assert.equal(f.pendingTimers(), 0);
});

test("background/author cancellation prevents timer writes and stale completions cannot replace a recovered draft", async () => {
  const f = fixture(); f.helper.update(writing); f.setAuthor(undefined); f.helper.cancel(); f.fire(); await tick(); assert.equal(f.requests.length, 0);
  f.setAuthor("author-A/session/editor-one"); f.helper.open("author-A/session/editor-one", blank); f.helper.update(writing); f.fire(); f.helper.cancel(); await tick(); assert.equal(f.requests.length, 0);
  f.setAuthor("author-A/session/editor-one"); f.helper.open("author-A/session/editor-one", blank);
  const pending = deferred<PrivateDraft>(); f.save(() => pending.promise); f.helper.update(writing); f.fire(); await tick();
  f.helper.cancel(); f.setAuthor("author-B/session/recovered");
  const recovered = { ...row({ ...writing, expectedRevision: 6, kind: "journal-editor", recipientCandidate: null, responsePreference: null }), id: "recovered-private-draft" };
  f.helper.open("author-B/session/recovered", recovered, recovered); const count = f.states.length;
  pending.resolve(row(f.requests[0])); await tick();
  assert.equal(f.states.length, count); assert.equal(f.helper.draft()?.id, recovered.id); assert.equal(f.helper.draft()?.revision, 7);
  f.helper.update(recovered); assert.equal(f.pendingTimers(), 0);
});

test("temporary concealment suspends timers and preserves only a confirmed revision without extending any idle deadline", async () => {
  const f = fixture(); f.helper.update(writing); f.helper.suspend(); f.fire(); await tick(); assert.equal(f.requests.length, 0); assert.equal(await f.helper.flush(), false);
  f.helper.resume(); assert.equal(f.pendingTimers(), 1); f.fire(); await tick(); assert.equal(f.requests.length, 1);
  f.helper.suspend(); await f.helper.drain(); assert.equal(f.requests.length, 1); f.helper.resume(); assert.equal(f.states.at(-1)?.status, "protected");
  // No touch/clock-reset capability exists in the helper ports.
});

test("storage errors never claim protection or retry forever; explicit retry and next editor clear truthful status", async () => {
  const f = fixture(); f.save(async () => { throw new Error("Fictional private native error"); });
  f.helper.update(writing); f.fire(); await tick(); assert.equal(f.states.at(-1)?.status, "error"); assert.equal(f.helper.draft(), undefined); assert.equal(f.pendingTimers(), 0);
  f.helper.update(writing); assert.equal(f.pendingTimers(), 0); assert.equal(await f.helper.flush(), false);
  f.save(async input => row(input)); assert.equal(await f.helper.flush(), true); assert.equal(f.states.at(-1)?.status, "protected");
  f.helper.open("author-A/session/editor-one", blank); assert.equal(f.states.at(-1)?.status, "clean"); assert.equal(f.helper.draft(), undefined);
});
