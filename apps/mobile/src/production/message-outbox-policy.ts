import type { ReviewedMessage, RecipientPolicy } from './reviewed-send';

export type MessageOutboxScope = Readonly<{issuer:string;authorId:string}>;
export type MessageOutboxOutcome = 'saved'|'rejected';
export type MessageRecoveryRecord=Readonly<{message:ReviewedMessage;status:'approved'|MessageOutboxOutcome}>;
export type MessageOutbox = {
  persistApproved(message:ReviewedMessage,intent:{explicitSend:true}):Promise<void>;
  loadPending():Promise<readonly ReviewedMessage[]>;
  loadRecovery():Promise<readonly MessageRecoveryRecord[]>;
  resolve(message:ReviewedMessage,outcome:MessageOutboxOutcome):Promise<void>;
  removeResolved(message:ReviewedMessage,outcome:MessageOutboxOutcome):Promise<void>;
};
export class MessageOutboxError extends Error {
  constructor(readonly code:'unsupported'|'identity'|'recovery-required'|'invalid'|'conflict'|'capacity'|'unavailable') {
    super(`Approved message recovery: ${code}. Nothing was automatically sent or reset.`);this.name='MessageOutboxError';
  }
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,required:string[],optional:string[]=[])=>required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>[...required,...optional].includes(k));
const invalid=():never=>{throw new MessageOutboxError('invalid');};
export function messageOutboxScope(input:MessageOutboxScope):MessageOutboxScope {
  if(!object(input)||!exact(input,['issuer','authorId'])||typeof input.issuer!=='string'||input.issuer.length>300||typeof input.authorId!=='string'||!uuid.test(input.authorId))invalid();
  try {const url=new URL(input.issuer);if(url.username||url.password||url.search||url.hash||url.pathname!=='/auth/v1'||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))invalid();return Object.freeze({issuer:url.href,authorId:input.authorId.toLowerCase()});}catch{return invalid();}
}
export const messageOutboxScopeKey=(scope:MessageOutboxScope)=>JSON.stringify(messageOutboxScope(scope));
/** Canonical exact command, never trimmed, truncated, role-derived or assigned a new nonce. */
export function approvedMessage(input:ReviewedMessage,scope:MessageOutboxScope):ReviewedMessage {
  const own=messageOutboxScope(scope);
  if(!object(input)||!exact(input,['id','authorId','conversationId','peerId','body','response'],['recipientPolicy'])
    ||![input.id,input.authorId,input.conversationId,input.peerId].every(id=>typeof id==='string'&&uuid.test(id))
    ||input.authorId!==own.authorId||input.peerId===own.authorId||typeof input.body!=='string'||!input.body.trim()||input.body.length>5000
    ||typeof input.response!=='string'||!['listen','reply','later','talk'].includes(input.response))invalid();
  let recipientPolicy:RecipientPolicy|undefined;
  if(Object.hasOwn(input,'recipientPolicy')) {
    const p=input.recipientPolicy,categories=['trusted-person','trusted-adult','parent','teacher','sibling','friend','child','co-parent'];
    if(!object(p)||!exact(p,['excludedContactIds','excludedCategories'])||!Array.isArray(p.excludedContactIds)||p.excludedContactIds.length>100
      ||!p.excludedContactIds.every(id=>typeof id==='string'&&uuid.test(id))||!Array.isArray(p.excludedCategories)||p.excludedCategories.length>8
      ||!p.excludedCategories.every(c=>typeof c==='string'&&categories.includes(c)))invalid();
    const validated=p as RecipientPolicy;
    recipientPolicy=Object.freeze({excludedContactIds:Object.freeze([...validated.excludedContactIds]),excludedCategories:Object.freeze([...validated.excludedCategories])});
    if(recipientPolicy.excludedContactIds.includes(input.peerId))invalid();
  }
  return Object.freeze({id:input.id,authorId:input.authorId,conversationId:input.conversationId,peerId:input.peerId,body:input.body,response:input.response,...(recipientPolicy?{recipientPolicy}:{})});
}
export const encodeApprovedMessage=(message:ReviewedMessage,scope:MessageOutboxScope)=>JSON.stringify(approvedMessage(message,scope));
/** Missing/invalid existing credentials are never repaired by inventing a new decryption key. */
export async function loadOrCreateOutboxKey(ports:{existing:boolean;read():Promise<string|null>;write(key:string):Promise<void>;random():Promise<Uint8Array>}):Promise<string>{
  let key=await ports.read();
  if(key===null){
    if(ports.existing)throw new MessageOutboxError('recovery-required');
    const bytes=await ports.random();if(bytes.length!==32)throw new MessageOutboxError('unsupported');
    key=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
    await ports.write(key);
  }
  if(!/^[0-9a-f]{64}$/.test(key))throw new MessageOutboxError('recovery-required');return key;
}
type SqlValue=string|number|null;
export type OutboxDatabase={exec(sql:string):Promise<void>;run(sql:string,args:readonly SqlValue[]):Promise<{changes:number}>;first<T>(sql:string,args?:readonly SqlValue[]):Promise<T|undefined>;all<T>(sql:string,args?:readonly SqlValue[]):Promise<T[]>;close():Promise<void>};
export type OutboxPorts={
  /** Fresh network verification returns current managed session ID, not a UI identity. */
  verify():Promise<{issuer:string;authorId:string;sessionId:string}>;
  open(scope:MessageOutboxScope):Promise<OutboxDatabase>;
};
const operations=new Map<string,Promise<void>>();
export function createMessageOutboxPolicy(input:MessageOutboxScope,ports:OutboxPorts):MessageOutbox {
  const scope=messageOutboxScope(input),key=messageOutboxScopeKey(scope);
  async function checked(){const actor=await ports.verify();if(actor.issuer!==scope.issuer||actor.authorId!==scope.authorId||!uuid.test(actor.sessionId))throw new MessageOutboxError('identity');return actor;}
  async function operation<T>(work:(db:OutboxDatabase)=>Promise<T>):Promise<T>{
    const previous=operations.get(key)??Promise.resolve();
    const result=previous.then(async()=>{
      const actor=await checked();let db:OutboxDatabase|undefined;
      try {
        db=await ports.open(scope);
        const value=await work(db),after=await checked();
        if(after.sessionId!==actor.sessionId)throw new MessageOutboxError('identity');return value;
      }catch(error){if(error instanceof MessageOutboxError)throw error;throw new MessageOutboxError('unavailable');}
      finally{if(db){try{await db.close();}catch{throw new MessageOutboxError('unavailable');}}}
    });
    const tail=result.then(()=>{},()=>{});operations.set(key,tail);
    try{return await result;}finally{if(operations.get(key)===tail)operations.delete(key);}
  }
  async function transaction<T>(db:OutboxDatabase,work:()=>Promise<T>){await db.exec('BEGIN IMMEDIATE');try{const value=await work();await db.exec('COMMIT');return value;}catch(error){try{await db.exec('ROLLBACK');}catch{/* Preserve original failure. */}throw error;}}
  const decode=(payload:string)=>{try{const value=JSON.parse(payload) as ReviewedMessage;if(encodeApprovedMessage(value,scope)!==payload)invalid();return approvedMessage(value,scope);}catch{throw new MessageOutboxError('recovery-required');}};
  function command(message:ReviewedMessage){const payload=encodeApprovedMessage(message,scope);return {payload,id:message.id};}
  async function match(db:OutboxDatabase,id:string,payload:string){const row=await db.first<{payload:string;status:string}>('SELECT payload,status FROM approved_messages WHERE client_id=?',[id]);if(!row||row.payload!==payload)throw new MessageOutboxError('conflict');return row;}
  return {
    async persistApproved(message,intent){if(!intent||intent.explicitSend!==true)invalid();const {id,payload}=command(message);await operation(db=>transaction(db,async()=>{
      const old=await db.first<{payload:string;status:string}>('SELECT payload,status FROM approved_messages WHERE client_id=?',[id]);
      if(old){if(old.payload!==payload||!['approved','saved','rejected'].includes(old.status))throw new MessageOutboxError('conflict');return;}
      if((await db.first<{total:number}>('SELECT count(*) AS total FROM approved_messages'))!.total>=100)throw new MessageOutboxError('capacity');
      await db.run('INSERT INTO approved_messages(client_id,payload,status) VALUES(?,?,?)',[id,payload,'approved']);
    }));},
    loadPending:()=>operation(async db=>{
      const rows=await db.all<{payload:string}>('SELECT payload FROM approved_messages WHERE status=? ORDER BY rowid LIMIT 101',['approved']);
      if(rows.length>100)throw new MessageOutboxError('recovery-required');return Object.freeze(rows.map(row=>decode(row.payload)));
    }),
    loadRecovery:()=>operation(async db=>{
      const rows=await db.all<{payload:string;status:string}>('SELECT payload,status FROM approved_messages ORDER BY rowid LIMIT 101');
      if(rows.length>100||rows.some(row=>!['approved','saved','rejected'].includes(row.status)))throw new MessageOutboxError('recovery-required');
      return Object.freeze(rows.map(row=>Object.freeze({message:decode(row.payload),status:row.status as MessageRecoveryRecord['status']})));
    }),
    async resolve(message,outcome){if(!['saved','rejected'].includes(outcome))invalid();const {id,payload}=command(message);await operation(db=>transaction(db,async()=>{
      const row=await match(db,id,payload);if(row.status!==outcome&&row.status!=='approved')throw new MessageOutboxError('conflict');
      await db.run('UPDATE approved_messages SET status=? WHERE client_id=? AND payload=? AND status=?',[outcome,id,payload,row.status]);
    }));},
    async removeResolved(message,outcome){if(!['saved','rejected'].includes(outcome))invalid();const {id,payload}=command(message);await operation(db=>transaction(db,async()=>{
      const row=await match(db,id,payload);if(row.status!==outcome)throw new MessageOutboxError('conflict');
      await db.run('DELETE FROM approved_messages WHERE client_id=? AND payload=? AND status=?',[id,payload,outcome]);
    }));},
  };
}
