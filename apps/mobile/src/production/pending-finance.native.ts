import * as SecureStore from 'expo-secure-store';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { createPendingFinanceStore, pendingFinanceScopeKey } from './pending-finance-policy';
const options = { keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,keychainService:'betweenus.finance.pending.v1' };
export const pendingFinanceStore = createPendingFinanceStore({
  getItem:key=>SecureStore.getItemAsync(key,options),
  setItem:(key,value)=>SecureStore.setItemAsync(key,value,options),
  removeItem:key=>SecureStore.deleteItemAsync(key,options),
},async scope=>'betweenus.finance.pending.v1.'+await digestStringAsync(CryptoDigestAlgorithm.SHA256,pendingFinanceScopeKey(scope)),true);
