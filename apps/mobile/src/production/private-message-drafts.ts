import { createPrivateMessageDraftController, type MessageDraftOptions } from './private-message-draft-policy';
import { VaultError } from './vault';
export const privateMessageDraftsSupported=false;
export function createPrivateMessageDraftStorage(options:Omit<MessageDraftOptions,'verify'|'vaultFactory'>&{vaultFactory?:MessageDraftOptions['vaultFactory']}){
  return createPrivateMessageDraftController({...options,verify:async()=>{throw new VaultError('unsupported');},vaultFactory:async()=>{throw new VaultError('unsupported');}});
}
