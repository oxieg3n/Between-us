import { financeView } from '../../../apps/mobile/src/finance/engine.ts';
import { localDate } from '../../../apps/mobile/src/finance/money-calendar.ts';
import type { FinanceState } from '../../../apps/mobile/src/finance/types.ts';

type Result = {data:unknown;error:{code?:string}|null};
type Client = {rpc(name:string,args?:Record<string,unknown>):PromiseLike<Result>};
type Scope = {familyId:string;childId:string};
type Snapshot = Scope & {status:'ready';revision:number;serverAt:string;state:FinanceState};
export type FinanceNotificationProjection = {
  localDate:string;
  payout:{scheduled:boolean;due:boolean;periodKey:string};
  goals:{id:string;complete:boolean}[];
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value:unknown):value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export class FinanceNotificationError extends Error {
  constructor() { super('The financial notification operation could not be verified.'); }
}
/** Child projection only: no allocation/effect arithmetic or hidden-match inspection. */
export function financeNotificationProjection(state:FinanceState,childId:string,serverAt:string):FinanceNotificationProjection {
  const view = financeView(state,{role:'child',childId},childId,serverAt);
  if (view.goals.length > 32) throw new FinanceNotificationError();
  return {localDate:localDate(serverAt,view.timezone),
    payout:{scheduled:!!view.plan && view.plan.payoutCadence !== 'per_task',due:view.payout.due,periodKey:view.payout.periodKey},
    goals:view.goals.map(goal=>({id:goal.id,complete:goal.status === 'active' && goal.progressPercent === 100}))};
}
function snapshot(value:unknown):Snapshot {
  if (!object(value) || value.status !== 'ready' || !uuid.test(String(value.familyId)) || !uuid.test(String(value.childId))
    || !Number.isSafeInteger(value.revision) || Number(value.revision)<0 || typeof value.serverAt !== 'string' || !object(value.state)) throw new FinanceNotificationError();
  return value as unknown as Snapshot;
}

/** Root passes serviceClient to the existing worker, and calls produce serially. Both default OFF. */
export function createFinanceNotifications(input:{serviceClient:Client;enabled?:boolean}) {
  let producing = false;
  const rpc = async(name:string,args:Record<string,unknown>) => {
    const value = await input.serviceClient.rpc(name,args);
    if (value.error || value.data == null) throw new FinanceNotificationError();
    return value.data;
  };
  const wrapped:Client = {async rpc(name,args={}) {
    if (!input.enabled || !['authorize_notification','authorize_notification_receipt'].includes(name)) return input.serviceClient.rpc(name,args);
    try {
      for (let retry=0;retry<4;retry++) {
        const value = await rpc('finance_notification_delivery_snapshot',{...args,p_receipt:name === 'authorize_notification_receipt'});
        if (object(value) && value.status === 'legacy') return input.serviceClient.rpc(name,args);
        if (object(value) && value.status === 'unavailable') return {data:false,error:null};
        const loaded = snapshot(value),projection = financeNotificationProjection(loaded.state,loaded.childId,loaded.serverAt);
        const result = await rpc('authorize_finance_notification',{...args,p_receipt:name === 'authorize_notification_receipt',
          p_expected_revision:loaded.revision,p_projection:projection});
        if (object(result) && result.status === 'conflict') continue;
        if (!object(result) || result.status !== 'checked' || typeof result.allowed !== 'boolean') throw new FinanceNotificationError();
        return {data:result.allowed,error:null};
      }
      // Busy private CAS never becomes a public revision or a false authorization/suppression.
      return {data:null,error:{code:'40001'}};
    } catch { return {data:null,error:{code:'XX000'}}; }
  }};
  return {
    serviceClient:wrapped,
    async produce(options:{limit?:number;afterChildId?:string|null;childId?:string|null}={}) {
      const empty = {checked:0,created:0,nextAfterChildId:null as string|null,sent:false as const};
      if (!input.enabled) return {status:'disabled' as const,...empty};
      if (producing) return {status:'busy' as const,...empty};
      const limit = options.limit ?? 20;
      if (!Number.isSafeInteger(limit) || limit<1 || limit>20 || [options.afterChildId,options.childId].some(id=>id != null && !uuid.test(id))) throw new FinanceNotificationError();
      // Reserve a full maximum guardian fanout even when a caller scans/dispatches only one scope.
      const eventLimit=Math.max(8,limit);
      producing = true;
      try {
        const batch = await rpc('finance_notification_scopes',{p_limit:limit,p_after_child_id:options.afterChildId??null,p_child_id:options.childId??null});
        if (object(batch) && batch.status === 'disabled') return {status:'disabled' as const,...empty};
        if (!object(batch) || batch.status !== 'ready' || !Array.isArray(batch.scopes) || batch.scopes.length>limit
          || batch.scopes.some(row=>!object(row)||!uuid.test(String(row.familyId))||!uuid.test(String(row.childId)))
          || batch.nextAfterChildId !== null && !uuid.test(String(batch.nextAfterChildId))) throw new FinanceNotificationError();
        const scopes = batch.scopes as Scope[],result = {...empty};
        for (let index=0;index<scopes.length;index++) {
          const scope = scopes[index];let settled=false;
          for (let retry=0;retry<4;retry++) {
            const value = await rpc('finance_notification_snapshot',{p_family_id:scope.familyId,p_child_id:scope.childId});
            if (object(value) && ['disabled','unavailable'].includes(String(value.status))) {settled=true;break;}
            const loaded = snapshot(value);
            if (loaded.familyId !== scope.familyId || loaded.childId !== scope.childId) throw new FinanceNotificationError();
            const projection = financeNotificationProjection(loaded.state,loaded.childId,loaded.serverAt);
            const queued = await rpc('queue_finance_notifications',{p_family_id:scope.familyId,p_child_id:scope.childId,
              p_expected_revision:loaded.revision,p_projection:projection,p_limit:eventLimit-result.created});
            if (object(queued) && queued.status === 'conflict') continue;
            if (!object(queued) || !['committed','disabled','unavailable'].includes(String(queued.status))
              || !Number.isSafeInteger(queued.created) || Number(queued.created)<0 || Number(queued.created)>eventLimit-result.created) throw new FinanceNotificationError();
            result.created += Number(queued.created);settled=true;break;
          }
          if(!settled)throw new FinanceNotificationError();
          result.checked++;
          result.nextAfterChildId = index<scopes.length-1 || batch.nextAfterChildId !== null ? scope.childId : null;
          if (eventLimit-result.created<8) break;
        }
        return {status:'checked' as const,...result};
      } catch { throw new FinanceNotificationError(); }
      finally { producing = false; }
    },
  };
}
