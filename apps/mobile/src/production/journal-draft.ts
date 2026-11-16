import type { PrivateDraft, SaveDraft } from "./vault";

type Writing = { title: string; body: string };
export type JournalDraftStatus = "clean" | "pending" | "saving" | "protected" | "error";
type Slot = { stamp: string; target: Writing; confirmed: Writing; draft?: PrivateDraft; failed: boolean; running?: Promise<boolean> };
const equal = (a: Writing, b: Writing) => a.title === b.title && a.body === b.body;

/** Only the existing unlocked vault may persist writing. No network, key access or idle touch. */
export function createJournalDraftProtection(ports: {
  authorized(stamp: string): boolean;
  save(input: SaveDraft): Promise<PrivateDraft>;
  changed(value: { stamp: string; status: JournalDraftStatus; draft?: PrivateDraft }): void;
  delay?(work: () => void, milliseconds: number): () => void;
}) {
  let slot: Slot | undefined, paused = false, cancelTimer: (() => void) | undefined;
  const clearTimer = () => { cancelTimer?.(); cancelTimer = undefined; };
  const delay = ports.delay ?? ((work, milliseconds) => { const timer = setTimeout(work, milliseconds); return () => clearTimeout(timer); });
  function publish(selected: Slot) {
    if (slot !== selected || paused || !ports.authorized(selected.stamp)) return;
    const status: JournalDraftStatus = selected.running ? "saving" : selected.failed ? "error" : !equal(selected.target, selected.confirmed) ? "pending" : selected.draft ? "protected" : "clean";
    try { ports.changed({ stamp: selected.stamp, status, draft: selected.draft }); } catch { /* UI failure cannot change a storage confirmation. */ }
  }
  function schedule(selected: Slot) {
    clearTimer();
    if (slot !== selected || paused || selected.failed || equal(selected.target, selected.confirmed) || !ports.authorized(selected.stamp)) return;
    cancelTimer = delay(() => { cancelTimer = undefined; void saveOnce(selected); }, 1000);
  }
  function saveOnce(selected: Slot, force = false): Promise<boolean> {
    if (slot !== selected || paused || !ports.authorized(selected.stamp)) return Promise.resolve(false);
    if (selected.running) return selected.running;
    if (equal(selected.target, selected.confirmed) && (!force || selected.draft)) return Promise.resolve(true);
    const snapshot = { ...selected.target };
    const work = (async () => {
      try {
        await Promise.resolve();
        if (slot !== selected || paused || !ports.authorized(selected.stamp)) return false;
        const saved = await ports.save({ ...snapshot, id: selected.draft?.id, expectedRevision: selected.draft?.revision ?? null, kind: "journal-editor", recipientCandidate: null, responsePreference: null });
        if (slot !== selected) return false;
        // Keep a confirmed revision through a temporary cover, but never publish while covered.
        selected.draft = saved; selected.confirmed = snapshot; selected.failed = false;
        return true;
      } catch { if (slot === selected) selected.failed = true; return false; }
      finally {
        if (slot === selected) { selected.running = undefined; publish(selected); schedule(selected); }
      }
    })();
    selected.running = work; publish(selected); return work;
  }
  return {
    open(stamp: string, writing: Writing, draft?: PrivateDraft) {
      clearTimer(); paused = false;
      slot = { stamp, target: { ...writing }, confirmed: { ...writing }, draft, failed: false };
      publish(slot);
    },
    update(writing: Writing) {
      if (!slot || equal(slot.target, writing)) return;
      slot.target = { ...writing }; slot.failed = false; publish(slot); schedule(slot);
    },
    suspend() { paused = true; clearTimer(); },
    resume() { paused = false; if (slot) { publish(slot); schedule(slot); } },
    cancel() { clearTimer(); slot = undefined; paused = false; },
    async drain() { const selected = slot; await selected?.running; },
    draft() { return slot?.draft; },
    async flush(force = false) {
      clearTimer(); const selected = slot;
      if (!selected) return true;
      do {
        if (!await saveOnce(selected, force)) return false;
        force = false;
      } while (slot === selected && !equal(selected.target, selected.confirmed));
      clearTimer();
      return slot === selected && !paused && ports.authorized(selected.stamp);
    },
  };
}
export type JournalDraftProtection = ReturnType<typeof createJournalDraftProtection>;
