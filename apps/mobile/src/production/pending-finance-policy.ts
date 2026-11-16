import type { FinanceCommand, FinanceView } from '../finance/types';

type Action<T> = T extends unknown ? Omit<T, 'id' | 'at' | 'childId'> : never;
export type ProductionFinanceAction = Action<FinanceCommand>;
export type FinanceEnvelope = Readonly<{ id: string; action: ProductionFinanceAction }>;
export type PendingFinanceScope = Readonly<{ issuer: string; authorId: string; familyId: string; childId: string }>;
export type PendingFinanceRecord = Readonly<{ version: 1; scope: PendingFinanceScope; envelope: FinanceEnvelope; outcome: 'unknown' | 'saved' | 'rejected' }>;
export const MAX_PENDING_FINANCE_BYTES = 1900;
class PendingFinanceStorageError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields: Record<string, [string[], string[]]> = {
  configure_plan: [['plan'], []], assign_chore: [['choreId','title','rewardCents','dates'], ['instructions','recurrence','evidenceRequired']],
  edit_chore: [['choreId','title','rewardCents'], ['instructions']], submit_chore: [['occurrenceId'], ['note']],
  review_chore: [['occurrenceId','decision'], ['note']], close_chore: [['occurrenceId','status','note'], []], reverse_earning: [['occurrenceId','note'], []],
  create_goal: [['goalId','title','targetCents'], ['targetDate']], edit_goal: [['goalId','title','targetCents'], ['targetDate']], cancel_goal: [['goalId','note'], []],
  allocate: [['goalId'], ['amountCents','percent','currentAllowancePeriodOnly']], transfer_goal: [['fromGoalId','toGoalId','amountCents'], []],
  release_goal: [['goalId','amountCents'], ['note']], set_savings_rule: [['rule'], []], mark_held: [['goalId','amountCents','locationLabel'], []],
  request_payout: [['amountCents'], []], prepare_payout: [[], ['amountCents']], cancel_payout: [['payoutId','note'], []],
  report_payment: [['payoutId','amountCents','method','paidAt'], ['note']], acknowledge_payment: [['paymentId'], []], reverse_payment: [['paymentId','note'], []],
  configure_matching: [['rule'], []], reveal_match: [['matchId'], []], fund_match: [['matchId','amountCents','method','paidAt'], ['note']],
  reverse_match: [['matchId','note'], []], reconcile_match: [['matchId','amountCents','resolution','paidAt','note'], []],
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, required: string[], optional: string[] = []) =>
  required.every(key => Object.hasOwn(value,key)) && Object.keys(value).every(key => [...required,...optional].includes(key));
