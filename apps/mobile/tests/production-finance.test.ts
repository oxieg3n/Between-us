import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as calendar from "../src/finance/money-calendar";
import * as pendingFinance from '../src/production/pending-finance-policy';
import type { AccountContext } from "../src/production/client";
import type { FinanceView } from "../src/finance/types";

// The helpers share the owned component file. Stub native imports without rendering native UI in Node.
const source=readFileSync(new URL("../src/production/Finance.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleBox={exports:{}};
vm.runInNewContext(compiled,{exports:moduleBox.exports,module:moduleBox,require:(name:string)=>name==="../finance/money-calendar"?calendar:name==='./pending-finance-policy'?pendingFinance:{},console});
const helpers=moduleBox.exports as {
  financialScopes(context:AccountContext):{familyId:string;childId:string;name:string;parent:boolean}[];
  financePercent(value:string):number;
  reportedFinanceDay(value:string):string;
  createFinanceMutation(send:(value:{id:string;action:Record<string,unknown>})=>Promise<FinanceView>,makeId:()=>string):{
    pending():{id:string;action:Record<string,unknown>}|null;
    stage(value:Record<string,unknown>):{id:string;action:Record<string,unknown>};
    cancel():void;
    submit():Promise<FinanceView>;
  };
};
const context:AccountContext={user:{id:"child-user",displayName:"Fictional child",kind:"child",state:"active"},families:[{id:"family",name:"Fixture",timezone:"America/New_York"}],memberships:[{familyId:"family",role:"child",childId:"own-child"}],children:[{id:"own-child",familyId:"family",name:"Own child",state:"active",accountReady:true},{id:"sibling",familyId:"family",name:"Sibling",state:"active",accountReady:true},{id:"unrelated",familyId:"outside",name:"Outside",state:"active",accountReady:true}],policy:{guardianManagedChildren:true,noticeVersion:null,consentPolicyVersion:null}};
const result={childId:"own-child",balances:{availableCents:123}} as FinanceView;

test("production financial scope never turns a child context into sibling or guardian access",()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(helpers.financialScopes(context))),[{actorId:"child-user",familyId:"family",childId:"own-child",name:"Own child",parent:false}]);
  const forged={...context,memberships:[{familyId:"family",role:"guardian" as const,childId:null}]};
  assert.equal(helpers.financialScopes(forged).length,0);
  assert.equal(helpers.financialScopes({...context,user:{...context.user,state:"suspended"}}).length,0);
  assert.equal(helpers.financialScopes({...context,user:{...context.user,kind:"pending"}}).length,0);
  const parent={...context,user:{...context.user,kind:"parent" as const},memberships:[{familyId:"family",role:"guardian" as const,childId:null}]};
  assert.deepEqual(helpers.financialScopes(parent).map(s=>s.childId).sort(),["own-child","sibling"]);
});

test("financial selection skips pending-first, unknown and unready child identities rather than defaulting to an unauthorized record",()=>{
  const parent={...context,user:{...context.user,kind:"parent" as const},memberships:[{familyId:"family",role:"guardian" as const,childId:null}]};
  const unready:AccountContext["children"]=[
    {id:"pending-first",familyId:"family",name:"Pending setup",state:"pending",accountReady:false},
    {id:"missing-account",familyId:"family",name:"No identity",state:"active",accountReady:false},
    {id:"unknown",familyId:"family",name:"Older context"},
    {id:"unknown-state",familyId:"family",name:"Unknown state",accountReady:true},
    {id:"unknown-ready",familyId:"family",name:"Unknown readiness",state:"active"},
    {id:"suspended",familyId:"family",name:"Suspended",state:"suspended",accountReady:true},
    {id:"string-ready",familyId:"family",name:"Malformed readiness",state:"active",accountReady:"true" as never},
  ];
  assert.deepEqual(helpers.financialScopes({...parent,children:[...unready,...context.children]}).map(scope=>scope.childId),["own-child","sibling"]);
  assert.equal(helpers.financialScopes({...parent,children:unready}).length,0);
  assert.equal(helpers.financialScopes({...context,children:context.children.map(child=>child.id==="own-child"?{...child,accountReady:false}:child)}).length,0);
});

test("uncertain server response preserves the exact UUID and immutable action until acknowledgment",async()=>{
  let ids=0,attempt=0;const seen:string[]=[];
  const queue=helpers.createFinanceMutation(async request=>{seen.push(JSON.stringify(request));if(++attempt===1)throw new Error("timeout after possible commit");return result;},()=>`operation-${++ids}`);
  const action={kind:"configure_matching",rule:{enabled:true,percent:100,monthlyCapCents:2000,parentBudgetCents:2000,surprise:true}};
  const staged=queue.stage(action);action.rule.enabled=false;
  assert.equal((staged.action.rule as {enabled:boolean}).enabled,true);
  assert.ok(Object.isFrozen(staged));assert.ok(Object.isFrozen(staged.action.rule));
  await assert.rejects(queue.submit(),/timeout/);
  assert.throws(()=>queue.cancel(),/has not confirmed/);
  assert.throws(()=>queue.stage({kind:"allocate",goalId:"another",amountCents:100}),/pending/);
  assert.equal(await queue.submit(),result);
  assert.equal(seen[0],seen[1]);assert.equal(ids,1);assert.equal(queue.pending(),null);
});

test("a confirmed rejection permits a corrected action with a new identity",async()=>{
  let ids=0;const queue=helpers.createFinanceMutation(async()=>{throw Object.assign(new Error("invalid amount"),{confirmedRejected:true});},()=>`operation-${++ids}`);
  queue.stage({kind:"request_payout",amountCents:100});
  await assert.rejects(queue.submit(),/invalid amount/);
  assert.equal(queue.pending(),null);
  assert.equal(queue.stage({kind:"request_payout",amountCents:200}).id,"operation-2");
});

test("double tapping cannot create overlapping financial requests",async()=>{
  let release!:(view:FinanceView)=>void,calls=0;
  const queue=helpers.createFinanceMutation(()=>{calls++;return new Promise(resolve=>{release=resolve;});},()=>"operation");
  queue.stage({kind:"submit_chore",occurrenceId:"task:2026-11-16",note:"Done"});
  const first=queue.submit();await assert.rejects(queue.submit(),/ready/);assert.equal(calls,1);
  release(result);await first;assert.equal(queue.pending(),null);
});

test("review may be discarded before sending but server fields never enter a financial action",()=>{
  let ids=0;const queue=helpers.createFinanceMutation(async()=>result,()=>`operation-${++ids}`);
  for(const key of ["id","actor","role","at","childId"]) assert.throws(()=>queue.stage({kind:"request_payout",amountCents:100,[key]:"forged"}),/server assigns/);
  queue.stage({kind:"create_goal",goalId:"goal",title:"Bicycle",targetCents:5000});queue.cancel();
  assert.equal(queue.pending(),null);assert.equal(ids,1);
});

test("percentage input is exact and historical payment dates never manufacture a current clock",()=>{
  for(const value of ["1","25","100"])assert.equal(helpers.financePercent(value),Number(value));
  for(const value of ["0","101","1.5","1e2","01",""])assert.throws(()=>helpers.financePercent(value),/whole percentage/);
  assert.equal(helpers.reportedFinanceDay("2024-02-29"),"2024-02-29T00:00:00.000Z");
  assert.throws(()=>helpers.reportedFinanceDay("2026-02-29"),/valid/);
  assert.throws(()=>helpers.reportedFinanceDay(""),/valid/);
});
