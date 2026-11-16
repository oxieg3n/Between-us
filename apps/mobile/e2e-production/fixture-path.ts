import {lstatSync,realpathSync} from 'node:fs';
import {relative,resolve,sep} from 'node:path';

/** Node-only QA configuration: never bundle fixture credentials or accept arbitrary input files. */
export function localUiFixturePath(override?:unknown,
  privateRoot=resolve(__dirname,'../../../services/backend/.local')):string {
  const denied=()=>new Error('Local UI fixture selection refused; use the default or an isolated reviewed run.');
  try {
    if(override!==undefined && (typeof override!=='string'||!override))throw denied();
    const canonicalRoot=realpathSync(privateRoot),expectedRoot=resolve(privateRoot);
    if(process.platform==='win32'?canonicalRoot.toLowerCase()!==expectedRoot.toLowerCase():canonicalRoot!==expectedRoot)throw denied();
    const file=override===undefined?resolve(privateRoot,'mobile-fixture.json'):resolve(override as string);
    const name=relative(privateRoot,file).split(sep).join('/');
    if(!/^(?:mobile-fixture\.json|ui-runs\/[a-f0-9]{32}\/mobile-fixture\.json)$/.test(name))throw denied();
    const info=lstatSync(file);
    if(!info.isFile()||info.isSymbolicLink()||info.size>16384||
      relative(canonicalRoot,realpathSync(file)).split(sep).join('/')!==name)throw denied();
    return file;
  }catch{throw denied();}
}
