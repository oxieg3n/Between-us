import type {PrivateCaptureState} from './private-screen-capture-lease';
/** A browser cannot promise native capture protection. Private content must remain covered. */
export function usePrivateMessageCapture(scopeKey:string|null):PrivateCaptureState{
  return {covered:scopeKey!==null,error:scopeKey!==null};
}
