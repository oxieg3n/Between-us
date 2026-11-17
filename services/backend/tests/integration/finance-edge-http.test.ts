import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { integrationFixture, type LocalPerson } from './integration-fixtures.ts';

test('real local Edge gateway preserves managed identity, finance idempotency and parent-only matching', { timeout: 90_000 }, async () => {
  const f = await integrationFixture();
  try {
    assert.ok(f.child);
    const endpoint = `http://127.0.0.1:54321/functions/v1/api${f.path}`;
    const request = (person: LocalPerson, suffix = '', payload?: unknown) => fetch(endpoint + suffix, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${person.session.access_token}`, apikey: f.publicKey, 'content-type': 'application/json' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const health = await fetch('http://127.0.0.1:54321/functions/v1/api/health', { headers: { authorization: `Bearer ${f.publicKey}`, apikey: f.publicKey } });
    assert.equal(health.status, 200, 'start pinned local functions serve with JWT verification enabled');
    assert.equal((await health.json()).build, '1116-FinanceCheckpoints-r2');
    const plan = { budgetCents: 5000, period: 'monthly', anchorDate: f.today, payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true };
    const id = randomUUID(), action = { kind: 'configure_plan', plan };
    const accepted = await request(f.parent, '', { id, action }); assert.equal(accepted.status, 200);
    const first = await accepted.json(); assert.equal(first.plan.budgetCents, 5000);
    const retry = await request(f.parent, '', { id, action }); assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), first);
    const before = await request(f.child); assert.equal(before.status, 200); const visible = await before.json();
    const hidden = await request(f.parent, '', { id: randomUUID(), action: { kind: 'configure_matching', rule: {
      enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true,
    } } }); assert.equal(hidden.status, 200); assert.equal((await hidden.json()).matching.rule.surprise, true);
    const after = await request(f.child); assert.equal(after.status, 200); assert.deepEqual(await after.json(), visible);
    for (const suffix of ['/parent-history', '/parent-open-history']) assert.equal((await request(f.child, suffix)).status, 403);
    const stranger = await f.adult('edge-unrelated'); assert.equal((await request(stranger, '/history')).status, 403);
    const forged = await request(f.child, '', { id: randomUUID(), action: { ...action, role: 'parent' } }); assert.equal(forged.status, 400);
    const audit = (await f.database.query('select count(*)::int n from app_private.finance_events where family_id=$1', [f.familyId])).rows[0];
    assert.equal(audit.n, 2, 'retry and forged/unrelated requests append no extra events');
  } finally { await f.close(); }
});
