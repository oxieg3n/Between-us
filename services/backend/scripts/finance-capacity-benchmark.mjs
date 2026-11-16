import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFinanceCommand, createFinanceState, financeView } from '../../../apps/mobile/src/finance/engine.ts';

export const EVENT_COUNTS = Object.freeze([0, 128, 512, 1024, 4096]);
export const PROFILES = Object.freeze(['household', 'collection-stress']);
const childId = 'fictional-capacity-child';
const parent = Object.freeze({ role: 'parent' });
const child = Object.freeze({ role: 'child', childId });
const hidden = new Set(['configure_matching', 'fund_match', 'reveal_match', 'reverse_match', 'reconcile_match']);
const plan = Object.freeze({ budgetCents: 50_000, period: 'monthly', anchorDate: '2026-01-01', payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true });
const rule = Object.freeze({ enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true });
const start = Date.parse('2026-01-01T00:00:00.000Z');
const end = Date.parse('2026-12-31T12:00:00.000Z');
const at = (index, count) => new Date(start + Math.floor((end - start) * index / Math.max(1, count - 1))).toISOString();
const eventId = index => `fixture-event-${String(index).padStart(6, '0')}`;
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');

/** Fixture only: real engine builds the substantive workflow; finite effect-free extension is replay-validated. */
export function buildFinanceFixture(count, profile = 'household') {
  if (!Number.isSafeInteger(count) || count < 0 || count > 4096 || !PROFILES.includes(profile)) throw Error('Invalid benchmark fixture.');
  let state = createFinanceState('UTC', [{ id: childId, name: 'Fictional child' }]);
  const append = (action, actor = parent) => {
    if (state.events.length >= count) return null;
    const command = { ...action, id: eventId(state.events.length), childId, at: at(state.events.length, count) };
    state = applyFinanceCommand(state, actor, command);
    return command.id;
  };
  append({ kind: 'configure_plan', plan });
  const goalCount = profile === 'household' ? 2 : 32;
  for (let i = 0; i < goalCount; i++) append({ kind: 'create_goal', goalId: `goal-${i}`, title: `Fictional savings ${i}`, targetCents: 200_000 }, child);
  append({ kind: 'configure_matching', rule });
  const savingsRules = profile === 'household' ? 1 : 8;
  for (let i = 0; i < savingsRules; i++) append({ kind: 'set_savings_rule', rule: { id: `saving-${i}`, goalId: `goal-${i}`, mode: 'percent', value: profile === 'household' ? 10 : 1, enabled: true } }, child);
  const dates = profile === 'household' ? ['2026-12-31'] : Array.from({ length: 100 }, (_, i) => new Date(Date.parse('2026-09-23T12:00:00Z') + i * 86_400_000).toISOString().slice(0, 10));
  append({ kind: 'assign_chore', choreId: 'fixture-chore', title: 'Fictional household task', rewardCents: profile === 'household' ? 10_000 : 500, dates });
  const earnings = profile === 'household' ? 1 : 32;
  for (let i = 0; i < earnings && state.events.length < count; i++) {
    const occurrenceId = `fixture-chore:${dates[i]}`;
    append({ kind: 'submit_chore', occurrenceId, note: 'Fictional completion' }, child);
    append({ kind: 'review_chore', occurrenceId, decision: 'approved', note: 'Fictional approval' });
    if (state.events.length >= count) break;
    const payout = append({ kind: 'request_payout', amountCents: 100 }, child);
    const payment = append({ kind: 'report_payment', payoutId: payout, amountCents: 100, method: 'manual', paidAt: at(state.events.length, count) });
    append({ kind: 'acknowledge_payment', paymentId: payment }, child);
    if (i % 4 === 0 && state.events.length < count) {
      const commitment = financeView(state, parent, childId, at(state.events.length - 1, count)).matching.commitments.find(m => m.fundedCents < m.activeCents);
      if (commitment) append({ kind: 'fund_match', matchId: commitment.id, amountCents: 1, method: 'manual', paidAt: at(state.events.length, count) });
    }
  }
  // The household profile also exercises explicit saving and a second future occurrence.
  if (profile === 'household') {
    append({ kind: 'allocate', goalId: 'goal-1', amountCents: 500 }, child);
    append({ kind: 'transfer_goal', fromGoalId: 'goal-1', toGoalId: 'goal-0', amountCents: 100 }, child);
    append({ kind: 'release_goal', goalId: 'goal-1', amountCents: 100 }, child);
    append({ kind: 'mark_held', goalId: 'goal-0', amountCents: 100, locationLabel: 'Fictional envelope' });
    append({ kind: 'assign_chore', choreId: 'future-chore', title: 'Fictional future task', rewardCents: 200, dates: ['2026-12-31'] });
  }
  const validatedPrefixEvents = state.events.length;
  const events = [...state.events];
  while (events.length < count) {
    const index = events.length;
    const base = { id: eventId(index), childId, at: at(index, count) };
    let action, actor;
    switch ((index - validatedPrefixEvents) % 6) {
      case 0: action = { kind: 'configure_matching', rule: { ...rule, parentBudgetCents: 2000 + index } }; actor = parent; break;
      case 1: action = { kind: 'edit_goal', goalId: 'goal-0', title: 'Fictional savings 0', targetCents: 200_000 }; actor = child; break;
      case 2: action = { kind: 'configure_plan', plan }; actor = parent; break;
      case 3: action = { kind: 'transfer_goal', fromGoalId: 'goal-0', toGoalId: 'goal-1', amountCents: 1 }; actor = child; break;
      case 4: action = { kind: 'transfer_goal', fromGoalId: 'goal-1', toGoalId: 'goal-0', amountCents: 1 }; actor = child; break;
      default: action = { kind: 'set_savings_rule', rule: { id: 'saving-0', goalId: 'goal-0', mode: 'percent', value: profile === 'household' ? 10 : 1, enabled: true } }; actor = child;
    }
    // These extension operations have no effects in this fixture; actual replay below validates the full business history.
    events.push({ ...base, ...action, actor: { ...actor }, effects: [] });
  }
  state = { ...state, events };
  assert.equal(new Set(events.map(e => e.id)).size, count);
  for (let i = 1; i < events.length; i++) assert.ok(events[i - 1].at <= events[i].at);
  const checkedAt = events.at(-1)?.at ?? new Date(start).toISOString();
  const parentView = financeView(state, parent, childId, checkedAt);
  const childView = financeView(state, child, childId, checkedAt);
  const publicWorld = { ...state, events: events.filter(e => !hidden.has(e.kind)) };
  assert.deepEqual(financeView(publicWorld, child, childId, checkedAt), childView, 'hidden-only differences must not change child projection');
  assert.equal(Object.hasOwn(childView, 'matching'), false);
  assert.equal(childView.balances.earnedCents, childView.balances.availableCents + childView.balances.earmarkedCents + childView.balances.heldPayoutCents + childView.balances.paidCents);
  for (const [key, limit] of [['occurrences', 100], ['goals', 32], ['savingsRules', 8], ['payouts', 32]]) assert.ok(parentView[key].length <= limit);
  assert.ok(parentView.payouts.every(p => p.payments.length <= 32));
  return { state, profile, validatedPrefixEvents, extensionEvents: count - validatedPrefixEvents,
    checkedAt, counts: { occurrences: parentView.occurrences.length, goals: parentView.goals.length, savingsRules: parentView.savingsRules.length,
      payouts: parentView.payouts.length, visibleEvents: events.filter(e => !hidden.has(e.kind)).length, hiddenEvents: events.filter(e => hidden.has(e.kind)).length },
    childEquivalentWorldPass: true, invariantPass: true, parentViewBytes: bytes(parentView), childViewBytes: bytes(childView),
    actionCounts: Object.fromEntries([...new Set(events.map(e => e.kind))].sort().map(kind => [kind, events.filter(e => e.kind === kind).length])) };
}

