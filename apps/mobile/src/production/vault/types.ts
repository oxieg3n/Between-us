/** Only the authenticated session coordinator supplies this value; UI roles are never actors. */
export type VaultActor = Readonly<{ issuer: string; subject: string; sessionId: string }>;
export type VaultPurpose = "journal" | "drafts";
export type LockReason = "background" | "idle" | "manual" | "signout" | "account-change" | "revoked";
export type NativeVaultConfiguration = {
  /** Dedicated private durable directory; the callback must also reapply iOS attributes. */
  directory: string;
  protectAndVerifyDirectory: () => Promise<boolean>;
  /** Cover/clear sensitive UI and cancel model work synchronously when access is revoked. */
  onLock?: (reason: LockReason) => void;
  /** A transient privacy cover; false never unlocks the account or restores cleared content. */
  onConceal?: (covered: boolean) => void;
};
export type VaultErrorCode = "locked" | "cancelled" | "unsupported" | "identity-mismatch" | "key-unavailable" | "recovery-required" | "already-enrolled" | "corrupt" | "conflict" | "invalid-input" | "quota" | "storage";
export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode) { super(`Private storage: ${code}.`); this.name = "VaultError"; }
}
export type EntrySummary = { id: string; title: string; createdAt: string; updatedAt: string; revision: number };
export type VaultEntry = EntrySummary & { body: string };
export type SaveEntry = { id?: string; title: string; body: string; expectedRevision: number | null };
export type PrivateDraft = VaultEntry & { kind: "journal-editor" | "conversation"; recipientCandidate: string | null; responsePreference: string | null };
export type SaveDraft = SaveEntry & Pick<PrivateDraft, "kind" | "recipientCandidate" | "responsePreference">;
export type DraftFilter = { kind?: PrivateDraft["kind"]; title?: string };
export type SqlValue = string | number | null;
export interface VaultDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, params: readonly SqlValue[]): Promise<{ changes: number }>;
  first<T>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}
/** No logs, network, analytics, public files or fallback random source belong in these ports. */
export interface VaultPorts {
  supported(): Promise<boolean>;
  authenticate(): Promise<boolean>;
  randomBytes(count: number): Promise<Uint8Array>;
  uuid(): string;
  now(): string;
  monotonicNow(): number;
  credentials: {
    read(alias: string, authenticated: boolean): Promise<string | null>;
    write(alias: string, value: string, authenticated: boolean): Promise<void>;
    remove(alias: string, authenticated: boolean): Promise<void>;
  };
  files: {
    exists(name: string): Promise<boolean>;
    /** Only the dedicated, private vault directory; includes crash remnants/sidecars. */
    list(): Promise<string[]>;
    remove(name: string): Promise<void>;
  };
  open(name: string): Promise<VaultDatabase>;
  /** Reassert native backup attributes after file creation/replacement. Must fail closed. */
  protectFiles(): Promise<void>;
  onBackground?(handler: () => void): () => void;
  onVisibilityChange?(handler: (state: "active" | "inactive" | "background", ownAuthentication: boolean) => void): () => void;
  isActive?(): boolean;
  onConceal?(covered: boolean): void;
  onLock?(reason: LockReason): void;
}
export interface VaultController {
  enroll(actor: VaultActor, signal?: AbortSignal): Promise<void>;
  unlock(actor: VaultActor, signal?: AbortSignal): Promise<void>;
  lock(reason: LockReason): Promise<void>;
  touch(): boolean;
  list(input?: { limit?: number; before?: { updatedAt: string; id: string } }): Promise<EntrySummary[]>;
  read(id: string): Promise<VaultEntry | undefined>;
  save(input: SaveEntry): Promise<VaultEntry>;
  delete(id: string, expectedRevision: number): Promise<void>;
  readDraft(id: string): Promise<PrivateDraft | undefined>;
  listDrafts(filter?: DraftFilter): Promise<(EntrySummary & { kind: PrivateDraft["kind"] })[]>;
  saveDraft(input: SaveDraft): Promise<PrivateDraft>;
  clearDraft(id: string, expectedRevision: number): Promise<void>;
  preparePlaintextExport(ids: readonly string[]): Promise<string>;
  erase(actor: VaultActor, signal?: AbortSignal): Promise<void>;
  dispose(): Promise<void>;
}
