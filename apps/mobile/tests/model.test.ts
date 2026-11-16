import assert from "node:assert/strict";
import test from "node:test";
import { createMessage, seedContacts, updateContact } from "../src/model";
import { blockForAuthor, emptyAuthorBlocks, type Contact } from "../src/communication";

const noBlocks = emptyAuthorBlocks();
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
    createMessage("child", approved, "hello", "Just listen", noBlocks),
    undefined,
  );
});
test("rechecking a connection after review rejects blocked, removed and absent recipients", () => {
  for (const status of ["blocked", "removed"] as const) {
    const revoked = updateContact("parent", seedContacts, "alex", status).find(
      (c) => c.id === "alex",
    );
    assert.equal(
      createMessage("child", revoked, "Can we talk?", "Just listen", noBlocks),
      undefined,
    );
  }
  assert.equal(
    createMessage("child", undefined, "hello", "Just listen", noBlocks),
    undefined,
  );
  assert.equal(
    createMessage("child", seedContacts[0], "  ", "Just listen", noBlocks),
    undefined,
  );
  assert.equal(
    createMessage("child", seedContacts[0], " hello ", "Just listen", noBlocks)?.text,
    "hello",
  );
});

test("final message creation rechecks either author's block against stale verified recipients", () => {
  const alex = seedContacts.find((contact) => contact.id === "alex")!;
  const sam = seedContacts.find((contact) => contact.id === "sam")!;
  assert.ok(createMessage("child", alex, "Fictional hello", "Just listen", noBlocks));
  assert.ok(createMessage("parent", sam, "Fictional hello", "Just listen", noBlocks));
  for (const [owner, blockedId] of [["child", "alex"], ["parent", "sam"]] as const) {
    const blocks = blockForAuthor(noBlocks, owner, blockedId);
    // These recipient references predate the block and still carry verified flags.
    assert.equal(alex.status, "verified");
    assert.equal(sam.status, "verified");
    assert.equal(createMessage("child", alex, "Fictional stale draft", "Just listen", blocks), undefined);
    assert.equal(createMessage("parent", sam, "Fictional stale reply", "Just listen", blocks), undefined);
  }
});

test("parent base approval and reverification cannot erase independent child-owned blocking", () => {
  const baseBefore = structuredClone(seedContacts);
  const blocks = blockForAuthor(noBlocks, "child", "alex");
  const approved = updateContact("parent", seedContacts, "alex", "approved");
  assert.deepEqual(seedContacts, baseBefore);
  const reverified = approved.map((contact) => contact.id === "alex"
    ? { ...contact, status: "verified" as const, accepted: true, verified: true }
    : contact);
  assert.equal(createMessage("parent", reverified.find((contact) => contact.id === "sam"), "Fictional incoming", "Just listen", blocks), undefined);
  assert.equal(createMessage("child", reverified.find((contact) => contact.id === "alex"), "Fictional outgoing", "Just listen", blocks), undefined);
  assert.deepEqual(blocks.child, ["alex"]);
  assert.deepEqual(noBlocks.child, []);
});

test("the final factory rejects self and projected blocks while unrelated safe recipients remain available", () => {
  const alex = seedContacts.find((contact) => contact.id === "alex")!;
  const sam = seedContacts.find((contact) => contact.id === "sam")!;
  const unrelated: Contact = { ...alex, id: "fictional-safe-mentor", name: "Mentor Example" };
  const blocks = blockForAuthor(noBlocks, "parent", "sam");
  assert.equal(createMessage("child", sam, "Fictional self", "Just listen", noBlocks), undefined);
  assert.equal(createMessage("parent", alex, "Fictional self", "Just listen", noBlocks), undefined);
  assert.equal(createMessage("child", { ...alex, messagingBlocked: true }, "Fictional unavailable", "Just listen", noBlocks), undefined);
  assert.ok(createMessage("child", unrelated, "Fictional other adult", "Just listen", blocks));
  assert.ok(createMessage("parent", unrelated, "Fictional other adult", "Just listen", blocks));
});
