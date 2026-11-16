import type {MessageOutbox} from './message-outbox-policy';
import type {ReviewedMessage} from './reviewed-send';

export type SenderMessageReceipt=
  | Readonly<{status:'unknown';clientId:string}>
  | Readonly<{status:'saved';clientId:string;messageId:string;conversationId:string;peerId:string}>;
export type ReviewedMessageTransportPorts={
  /** Native requires the durable store. Omission is an explicitly memory-only web path. */
  outbox?:MessageOutbox;
  receipt(message:ReviewedMessage):Promise<SenderMessageReceipt>;
  /** Root binds current author/session and rechecks recipient exclusions/contact authorization. */
  sendCurrent(message:ReviewedMessage):Promise<void>;
};
export interface ReviewedMessageTransportError {readonly confirmedRejected?:true}
export class ReviewedMessageTransportError extends Error {
  constructor(readonly code:'unresolved'|'receipt-scope'|'conflict'|'busy'|'saved-cleanup'|'rejected-cleanup'|'rejected',readonly knownSaved=false){
    super(code==='saved-cleanup'?'Message saved. Its local recovery record still needs cleanup.':code==='rejected'?'This original message was definitively rejected.':
      'Keep the original reviewed message. Its recovery operation could not finish safely.');
    this.name='ReviewedMessageTransportError';
    if(code==='rejected')Object.defineProperty(this,'confirmedRejected',{value:true});
  }
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function copy(message:ReviewedMessage):ReviewedMessage{
  if(!message||![message.id,message.authorId,message.conversationId,message.peerId].every(v=>typeof v==='string'&&uuid.test(v))
    ||message.authorId===message.peerId||typeof message.body!=='string'||!message.body.trim()||message.body.length>5000||!['listen','reply','later','talk'].includes(message.response))
    throw new ReviewedMessageTransportError('conflict');
  return Object.freeze({id:message.id,authorId:message.authorId,conversationId:message.conversationId,peerId:message.peerId,body:message.body,response:message.response,
    ...(message.recipientPolicy?{recipientPolicy:Object.freeze({excludedContactIds:Object.freeze([...message.recipientPolicy.excludedContactIds]),excludedCategories:Object.freeze([...message.recipientPolicy.excludedCategories])})}:{})});
}
/** Explicit submit only: no timer, adoption side effect, UUID generation or network retry loop. */
export function makeReviewedMessageTransport(ports:ReviewedMessageTransportPorts):(message:ReviewedMessage)=>Promise<void>{
  const known=new Map<string,{signature:string;outcome:'saved'|'rejected'}>(),busy=new Set<string>();
  return async input=>{
    const message=copy(input),key=JSON.stringify([message.authorId,message.id]),signature=JSON.stringify(message);
    if(busy.has(key))throw new ReviewedMessageTransportError('busy');
    if(known.has(key)&&known.get(key)!.signature!==signature)throw new ReviewedMessageTransportError('conflict');
    busy.add(key);
    const cleanup=async(outcome:'saved'|'rejected')=>{
      known.set(key,{signature,outcome});
      try{await ports.outbox?.resolve(message,outcome);await ports.outbox?.removeResolved(message,outcome);}
      catch{throw new ReviewedMessageTransportError(outcome==='saved'?'saved-cleanup':'rejected-cleanup',outcome==='saved');}
      if(outcome==='rejected')throw new ReviewedMessageTransportError('rejected');
    };
    try{
      // No receipt or send may run if approval cannot be made durable.
      await ports.outbox?.persistApproved(message,{explicitSend:true});
      if(ports.outbox){
        const record=(await ports.outbox.loadRecovery()).find(row=>row.message.authorId===message.authorId&&row.message.id===message.id);
        if(!record||JSON.stringify(copy(record.message))!==signature)throw new ReviewedMessageTransportError('conflict');
        if(record.status!=='approved'){await cleanup(record.status);return;}
      }
      const previous=known.get(key);
      if(previous){await cleanup(previous.outcome);return;}
      const receipt=await ports.receipt(message);
      if(!receipt||receipt.clientId!==message.id||!['saved','unknown'].includes(receipt.status))throw new ReviewedMessageTransportError('receipt-scope');
      if(receipt.status==='saved'){
        if(receipt.conversationId!==message.conversationId||receipt.peerId!==message.peerId||!uuid.test(receipt.messageId))throw new ReviewedMessageTransportError('receipt-scope');
        await cleanup('saved');return;
      }
      await ports.sendCurrent(message);
      await cleanup('saved');
    }catch(error){
      if(error instanceof ReviewedMessageTransportError)throw error;
      // In particular, never forward confirmedRejected from a later denied retry.
      throw new ReviewedMessageTransportError('unresolved',known.get(key)?.outcome==='saved');
    }finally{busy.delete(key);}
  };
}
