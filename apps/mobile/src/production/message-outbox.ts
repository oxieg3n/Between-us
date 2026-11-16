import {MessageOutboxError,type MessageOutbox,type MessageOutboxScope} from './message-outbox-policy';
export const messageOutboxSupported=false;
export function createMessageOutbox(_scope:MessageOutboxScope):MessageOutbox {
  void _scope;
  const unavailable=async():Promise<never>=>{throw new MessageOutboxError('unsupported');};
  return {persistApproved:unavailable,loadPending:unavailable,loadRecovery:unavailable,resolve:unavailable,removeResolved:unavailable};
}
