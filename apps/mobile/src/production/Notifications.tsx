import {useEffect,useRef,useState} from 'react';
import { Platform, ScrollView, View } from "react-native";
import { Text } from "../adaptive-writing-text";
import Constants from 'expo-constants';
import {useAppearance} from '../appearance';
import {Body,Button,Field,Heading,Paper} from '../ui';
import {accountRpc,type AccountContext} from './client';
import {preparePushRegistration} from './push-registration';

type Preferences={enabled:boolean;timezone:string;quietStart:number;quietEnd:number;deliveryOperational:boolean};
export function ProductionNotifications({context,onBack}:{context:AccountContext;onBack:()=>void}) {
  const {theme}=useAppearance(),userId=context.user.id;
  const [enabled,setEnabled]=useState(false),[timezone,setTimezone]=useState('UTC'),[start,setStart]=useState('22'),[end,setEnd]=useState('8');
  const [busy,setBusy]=useState(true),[notice,setNotice]=useState(''),[operational,setOperational]=useState(false),[deviceId,setDeviceId]=useState<string|null>(null);
  const alive=useRef(true),working=useRef(false);
  const rawProject=Constants.expoConfig?.extra?.eas?.projectId;
  const projectId=typeof rawProject==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawProject)?rawProject:null;
  const native=Platform.OS==='android'||Platform.OS==='ios';
  function apply(value:Preferences){setEnabled(value.enabled);setTimezone(value.timezone);setStart(String(value.quietStart));setEnd(String(value.quietEnd));setOperational(value.deliveryOperational===true);}
  useEffect(()=>{
    alive.current=true;
    void accountRpc<Preferences>('get_notification_preferences',{},userId).then(value=>{if(alive.current)apply(value);}).catch(()=>{if(alive.current)setNotice('Notification settings could not be loaded. Retry online.');}).finally(()=>{if(alive.current)setBusy(false);});
    return()=>{alive.current=false;};
  },[userId]);
  async function run(work:()=>Promise<void>){
    if(working.current)return;working.current=true;setBusy(true);setNotice('');
    try{await work();}catch(error){if(alive.current)setNotice(error instanceof Error?error.message:'This action was not confirmed.');}
    finally{working.current=false;if(alive.current)setBusy(false);}
  }
  return <ScrollView style={{backgroundColor:theme.background}} contentContainerStyle={{padding:20,gap:18,paddingBottom:60}} keyboardShouldPersistTaps="handled">
    <Button label="Back" quiet disabled={busy} onPress={onBack}/><Heading large>Room for quiet.</Heading>
    <Body>Choose whether Between Us may send a neutral invitation to open the app. Journal writing, hidden savings matches and message words never appear in these previews.</Body>
    <Body muted>{operational?'The service has enabled its notification path; device receipt still needs separate verification.':'Push delivery is not operational in this development environment. Saving a preference does not enable delivery.'}</Body>
    {!!notice&&<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:17,lineHeight:25}}>{notice}</Text>}
    <Paper><Heading>Your preferences</Heading><Button label="Allow neutral notifications" selected={enabled} disabled={busy} onPress={()=>setEnabled(value=>!value)}/>
      <Field label="Notification time zone (IANA name)" value={timezone} onChangeText={setTimezone}/>
      <View style={{gap:12}}><Field label="Quiet hours start (0–23)" value={start} onChangeText={setStart}/><Field label="Quiet hours end (0–23)" value={end} onChangeText={setEnd}/></View>
      <Body muted>Equal start and end means no quiet interval. Quiet hours do not create reminders for skipped check-ins.</Body>
      <Button label="Save notification preferences" primary disabled={busy} onPress={()=>{void run(async()=>{
        if(!/^(?:[0-9]|1[0-9]|2[0-3])$/.test(start)||!/^(?:[0-9]|1[0-9]|2[0-3])$/.test(end))throw new Error('Use whole hours from 0 to 23.');
        const value=await accountRpc<Preferences>('set_notification_preferences',{p_enabled:enabled,p_timezone:timezone.trim(),p_quiet_start:Number(start),p_quiet_end:Number(end)},userId);
        if(alive.current){apply(value);setNotice('Preferences saved by the server. Actual device delivery is not confirmed.');}
      });}}/>
      <Button label="Turn notifications off now" disabled={busy} onPress={()=>{void run(async()=>{
        const current=await accountRpc<Preferences>('get_notification_preferences',{},userId);
        const value=await accountRpc<Preferences>('set_notification_preferences',{p_enabled:false,p_timezone:current.timezone,p_quiet_start:current.quietStart,p_quiet_end:current.quietEnd},userId);
        if(alive.current){apply(value);setNotice('Notifications disabled. Pending deliveries are checked against this preference again.');}
      });}}/>
    </Paper>
    <Paper><Heading>This device</Heading><Body muted>{!native?'Browser review does not register push tokens.':!projectId?'Device registration is unavailable until the owner configures the reviewed native push project and platform credentials.':'Register only when you want the native permission prompt. Registration does not prove that a notification arrived.'}</Body>
      <Button label="Register this device for neutral notifications" disabled={busy||!native||!projectId} onPress={()=>{void run(async()=>{
        if(!projectId)throw new Error('The reviewed push project is unavailable.');
        const device=await preparePushRegistration(projectId);
        if(!alive.current)return;
        const result=await accountRpc<{id:string;status:string}>('register_device',{p_platform:device.platform,p_token:device.token},userId);
        if(alive.current){setDeviceId(result.id);setNotice('Device registered with the account service. Provider and device delivery remain unverified.');}
      });}}/>
      {!!deviceId&&<Button label="Revoke this device registration" disabled={busy} onPress={()=>{void run(async()=>{
        await accountRpc('revoke_device',{p_device_id:deviceId},userId);if(alive.current){setDeviceId(null);setNotice('This registration was revoked.');}
      });}}/>}
    </Paper><Body muted>Sign-out revokes this account session. No other account receives its device registration through an ordinary account switch.</Body>
  </ScrollView>;
}
