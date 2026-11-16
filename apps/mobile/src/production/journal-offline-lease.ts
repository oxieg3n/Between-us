import type {VaultActor} from './vault';

export const MAX_JOURNAL_LEASE_MS = 15 * 60 * 1000;
export type AccountBoundary = Readonly<{epoch:number;userId:string|null}>;
export type JournalServerLease = Readonly<{issuer:string;subject:string;sessionId:string;remainingMs:number}>;
export type JournalLeaseTiming = Readonly<{epoch:number;startedAt:number;deadline:number}>;
export type JournalLeaseAccess = {actor:VaultActor;role:'parent'|'child';lease?:JournalLeaseTiming};
export type JournalLocalAvailability = Readonly<{authorId:string;epoch:number;unlocked:boolean;deadline:number}>;
const sameActor = (a:VaultActor,b:VaultActor) => a.issuer===b.issuer&&a.subject===b.subject&&a.sessionId===b.sessionId;

/** A live unlocked capability only. No clock dates, tokens, network, files or idle touches. */
export function createJournalOfflineLease(ports:{
  now():number;
  boundary():AccountBoundary;
  lifetime():number;
  current():JournalLeaseAccess|undefined;
  invalidate():void;
  changed(value:JournalLocalAvailability|null):void;
}) {
  let held:{access:JournalLeaseAccess&{lease:JournalLeaseTiming};lifetime:number}|undefined,lastClock=-1;
  const listeners=new Set<()=>void>();
  const notify=()=>{for(const listener of listeners)listener();};
  function now() {
    const value=ports.now();
    if (!Number.isFinite(value)||value<0||value<lastClock) return undefined;
    lastClock=value;return value;
  }
  function clear() {held=undefined;ports.changed(null);notify();}
  function snapshot() {
    if(!held)return false;
    const clock=ports.now(),boundary=ports.boundary(),current=ports.current(),{access,lifetime}=held;
    return Number.isFinite(clock)&&clock>=0&&clock>=lastClock&&clock<access.lease.deadline&&ports.lifetime()===lifetime&&boundary.epoch===access.lease.epoch&&boundary.userId===access.actor.subject&&!!current&&current.role===access.role&&sameActor(current.actor,access.actor);
  }
  function allowed() {
    if (!held) return false;
    const clock=now(),boundary=ports.boundary(),current=ports.current(),{access,lifetime}=held;
    if (clock===undefined||clock>=access.lease.deadline||ports.lifetime()!==lifetime||boundary.epoch!==access.lease.epoch||boundary.userId!==access.actor.subject||!current||current.role!==access.role||!sameActor(current.actor,access.actor)) {
      clear();ports.invalidate();return false;
    }
    return true;
  }
  function start(access:JournalLeaseAccess) {
    const clock=now(),boundary=ports.boundary(),timing=access.lease,current=ports.current();
    if (clock===undefined||!timing||!Number.isSafeInteger(timing.epoch)||timing.epoch<0||timing.epoch!==boundary.epoch||boundary.userId!==access.actor.subject
      ||!Number.isFinite(timing.startedAt)||timing.startedAt<0||!Number.isFinite(timing.deadline)||timing.deadline<=timing.startedAt||timing.deadline-timing.startedAt>MAX_JOURNAL_LEASE_MS
      ||clock<timing.startedAt||clock>=timing.deadline||!current||current.role!==access.role||!sameActor(current.actor,access.actor)) return false;
    held={access:{actor:{...access.actor},role:access.role,lease:{...timing}},lifetime:ports.lifetime()};
    ports.changed({authorId:access.actor.subject,epoch:timing.epoch,unlocked:true,deadline:timing.deadline});notify();return true;
  }
  return {start,renew(access:JournalLeaseAccess) {return allowed()&&start(access);},allowed,snapshot,clear,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}};
}
