import {createExpoPushTransport,createNotificationWorker,NotificationWorkerError,type ExpoNotificationConfiguration,type NotificationBatchResult} from './notifications.ts';
import {createFinanceNotifications} from './finance-notifications.ts';
type ServiceClient={rpc(name:string,args?:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string}|null}>};
type DueResult={status:'checked'|'disabled';created:number;sent:false};
type Stage='validation'|'produce'|'finance'|'dispatch'|'receipts';
type FinanceResult={status:'checked'|'disabled'|'busy';checked:number;created:number;sent:false};
export type FinanceScanCursor={read():Promise<string|null>;write(value:string|null):Promise<void>};
export type NotificationCycleResult={
  status:'disabled'|'not_configured'|'busy'|'completed'|'failed';
  checkins:DueResult|null;finance:FinanceResult|null;dispatch:NotificationBatchResult|null;receipts:NotificationBatchResult|null;
  deviceDelivered:false;read:false;
  error?:{stage:Stage;code:'authorization'|'storage'|'invalid_batch'};
};
const initial=(status:NotificationCycleResult['status']):NotificationCycleResult=>({status,checkins:null,finance:null,dispatch:null,receipts:null,deviceDelivered:false,read:false});
function dueResult(value:unknown,limit:number):DueResult{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new NotificationWorkerError('invalid_batch');
  const row=value as Record<string,unknown>;
  if(Object.keys(row).length!==3||!['status','created','sent'].every(key=>Object.hasOwn(row,key))||!['checked','disabled'].includes(String(row.status))
    ||!Number.isSafeInteger(row.created)||Number(row.created)<0||Number(row.created)>limit||row.sent!==false||(row.status==='disabled'&&row.created!==0))throw new NotificationWorkerError('invalid_batch');
  return {status:row.status as DueResult['status'],created:row.created as number,sent:false};
}
function safeBatch(value:NotificationBatchResult,limit:number):NotificationBatchResult{
  const names=['attempted','providerAccepted','providerReceived','deferred','failed','suppressed'] as const;
  if(!['completed','busy','disabled','not_configured'].includes(value.status)||value.deviceDelivered!==false||value.read!==false
    ||names.some(key=>!Number.isSafeInteger(value[key])||value[key]<0||value[key]>limit))throw new NotificationWorkerError('invalid_batch');
  // Project exact count fields only; future worker internals must not become operational output.
  return {status:value.status,attempted:value.attempted,providerAccepted:value.providerAccepted,providerReceived:value.providerReceived,
    deferred:value.deferred,failed:value.failed,suppressed:value.suppressed,deviceDelivered:false,read:false};
}

/** One bounded server-only cycle. No environment reads, policy changes, cron or public handler. */
export function createNotificationCycle(input:{serviceClient?:ServiceClient;configuration?:ExpoNotificationConfiguration;request?:typeof fetch;monotonicNow?:()=>number;financeCursor?:FinanceScanCursor}={}){
  const transport=createExpoPushTransport(input.configuration??{},input.request),client=input.serviceClient;
  const finance=client?createFinanceNotifications({serviceClient:client,enabled:transport.operational}):null;
  const worker=finance?createNotificationWorker({serviceClient:finance.serviceClient,transport,monotonicNow:input.monotonicNow}):null;
  let running=false,memoryCursor:string|null=null;
  const cursor=input.financeCursor??{async read(){return memoryCursor;},async write(value:string|null){memoryCursor=value;}};
  return {
    async run(limit=20):Promise<NotificationCycleResult>{
      if(!transport.operational)return initial(transport.unavailableReason??'not_configured');
      if(!client||!worker||!finance)return initial('not_configured');
      if(running)return initial('busy');
      const result=initial('completed');let stage:Stage='validation';running=true;
      try{
        if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw new NotificationWorkerError('invalid_batch');
        stage='produce';const due=await client.rpc('produce_due_checkins',{p_limit:limit});
        if(due.error)throw new NotificationWorkerError(due.error.code==='42501'?'authorization':'storage');
        result.checkins=dueResult(due.data,limit);
        stage='finance';
        const after=await cursor.read();
        if(after!==null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after))throw new NotificationWorkerError('invalid_batch');
        const produced=await finance.produce({limit,afterChildId:after});
        result.finance={status:produced.status,checked:produced.checked,created:produced.created,sent:false};
        if(produced.status==='checked')await cursor.write(produced.nextAfterChildId);
        stage='dispatch';result.dispatch=safeBatch(await worker.dispatch(limit),limit);
        stage='receipts';result.receipts=safeBatch(await worker.pollReceipts(limit),limit);
        return result;
      }catch(error){
        const code=error instanceof NotificationWorkerError&&['authorization','storage','invalid_batch'].includes(error.code)?error.code:'storage';
        // A failing batch can have partial provider/SQL effects. Null never falsely reports zero deliveries.
        return {...result,status:'failed',error:{stage,code}};
      }finally{running=false;}
    },
  };
}
