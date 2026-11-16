import { createPendingFinanceStore, pendingFinanceScopeKey } from './pending-finance-policy';
const memory = new Map<string,string>();
/** Browser development retains retry identity only for this page lifetime. No browser persistence. */
export const pendingFinanceStore = createPendingFinanceStore({
  getItem:async key=>memory.get(key)??null,
  setItem:async(key,value)=>{memory.set(key,value);},
  removeItem:async key=>{memory.delete(key);},
},async scope=>pendingFinanceScopeKey(scope),false);
