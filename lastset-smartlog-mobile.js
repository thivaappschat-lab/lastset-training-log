/* LastSet mobile Smart Log: Scan → Fix → Save, theme and local draft protection.
   Presentation only: does not replace P1 parsing, change stored-session schema,
   or weaken the original P1 validation gate. */
(() => {
'use strict';
const VERSION='0.16.5.1-direct-exercise-edit';
if(typeof window==='undefined'||typeof state==='undefined'||typeof render!=='function')return;
const KEY_PREFIX='lastset-smartlog-draft-v2:';
const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const dateOk=s=>/^\d{4}-\d\d-\d\d$/.test(String(s||''));
let expandedIndex=-1, sheetIndex=-1, success=false, saving=false, draftError=false, noticeDismissed=false;
const prefersDark=window.matchMedia?.('(prefers-color-scheme: dark)');
function getUserKey(){return KEY_PREFIX+String(data?.profile?.userId||data?.profile?.userLabel||data?.profile?.name||'default').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100);}
function mode(){return ['system','light','dark'].includes(data?.profile?.themeMode)?data.profile.themeMode:'system';}
function applyTheme(){
  const dark=mode()==='system'?(prefersDark?prefersDark.matches:true):mode()==='dark';
  document.documentElement.dataset.lastsetTheme=dark?'dark':'light';
  document.documentElement.dataset.lastsetThemePreference=mode();
  document.documentElement.style.colorScheme=dark?'dark':'light';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=dark?'#090713':'#f5f6fb';
}
prefersDark?.addEventListener?.('change',applyTheme);
function adjustKeyboard(){
  const vv=window.visualViewport;
  const overlap=vv?Math.max(0,window.innerHeight-vv.height-vv.offsetTop):0;
  const open=overlap>125&&document.activeElement?.matches?.('input,textarea,select');
  document.documentElement.classList.toggle('ls-mobile-keyboard-open',!!open);
  document.documentElement.style.setProperty('--ls-keyboard-offset',(open?overlap:0)+'px');
}
window.visualViewport?.addEventListener('resize',adjustKeyboard);
window.visualViewport?.addEventListener('scroll',adjustKeyboard);
document.addEventListener('focusin',()=>requestAnimationFrame(adjustKeyboard));
document.addEventListener('focusout',()=>requestAnimationFrame(adjustKeyboard));
function draftSnapshot(){
  const text=document.getElementById('ai-text')?.value??state.aiDraft;
  if(typeof text!=='string')return null;
  let parsed=state.aiParsed?JSON.parse(JSON.stringify(state.aiParsed)):null;
  // Capture inputs even if Safari terminates before a change/blur event.
  if(parsed?.items){
    document.querySelectorAll('[data-p1-weight],[data-p1-reps],[data-p1-seconds],[data-p1-type],[data-p1-ack],[data-p1-exercise]').forEach(el=>{
      const key=el.getAttribute('data-p1-weight')!=null?'weightKg':el.getAttribute('data-p1-reps')!=null?'reps':el.getAttribute('data-p1-seconds')!=null?'durationSeconds':el.getAttribute('data-p1-type')!=null?'setType':null;
      if(key){
        const raw=el.getAttribute('data-p1-'+({weightKg:'weight',reps:'reps',durationSeconds:'seconds',setType:'type'}[key]));
        const indices=(raw||'').split(':').map(Number);
        const target=parsed.items[indices[0]]?.sets?.[indices[1]];
        if(target)target[key]=key==='setType'?el.value:(el.value===''?null:Number(el.value));
      }else if(el.hasAttribute('data-p1-ack')){
        const i=Number(el.getAttribute('data-p1-ack'));
        if(parsed.items[i])parsed.items[i].p1Acknowledged=el.checked;
      }
    });
  }
  return {version:2,userKey:getUserKey(),date:dateOk(state.selectedDate)?state.selectedDate:null,text,parsed,correction:state.aiCorrection||'',savedAt:Date.now()};
}
function writeDraft(){
  if(state.view!=='describe')return;
  try{
    const d=draftSnapshot();
    if(!d||(!d.text.trim()&&!d.parsed))return;
    const serialized=JSON.stringify(d);
    localStorage.setItem(getUserKey(),serialized);
    if(localStorage.getItem(getUserKey())!==serialized)throw new Error('Draft storage verification failed');
    draftError=false;
  }catch(err){
    draftError=true;
    console.warn('LastSet draft not stored',err?.message||err);
    if(typeof reportStorageFailure==='function')reportStorageFailure(err);
  }
}
function readDraft(){
  try{
    const d=JSON.parse(localStorage.getItem(getUserKey())||'null');
    if(!d||d.version!==2||d.userKey!==getUserKey()||typeof d.text!=='string'||!dateOk(d.date))return null;
    if(d.parsed && (!Array.isArray(d.parsed.items)||d.parsed.items.length>80))return null;
    return d;
  }catch(_){return null;}
}
function clearDraft(){try{localStorage.removeItem(getUserKey());}catch(_){}noticeDismissed=false;}
function sameDraft(d){
  return !!(d&&d.date===state.selectedDate&&d.text===state.aiDraft&&!!d.parsed===!!state.aiParsed);
}
function issue(item){
  if(item.kind!=='resistance')return '';
  if(item.p1RequiresRewrite)return 'Assisted and bodyweight sets need separate confirmed details';
  if(!item.exerciseId)return 'Choose the correct exercise';
  if(!Array.isArray(item.sets)||!item.sets.length)return 'Add missing sets';
  for(const s of item.sets){
    if(item.loadType==='timed'){
      if(!Number.isFinite(Number(s.durationSeconds))||Number(s.durationSeconds)<=0)return 'Confirm the hold duration';
    }else{
      if(!Number.isInteger(Number(s.reps))||Number(s.reps)<=0)return 'Confirm the completed repetitions';
      if(item.loadType!=='bodyweight'&&(s.weightKg==null||s.weightKg===''||!Number.isFinite(Number(s.weightKg))||Number(s.weightKg)<0))return 'Confirm weight or assistance';
    }
  }
  if(item.p1Warnings?.length&&!item.p1Acknowledged)return 'Check and acknowledge source details';
  return '';
}
function issues(parsed){
  const out=(parsed?.items||[]).map((item,i)=>({i,why:issue(item)})).filter(x=>x.why);
  if(parsed?.p1AuditError)out.unshift({i:0,why:'Exercise detection requires verification'});
  return out;
}
function setSummary(item){
  if(item.kind==='cardio')return [item.durationMinutes?item.durationMinutes+' min':'',item.distanceKm?item.distanceKm+' km':''].filter(Boolean).join(' · ')||'Cardio';
  const type=item.loadType||'external';
  const rows=(item.sets||[]).map(s=>{
    if(type==='timed')return (s.durationSeconds||'?')+' sec';
    if(type==='bodyweight')return (Number(s.weightKg)>0?'BW + '+s.weightKg+' kg':'BW')+' × '+(s.reps??'?');
    if(type==='assisted')return (s.weightKg==null?'?':s.weightKg)+' kg assist × '+(s.reps??'?');
    return (s.weightKg==null?'?':s.weightKg)+' × '+(s.reps??'?');
  });
  return rows.length?rows.slice(0,4).join(' · ')+(rows.length>4?' · +'+(rows.length-4)+' more':''):'No complete sets yet';
}
function rowsHtml(item,i){
  const type=item.loadType||'external';
  const sets=(item.sets||[]).map((s,j)=>{
    const base=i+':'+j;
    const weight=type==='timed'?'':'<label>'+(type==='assisted'?'Assistance, kg':'Weight, kg')+'<input type="number" inputmode="decimal" step="any" min="0" data-p1-weight="'+base+'" value="'+esc(s.weightKg??'')+'"></label>';
    const detail=type==='timed'?'<label>Seconds<input type="number" inputmode="numeric" min="1" data-p1-seconds="'+base+'" value="'+esc(s.durationSeconds??'')+'"></label>':'<label>Reps<input type="number" inputmode="numeric" min="1" step="1" data-p1-reps="'+base+'" value="'+esc(s.reps??'')+'"></label>';
    return '<div class="ls-mobile-set"><span class="ls-mobile-set-number">Set '+(j+1)+'</span><div class="ls-mobile-set-fields">'+weight+detail+'<label>Type<select data-p1-type="'+base+'"><option value="working" '+(s.setType!=='warmup'?'selected':'')+'>Working</option><option value="warmup" '+(s.setType==='warmup'?'selected':'')+'>Warm up</option></select></label></div><button type="button" class="ls-mobile-remove" data-p1-remove="'+base+'" aria-label="Remove set '+(j+1)+'">×</button></div>';
  }).join('');
  return sets+'<button class="secondary ls-mobile-add" type="button" data-p1-add="'+i+'">+ Add missing set</button>';
}
function hintAlias(item){
  const source=String(item.p1Source||'');
  const obvious=/\bmy sister dips?\b/i.exec(source);
  if(obvious)return obvious[0].toLowerCase();
  const lead=/^\s*([a-z][a-z\s-]{2,40}?)\s+\d+(?:\.\d+)?\s*(?:kg|kgs?|kilos?|lb|lbs)\b/i.exec(source);
  return lead?lead[1].trim().toLowerCase():'';
}
function quickHtml(item,i){
  if(item.kind!=='resistance'||item.p1RequiresRewrite||item.loadType==='timed')return '';
  const sets=item.sets||[];
  const uniform=key=>{
    const values=sets.map(s=>s[key]);
    return values.length&&values[0]!=null&&values.every(v=>v===values[0])?String(values[0]):'';
  };
  const type=item.loadType||'external';
  const proposedWeight=uniform('weightKg');
  const alias=item.p1WasUnidentified&&item.exerciseId?hintAlias(item):'';
  const previous=item.memorySuggestion?.sets||[];
  const memory=previous.length?
    '<div class="ls-mobile-previous"><strong>Previous workout · '+esc(item.memorySuggestion.sourceDate)+'</strong>'+
    '<p>'+esc(previous.length+' sets · '+previous.map(s=>s.weightKg+' kg × '+(s.reps??'?')).join(' · '))+'</p>'+
    '<button type="button" class="secondary" data-memory-use="'+i+'">Use previous sets instead</button>'+
    '<small>Only use this when you actually completed those sets today.</small></div>':'';
  const learning=alias?
    '<label class="ls-mobile-remember"><input type="checkbox" data-mobile-remember="'+i+'" '+(item.p1RememberAlias?'checked':'')+
    '> Remember this corrected exercise name for future voice logs (this profile only)</label>'+
    (item.p1RememberAlias?'<label class="ls-mobile-alias-label">Words to remember<input type="text" maxlength="60" data-mobile-alias-phrase="'+i+'" value="'+esc(item.p1LearnPhrase||alias)+'"></label>':''):'';
  return '<section class="ls-mobile-quick"><strong>Quick edit this exercise</strong>'+
    '<p>Enter the sets you actually completed. These fields never copy your history automatically.</p>'+
    '<div class="ls-mobile-quick-grid">'+
    '<label>'+(type==='assisted'?'Assistance (kg)':type==='bodyweight'?'Extra weight (kg)':'Weight (kg)')+
      '<input type="number" inputmode="decimal" step="any" min="0" data-mobile-quick-weight="'+i+'" value="'+esc(type==='bodyweight'?(proposedWeight||'0'):proposedWeight)+'" placeholder="kg"></label>'+
    '<label>Sets<input type="number" inputmode="numeric" min="1" max="20" step="1" data-mobile-quick-sets="'+i+'" value="'+esc(sets.length||'')+'" placeholder="Sets"></label>'+
    '<label>Reps / set<input type="number" inputmode="numeric" min="1" max="500" step="1" data-mobile-quick-reps="'+i+'" value="'+esc(uniform('reps'))+'" placeholder="Reps"></label>'+
    '</div><p class="ls-mobile-quick-error" role="alert" aria-live="polite"></p>'+
    '<button class="primary" type="button" data-mobile-apply="'+i+'">Apply to '+esc(item.name||'exercise')+'</button>'+
    '<small>Applies to every set in this exercise. Edit individual sets below if they differ.</small>'+memory+learning+'</section>';
}
function detailsHtml(item,i){
  const exList=(typeof EXERCISES==='undefined'?[]:EXERCISES).filter(ex=>item.ambiguity==='squat'?/squat/i.test(ex.name):true).slice().sort((a,b)=>a.name.localeCompare(b.name));
  const chooser=!item.exerciseId?'<label class="ls-mobile-choose">Identify exercise<select data-p1-exercise="'+i+'" aria-label="Choose the correct exercise"><option value="">Choose exercise</option>'+exList.map(ex=>'<option value="'+esc(ex.id)+'">'+esc(ex.name)+'</option>').join('')+'</select></label>':'';
  const mixed=item.p1RequiresRewrite?'<div class="ls-mobile-warning"><strong>Two loading modes detected</strong><p>Assisted and bodyweight work cannot be combined as one exercise. Confirm the actual assistance and completed bodyweight reps. LastSet will never guess these numbers.</p><button type="button" class="primary" data-mobile-split="'+i+'">Split into two exercises</button><button type="button" class="secondary" data-p1-edit-input>Change original description instead</button></div>':'';
  const warnings=item.p1Warnings?.length?'<div class="ls-mobile-warning"><strong>Review original wording</strong><p>'+item.p1Warnings.map(esc).join(' · ')+'</p><label class="ls-mobile-ack"><input type="checkbox" data-p1-ack="'+i+'" '+(item.p1Acknowledged?'checked':'')+'> I reviewed these details</label></div>':'';
  return '<div class="ls-mobile-details">'+mixed+chooser+quickHtml(item,i)+rowsHtml(item,i)+warnings+'</div>';
}
function renderMobile(parsed){
  const items=parsed.items||[],trouble=issues(parsed);
  const totalSets=items.filter(x=>x.kind==='resistance').reduce((n,x)=>n+(x.sets?.length||0),0);
  const status=trouble.length?'<span class="ls-mobile-state warning" role="status">'+trouble.length+' issue'+(trouble.length===1?'':'s')+'</span>':'<span class="ls-mobile-state good" role="status">✓ All clear</span>';
  const cards=items.map((item,i)=>{
    const error=issue(item),open=i===expandedIndex;
    const label=error?'Needs review: '+error:setSummary(item);
    return '<section class="ls-mobile-exercise '+(error?'needs-attention':'')+'"><button type="button" class="ls-mobile-exercise-head" data-mobile-open="'+i+'" aria-expanded="'+open+'" aria-label="'+esc(item.name)+' '+esc(label)+'"><span class="ls-mobile-symbol '+(error?'warn':'ok')+'">'+(error?'!':'✓')+'</span><span class="ls-mobile-exercise-name"><strong>'+esc(item.name||'Unidentified exercise')+'</strong><small>'+esc(label)+'</small></span><span aria-hidden="true">'+(open?'⌃':'›')+'</span></button>'+(open?detailsHtml(item,i):'')+'</section>';
  }).join('');
  const allowed=trouble.length===0 && items.length>0;
  return '<div class="ls-mobile-review"><div class="ls-mobile-heading"><h3>Review your workout</h3><p>Scan, fix any issues, then save.</p></div><div class="ls-mobile-status"><strong>'+items.length+' exercises · '+totalSets+' sets</strong>'+status+'</div><div class="ls-mobile-list">'+cards+'</div><button class="secondary ls-mobile-edit-original" type="button" data-p1-edit-input>Change original description</button><div class="ls-mobile-sticky"><div class="ls-mobile-sticky-inner"><button class="primary" type="button" '+(allowed?'data-action="confirm-ai-workout"':'data-mobile-fix-next')+'>'+(allowed?'Save reviewed workout':'Resolve '+trouble.length+' issue'+(trouble.length===1?'':'s')+' to save')+'</button></div></div></div>'+(sheetIndex>=0?sheetHtml(parsed,sheetIndex):'');
}
function sheetHtml(parsed,i){
  const item=parsed.items[i];if(!item)return '';
  return '<div class="ls-mobile-sheet-wrap" data-mobile-sheet-wrap role="presentation"><section class="ls-mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="ls-mobile-sheet-title"><div class="ls-mobile-sheet-head"><div><small>SMART LOG · REVIEW</small><h3 id="ls-mobile-sheet-title">'+esc(item.name||'Identify exercise')+'</h3></div><button type="button" class="ls-mobile-sheet-close" data-mobile-sheet-close aria-label="Close review">×</button></div><p class="ls-mobile-sheet-prompt">'+esc(issue(item)||'Confirm the exercise and sets')+'</p>'+detailsHtml(item,i)+'<button type="button" class="secondary" data-mobile-sheet-close>Done reviewing</button></section></div>';
}
const baseReview=aiParsedHtml;
aiParsedHtml=function(parsed){
  if(!parsed?.items?.some(item=>item?.p1Review))return baseReview(parsed);
  // Mixed resistance/cardio sessions continue through the established review
  // until a dedicated cardio editor is available. Never show a false "All clear".
  if(parsed.items.some(item=>item.kind!=='resistance'))return baseReview(parsed);
  return renderMobile(parsed);
};
function resumeBanner(){
  if(state.view!=='describe'||state.aiParsed||state.aiDraft||noticeDismissed)return;
  const draft=readDraft();
  if(!draft)return;
  const entry=document.querySelector('.ls-smartlog-entry');
  if(!entry||entry.querySelector('.ls-mobile-resume'))return;
  entry.insertAdjacentHTML('afterbegin','<div class="ls-mobile-resume" role="status"><strong>Resume unfinished workout?</strong><p>A Smart Log draft from '+esc(draft.date)+' is stored on this phone.</p><div><button class="primary" type="button" data-mobile-resume>Resume workout</button><button class="secondary" type="button" data-mobile-dismiss>Not now</button></div></div>');
}
function successBanner(){
  if(!success||state.view!=='day')return;
  document.querySelector('.ls-mobile-success')?.remove();
  const overlay=document.createElement('div');
  overlay.className='ls-mobile-success';
  overlay.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="ls-mobile-success-title"><div class="ls-mobile-success-icon">✓</div><h2 id="ls-mobile-success-title">Workout saved!</h2><p>Your reviewed workout was saved to this device.</p><button type="button" class="primary" data-mobile-view>View workout</button><button type="button" class="secondary" data-mobile-today>Back to Today</button></section>';
  document.body.appendChild(overlay);
}
const baseRender=render;
render=function(){
  // The sheet remains open until explicit confirmation. This prevents a
  // checkbox or select from being destroyed before assistive tech and mobile
  // browsers finish processing the interaction.
  baseRender();
  // Legacy LastSet enhancement marks its decorative theme as "amirtha" on
  // every render. Apply actual device appearance *after* that layer.
  applyTheme();
  resumeBanner();
  successBanner();
  document.documentElement.dataset.lastsetSmartlogMobile=VERSION;
};
const baseProfile=profileScreen;
profileScreen=function(){
  const html=baseProfile();
  const option=mode();
  const select='<div class="field ls-mobile-theme-setting"><label for="lastset-theme-mode">Appearance</label><select id="lastset-theme-mode"><option value="system" '+(option==='system'?'selected':'')+'>System (follow phone)</option><option value="light" '+(option==='light'?'selected':'')+'>Light</option><option value="dark" '+(option==='dark'?'selected':'')+'>Dark</option></select><small>System changes automatically when your phone appearance changes.</small></div>';
  return html.includes('data-action="save-profile"')?html.replace('<button class="primary" data-action="save-profile">',select+'<button class="primary" data-action="save-profile">'):html;
};
const baseSaveProfile=saveProfile;
saveProfile=function(){
  const preference=document.getElementById('lastset-theme-mode')?.value;
  if(['system','light','dark'].includes(preference)){data.profile=data.profile||{};data.profile.themeMode=preference;}
  baseSaveProfile();
  applyTheme();
};
const baseSave=saveSmartLogWorkout;
saveSmartLogWorkout=function(){
  if(saving)return;
  if(state.aiParsed?.items?.some(item=>item?.p1Review)&&issues(state.aiParsed).length){
    sheetIndex=issues(state.aiParsed)[0].i;render();return;
  }
  saving=true;
  writeDraft();
  const learning=(state.aiParsed?.items||[]).filter(item=>item.p1RememberAlias&&item.p1WasUnidentified)
    .map(item=>({...item}));
  try{
    baseSave();
    if(state.aiParsed===null&&state.view==='day'){
      saveLearnedAliases(learning);
      clearDraft();expandedIndex=-1;sheetIndex=-1;success=true;render();
    }
  }catch(err){
    console.error('Smart Log save failed; draft retained',err);
    success=false;
    if(typeof reportStorageFailure==='function')reportStorageFailure(err);
  }finally{saving=false;}
};
// Preserve original event wiring, including validation and P1 change handlers.
const previousBind=bindEvents;
bindEvents=function(){previousBind();};
function closeSheet(){sheetIndex=-1;render();}

function applyQuick(i){
  const item=state.aiParsed?.items?.[i];
  if(!item||item.kind!=='resistance'||item.p1RequiresRewrite)return;
  const field=name=>document.querySelector('[data-mobile-quick-'+name+'="'+i+'"]');
  const countInput=field('sets'),repInput=field('reps'),weightInput=field('weight');
  const error=(countInput?.closest('.ls-mobile-quick')||document).querySelector('.ls-mobile-quick-error');
  const fail=(message,el)=>{
    if(error)error.textContent=message;
    el?.focus();
  };
  const count=Number(countInput?.value),reps=Number(repInput?.value),kg=Number(weightInput?.value);
  if(!countInput?.value||!Number.isInteger(count)||count<1||count>20)return fail('Enter the actual number of sets (1–20).',countInput);
  if(!repInput?.value||!Number.isInteger(reps)||reps<1||reps>500)return fail('Enter completed reps per set (1–500).',repInput);
  if(item.loadType!=='bodyweight'&&weightInput?.value==='')return fail('Enter the actual weight or assistance in kg.',weightInput);
  if(!Number.isFinite(kg)||kg<0||kg>2200)return fail('Enter a valid non-negative load.',weightInput);
  // Explicit Apply is the commit point. Do not update workout sets while
  // the user types; a Safari interruption cannot silently save half an edit.
  const previous=item.sets||[];
  item.sets=Array.from({length:count},(_,j)=>({
    ...previous[j],
    weightKg:item.loadType==='bodyweight'?kg:kg,
    reps,
    setType:previous[j]?.setType||'working'
  }));
  if(item.p1Warnings?.length)item.p1Acknowledged=false;
  render();
  // Snapshot after rendering the new rows; old inputs must not overwrite
  // the freshly applied values in the recovered draft.
  writeDraft();
}
function saveLearnedAliases(exercises){
  if(!exercises.length)return;
  if(!data||typeof saveData!=='function')return;
  const aliases=data.memory?.aliases||{};
  let updated=0;
  for(const item of exercises){
    if(!item.p1RememberAlias||!item.p1WasUnidentified||!item.exerciseId)continue;
    const phrase=String(item.p1LearnPhrase||hintAlias(item))
      .toLowerCase().replace(/[“”"'’]/g,'').replace(/[^a-z0-9%+./ -]+/g,' ').replace(/\s+/g,' ').trim();
    if(phrase.length<3||phrase.length>55||phrase.split(' ').length>6||/\d/.test(phrase))continue;
    const ex=EXERCISES.find(x=>x.id===item.exerciseId);
    if(!ex)continue;
    aliases[phrase]={exerciseId:ex.id,name:ex.name,updatedAt:Date.now()};
    updated++;
  }
  if(!updated)return;
  data.memory=data.memory||{};
  data.memory.version=1;
  data.memory.aliases=aliases;
  try{saveData(data);}
  catch(err){console.warn('Workout saved but alias memory could not be persisted',err);showToast('Workout saved; phrase learning could not be stored.');}
}

function doSplit(i){
  const item=state.aiParsed?.items?.[i];if(!item?.p1RequiresRewrite)return;
  const panel=document.querySelector('.ls-mobile-sheet');
  if(!panel)return;
  const source=item.p1Source||'';
  const count=/\bassist(?:ed|ance)?\s+(\d{1,2})\s*[x×]\s*(\d{1,3})\b/i.exec(source);
  const countSets=count?Number(count[1]):1,reps=count?Number(count[2]):0;
  panel.querySelector('.ls-mobile-details').innerHTML='<div class="ls-mobile-split"><p>Confirm each loading mode. Nothing is inferred from “max”.</p><label>Assisted exercise<select data-mobile-assisted-type><option value="">Choose exercise</option><option value="assisted-pull-up">Assisted Pull Up</option></select></label><label>Assisted sets<input data-mobile-assist-count type="number" inputmode="numeric" min="1" max="20" value="'+(countSets||'')+'"></label><label>Reps per assisted set<input data-mobile-assist-reps type="number" inputmode="numeric" min="1" value="'+(reps||'')+'"></label><label>Assistance in kg<input data-mobile-assist-weight type="number" inputmode="decimal" min="0" step="any" placeholder="Actual assistance"></label><label>Bodyweight exercise<select data-mobile-body-type><option value="">Choose exercise</option><option value="pull-up">Pull Up</option></select></label><label>Completed bodyweight reps<input data-mobile-body-reps type="number" inputmode="numeric" min="1" placeholder="Actual reps, not max"></label><p class="ls-mobile-split-error" role="alert"></p><button type="button" class="primary" data-mobile-split-confirm="'+i+'">Confirm both exercises</button></div>';
}
function confirmSplit(i){
  const old=state.aiParsed?.items?.[i],panel=document.querySelector('.ls-mobile-sheet');
  if(!old?.p1RequiresRewrite||!panel)return;
  const val=s=>panel.querySelector(s)?.value||'';
  const count=Number(val('[data-mobile-assist-count]')),r=Number(val('[data-mobile-assist-reps]')),assist=Number(val('[data-mobile-assist-weight]')),body=Number(val('[data-mobile-body-reps]'));
  const aid=val('[data-mobile-assisted-type]'),bid=val('[data-mobile-body-type]');
  if(!aid||!bid||!Number.isInteger(count)||count<1||count>20||!Number.isInteger(r)||r<1||r>500||val('[data-mobile-assist-weight]')===''||!Number.isFinite(assist)||assist<0||!Number.isInteger(body)||body<1||body>500){
    panel.querySelector('.ls-mobile-split-error').textContent='Select both exercises and enter actual valid sets, assistance, and bodyweight reps.';
    return;
  }
  const assisted=EXERCISES.find(ex=>ex.id===aid),bodyweight=EXERCISES.find(ex=>ex.id===bid);
  if(!assisted||!bodyweight)return;
  const common={kind:'resistance',p1Review:true,p1Acknowledged:true,p1RequiresRewrite:false,p1Warnings:[],p1Source:old.p1Source||'',notes:'Original Smart Log: '+(old.p1Source||'')+' · Manually split and confirmed'};
  const a={...common,exerciseId:assisted.id,name:assisted.name,equipment:assisted.equipment,loadType:'assisted',primaryMuscles:assisted.muscles||[],sets:Array.from({length:count},()=>({weightKg:assist,reps:r,setType:'working'}))};
  const b={...common,exerciseId:bodyweight.id,name:bodyweight.name,equipment:bodyweight.equipment,loadType:'bodyweight',primaryMuscles:bodyweight.muscles||[],sets:[{weightKg:0,reps:body,setType:'working'}]};
  state.aiParsed.items.splice(i,1,a,b);
  sheetIndex=-1;expandedIndex=-1;
  writeDraft();render();
}
document.addEventListener('click',event=>{
  const el=event.target.closest?.('[data-mobile-apply],[data-mobile-open],[data-mobile-fix-next],[data-mobile-sheet-close],[data-mobile-sheet-wrap],[data-mobile-split],[data-mobile-split-confirm],[data-mobile-resume],[data-mobile-dismiss],[data-mobile-view],[data-mobile-today]');
  if(!el)return;
  if(el.matches('[data-mobile-sheet-wrap]')&&event.target!==el)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(el.hasAttribute('data-mobile-apply'))applyQuick(Number(el.getAttribute('data-mobile-apply')));
  else if(el.hasAttribute('data-mobile-open')){
    const idx=Number(el.getAttribute('data-mobile-open'));
    if(issue(state.aiParsed?.items?.[idx]||{})){sheetIndex=idx;expandedIndex=-1;}
    else{expandedIndex=expandedIndex===idx?-1:idx;sheetIndex=-1;}
    render();
  }else if(el.hasAttribute('data-mobile-fix-next')){
    sheetIndex=issues(state.aiParsed||{})[0]?.i??-1;expandedIndex=-1;render();
  }else if(el.hasAttribute('data-mobile-sheet-close')||el.hasAttribute('data-mobile-sheet-wrap'))closeSheet();
  else if(el.hasAttribute('data-mobile-split'))doSplit(Number(el.getAttribute('data-mobile-split')));
  else if(el.hasAttribute('data-mobile-split-confirm'))confirmSplit(Number(el.getAttribute('data-mobile-split-confirm')));
  else if(el.hasAttribute('data-mobile-resume')){
    const draft=readDraft();if(!draft)return;
    state.aiDraft=draft.text;state.aiParsed=draft.parsed;state.selectedDate=draft.date;state.aiCorrection=draft.correction||'';
    noticeDismissed=true;sheetIndex=-1;expandedIndex=-1;render();
  }else if(el.hasAttribute('data-mobile-dismiss')){noticeDismissed=true;render();}
  else if(el.hasAttribute('data-mobile-view')||el.hasAttribute('data-mobile-today')){
    success=false;render();
    if(el.hasAttribute('data-mobile-view'))document.querySelector('.session-card,[data-saved-workout]')?.scrollIntoView({block:'start',behavior:'smooth'});
  }
},true);
document.addEventListener('input',event=>{
  if(state.view!=='describe')return;
  if(event.target?.id==='ai-text')state.aiDraft=event.target.value;
  if(event.target?.matches?.('#ai-text,[data-p1-weight],[data-p1-reps],[data-p1-seconds],[data-mobile-assist-count],[data-mobile-assist-reps],[data-mobile-assist-weight],[data-mobile-body-reps]'))writeDraft();
},true);
document.addEventListener('change',event=>{
  const target=event.target;
  if(target?.hasAttribute?.('data-mobile-remember')){
    const item=state.aiParsed?.items?.[Number(target.getAttribute('data-mobile-remember'))];
    if(item){item.p1RememberAlias=target.checked;if(!target.checked)delete item.p1LearnPhrase;writeDraft();render();}
    return;
  }
  if(target?.hasAttribute?.('data-mobile-alias-phrase')){
    const item=state.aiParsed?.items?.[Number(target.getAttribute('data-mobile-alias-phrase'))];
    if(item){item.p1LearnPhrase=target.value;writeDraft();}
    return;
  }
  if(event.target?.id==='lastset-theme-mode'){
    // Preview immediately. Persistent preference is saved with the Profile.
    const val=event.target.value;
    if(['system','light','dark'].includes(val)){data.profile.themeMode=val;applyTheme();}
  }
  if(state.view==='describe')queueMicrotask(writeDraft);
},true);
document.addEventListener('click',event=>{
  // Preserve draft before an existing navigation handler changes screens.
  if(state.view==='describe'&&event.target.closest?.('[data-nav],[data-action="back"],[data-action="today"],[data-p1-edit-input],[data-day-action]'))writeDraft();
},true);
window.addEventListener('pagehide',writeDraft);
window.addEventListener('beforeunload',writeDraft);
applyTheme();render();
globalThis.LastSetMobileReview={version:VERSION,issues,readDraft,applyTheme};
})();