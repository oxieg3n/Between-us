import assert from "node:assert/strict";
import test from "node:test";
import { messageDay, messageTime, threadFor } from "../src/messaging-logic";
import type { Message } from "../src/model";

const messages = [
  {
    id: "1",
    author: "parent",
    recipient: "sam",
    text: "Can we talk?",
    response: "Just listen",
    createdAt: 1794695400000,
  },
  {
    id: "2",
    author: "child",
    recipient: "alex",
    text: "After dinner?",
    response: "Talk later",
    createdAt: 1794695460000,
  },
  {
    id: "3",
    author: "child",
    recipient: "lee",
    text: "School project",
    response: "Give me ideas",
    createdAt: 1794695500000,
  },
] satisfies Message[];

test("threads include only the selected participants in both role views", () => {
  assert.deepEqual(
    threadFor(messages, "child", "alex").map((message) => message.id),
    ["1", "2"],
  );
  assert.deepEqual(
    threadFor(messages, "parent", "sam").map((message) => message.id),
    ["1", "2"],
  );
  assert.deepEqual(
    threadFor(messages, "child", "lee").map((message) => message.id),
    ["3"],
  );
  assert.deepEqual(threadFor(messages, "parent", "lee"), []);
});

test("missing or invalid timestamps are labeled as examples, not delivery times", () => {
  assert.equal(messageTime(), "Example");
  assert.equal(messageTime(Number.NaN), "Example");
  assert.equal(messageDay(), "Example conversation");
  assert.ok(messageTime(messages[0].createdAt).length > 0);
});
