import { test } from 'node:test';
import assert from 'node:assert/strict';
const { buildFinanceFixture, benchmarkFinanceCapacity, buildFamilyFinanceFixture, benchmarkFinanceFamilyCapacity, summarize } = await import(new URL('../scripts/finance-capacity-benchmark.mjs', import.meta.url).href);

test('valid mixed history uses real earning, savings, payout and hidden paths with stable child projection', () => {
  for (const profile of ['household', 'collection-stress']) {
    const fixture = buildFinanceFixture(128, profile);
    assert.equal(fixture.state.events.length, 128);
    assert.equal(fixture.childEquivalentWorldPass, true); assert.equal(fixture.invariantPass, true);
    assert.ok(fixture.actionCounts.review_chore > 0); assert.ok(fixture.actionCounts.request_payout > 0);
    assert.ok(fixture.actionCounts.report_payment > 0); assert.ok(fixture.actionCounts.acknowledge_payment > 0);
    assert.ok(fixture.counts.hiddenEvents > 0); assert.ok(fixture.counts.occurrences <= 100); assert.ok(fixture.counts.payouts <= 32);
    assert.equal(fixture.state.events[0].at, '2026-01-01T00:00:00.000Z');
    assert.equal(fixture.state.events.at(-1).at, '2026-12-31T12:00:00.000Z');
  }
});
test('fixture rejects invalid sizes and reports no evidence for empty history', () => {
  assert.equal(buildFinanceFixture(0).state.events.length, 0);
  for (const n of [-1, 4097, 1.5, NaN]) assert.throws(() => buildFinanceFixture(n));
  assert.throws(() => buildFinanceFixture(128, 'unknown'));
});
test('summary percentiles are derived from actual samples and reject invalid values', () => {
  assert.deepEqual(summarize([4, 1, 3, 2]), { median: 2.5, p95: 4, max: 4, samples: 4 });
  assert.throws(() => summarize([])); assert.throws(() => summarize([NaN]));
});
test('bounded benchmark times real parent and child engine operations without changing runtime caps', () => {
  const report = benchmarkFinanceCapacity({ sizes: [0, 128], profiles: ['household'], repetitions: 3, warmups: 1 });
  assert.equal(report.rows.length, 4);
  for (const row of report.rows) {
    assert.equal(row.resultingEvents, row.inputEvents + 1); assert.equal(row.timing.commandPipelineMs.samples, 3);
    assert.ok(row.timing.commandPipelineMs.p95 >= row.timing.commandPipelineMs.median);
    assert.ok(row.serializedStateBytes > 0); assert.ok(row.maximumSampledProcessRssBytes > 0);
    assert.equal(row.backendCapsApplied, false); assert.equal(row.edgeCpuQualified, false); assert.equal(row.edgeMemoryQualified, false);
  }
  assert.throws(() => benchmarkFinanceCapacity({ sizes: [8192] }));
});
test('family aggregate preserves exact independent budgets and child privacy while parent totals reconcile', () => {
  const fixture = buildFamilyFinanceFixture({ children: 3 });
  assert.equal(fixture.state.children.length, 3); assert.equal(fixture.state.events.length, 480);
  assert.equal(fixture.counts.visibleEvents, 384); assert.equal(fixture.counts.hiddenEvents, 96);
  assert.equal(fixture.counts.occurrencesPerChild, 100); assert.equal(fixture.counts.goalsPerChild, 32);
  assert.equal(fixture.counts.savingsRulesPerChild, 8); assert.equal(fixture.counts.payoutsPerChild, 32);
  assert.equal(fixture.checkedChildSubjects, 3); assert.equal(fixture.childPeerExclusionPass, true);
  assert.equal(fixture.childEquivalentWorldPass, true); assert.equal(fixture.familyParentTotalsPass, true);
  assert.throws(() => buildFamilyFinanceFixture({ children: 13 }));
  assert.throws(() => buildFamilyFinanceFixture({ visible: 4096, hiddenEvents: 1024 }));
});
test('prospective family benchmark is separately labeled and does not apply or change backend caps', () => {
  const report = benchmarkFinanceFamilyCapacity({ children: 1, repetitions: 3, warmups: 0 });
  assert.equal(report.rows.length, 4); assert.equal(report.rows[0].inputEvents, 160); assert.equal(report.rows[2].inputEvents, 640);
  for (const row of report.rows) {
    assert.equal(row.backendCapsApplied, false); assert.equal(row.edgeCpuQualified, false);
    assert.equal(row.childPeerExclusionPass, true); assert.equal(row.familyParentTotalsPass, true);
  }
});
