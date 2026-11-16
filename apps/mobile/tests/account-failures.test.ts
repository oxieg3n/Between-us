import assert from 'node:assert/strict';
import test from 'node:test';
import {AuthApiError,AuthRetryableFetchError,AuthSessionMissingError} from '@supabase/supabase-js';
import {AccountApiError,AccountRpcError,AccountTransportError,AccountProtocolError,isTransientAccountFailure} from '../src/production/account-failures';
import {fetchWithTimeout} from '../src/production/transport';

test('existing API/RPC constructors and rejection getters stay compatible',()=>{
  for(const status of [400,401,403,404,409,413,415,422,429])assert.equal(new AccountApiError('Safe message',status).confirmedRejected,true);
  assert.equal(new AccountApiError('Safe message',503).confirmedRejected,false);
  for(const code of ['42501','22023','54000','23505'])assert.equal(new AccountRpcError('Safe message',code).confirmedRejected,true);
  const rpc=new AccountRpcError('Safe message','private_code',503);assert.equal(rpc.code,'private_code');assert.equal(rpc.status,503);assert.equal(rpc.confirmedRejected,false);
});
test('only known network/timeout or typed retryable HTTP status is transient',()=>{
  for(const value of [new AccountTransportError('network'),new AccountTransportError('timeout'),new AccountApiError('Safe',429),new AccountApiError('Safe',500),new AccountRpcError('Safe','XX000',503)])assert.equal(isTransientAccountFailure(value),true);
  for(const value of [undefined,null,{},new Error('Failed to fetch'),new TypeError('Network request failed'),{status:503},{name:'AuthRetryableFetchError',__isAuthError:true,status:0},new AccountTransportError('cancelled'),new AccountApiError('Safe',401),new AccountApiError('Safe',403),new AccountApiError('Safe',400),new AccountApiError('Safe',600),new AccountRpcError('Safe','42501',503),new AccountRpcError('Safe','22023'),new AccountProtocolError(),new AccountProtocolError('malformed-proof'),new SyntaxError('Fictional invalid JSON')])assert.equal(isTransientAccountFailure(value),false);
});
test('official SDK retryable/API errors are recognized, explicit denials/cancel/session absence are not',()=>{
  for(const value of [new AuthRetryableFetchError('Temporary',0),new AuthRetryableFetchError('Temporary',503),new AuthApiError('Temporary',429,'over_request_rate_limit'),new AuthApiError('Temporary',502,undefined)])assert.equal(isTransientAccountFailure(value),true);
  for(const value of [new AuthRetryableFetchError('Denied',401),new AuthApiError('Denied',403,undefined),new AuthApiError('Denied',503,'42501'),new AuthSessionMissingError(),new AuthRetryableFetchError(new AccountTransportError('cancelled').message,0)])assert.equal(isTransientAccountFailure(value),false);
});
test('fetch rejection is sanitized at fetch boundary and does not expose original request/error',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>{throw new TypeError('PRIVATE fixture URL/token/body');};
  try{await assert.rejects(fetchWithTimeout('https://fixture.invalid/private'),error=>error instanceof AccountTransportError&&error.reason==='network'&&isTransientAccountFailure(error)&&!error.message.includes('PRIVATE')&&!('cause' in error));}
  finally{globalThis.fetch=previous;}
});
test('HTTP responses and later malformed JSON are not converted to a network failure',async()=>{
  const previous=globalThis.fetch;const response=new Response('not-json',{status:503});globalThis.fetch=async()=>response;
  try{const result=await fetchWithTimeout('https://fixture.invalid/');assert.equal(result,response);await assert.rejects(result.json(),error=>error instanceof SyntaxError&&!isTransientAccountFailure(error));}
  finally{globalThis.fetch=previous;}
});
test('already cancelled caller never dispatches; Request and init cancellation remain distinct from offline',async()=>{
  const previous=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_input,init)=>{calls++;return new Promise<Response>((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(new Error('Private abort detail')),{once:true}));};
  try{
    const before=new AbortController();before.abort();await assert.rejects(fetchWithTimeout('https://fixture.invalid/',{signal:before.signal}),error=>error instanceof AccountTransportError&&error.reason==='cancelled'&&!isTransientAccountFailure(error));assert.equal(calls,0);
    for(const requestSignal of [false,true]){
      const controller=new AbortController();
      const pending=requestSignal?fetchWithTimeout(new Request('https://fixture.invalid/',{signal:controller.signal})):fetchWithTimeout('https://fixture.invalid/',{signal:controller.signal});
      controller.abort();await assert.rejects(pending,error=>error instanceof AccountTransportError&&error.reason==='cancelled'&&!isTransientAccountFailure(error));
    }
    assert.equal(calls,2);
  }finally{globalThis.fetch=previous;}
});
test('20-second deadline is typed timeout and caller cancellation wins if it happened first',async context=>{
  const previous=globalThis.fetch;context.mock.timers.enable({apis:['setTimeout']});
  globalThis.fetch=async(_input,init)=>new Promise<Response>((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(new Error('Private timeout detail')),{once:true}));
  try{
    const timed=fetchWithTimeout('https://fixture.invalid/');context.mock.timers.tick(19_999);context.mock.timers.tick(1);
    await assert.rejects(timed,error=>error instanceof AccountTransportError&&error.reason==='timeout'&&isTransientAccountFailure(error));
    const controller=new AbortController(),cancelled=fetchWithTimeout('https://fixture.invalid/',{signal:controller.signal});controller.abort();context.mock.timers.tick(20_000);
    await assert.rejects(cancelled,error=>error instanceof AccountTransportError&&error.reason==='cancelled'&&!isTransientAccountFailure(error));
  }finally{globalThis.fetch=previous;context.mock.timers.reset();}
});
