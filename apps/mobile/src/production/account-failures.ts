import {isAuthApiError,isAuthRetryableFetchError} from '@supabase/supabase-js';

/** Constructor/rejection compatibility with the existing managed API client. */
export class AccountApiError extends Error {
  constructor(message:string,readonly status:number){super(message);this.name='AccountApiError';}
  get confirmedRejected(){return [400,401,403,404,409,413,415,422,429].includes(this.status);}
}
export class AccountRpcError extends Error {
  constructor(message:string,readonly code?:string,readonly status?:number){super(message);this.name='AccountRpcError';}
  get confirmedRejected(){return ['42501','22023','54000','23505'].includes(this.code??'');}
}
export type AccountTransportReason='network'|'timeout'|'cancelled';
const transportMessages={network:'Account connection could not be established.',timeout:'Account request timed out.',cancelled:'Account request cancelled.'} as const;
export class AccountTransportError extends Error {
  constructor(readonly reason:AccountTransportReason){super(transportMessages[reason]);this.name='AccountTransportError';}
}
export class AccountProtocolError extends Error {
  constructor(readonly reason:'malformed-proof'|'malformed-json'='malformed-json'){
    super('The account response could not be verified.');this.name='AccountProtocolError';
  }
}
const retryableStatus=(status:unknown)=>typeof status==='number'&&Number.isInteger(status)&&(status===429||status>=500&&status<=599);
/** Classification only: transient failure never grants offline access or proves a request unsent. */
export function isTransientAccountFailure(error:unknown):boolean {
  if(error instanceof AccountProtocolError)return false;
  if(error instanceof AccountTransportError)return error.reason==='network'||error.reason==='timeout';
  if(error instanceof AccountRpcError){
    if(error.code==='42501'||error.status===401||error.status===403)return false;
    return retryableStatus(error.status);
  }
  if(error instanceof AccountApiError)return retryableStatus(error.status);
  // Official SDK predicates also accept serialized marker objects; require an actual Error here.
  if(error instanceof Error&&(isAuthRetryableFetchError(error)||isAuthApiError(error))){
    const status=error.status,retryable=isAuthRetryableFetchError(error);
    if(status===401||status===403||error.code==='42501')return false;
    // auth-js rebuilds fetcher errors as retryable0, losing the original cancellation type.
    if(retryable&&error.message===transportMessages.cancelled)return false;
    return retryable||retryableStatus(status);
  }
  return false;
}
