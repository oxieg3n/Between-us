import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createVaultController, VaultError, type SqlValue, type VaultActor, type VaultPorts } from "../src/production/vault";
import { createNativeVaultController } from "../src/production/vault/platform";

const alice: VaultActor = { issuer: "fictional.test", subject: "author-alice", sessionId: "own-session" };
const guardian: VaultActor = { issuer: "fictional.test", subject: "author-guardian", sessionId: "guardian-session" };
const errorCode = (code: string) => (error: unknown) => error instanceof VaultError && error.code === code;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

/** Real SQLite transactions/schema; SQLCipher/key custody are explicitly fake portable ports. */
function fixture() {
  const databases = new Map<string, DatabaseSync>(), keys = new Map<string, string>(), credentials = new Map<string, string>();
  const statements: string[] = [];
  const options = { cipher: true, authentication: true, clock: 0, keyReadFailure: false, failedSql: "", afterMutationFailure: false, visibility: "active" as "active" | "inactive" | "background" };
  const concealed: boolean[] = [];
  let visibilityHandler: ((state: "active" | "inactive" | "background", ownAuthentication: boolean) => void) | undefined;
  let entropy = 0;
  let hook: ((sql: string) => Promise<void>) | undefined;
  const ports: VaultPorts = {
    supported: async () => true, authenticate: async () => options.authentication,
    randomBytes: async count => new Uint8Array(count).fill(++entropy), uuid: randomUUID,
    now: () => "2026-11-16T12:00:00.000Z", monotonicNow: () => options.clock,
    credentials: {
      async read(alias, authenticated) { if (authenticated && options.keyReadFailure) throw new Error("Fictional secret native cancellation"); return credentials.get(alias) ?? null; },
      async write(alias, value) { credentials.set(alias, value); },
      async remove(alias) { credentials.delete(alias); },
    },
    files: {
      exists: async name => databases.has(name), list: async () => [...databases.keys()],
      async remove(name) { const db = databases.get(name); if (db) { db.close(); databases.delete(name); keys.delete(name); } },
    },
    async open(name) {
      if (!databases.has(name)) databases.set(name, new DatabaseSync(":memory:"));
      const db = databases.get(name)!;
      let keyed = false;
      async function before(sql: string) {
        statements.push(sql); await hook?.(sql);
        if (options.failedSql && sql.startsWith(options.failedSql) && !options.afterMutationFailure) throw new Error("Fictional private SQL failure");
      }
      return {
        async exec(sql) {
          await before(sql);
          if (sql.startsWith("PRAGMA key")) { const key = sql.match(/x'([0-9a-f]{64})'/)?.[1]; if (!key) throw new Error(); if (keys.has(name) && keys.get(name) !== key) throw new Error("Wrong key"); keys.set(name, key); keyed = true; return; }
          if (sql.startsWith("PRAGMA cipher_memory_security")) { assert.equal(keyed, true); return; }
          assert.equal(keyed, true); db.exec(sql);
        },
        async run(sql, params) { await before(sql); assert.equal(keyed, true); const result = db.prepare(sql).run(...params); if (options.failedSql && sql.startsWith(options.failedSql) && options.afterMutationFailure) throw new Error("Fictional mutation failure"); return { changes: Number(result.changes) }; },
        async first<T>(sql: string, params: readonly SqlValue[] = []) {
          await before(sql);
          if (sql === "PRAGMA cipher_version") return (options.cipher ? { cipher_version: "portable-test-fake" } : undefined) as T | undefined;
          assert.equal(keyed, true); return db.prepare(sql).get(...params) as T | undefined;
        },
        async all<T>(sql: string, params: readonly SqlValue[] = []) { await before(sql); assert.equal(keyed, true); if (sql === "PRAGMA cipher_integrity_check") return []; return db.prepare(sql).all(...params) as T[]; },
        async close() { statements.push("CLOSE"); },
      };
    },
    protectFiles: async () => undefined,
    isActive: () => options.visibility === "active",
    onConceal: covered => { concealed.push(covered); },
    onVisibilityChange(handler) { visibilityHandler = handler; return () => { visibilityHandler = undefined; }; },
  };
  const vault = createVaultController(ports);
  return { vault, ports, databases, credentials, statements, options, concealed, visibility(state: typeof options.visibility, ownAuthentication = false) { options.visibility = state; visibilityHandler?.(state, ownAuthentication); }, setHook(value: typeof hook) { hook = value; }, async ready() { await vault.enroll(alice); await vault.unlock(alice); }, async cleanup() { await vault.dispose(); for (const db of databases.values()) db.close(); } };
}

