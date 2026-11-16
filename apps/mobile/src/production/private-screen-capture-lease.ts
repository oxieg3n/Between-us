export type PrivateCaptureActivation=Readonly<{key:string|null}>;
export type PrivateCaptureState={covered:boolean;error:boolean};
export const privateCaptureActivation=(key:string|null):PrivateCaptureActivation=>Object.freeze({key});
/** Identity, not key equality: A -> null -> A must await a new native protection confirmation. */
export function privateCaptureState(activation:PrivateCaptureActivation,ready:PrivateCaptureActivation|null,failed:PrivateCaptureActivation|null):PrivateCaptureState{
  return activation.key===null?{covered:false,error:false}:{covered:ready!==activation,error:failed===activation};
}
export function createPrivateScreenCaptureLease(ports:{
  protect(tag:string):Promise<void>;
  release(tag:string):Promise<void>;
  onReady():void;
  onError():void;
  newTag():string;
}){
  let disposed=false,tag:string|undefined,retiring:Promise<void>|undefined;
  const notify=(callback:()=>void)=>{try{callback();}catch{/* A failed UI callback cannot weaken the native protection. */}};
  const protecting=Promise.resolve().then(()=>{
    tag=ports.newTag();if(typeof tag!=='string'||!tag||tag.length>200)throw Error('Capture lease tag unavailable.');
    return ports.protect(tag);
  });
  const settled=protecting.then(()=>{if(!disposed)notify(ports.onReady);},()=>{if(!disposed)notify(ports.onError);});
  return {
    settled,
    dispose():Promise<void>{
      if(retiring)return retiring;
      disposed=true;
      // Native protect can complete after departure. Releasing before it settles would leave a leaked/incorrect barrier.
      retiring=settled.then(async()=>{if(tag)await ports.release(tag);}).catch(()=>{
        // A failed release remains restrictive. Never call the unscoped/global allow API as a workaround.
      });
      return retiring;
    },
  };
}
