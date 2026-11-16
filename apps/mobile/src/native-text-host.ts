/** Local native-host identity, never an author/session capability or a text store. */
export type NativeTextHostGeneration=Readonly<{key:string}>;
export const createNativeTextHostGeneration=(key:string):NativeTextHostGeneration=>Object.freeze({key});
/** Density affects native SP measurement too; window/keyboard dimensions must not remount writing. */
export const nativeTextMetricsKey=(fontScale:number,scale:number)=>`font:${fontScale};density:${scale}`;

/** Only ref attachment commits a generation; preparing a concurrent render changes nothing. */
export function createNativeTextHostGate<Node extends object>(){
  let attached:{generation:NativeTextHostGeneration;node:Node}|undefined;
  return {
    attach(generation:NativeTextHostGeneration,node:Node){attached={generation,node};},
    current(generation:NativeTextHostGeneration):Node|undefined{return attached?.generation===generation?attached.node:undefined;},
    detach(generation:NativeTextHostGeneration):Node|undefined{
      if(attached?.generation!==generation)return undefined;
      const node=attached.node;attached=undefined;return node;
    },
  };
}