test("enrollment keys each separate store before schema; another account cannot replace or unlock it", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  assert.equal(f.databases.size, 2);
  const protectedKeys = [...f.credentials.entries()].filter(([alias]) => alias.includes(".key."));
  assert.equal(protectedKeys.length, 2); assert.notEqual(protectedKeys[0][1], protectedKeys[1][1]);
  assert.equal(f.statements.filter(sql => sql === "PRAGMA cipher_version").length, 4);
  assert.ok(f.statements.indexOf("PRAGMA cipher_version") < f.statements.findIndex(sql => sql.startsWith("PRAGMA key")));
  assert.ok(f.statements.findIndex(sql => sql.startsWith("PRAGMA key")) < f.statements.findIndex(sql => sql.startsWith("CREATE TABLE")));
  await f.vault.lock("account-change");
  await assert.rejects(f.vault.enroll(guardian), errorCode("identity-mismatch"));
  await assert.rejects(f.vault.unlock(guardian), errorCode("identity-mismatch"));
  await assert.rejects(f.vault.erase(guardian), errorCode("identity-mismatch"));
  await f.vault.unlock(alice);
});

test("missing SQLCipher stops before key/schema and interrupted setup never resets", async t => {
  const f = fixture(); t.after(() => f.cleanup()); f.options.cipher = false;
  await assert.rejects(f.vault.enroll(alice), errorCode("unsupported"));
  assert.equal(f.statements.some(sql => sql.startsWith("PRAGMA key") || sql.startsWith("CREATE TABLE")), false);
  const before = [...f.credentials.entries()];
  f.options.cipher = true;
  await assert.rejects(f.vault.enroll(alice), errorCode("recovery-required"));
  assert.deepEqual([...f.credentials.entries()], before);
});

test("lost key, auth rejection and native key errors preserve existing writing and credentials", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  const saved = await f.vault.save({ title: "Fictional page", body: "Fictional private writing", expectedRevision: null });
  await f.vault.lock("signout");
  const initial = [...f.credentials.entries()];
  f.options.authentication = false;
  await assert.rejects(f.vault.unlock(alice), errorCode("locked"));
  f.options.authentication = true; f.options.keyReadFailure = true;
  await assert.rejects(f.vault.unlock(alice), errorCode("storage"));
  assert.deepEqual([...f.credentials.entries()], initial);
  f.options.keyReadFailure = false;
  const [alias, key] = initial.find(([name]) => name.includes(".key."))!;
  f.credentials.delete(alias);
  await assert.rejects(f.vault.unlock(alice), errorCode("key-unavailable"));
  await assert.rejects(f.vault.enroll(alice), errorCode("already-enrolled"));
  assert.equal(f.credentials.has(alias), false);
  f.credentials.set(alias, key); await f.vault.unlock(alice);
  assert.equal((await f.vault.read(saved.id))?.body, saved.body);
});

test("strict input, revision conflicts and independent drafts preserve author writing", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  const first = await f.vault.save({ title: "Quote ' ; DROP TABLE entries; --", body: "Fictional Unicode 🐈 writing", expectedRevision: null });
  const updated = await f.vault.save({ ...first, body: "Updated fictional words", expectedRevision: 1 });
  await assert.rejects(f.vault.save({ ...first, body: "Stale overwrite", expectedRevision: 1 }), errorCode("conflict"));
  for (const input of [
    { title: "", body: " ", expectedRevision: null },
    { title: "x".repeat(151), body: "text", expectedRevision: null },
    { title: "", body: "\ud800", expectedRevision: null },
    { title: "", body: "text", expectedRevision: 1 },
  ]) await assert.rejects(f.vault.save(input), errorCode("invalid-input"));
  assert.equal((await f.vault.read(first.id))?.body, updated.body);
  const unsent = await f.vault.saveDraft({ title: "", body: "Separately composed words", expectedRevision: null, kind: "conversation", recipientCandidate: "fictional-recipient", responsePreference: "Just listen" });
  assert.equal(await f.vault.read(unsent.id), undefined);
  assert.equal(await f.vault.readDraft(first.id), undefined);
  const draftSummaries = await f.vault.listDrafts();
  assert.equal(draftSummaries.length, 1); assert.equal(draftSummaries[0].id, unsent.id);
  assert.equal("body" in draftSummaries[0], false); assert.equal(draftSummaries.some(value => value.id === first.id), false);
  assert.equal((await f.vault.list()).length, 1);
  await f.vault.clearDraft(unsent.id, 1); assert.equal(await f.vault.readDraft(unsent.id), undefined);
  await assert.rejects(f.vault.delete(first.id, 1), errorCode("conflict"));
  const exportText = await f.vault.preparePlaintextExport([first.id]);
  assert.equal(JSON.parse(exportText).entries[0].body, updated.body);
  assert.equal(exportText.includes(unsent.body), false);
});

