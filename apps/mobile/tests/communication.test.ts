import assert from "node:assert/strict";
import test from "node:test";
import {
  canManage,
  canMessage,
  reflection,
  type Contact,
  type ContactStatus,
} from "../src/communication";

const contact: Contact = {
  id: "fictional-teacher",
  name: "Alex Example",
  category: "Teacher",
  status: "verified",
  accepted: true,
  verified: true,
};

test("only a verified, accepted connection can receive a simulated message", () => {
  const statuses: ContactStatus[] = [
    "requested",
    "approved",
    "invited",
    "accepted",
    "verified",
    "blocked",
    "removed",
  ];
  for (const status of statuses) {
    for (const accepted of [false, true]) {
      for (const verified of [false, true]) {
        assert.equal(
          canMessage({ ...contact, status, accepted, verified }),
          status === "verified" && accepted && verified,
          `${status}, accepted=${accepted}, verified=${verified}`,
        );
      }
    }
  }
});

test("blocking and removal revoke a previously permitted connection", () => {
  assert.equal(canMessage(contact), true);
  assert.equal(canMessage({ ...contact, status: "blocked" }), false);
  assert.equal(canMessage({ ...contact, status: "removed" }), false);
});

test("parents manage contacts directly; children request changes", () => {
  assert.equal(canManage("parent"), true);
  assert.equal(canManage("child"), false);
});

test("school reflection offers only optional communication with a user-chosen safe person", () => {
  const result = reflection(
    "School has been difficult: they are picking on me.",
  );
  assert.equal(result.topic, "school");
  assert.match(result.suggestion, /someone you feel safe with/);
  assert.match(result.suggestion, /You choose who, if anyone/);
  assert.match(result.suggestion, /in person/);
});

test("reflections never copy journal text or route automatically to a parent", () => {
  for (const text of [
    "My parent scares me. secret-987654",
    "My teacher at school is unsafe. secret-987654",
    "My school parent is unsafe. secret-987654",
    "",
    "I feel strange. secret-987654",
  ]) {
    const output = JSON.stringify(reflection(text));
    assert.equal(output.includes("secret-987654"), false);
    assert.doesNotMatch(
      output,
      /\b(parent|mom|dad|diagnos\w*|depress\w*|anxi\w*|treat\w*|therapy|therapist)\b/i,
    );
    assert.match(output, /someone you feel safe with/);
    assert.match(output, /trusted adult/);
    assert.equal(
      reflection(text).starter,
      "Can we talk? I have something I would like you to listen to.",
    );
  }
});

test("output is fixed for each broad topic, not an analysis of the writer", () => {
  assert.deepEqual(
    reflection("School secret A"),
    reflection("School secret B"),
  );
  assert.deepEqual(reflection("I am happy"), reflection("I am upset"));
});
