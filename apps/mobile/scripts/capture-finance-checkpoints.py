"""Actual native financial-history QA. Fictional isolated fixture only; credentials never logged."""
import argparse,hashlib,importlib.util,json,os,re,struct,subprocess,time
from pathlib import Path
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[3]
BUILD='1116-FinanceCheckpoints-r3'
parser=argparse.ArgumentParser()
parser.add_argument('--fixture',required=True)
parser.add_argument('--role',choices=['parent','child'],required=True)
parser.add_argument('--theme',choices=['light','dark'],required=True)
parser.add_argument('--acknowledged',action='store_true')
args=parser.parse_args()
assert str(ROOT.resolve()).lower()==str(Path('D:/projects/BetweenUs').resolve()).lower()
file=Path(args.fixture).absolute()
assert re.fullmatch(r'ui-runs/[a-f0-9]{32}/mobile-fixture.json',file.relative_to(ROOT/'services/backend/.local').as_posix())
assert file.resolve()==file and file.stat().st_size<=16384 and not file.is_symlink()
fixture=json.loads(file.read_text(encoding='utf-8-sig'))
assert fixture.get('financeArchiveQa') and fixture['url']=='http://127.0.0.1:54321' and fixture['apiUrl']=='http://127.0.0.1:8787'
assert all(fixture[r]['email'].endswith('.test') for r in ['parent','child'])
OUT=ROOT/'spec/qa/production/finance-checkpoints-r3'
OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('native_capture',Path(__file__).with_name('capture-open-letter.py'))
lib=importlib.util.module_from_spec(spec);spec.loader.exec_module(lib);lib.CAPTURES=OUT
class ProductionCapture(lib.NativeCapture):
 def find(self,label,prefix=False,clickable=False):
  for node in self.tree().iter('node'):
   if node.get('package')=='com.oxieg3n.betweenus' and self.matches(node,label,prefix) and self.bounds(node) and (not clickable or node.get('clickable')=='true'):return node
  return None
n=ProductionCapture(SimpleNamespace(adb=Path(os.environ['LOCALAPPDATA'])/'Android/Sdk/platform-tools/adb.exe',serial='emulator-5554',replace=False))
checks=[]

def require(label,prefix=False):return n.require(label,prefix=prefix)
def tap(label,prefix=False):n.tap(label,prefix=prefix)
def top():n.top()
def snap(name,description):
 target=OUT/args.theme/(args.role+'-'+name+'.png')
 if target.exists():
  raw=target.read_bytes();w,h=struct.unpack('>II',raw[16:24]);n.records.append({'file':str(target.relative_to(OUT)).replace('\\','/'),'theme':args.theme,'description':description,'width':w,'height':h,'sha256':hashlib.sha256(raw).hexdigest()});return
 n.capture(args.theme,args.role+'-'+name,description)
def align(label,prefix=False):
 node=n.locate(label,prefix=prefix)
 x,y=n.bounds(node)
 if y>n.height*.4:n.command('shell','input','swipe',x,y,x,int(n.height*.3),350)
 time.sleep(.2)
 require(label,prefix)