test("draft summary fetch cannot publish after an author lifetime is revoked", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  await f.vault.saveDraft({ title: "Fictional draft", body: "Separate unsent writing", expectedRevision: null, kind: "journal-editor", recipientCandidate: null, responsePreference: null });
  const started = deferred(), finish = deferred();
  f.setHook(async sql => { if (sql.startsWith("SELECT id,title,created_at,updated_at,revision,kind")) { started.resolve(); await finish.promise; } });
  const listing = f.vault.listDrafts({ kind: "journal-editor", title: "Fictional draft" }), denied = assert.rejects(listing, errorCode("locked")); await started.promise;
  const locking = f.vault.lock("account-change"); finish.resolve(); await Promise.all([denied, locking]);
});

test("filtered draft metadata finds an older conversation beyond 50 other drafts without crossing author or purpose", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  const title = `message-thread:${randomUUID()}`;
  f.ports.now = () => "2026-11-16T10:00:00.000Z";
  const old = await f.vault.saveDraft({ title, body: "Fictional old unsent body must stay private", expectedRevision: null, kind: "conversation", recipientCandidate: "fictional-peer", responsePreference: "listen" });
  f.ports.now = () => "2026-11-16T12:00:00.000Z";
  for (let i = 0; i < 60; i++) await f.vault.saveDraft({ title: `message-thread:${randomUUID()}`, body: "Fictional other-thread unsent body", expectedRevision: null, kind: "conversation", recipientCandidate: null, responsePreference: null });
  await f.vault.save({ title, body: "Fictional journal body must never enter a draft summary", expectedRevision: null });
  await f.vault.saveDraft({ title, body: "Fictional journal-editor draft body", expectedRevision: null, kind: "journal-editor", recipientCandidate: null, responsePreference: null });
  const recent = await f.vault.listDrafts(); assert.equal(recent.length, 50); assert.equal(recent.some(value => value.id === old.id), false);
  const filtered = await f.vault.listDrafts({ kind: "conversation", title });
  assert.deepEqual(filtered.map(value => value.id), [old.id]);
  assert.deepEqual(Object.keys(filtered[0]).sort(), ["createdAt", "id", "kind", "revision", "title", "updatedAt"]);
  assert.equal(JSON.stringify(filtered).includes("body"), false); assert.equal(JSON.stringify(filtered).includes("fictional-peer"), false);
  assert.equal((await f.vault.listDrafts({ title })).length, 2);
  await f.vault.lock("account-change"); await assert.rejects(f.vault.listDrafts({ kind: "conversation", title }), errorCode("locked"));
  await assert.rejects(f.vault.unlock(guardian), errorCode("identity-mismatch"));
  await assert.rejects(f.vault.listDrafts({ kind: "conversation", title }), errorCode("locked"));
  await f.vault.unlock(alice); assert.deepEqual((await f.vault.listDrafts({ kind: "conversation", title })).map(value => value.id), [old.id]);
});

test("draft filters reject malformed inputs and use copied exact parameter values including quotes and valid Unicode", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  const title = "Fictional 📘 thread' OR 1=1 --";
  const selected = await f.vault.saveDraft({ title, body: "Fictional selected unsent words", expectedRevision: null, kind: "conversation", recipientCandidate: null, responsePreference: null });
  await f.vault.saveDraft({ title: "Fictional other", body: "Fictional unrelated unsent words", expectedRevision: null, kind: "conversation", recipientCandidate: null, responsePreference: null });
  const filter = { kind: "conversation" as const, title }, pending = f.vault.listDrafts(filter); filter.title = "Changed after request";
  assert.deepEqual((await pending).map(value => value.id), [selected.id]);
  assert.equal(f.statements.some(sql => sql.includes(title)), false);
  const before = f.statements.filter(sql => sql.startsWith("SELECT id,title,created_at,updated_at,revision,kind")).length;
  for (const invalid of [null, [], "conversation", { kind: "journal" }, { kind: null }, { title: null }, { title: 1 }, { title: "x".repeat(151) }, { title: "\ud800" }, { title: "bad\udfff" }, { title: "a\u0000b" }, { body: "not-a-filter" }]) {
    await assert.rejects(f.vault.listDrafts(invalid as never), errorCode("invalid-input"));
  }
  assert.equal(f.statements.filter(sql => sql.startsWith("SELECT id,title,created_at,updated_at,revision,kind")).length, before);
  assert.equal((await f.vault.listDrafts({ kind: "conversation" })).length, 2);
  assert.deepEqual(await f.vault.listDrafts({ title: "" }), []);
});

