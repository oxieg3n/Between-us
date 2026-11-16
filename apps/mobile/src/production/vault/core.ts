import { VaultError, type VaultActor, type VaultController, type VaultDatabase, type VaultEntry, type PrivateDraft, type SaveDraft, type SaveEntry, type SqlValue, type VaultPorts, type VaultPurpose } from "./types";

const manifestAlias = "between-us.vault.enrollment.v1";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxEntries = 1000, maxBytes = 16 * 1024 * 1024, idleMs = 120_000;
type Store = { id: string; name: string; key: string };
type Enrollment = { version: 1; state: "creating" | "ready" | "deleting"; issuer: string; subject: string; journal: Store; drafts: Store };
type Life = { epoch: number; signal?: AbortSignal };
type Session = { actor: VaultActor; journal: VaultDatabase; drafts: VaultDatabase; life: Life; touched: number };
type EntryRow = { id: string; title: string; body: string; created_at: string; updated_at: string; revision: number; kind?: PrivateDraft["kind"]; recipient_candidate?: string | null; response_preference?: string | null };
const schema = `CREATE TABLE vault_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), vault_id TEXT NOT NULL, issuer TEXT NOT NULL, subject TEXT NOT NULL, purpose TEXT NOT NULL, schema_version INTEGER NOT NULL);
CREATE TABLE entries (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK(length(title)<=150), body TEXT NOT NULL CHECK(length(body)<=5000), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>=1), kind TEXT, recipient_candidate TEXT, response_preference TEXT);
CREATE INDEX entries_recent ON entries(updated_at DESC,id DESC);`;
function fail(code: ConstructorParameters<typeof VaultError>[0]): never { throw new VaultError(code); }
function actorValid(actor: VaultActor) { return actor && [actor.issuer, actor.subject, actor.sessionId].every(value => typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f]/u.test(value)); }
function sameAuthor(a: VaultActor, b: Enrollment) { return a.issuer === b.issuer && a.subject === b.subject; }
function validId(id: unknown): id is string { return typeof id === "string" && uuidPattern.test(id); }
function revisionValid(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 1; }
function storeValid(value: Store) { return value && validId(value.id) && value.name === `${value.id}.db` && value.key === `between-us.vault.key.${value.id}`; }
function parseManifest(raw: string): Enrollment {
  try {
    const value = JSON.parse(raw) as Enrollment;
    if (value.version !== 1 || !["creating", "ready", "deleting"].includes(value.state) || !actorValid({ issuer: value.issuer, subject: value.subject, sessionId: "validation" }) || !storeValid(value.journal) || !storeValid(value.drafts) || value.journal.id === value.drafts.id) fail("corrupt");
    return value;
  } catch { return fail("corrupt"); }
}
function entry(row: EntryRow): VaultEntry { return { id: row.id, title: row.title, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision }; }
function draft(row: EntryRow): PrivateDraft { return { ...entry(row), kind: row.kind!, recipientCandidate: row.recipient_candidate ?? null, responsePreference: row.response_preference ?? null }; }
function utf8Bytes(text: string) {
  let bytes = 0;
  for (const character of text) { const point = character.codePointAt(0)!; bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4; }
  return bytes;
}
function validateSave(input: SaveEntry, isDraft: boolean) {
  if (!input || typeof input.title !== "string" || typeof input.body !== "string" || input.title.length > 150 || input.body.length > 5000 || (!isDraft && !input.body.trim()) || /\u0000/u.test(input.title + input.body)) fail("invalid-input");
  if (input.id === undefined ? input.expectedRevision !== null : !validId(input.id) || !revisionValid(input.expectedRevision)) fail("invalid-input");
  // Reject unpaired surrogates rather than silently replacing the author's words in SQLite.
  if (/[\ud800-\udfff]/u.test(input.title + input.body)) fail("invalid-input");
  if (isDraft) {
    const value = input as SaveDraft;
    if (!["journal-editor", "conversation"].includes(value.kind) || ![value.recipientCandidate, value.responsePreference].every(item => item === null || typeof item === "string" && item.length <= 512 && !/[\u0000-\u001f]/u.test(item))) fail("invalid-input");
    if (value.kind === "journal-editor" && (value.recipientCandidate !== null || value.responsePreference !== null)) fail("invalid-input");
  }
}

