import {AppState,Platform} from 'react-native';
import {Directory,File} from 'expo-file-system';
import {getBetweenUsProtection} from '../../modules/between-us-protection';
import {accountClient,accountRpc,backendUrl,verifiedSessionClaims,type AccountContext} from './client';
import {verifyJournalAccess} from './journal-access';
import {createMessageOutboxPolicy,loadOrCreateOutboxKey,messageOutboxScope,messageOutboxScopeKey,MessageOutboxError,type MessageOutboxScope,type OutboxDatabase} from './message-outbox-policy';

export const messageOutboxSupported=true;
/** Separate purpose/key from the biometric vault; never opens journal or draft files. */
export function createMessageOutbox(input:MessageOutboxScope){
  const scope=messageOutboxScope(input);
  return createMessageOutboxPolicy(scope,{
    async verify(){
      const client=accountClient;
      if(!client||!backendUrl||scope.issuer!==`${backendUrl}/auth/v1`||AppState.currentState!=='active')throw new MessageOutboxError('identity');
      const access=await verifyJournalAccess({
        async getSession(){const {data,error}=await client.auth.getSession();if(error)throw error;return data.session?{accessToken:data.session.access_token,userId:data.session.user.id}:null;},
        async getUser(token){const {data,error}=await client.auth.getUser(token);if(error)throw error;return data.user?{id:data.user.id}:null;},
        async getClaims(token){const {data,error}=await verifiedSessionClaims(token,scope.authorId);if(error)throw error;return data?.claims??null;},
        getContext:()=>accountRpc<AccountContext>('get_context',{},scope.authorId),
      },{issuer:scope.issuer,subject:scope.authorId});
      if(AppState.currentState!=='active')throw new MessageOutboxError('identity');
      return {issuer:access.actor.issuer,authorId:access.actor.subject,sessionId:access.actor.sessionId};
    },
    async open():Promise<OutboxDatabase>{
      if(!['android','ios'].includes(Platform.OS))throw new MessageOutboxError('unsupported');
      // Native modules load only after verified identity. Missing modules never choose plain SQLite.
      /* eslint-disable @typescript-eslint/no-require-imports */
      const sqlite= require('expo-sqlite') as typeof import('expo-sqlite');
      const secrets=require('expo-secure-store') as typeof import('expo-secure-store');
      const crypto=require('expo-crypto') as typeof import('expo-crypto');
      /* eslint-enable @typescript-eslint/no-require-imports */
      const protection=getBetweenUsProtection(),path=await protection?.prepareMessageOutboxDirectory?.();
      if(!protection||!path||!await secrets.isAvailableAsync()||!await protection.protectMessageOutboxDirectory?.())throw new MessageOutboxError('unsupported');
      const directory=new Directory(path),hash=await crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256,messageOutboxScopeKey(scope));
      const name=`message-outbox-v1-${hash}.db`,alias=`betweenus.message-outbox.v1.${hash}`;
      const options={keychainService:'betweenus.message-outbox.v1',keychainAccessible:secrets.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
      const existing=[name,`${name}-wal`,`${name}-shm`,`${name}-journal`].some(file=>new File(directory,file).exists);
      let key=await loadOrCreateOutboxKey({existing,read:()=>secrets.getItemAsync(alias,options),
        write:value=>secrets.setItemAsync(alias,value,options),random:()=>crypto.getRandomBytesAsync(32)});
      const db=await sqlite.openDatabaseAsync(name,{useNewConnection:true},path);
      try {
        await db.execAsync(`PRAGMA key = "x'${key}'"`);key='';
        const cipher=await db.getFirstAsync<{cipher_version:string}>('PRAGMA cipher_version');
        if(!cipher?.cipher_version)throw new MessageOutboxError('unsupported');
        const version=await db.getFirstAsync<{user_version:number}>('PRAGMA user_version');
        if(version?.user_version!==0&&version?.user_version!==1)throw new MessageOutboxError('recovery-required');
        if(version?.user_version===0&&existing)throw new MessageOutboxError('recovery-required');
        await db.execAsync("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY; PRAGMA secure_delete=ON; PRAGMA cipher_memory_security=ON;");
        if(version?.user_version===0){
          await db.execAsync("BEGIN IMMEDIATE");
          try{
            await db.execAsync("CREATE TABLE outbox_scope(singleton INTEGER PRIMARY KEY CHECK(singleton=1),issuer TEXT NOT NULL,author_id TEXT NOT NULL,purpose TEXT NOT NULL CHECK(purpose='approved-message-outbox')); CREATE TABLE approved_messages(client_id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('approved','saved','rejected')));");
            await db.runAsync("INSERT INTO outbox_scope VALUES(1,?,?,'approved-message-outbox')",[scope.issuer,scope.authorId]);
            await db.execAsync('PRAGMA user_version=1; COMMIT;');
          }catch(error){try{await db.execAsync('ROLLBACK');}catch{/* Recovery retains original file/key. */}throw error;}
        }
        const meta=await db.getFirstAsync<{issuer:string;author_id:string;purpose:string}>('SELECT issuer,author_id,purpose FROM outbox_scope WHERE singleton=1');
        if(meta?.issuer!==scope.issuer||meta.author_id!==scope.authorId||meta.purpose!=='approved-message-outbox')throw new MessageOutboxError('recovery-required');
        // Wrong keys/corruption fail an actual schema read, never a replacement key.
        await db.getFirstAsync('SELECT client_id,payload,status FROM approved_messages LIMIT 1');
        if(!await protection.protectMessageOutboxDirectory())throw new MessageOutboxError('unsupported');
        return {exec:sql=>db.execAsync(sql),run:async(sql,args)=>{const r=await db.runAsync(sql,[...args]);return {changes:r.changes};},
          first:async<T>(sql:string,args:readonly(string|number|null)[]=[])=>await db.getFirstAsync<T>(sql,[...args])??undefined,
          all:<T>(sql:string,args:readonly(string|number|null)[]=[])=>db.getAllAsync<T>(sql,[...args]),
          async close(){try{await db.closeAsync();}finally{if(!await protection.protectMessageOutboxDirectory())throw new MessageOutboxError('unsupported');}}};
      }catch(error){await db.closeAsync();if(error instanceof MessageOutboxError)throw error;throw new MessageOutboxError('recovery-required');}
    },
  });
}
