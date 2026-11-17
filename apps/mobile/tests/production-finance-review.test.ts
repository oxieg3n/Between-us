import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as calendar from '../src/finance/money-calendar';
import { createFinanceMutation, type ProductionFinanceAction } from '../src/production/pending-finance-policy';

type Element = { type: string | symbol | ((props: Record<string, unknown>) => unknown); props: Record<string, unknown> };
type Reviewed = { action: ProductionFinanceAction; title: string; detail: string };
type Match = { id: string; goalId: string; allocationId: string; cents: number; activeCents: number; fundedCents: number; correctionDueCents: number; month: string; createdAt: string; revealed: boolean };

/** Render the actual TSX callbacks with native hosts stubbed; no server/native execution. */
function mount(file: string, component: string, data: unknown, parent = true) {
  const source = readFileSync(new URL(`../src/production/${file}.tsx`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const slots: unknown[] = [], effects = new Set<number>(), reviews: Reviewed[] = []; let cursor = 0;
  const queue = createFinanceMutation(async () => { throw Error('The test never sends money actions.'); }, () => '85000000-0000-0000-0000-000000000001');
  const react = {
    useState(initial: unknown) {
      const index = cursor++; if (!Object.hasOwn(slots, index)) slots[index] = initial;
      return [slots[index], (value: unknown) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial: unknown) { const index = cursor++; if (!Object.hasOwn(slots, index)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(effect: () => unknown) { const index = cursor++; if (!effects.has(index)) { effects.add(index); effect(); } },
  };
  const jsx = (type: Element['type'], props: Element['props']) => ({ type, props });
  const box = { exports: {} as Record<string, (props: Record<string, unknown>) => unknown> };
  vm.runInNewContext(`${compiled}\nexports.fixtureComponent = ${component};`, { exports: box.exports, module: box,
    require: (name: string) => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: Symbol.for('fragment') }
      : name === 'react-native' ? { View: 'View', ScrollView: 'ScrollView' }
        : name === '../adaptive-writing-text' ? { Text: 'Text' }
          : name === '../ui' ? { Body: 'Text', Heading: 'Text', Eyebrow: 'Text', Paper: 'View', Button: 'Button', Field: 'Field', Divider: 'Divider' }
            : name === '../finance/money-calendar' ? calendar : name === './client' ? { accountApi: async () => data } : {},
  });
  const props = { path: '/v1/finance/fictional-family/own-child', authorId: 'own-parent', parent, view: data,
    review(action: ProductionFinanceAction, title: string, detail: string) {
      const staged = queue.stage(action); reviews.push({ action: JSON.parse(JSON.stringify(staged.action)), title, detail }); queue.cancel();
    } };
  function elements() {
    cursor = 0; const result: Element[] = [];
    function walk(value: unknown) {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (!value || typeof value !== 'object' || !('props' in value)) return;
      const node = value as Element;
      if (typeof node.type === 'function') { walk(node.type(node.props)); return; }
      result.push(node); walk(node.props.children);
    }
    walk(box.exports.fixtureComponent(props)); return result;
  }
  return { reviews,
    press(label: string) {
      const button = elements().find(node => node.type === 'Button' && node.props.label === label);
      assert.ok(button, `Missing button: ${label}`); assert.notEqual(button.props.disabled, true, label);
      (button.props.onPress as () => void)();
    },
    field(label: string, value: string) {
      const field = elements().find(node => node.type === 'Field' && node.props.label === label);
      assert.ok(field, `Missing field: ${label}`); (field.props.onChangeText as (value: string) => void)(value);
    },
    labels: () => elements().filter(node => node.type === 'Button').map(node => node.props.label),
  };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(suffix: string) {
  const occurrence = { id: `earning-${suffix}`, choreId: `task-${suffix}`, title: 'Fictional shared title', dueDate: '2026-10-01', rewardCents: 123, status: 'approved', note: '', reversed: false };
  const payment = { id: `payment-${suffix}`, amountCents: 125, method: 'cash', paidAt: '2026-10-02T12:30:00.000Z', childAcknowledged: false, reversed: false, note: '' };
  const payout = { id: `payout-${suffix}`, amountCents: 125, paidCents: 125, remainingCents: 0, createdAt: '2026-10-02T11:00:00.000Z', status: 'parent_reported_paid', payments: [payment] };
  return { occurrence, payment, payout, page: { items: [{ id: `visible-capsule-${suffix}`, occurrences: [occurrence], payouts: [payout] }], nextAfterId: null } };
}
async function archived(suffix: string, parent = true) {
  const f = fixture(suffix), h = mount('FinanceHistory', 'ArchivedFinanceHistory', f.page, parent);
  h.press('Load older settled records'); await flush();
  h.press(`Open settled record: ${f.occurrence.title} · ${f.occurrence.dueDate}`);
  if (parent) h.field('Reason for a historical correction', `Exact reason ${suffix}`);
  return { f, h };
}
function identifies(review: Reviewed, expected: string[], forbidden: string) {
  expected.forEach(value => assert.ok(review.detail.includes(value), `Missing ${value}: ${review.detail}`));
  assert.equal(review.detail.includes(forbidden), false);
}

test('historical earning confirmation identifies two otherwise identical records and the exact staged reason', async () => {
  for (const suffix of ['A', 'B']) {
    const { f, h } = await archived(suffix); h.press(`Review historical earning correction: ${f.occurrence.title}`);
    const r = h.reviews[0]; assert.deepEqual(r.action, { kind: 'reverse_earning', occurrenceId: f.occurrence.id, note: `Exact reason ${suffix}` });
    identifies(r, [f.occurrence.title, f.occurrence.dueDate, '$1.23', `Earning reference: ${f.occurrence.id}`, `Exact reason ${suffix}`], `earning-${suffix === 'A' ? 'B' : 'A'}`);
  }
});

test('historical payment correction identifies the selected report and exact staged reason', async () => {
  for (const suffix of ['A', 'B']) {
    const { f, h } = await archived(suffix); h.press('Review historical payment correction');
    const r = h.reviews[0]; assert.deepEqual(r.action, { kind: 'reverse_payment', paymentId: f.payment.id, note: `Exact reason ${suffix}` });
    identifies(r, ['$1.25', 'cash', f.payment.paidAt, `Payment reference: ${f.payment.id}`, `Exact reason ${suffix}`], `payment-${suffix === 'A' ? 'B' : 'A'}`);
  }
});

test('child historical receipt confirmation identifies its own report without parent-only controls', async () => {
  for (const suffix of ['A', 'B']) {
    const { f, h } = await archived(suffix, false);
    assert.equal(h.labels().includes('Review historical payment correction'), false);
    assert.equal(h.labels().some(label => String(label).includes('earning correction')), false);
    h.press('Review historical receipt acknowledgment'); const r = h.reviews[0];
    assert.deepEqual(r.action, { kind: 'acknowledge_payment', paymentId: f.payment.id });
    identifies(r, ['$1.25', 'cash', f.payment.paidAt, `Payment reference: ${f.payment.id}`], 'private-match');
  }
});

const matchFixture = (suffix: string): Match => ({ id: `private-match-${suffix}`, goalId: 'fictional-goal', allocationId: `allocation-${suffix}`, cents: 200,
  activeCents: 150, fundedCents: 100, correctionDueCents: 50, month: '2026-10', createdAt: '2026-10-01T12:00:00.000Z', revealed: false });
test('open and settled matching reviews bind target, exact money, date, reason and selected resolution', async () => {
  for (const suffix of ['A', 'B']) for (const open of [true, false]) {
    const match = { ...matchFixture(suffix), ...(!open ? { activeCents: 50, fundedCents: 50 } : {}) };
    const data = { items: open ? [match] : [{ id: `private-capsule-${suffix}`, match }], nextAfterId: null };
    const h = mount('ParentMatchHistory', 'ParentMatchHistory', data);
    h.press(open ? 'Load open matching records' : 'Load older parent matching records'); await flush();
    h.field('Funding or reconciliation amount (USD)', '0.25'); h.field('Actual funding or reconciliation date (YYYY-MM-DD UTC)', '2026-10-03');
    h.field('Funding or correction reason', `Exact reason ${suffix}`); h.press('Parent reports money returned');
    h.press('Review revealing this retained contribution');
    if (open) { h.press('Review funding this open commitment'); h.press('Review correcting this open commitment'); }
    else { assert.equal(h.labels().includes('Review funding this open commitment'), false); assert.equal(h.labels().includes('Review correcting this open commitment'), false); }
    h.press('Review retained contribution reconciliation');
    for (const r of h.reviews) {
      assert.equal('matchId' in r.action && r.action.matchId, match.id);
      identifies(r, [match.month, match.createdAt, `Reference: ${match.id}`, '$2.00', calendar.formatMoney(match.activeCents), calendar.formatMoney(match.fundedCents)], `private-match-${suffix === 'A' ? 'B' : 'A'}`);
      if (r.action.kind === 'reveal_match') assert.deepEqual(r.action, { kind: 'reveal_match', matchId: match.id });
      else {
        assert.equal('note' in r.action && r.action.note, `Exact reason ${suffix}`); assert.ok(r.detail.includes(`Exact reason ${suffix}`));
        if (r.action.kind === 'fund_match' || r.action.kind === 'reconcile_match') {
          assert.equal(r.action.amountCents, 25); assert.equal(r.action.paidAt, '2026-10-03T00:00:00.000Z');
          identifies(r, ['$0.25', '2026-10-03'], 'another-child');
          if (r.action.kind === 'fund_match') { assert.equal(r.action.method, 'manual'); assert.ok(r.detail.includes('manually')); }
          else { assert.equal(r.action.resolution, 'parent_reported_returned'); assert.ok(r.detail.includes('parent reported returned')); }
        }
      }
    }
    assert.equal(h.reviews.length, open ? 4 : 2);
  }
});

function currentView(suffix: string) {
  const f = fixture(suffix);
  return { ...f, view: { childId: 'own-child', childName: 'Fictional child', timezone: 'UTC', occurrences: [], goals: [], savingsRules: [], activity: [],
    balances: { availableCents: 0, earmarkedCents: 0, heldPayoutCents: 0, paidCents: 125, unpaidCents: 0, correctionDueCents: 0 },
    payout: { due: false, eligibleCents: 0, label: 'Manual reports only.' }, payouts: [f.payout] } };
}
test('current hot payment correction and child acknowledgment identify the exact retained payment', () => {
  for (const suffix of ['A', 'B']) for (const parent of [true, false]) {
    const f = currentView(suffix), h = mount('Finance', 'Payouts', f.view, parent);
    if (parent) h.field('Payment or correction note', `Exact reason ${suffix}`);
    h.press(parent ? 'Correct payment report 1.1' : 'Review receipt acknowledgment 1.1');
    const r = h.reviews[0]; assert.deepEqual(r.action, parent ? { kind: 'reverse_payment', paymentId: f.payment.id, note: `Exact reason ${suffix}` } : { kind: 'acknowledge_payment', paymentId: f.payment.id });
    identifies(r, ['$1.25', 'cash', f.payment.paidAt, `Payment reference: ${f.payment.id}`, ...(parent ? [`Exact reason ${suffix}`] : [])], `payment-${suffix === 'A' ? 'B' : 'A'}`);
  }
});

test('main live matching callbacks identify each contribution and the one built funding/reconciliation action', () => {
  for (const suffix of ['A', 'B']) {
    const match = matchFixture(suffix), view = { goals: [], matching: { rule: { enabled: true }, usedCents: 150, remainingCents: 1850, parentBudgetRemainingCents: 1850, commitments: [match] } };
    const h = mount('Finance', 'Matching', view);
    h.field('Contribution or correction amount (USD)', '0.25'); h.field('Actual payment or correction date (YYYY-MM-DD UTC)', '2026-10-03'); h.field('Contribution or correction note', `Exact reason ${suffix}`);
    h.press('Review reveal: contribution 1'); h.press('Review funding report: contribution 1'); h.press('Correct commitment 1'); h.press('Review parent reported returned: contribution 1');
    assert.equal(h.reviews.length, 4);
    for (const r of h.reviews) {
      assert.equal('matchId' in r.action && r.action.matchId, match.id);
      identifies(r, [match.month, match.createdAt, `Reference: ${match.id}`, '$2.00', '$1.50', '$1.00', '$0.50'], `private-match-${suffix === 'A' ? 'B' : 'A'}`);
      if (r.action.kind !== 'reveal_match') { assert.equal('note' in r.action && r.action.note, `Exact reason ${suffix}`); assert.ok(r.detail.includes(`Exact reason ${suffix}`)); }
      if (r.action.kind === 'fund_match' || r.action.kind === 'reconcile_match') { assert.equal(r.action.amountCents, 25); assert.equal(r.action.paidAt, '2026-10-03T00:00:00.000Z'); identifies(r, ['$0.25', r.action.paidAt], 'another-child'); }
    }
  }
});
