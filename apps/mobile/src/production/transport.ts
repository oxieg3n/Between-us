import {AccountTransportError,type AccountTransportReason} from './account-failures';

/** Only the actual fetch boundary is classified; JSON/proof validation belongs to its caller. */
export const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const signal = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
  if(signal?.aborted)throw new AccountTransportError('cancelled');
  let reason:AccountTransportReason='network';
  const cancel = () => {if(!controller.signal.aborted){reason='cancelled';controller.abort();}};
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{if(!controller.signal.aborted){reason='timeout';controller.abort();}},20_000);
  try {
    try{return await fetch(input,{...init,signal:controller.signal});}
    catch{throw new AccountTransportError(reason);}
  }
  finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
};