export function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  if (!sorted.length || sorted.some(v => !Number.isFinite(v) || v < 0)) throw Error('Invalid performance samples.');
  const percentile = p => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return { median: sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    p95: percentile(0.95), max: sorted.at(-1), samples: sorted.length };
}

function measure(fixture, role, iteration) {
  const subject = fixture.childId ?? childId;
  const actor = role === 'parent' ? parent : { role: 'child', childId: subject };
  const command = { id: `probe-${role}-${fixture.state.events.length}-${iteration}`, childId: subject, at: '2026-12-31T23:59:59.000Z',
    ...(role === 'parent' ? { kind: 'configure_plan', plan } : fixture.state.events.length ? { kind: 'edit_goal', goalId: 'goal-0', title: 'Fictional savings 0', targetCents: 200_000 }
      : { kind: 'create_goal', goalId: 'probe-goal', title: 'Fictional savings', targetCents: 200_000 }) };
  const cpu = process.cpuUsage(), began = performance.now();
  const input = JSON.parse(JSON.stringify(fixture.state)), parsed = performance.now();
  const next = applyFinanceCommand(input, actor, command), applied = performance.now();
  const parentProjection = financeView(next, parent, subject, command.at), projectedParent = performance.now();
  const childProjection = financeView(next, { role: 'child', childId: subject }, subject, command.at), projectedChild = performance.now();
  const serializedBytes = bytes(next), serialized = performance.now();
  assert.equal(Object.hasOwn(childProjection, 'matching'), false);
  assert.equal(next.events.length, fixture.state.events.length + 1);
  const used = process.cpuUsage(cpu);
  return { parseMs: parsed - began, applyMs: applied - parsed, parentViewMs: projectedParent - applied,
    childViewMs: projectedChild - projectedParent, serializeMs: serialized - projectedChild, commandPipelineMs: serialized - began,
    nodeCpuMs: (used.user + used.system) / 1000, rssBytes: process.memoryUsage().rss, serializedBytes,
    childProjectionBytes: bytes(childProjection), parentProjectionBytes: bytes(parentProjection) };
}

