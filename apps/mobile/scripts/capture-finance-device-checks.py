import argparse,hashlib,importlib.util,os,re,json,subprocess,time,urllib.request
from pathlib import Path
from types import SimpleNamespace
parser=argparse.ArgumentParser(description='Actual isolated fictional native finance/device QA; never captures protected journal/conversation contents.')
parser.add_argument('--fixture',required=True)
parser.add_argument('--resume-after-native-checks-failure',action='store_true')
parser.add_argument('--core-only-after-device-checks',action='store_true')
parser.add_argument('--confirm-fictional-local-finance-qa',action='store_true',required=True)
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'spec/qa/production/finance-checkpoints-r3'
s=importlib.util.spec_from_file_location('cap',ROOT/'apps/mobile/scripts/capture-open-letter.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.CAPTURES=OUT
class ProductionCapture(m.NativeCapture):
 def find(self,label,prefix=False,clickable=False):
  for node in self.tree().iter('node'):
   if node.get('package')=='com.oxieg3n.betweenus' and self.matches(node,label,prefix) and self.bounds(node) and (not clickable or node.get('clickable')=='true'):return node
  return None
n=ProductionCapture(SimpleNamespace(adb=Path(os.environ['LOCALAPPDATA'])/'Android/Sdk/platform-tools/adb.exe',serial='emulator-5554',replace=False))
checks=[]
f=Path(args.fixture).absolute()
assert str(ROOT.resolve()).lower()==str(Path('D:/projects/BetweenUs').resolve()).lower()
assert re.fullmatch(r'ui-runs/[a-f0-9]{32}/mobile-fixture.json',f.relative_to(ROOT/'services/backend/.local').as_posix())
assert f.resolve()==f and not f.is_symlink() and f.stat().st_size<=16384
fixture=json.loads(f.read_text(encoding='utf-8-sig'))
assert fixture.get('financeArchiveQa') and fixture['url']=='http://127.0.0.1:54321' and fixture['apiUrl']=='http://127.0.0.1:8787'
assert fixture['child']['email'].endswith('.test')
with urllib.request.urlopen(fixture['apiUrl']+'/health',timeout=5) as response:
 assert json.load(response)['build']=='1116-FinanceCheckpoints-r2'
manifest_before=json.loads((OUT/'SCREENSHOT_MANIFEST.json').read_text())
assert manifest_before['build']=='1116-FinanceCheckpoints-r3'
assert manifest_before['fixtureSha256']==hashlib.sha256(f.read_bytes()).hexdigest()
assert any(x.get('run')=='child-dark' and x['result']=='PASS' for x in manifest_before['checks'])
assert not(args.resume_after_native_checks_failure and args.core_only_after_device_checks)
receipt=OUT/('NATIVE_CHECKS_CORE.json' if args.core_only_after_device_checks else 'NATIVE_CHECKS_RESUME1.json' if args.resume_after_native_checks_failure else 'NATIVE_CHECKS.json')
if args.resume_after_native_checks_failure:
 assert json.loads((OUT/'NATIVE_CHECKS.json').read_text())['overallResult']=='FAIL'
if args.core_only_after_device_checks:
 earlier=json.loads((OUT/'NATIVE_CHECKS_RESUME1.json').read_text())
 expected={'hot200percent text','Android financial nested Back','viewport small','viewport standard','viewport large','viewport tablet'}
 assert expected<={x['case'] for x in earlier['checks'] if x['result']=='PASS'}, 'All prior device cases must already have passed.'
assert not receipt.exists(), 'Preserve existing native check receipt.'

def tap(label,prefix=False):n.tap(label,prefix=prefix)
def require(label,prefix=False):return n.require(label,prefix=prefix)
def snap(name,description,folder='extra'):
 target=OUT/folder/(name+'.png')
 if target.exists():
  expected=next((x for x in manifest_before['captures'] if x['file']==folder+'/'+name+'.png'),None)
  assert expected and hashlib.sha256(target.read_bytes()).hexdigest()==expected['sha256'], 'Existing native capture digest mismatch.'
  return
 n.capture(folder,name,description)
def home():
 # A viewport override may take time to publish new native bounds; never use old coordinates.
 for attempt in range(8):
  if n.find('Home',clickable=True) is not None:break
  if n.find('Back to account',clickable=True) is not None:tap('Back to account')
  else:n.top();time.sleep(.5)
 else:raise RuntimeError('Current native Home bounds did not settle.')
 tap('Home');n.top();require('Hi, '+fixture['child']['name']+'.')
def finance():
 home();tap('Chores & savings');require("Alex's financial plans");require('Refresh from server')
def app_window_security():
 windows=n.command('shell','dumpsys','window','windows')
 blocks=re.split(r'(?m)^\s*Window #\d+ ',windows)
 own=[block for block in blocks if block.splitlines() and 'com.oxieg3n.betweenus' in block.splitlines()[0] and 'MainActivity' in block.splitlines()[0]]
 displays=n.command('shell','dumpsys','window','displays')
 focused=any('mCurrentFocus=' in line and 'com.oxieg3n.betweenus' in line and 'MainActivity' in line for line in displays.splitlines())
 return bool(re.search(r'\bSECURE\b',own[0])) if focused and len(own)==1 else None

def secure_app_window():return app_window_security() is True

def restore(kind,old):
 match=re.search(r'Override (?:size|density):\s*(\S+)',old);n.command('shell','wm',kind,match.group(1) if match else 'reset')
overall='FAIL'
size=n.command('shell','wm','size');density=n.command('shell','wm','density');font=n.command('shell','settings','get','system','font_scale')
try:
 if not args.core_only_after_device_checks:
  if not (OUT/'extra/child-receipt-confirmed.png').exists():
   finance();tap('Financial history');tap('Older settled financial records');tap('Load older settled records');require('Refresh older records')
   hint=fixture['financeArchiveQa'].get('gardenPageIndex')
   assert isinstance(hint,int) and 0<=hint<=6, 'Bounded authorized fixture navigation hint required.'
   for _ in range(hint):tap('Next page of settled records')
   node=n.locate('Open settled record: Fictional garden watering',prefix=True,clickable=True)
   x,y=n.bounds(node);n.command('shell','input','tap',x,y)
   tap('Review historical receipt acknowledgment');require('Did you receive this amount?');tap('Confirm financial action');require('Saved by the server. No money was transferred.');n.top();snap('child-receipt-confirmed','Actual native archived receipt acknowledgment saved by the local server; no transfer.')
  finance()
  tap('My earnings and cash-out');tap('Payout or payment amount (USD)')
  n.command('shell','input','keycombination','113','29');n.command('shell','input','keyevent','67');n.command('shell','input','text','2.00')
  field=n.find('Payout or payment amount (USD)',clickable=True);assert field is not None and field.get('text')=='2.00','Fictional unsent amount was not entered.'
  n.command('shell','input','keyevent','4');n.command('shell','settings','put','system','font_scale','2.0');time.sleep(.5)
  field=n.locate('Payout or payment amount (USD)',clickable=True);assert field.get('text')=='2.00','Hot font change lost the unsent amount.'
  snap('child-payout-font-200','Actual200percent hot text change preserved the unsent2.00USD input; no payout requested.')
  checks.append({'case':'hot200percent text','result':'PASS','unsentAmountPreserved':True,'financialActionSubmitted':False})
  n.command('shell','settings','put','system','font_scale',font if font!='null' else '1.0')
  home();finance();n.command('shell','input','keyevent','4');require('Some things are',True);checks.append({'case':'Android financial nested Back','result':'PASS'})
  for name,w,h,d in [('small',840,1680,420),('standard',1080,2424,420),('large',1260,2730,420),('tablet',1920,2560,320)]:
   n.command('shell','wm','size',str(w)+'x'+str(h));n.command('shell','wm','density',str(d));n.width=w;n.height=h;time.sleep(.4)
   finance();n.top();snap(name+'-financial-overview','Night Harbor financial viewport on the same Pixel_10 override; not separate hardware.','responsive')
   require('Financial history');tap('Financial history');require('Older settled financial records');tap('Older settled financial records');require('Load older settled records');snap(name+'-history-entry','Actual bounded history entry and accessible controls on the same AVD override.','responsive')
   checks.append({'case':'viewport '+name,'result':'PASS','pixels':[w,h],'density':d,'physicalDevice':False})
   tap('Back to account')
 restore('size',size);restore('density',density);n.width,n.height=map(int,re.findall(r'(\d+)x(\d+)',n.command('shell','wm','size'))[-1])
 home();tap('Chats');require('Conversations');require('New conversation')
 if app_window_security() is False:snap('child-conversations','Existing actual managed conversation list after financial-history navigation.')
 else:checks.append({'case':'conversation list capture omitted','result':'PROTECTED_OR_UNVERIFIED_WINDOW','screenshotTaken':False})
 tap('Open conversation with ',True);require('Your conversation');require('Your words')
 secure=bool(secure_app_window());assert secure, 'Own conversation window was not observed SECURE.'
 checks.append({'case':'native existing conversation composer','result':'PASS','screenshotTaken':False,'secureFlagObserved':secure,'messageSent':False})
 n.command('shell','input','keyevent','4');home();tap('Journal');require('My Journal')
 locked=n.find('Unlock your own pages') is not None
 unavailable=n.find('Device journal unavailable') is not None
 assert locked or unavailable, 'Explicit own journal lock/unavailable boundary was not visible.'
 assert n.find('New private entry',clickable=True) is None and n.find('Save my entry',clickable=True) is None, 'Journal writing was exposed without an explicit author unlock.'
 secure=bool(secure_app_window());assert secure, 'Own journal window was not observed SECURE.'
 checks.append({'case':'native author-only journal lock boundary','result':'PASS','screenshotTaken':False,'secureFlagObserved':secure,'journalUnlockedOrChanged':False,'journalState':'locked' if locked else 'unavailable'})
 tap('Back');home()
 overall='PASS'
finally:
 restore('size',size);restore('density',density)
 n.command('shell','settings','delete','system','font_scale') if font=='null' else n.command('shell','settings','put','system','font_scale',font)
 n.width,n.height=map(int,re.findall(r'(\d+)x(\d+)',n.command('shell','wm','size'))[-1])
 manifest=OUT/'SCREENSHOT_MANIFEST.json';data=json.loads(manifest.read_text());data['captures']=list({x['file']:x for x in data['captures']+n.records}.values());data['checks']+=checks;manifest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
 receipt.write_text(json.dumps({'build':'1116-FinanceCheckpoints-r3','overallResult':overall,'checks':checks,'restored':{'size':n.command('shell','wm','size'),'density':n.command('shell','wm','density'),'fontScale':n.command('shell','settings','get','system','font_scale')},'original':{'size':size,'density':density,'fontScale':font}},indent=2),encoding='utf8')
print(json.dumps({'result':overall,'checks':len(checks),'captures':len(n.records)}))
