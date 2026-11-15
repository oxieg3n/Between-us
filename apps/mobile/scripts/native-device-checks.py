import importlib.util,json,os,re,subprocess,time,sys
from pathlib import Path
from types import SimpleNamespace
module=Path(__file__).with_name('capture-open-letter.py')
spec=importlib.util.spec_from_file_location('native_capture',module)
lib=importlib.util.module_from_spec(spec);spec.loader.exec_module(lib)
args=SimpleNamespace(adb=Path(os.environ['LOCALAPPDATA'])/'Android/Sdk/platform-tools/adb.exe',serial='emulator-5554',replace=False)
native=lib.NativeCapture(args)
base=Path(__file__).resolve().parents[3]/'spec/qa/open-letter/responsive'
# Preserve checked-in evidence on ordinary reruns; --replace is explicit recapture.
root=base if '--replace' in sys.argv else base/'runs'/time.strftime('%Y%m%d-%H%M%S')
if root.exists() and '--replace' not in sys.argv:raise FileExistsError('A native QA run already exists at this timestamp')
root.mkdir(parents=True,exist_ok=True)
lib.CAPTURES=root
results=[]
input_only='--input-only' in sys.argv
def read_size():
 sizes=re.findall(r'(\d+)x(\d+)',native.command('shell','wm','size'));native.width,native.height=map(int,sizes[-1])
def snapshot(name):
 data=native.command('exec-out','screencap','-p',binary=True);(root/name).write_bytes(data)
def home():
 native.wait_ready()
 if native.find('Home',clickable=True) is None:native.tap('Explore as Sam')
 native.tap('Home');native.top()
def settle():
 for attempt in range(5):
  try:
   native.tree();return
  except Exception:
   time.sleep(.5)
 raise RuntimeError('Native tree unavailable after configuration change')
size_before=native.command('shell','wm','size');density_before=native.command('shell','wm','density');font_before=native.command('shell','settings','get','system','font_scale')
def assert_above_ime():
 tree=native.tree()
 window=native.command('shell','dumpsys','window')
 matches=re.findall(r'type=ime frame=\[\d+,(\d+)\]\[\d+,\d+\][^\n]*visible=true',window)
 if not matches:raise AssertionError('No visible software keyboard frame; keyboard avoidance not proven')
 ime_top=min(map(int,matches))
 positions={}
 for label in ['Message draft','Review']:
  node=next((n for n in tree.iter('node') if native.matches(n,label) and native.bounds(n)),None)
  if node is None:raise AssertionError('Keyboard control missing: '+label)
  bounds=list(map(int,re.findall(r'\d+',node.get('bounds',''))))
  if bounds[3]>ime_top:raise AssertionError(f'{label} is covered by IME: {bounds}, IME top {ime_top}')
  positions[label]=bounds
 results.append({'case':'visible keyboard geometry','ime_top':ime_top,'controls':positions,'result':'full input and Review bounds are above visible IME'})
def restore_wm(kind,previous):
 match=re.search(r'Override (?:size|density):\s*(\S+)',previous)
 native.command('shell','wm',kind,match.group(1) if match else 'reset')
try:
 if not input_only:
  native.settings();native.tap('Dark mode');native.require('Night Harbor',prefix=True)
  native.command('shell','am','force-stop','host.exp.exponent')
  url='exp://127.0.0.1:8082?__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1'
  native.command('shell',f"am start -W -a android.intent.action.VIEW -d '{url}' host.exp.exponent")
  time.sleep(.5)
  native.command('shell',"am start -W -a android.intent.action.VIEW -d exp://127.0.0.1:8082 host.exp.exponent")
  native.command('shell',f"am start -W -a android.intent.action.VIEW -d '{url}' host.exp.exponent")
  native.wait_ready()
  if native.find('Explore as Sam',clickable=True) is not None:native.tap('Explore as Sam')
  native.settings();native.require('Night Harbor',prefix=True)
  selected=native.find('Dark mode',clickable=True)
  if selected is None or selected.get('selected')!='true':raise AssertionError('Native Dark mode preference did not persist after process restart')
  snapshot('appearance-after-process-restart.png')
  results.append({'case':'native appearance persistence','result':'Dark mode remained selected after force-stop and re-opening Expo Go; only fictional process memory was reset.'})
  home()
  for name,w,h,density in [('small',840,1680,420),('standard',1080,2424,420),('large',1260,2730,420),('tablet',1920,2560,320)]:
   native.command('shell','wm','size',f'{w}x{h}');native.command('shell','wm','density',density);read_size();settle();home()
   for label in ['Home','Journal','Chats','Circle']:
    node=native.find(label,clickable=True)
    if node is None:raise AssertionError(f'{name}: navigation missing {label}')
   snapshot(name+'-home.png');native.tap('Journal');native.require('My Journal');snapshot(name+'-journal.png')
   results.append({'case':name,'pixels':[w,h],'density':density,'dp':[round(w*160/density),round(h*160/density)],'navigation':'passed','journal':'opened','note':'Viewport override on the same Pixel_10 AVD; not separate hardware.'})
  restore_wm('size',size_before);restore_wm('density',density_before);read_size();settle();home()
 native.command('shell','settings','put','system','font_scale','2.0');settle();home();snapshot('font-scale-200-home.png')
 native.tap('Journal');native.require('My Journal');snapshot('font-scale-200-journal.png')
 results.append({'case':'native font scale 200%','navigation':'all four destinations reachable','journal':'opened','visual_review':'required'})
 native.command('shell','settings','put','system','font_scale',font_before if font_before!='null' else '1.0');settle();home()
 native.tap('Chats');native.tap('Open conversation with Alex.',prefix=True);native.tap('Message draft')
 native.command('shell','input','text','Fictional%snative%skeyboard%stest');assert_above_ime();snapshot('conversation-keyboard.png')
 native.tap('Review');native.require('Review your words');snapshot('native-message-review.png')
 native.command('shell','input','keyevent','4');native.require('Message draft');native.require('Fictional native keyboard test');native.tap('Review');native.require('Review your words')
 native.tap('Simulate send');native.require('Simulated message only.',prefix=True);snapshot('native-simulated-message.png')
 results.append({'case':'native keyboard and review','result':'typed fictional text, tapped Review above visible IME, Back preserved draft, re-reviewed and simulated send completed'})
 native.command('shell','input','keyevent','4');native.require('Review your words')
 results.append({'case':'Android nested Back','result':'returned from conversation to prior review screen'})
except Exception as error:
 results.append({'failed':str(error)});raise
finally:
 restore_wm('size',size_before);restore_wm('density',density_before)
 if font_before=='null':native.command('shell','settings','delete','system','font_scale')
 else:native.command('shell','settings','put','system','font_scale',font_before)
 (root/('native-input-results.json' if input_only else 'native-device-results.json')).write_text(json.dumps({'source':subprocess.check_output(['git','rev-parse','HEAD'],cwd=lib.PROJECT,text=True).strip(),'results':results,'restored':{'size':size_before,'density':density_before,'font_scale':font_before}},indent=2),encoding='utf8')
print(json.dumps(results,indent=2))

print('Native QA evidence:',root)
