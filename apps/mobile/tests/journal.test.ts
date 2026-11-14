import assert from "node:assert/strict";
import test from "node:test";
import { hasUnsavedWriting, isSavedEntry } from "../src/journal";

const entry = {
  id: "child-page",
  title: "Fictional page",
  body: "Words kept in my own journal.",
};

test("a blank draft does not trigger a replacement warning or enable a reflection", () => {
  const blank = { id: "", title: "  ", body: "" };
  assert.equal(hasUnsavedWriting(blank, [entry]), false);
  assert.equal(isSavedEntry(blank, [entry]), false);
});

test("new writing and edits require saving before reflection and replacement", () => {
  for (const draft of [
    { ...entry, id: "" },
    { ...entry, title: "Changed title" },
    { ...entry, body: "Changed words" },
  ]) {
    assert.equal(hasUnsavedWriting(draft, [entry]), true);
    assert.equal(isSavedEntry(draft, [entry]), false);
  }
});

test("matching the current author entry marks it saved; another author list cannot", () => {
  assert.equal(isSavedEntry({ ...entry }, [entry]), true);
  assert.equal(hasUnsavedWriting({ ...entry }, [entry]), false);
  assert.equal(isSavedEntry(entry, [{ ...entry, id: "parent-page" }]), false);
  assert.equal(hasUnsavedWriting(entry, []), true);
});
