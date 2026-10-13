/* LastSet Stage 2 opt-in monitoring — no workout/profile/history reading.
   Entire feature is inert until a person explicitly opts in. */
(()=>{
  'use strict';
  if(globalThis.LastSetMonitoring)return;
  const CONSENT='lastset-monitor-consent-v1';
  const INSTALL='lastset-monitor-install-v1';
  const SOURCE='https://lastset-training-log.thiva-claimflow.workers.dev';
  const ENDPOINT='https://lastset-telemetry.thiva-claimflow.workers.dev';
  const TYPES=new Set(['app_open','save_success','save_failure','fatal_error','support_reported']);
  const IS_QA=Boolean(navigator.webdriver)||
    /(?:[?&](?:qa|e2e|test_mode)=1(?:&|$))/i.test(location.search)||
    /^(?:localhost|127\.0\.0\.1)$/.test(location.hostname)||
    location.origin!==SOURCE;
  let lastError=0,lastOpen=0,enabled=false,installId='',chip=null,modal=null;
  function read(key){try{return localStorage.getItem(key)||'';}catch{return '';}}
  function write(key,value){try{localStorage.setItem(key,value);return localStorage.getItem(key)===value;}catch{return false;}}
  function remove(key){try{localStorage.removeItem(key);}catch(_){}}
  function version(){
    const tag=document.querySelector('meta[name="lastset-release"]')?.getAttribute('content')||'unknown';
    return /^[a-z0-9._-]{1,40}$/i.test(tag)?tag:'unknown';
  }
  function platform(){
    const ua=navigator.userAgent||'';
    if(/iPhone|iPad|iPod/i.test(ua))return 'ios';
    if(/Android/i.test(ua))return 'android';
    if(/Windows|Macintosh|Linux/i.test(ua))return 'desktop';
    return 'other';
  }
  function anonymousId(){
    const old=read(INSTALL);
    if(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(old))return old;
    if(typeof crypto?.randomUUID!=='function')return '';
    const id=crypto.randomUUID();
    return write(INSTALL,id)?id:'';
  }
  function send(type,category){
    if(!enabled||IS_QA||!TYPES.has(type)||!installId||!navigator.onLine)return;
    if(type==='fatal_error'){
      if(Date.now()-lastError<60000)return;
      lastError=Date.now();
    }
    const body={schema:1,installationId:installId,type,platform:platform(),version:version()};
    if((type==='fatal_error'||type==='support_reported')&&['storage','render','network','unknown'].includes(category))
      body.category=category;
    try {
      // Never await, throw, retry or block LastSet workout saves or rendering.
      fetch(ENDPOINT+'/v1/event',{method:'POST',mode:'cors',credentials:'omit',
        referrerPolicy:'no-referrer',keepalive:true,
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).catch(()=>{});
    }catch(_){}
  }
  function record(type,category){send(type,category);}
  function openEvent(){
    if(!enabled||Date.now()-lastOpen<30*60*1000)return;
    lastOpen=Date.now();
    send('app_open');
  }
  function state(){
    if(chip){
      chip.textContent=enabled?'App monitoring: on':'App monitoring: off';
      chip.setAttribute('aria-label','Manage optional anonymous LastSet application monitoring. Currently '+(enabled?'on':'off'));
    }
  }
  function activate(){
    if(IS_QA)return false;
    const id=anonymousId();
    if(!id||!write(CONSENT,'yes'))return false;
    installId=id;enabled=true;state();openEvent();return true;
  }
  function deactivate(){
    const previous=installId||read(INSTALL);
    // Clear consent and installation ID immediately; deletion is best effort.
    enabled=false;installId='';remove(INSTALL);write(CONSENT,'no');state();
    if(previous&&navigator.onLine&&!IS_QA){
      try{fetch(ENDPOINT+'/v1/installation',{method:'DELETE',mode:'cors',credentials:'omit',
        referrerPolicy:'no-referrer',keepalive:true,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({schema:1,installationId:previous})}).catch(()=>{});}catch(_){}
    }
  }
  function showSettings(){
    if(modal)return;
    const backdrop=document.createElement('div');
    backdrop.className='ls-monitor-backdrop';
    backdrop.innerHTML='<section class="ls-monitor-panel" role="dialog" aria-modal="true" aria-labelledby="ls-monitor-title">'+
      '<h2 id="ls-monitor-title">Optional app monitoring</h2>'+
      '<p>Help improve LastSet by sharing anonymous app-open counts, coarse device category, app version, and P2 workout save success or failure. No workout details, profile fields, photos, voice recordings, messages, or GPS are sent.</p>'+
      '<p>Counting uses a random browser-installation identifier, which may qualify as personal data. Its server-side hash is kept for up to 35 days. Monitoring is off until you allow it; disabling requests deletion of previous monitoring records when online.</p>'+
      '<p>Offline workouts work the same with monitoring on or off. This setting does not change your existing workout history.</p>'+
      '<div class="ls-monitor-actions"><button type="button" data-monitor-disable>Turn off</button>'+
      '<button type="button" data-monitor-enable>Allow monitoring</button>'+
      '<button type="button" data-monitor-close>Close</button></div>'+
      '<p class="ls-monitor-note">Usage counts represent consenting installations, not people.</p></section>';
    const close=()=>{backdrop.remove();modal=null;chip?.focus();};
    backdrop.addEventListener('click',e=>{
      if(e.target===backdrop||e.target.closest('[data-monitor-close]'))close();
      else if(e.target.closest('[data-monitor-disable]')){deactivate();close();}
      else if(e.target.closest('[data-monitor-enable]')){activate();close();}
    });
    backdrop.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    document.body.appendChild(backdrop);modal=backdrop;
    backdrop.querySelector('[data-monitor-close]')?.focus();
  }
  function mount(){
    if(IS_QA||chip||!document.body)return;
    chip=document.createElement('button');
    chip.id='ls-monitor-privacy-control';
    chip.className='ls-monitor-chip';
    chip.type='button';
    chip.addEventListener('click',showSettings);
    document.body.appendChild(chip);state();
  }
  if(!IS_QA&&read(CONSENT)==='yes'){
    installId=anonymousId();enabled=Boolean(installId);
    openEvent();
  }
  addEventListener('error',()=>record('fatal_error','render'),{passive:true});
  addEventListener('unhandledrejection',()=>record('fatal_error','unknown'),{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  globalThis.LastSetMonitoring=Object.freeze({record,isEnabled:()=>enabled,version:'1.0.0'});
})();