function invalid(): never { throw new PendingFinanceStorageError('The pending financial action cannot be read safely. Keep its recovery record and sign in to the same account; nothing was sent or reset.'); }
function immutable<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); } return value;
}
export function pendingFinanceScope(value: PendingFinanceScope): PendingFinanceScope {
  if (!record(value) || !exact(value,['issuer','authorId','familyId','childId']) || typeof value.issuer !== 'string' || value.issuer.length > 300
    || ![value.authorId,value.familyId,value.childId].every(id => typeof id === 'string' && uuid.test(id))) invalid();
  try {
    const url = new URL(value.issuer);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/auth/v1'
      || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname)))) invalid();
    return Object.freeze({ issuer: url.href, authorId: value.authorId.toLowerCase(), familyId: value.familyId.toLowerCase(), childId: value.childId.toLowerCase() });
  } catch { return invalid(); }
}
export const pendingFinanceScopeKey = (scope: PendingFinanceScope) => JSON.stringify(pendingFinanceScope(scope));
function actionCopy(input: ProductionFinanceAction): ProductionFinanceAction {
  if (!record(input)) invalid();
  if (['id','actor','role','at','childId'].some(key => key in input)) throw new Error('The server assigns financial identity and event time.');
  const definition = typeof input.kind === 'string' && Object.hasOwn(fields,input.kind) ? fields[input.kind] : undefined;
  if (!definition || !exact(input,['kind',...definition[0]],definition[1])) invalid();
  const numeric = new Set(['rewardCents','targetCents','amountCents','percent','budgetCents','minimumPayoutCents','monthlyCapCents','parentBudgetCents','value']);
  const boolean = new Set(['evidenceRequired','currentAllowancePeriodOnly','enabled','surprise','allowGoalRelease']);
  const enums: Record<string, readonly string[]> = { decision:['approved','needs_retry','declined'],status:['cancelled','expired'],recurrence:['once','daily','weekly'],
    method:['cash','manual','Cash App','Venmo'],resolution:['report_corrected','parent_reported_returned'],period:['weekly','biweekly','monthly'],
    payoutCadence:['per_task','daily','weekly','biweekly','monthly'],mode:['fixed','percent'] };
  const check = (key: string, value: unknown): boolean => {
    if (numeric.has(key)) return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    if (boolean.has(key)) return typeof value === 'boolean';
    if (key === 'dates' || key === 'eligibleGoalIds') return Array.isArray(value) && value.length <= 31 && value.every(item => typeof item === 'string' && item.length <= 500);
    if (key === 'plan') return record(value) && exact(value,['budgetCents','period','anchorDate','payoutCadence','minimumPayoutCents','allowGoalRelease']) && Object.entries(value).every(([k,v]) => check(k,v));
    if (key === 'rule') {
      if (!record(value)) return false;
      const valid = input.kind === 'configure_matching' ? exact(value,['enabled','percent','monthlyCapCents','parentBudgetCents','surprise'],['eligibleGoalIds'])
        : exact(value,['id','goalId','mode','value','enabled']);
      return valid && Object.entries(value).every(([k,v]) => check(k,v));
    }
    return typeof value === 'string' && value.length <= 500 && (!enums[key] || enums[key].includes(value));
  };
  if (!Object.entries(input).every(([key,value]) => check(key,value)) || (input.kind === 'allocate' && Number('amountCents' in input) + Number('percent' in input) !== 1)) invalid();
  return immutable(JSON.parse(JSON.stringify(input)) as ProductionFinanceAction);
}
function byteLength(text: string): number {
  let bytes = 0; for (const character of text) { const code = character.codePointAt(0)!; bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4; } return bytes;
}
export function encodePendingFinance(value: PendingFinanceRecord): string {
  const result = JSON.stringify(value);
  // Reserve the longest outcome marker before the first write; rejection cleanup must still fit.
  if (byteLength(JSON.stringify({...value,outcome:'rejected'})) > MAX_PENDING_FINANCE_BYTES) throw new PendingFinanceStorageError('Keep this financial action shorter so its exact retry can be saved securely. Nothing was sent.');
  decodePendingFinance(result,value.scope); return result;
}
export function decodePendingFinance(text: string, expected: PendingFinanceScope): PendingFinanceRecord {
  if (typeof text !== 'string' || byteLength(text) > MAX_PENDING_FINANCE_BYTES) invalid();
  let value: unknown; try { value = JSON.parse(text); } catch { return invalid(); }
  if (!record(value) || !exact(value,['version','scope','envelope','outcome']) || value.version !== 1 || !record(value.scope)
    || pendingFinanceScopeKey(value.scope as PendingFinanceScope) !== pendingFinanceScopeKey(expected)
    || !record(value.envelope) || !exact(value.envelope,['id','action']) || typeof value.envelope.id !== 'string' || !uuid.test(value.envelope.id)
    || !['unknown','saved','rejected'].includes(String(value.outcome))) invalid();
  return immutable({ version:1,scope:pendingFinanceScope(expected),envelope:{ id:value.envelope.id,action:actionCopy(value.envelope.action as ProductionFinanceAction) },outcome:value.outcome as PendingFinanceRecord['outcome'] });
}
type Current = () => boolean;
const requireCurrent = (current: Current) => { if (!current()) throw new PendingFinanceStorageError('Account or screen changed. The original financial recovery record was kept.'); };
export type PendingFinanceStore = {
  durable: boolean;
  load(scope: PendingFinanceScope): Promise<PendingFinanceRecord | null>;
  put(scope: PendingFinanceScope,value: PendingFinanceRecord,current: Current): Promise<void>;
  remove(scope: PendingFinanceScope,id: string,current: Current): Promise<void>;
};
const locks = new Map<string,Promise<void>>();
/** One slot per author/issuer/family/child. Compare identity/body before every write or removal. */
export function createPendingFinanceStore(raw: { getItem(key: string): Promise<string|null>;setItem(key:string,value:string):Promise<void>;removeItem(key:string):Promise<void> },
  keyFor: (scope:PendingFinanceScope)=>Promise<string>, durable: boolean): PendingFinanceStore {
  const serial = async <T>(scope:PendingFinanceScope,work:(key:string)=>Promise<T>):Promise<T> => {
    const key = await keyFor(pendingFinanceScope(scope)), before = locks.get(key) ?? Promise.resolve();
    const operation = before.then(()=>work(key)), tail = operation.then(()=>{},()=>{}); locks.set(key,tail);
    try { return await operation; } finally { if (locks.get(key) === tail) locks.delete(key); }
  };
  const read = async (key:string,scope:PendingFinanceScope) => { const value = await raw.getItem(key); return value === null ? null : decodePendingFinance(value,scope); };
  const guarded = async <T>(work:()=>Promise<T>):Promise<T> => { try { return await work(); } catch(error) {
    if (error instanceof PendingFinanceStorageError) throw error;
    throw new Error('Secure financial recovery storage is unavailable. Keep the pending action and unlock this device; nothing new can be sent.');
  } };
  return {
    durable,
    load: scope => guarded(()=>serial(scope,key=>read(key,scope))),
    put: (scope,value,current) => guarded(()=>serial(scope,async key=>{
      if(pendingFinanceScopeKey(value.scope)!==pendingFinanceScopeKey(scope))invalid();
      const text = encodePendingFinance(value), previous = await read(key,scope); requireCurrent(current);
      if (previous && (previous.envelope.id !== value.envelope.id || JSON.stringify(previous.envelope.action) !== JSON.stringify(value.envelope.action)
        || (previous.outcome !== 'unknown' && previous.outcome !== value.outcome))) throw new PendingFinanceStorageError('Another pending financial action must be resolved first.');
      await raw.setItem(key,text);
      if (await raw.getItem(key) !== text) throw new Error('Secure recovery write verification failed.');
    })),
    remove: (scope,id,current) => guarded(()=>serial(scope,async key=>{
      const previous = await read(key,scope); requireCurrent(current);
      if (!previous || previous.envelope.id !== id) throw new PendingFinanceStorageError('Another pending financial recovery record must not be removed.');
      if(previous.outcome==='unknown')throw new PendingFinanceStorageError('The pending financial recovery record has an unknown outcome and must not be removed.');
      await raw.removeItem(key);
      if (await raw.getItem(key) !== null) throw new Error('Secure recovery removal verification failed.');
    })),
  };
}