/** Finite synthetic aggregate at exact per-child visible/hidden budgets; runtime caps are never modified. */
export function buildFamilyFinanceFixture({ children = 12, visible = 128, hiddenEvents = 32 } = {}) {
  if (!Number.isSafeInteger(children) || children < 1 || children > 12 || ![[128, 32], [512, 128]].some(([v, h]) => v === visible && h === hiddenEvents)) throw Error('Invalid family benchmark fixture.');
  let template = buildFinanceFixture(visible, 'collection-stress');
  if (visible === 128) {
    // Simultaneously fill every current collection: seven earnings fund thirty-two distinct manual payouts.
    let current = createFinanceState('UTC', [{ id: childId, name: 'Fictional child' }]);
    const append = (action, actor = parent) => {
      const command = { ...action, id: eventId(current.events.length), childId, at: at(current.events.length, 160) };
      current = applyFinanceCommand(current, actor, command);return command.id;
    };
    append({ kind: 'configure_plan', plan });
    for (let i = 0; i < 32; i++) append({ kind: 'create_goal', goalId: `goal-${i}`, title: `Fictional savings ${i}`, targetCents: 200_000 }, child);
    append({ kind: 'configure_matching', rule });
    for (let i = 0; i < 8; i++) append({ kind: 'set_savings_rule', rule: { id: `saving-${i}`, goalId: `goal-${i}`, mode: 'percent', value: 1, enabled: true } }, child);
    const dates = Array.from({ length: 100 }, (_, i) => new Date(Date.parse('2026-09-23T12:00:00Z') + i * 86_400_000).toISOString().slice(0, 10));
    append({ kind: 'assign_chore', choreId: 'fixture-chore', title: 'Fictional household task', rewardCents: 500, dates });
    for (let i = 0; i < 7; i++) {
      append({ kind: 'submit_chore', occurrenceId: `fixture-chore:${dates[i]}`, note: 'Fictional completion' }, child);
      append({ kind: 'review_chore', occurrenceId: `fixture-chore:${dates[i]}`, decision: 'approved' });
    }
    const payments = [];
    for (let i = 0; i < 32; i++) {
      const payout = append({ kind: 'request_payout', amountCents: 100 }, child);
      payments.push(append({ kind: 'report_payment', payoutId: payout, amountCents: 100, method: 'manual', paidAt: at(current.events.length, 160) }));
    }
    for (const paymentId of payments.slice(0, 8)) append({ kind: 'acknowledge_payment', paymentId }, child);
    for (let i = 0; i < 31; i++) {
      const match = financeView(current, parent, childId, current.events.at(-1).at).matching.commitments.find(m => m.fundedCents < m.activeCents);
      append({ kind: 'fund_match', matchId: match.id, amountCents: 1, method: 'manual', paidAt: at(current.events.length, 160) });
    }
    assert.equal(current.events.length, 160);
    template = { ...template, state: current, validatedPrefixEvents: 160,
      counts: { ...template.counts, visibleEvents: 128, hiddenEvents: 32 } };
  }
  const templateEvents = [...template.state.events];
  let visibleCount = template.counts.visibleEvents, hiddenCount = template.counts.hiddenEvents;
  while (visibleCount < visible || hiddenCount < hiddenEvents) {
    const isHidden = hiddenCount < hiddenEvents;
    const action = isHidden ? { kind: 'configure_matching', rule: { ...rule, parentBudgetCents: 2000 + templateEvents.length } }
      : { kind: 'edit_goal', goalId: 'goal-0', title: 'Fictional savings 0', targetCents: 200_000 };
    templateEvents.push({ ...action, id: `fixture-budget-${templateEvents.length}`, childId, at: '2026-12-31T13:00:00.000Z',
      actor: isHidden ? { ...parent } : { ...child }, effects: [] });
    if (isHidden) hiddenCount++; else visibleCount++;
  }
  const subjects = Array.from({ length: children }, (_, index) => `family-child-${String(index).padStart(2, '0')}`);
  const events = subjects.flatMap(subject => JSON.parse(JSON.stringify(templateEvents).replaceAll(childId, subject).replaceAll('fixture-', `${subject}:fixture-`)));
  // Stable original per-child order is required for events sharing the extension timestamp.
  events.sort((a, b) => a.at.localeCompare(b.at) || a.childId.localeCompare(b.childId)
    || Number(a.id.match(/(?:event-|budget-)(\d+)$/)?.[1] ?? 0) - Number(b.id.match(/(?:event-|budget-)(\d+)$/)?.[1] ?? 0));
  const state = { timezone: 'UTC', children: subjects.map((id, index) => ({ id, name: `Fictional child ${index}` })), events };
  assert.equal(new Set(events.map(e => e.id)).size, events.length);
  assert.equal(events.length, children * (visible + hiddenEvents));
  const checkedAt = '2026-12-31T14:00:00.000Z';
  const publicWorld = { ...state, events: events.filter(e => !hidden.has(e.kind)) };
  const sums = { earnedCents: 0, availableCents: 0, earmarkedCents: 0, heldPayoutCents: 0, paidCents: 0 };
  let selectedParent, selectedChild;
  const checkedIndices = children <= 3 ? subjects.map((_, i) => i) : [0, children - 1];
  for (let i = 0; i < children; i++) {
    const subject = subjects[i], view = financeView(state, parent, subject, checkedAt);
    for (const key of Object.keys(sums)) sums[key] += view.balances[key];
    assert.equal(events.filter(e => e.childId === subject && !hidden.has(e.kind)).length, visible);
    assert.equal(events.filter(e => e.childId === subject && hidden.has(e.kind)).length, hiddenEvents);
    if (i === 0) selectedParent = view;
    if (checkedIndices.includes(i)) {
      const actor = { role: 'child', childId: subject }, projection = financeView(state, actor, subject, checkedAt);
      assert.deepEqual(financeView(publicWorld, actor, subject, checkedAt), projection);
      assert.equal(Object.hasOwn(projection, 'matching'), false);
      const serialized = JSON.stringify(projection);
      assert.ok(subjects.filter(peer => peer !== subject).every(peer => !serialized.includes(peer)), 'child projection must exclude peer identifiers');
      if (i === 0) selectedChild = projection;
    }
  }
  assert.equal(sums.earnedCents, sums.availableCents + sums.earmarkedCents + sums.heldPayoutCents + sums.paidCents);
  const baseline = financeView(template.state, parent, childId, checkedAt);
  assert.equal(sums.earnedCents, baseline.balances.earnedCents * children);
  return { state, childId: subjects[0], profile: visible === 128 ? 'family-current-128-32' : 'family-prospective-512-128',
    checkedAt, counts: { children, visibleEvents: visible * children, hiddenEvents: hiddenEvents * children,
      occurrencesPerChild: selectedParent.occurrences.length, goalsPerChild: selectedParent.goals.length,
      savingsRulesPerChild: selectedParent.savingsRules.length, payoutsPerChild: selectedParent.payouts.length },
    budgetPerChild: { visible, hidden: hiddenEvents }, checkedChildSubjects: checkedIndices.length,
    validatedPrefixEvents: template.validatedPrefixEvents * children,
    extensionEvents: events.length - template.validatedPrefixEvents * children,
    childEquivalentWorldPass: true, childPeerExclusionPass: true, familyParentTotalsPass: true, invariantPass: true,
    parentViewBytes: bytes(selectedParent), childViewBytes: bytes(selectedChild),
    actionCounts: Object.fromEntries([...new Set(events.map(e => e.kind))].sort().map(kind => [kind, events.filter(e => e.kind === kind).length])) };
}

