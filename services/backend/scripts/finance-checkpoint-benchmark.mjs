import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { applyFinanceCommand, checkpointState, createFinanceState, exportBooks, financeView } from '../../../apps/mobile/src/finance/engine.ts';
import { compactBook, compactPrivateMatches } from '../../../apps/mobile/src/finance/checkpoint.ts';
import { periodKey } from '../../../apps/mobile/src/finance/money-calendar.ts';

const childId = 'fictional-child', parent = { role: 'parent' }, child = { role: 'child', childId };
const hidden = new Set(['configure_matching', 'reveal_match', 'fund_match', 'reverse_match', 'reconcile_match']);
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const origin = Date.parse('2020-01-06T08:00:00.000Z');
const dateAt = day => new Date(origin + day * 86400000).toISOString().slice(0, 10);
const instantAt = (day, step = 0) => new Date(origin + day * 86400000 + step * 1000).toISOString();

/** External maps model indexed durable archive queries; they are NOT stored in the hot book. */
export function checkpointLongevityFixture({ weeks = 52, savings = true, matching = true } = {}) {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 1040) throw Error('Bounded fictional benchmark only.');
  let state = createFinanceState('UTC', [{ id: childId, name: 'Fictional child' }]), sequence = 0, checkpoints = 0;
  const events = [], capsules = [], privateCapsules = [], checkpointSnapshots = [], costs = new Map(), samples = [];
  const maximums = { hotBytes: 0, tail: 0, occurrences: 0, payouts: 0, allocations: 0, matches: 0 };
  const makeBasis = book => {
    const totals = new Map();
    for (const value of costs.values()) if (!['cancelled', 'expired', 'declined'].includes(value.status)) {
      const key = periodKey(value.dueDate, book.plan.period, book.plan.anchorDate);
      totals.set(key, (totals.get(key) ?? 0) + value.rewardCents);
    }
    const keys = new Set(book.occurrences.map(o => periodKey(o.dueDate, book.plan.period, book.plan.anchorDate)));
    return { ...book, archivedBudget: { period: book.plan.period, anchorDate: book.plan.anchorDate,
      maximumCents: Math.max(0, ...totals.values()), byPeriod: Object.fromEntries([...keys].map(key => [key, totals.get(key) ?? 0])),
      excludedOccurrenceIds: book.occurrences.filter(o => costs.has(o.id) && !['cancelled', 'expired', 'declined'].includes(o.status)).map(o => o.id) } };
  };
  function fold(at, retire = false) {
    const books = exportBooks(state); let book = books[childId];
    if (retire) {
      const result = compactBook(makeBasis(book), childId); assert.equal(result.needsBudgetRefresh, false);
      book = result.book;
      for (const capsule of result.capsules) { capsules.push(capsule); for (const o of capsule.occurrences) costs.set(o.id, o); }
    }
    const result = compactPrivateMatches(book, childId, at, state.timezone);
    privateCapsules.push(...result.capsules); books[childId] = result.book;
    state = checkpointState(state, books); checkpoints++; checkpointSnapshots.push(state.checkpoint);
  }
  const send = (action, day, role = parent, step = 0) => {
    const at = instantAt(day, step);
    let books = exportBooks(state), book = books[childId];
    if (book.archivedBudget && ['configure_plan', 'assign_chore', 'edit_chore'].includes(action.kind)) {
      book = makeBasis(book);
      for (const d of action.dates ?? []) { const key = periodKey(d, book.plan.period, book.plan.anchorDate); book.archivedBudget.byPeriod[key] ??= [...costs.values()].filter(o => periodKey(o.dueDate, book.plan.period, book.plan.anchorDate) === key).reduce((n, o) => n + o.rewardCents, 0); }
      if (JSON.stringify(state.checkpoint?.books[childId].archivedBudget) !== JSON.stringify(book.archivedBudget)) {
        books[childId] = book; state = checkpointState(state, books); checkpoints++; checkpointSnapshots.push(state.checkpoint);
      }
    }
    const limit = hidden.has(action.kind) ? 32 : 128;
    if (state.events.filter(e => hidden.has(e.kind) === hidden.has(action.kind)).length >= limit) fold(at);
    const id = `fictional-${sequence++}`, cpu = process.cpuUsage(), start = performance.now();
    state = applyFinanceCommand(state, role, { ...action, id, childId, at });
    const event = state.events.at(-1); events.push(event);
    const view = financeView(state, role, childId, at);
    if (!hidden.has(action.kind) && (view.occurrences.length >= 100 || view.payouts.length >= 32)) fold(at, true);
    const elapsed = process.cpuUsage(cpu); samples.push({ wallMs: performance.now() - start, cpuMs: (elapsed.user + elapsed.system) / 1000 });
    books = exportBooks(state); book = books[childId];
    maximums.hotBytes = Math.max(maximums.hotBytes, bytes(state)); maximums.tail = Math.max(maximums.tail, state.events.length);
    for (const key of ['occurrences', 'payouts', 'allocations', 'matches']) maximums[key] = Math.max(maximums[key], book[key].length);
    assert.ok(book.occurrences.length <= 100 && book.payouts.length <= 32 && state.events.length <= 160);
    return id;
  };
  send({ kind: 'configure_plan', plan: { budgetCents: 10000, period: 'monthly', anchorDate: '2020-01-01', payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true } }, 0, parent, 0);
  if (savings) send({ kind: 'create_goal', goalId: 'goal', title: 'Fictional quarterly savings', targetCents: 100000 }, 0, child, 1);
  if (matching && savings) send({ kind: 'configure_matching', rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } }, 0, parent, 2);
  for (let week = 0; week < weeks; week++) {
    const day = week * 7, choreId = `chore-${week}`, dates = Array.from({ length: 7 }, (_, i) => dateAt(day + i));
    send({ kind: 'assign_chore', choreId, title: 'Fictional daily household task', rewardCents: 100, dates }, day, parent, 3);
    for (let i = 0; i < 7; i++) {
      const occurrenceId = `${choreId}:${dates[i]}`;
      send({ kind: 'submit_chore', occurrenceId }, day + i, child, 4);
      send({ kind: 'review_chore', occurrenceId, decision: 'approved' }, day + i, parent, 5);
      if (savings) send({ kind: 'allocate', goalId: 'goal', amountCents: 10 }, day + i, child, 6);
    }
    if (savings && (week + 1) % 13 === 0) {
      const own = financeView(state, child, childId, instantAt(day + 6, 7)).goals[0].ownCents;
      send({ kind: 'release_goal', goalId: 'goal', amountCents: own, note: 'Fictional quarterly goal cash-out' }, day + 6, child, 7);
    }
    const available = financeView(state, child, childId, instantAt(day + 6, 8)).balances.availableCents;
    const payoutId = send({ kind: 'request_payout', amountCents: available }, day + 6, child, 8);
    const paymentId = send({ kind: 'report_payment', payoutId, amountCents: available, method: 'manual', paidAt: instantAt(day + 6, 9) }, day + 6, parent, 9);
    send({ kind: 'acknowledge_payment', paymentId }, day + 6, child, 10);
  }
  const at = instantAt(weeks * 7, 0), golden = { timezone: state.timezone, children: state.children, events };
  const actual = financeView(state, parent, childId, at), expected = financeView(golden, parent, childId, at);
  assert.deepEqual(actual.balances, expected.balances); assert.deepEqual(actual.goals, expected.goals);
  assert.equal(actual.matching.usedCents, expected.matching.usedCents); assert.equal(actual.matching.remainingCents, expected.matching.remainingCents);
  assert.equal(actual.balances.earnedCents, weeks * 700);
  const sorted = key => samples.map(s => s[key]).sort((a, b) => a - b);
  const percentile = (values, p) => values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
  return { state, events, capsules, privateCapsules, checkpointSnapshots, at, result: { weeks, savings, matching, events: events.length,
    checkpoints, visibleCapsules: capsules.length, privateCapsules: privateCapsules.length, maximums,
    finalHotBytes: bytes(state), archiveJsonBytes: bytes(capsules) + bytes(privateCapsules), ledgerJsonBytes: bytes(events), checkpointJsonBytes: checkpointSnapshots.reduce((total, snapshot) => total + bytes(snapshot), 0),
    wallP95Ms: percentile(sorted('wallMs'), .95), cpuP95Ms: percentile(sorted('cpuMs'), .95), cpuMaxMs: Math.max(...samples.map(s => s.cpuMs)),
    goldenBalanceAndGoalPass: true } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const weeks = Number(process.argv[2] ?? '52');
  const start = performance.now();
  const fixture = checkpointLongevityFixture({ weeks });
  const report = { format: 1, scope: 'LOCAL Node pure engine and archive-index substitute; NOT hosted Edge/SQL evidence',
    measuredAt: new Date().toISOString(), node: process.version, platform: `${os.platform()} ${os.arch()}`, ...fixture.result,
    elapsedMs: performance.now() - start, processMemory: process.memoryUsage(), freeLimits: { edgeCpuMs: 2000, edgeMemoryBytes: 268435456, databaseBytes: 500000000 },
    sources: ['https://supabase.com/docs/guides/functions/limits', 'https://supabase.com/pricing'], safetyLimitsRaised: false };
  const folder = fileURLToPath(new URL('../../../spec/production/staging/finance-checkpoints/', import.meta.url));
  await mkdir(folder, { recursive: true });
  const output = path.join(folder, `node-longevity-${weeks}-weeks-${new Date().toISOString().replaceAll(/[^0-9]/g, '')}.json`);
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
}
