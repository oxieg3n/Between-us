import type { Entry } from "./model";

export function isSavedEntry(draft: Entry, entries: Entry[]) {
  return (
    !!draft.id &&
    entries.some(
      (entry) =>
        entry.id === draft.id &&
        entry.title === draft.title &&
        entry.body === draft.body,
    )
  );
}

export function hasUnsavedWriting(draft: Entry, entries: Entry[]) {
  return (
    !!(draft.title.trim() || draft.body.trim()) && !isSavedEntry(draft, entries)
  );
}
