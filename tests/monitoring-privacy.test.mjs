import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../lastset-monitoring.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const p2=readFileSync(new URL('../lastset-p2.js',import.meta.url),'utf8');
function run({qa=false,priorConsent='',online=true}={}){
  const stored=new Map();
  if(priorConsent)stored.set('lastset-monitor-consent-v1',priorConsent);
  const accessed=new Set(),sent=[],mounted=[],networkListeners={};
  const make=()=>({
    listeners:{},setAttribute(){},remove(){},focus(){},
    addEventListener(type,cb){this.listeners[type]=cb;},
    querySelector(){return {focus(){}};},
    textContent:'',className:'',innerHTML:''
  });
  const document={
    readyState:'complete',body:{appendChild(el){mounted.push(el);}},
    createElement:make,querySelector(sel){return sel.includes('lastset-release')?{getAttribute:()=> '0.21.0'}:null;},
    addEventListener(){}
  };
  const localStorage={
    getItem(k){accessed.add(k);return stored.has(k)?stored.get(k):null;},
    setItem(k,v){accessed.add(k);stored.set(k,String(v));},
    removeItem(k){accessed.add(k);stored.delete(k);}
  };
  const context={
    navigator:{webdriver:qa,onLine:online,userAgent:'Mozilla iPhone'},
    location:{origin:'https://lastset-training-log.thiva-claimflow.workers.dev',hostname:'lastset-training-log.thiva-claimflow.workers.dev',search:''},
    document,localStorage,
    crypto:{randomUUID:()=> '3d79a784-0cfc-4dc4-9a8e-bd34729a53db'},
    fetch:(url,opts)=>{sent.push({url:String(url),opts});return Promise.resolve({ok:true});},
    addEventListener:(type,cb)=>{networkListeners[type]=cb;},
    Date
  };
  context.globalThis=context;
  vm.runInNewContext(script,context);
  function clickControl(){const chip=mounted.find(x=>x.id==='ls-monitor-privacy-control'); assert.ok(chip);chip.listeners.click();return mounted.at(-1);}
  function clickAction(dialog,action){
    dialog.listeners.click({target:{closest(selector){return selector==='[data-monitor-'+action+']'?{}:null;}}});
  }
  return {context,stored,accessed,sent,mounted,clickControl,clickAction};
}
test('first visit: no tracking, no generated installation ID, no request',()=>{
  const x=run();
  assert.equal(x.context.LastSetMonitoring.isEnabled(),false);
  assert.equal(x.sent.length,0);
  assert.equal(x.stored.has('lastset-monitor-install-v1'),false);
  x.context.LastSetMonitoring.record('save_success');
  assert.equal(x.sent.length,0);
});
test('affirmative consent creates random installation ID and only enumerated events',()=>{
  const x=run();
  const dialog=x.clickControl();x.clickAction(dialog,'enable');
  assert.equal(x.context.LastSetMonitoring.isEnabled(),true);
  assert.equal(x.stored.get('lastset-monitor-consent-v1'),'yes');
  assert.match(x.stored.get('lastset-monitor-install-v1'),/^[a-f0-9-]{36}$/);
  assert.equal(x.sent[0].opts.method,'POST');
  x.context.LastSetMonitoring.record('save_success',{workout:'secret'});
  assert.equal(x.sent.length,2);
  const payload=JSON.parse(x.sent[1].opts.body);
  assert.deepEqual(Object.keys(payload).sort(),['installationId','platform','schema','type','version'].sort());
  assert.equal(payload.type,'save_success');
  assert.equal(payload.platform,'ios');
  assert.equal(payload.version,'0.21.0');
  assert.equal(x.sent[1].opts.credentials,'omit');
  assert.equal(x.sent[1].opts.referrerPolicy,'no-referrer');
});
test('opt-out immediately stops events and erases local ID, attempts remote delete',()=>{
  const x=run({priorConsent:'yes'});
  assert.equal(x.context.LastSetMonitoring.isEnabled(),true);
  x.clickAction(x.clickControl(),'disable');
  assert.equal(x.context.LastSetMonitoring.isEnabled(),false);
  assert.equal(x.stored.get('lastset-monitor-consent-v1'),'no');
  assert.equal(x.stored.has('lastset-monitor-install-v1'),false);
  assert.ok(x.sent.some(s=>s.opts.method==='DELETE'));
  const prior=x.sent.length;x.context.LastSetMonitoring.record('save_failure');assert.equal(x.sent.length,prior);
});
test('automation/QA sessions never show consent prompt or send telemetry',()=>{
  const x=run({qa:true,priorConsent:'yes'});
  assert.equal(x.context.LastSetMonitoring.isEnabled(),false);
  assert.equal(x.mounted.length,0);
  assert.equal(x.sent.length,0);
});
test('offline saves never trigger requests',()=>{
  const x=run({online:false,priorConsent:'yes'});
  x.context.LastSetMonitoring.record('save_success');
  assert.equal(x.sent.length,0);
});
test('telemetry code does not touch workout localStorage keys or save pipeline',()=>{
  const x=run({priorConsent:'yes'});
  assert.ok([...x.accessed].every(k=>k==='lastset-monitor-consent-v1'||k==='lastset-monitor-install-v1'));
  assert.ok(!script.includes('data.sessions'));
  assert.ok(!script.includes('data.profile'));
  assert.ok(!script.includes('JSON.stringify(data)'));
  assert.ok(!script.includes('sessionStorage'));
});
test('Worker loads monitoring assets and P2 sends only outcome after save succeeds',()=>{
  assert.match(worker,/lastset-monitoring\.js/);
  assert.match(worker,/lastset-monitoring\.css/);
  const needle="saveData(next);workoutPersisted=true;";
  const at=p2.indexOf(needle);
  assert.ok(at>0);
  assert.ok(p2.indexOf("LastSetMonitoring?.record('save_success')",at)>at);
  assert.ok(p2.indexOf("if(!workoutPersisted)",at)>at);
  assert.equal(worker.includes('TELEMETRY_HMAC_KEY'),false);
});
