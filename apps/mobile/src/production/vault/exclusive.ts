import type {VaultController} from './types';

/** A new private screen must wait for all previous vault handles to retire. */
export function createExclusiveVaultFactory<Configuration>(create:(configuration?:Configuration)=>Promise<VaultController>) {
  let active:VaultController|undefined,tail:Promise<unknown>=Promise.resolve();
  return (configuration?:Configuration):Promise<VaultController>=>{
    const pending=tail.then(async()=>{
      // A failed retirement remains attached and keeps the next request closed.
      await active?.dispose();
      const controller=await create(configuration);
      let retirement:Promise<void>|undefined;
      const lease={...controller,dispose(){return retirement??=Promise.resolve().then(()=>controller.dispose());}};
      active=lease;
      return lease;
    });
    tail=pending.then(()=>undefined,()=>undefined);
    return pending;
  };
}
