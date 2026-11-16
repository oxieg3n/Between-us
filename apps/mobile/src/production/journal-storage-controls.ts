import type {VaultActor} from './vault';

export const MAX_JOURNAL_REVIEW_PAGES = 5;
export type JournalStorageScope = {stamp:string;actor:VaultActor};
const sameActor = (a:VaultActor,b:VaultActor) => a.issuer===b.issuer && a.subject===b.subject && a.sessionId===b.sessionId;
const snapshot = (scope:JournalStorageScope):JournalStorageScope => ({stamp:scope.stamp,actor:{...scope.actor}});
const matches = (a:JournalStorageScope,b:JournalStorageScope|undefined) => !!b && a.stamp===b.stamp && sameActor(a.actor,b.actor);

/** Readable review only: the only content port is the vault's authenticated memory preparer. */
export function createJournalExportReview(ports:{
  current():JournalStorageScope|undefined;
  prepare(ids:readonly string[]):Promise<string>;
  changed(text:string|undefined):void;
}) {
  let selection:string[]=[],selectionScope:JournalStorageScope|undefined,version=0,pending=false;
  return {
    selection() {return [...selection];},
    select(ids:readonly string[]) {
      if (!Array.isArray(ids) || ids.length>MAX_JOURNAL_REVIEW_PAGES || ids.some(id=>typeof id!=='string'||!id) || new Set(ids).size!==ids.length) throw new Error('Select up to five different saved pages.');
      const current=ports.current();
      if (ids.length && !current) throw new Error('Unlock your own pages before selecting them.');
      selection=[...ids];selectionScope=current?snapshot(current):undefined;version++;ports.changed(undefined);
    },
    clear() { selection=[];selectionScope=undefined;version++;ports.changed(undefined); },
    hide() { ports.changed(undefined); },
    async review() {
      const current=ports.current();
      if (!current || !selectionScope || !matches(selectionScope,current) || !selection.length || pending) return false;
      const scope=snapshot(current),selected=[...selection],selectedVersion=version;
      pending=true;ports.changed(undefined);
      try {
        const text=await ports.prepare(selected);
        if (selectedVersion!==version || !matches(scope,ports.current())) return false;
        ports.changed(text);return true;
      } finally {pending=false;}
    },
  };
}

/** Drain/retire first; a fresh managed actor must still match before core erase revokes access. */
export async function eraseOwnJournalStorage(scope:JournalStorageScope,ports:{
  current():JournalStorageScope|undefined;
  drainDrafts():Promise<void>;
  retireModel():Promise<void>;
  verifyActor():Promise<VaultActor>;
  erase(actor:VaultActor):Promise<void>;
}) {
  const selected=snapshot(scope);
  if (!matches(selected,ports.current())) return false;
  await ports.drainDrafts();
  if (!matches(selected,ports.current())) return false;
  await ports.retireModel();
  if (!matches(selected,ports.current())) return false;
  const actor=await ports.verifyActor();
  if (!matches(selected,ports.current()) || !sameActor(selected.actor,actor)) return false;
  // Core erase intentionally locks this lifetime; no old unlock AbortSignal is reused.
  await ports.erase({...actor});
  return true;
}
