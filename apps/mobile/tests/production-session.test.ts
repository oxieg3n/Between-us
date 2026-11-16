import { test } from "node:test";
import assert from "node:assert/strict";
import { withSessionBoundary } from "../src/production/session-boundary";
test('an old author handler cannot send its payload under another current account, even before any await', async () => {
  let dispatched=false;
  await assert.rejects(withSessionBoundary({epoch:()=>1,expectedUserId:'author-A',readSession:async()=>({access_token:'fictional-B',user:{id:'author-B'}}),send:async()=>{dispatched=true;}}),/different from the author/);
  assert.equal(dispatched,false);
});
test("account change while loading credentials prevents payload dispatch under the next account", async () => {
  let epoch = 0,
    dispatched = false;
  await assert.rejects(
    withSessionBoundary({
      epoch: () => epoch,
      readSession: async () => {
        epoch++;
        return { access_token: "fictional-B", user: { id: "B" } };
      },
      send: async () => {
        dispatched = true;
      },
    }),
    /before dispatch/,
  );
  assert.equal(dispatched, false);
});
test("request uses captured account credential and discards late response after account switch", async () => {
  let epoch = 0;
  await assert.rejects(
    withSessionBoundary({
      epoch: () => epoch,
      readSession: async () => ({
        access_token: "fictional-A",
        user: { id: "A" },
      }),
      send: async (snapshot) => {
        assert.equal(snapshot?.access_token, "fictional-A");
        epoch++;
        return "private A response";
      },
    }),
    /discarded/,
  );
});
test("private requests require a session and anonymous enrollment remains explicitly scoped", async () => {
  let sent = 0;
  await assert.rejects(
    withSessionBoundary({
      epoch: () => 0,
      readSession: async () => null,
      send: async () => ++sent,
    }),
    /Sign in/,
  );
  assert.equal(sent, 0);
  assert.equal(
    await withSessionBoundary({
      epoch: () => 0,
      readSession: async () => null,
      send: async () => ++sent,
      allowAnonymous: true,
    }),
    1,
  );
});
