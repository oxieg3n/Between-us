import {AndroidImportance,AndroidNotificationVisibility,setNotificationChannelAsync,getPermissionsAsync,requestPermissionsAsync,getExpoPushTokenAsync} from 'expo-notifications';
import { Platform } from 'react-native';

export async function preparePushRegistration(projectId:string):Promise<{platform:'android'|'ios';token:string}> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId) || !['android','ios'].includes(Platform.OS)) throw new Error('A reviewed native push project is required.');
  try {
    if (Platform.OS==='android') await setNotificationChannelAsync('default',{
      name:'Between Us',importance:AndroidImportance.DEFAULT,
      vibrationPattern:[],sound:null,lockscreenVisibility:AndroidNotificationVisibility.PRIVATE,
    });
    let permission=await getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission=await requestPermissionsAsync({ios:{allowAlert:true,allowBadge:false,allowSound:false}});
    if (!permission.granted) throw new Error();
    const result=await getExpoPushTokenAsync({projectId});
    if (!/^(?:ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{8,256}\]$/.test(result.data)) throw new Error();
    return {platform:Platform.OS as 'android'|'ios',token:result.data};
  } catch { throw new Error('Device registration was not confirmed. Check notification permissions and the approved push project configuration, then retry.'); }
}