test("storage failure after a mutation rolls back the actual SQLite transaction", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  const saved = await f.vault.save({ title: "Fictional", body: "Original", expectedRevision: null });
  f.options.failedSql = "UPDATE entries"; f.options.afterMutationFailure = true;
  await assert.rejects(f.vault.save({ ...saved, body: "Should roll back", expectedRevision: 1 }), errorCode("storage"));
  assert.ok(f.statements.includes("ROLLBACK"));
  f.options.failedSql = "";
  assert.deepEqual(await f.vault.read(saved.id), saved);
});

test("quota rejection does not evict pages or partially insert a new one", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  const seed = await f.vault.save({ title: "Fictional seed", body: "Preserved", expectedRevision: null });
  const journal = [...f.databases.values()].find(db => db.prepare("SELECT * FROM entries WHERE id=?").get(seed.id))!;
  const insert = journal.prepare("INSERT INTO entries(id,title,body,created_at,updated_at,revision) VALUES(?,?,?,?,?,1)");
  journal.exec("BEGIN");
  for (let index = 1; index < 1000; index++) insert.run(randomUUID(), "Fictional", "Quota fixture", seed.createdAt, seed.updatedAt);
  journal.exec("COMMIT");
  await assert.rejects(f.vault.save({ title: "Extra", body: "Must not evict", expectedRevision: null }), errorCode("quota"));
  assert.equal(journal.prepare("SELECT count(*) AS count FROM entries").get()?.count, 1000);
  assert.deepEqual(await f.vault.read(seed.id), seed);
});

test("background lock is an immediate barrier: awaited mutation rolls back and queued saves cannot start", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  const started = deferred(), finish = deferred();
  f.setHook(async sql => { if (sql.startsWith("INSERT INTO entries")) { started.resolve(); await finish.promise; } });
  const saving = f.vault.save({ title: "Fictional", body: "Never published", expectedRevision: null });
  const denied = assert.rejects(saving, errorCode("locked"));
  await started.promise;
  const queued = f.vault.save({ title: "Second", body: "Must not start", expectedRevision: null });
  const queuedDenied = assert.rejects(queued, errorCode("locked"));
  const locking = f.vault.lock("background");
  assert.equal(f.vault.touch(), false);
  finish.resolve(); await Promise.all([denied, queuedDenied, locking]); f.setHook(undefined);
  assert.equal(f.statements.filter(sql => sql.startsWith("INSERT INTO entries")).length, 1);
  await f.vault.unlock(alice); assert.deepEqual(await f.vault.list(), []);
});

test("stale unlock/read/export never publishes across session change; idle expires before touch", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  const saved = await f.vault.save({ title: "Fictional", body: "Only this author", expectedRevision: null });
  for (const operation of [() => f.vault.read(saved.id), () => f.vault.preparePlaintextExport([saved.id])]) {
    const started = deferred(), finish = deferred();
    f.setHook(async sql => { if (sql.startsWith("SELECT * FROM entries")) { started.resolve(); await finish.promise; } });
    const reading = operation(), denied = assert.rejects(reading, errorCode("locked")); await started.promise;
    const locking = f.vault.lock("revoked"); finish.resolve(); await Promise.all([denied, locking]);
    f.setHook(undefined); await f.vault.unlock(alice);
  }
  f.options.clock = 120_000; assert.equal(f.vault.touch(), false);
  await assert.rejects(f.vault.list(), errorCode("locked"));
});

