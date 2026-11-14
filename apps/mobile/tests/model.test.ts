import assert from "node:assert/strict";
import test from "node:test";
import { createMessage, seedContacts, updateContact } from "../src/model";
test("child cannot approve or remove; parent can manage without another admin", () => {
  assert.deepEqual(
    updateContact("child", seedContacts, "lee", "approved"),
    seedContacts,
  );
  assert.deepEqual(
    updateContact("child", seedContacts, "alex", "removed"),
    seedContacts,
  );
  const approved = updateContact(
    "parent",
    seedContacts,
    "lee",
    "approved",
  ).find((c) => c.id === "lee")!;
  assert.equal(approved.status, "approved");
  assert.equal(
    createMessage("child", approved, "hello", "Just listen"),
    undefined,
  );
});
test("rechecking a connection after review rejects blocked, removed and absent recipients", () => {
  for (const status of ["blocked", "removed"] as const) {
    const revoked = updateContact("parent", seedContacts, "alex", status).find(
      (c) => c.id === "alex",
    );
    assert.equal(
      createMessage("child", revoked, "Can we talk?", "Just listen"),
      undefined,
    );
  }
  assert.equal(
    createMessage("child", undefined, "hello", "Just listen"),
    undefined,
  );
  assert.equal(
    createMessage("child", seedContacts[0], "  ", "Just listen"),
    undefined,
  );
  assert.equal(
    createMessage("child", seedContacts[0], " hello ", "Just listen")?.text,
    "hello",
  );
});