export function benchmarkFinanceFamilyCapacity({ children = 12, repetitions = 20, warmups = 3, progress = () => {} } = {}) {
  if (!Number.isSafeInteger(repetitions) || repetitions < 3 || repetitions > 100 || !Number.isSafeInteger(warmups) || warmups < 0 || warmups > 10) throw Error('Invalid benchmark options.');
  const rows = [];
  // Existing cap first; prospective mode is a measurement fixture, never an admission/configuration change.
  for (const [visible, hiddenEvents] of [[128, 32], [512, 128]]) {
    const fixture = buildFamilyFinanceFixture({ children, visible, hiddenEvents });
    for (const role of ['parent', 'child']) {
      for (let i = 0; i < warmups; i++) measure(fixture, role, `warmup-${i}`);
      const samples = Array.from({ length: repetitions }, (_, i) => measure(fixture, role, i));
      rows.push({ profile: fixture.profile, children, inputEvents: fixture.state.events.length, resultingEvents: fixture.state.events.length + 1,
        role, counts: fixture.counts, budgetPerChild: fixture.budgetPerChild, checkedChildSubjects: fixture.checkedChildSubjects,
        checkedParentSubjects: children, childEquivalentWorldPass: true, childPeerExclusionPass: true, familyParentTotalsPass: true,
        serializedStateBytes: bytes(fixture.state), resultingStateBytes: samples.at(-1).serializedBytes,
        maximumSampledProcessRssBytes: Math.max(...samples.map(s => s.rssBytes)),
        timing: Object.fromEntries(['parseMs', 'applyMs', 'parentViewMs', 'childViewMs', 'serializeMs', 'commandPipelineMs', 'nodeCpuMs'].map(name => [name, summarize(samples.map(s => s[name]))])),
        backendCapsApplied: false, edgeCpuQualified: false, edgeMemoryQualified: false });
      progress({ profile: fixture.profile, inputEvents: fixture.state.events.length, role });
    }
  }
  return { format: 'between-us-family-finance-capacity-benchmark-v1', generatedAt: new Date().toISOString(), repetitions, warmups,
    runtime: { node: process.version, platform: process.platform, architecture: process.arch, cpuModel: os.cpus()[0]?.model ?? 'unknown', logicalCpuCount: os.cpus().length },
    method: 'Actual full-family aggregate parse/apply, selected parent and child role projections, and serialization; each replay processes every child book.',
    fixtureConstruction: 'Individually engine/replay-validated stress histories are remapped with unique subject/event/reference IDs, interleaved chronologically and checked at exact independent visible/hidden budgets. All parent totals and first/last child privacy controls are validated.',
    limitations: ['Node CPU/RSS are not Edge CPU or isolate memory qualification.', 'Prospective 512/128 is a benchmark fixture; deployed cap remains128/32.',
      'Current-cap fixture probes one extra valid engine operation to measure growth cost; backend would reject it at its unchanged cap.',
      'No HTTP/SQL/concurrency/provider or physical-device test was run.', 'No cap increase, checkpoint, archive or history deletion was performed.'], rows };
}

