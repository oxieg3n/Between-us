import * as SecureStore from "expo-secure-store";
// Persist only the managed session, never journals/drafts. No cloud-backup key migration.
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
export const sessionStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key, options),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, options),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key, options),
};
