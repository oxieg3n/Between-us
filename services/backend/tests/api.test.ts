import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api.ts';
const handle = createApi({url:'http://127.0.0.1:54321',publicKey:'fictional-public',serviceKey:'fictional-service',syntheticLocal:true});
test('browser preflight allows only explicit local development origins',async()=>{
  const request = (origin:string) => new Request('http://127.0.0.1:8787/v1/enrollment/parent',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}});
  const valid=await handle(request('http://localhost:8081')); assert.equal(valid.status,204);assert.equal(valid.headers.get('Access-Control-Allow-Origin'),'http://localhost:8081');
  const invalid=await handle(request('https://untrusted.example'));assert.equal(invalid.status,403);assert.equal(invalid.headers.get('Access-Control-Allow-Origin'),null);
});
test('private routes require a bearer and local enrollment cannot be exposed on a public host',async()=>{
  assert.equal((await handle(new Request('http://127.0.0.1:8787/v1/context'))).status,401);
  assert.equal((await handle(new Request('https://public.example/v1/enrollment/parent',{method:'POST',headers:{'content-type':'application/json'},body:'{"email":"fictional@fixture.test"}'}))).status,403);
});
