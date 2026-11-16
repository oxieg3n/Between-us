import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import test from 'node:test';
import {localUiFixturePath} from '../e2e-production/fixture-path';
function fixture(work:(root:string,isolated:string)=>void){
  const root=mkdtempSync(join(tmpdir(),'betweenus-ui-fixture-'));
  try{
    writeFileSync(join(root,'mobile-fixture.json'),'{}');
    const isolated=join(root,'ui-runs','a'.repeat(32),'mobile-fixture.json');mkdirSync(dirname(isolated),{recursive:true});writeFileSync(isolated,'{}');
    work(root,isolated);
  }finally{
    assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(root.startsWith(join(tmpdir(),'betweenus-ui-fixture-')));
    rmSync(root,{recursive:true});
  }
}
test('UI fixture selection preserves the default and permits only a new isolated run',()=>fixture((root,file)=>{
  assert.equal(localUiFixturePath(undefined,root),join(root,'mobile-fixture.json'));
  assert.equal(localUiFixturePath(file,root),file);
}));
test('UI fixture overrides cannot select another file, directory or arbitrary external credentials',()=>fixture((root)=>{
  for(const value of ['',true,join(root,'status.json'),join(root,'ui-runs','unreviewed','mobile-fixture.json'),join(root,'..','mobile-fixture.json'),join(root,'ui-runs','a'.repeat(32))]){
    assert.throws(()=>localUiFixturePath(value,root),/selection refused/);
  }
}));
test('oversized fixture files fail without leaking their contents',()=>fixture((root,file)=>{
  writeFileSync(file,'sensitive-fixture-placeholder'.repeat(1000));
  assert.throws(()=>localUiFixturePath(file,root),error=>error instanceof Error&&error.message==='Local UI fixture selection refused; use the default or an isolated reviewed run.');
}));
test('a junction or symlink at the private root cannot redirect the accepted fixture tree',()=>fixture(root=>{
  const alias=join(root,'root-alias');symlinkSync(root,alias,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>localUiFixturePath(undefined,alias),/selection refused/);
}));
test('a redirected isolated parent cannot select a different run',()=>fixture((root,file)=>{
  const alias=join(root,'ui-runs','b'.repeat(32));symlinkSync(dirname(file),alias,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>localUiFixturePath(join(alias,'mobile-fixture.json'),root),/selection refused/);
}));
test('a fixture file symlink cannot select another file',t=>fixture(root=>{
  const alias=join(root,'ui-runs','c'.repeat(32),'mobile-fixture.json');mkdirSync(dirname(alias),{recursive:true});
  try{symlinkSync(join(root,'mobile-fixture.json'),alias,'file');}catch(error){
    if(process.platform==='win32'&&(error as NodeJS.ErrnoException).code==='EPERM'){t.skip('Windows file-symlink privilege unavailable; directory-junction cases remain tested.');return;}
    throw error;
  }
  assert.throws(()=>localUiFixturePath(alias,root),/selection refused/);
}));
