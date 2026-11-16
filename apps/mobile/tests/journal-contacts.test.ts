import assert from "node:assert/strict";
import test from "node:test";
import { journalContacts, safePreparedContacts, type AuthorizedJournalContact } from "../src/production/journal-contacts";
import { recipientBoundaries } from "../src/journal-intelligence";

function contact(id: string, name: string, category: AuthorizedJournalContact["peerCategory"] = "trusted-person"): AuthorizedJournalContact {
  return { id: `relationship-${id}`, familyId: "fictional-family", a: "own-author", b: id, aName: "Own author", bName: name,
    acceptedByMe: true, bothAccepted: true, approvalA: true, approvalB: true, verified: true, external: true,
    managedChildId: null, managedChildName: null, revoked: false, canExchange: true, peerCategory: category };
}
const rows = [contact("alex", "Alex - parent", "parent"), contact("john", "Teacher John"), contact("robin", "Robin"), contact("sam", "Sam", "child")];
const none = { excludedContactIds: [], excludedCategories: [] };

test("accepted external contacts retain peer Auth identities and remain available without unsafe restrictions", () => {
  assert.deepEqual(journalContacts(rows, "own-author").map(row => row.id), ["alex", "john", "robin", "sam"]);
  assert.equal(safePreparedContacts(rows, "own-author", none).length, 4);
  assert.equal(journalContacts([{ ...rows[0], a: "another-author" }], "own-author").length, 0);
  assert.equal(journalContacts([{ ...rows[0], bothAccepted: false, bName: null }], "own-author").length, 0);
});

test("named unsafe people are excluded by current authorized name metadata, including guardians", () => {
  const contacts = journalContacts(rows, "own-author");
  const bounds = recipientBoundaries({ text: "Alex threatened me. John is hurting me.", role: "child", contacts });
  assert.ok(bounds.excludedContactIds.includes("alex")); assert.ok(bounds.excludedContactIds.includes("john"));
  assert.deepEqual(safePreparedContacts(rows, "own-author", bounds).map(row => row.b), ["robin", "sam"]);
  assert.equal(safePreparedContacts(rows, "own-author", { ...none, text: "Robin isn't safe." }).some(row => row.b === "robin"), false);
});

test("any unsafe category denies unknown categories; both relationship and peer IDs plus current denial win", () => {
  assert.deepEqual(safePreparedContacts(rows, "own-author", { ...none, excludedCategories: ["parent"] }).map(row => row.b), ["sam"]);
  assert.deepEqual(safePreparedContacts(rows, "own-author", { ...none, excludedCategories: ["friend"] }).map(row => row.b), ["alex"]);
  assert.deepEqual(safePreparedContacts(rows, "own-author", { ...none, excludedCategories: ["sibling"] }).map(row => row.b), ["alex"]);
  assert.deepEqual(safePreparedContacts(rows, "own-author", { ...none, excludedContactIds: ["relationship-alex", "john", "robin", "sam"] }), []);
  for (const changed of [{ revoked: true }, { verified: false }, { canExchange: false }, { bothAccepted: false }]) {
    assert.equal(safePreparedContacts([{ ...rows[0], ...changed }], "own-author", none).length, 0);
  }
});