export function benchmarkFinanceCapacity({ sizes = EVENT_COUNTS, profiles = PROFILES, repetitions = 20, warmups = 3, progress = () => {} } = {}) {
  if (!Array.isArray(sizes) || sizes.some(n => !EVENT_COUNTS.includes(n)) || !Array.isArray(profiles) || profiles.some(p => !PROFILES.includes(p))
    || !Number.isSafeInteger(repetitions) || repetitions < 3 || repetitions > 100 || !Number.isSafeInteger(warmups) || warmups < 0 || warmups > 10) throw Error('Invalid benchmark options.');
  const rows = [];
  for (const profile of profiles) for (const count of sizes) {
    const fixture = buildFinanceFixture(count, profile);
    for (const role of ['parent', 'child']) {
      for (let i = 0; i < warmups; i++) measure(fixture, role, `warmup-${i}`);
      const samples = Array.from({ length: repetitions }, (_, i) => measure(fixture, role, i));
      const timingNames = ['parseMs', 'applyMs', 'parentViewMs', 'childViewMs', 'serializeMs', 'commandPipelineMs', 'nodeCpuMs'];
      rows.push({ profile, inputEvents: count, resultingEvents: count + 1, role, counts: fixture.counts, actionCounts: fixture.actionCounts,
        validatedPrefixEvents: fixture.validatedPrefixEvents, replayValidatedExtensionEvents: fixture.extensionEvents,
        fixtureYear: '2026', firstEventAt: fixture.state.events[0]?.at ?? null, lastEventAt: fixture.state.events.at(-1)?.at ?? null,
        serializedStateBytes: bytes(fixture.state), resultingStateBytes: samples.at(-1).serializedBytes,
        parentProjectionBytes: fixture.parentViewBytes, childProjectionBytes: fixture.childViewBytes,
        childEquivalentWorldPass: fixture.childEquivalentWorldPass, integerConservationPass: fixture.invariantPass,
        maximumSampledProcessRssBytes: Math.max(...samples.map(s => s.rssBytes)),
        timing: Object.fromEntries(timingNames.map(name => [name, summarize(samples.map(s => s[name]))])),
        backendCapsApplied: false, edgeCpuQualified: false, edgeMemoryQualified: false });
      progress({ profile, inputEvents: count, role });
    }
  }
  return { format: 'between-us-finance-capacity-benchmark-v1', generatedAt: new Date().toISOString(), repetitions, warmups,
    runtime: { node: process.version, platform: process.platform, architecture: process.arch, cpuModel: os.cpus()[0]?.model ?? 'unknown', logicalCpuCount: os.cpus().length },
    method: 'Fresh JSON round-trip input, actual applyFinanceCommand, both actual role projections, resulting JSON serialization; independent command attempts against the same fixture.',
    fixtureConstruction: 'Actual engine builds substantive workflow prefix. Known effect-free finite extensions are constructed then fully replayed by both role projections and equivalent-world checks. Fixture preparation is excluded from timing.',
    limitations: ['Node process CPU and wall timings are not hosted Edge CPU measurements.', 'Sampled whole-process RSS is not allocation delta, peak RSS or a 256MB Edge isolate measurement.',
      'No database/RPC/HTTP/concurrency, hosted quota, physical-device or child information used.', 'Backend visible/hidden event caps remain unchanged; this script directly probes the pure engine beyond current admission limits.',
      'Repeated edits/transfers/configuration after a realistic prefix do not represent every possible long-lived household history.'], rows };
}

