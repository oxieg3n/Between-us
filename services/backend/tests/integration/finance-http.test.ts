import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { integrationFixture, submittedEarning } from './integration-fixtures.ts';

test('real HTTP finance makes concurrent approvals atomic and operation replay returns the current authorized view', { timeout: 60_000 }, async () => {
  const f = await integrationFixture();
  try {
    assert.ok(f.child);
    await f.finance(f.parent, { kind: 'configure_plan', plan: { budgetCents: 10_000, period: 'monthly', anchorDate: f.today,
      payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true } });
    const first = await submittedEarning(f, 'distinct');
    const firstAction = { kind: 'review_chore' as const, occurrenceId: first, decision: 'approved' as const };
    const distinct = await Promise.all([f.request(f.parent, f.path, { id: randomUUID(), action: firstAction }),
      f.request(f.parent, f.path, { id: randomUUID(), action: firstAction })]);
    assert.deepEqual(distinct.map(response => response.status).sort(), [200, 400], 'one distinct operation wins; second approval cannot earn again');
    assert.equal((await f.finance(f.child)).balances.earnedCents, 3000);

    const second = await submittedEarning(f, 'same');
    const operationId = randomUUID();
    const secondAction = { kind: 'review_chore' as const, occurrenceId: second, decision: 'approved' as const };
    const same = await Promise.all([f.request(f.parent, f.path, { id: operationId, action: secondAction }),
      f.request(f.parent, f.path, { id: operationId, action: secondAction })]);
    assert.deepEqual(same.map(response => response.status), [200, 200], 'same logical request succeeds without another write');
    const audit = await f.database.query(`select (select count(*)::int from app_private.finance_events where family_id=$1
      and payload->>'kind'='review_chore' and payload->>'decision'='approved') approvals,
      (select count(*)::int from app_private.finance_commands where family_id=$1 and actor_id=$2 and operation_id=$3) operations`,
    [f.familyId, f.parent.user.id, operationId]);
    assert.equal(audit.rows[0].approvals, 2); assert.equal(audit.rows[0].operations, 1);
    assert.equal((await f.finance(f.child)).balances.earnedCents, 6000);
    const goalId = randomUUID();
    await f.finance(f.child, { kind: 'create_goal', goalId, title: 'Fictional savings', targetCents: 10_000 });
    await f.finance(f.child, { kind: 'allocate', goalId, amountCents: 1000 });
    const current = await f.finance(f.parent, secondAction, operationId);
    assert.equal(current.balances.availableCents, 5000, 'retry after another mutation must not return an obsolete balance');
    const changed = await f.request(f.parent, f.path, { id: operationId, action: { ...secondAction, decision: 'declined' } });
    assert.equal(changed.status, 400, 'same UUID cannot acquire a different logical body');
    assert.equal((await f.finance(f.child)).balances.earnedCents, 6000);

    const stranger = await f.adult('http-other-family');
    assert.equal((await f.request(stranger, f.path)).status, 403);
    assert.equal((await f.request(f.child, `/v1/finance/${randomUUID()}/${f.childId}`)).status, 403);
    assert.equal((await f.request(f.child, f.path, { id: randomUUID(), action: { kind: 'create_goal', goalId: randomUUID(), title: 'Forgery', targetCents: 100, role: 'parent' } })).status, 400);
    assert.equal((await f.request(f.child, f.path, { id: randomUUID(), action: { kind: 'configure_matching', rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } } })).status, 400);
    const oldBearer = f.child.session.access_token;
    await f.service.auth.admin.signOut(oldBearer, 'local');
    assert.ok([401, 403].includes((await f.request(f.child, f.path)).status), 'old managed JWT cannot bypass session revocation');
  } finally { await f.close(); }
});

test('real HTTP parallel goal allocations share the monthly matching cap while private configuration leaves child bytes unchanged', { timeout: 60_000 }, async () => {
  const f = await integrationFixture();
  try {
    assert.ok(f.child);
    const defaults = await f.finance(f.parent);
    assert.deepEqual(defaults.matching?.rule, { enabled: false, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true });
    await f.finance(f.parent, { kind: 'configure_plan', plan: { budgetCents: 5000, period: 'monthly', anchorDate: f.today,
      payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true } });
    const occurrenceId = await submittedEarning(f, 'matching');
    await f.finance(f.parent, { kind: 'review_chore', occurrenceId, decision: 'approved' });
    const goals = [randomUUID(), randomUUID()];
    for (const goalId of goals) await f.finance(f.child, { kind: 'create_goal', goalId, title: 'Fictional shared cap goal', targetCents: 5000 });
    const before = await f.request(f.child, f.path), beforeBytes = await before.text();
    const hiddenOperation = randomUUID();
    await f.finance(f.parent, { kind: 'configure_matching', rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 3000, surprise: true } }, hiddenOperation);
    const after = await f.request(f.child, f.path);
    assert.equal(after.status, 200); assert.equal(after.headers.get('etag'), null);
    assert.equal(await after.text(), beforeBytes, 'a hidden parent-only mutation cannot invalidate or change the child DTO');
    const results = await Promise.all(goals.map(goalId => f.finance(f.child!, { kind: 'allocate', goalId, amountCents: 1500 })));
    assert.equal(results.length, 2);
    const parentView = await f.finance(f.parent), childView = await f.finance(f.child);
    assert.equal(parentView.matching?.usedCents, 2000);
    assert.equal(parentView.matching?.parentBudgetRemainingCents, 1000);
    assert.equal(parentView.matching?.commitments.reduce((sum, match) => sum + match.activeCents, 0), 2000);
    assert.equal(childView.balances.availableCents, 0); assert.equal(childView.balances.earnedCents, 3000);
    assert.equal(childView.matching, undefined);
    assert.equal(childView.goals.reduce((sum, goal) => sum + goal.parentPlannedCents + goal.parentContributedCents, 0), 0);
    const childJson = JSON.stringify(childView);
    for (const field of ['matching', 'revision', 'events', 'fingerprint', 'effects', 'sourceHash', 'sequence', 'actorId', 'sessionId']) {
      assert.equal(childJson.includes(`"${field}"`), false, `private field ${field} must not reach child`);
    }
    assert.equal(childJson.includes(hiddenOperation), false, 'hidden event identity is private too');
  } finally { await f.close(); }
});
