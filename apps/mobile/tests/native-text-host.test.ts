import assert from 'node:assert/strict';
import test from 'node:test';
import {createNativeTextHostGate,createNativeTextHostGeneration,nativeTextMetricsKey} from '../src/native-text-host';

test('density changes with unchanged font scale select a fresh host; returning density still rejects old incarnation',()=>{
  const initial=nativeTextMetricsKey(1,2.625),small=nativeTextMetricsKey(1,2),tablet=nativeTextMetricsKey(1,1.5);
  assert.notEqual(initial,small);assert.notEqual(small,tablet);assert.notEqual(initial,nativeTextMetricsKey(1.3,2.625));
  const gate=createNativeTextHostGate<object>(),old=createNativeTextHostGeneration(initial),next=createNativeTextHostGeneration(small),restored=createNativeTextHostGeneration(nativeTextMetricsKey(1,2.625)),node={};
  gate.attach(old,{});gate.attach(next,{});gate.attach(restored,node);
  assert.equal(old.key,restored.key);assert.equal(gate.current(old),undefined);assert.equal(gate.current(next),undefined);assert.equal(gate.current(restored),node);
});

test('font1 → font2 → new font1 never admits the original same-scale host callback',()=>{
  const gate=createNativeTextHostGate<object>();
  const old1=createNativeTextHostGeneration('font:1'),scale2=createNativeTextHostGeneration('font:2'),new1=createNativeTextHostGeneration('font:1');
  const node1={},node2={},node3={};let words='Newer fictional writing';
  gate.attach(old1,node1);assert.equal(gate.current(old1),node1);
  assert.equal(gate.detach(old1),node1);gate.attach(scale2,node2);
  assert.equal(gate.detach(scale2),node2);gate.attach(new1,node3);
  assert.equal(old1.key,new1.key);assert.notEqual(old1,new1);
  if(gate.current(old1))words='Stale original host event';
  if(gate.current(scale2))words='Stale intermediate host event';
  assert.equal(words,'Newer fictional writing');assert.equal(gate.current(new1),node3);
  if(gate.current(new1))words+=' appended';assert.equal(words,'Newer fictional writing appended');
});
test('preparing or abandoning a concurrent generation does not revoke the committed attachment',()=>{
  const gate=createNativeTextHostGate<object>(),committed=createNativeTextHostGeneration('font:1'),node={};
  gate.attach(committed,node);
  const uncommitted=createNativeTextHostGeneration('font:2');
  assert.equal(gate.current(uncommitted),undefined);assert.equal(gate.current(committed),node);
  assert.equal(gate.detach(uncommitted),undefined);assert.equal(gate.current(committed),node);
});
test('old ref cleanup cannot detach the new host; unmounted host callbacks are denied',()=>{
  const gate=createNativeTextHostGate<object>(),old=createNativeTextHostGeneration('font:1'),current=createNativeTextHostGeneration('font:2'),node={};
  gate.attach(old,{});gate.attach(current,node);
  assert.equal(gate.detach(old),undefined);assert.equal(gate.current(current),node);
  assert.equal(gate.detach(current),node);assert.equal(gate.current(current),undefined);assert.equal(gate.current(old),undefined);
});
