import {readFile,open,rename,unlink,lstat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const empty=status=>({status,checkins:null,finance:null,dispatch:null,receipts:null,deviceDelivered:false,read:false});
const failed=()=>({...empty('failed'),error:{stage:'validation',code:'invalid_batch'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function configured(value){return value?.enabled===true&&value.credentialsReady===true&&typeof value.ownerApprovalId==='string'
  &&/^[A-Za-z0-9._:/-]{1,200}$/.test(value.ownerApprovalId)&&typeof value.projectId==='string'&&uuid.test(value.projectId)
  &&typeof value.accessToken==='string'&&/^[A-Za-z0-9._~-]{1,2048}$/.test(value.accessToken);}
function privateConfiguration(){
  // This function is not called at all in default/--dry-run mode.
  return {enabled:process.env.BETWEENUS_NOTIFICATIONS_ENABLED==='1',credentialsReady:process.env.BETWEENUS_NOTIFICATIONS_CREDENTIALS_READY==='1',
    ownerApprovalId:process.env.BETWEENUS_NOTIFICATIONS_OWNER_APPROVAL_ID,projectId:process.env.BETWEENUS_NOTIFICATIONS_EXPO_PROJECT_ID,
    accessToken:process.env.BETWEENUS_NOTIFICATIONS_EXPO_ACCESS_TOKEN};
}
async function executeLocal(configuration){
  const status=JSON.parse((await readFile(new URL('../.local/status.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
  const database=new URL(status.DB_URL);
  if(status.API_URL!=='http://127.0.0.1:54321'||!['postgres:','postgresql:'].includes(database.protocol)
    ||!['127.0.0.1','localhost','[::1]'].includes(database.hostname)||database.port!=='54322'||database.pathname!=='/postgres'||database.search||database.hash
    ||typeof status.SERVICE_ROLE_KEY!=='string'||!status.SERVICE_ROLE_KEY)throw Error('Local notification service configuration rejected.');
  const {createClient}=await import('@supabase/supabase-js');
  const {tsImport}=await import('tsx/esm/api');
  const {createNotificationCycle}=await tsImport('../src/notification-cycle.ts',import.meta.url);
  const boundedFetch=async(input,init)=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20_000);
    const signal=init?.signal,abort=()=>controller.abort();
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    try{return await fetch(input,{...init,signal:controller.signal});}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  };
  const serviceClient=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{db:{schema:'api'},
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},global:{fetch:boundedFetch}});
  const cursorFile=new URL('../.local/notification-finance-cursor.json',import.meta.url),lockFile=new URL('../.local/notification-finance-cursor.lock',import.meta.url);
  // Exclusive one-shot ownership: a stale/foreign lock is never removed automatically.
  const cursorLock=await open(lockFile,'wx',0o600);
  try {
    const financeCursor={async read(){
      let text;
      try{
        const info=await lstat(cursorFile);
        if(!info.isFile()||info.size>256)throw Error('Private notification cursor rejected.');
        text=await readFile(cursorFile,'utf8');
      }catch(error){if(error?.code==='ENOENT')return null;throw error;}
      if(text.length>256)throw Error('Private notification cursor rejected.');
      const value=JSON.parse(text);
      if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||value.version!==1||!Object.hasOwn(value,'afterChildId')
        ||value.afterChildId!==null&&(typeof value.afterChildId!=='string'||!uuid.test(value.afterChildId)))throw Error('Private notification cursor rejected.');
      return value.afterChildId;
    },async write(afterChildId){
      if(afterChildId!==null&&(typeof afterChildId!=='string'||!uuid.test(afterChildId)))throw Error('Private notification cursor rejected.');
      const temporary=new URL(`../.local/notification-finance-cursor-${randomUUID()}.tmp`,import.meta.url);
      const file=await open(temporary,'wx',0o600);
      try{
        try{await file.writeFile(JSON.stringify({version:1,afterChildId}),'utf8');await file.sync();}
        finally{await file.close();}
        await rename(temporary,cursorFile);
      }finally{await unlink(temporary).catch(()=>{});}
    }};
    return await createNotificationCycle({serviceClient,configuration,financeCursor}).run(20);
  } finally {await cursorLock.close();await unlink(lockFile);}
}
/** Testable entry: dry-run never calls either port, so no credential env/status file is inspected. */
export async function runNotificationCycleCli(args,ports={configuration:privateConfiguration,execute:executeLocal}){
  if(args.length===0||(args.length===1&&args[0]==='--dry-run'))return empty('disabled');
  if(args.length!==1||args[0]!=='--run-approved-local')return failed();
  try{
    const configuration=ports.configuration();
    if(!configured(configuration))return empty('not_configured');
    return await ports.execute(configuration);
  }catch{return {...empty('failed'),error:{stage:'validation',code:'storage'}};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await runNotificationCycleCli(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result)+'\n');
  if(result.status==='failed')process.exitCode=1;
}
