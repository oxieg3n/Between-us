import assert from "node:assert/strict";
import test from "node:test";
import {
  blockForAuthor,
  canExchange,
  canMessage,
  contactsForAuthor,
  emptyAuthorBlocks,
  type Contact,
  type ContactStatus,
} from "../src/communication";
import { seedContacts, updateContact } from "../src/model";

const alex = seedContacts.find((contact) => contact.id === "alex")!;
const sam = seedContacts.find((contact) => contact.id === "sam")!;
const teacher: Contact = {
  id: "fictional-safe-teacher",
  name: "Teacher Example",
  category: "School staff",
  status: "verified",
  accepted: true,
  verified: true,
};

test("either demo author's block immediately denies new messages in both directions", () => {
  const empty = emptyAuthorBlocks();
  assert.equal(canExchange("child", alex, empty), true);
  assert.equal(canExchange("parent", sam, empty), true);
  for (const [owner, contactId] of [
    ["child", "alex"],
    ["parent", "sam"],
  ] as const) {
    const blocks = blockForAuthor(empty, owner, contactId);
    assert.equal(canExchange("child", alex, blocks), false);
    assert.equal(canExchange("parent", sam, blocks), false);
    for (const role of ["child", "parent"] as const) {
      const peerId = role === "child" ? "alex" : "sam";
      const peer = contactsForAuthor(seedContacts, role, blocks).find(
        (contact) => contact.id === peerId,
      )!;
      assert.equal(canMessage(peer), false);
      assert.equal(peer.messagingBlocked, true);
      assert.equal(peer.status, role === owner ? "blocked" : "verified");
    }
  }
});

test("administrator approval and even reverified base data cannot override a child's block", () => {
  const blocks = blockForAuthor(emptyAuthorBlocks(), "child", "alex");
  const base = updateContact("parent", seedContacts, "alex", "approved").map(
    (contact) =>
      contact.id === "alex"
        ? { ...contact, status: "verified" as const, accepted: true, verified: true }
        : contact,
  );
  assert.equal(canMessage(base.find((contact) => contact.id === "alex")!), true);
  assert.equal(canExchange("child", base.find((contact) => contact.id === "alex"), blocks), false);
  assert.equal(canExchange("parent", base.find((contact) => contact.id === "sam"), blocks), false);
  assert.equal(
    contactsForAuthor(base, "child", blocks).find((contact) => contact.id === "alex")?.status,
    "blocked",
  );
  assert.deepEqual(blocks.child, ["alex"]);
});

test("a private third-person block stays author-scoped and leaves other safe contacts available", () => {
  const base = [...seedContacts, teacher];
  const blocks = blockForAuthor(emptyAuthorBlocks(), "child", teacher.id);
  const childTeacher = contactsForAuthor(base, "child", blocks).find((contact) => contact.id === teacher.id)!;
  const parentTeacher = contactsForAuthor(base, "parent", blocks).find((contact) => contact.id === teacher.id)!;
  assert.equal(childTeacher.status, "blocked");
  assert.equal(canMessage(childTeacher), false);
  assert.equal(parentTeacher, teacher);
  assert.equal(canExchange("parent", parentTeacher, blocks), true);
  assert.equal(canExchange("child", alex, blocks), true);
  const parentBlock = blockForAuthor(emptyAuthorBlocks(), "parent", "sam");
  assert.equal(canExchange("child", teacher, parentBlock), true);
  assert.equal(canExchange("parent", teacher, parentBlock), true);
  assert.equal(canMessage(contactsForAuthor(base, "child", parentBlock).find((contact) => contact.id === teacher.id)!), true);
});

test("author block updates are immutable, deduplicated and reject self or empty targets", () => {
  const empty = emptyAuthorBlocks();
  Object.freeze(empty.child);
  Object.freeze(empty.parent);
  Object.freeze(empty);
  const blocked = blockForAuthor(empty, "child", "alex");
  assert.deepEqual(empty, { child: [], parent: [] });
  assert.deepEqual(blocked.child, ["alex"]);
  assert.equal(blocked.parent, empty.parent);
  assert.equal(blockForAuthor(blocked, "child", "alex"), blocked);
  for (const [role, target] of [["child", "sam"], ["parent", "alex"], ["child", " "]] as const) {
    assert.throws(() => blockForAuthor(empty, role, target), /Choose another person/);
  }
  const fresh = emptyAuthorBlocks();
  assert.notEqual(fresh.child, empty.child);
  assert.notEqual(fresh.parent, empty.parent);
});

test("projection preserves base data and reverse blocking reveals no owner or private block list", () => {
  const base = Object.freeze(seedContacts.map((contact) => Object.freeze({ ...contact })));
  const blocks = blockForAuthor(emptyAuthorBlocks(), "child", "alex");
  const parentView = contactsForAuthor(base, "parent", blocks);
  const projectedSam = parentView.find((contact) => contact.id === "sam")!;
  assert.deepEqual(projectedSam, { ...sam, messagingBlocked: true });
  assert.equal(base.find((contact) => contact.id === "sam")?.messagingBlocked, undefined);
  assert.equal(parentView.find((contact) => contact.id === "lee"), base.find((contact) => contact.id === "lee"));
  assert.deepEqual(contactsForAuthor(parentView, "parent", blocks), parentView);
  assert.equal(JSON.stringify(parentView).includes("blockedBy"), false);
});

test("exchange gates retain acceptance, verification, status, self and projected-denial requirements", () => {
  const empty = emptyAuthorBlocks();
  assert.equal(canExchange("child", undefined, empty), false);
  assert.equal(canExchange("child", sam, empty), false);
  assert.equal(canExchange("parent", alex, empty), false);
  const statuses: ContactStatus[] = ["requested", "approved", "invited", "accepted", "blocked", "removed"];
  for (const status of statuses) assert.equal(canExchange("child", { ...alex, status }, empty), false);
  assert.equal(canExchange("child", { ...alex, accepted: false }, empty), false);
  assert.equal(canExchange("child", { ...alex, verified: false }, empty), false);
  assert.equal(canExchange("child", { ...alex, messagingBlocked: true }, empty), false);
  assert.equal(canMessage({ ...alex, messagingBlocked: true }), false);
});
