import {forwardRef,useCallback,useImperativeHandle,useLayoutEffect,useMemo,useRef,type ComponentRef} from 'react';
import {AppState,Platform,Text as NativeText,TextInput as NativeTextInput,useWindowDimensions,type TextProps,type TextInputProps} from 'react-native';
import {createNativeTextHostGate,createNativeTextHostGeneration,nativeTextMetricsKey} from './native-text-host';

type InputInstance=ComponentRef<typeof NativeTextInput>;
type Selection=Readonly<{start:number;end:number}>;

/** RN 0.88 Fabric workaround: replace only the host, never the owner or its writing state. */
export const Text=forwardRef<ComponentRef<typeof NativeText>,TextProps>(function AdaptiveText(props,ref){
  const {fontScale,scale}=useWindowDimensions();
  return <NativeText {...props} ref={ref} key={Platform.OS==='web'?'web':nativeTextMetricsKey(fontScale,scale)}/>;
});

/** Controlled words stay with the caller. This wrapper retains only focus/cursor metadata. */
export const TextInput=forwardRef<InputInstance,TextInputProps>(function AdaptiveTextInput(props,ref){
  const {fontScale,scale}=useWindowDimensions();
  // An uncontrolled input has native-only text which cannot be recovered without copying it.
  // Preserve that host instead of losing its body; production writing inputs are controlled.
  const nativeKey=Platform.OS!=='web'&&typeof props.value==='string'?nativeTextMetricsKey(fontScale,scale):'unchanged';
  const generation=useMemo(()=>createNativeTextHostGeneration(nativeKey),[nativeKey]);
  const gate=useRef(createNativeTextHostGate<InputInstance>()).current;
  const focused=useRef(false),selection=useRef<Selection|undefined>(props.selection?{start:props.selection.start,end:props.selection.end??props.selection.start}:undefined);
  const restore=useRef<{previous:InputInstance;focused:boolean;selection?:Selection}|null>(null);
  const current=useRef({editable:props.editable,controlled:typeof props.value==='string',length:props.value?.length??0,selection:props.selection});
  useLayoutEffect(()=>{current.current={editable:props.editable,controlled:typeof props.value==='string',length:props.value?.length??0,selection:props.selection};});
  const attach=useCallback((node:InputInstance|null)=>{
    if(node){gate.attach(generation,node);return;}
    const previous=gate.detach(generation);
    if(previous){
      restore.current={previous,focused:focused.current||previous.isFocused(),selection:selection.current};
    }
  },[gate,generation]);
  useImperativeHandle(ref,()=>gate.current(generation)!,[gate,generation]);
  useLayoutEffect(()=>{
    const pending=restore.current,node=gate.current(generation);restore.current=null;
    if(!pending?.focused||!node||Platform.OS==='web')return;
    const frame=requestAnimationFrame(()=>{
      const latest=current.current;
      if(AppState.currentState!=='active'||gate.current(generation)!==node||!latest.controlled||latest.editable===false)return;
      // Do not steal focus if the author deliberately selected a different field meanwhile.
      const other=NativeTextInput.State.currentlyFocusedInput();
      if(other&&other!==node&&other!==pending.previous)return;
      try{
        node.focus();
        const cursor=latest.selection??pending.selection;
        if(cursor){
          const start=Math.max(0,Math.min(cursor.start,latest.length));
          const end=Math.max(start,Math.min(cursor.end??cursor.start,latest.length));
          node.setSelection(start,end);
        }
      }catch{/* Native focus restoration needs device qualification; never copy text as a fallback. */}
    });
    return()=>cancelAnimationFrame(frame);
  },[gate,generation]);
  const admitted=()=>gate.current(generation)!==undefined;
  return <NativeTextInput {...props} key={nativeKey} ref={attach}
    onFocus={event=>{if(!admitted())return;focused.current=true;props.onFocus?.(event);}}
    onBlur={event=>{if(!admitted())return;focused.current=false;props.onBlur?.(event);}}
    onChange={event=>{if(admitted())props.onChange?.(event);}}
    onChangeText={value=>{if(admitted())props.onChangeText?.(value);}}
    onSelectionChange={event=>{
      if(!admitted())return;
      const cursor=event.nativeEvent.selection;
      if(Number.isInteger(cursor.start)&&Number.isInteger(cursor.end)&&cursor.start>=0&&cursor.end>=cursor.start)selection.current={start:cursor.start,end:cursor.end};
      props.onSelectionChange?.(event);
    }}/>;
});
