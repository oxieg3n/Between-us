import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFinanceCommand, checkpointState, createFinanceState, exportBooks, financeView } from '../../../apps/mobile/src/finance/engine.ts';
import { CHECKPOINT_LIMITS, compactBook, compactPrivateMatches, hydrateBook, hydratePrivateMatch, potentialBookBytes, potentialCheckpointBytes, validateBook, validateCheckpoint, validatePrivateCapsule } from '../../../apps/mobile/src/finance/checkpoint.ts';
import type { ChildBook, FinanceActor, FinanceCheckpoint, FinanceCommand, FinanceSettledCapsule, FinanceState } from '../../../apps/mobile/src/finance/types.ts';

// Pure synthetic domain tests: no fixture imports, credentials, environment, network or SQL.
const CHILD = 'fictional-child', DAY = '2026-11-16', AT = `${DAY}T12:00:00.000Z`;
const PARENT: FinanceActor = { role: 'parent' }, KID: FinanceActor = { role: 'child', childId: CHILD };
type Input = FinanceCommand extends infer T ? T extends FinanceCommand ? Omit<T, 'id' | 'at' | 'childId'> : never : never;
function send(state: FinanceState, actor: FinanceActor, id: string, action: Input): FinanceState {
  return applyFinanceCommand(state, actor, { ...action, id, at: AT, childId: CHILD } as FinanceCommand);
}
function begin(hidden = false): FinanceState {
  let state = createFinanceState('UTC', [{ id: CHILD, name: 'Fictional child' }]);
  state = send(state, PARENT, 'plan', { kind: 'configure_plan', plan: { budgetCents: 1_000_000, period: 'monthly', anchorDate: '2026-11-01', payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true } });
  state = send(state, KID, 'goal', { kind: 'create_goal', goalId: 'g', title: 'Fictional goal', targetCents: 1_000_000 });
  if (hidden) state = send(state, PARENT, 'private-config', { kind: 'configure_matching', rule: { enabled: true, percent: 50, monthlyCapCents: 1_000_000, parentBudgetCents: 1_000_000, surprise: true } });
  return state;
}
function approvedEarning(state: FinanceState, n: number, rewardCents = 100): FinanceState {
  const occurrenceId = `chore-${n}:${DAY}`;
  state = send(state, PARENT, `assign-${n}`, { kind: 'assign_chore', choreId: `chore-${n}`, title: 'Fictional task', rewardCents, dates: [DAY] });
  state = send(state, KID, `submit-${n}`, { kind: 'submit_chore', occurrenceId });
  return send(state, PARENT, `approve-${n}`, { kind: 'review_chore', occurrenceId, decision: 'approved' });
}
function paidCycle(state: FinanceState, n: number, fundPrivateMatch = false): FinanceState {
  state = approvedEarning(state, n);
  state = send(state, KID, `allocate-${n}`, { kind: 'allocate', goalId: 'g', amountCents: 100 });
  if (fundPrivateMatch) state = send(state, PARENT, `private-fund-${n}`, { kind: 'fund_match', matchId: `allocate-${n}:match`, amountCents: 50, method: 'manual', paidAt: AT });
  state = send(state, KID, `release-${n}`, { kind: 'release_goal', goalId: 'g', amountCents: 100, note: 'Fictional release' });
  state = send(state, PARENT, `payout-${n}`, { kind: 'prepare_payout', amountCents: 100 });
  state = send(state, PARENT, `payment-${n}`, { kind: 'report_payment', payoutId: `payout-${n}`, amountCents: 100, method: 'manual', paidAt: AT });
  return send(state, KID, `ack-${n}`, { kind: 'acknowledge_payment', paymentId: `payment-${n}` });
}
function rollover(state: FinanceState, at = AT) {
  const books = exportBooks(state), result = compactBook(books[CHILD], CHILD);
  const privateResult = compactPrivateMatches(result.book, CHILD, at, state.timezone);
  return { ...result, book: privateResult.book, privateCapsules: privateResult.capsules, state: checkpointState(state, { ...books, [CHILD]: privateResult.book }) };
}
function withBook(state: FinanceState, book: ChildBook): FinanceState {
  return checkpointState(state, { ...exportBooks(state), [CHILD]: book });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function childJson(state: FinanceState): string {
  const view = financeView(state, KID, CHILD, AT);
  return canonical({ ...view, activity: view.activity.slice(-100) });
}
function assertGolden(actual: FinanceState, golden: FinanceState, privateHistoryArchived = false): void {
  for (const actor of [KID, PARENT]) {
    const a = financeView(actual, actor, CHILD, AT), b = financeView(golden, actor, CHILD, AT);
    // Archived private commitment records have a separate authorized history/hydration path.
    // Their rule/month/used/remaining economic values must still equal full replay exactly.
    const normalized = (view: typeof a) => ({ ...view, activity: view.activity.slice(-100), ...(privateHistoryArchived && view.matching ? { matching: { ...view.matching, commitments: [] } } : {}) });
    assert.equal(canonical(normalized(a)), canonical(normalized(b)));
  }
}
function capsuleShape(capsules: FinanceSettledCapsule[]) {
  return capsules.map(c => ({ version: c.version, childId: c.childId, occurrenceIds: c.occurrences.map(o => o.id), payoutIds: c.payouts.map(p => p.id), paidCents: c.paidCents }));
}
/** Test oracle for the externally indexed archive budget: all fixture rewards are100 cents in one month.
 * Ordinary production requests must obtain this basis through the authoritative indexed adapter.
 */
function refreshKnownBudget(state: FinanceState, archivedRewardCents: number): FinanceState {
  const books = exportBooks(state), book = books[CHILD];
  if (book.archivedBudget) book.archivedBudget = { ...book.archivedBudget, maximumCents: archivedRewardCents, byPeriod: { '2026-11': archivedRewardCents } };
  return checkpointState(state, books);
}

test('hidden matching cannot change child DTO/activity or visible component retirement across rollover', () => {
  let ordinary = begin(), hidden = begin(true);
  for (let n = 0; n < 4; n++) {
    ordinary = paidCycle(refreshKnownBudget(ordinary, n * 100), n);
    hidden = paidCycle(refreshKnownBudget(hidden, n * 100), n);
    assert.equal(childJson(ordinary), childJson(hidden), 'child-visible worlds before compaction');
    const a = rollover(ordinary), b = rollover(hidden);
    assert.equal(a.needsBudgetRefresh, b.needsBudgetRefresh);
    assert.deepEqual(capsuleShape(a.capsules), capsuleShape(b.capsules), 'private matches cannot veto visible archival');
    assert.equal(a.capsules.length > 0, true, 'authorized settled-component positive control');
    assert.equal(childJson(a.state), childJson(b.state), 'child-visible worlds after compaction');
    for (const forbidden of ['matching', 'sourceCents', 'invalidatedCents', 'archivedPaidCents', 'checkpoint', 'effects', 'revision']) {
      assert.equal(childJson(b.state).includes(`"${forbidden}"`), false, forbidden);
    }
    ordinary = a.state; hidden = b.state;
  }
});

test('cancelled visible goal retention cannot depend on an unrevealed private match reference', () => {
  const close = (state: FinanceState) => send(paidCycle(state, 0), KID, 'cancel-goal', { kind: 'cancel_goal', goalId: 'g', note: 'Fictional closed goal' });
  const ordinary = close(begin()), hidden = close(begin(true));
  assert.equal(childJson(ordinary), childJson(hidden), 'identical visible closed-goal positive control');
  const a = rollover(ordinary), b = rollover(hidden);
  assert.deepEqual(capsuleShape(a.capsules), capsuleShape(b.capsules));
  assert.equal(childJson(a.state), childJson(b.state), 'a private reference must not decide which visible goals disappear');
});

test('paid folding and exact capsule hydration occur once without mutating the source book', () => {
  const golden = paidCycle(begin(), 0), compacted = rollover(golden);
  assert.equal(compacted.capsules.length, 1);
  assert.equal(compacted.book.archivedPaidCents, 100);
  assert.equal(compacted.book.occurrences.length, 0);
  assert.equal(compacted.book.payouts.length, 0);
  const onceMore = compactBook(compacted.book, CHILD);
  assert.equal(onceMore.book.archivedPaidCents, 100);
  assert.equal(onceMore.capsules.length, 0);
  const before = canonical(compacted.book), hydrated = hydrateBook(compacted.book, compacted.capsules[0], CHILD);
  assert.equal(canonical(compacted.book), before, 'hydrate must not mutate the published source');
  assert.equal(hydrated.archivedPaidCents, 0);
  assertGolden(withBook(compacted.state, hydrated), golden);
  const hydratedBefore = canonical(hydrated);
  assert.throws(() => hydrateBook(hydrated, compacted.capsules[0], CHILD), 'same payload cannot be folded out twice');
  assert.equal(canonical(hydrated), hydratedBefore);
  const indexed = exportBooks(refreshKnownBudget(withBook(compacted.state, hydrated), 100))[CHILD];
  const rearchived = compactBook(indexed, CHILD);
  assert.equal(rearchived.needsBudgetRefresh, false);
  assert.equal(rearchived.book.archivedPaidCents, 100, 'rearchive adds exactly the removed contribution');
});

test('old paid earning and payment corrections match golden with archived private match sources', () => {
  let golden = paidCycle(begin(true), 0, true);
  let archived = rollover(golden);
  assert.equal(archived.book.matches.length, 0);
  assert.equal(archived.privateCapsules.length, 1);
  const privateCapsule = archived.privateCapsules[0];
  assert.deepEqual(privateCapsule.match, exportBooks(golden)[CHILD].matches[0], 'the exact private source record survives outside the hot book');
  assert.equal(privateCapsule.match.sourceCents[`chore-0:${DAY}`], 100);
  let actual = withBook(archived.state, hydrateBook(archived.book, archived.capsules[0], CHILD));
  const reverseEarning: Input = { kind: 'reverse_earning', occurrenceId: `chore-0:${DAY}`, note: 'Fictional old correction' };
  golden = send(golden, PARENT, 'old-earning-correction', reverseEarning);
  actual = send(actual, PARENT, 'old-earning-correction', reverseEarning);
  assertGolden(actual, golden, true);
  assert.deepEqual(financeView(actual, KID, CHILD, AT).balances, { plannedCents: 0, pendingCents: 0, earnedCents: 0, availableCents: 0, earmarkedCents: 0, heldPayoutCents: 0, paidCents: 100, unpaidCents: 0, correctionDueCents: 100 });
  archived = rollover(refreshKnownBudget(actual, 100));
  assert.equal(archived.capsules.length, 1, 'verified budget permits re-archival between the two old corrections');
  actual = withBook(archived.state, hydrateBook(archived.book, archived.capsules[0], CHILD));
  const reversePayment: Input = { kind: 'reverse_payment', paymentId: 'payment-0', note: 'Fictional old report correction' };
  golden = send(golden, PARENT, 'old-payment-correction', reversePayment);
  actual = send(actual, PARENT, 'old-payment-correction', reversePayment);
  assertGolden(actual, golden, true);
  const view = financeView(actual, KID, CHILD, AT);
  assert.equal(view.balances.paidCents, 0); assert.equal(view.balances.correctionDueCents, 0); assert.equal(view.balances.unpaidCents, 0);
  const reconcile: Input = { kind: 'reconcile_match', matchId: 'allocate-0:match', amountCents: 50, resolution: 'report_corrected', paidAt: AT, note: 'Fictional match correction' };
  actual = withBook(actual, hydratePrivateMatch(exportBooks(actual)[CHILD], privateCapsule, CHILD, AT, 'UTC'));
  golden = send(golden, PARENT, 'private-reconciliation', reconcile);
  actual = send(actual, PARENT, 'private-reconciliation', reconcile);
  assertGolden(actual, golden);
});

test('reversing an archived payment reopens exact held cents and prevents premature component retirement', () => {
  const golden = paidCycle(begin(), 0), archived = rollover(golden);
  let actual = withBook(archived.state, hydrateBook(archived.book, archived.capsules[0], CHILD));
  const action: Input = { kind: 'reverse_payment', paymentId: 'payment-0', note: 'Fictional reversal' };
  actual = send(actual, PARENT, 'reopen', action);
  assertGolden(actual, send(golden, PARENT, 'reopen', action));
  const result = rollover(actual), balances = financeView(result.state, KID, CHILD, AT).balances;
  assert.equal(result.capsules.length, 0, 'positive reopened held lots remain actionable');
  assert.equal(result.book.archivedPaidCents, 0);
  assert.equal(balances.earnedCents, 100); assert.equal(balances.paidCents, 0); assert.equal(balances.heldPayoutCents, 100);
  assert.equal(result.book.payouts[0].lots.every(lot => lot.eligible === false), true, 'payment reversal never regenerates matching eligibility');
});

test('public source closure retains a partially settled component while checkpoint corrections preserve a hot private source', () => {
  const mixed = (hidden: boolean) => {
    let state = approvedEarning(approvedEarning(begin(hidden), 0, 50), 1, 50);
    state = send(state, KID, 'mixed-allocation', { kind: 'allocate', goalId: 'g', amountCents: 100 });
    if (hidden) state = send(state, PARENT, 'mixed-funding', { kind: 'fund_match', matchId: 'mixed-allocation:match', amountCents: 50, method: 'manual', paidAt: AT });
    state = send(state, KID, 'partial-release', { kind: 'release_goal', goalId: 'g', amountCents: 50, note: 'Fictional partial release' });
    state = send(state, PARENT, 'mixed-payout', { kind: 'prepare_payout', amountCents: 50 });
    return send(state, PARENT, 'mixed-payment', { kind: 'report_payment', payoutId: 'mixed-payout', amountCents: 50, method: 'manual', paidAt: AT });
  };
  let golden = mixed(true);
  const archived = rollover(golden);
  const ordinary = rollover(mixed(false));
  assert.equal(archived.capsules.length, 0, 'all original public allocation sources stay connected to the remaining live lot');
  assert.deepEqual(capsuleShape(ordinary.capsules), capsuleShape(archived.capsules));
  assert.equal(childJson(ordinary.state), childJson(archived.state), 'the closure gate is independent of private matching');
  assert.equal(archived.book.occurrences.length, 2);
  assert.equal(archived.privateCapsules.length, 0);
  assert.equal(archived.book.matches[0].sourceCents[`chore-0:${DAY}`], 50, 'still-hot match retains the paid source');
  assert.equal(archived.book.matches[0].sourceCents[`chore-1:${DAY}`], 50);
  let actual = archived.state;
  const actions: Input[] = [
    { kind: 'reverse_earning', occurrenceId: `chore-0:${DAY}`, note: 'Fictional shared-source correction' },
    { kind: 'reverse_payment', paymentId: 'mixed-payment', note: 'Fictional old payment correction' },
  ];
  for (const [n, action] of actions.entries()) {
    actual = send(actual, PARENT, `mixed-correction-${n}`, action);
    golden = send(golden, PARENT, `mixed-correction-${n}`, action);
    assertGolden(actual, golden);
  }
  const balances = financeView(actual, KID, CHILD, AT).balances;
  assert.equal(balances.earnedCents, 50); assert.equal(balances.earmarkedCents, 50);
  assert.equal(balances.paidCents, 0); assert.equal(balances.correctionDueCents, 0);
});

test('transfer-carried allocation provenance prevents private archival through free, held and paid lot stages', () => {
  let state = approvedEarning(begin(true), 0);
  state = send(state, KID, 'second-goal', { kind: 'create_goal', goalId: 'g2', title: 'Fictional second goal', targetCents: 1_000_000 });
  state = send(state, KID, 'origin-allocation', { kind: 'allocate', goalId: 'g', amountCents: 100 });
  state = send(state, KID, 'transfer', { kind: 'transfer_goal', fromGoalId: 'g', toGoalId: 'g2', amountCents: 100 });
  assert.equal(exportBooks(state)[CHILD].allocations.find(a => a.id === 'transfer')?.lots[0].matchAllocationId, 'origin-allocation');
  state = send(state, KID, 'release-transferred', { kind: 'release_goal', goalId: 'g2', amountCents: 100, note: 'Fictional transfer release' });
  const retained = (value: FinanceState) => {
    const result = compactPrivateMatches(exportBooks(value)[CHILD], CHILD, AT, 'UTC');
    assert.equal(result.capsules.length, 0, 'a positive original-allocation reference remains live');
    assert.equal(result.book.matches.length, 1);
  };
  retained(state); // Released free lot.
  state = send(state, PARENT, 'transfer-payout', { kind: 'prepare_payout', amountCents: 100 });
  retained(state); // Payout-held lot.
  state = send(state, PARENT, 'transfer-payment', { kind: 'report_payment', payoutId: 'transfer-payout', amountCents: 100, method: 'manual', paidAt: AT });
  retained(state); // Positive original payment-source lot, even though own money is paid.
  const archived = rollover(state);
  assert.equal(archived.capsules.length, 1); assert.equal(archived.privateCapsules.length, 1);
  assert.equal(archived.book.matches.length, 0);
  assert.equal(financeView(archived.state, KID, CHILD, AT).balances.paidCents, 100);
});

test('funded private archive preserves reveal progress, rejects corrupt correction facts and hydrates old months exactly once', () => {
  let golden = paidCycle(begin(true), 0, true);
  const archived = rollover(golden), privateCapsule = archived.privateCapsules[0];
  assert.equal(privateCapsule.match.correctionDueCents, 50);
  const corrupt = structuredClone(privateCapsule); corrupt.match.correctionDueCents = 49;
  assert.throws(() => validatePrivateCapsule(corrupt, CHILD));
  assert.throws(() => hydratePrivateMatch(archived.book, privateCapsule, 'another-child', AT, 'UTC'));
  let book = hydrateBook(archived.book, archived.capsules[0], CHILD);
  book = hydratePrivateMatch(book, privateCapsule, CHILD, AT, 'UTC');
  assert.equal(book.archivedMatches?.usedCents, 0, 'current-month usage is moved back to the hot exact record');
  const before = canonical(book);
  assert.throws(() => hydratePrivateMatch(book, privateCapsule, CHILD, AT, 'UTC'));
  assert.equal(canonical(book), before);
  let actual = withBook(archived.state, book);
  const reveal: Input = { kind: 'reveal_match', matchId: 'allocate-0:match' };
  actual = send(actual, PARENT, 'old-reveal', reveal); golden = send(golden, PARENT, 'old-reveal', reveal);
  assertGolden(actual, golden);
  const revealedArchive = rollover(refreshKnownBudget(actual, 100));
  assert.equal(financeView(revealedArchive.state, KID, CHILD, AT).goals[0].parentContributedCents, 50);
  assert.equal(financeView(revealedArchive.state, KID, CHILD, AT).goals[0].progressCents, 50);
  const december = '2026-12-01T12:00:00.000Z';
  const moved = compactPrivateMatches(revealedArchive.book, CHILD, december, 'UTC');
  assert.equal(moved.book.archivedMatches?.usedCents, 0);
  const restored = hydratePrivateMatch(moved.book, revealedArchive.privateCapsules[0], CHILD, december, 'UTC');
  assert.equal(restored.archivedMatches?.usedCents, 0, 'November hydration cannot debit December usage');
  const futureState = withBook(revealedArchive.state, restored);
  assert.deepEqual(financeView(futureState, KID, CHILD, december).goals, financeView(golden, KID, CHILD, december).goals);
  assert.equal(financeView(futureState, PARENT, CHILD, december).matching?.usedCents, 0);
  assert.throws(() => compactPrivateMatches(moved.book, CHILD, AT, 'UTC'), 'an old timestamp cannot roll a summary month backward');
});

test('wrong child, checkpoint version and corrupt integer totals fail closed', () => {
  const archived = rollover(paidCycle(begin(), 0)), capsule = archived.capsules[0];
  assert.throws(() => hydrateBook(archived.book, capsule, 'another-child'));
  assert.throws(() => financeView(archived.state, { role: 'child', childId: 'another-child' }, CHILD, AT));
  const checkpoint = archived.state.checkpoint!;
  validateCheckpoint(checkpoint, [CHILD]);
  const wrongVersion = structuredClone(checkpoint) as unknown as { version: number };
  wrongVersion.version = 2;
  assert.throws(() => validateCheckpoint(wrongVersion as unknown as FinanceCheckpoint, [CHILD]));
  for (const bad of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    const corrupt = structuredClone(checkpoint);
    corrupt.books[CHILD].archivedPaidCents = bad;
    assert.throws(() => validateCheckpoint(corrupt, [CHILD]), `unsafe folded cents:${String(bad)}`);
    const brokenCapsule = structuredClone(capsule); brokenCapsule.paidCents = bad;
    assert.throws(() => hydrateBook(archived.book, brokenCapsule, CHILD), `unsafe capsule cents:${String(bad)}`);
  }
});

test('a full actionable hot collection cannot lose folded cents when an old capsule cannot fit', () => {
  const archived = rollover(paidCycle(begin(), 0));
  let state = refreshKnownBudget(archived.state, 100);
  for (let n = 0; n < 100; n++) state = send(state, PARENT, `hot-assign-${n}`, { kind: 'assign_chore', choreId: `hot-${n}`, title: 'Fictional future task', rewardCents: 100, dates: [DAY] });
  const book = exportBooks(state)[CHILD], before = canonical(book);
  assert.equal(book.occurrences.length, 100);
  assert.throws(() => hydrateBook(book, archived.capsules[0], CHILD), 'reopening cannot silently exceed the actionable bound');
  assert.equal(canonical(book), before, 'capacity denial must not consume folded money or capsule state');
  const balances = financeView(state, KID, CHILD, AT).balances;
  assert.equal(balances.paidCents, 100); assert.equal(balances.plannedCents, 10_000);
});

test('a permitted empty twelve-child roster does not exhaust the family checkpoint through private-only reserve', t => {
  const children = Array.from({ length: 12 }, (_, n) => ({ id: `fictional-child-${n}`, name: `Fictional child ${n}` }));
  const state = createFinanceState('UTC', children);
  const checkpoint: FinanceCheckpoint = { version: 1, lastEventAt: null, books: exportBooks(state), activity: Object.fromEntries(children.map(c => [c.id, { visible: [], parent: [] }])) };
  t.diagnostic(`Empty twelve-child checkpoint: actual ${Buffer.byteLength(JSON.stringify(checkpoint))} bytes; public potential ${potentialCheckpointBytes(checkpoint)} bytes; limit ${CHECKPOINT_LIMITS.bytes}.`);
  assert.doesNotThrow(() => validateCheckpoint(checkpoint, children.map(c => c.id)), 'private parent-history reserve must not make the permitted empty family impossible');
});

test('visible worst-case provenance is charged equally before actual private bytes diverge', () => {
  const sourceKeys = Array.from({ length: 100 }, (_, n) => `${'s'.repeat(150)}${String(n).padStart(3, '0')}`);
  const sourceCents = Object.fromEntries(sourceKeys.map(id => [id, 1]));
  const provenanceBook = (count: number, hidden: boolean): ChildBook => {
    const book = exportBooks(begin(hidden))[CHILD];
    book.earnedCents = count * 100; book.archivedPaidCents = count * 99;
    book.occurrences = [{ id: sourceKeys[0], choreId: 'fictional-provenance', title: 'Fictional source', instructions: '', dueDate: DAY, rewardCents: count, status: 'approved', note: '', approvedAt: AT }];
    book.allocations = Array.from({ length: count }, (_, n) => ({ id: `origin-${n}`, goalId: 'g', originalCents: 100, releasedCents: 99, sourceCents: { ...sourceCents }, lots: [{ earningId: sourceKeys[0], cents: 1, eligible: true, earnedAt: AT, matchAllocationId: `origin-${n}` }] }));
    book.matches = hidden ? book.allocations.map(a => ({ id: `${a.id}:match`, goalId: 'g', allocationId: a.id, cents: 50, activeCents: 1, fundedCents: 0, parentReportedFundingCents: 0, reconciledCents: 0, reversedCents: 49, correctionDueCents: 0, month: '2026-11', revealed: false, createdAt: AT, status: 'pledged', sourceCents: { ...sourceCents }, invalidatedCents: Object.fromEntries(sourceKeys.slice(1).map(id => [id, 1])), eligibleBaseCents: 100 })) : [];
    return book;
  };
  const smallA = provenanceBook(8, false), smallB = provenanceBook(8, true);
  validateBook(smallA); validateBook(smallB);
  assert.equal(potentialBookBytes(smallA), potentialBookBytes(smallB), 'potential cost uses public source keys, not real matching');
  const a = provenanceBook(32, false), b = provenanceBook(32, true);
  assert.equal(Buffer.byteLength(JSON.stringify(a)) < CHECKPOINT_LIMITS.bookBytes, true, 'ordinary actual representation is below the physical limit');
  assert.equal(Buffer.byteLength(JSON.stringify(b)) > CHECKPOINT_LIMITS.bookBytes, true, 'private actual representation would hit first without a potential guard');
  assert.equal(potentialBookBytes(a), potentialBookBytes(b));
  const code = (book: ChildBook) => { try { validateBook(book); return 'accepted'; } catch (error) { return (error as { code?: string }).code; } };
  assert.equal(code(a), 'invalid_checkpoint'); assert.equal(code(b), 'invalid_checkpoint');
});

test('matching-heavy settled history cannot turn a private checkpoint limit into child-visible failure', async t => {
  let ordinary = begin(), hidden = begin(true);
  //64 cycles exceed the former128 ordinary-action lifetime while asserting zero retained
  //private history after EVERY rollover; byte/provenance limits are tested separately above.
  const cycles = 64;
  let privateArchives = 0, visibleArchives = 0;
  for (let n = 0; n < cycles; n++) {
    const a = rollover(paidCycle(refreshKnownBudget(ordinary, n * 100), n));
    const b = rollover(paidCycle(refreshKnownBudget(hidden, n * 100), n));
    assert.deepEqual(capsuleShape(a.capsules), capsuleShape(b.capsules));
    assert.equal(b.book.matches.length, 0, 'fully invalidated settled private history must leave the bounded hot book');
    privateArchives += b.privateCapsules.length; visibleArchives += b.capsules.length;
    ordinary = a.state; hidden = b.state;
    assert.equal(childJson(ordinary), childJson(hidden));
    if (n % 32 === 0) await new Promise<void>(resolve => setImmediate(resolve));
  }
  const a = exportBooks(ordinary)[CHILD], b = exportBooks(hidden)[CHILD];
  assert.equal(a.occurrences.length + a.payouts.length, 0);
  assert.equal(b.occurrences.length + b.payouts.length, 0);
  assert.equal(a.matches.length + b.matches.length, 0);
  assert.equal(visibleArchives, cycles); assert.equal(privateArchives, cycles);
  assert.equal(b.archivedPaidCents, cycles * 100);
  assert.equal(financeView(hidden, KID, CHILD, AT).balances.earnedCents, cycles * 100);
  t.diagnostic(`${cycles} real matching-heavy rollovers: ${visibleArchives} visible and ${privateArchives} private immutable payloads returned; zero retained hot matches. Pure-domain evidence, not SQL archive/hosted capacity proof.`);
});
