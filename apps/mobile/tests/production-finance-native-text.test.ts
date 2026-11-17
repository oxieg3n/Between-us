import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as calendar from '../src/finance/money-calendar';
import type { FinanceView } from '../src/finance/types';

const source = readFileSync(new URL('../src/production/Finance.tsx', import.meta.url), 'utf8');
const compile = (text: string) => ts.transpileModule(text, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText;

/** Inspect the compiler's actual children output, including whitespace React will render. */
function emittedNativeText(text: string): string[] {
  const tree = ts.createSourceFile('finance.js', compile(text), ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const found: string[] = [], hosts = new Set(['View', 'ScrollView', 'Paper']);
  const name = (node: ts.Node) => ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? node.name.text : '';
  function children(call: ts.CallExpression): ts.Expression | undefined {
    const props = call.arguments[1];
    if (!props || !ts.isObjectLiteralExpression(props)) return;
    const child = props.properties.find(p => ts.isPropertyAssignment(p) && name(p.name) === 'children');
    return child && ts.isPropertyAssignment(child) ? child.initializer : undefined;
  }
  function literals(value: ts.Expression | undefined, host: string) {
    if (!value) return;
    if (ts.isStringLiteral(value) && value.text || ts.isNumericLiteral(value)) found.push(`${host}: ${value.getText(tree)}`);
    else if (ts.isArrayLiteralExpression(value)) value.elements.forEach(item => literals(item, host));
    else if (ts.isCallExpression(value) && value.arguments[0] && name(value.arguments[0]) === 'Fragment') literals(children(value), host);
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.arguments[0] && hosts.has(name(node.arguments[0]))) literals(children(node), name(node.arguments[0]));
    ts.forEachChild(node, visit);
  }
  visit(tree); return found;
}

test('native text gate catches emitted inline space even when both adjacent controls are false', () => {
  assert.equal(emittedNativeText('const row = <View>{false && <Button/>} {false && <Button/>}</View>;').length, 1);
  assert.deepEqual(emittedNativeText('const row = <View>\n {false && <Button/>}\n {false && <Button/>}\n</View>;'), []);
  assert.deepEqual(emittedNativeText('const row = <View><Text>Readable payment status</Text></View>;'), []);
});

test('financial native containers emit no bare literal text children', () => {
  assert.deepEqual(emittedNativeText(source), []);
});

type Node = { type: string | symbol; props: { children?: unknown; label?: string } };
function paymentFixture(parent: boolean) {
  const jsx = (type: Node['type'], props: Node['props']) => ({ type, props });
  const native = { View: 'View', ScrollView: 'ScrollView' };
  const ui = { Body: 'Text', Heading: 'Text', Eyebrow: 'Text', Paper: 'View', Button: 'Button', Field: 'Field', Divider: 'Divider' };
  const box = { exports: {} as { payout?: (props: unknown) => unknown } };
  vm.runInNewContext(`${compile(source)}\nexports.payout = Payouts;`, {
    exports: box.exports, module: box,
    require: (name: string) => name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: Symbol.for('fragment') }
      : name === 'react' ? { useState: (value: unknown) => [value, () => {}] }
        : name === 'react-native' ? native : name === '../ui' ? ui
          : name === '../adaptive-writing-text' ? { Text: 'Text' } : name === '../finance/money-calendar' ? calendar : {},
  });
  const view: FinanceView = { childId: 'fictional-child', childName: 'Fictional child', timezone: 'UTC', occurrences: [], goals: [], savingsRules: [], activity: [],
    balances: { plannedCents: 0, pendingCents: 0, earnedCents: 100, availableCents: 0, earmarkedCents: 0, heldPayoutCents: 0, paidCents: 100, unpaidCents: 0, correctionDueCents: 0 },
    payout: { due: false, eligibleCents: 0, periodKey: '', label: 'Manual execution only; schedules are payment reminders.' },
    payouts: [{ id: 'fictional-payout', amountCents: 100, remainingCents: 0, paidCents: 100, createdAt: '2026-11-16T12:00:00.000Z', status: 'parent_reported_paid',
      payments: [{ id: 'fictional-payment', amountCents: 100, method: 'cash', paidAt: '2026-11-16T12:00:00.000Z', note: '', childAcknowledged: true, reversed: false }] }],
  };
  return box.exports.payout!({ view, parent, review: () => {} });
}

test('acknowledged hot payment renders valid native children with child receipt controls absent', () => {
  const invalid: string[] = [], labels: string[] = [];
  function walk(value: unknown, text = false) {
    if (Array.isArray(value)) { value.forEach(child => walk(child, text)); return; }
    if (typeof value === 'string' || typeof value === 'number') { if (!text && value !== '') invalid.push(JSON.stringify(value)); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Node;
    if (node.props.label) labels.push(node.props.label);
    walk(node.props.children, node.type === 'Text' || typeof node.type === 'symbol' && text);
  }
  walk(paymentFixture(false));
  assert.equal(labels.some(label => label.includes('receipt acknowledgment') || label.includes('Correct payment report')), false);
  assert.deepEqual(invalid, []);
});
