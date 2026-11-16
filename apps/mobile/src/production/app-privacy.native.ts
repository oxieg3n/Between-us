import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { getBetweenUsProtection } from '../../modules/between-us-protection';
/** Keep OS snapshot protection for the Activity/app lifetime, including account transitions. */
export async function establishAppPrivacy(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') return await getBetweenUsProtection()?.protectAndroidRecents?.() ?? false;
    if (Platform.OS === 'ios') { await ScreenCapture.enableAppSwitcherProtectionAsync(1); return true; }
    return false;
  } catch { return false; }
}