export function createFinanceMutation(send:(request:FinanceEnvelope)=>Promise<FinanceView>,makeId:()=>string,
  persistence?:{ scope:PendingFinanceScope;store:PendingFinanceStore;current:Current }) {
  let pending:FinanceEnvelope|null=null,busy=false,attempted=false,transmitted=false,ready=!persistence,outcome:PendingFinanceRecord['outcome']='unknown';
  const current = () => !persistence || persistence.current();
  const stored = ():PendingFinanceRecord => ({version:1,scope:persistence!.scope,envelope:pending!,outcome});
  const finish = async () => {
    requireCurrent(current);
    if (persistence) { await persistence.store.put(persistence.scope,stored(),current); await persistence.store.remove(persistence.scope,pending!.id,current); }
    requireCurrent(current);pending=null;
  };
  return {
    pending:()=>pending,status:()=>outcome,ready:()=>ready,
    async recover() {
      if (busy || pending) return pending;
      busy=true;if(persistence)ready=false;
      try { if (persistence) { const value=await persistence.store.load(persistence.scope); requireCurrent(current);
        if(value){pending=value.envelope;outcome=value.outcome;attempted=true;transmitted=true;} } ready=true;return pending;
      } finally { busy=false; }
    },
    stage(action:ProductionFinanceAction):FinanceEnvelope {
      requireCurrent(current);
      if(!ready||pending||busy)throw new Error('Finish the pending financial action first.');
      const copy=actionCopy(action), candidate=immutable({id:makeId(),action:copy});
      // Reject oversized review candidates before taking the pending slot; storage ambiguity later must retain it.
      if(persistence)encodePendingFinance({version:1,scope:persistence.scope,envelope:candidate,outcome:'unknown'});
      pending=candidate;outcome='unknown';attempted=false;transmitted=false;return pending;
    },
    cancel(){if(busy||attempted)throw new Error('The server has not confirmed this action. Retry it before starting another.');pending=null;},
    async cleanupConfirmed(){
      if(!pending||busy||outcome==='unknown')throw new Error('No confirmed financial action is ready for cleanup.');
      busy=true;try{await finish();}finally{busy=false;}
    },
    async submit():Promise<FinanceView>{
      if(!pending||busy||!ready||outcome!=='unknown')throw new Error('No financial action is ready to send.');
      busy=true;attempted=true;
      try{
        requireCurrent(current);
        if(persistence)await persistence.store.put(persistence.scope,stored(),current);
        requireCurrent(current);
        let view:FinanceView;const retryingUnknown=transmitted;transmitted=true;
        try{view=await send(pending);}catch(error){
          requireCurrent(current);
          if(error&&typeof error==='object'&&'confirmedRejected' in error&&error.confirmedRejected===true){
            if(retryingUnknown)throw new Error('This retry was rejected, but the earlier result is still unknown. Keep this recovery record and retry only when this same account is authorized again.');
            outcome='rejected';await finish();
          }
          throw error;
        }
        requireCurrent(current);outcome='saved';
        try{await finish();}catch{throw new Error('The server confirmed saving this action. Its local recovery record still needs cleanup; no new financial action can start.');}
        return view;
      }finally{busy=false;}
    },
  };
}