test("a cancelled unlock closes its keyed connections and cannot activate a stale session", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.vault.enroll(alice);
  const started = deferred(), finish = deferred();
  f.setHook(async sql => { if (sql.startsWith("SELECT * FROM vault_meta")) { started.resolve(); await finish.promise; } });
  const unlocking = f.vault.unlock(alice), denied = assert.rejects(unlocking, errorCode("locked"));
  await started.promise;
  const locking = f.vault.lock("account-change"); finish.resolve(); await Promise.all([denied, locking]);
  assert.equal(f.vault.touch(), false); await assert.rejects(f.vault.list(), errorCode("locked"));
  f.setHook(undefined); await f.vault.unlock(alice);
});

test("explicit own-author authenticated erase is required before another enrollment", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  await f.vault.save({ title: "Fictional", body: "Removed only explicitly", expectedRevision: null });
  f.options.authentication = false;
  await assert.rejects(f.vault.erase(alice), errorCode("locked")); assert.equal(f.databases.size, 2);
  f.options.authentication = true; await f.vault.erase(alice);
  assert.equal(f.credentials.size, 0); assert.equal(f.databases.size, 0);
  await f.vault.enroll(guardian); await f.vault.unlock(guardian); assert.deepEqual(await f.vault.list(), []);
});

test("interrupted deletion remains locked and only the same author can explicitly finish it", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.ready();
  const remove = f.ports.files.remove; let interrupted = true;
  f.ports.files.remove = async name => { if (interrupted) { interrupted = false; throw new Error("Fictional storage interruption"); } await remove(name); };
  await assert.rejects(f.vault.erase(alice), errorCode("storage"));
  await assert.rejects(f.vault.unlock(alice), errorCode("recovery-required"));
  await assert.rejects(f.vault.erase(guardian), errorCode("identity-mismatch"));
  await f.vault.erase(alice); assert.equal(f.databases.size, 0); assert.equal(f.credentials.size, 0);
});

test("backup protection failure revokes access; aborting a session closes its lifetime", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.vault.enroll(alice);
  const signal = new AbortController(); await f.vault.unlock(alice, signal.signal);
  signal.abort(); assert.equal(f.vault.touch(), false);
  await f.vault.lock("manual"); await f.vault.unlock(alice);
  f.ports.protectFiles = async () => { throw new Error("Fictional backup exclusion failure"); };
  await assert.rejects(f.vault.save({ title: "Fictional", body: "Committed before policy failure", expectedRevision: null }), errorCode("storage"));
  assert.equal(f.vault.touch(), false); await assert.rejects(f.vault.list(), errorCode("locked"));
});

test("own biometric inactive state conceals but unlock publishes only after foreground resume", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.vault.enroll(alice);
  const started = deferred(), finish = deferred();
  f.ports.authenticate = async () => { f.visibility("inactive", true); started.resolve(); await finish.promise; return true; };
  const unlocking = f.vault.unlock(alice); await started.promise;
  assert.equal(f.vault.touch(), false); assert.equal(f.concealed.at(-1), true);
  f.visibility("active", true); finish.resolve(); await unlocking;
  assert.equal(f.vault.touch(), true); assert.equal(f.concealed.at(-1), false);
});

test("real background during an own biometric prompt invalidates even a later successful unlock", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.vault.enroll(alice);
  const started = deferred(), finish = deferred();
  f.ports.authenticate = async () => { f.visibility("inactive", true); started.resolve(); await finish.promise; return true; };
  const unlocking = f.vault.unlock(alice), denied = assert.rejects(unlocking, errorCode("locked")); await started.promise;
  f.visibility("background", true); f.visibility("active", true); finish.resolve(); await denied;
  assert.equal(f.vault.touch(), false); await assert.rejects(f.vault.list(), errorCode("locked"));
});

test("inactive success cannot activate a vault and ordinary interruptions retire an existing session", async t => {
  const f = fixture(); t.after(() => f.cleanup()); await f.vault.enroll(alice);
  f.ports.authenticate = async () => { f.visibility("inactive", true); return true; };
  await assert.rejects(f.vault.unlock(alice), errorCode("locked")); assert.equal(f.vault.touch(), false);
  f.visibility("active"); f.ports.authenticate = async () => true; await f.vault.unlock(alice);
  f.visibility("inactive", false); assert.equal(f.vault.touch(), false);
  f.visibility("active"); await assert.rejects(f.vault.list(), errorCode("locked"));
});

test("unsupported/web adapter never persists", async () => {
  const vault = createNativeVaultController();
  await assert.rejects(vault.enroll(alice), errorCode("unsupported"));
  await assert.rejects(vault.unlock(alice), errorCode("unsupported"));
  await vault.dispose();
});
