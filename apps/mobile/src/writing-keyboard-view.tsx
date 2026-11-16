import {useCallback,useRef,useState,type ComponentRef,type ReactNode} from 'react';
import {KeyboardAvoidingView,Platform,View,type StyleProp,type ViewStyle} from 'react-native';

/** Android edge-to-edge does not resize the window for the IME. Measure our custom header offset. */
export function WritingKeyboardView({children,style}:{children:ReactNode;style?:StyleProp<ViewStyle>}){
  const frame=useRef<ComponentRef<typeof View>>(null),[top,setTop]=useState(0);
  const measure=useCallback(()=>{
    if(Platform.OS==='web')return;
    frame.current?.measureInWindow((_x,y)=>{
      if(Number.isFinite(y)&&y>=0)setTop(previous=>previous===y?previous:y);
    });
  },[]);
  return <View ref={frame} style={[{flex:1},style]} onLayout={measure}>
    <KeyboardAvoidingView style={{flex:1}} behavior="padding" keyboardVerticalOffset={top}>
      {children}
    </KeyboardAvoidingView>
  </View>;
}