async function sourceManifest() {
  const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
  const names = ['apps/mobile/src/finance/engine.ts', 'apps/mobile/src/finance/types.ts', 'apps/mobile/src/finance/money-calendar.ts',
    'services/backend/src/finance.ts', 'services/backend/package.json', 'services/backend/package-lock.json', 'apps/mobile/package.json', 'apps/mobile/package-lock.json',
    'services/backend/scripts/finance-capacity-benchmark.mjs'];
  return Promise.all(names.map(async name => ({ name, sha256: createHash('sha256').update(await readFile(path.join(root, name))).digest('hex') })));
}
async function main(args) {
  const family = args[0] === '--family';
  if (family) args = args.slice(1);
  if (args.length !== 2 || args[0] !== '--output') throw Error('Use [--family] --output DIR.');
  const manifestBefore = await sourceManifest();
  const run = family ? benchmarkFinanceFamilyCapacity : benchmarkFinanceCapacity;
  const report = run({ progress: value => process.stderr.write(JSON.stringify({ stage: 'measured', ...value }) + '\n') });
  const manifestAfter = await sourceManifest();
  assert.deepEqual(manifestAfter, manifestBefore, 'Source changed during benchmark; rerun at a stable snapshot.');
  report.sourceManifest = manifestBefore;
  const directory = path.resolve(args[1]); await mkdir(directory, { recursive: true });
  const reportFile = path.join(directory, 'finance-capacity.json');
  await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const rows = report.rows.map(r => `| ${r.profile} | ${r.inputEvents} | ${r.role} | ${r.timing.commandPipelineMs.median.toFixed(2)} / ${r.timing.commandPipelineMs.p95.toFixed(2)} | ${r.timing.nodeCpuMs.p95.toFixed(2)} | ${r.serializedStateBytes} | ${(r.maximumSampledProcessRssBytes / 1048576).toFixed(1)} |`).join('\n');
  await writeFile(path.join(directory, 'finance-capacity.md'), `# Local finance replay benchmark\n\n${report.generatedAt}; ${process.version}; ${process.platform}/${process.arch}. ${report.repetitions} measured samples/row after ${report.warmups} warmups.\n\n${report.method}\n\n${report.fixtureConstruction}\n\n| Profile | Existing events | Actor | Pipeline median / p95 ms | Node CPU p95 ms | State bytes | Max sampled process RSS MiB |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\nBoth role projections/equivalent-child-world and integer conservation checks passed. Actual collection counts and source hashes are in finance-capacity.json.\n\n${report.limitations.map(s => '- ' + s).join('\n')}\n`, { mode: 0o600 });
  process.stdout.write(JSON.stringify({ status: 'measured-locally', rows: report.rows.length, artifacts: ['finance-capacity.json', 'finance-capacity.md'],
    reportSha256: createHash('sha256').update(await readFile(reportFile)).digest('hex'), edgeQualified: false, capsChanged: false }) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(() => {
  process.stderr.write('Finance capacity benchmark failed; no capacity or hosted qualification claim is available.\n'); process.exitCode = 1;
});
