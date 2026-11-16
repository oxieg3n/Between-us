import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountEdgeApi} from '../src/edge-mount.ts';
test('gateway and function-local prefixes preserve method, body, query and managed bearer',async()=>{
  const handle=mountEdgeApi(async request=>Response.json({path:new URL(request.url).pathname,query:new URL(request.url).search,method:request.method,body:await request.json(),authorized:request.headers.get('Authorization')==='Bearer fictional-test'}));
  for(const prefix of ['/api','/functions/v1/api']){
    const result=await handle(new Request(`https://fictional.example${prefix}/v1/privacy/reauthenticate?review=1`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fictional-test'},body:'{"fictional":true}'}));
    assert.deepEqual(await result.json(),{path:'/v1/privacy/reauthenticate',query:'?review=1',method:'POST',body:{fictional:true},authorized:true});
  }
});
test('a similarly named or missing function mount never reaches private API handlers',async()=>{
  let called=0;const handle=mountEdgeApi(async()=>{called++;return new Response();});
  for(const path of ['/v1/context','/api-unsafe/v1/context','/functions/v1/other/v1/context','/functions/v1/api/../health'])assert.equal((await handle(new Request('https://fictional.example'+path))).status,404);
  assert.equal(called,0);
});
