import { generateConversation, type JournalRequest, type LocalModelAdapter, type SuggestionResult } from "../journal-intelligence";

export type JournalModelRuntime = {
  status(): { available: boolean; ready: boolean; message: string };
  adapter(): LocalModelAdapter | undefined;
  download(): Promise<void>;
  load(): Promise<void>;
  unload(): Promise<void>;
};
/** Reuses the existing pinned r12 runtime; this controller never opens a file or sends a prompt. */
export function createJournalModelController(runtime: JournalModelRuntime, authorVersion: () => string | undefined) {
  let enabled = false, version = 0, lifecycle = 0, active: AbortController | undefined;
  function cancelSuggestion() { version++; active?.abort(); active = undefined; }
  const state = () => ({ ...runtime.status(), enabled });
  function invalidate() { lifecycle++; enabled = false; cancelSuggestion(); return runtime.unload(); }
  return {
    state,
    cancelSuggestion,
    invalidate,
    async setup(kind: "download" | "load") {
      cancelSuggestion(); enabled = false;
      const selected = ++lifecycle, author = authorVersion();
      if (!author) return false;
      try { await (kind === "download" ? runtime.download() : runtime.load()); }
      catch { return false; }
      if (selected !== lifecycle) return false;
      if (authorVersion() !== author) { await invalidate().catch(() => undefined); return false; }
      return runtime.status().ready;
    },
    async useModel(value: boolean) {
      if (!value) { await invalidate().catch(() => undefined); return false; }
      if (!authorVersion() || !runtime.status().ready) return false;
      enabled = true; return true;
    },
    async suggest(request: JournalRequest): Promise<SuggestionResult | undefined> {
      cancelSuggestion(); const selected = version, author = authorVersion();
      if (!author) return undefined;
      const controller = new AbortController(); active = controller;
      try {
        const value = await generateConversation(request, enabled ? runtime.adapter() : undefined, controller.signal);
        return selected === version && authorVersion() === author && !controller.signal.aborted ? value : undefined;
      } finally { if (active === controller) active = undefined; }
    },
  };
}
export type JournalModelController = ReturnType<typeof createJournalModelController>;