/** Single writer, one author per installation. The caller supplies validated account state. */
export function createVaultController(ports: VaultPorts): VaultController {
  let epoch = 0, active: Session | undefined, closed = false;
  let connections: VaultDatabase[] = [];
  let queue: Promise<void> = Promise.resolve();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let detachAbort: (() => void) | undefined;
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work).catch(error => { if (error instanceof VaultError) throw error; throw new VaultError("storage"); });
    queue = result.then(() => undefined, () => undefined);
    return result;
  }
  function guard(life: Life) {
    if (life.signal?.aborted) fail("cancelled");
    if (closed || life.epoch !== epoch) fail("locked");
    if (active && ports.monotonicNow() - active.touched >= idleMs) { void lock("idle").catch(() => undefined); fail("locked"); }
  }
  async function step<T>(promise: Promise<T>, life: Life): Promise<T> { const value = await promise; guard(life); return value; }
  async function closeAll() {
    const selected = connections; connections = [];
    let failed = false;
    for (const db of selected) { try { await db.close(); } catch { failed = true; connections.push(db); } }
    if (failed) fail("storage");
  }
  function lock(_reason: Parameters<VaultController["lock"]>[0]) {
    epoch += 1; active = undefined;
    clearTimeout(idleTimer); idleTimer = undefined; detachAbort?.(); detachAbort = undefined;
    try { ports.onLock?.(_reason); } catch { /* A UI callback cannot preserve a revoked capability. */ }
    return enqueue(closeAll);
  }
  function armIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(() => { void lock("idle").catch(() => undefined); }, idleMs); }
  async function protect(life: Life) {
    try { await step(ports.protectFiles(), life); }
    catch (error) { if (epoch === life.epoch) void lock("manual").catch(() => undefined); throw error; }
  }
  async function available(life: Life) { if (!await step(ports.supported(), life)) fail("unsupported"); }
  async function manifest(life: Life) { const raw = await step(ports.credentials.read(manifestAlias, false), life); return raw === null ? undefined : parseManifest(raw); }
  async function authorize(actor: VaultActor, life: Life) {
    if (!actorValid(actor)) fail("invalid-input");
    await available(life);
    const record = await manifest(life);
    if (!record) fail("key-unavailable");
    if (!sameAuthor(actor, record)) fail("identity-mismatch");
    return record;
  }
  async function authenticate(life: Life) { if (!await step(ports.authenticate(), life)) fail("locked"); }
  function requireForeground(life: Life) { guard(life); if (ports.isActive && !ports.isActive()) fail("locked"); }
  async function transaction<T>(db: VaultDatabase, life: Life, work: () => Promise<T>) {
    let began = false, committed = false;
    try {
      // Mark before awaiting: a lock racing BEGIN still requires rollback.
      const beginning = db.exec("BEGIN IMMEDIATE"); began = true;
      await step(beginning, life);
      const value = await work(); guard(life);
      await db.exec("COMMIT"); committed = true; guard(life);
      await protect(life);
      return value;
    } catch (error) {
      if (began && !committed) { try { await db.exec("ROLLBACK"); } catch { void lock("manual").catch(() => undefined); } }
      throw error;
    }
  }
  async function openStore(record: Enrollment, purpose: VaultPurpose, key: string, life: Life, creating: boolean) {
    if (!/^[0-9a-f]{64}$/u.test(key)) fail("key-unavailable");
    const store = record[purpose];
    const db = await ports.open(store.name); connections.push(db); guard(life);
    const cipher = await step(db.first<{ cipher_version: string }>("PRAGMA cipher_version"), life);
    if (!cipher || typeof cipher.cipher_version !== "string" || !cipher.cipher_version.trim()) fail("unsupported");
    await step(db.exec(`PRAGMA key = "x'${key}'"`), life);
    await step(db.first("SELECT count(*) AS count FROM sqlite_master"), life);
    await step(db.exec("PRAGMA cipher_memory_security = ON; PRAGMA temp_store = MEMORY; PRAGMA secure_delete = ON; PRAGMA journal_mode = DELETE;"), life);
    if (creating) {
      await transaction(db, life, async () => {
        await step(db.exec(schema), life);
        await step(db.run("INSERT INTO vault_meta(singleton,vault_id,issuer,subject,purpose,schema_version) VALUES(1,?,?,?,?,1)", [store.id, record.issuer, record.subject, purpose]), life);
      });
    } else {
      const meta = await step(db.first<{ vault_id: string; issuer: string; subject: string; purpose: string; schema_version: number }>("SELECT * FROM vault_meta WHERE singleton=1"), life);
      if (!meta || meta.vault_id !== store.id || meta.issuer !== record.issuer || meta.subject !== record.subject || meta.purpose !== purpose || meta.schema_version !== 1) fail("identity-mismatch");
      const integrity = await step(db.first<{ integrity_check: string }>("PRAGMA integrity_check"), life);
      if (integrity?.integrity_check !== "ok") fail("corrupt");
      const cipherIntegrity = await step(db.all("PRAGMA cipher_integrity_check"), life);
      if (cipherIntegrity.length) fail("corrupt");
    }
    await protect(life);
    return db;
  }
  function run<T>(work: (session: Session) => Promise<T>) {
    const session = active;
    return enqueue(async () => { if (!session || active !== session) fail("locked"); requireForeground(session.life); const value = await work(session); requireForeground(session.life); return value; });
  }
  async function saveRow(session: Session, input: SaveEntry | SaveDraft, isDraft: boolean) {
    validateSave(input, isDraft);
    const db = isDraft ? session.drafts : session.journal, life = session.life;
    return transaction(db, life, async () => {
      const id = input.id ?? ports.uuid(); if (!validId(id)) fail("storage");
      const old = input.id ? await step(db.first<EntryRow>("SELECT * FROM entries WHERE id=?", [id]), life) : undefined;
      if (input.id && (!old || old.revision !== input.expectedRevision)) fail("conflict");
      const totals = await step(db.first<{ count: number; bytes: number }>("SELECT count(*) AS count, coalesce(sum(length(CAST(title AS BLOB))+length(CAST(body AS BLOB))),0) AS bytes FROM entries"), life);
      const bytes = utf8Bytes(input.title + input.body);
      const previousBytes = old ? utf8Bytes(old.title + old.body) : 0;
      if (!totals || totals.count + (old ? 0 : 1) > maxEntries || totals.bytes - previousBytes + bytes > maxBytes) fail("quota");
      const now = ports.now(), nextRevision = old ? old.revision + 1 : 1;
      if (!Number.isSafeInteger(nextRevision)) fail("conflict");
      const details = isDraft ? input as SaveDraft : undefined;
      if (old) {
        const changed = await step(db.run("UPDATE entries SET title=?,body=?,updated_at=?,revision=?,kind=?,recipient_candidate=?,response_preference=? WHERE id=? AND revision=?", [input.title, input.body, now, nextRevision, details?.kind ?? null, details?.recipientCandidate ?? null, details?.responsePreference ?? null, id, input.expectedRevision]), life);
        if (changed.changes !== 1) fail("conflict");
      } else await step(db.run("INSERT INTO entries(id,title,body,created_at,updated_at,revision,kind,recipient_candidate,response_preference) VALUES(?,?,?,?,?,?,?,?,?)", [id, input.title, input.body, now, now, 1, details?.kind ?? null, details?.recipientCandidate ?? null, details?.responsePreference ?? null]), life);
      const result = await step(db.first<EntryRow>("SELECT * FROM entries WHERE id=?", [id]), life);
      if (!result) fail("storage");
      return result;
    });
  }
  async function removeRow(session: Session, id: string, expectedRevision: number, isDraft: boolean) {
    if (!validId(id) || !revisionValid(expectedRevision)) fail("invalid-input");
    const db = isDraft ? session.drafts : session.journal;
    await transaction(db, session.life, async () => {
      const result = await step(db.run("DELETE FROM entries WHERE id=? AND revision=?", [id, expectedRevision]), session.life);
      if (result.changes !== 1) fail("conflict");
    });
  }
  const unsubscribe = ports.onVisibilityChange
    ? ports.onVisibilityChange((state, ownAuthentication) => {
      try { ports.onConceal?.(state !== "active"); } catch { void lock("background").catch(() => undefined); return; }
      // OS biometric dialogs may be inactive; actual background always retires the lifetime.
      if (state === "background" || state === "inactive" && !ownAuthentication) void lock("background").catch(() => undefined);
    })
    : ports.onBackground?.(() => { void lock("background").catch(() => undefined); });
  const controller: VaultController = {
    enroll(actor, signal) {
      const life = { epoch, signal }, author = { ...actor };
      return enqueue(async () => {
        guard(life); if (!actorValid(author)) fail("invalid-input"); await available(life);
        if (connections.length) fail("locked");
        const previous = await manifest(life);
        if (previous) fail(sameAuthor(author, previous) ? previous.state === "ready" ? "already-enrolled" : "recovery-required" : "identity-mismatch");
        if ((await step(ports.files.list(), life)).length) fail("recovery-required");
        await authenticate(life);
        const makeStore = (): Store => { const id = ports.uuid(); if (!validId(id)) fail("storage"); return { id, name: `${id}.db`, key: `between-us.vault.key.${id}` }; };
        const record: Enrollment = { version: 1, state: "creating", issuer: author.issuer, subject: author.subject, journal: makeStore(), drafts: makeStore() };
        if (record.journal.id === record.drafts.id) fail("storage");
        await step(ports.credentials.write(manifestAlias, JSON.stringify(record), false), life);
        try {
          for (const purpose of ["journal", "drafts"] as const) {
            const bytes = await step(ports.randomBytes(32), life);
            if (!(bytes instanceof Uint8Array) || bytes.length !== 32) fail("storage");
            let key = "";
            try { key = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join(""); }
            finally { bytes.fill(0); }
            await step(ports.credentials.write(record[purpose].key, key, true), life);
            const verified = await step(ports.credentials.read(record[purpose].key, true), life);
            if (verified !== key) fail("key-unavailable");
            await openStore(record, purpose, key, life, true);
          }
          requireForeground(life); record.state = "ready";
          await step(ports.credentials.write(manifestAlias, JSON.stringify(record), false), life);
        } finally { await closeAll(); }
      });
    },
    unlock(actor, signal) {
      const life = { epoch, signal }, author = { ...actor };
      return enqueue(async () => {
        guard(life); if (active || connections.length) fail("locked");
        const record = await authorize(author, life);
        if (record.state !== "ready") fail("recovery-required");
        await authenticate(life);
        try {
          const opened: Partial<Record<VaultPurpose, VaultDatabase>> = {};
          for (const purpose of ["journal", "drafts"] as const) {
            if (!await step(ports.files.exists(record[purpose].name), life)) fail("recovery-required");
            const key = await step(ports.credentials.read(record[purpose].key, true), life);
            if (key === null) fail("key-unavailable");
            opened[purpose] = await openStore(record, purpose, key, life, false);
          }
          requireForeground(life); active = { actor: author, journal: opened.journal!, drafts: opened.drafts!, life, touched: ports.monotonicNow() };
          armIdle();
          if (signal) { const abort = () => { void lock("manual").catch(() => undefined); }; signal.addEventListener("abort", abort, { once: true }); detachAbort = () => signal.removeEventListener("abort", abort); }
        } catch (error) { await closeAll(); throw error; }
      });
    },
    lock,
    touch() { if (!active) return false; try { guard(active.life); active.touched = ports.monotonicNow(); armIdle(); return true; } catch { return false; } },
    list(input = {}) { return run(async session => {
      const limit = input.limit ?? 50, before = input.before;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || before && (!validId(before.id) || typeof before.updatedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(before.updatedAt))) fail("invalid-input");
      const rows = await step(session.journal.all<EntryRow>(`SELECT id,title,created_at,updated_at,revision FROM entries ${before ? "WHERE updated_at < ? OR (updated_at = ? AND id < ?)" : ""} ORDER BY updated_at DESC,id DESC LIMIT ?`, before ? [before.updatedAt, before.updatedAt, before.id, limit] : [limit]), session.life);
      return rows.map(row => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision }));
    }); },
    read(id) { return run(async session => { if (!validId(id)) fail("invalid-input"); const row = await step(session.journal.first<EntryRow>("SELECT * FROM entries WHERE id=?", [id]), session.life); return row ? entry(row) : undefined; }); },
    save(input) { const copy = { ...input }; return run(async session => entry(await saveRow(session, copy, false))); },
    delete(id, revision) { return run(session => removeRow(session, id, revision, false)); },
    readDraft(id) { return run(async session => { if (!validId(id)) fail("invalid-input"); const row = await step(session.drafts.first<EntryRow>("SELECT * FROM entries WHERE id=?", [id]), session.life); return row ? draft(row) : undefined; }); },
    listDrafts(filter) {
      const validShape = filter === undefined || filter !== null && typeof filter === "object" && !Array.isArray(filter);
      const copy = { ...filter };
      return run(async session => {
      if (!validShape || Object.keys(copy).some(key => !["kind", "title"].includes(key)) || copy.kind !== undefined && !["journal-editor", "conversation"].includes(copy.kind)
        || copy.title !== undefined && (typeof copy.title !== "string" || copy.title.length > 150 || /[\u0000\ud800-\udfff]/u.test(copy.title))) fail("invalid-input");
      const where: string[] = [], params: SqlValue[] = [];
      if (copy.kind !== undefined) { where.push("kind=?"); params.push(copy.kind); }
      if (copy.title !== undefined) { where.push("title=?"); params.push(copy.title); }
      const rows = await step(session.drafts.all<EntryRow>(`SELECT id,title,created_at,updated_at,revision,kind FROM entries${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC,id DESC LIMIT 50`, params), session.life);
      return rows.map(row => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision, kind: row.kind! }));
    }); },
    saveDraft(input) { const copy = { ...input }; return run(async session => draft(await saveRow(session, copy, true))); },
    clearDraft(id, revision) { return run(session => removeRow(session, id, revision, true)); },
    preparePlaintextExport(ids) { const selected = [...ids]; return run(async session => {
      if (!selected.length || selected.length > maxEntries || new Set(selected).size !== selected.length || !selected.every(validId)) fail("invalid-input");
      await authenticate(session.life);
      const values: VaultEntry[] = [];
      for (const id of selected) { const row = await step(session.journal.first<EntryRow>("SELECT * FROM entries WHERE id=?", [id]), session.life); if (!row) fail("conflict"); values.push(entry(row)); }
      guard(session.life); return JSON.stringify({ format: "between-us-plaintext-journal", version: 1, entries: values });
    }); },
    erase(actor, signal) {
      // Revoke immediately; queued operations cannot begin while erase awaits device auth.
      epoch += 1; active = undefined;
      clearTimeout(idleTimer); idleTimer = undefined; detachAbort?.(); detachAbort = undefined;
      try { ports.onLock?.("manual"); } catch { /* Deletion keeps access revoked if UI cleanup fails. */ }
      const life = { epoch, signal }, author = { ...actor };
      return enqueue(async () => {
        guard(life); await closeAll(); const record = await authorize(author, life); await authenticate(life);
        record.state = "deleting";
        await step(ports.credentials.write(manifestAlias, JSON.stringify(record), false), life);
        for (const store of [record.journal, record.drafts]) {
          await step(ports.credentials.remove(store.key, true), life);
          for (const suffix of ["", "-journal", "-wal", "-shm"]) await step(ports.files.remove(store.name + suffix), life);
        }
        await step(ports.credentials.remove(manifestAlias, false), life);
      });
    },
    async dispose() { closed = true; unsubscribe?.(); await lock("manual"); },
  };
  return controller;
}
