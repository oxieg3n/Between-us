import {useEffect,useMemo,useState} from 'react';
import {randomUUID} from 'expo-crypto';
import * as ScreenCapture from 'expo-screen-capture';
import {createPrivateScreenCaptureLease,privateCaptureActivation,privateCaptureState,type PrivateCaptureActivation,type PrivateCaptureState} from './private-screen-capture-lease';

/** Root keeps one non-null scope through protected conversation -> explicit review -> conversation. */
export function usePrivateMessageCapture(scopeKey:string|null):PrivateCaptureState{
  const activation=useMemo(()=>privateCaptureActivation(scopeKey),[scopeKey]);
  const [ready,setReady]=useState<PrivateCaptureActivation|null>(null),[failed,setFailed]=useState<PrivateCaptureActivation|null>(null);
  useEffect(()=>{
    if(activation.key===null)return;
    const lease=createPrivateScreenCaptureLease({
      newTag:()=>`between-us-private-message-${randomUUID()}`,
      protect:tag=>ScreenCapture.preventScreenCaptureAsync(tag),
      release:tag=>ScreenCapture.allowScreenCaptureAsync(tag),
      onReady:()=>setReady(activation),onError:()=>setFailed(activation),
    });
    return()=>{void lease.dispose();};
  },[activation]);
  return privateCaptureState(activation,ready,failed);
}