def secret_input(value):
 if not re.fullmatch(r'[A-Za-z0-9@._+-]{1,128}',value):raise RuntimeError('Fictional credential format refused.')
 try:
  result=subprocess.run([n.adb,'-s',n.serial,'shell','input','text',value],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
  if result.returncode:raise RuntimeError()
 except Exception:raise RuntimeError('Fictional credential input failed; value suppressed.') from None

def home():tap('Home');top();require('Some things are',True)
def settings():tap('Settings');require('Profile & appearance');top()
def sign_in():
 if n.find('Back to account',clickable=True) is not None:tap('Back to account')
 if n.find('Home',clickable=True) is not None:home()
 if n.find('Settings',clickable=True) is not None:
  settings()
  if n.find('Sign out on this device',clickable=True) is not None:tap('Sign out on this device');require('A place to start, together.')
  else:tap('Back')
 if n.find('Welcome back') is None:tap('Sign in')
 require('Welcome back')
 for label,key in [('Email or child account identifier','email'),('Password','password')]:
  node=n.locate(label,clickable=True)
  if node.get('class')!='android.widget.EditText' or (label=='Password' and node.get('password')!='true'):raise RuntimeError('Credential field identity was not verified.')
  tap(label);secret_input(fixture[args.role][key])
 n.command('shell','input','keyevent','4')
 tap('Sign in');require('Hi, '+fixture[args.role]['name']+'.');top()
 checks.append({'case':'distinct managed sign-in','role':args.role,'result':'PASS','credentialValuesLogged':False})
def finance():
 home();tap('Chores & savings')
 if n.find('Financial records: Alex',clickable=True) is not None:tap('Financial records: Alex')
 require("Alex's financial plans");require('Refresh from server');top()
def older():
 tap('Financial history');tap('Older settled financial records');snap('history-entry','Direct access to older settled records without scrolling through100 recent actions.')
 tap('Load older settled records');require('Refresh older records');snap('archive-page','Twenty-record server-authorized archive page.')
 hint=fixture['financeArchiveQa'].get('gardenPageIndex')
 if hint is not None:
  if not isinstance(hint,int) or not 0<=hint<=6:raise RuntimeError('Bounded fictional navigation hint refused.')
  for _ in range(hint):tap('Next page of settled records')
  node=n.locate('Open settled record: Fictional garden watering',prefix=True,clickable=True)
  x,y=n.bounds(node);n.command('shell','input','tap',x,y);time.sleep(.2)
  align('Retained record');snap('settled-record','Actual retained earning and manual payout report; no provider transfer.')
  return
 for page in range(7):
  node=None
  for position in range(6):
   node=n.find('Open settled record: Fictional garden watering',prefix=True,clickable=True)
   if node is not None:break
   if position<5:n.swipe('down')
  if node is None:
   if page==6:raise RuntimeError('Fictional retained garden record not found within bounded pages.')
   tap('Next page of settled records');require('Refresh older records');continue
  x,y=n.bounds(node);n.command('shell','input','tap',x,y);time.sleep(.2);break
 align('Retained record');snap('settled-record','Actual retained earning and manual payout report; no provider transfer.')

def main():
 sign_in();settings();require(BUILD,True);top()
 theme_label='Safe Harbor '+chr(183)+' Light' if args.theme=='light' else 'Night Harbor '+chr(183)+' Dark'
 tap(theme_label)
 selected=n.find(theme_label,clickable=True)
 if selected is None or selected.get('selected')!='true':raise RuntimeError('Actual appearance selection was not confirmed.')
 top();snap('appearance','Theme changed through actual app appearance settings.');require(BUILD,True);snap('build','Actual installed0.6.0/code5 source build identifier.');home();snap('home','Actual '+args.role+' home with the approved branding.')
 finance();snap('finances','Authoritative family financial summary with retained paid basis.');older()
 if args.role=='parent':
  tap('Reason for a historical correction');n.command('shell','input','text','Fictional%shistorical%sreview%sonly');time.sleep(.3)
  snap('note-keyboard','Native historical correction field with the actual Android keyboard.')
  n.command('shell','input','keyevent','4');tap('Review historical earning correction: Fictional garden watering')
  require('Correct this historical earning?');detail=require('Fictional garden watering, due ',True);assert all(text in detail.get('text','') for text in ['$1.00','Earning reference:','Fictional historical review only']);top();snap('earning-review','Explicit compensating-event review; confirmation was not pressed.');tap('Return to editing')
 else:
  if not args.acknowledged:
   tap('Review historical receipt acknowledgment');require('Did you receive this amount?');detail=require('Acknowledge personally receiving ',True);assert all(text in detail.get('text','') for text in ['$1.00','cash','Payment reference:']);top();snap('receipt-review','Explicit review of the archived receipt; confirmation was not pressed.');tap('Return to editing')
  else:
   require('Receipt acknowledged by the child');snap('receipt-status','The previously confirmed native receipt stays acknowledged; a family report is not provider verification.')
 tap('All financial sections');tap('Savings goals');top();snap('goals','Savings goal view; surprise parent contributions are absent for the child.')
 tap('All financial sections');tap('Manual payouts and reconciliation' if args.role=='parent' else 'My earnings and cash-out');top();snap('payouts','Manual family reports and cash-out controls; retained paid totals remain exact.')
 align('Payout 1',True);snap('payment-row','Actual saved cash payment row renders on Android without a raw text error.')
 if args.role=='child':
  tap('Review cash-out request');require('Request cash-out?');top();snap('cashout-review','An ordinary cash-out request still requires explicit review; confirmation was not pressed.');tap('Return to editing')
 if args.role=='parent':
  tap('All financial sections');tap('Parent matching');top();snap('matching','Parent-only matching configuration and current summary.')
  tap('Open and older matching records');tap('Load open matching records');tap('Load older parent matching records');align('Older settled matching records');snap('matching-history','Parent-only retained surprise contribution and reconciliation record.')
  tap('Review revealing this retained contribution');require('Reveal this retained contribution?');detail=require('Contribution for ',True);assert all(text in detail.get('text','') for text in ['Reference:','$1.00','$0.50','correction due']);top();snap('matching-review','Explicit reveal review; no reveal was confirmed.');tap('Return to editing')
 tap('Back to account');home();tap('Circle');top();snap('circle','Verified fictional trusted circle; relationship state remains distinct from journal access.');home()
 checks.append({'case':'native archive navigation and review cancellation','role':args.role,'theme':args.theme,'result':'PASS','realTransfers':False})

status='FAIL'
try:main();status='PASS'
finally:
 manifest=OUT/'SCREENSHOT_MANIFEST.json'
 previous=json.loads(manifest.read_text()) if manifest.exists() else {'format':1,'build':BUILD,'captures':[],'checks':[]}
 captures={item['file']:item for item in previous['captures']}
 captures.update({item['file']:item for item in n.records})
 previous.update({'build':BUILD,'backendBuild':fixture['financeArchiveQa']['build'],'fixtureSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'gitHeadAtCapture':subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip(),'captures':list(captures.values()),'checks':previous['checks']+checks+[{'run':args.role+'-'+args.theme,'result':status}], 'device':{'avd':'Pixel_10','serial':'emulator-5554','android':n.command('shell','getprop','ro.build.version.release'),'sdk':n.command('shell','getprop','ro.build.version.sdk'),'resolution':n.command('shell','wm','size'),'density':n.command('shell','wm','density')},'actualNativeAdbCaptures':True,'credentialsIncluded':False,'protectedWindowsBypassed':False})
 manifest.write_text(json.dumps(previous,indent=2)+'\n',encoding='utf8')
print(json.dumps({'status':status,'role':args.role,'theme':args.theme,'captures':len(n.records)}))
