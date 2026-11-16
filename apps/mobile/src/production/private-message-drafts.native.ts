import { accountClient,accountRpc,AccountRpcError,backendUrl,verifiedSessionClaims,type AccountContext } from './client';
import { verifyJournalAccess,JournalAccessError } from './journal-access';
import { createProtectedNativeVaultController } from './vault/platform';
import { createPrivateMessageDraftController,type MessageDraftOptions } from './private-message-draft-policy';
export const privateMessageDraftsSupported=true;
function failure(error:unknown){
  const status=error&&typeof error==='object'&&'status' in error?error.status:undefined;
  return new JournalAccessError(typeof status==='number'&&status>=400&&status<500&&status!==429?'denied':'unavailable');
}
export function createPrivateMessageDraftStorage(options:Omit<MessageDraftOptions,'verify'|'vaultFactory'>&{vaultFactory?:MessageDraftOptions['vaultFactory']}){
  return createPrivateMessageDraftController({...options,vaultFactory:options.vaultFactory??createProtectedNativeVaultController,
    async verify(signal){
      const client=accountClient;
      if(!client||!backendUrl||options.scope.issuer!==`${backendUrl}/auth/v1`)throw new JournalAccessError();
      return verifyJournalAccess({
        async getSession(){const {data,error}=await client.auth.getSession();if(error)throw failure(error);return data.session?{accessToken:data.session.access_token,userId:data.session.user.id}:null;},
        async getUser(token){const {data,error}=await client.auth.getUser(token);if(error)throw failure(error);return data.user?{id:data.user.id}:null;},
        async getClaims(token){const {data,error}=await verifiedSessionClaims(token,options.scope.authorId);if(error)throw failure(error);return data?.claims??null;},
        async getContext(){try{return await accountRpc<AccountContext>('get_context',{},options.scope.authorId);}catch(error){if(error instanceof AccountRpcError&&error.code==='42501')throw new JournalAccessError();throw new JournalAccessError('unavailable');}},
      },{issuer:options.scope.issuer,subject:options.scope.authorId},signal);
    },
  });
}
