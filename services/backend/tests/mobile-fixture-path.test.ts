import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
// @ts-expect-error Pure ordinary ESM command/path selection.
import { mobileFixturePlan } from '../recovery/mobile-fixture-path.mjs';
const run='a'.repeat(32);
async function removeOwnedTemporary(directory:string){
  const resolved=await realpath(directory),temporaryRoot=await realpath(tmpdir());
  assert.equal(path.dirname(resolved).toLowerCase(),temporaryRoot.toLowerCase());
  assert.match(path.basename(resolved),/^betweenus-owned-fixture-(?:path|cli)-/);
  await rm(resolved,{recursive:true,force:true});
}
test('mobile fixture CLI accepts only exact default, reviewed replacement or isolated-run modes',()=>{
  assert.equal(mobileFixturePlan([],run).relativePath,'.local/mobile-fixture.json');
  assert.equal(mobileFixturePlan([],run).writeFlag,'wx');
  assert.equal(mobileFixturePlan(['--replace-fictional-fixture'],run).writeFlag,'w');
  const isolated=mobileFixturePlan(['--isolated-ui-run'],run);
  assert.equal(isolated.relativePath,`.local/ui-runs/${run}/mobile-fixture.json`);
  assert.equal(isolated.writeFlag,'wx');
  for(const args of [['--isolated-ui-run','--replace-fictional-fixture'],['--isolated-ui-run','../../outside'],['--output','other.json'],
    ['--isolated-ui-run=../../outside'],['--replace-fictional-fixture','--replace-fictional-fixture'],['unknown']])assert.throws(()=>mobileFixturePlan(args,run));
  for(const id of ['../outside','A'.repeat(32),'a'.repeat(31),'a'.repeat(33)])assert.throws(()=>mobileFixturePlan(['--isolated-ui-run'],id));
});
test('isolated fixture publication is exclusive and leaves the existing default fixture hash unchanged',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'betweenus-owned-fixture-path-'));
  try{
    await mkdir(path.join(directory,'.local'));
    const original=path.join(directory,'.local/mobile-fixture.json');
    await writeFile(original,'{"fictional":"existing history"}',{flag:'wx'});
    const digest=async()=>createHash('sha256').update(await readFile(original)).digest('hex');
    const before=await digest(),plan=mobileFixturePlan(['--isolated-ui-run'],run),target=path.join(directory,plan.relativePath);
    await mkdir(path.dirname(target),{recursive:true});
    await writeFile(target,'{"fictional":"new isolated run"}',{flag:plan.writeFlag});
    await assert.rejects(writeFile(target,'overwrite',{flag:plan.writeFlag}));
    assert.equal(await digest(),before);
  }finally{await removeOwnedTemporary(directory);}
});
test('unknown path CLI arguments stop before reading status or creating runtime data',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'betweenus-owned-fixture-cli-'));
  try{
    const script=fileURLToPath(new URL('../scripts/mobile-fixture.mjs',import.meta.url));
    await assert.rejects(promisify(execFile)(process.execPath,[script,'--output','../../outside'],{cwd:directory,windowsHide:true}),
      (error:unknown)=>{const failure=error as {stdout:string;stderr:string};assert.equal(failure.stdout,'');assert.match(failure.stderr,/Mobile fixture setup refused or failed/);return true;});
    await assert.rejects(readFile(path.join(directory,'.local/status.json')));
  }finally{await removeOwnedTemporary(directory);}
});
