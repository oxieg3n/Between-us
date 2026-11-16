import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as journalContacts from "../src/production/journal-contacts";
import type { AccountContext } from "../src/production/client";
import type { AuthorizedJournalContact } from "../src/production/journal-contacts";
import type { CirclePreparation } from "../src/production/Circle";

// Keep workflow tests in Node without loading native bindings or rendering UI.
const source=readFileSync(new URL("../src/production/Circle.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const box={exports:{}};
vm.runInNewContext(compiled,{exports:box.exports,module:box,require:(name:string)=>name==="./journal-contacts"?journalContacts:{},console});
type Rpc=<T>(name:string,args?:Record<string,unknown>,expectedUserId?:string)=>Promise<T>;
const helpers=box.exports as {
  circleGateway(expectedUserId:string,send:Rpc):Rpc;
  circlePeer(row:AuthorizedJournalContact,ownId:string):{id:string;name:string}|null;
  circlePermittedContacts(rows:readonly AuthorizedJournalContact[],ownId:string):AuthorizedJournalContact[];
  circleGuardian(context:AccountContext,familyId:string|null):boolean;
  externalCircleToken(value:string):string;
  openCircleConversation(options:{rpc:Rpc;ownId:string;contactId:string;preparation?:CirclePreparation;stillCurrent:()=>boolean}):Promise<{conversationId:string;peerId:string;text?:string}>;
};
const own="author-a",peer="peer-b";
const contact:AuthorizedJournalContact={id:"relationship-1",familyId:null,a:own,b:peer,aName:"My own name",bName:"Known person",
  acceptedByMe:true,bothAccepted:true,approvalA:true,approvalB:true,verified:true,external:true,managedChildId:null,managedChildName:null,
  revoked:false,canExchange:true,peerCategory:"trusted-person"};
const context:AccountContext={user:{id:own,displayName:"Own author",kind:"parent",state:"active"},families:[{id:"family",name:"Own family",timezone:"UTC"}],memberships:[{familyId:"family",role:"guardian",childId:null}],children:[],policy:{guardianManagedChildren:true,noticeVersion:null,consentPolicyVersion:null}};

test("accepted outside people are usable without inventing family membership; stale or managed child rows are not own recipients",()=>{
  const rows=[contact,{...contact,id:"unverified",verified:false},{...contact,id:"blocked",canExchange:false},
    {...contact,id:"removed",revoked:true},{...contact,id:"pending",bothAccepted:false,a:null,aName:null},
    {...contact,id:"another-author",a:"my-child",b:"their-contact",managedChildId:"child-registry-id"}];
  assert.deepEqual(helpers.circlePermittedContacts(rows,own).map(row=>row.id),[contact.id]);
  assert.equal(helpers.circlePeer({...contact,bName:null},own),null);
  assert.equal(helpers.circlePeer({...contact,bothAccepted:false},own),null);
  assert.equal(helpers.circlePeer(contact,"another-author"),null);
  assert.equal(helpers.circlePeer({...contact,a:peer,b:own,aName:" Known person "},own)?.name,"Known person");
});

test("every Circle request keeps its original expected author across an account switch",async()=>{
  let active=own;const dispatched:string[]=[];
  const send:Rpc=async<T,>(name:string,_args?:Record<string,unknown>,expected?:string)=>{
    if(expected!==active)throw new Error("author changed before dispatch");
    dispatched.push(name);
    if(name==="list_contacts"){active="author-b";return [contact] as T;}
    return {id:"conversation"} as T;
  };
  const bound=helpers.circleGateway(own,send);
  await assert.rejects(helpers.openCircleConversation({rpc:bound,ownId:own,contactId:contact.id,stillCurrent:()=>true}),/author changed/);
  assert.deepEqual(dispatched,["list_contacts"]);
});

test("prepared words stay local while current recipient metadata is checked before and after conversation creation",async()=>{
  const calls:{name:string;args:Record<string,unknown>|undefined;expected:string|undefined}[]=[];
  const send:Rpc=async<T,>(name:string,args?:Record<string,unknown>,expected?:string)=>{
    calls.push({name,args,expected});return (name==="list_contacts"?[contact]:{id:"conversation"}) as T;
  };
  const preparation:CirclePreparation={text:"A separately written sentence for review.",excludedContactIds:[],excludedCategories:[]};
  const result=await helpers.openCircleConversation({rpc:helpers.circleGateway(own,send),ownId:own,contactId:contact.id,preparation,stillCurrent:()=>true});
  assert.equal(result.peerId,peer);assert.equal(result.text,preparation.text);
  assert.deepEqual(calls.map(call=>call.name),["list_contacts","create_conversation","list_contacts"]);
  assert.ok(calls.every(call=>call.expected===own));
  assert.equal(JSON.stringify(calls).includes(preparation.text),false);
  assert.equal(JSON.stringify(calls[1].args),JSON.stringify({p_contact_id:contact.id}));
});

test("unknown category boundaries and explicit unsafe IDs prevent even conversation creation",async()=>{
  let creates=0;
  const send:Rpc=async<T,>(name:string)=>{if(name==="create_conversation")creates++;return (name==="list_contacts"?[contact]:{id:"conversation"}) as T;};
  const rpc=helpers.circleGateway(own,send);
  for(const preparation of [
    {text:"I would like to talk.",excludedContactIds:[],excludedCategories:["teacher" as const]},
    {text:"I would like to talk.",excludedContactIds:[peer],excludedCategories:[]},
    {text:"I would like to talk.",excludedContactIds:[contact.id],excludedCategories:[]},
  ])await assert.rejects(helpers.openCircleConversation({rpc,ownId:own,contactId:contact.id,preparation,stillCurrent:()=>true}),/boundaries/);
  assert.equal(creates,0);
});

test("permission changes or a replaced peer after creation never hand off a prepared draft",async()=>{
  for(const replacement of [{...contact,canExchange:false},{...contact,b:"different-peer",bName:"Different person"}]){
    let reads=0;const send:Rpc=async<T,>(name:string)=> (name==="list_contacts"?(++reads===1?[contact]:[replacement]):{id:"conversation"}) as T;
    await assert.rejects(helpers.openCircleConversation({rpc:helpers.circleGateway(own,send),ownId:own,contactId:contact.id,
      preparation:{text:"Words kept local.",excludedContactIds:[],excludedCategories:[]},stillCurrent:()=>true}),/permissions changed/);
  }
});

test("a background or account lifetime change after the final read discards the local handoff",async()=>{
  let reads=0,current=true;
  const send:Rpc=async<T,>(name:string)=>{
    if(name==="list_contacts"&&++reads===2)current=false;
    return (name==="list_contacts"?[contact]:{id:"conversation"}) as T;
  };
  await assert.rejects(helpers.openCircleConversation({rpc:helpers.circleGateway(own,send),ownId:own,contactId:contact.id,
    preparation:{text:"Private local preparation.",excludedContactIds:[],excludedCategories:[]},stillCurrent:()=>current}),/account or screen changed/);
});

test("guardian controls require current own-family authority, and token input accepts only issued bearer format",()=>{
  assert.equal(helpers.circleGuardian(context,"family"),true);
  assert.equal(helpers.circleGuardian(context,"another-family"),false);
  assert.equal(helpers.circleGuardian({...context,memberships:[]},"family"),false);
  assert.equal(helpers.circleGuardian({...context,user:{...context.user,kind:"child"}},"family"),false);
  assert.equal(helpers.circleGuardian({...context,user:{...context.user,state:"closed"}},"family"),false);
  assert.equal(helpers.externalCircleToken(` ${"ab".repeat(32)} `),"ab".repeat(32));
  for(const value of ["","abc","ab".repeat(31),"AB".repeat(32),"<script>","a".repeat(65)])assert.throws(()=>helpers.externalCircleToken(value),/complete one-use/);
});
