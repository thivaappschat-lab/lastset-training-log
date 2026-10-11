/* LastSet P2 staged beta: optional live recording alongside original P1, preserving Today hero.
   All sources are suggestions until the lifter confirms performed work. */
(()=>{
'use strict';
if(typeof state==='undefined'||typeof data==='undefined'||typeof saveData!=='function')return;
const V='0.20.0', PREFIX='lastset-p2-active-v1:', clone=x=>JSON.parse(JSON.stringify(x));
const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const catNames={resistance:'Resistance',cardio:'Cardio',mobility:'Mobility & Recovery',smart:'Smart Log'};
const modes={quick:['Log & Finish','Enter completed training and save'],free:['Log As I Go','Log without a timer'],timed:['Log With Timer','Optional rest countdown or stopwatch']};
const cardioNames=['Running','Treadmill','Walking','Cycling','Stationary Bike','Rowing','Swimming','Elliptical','Stair Climb','Stair Machine'];
const mobilityNames=['Yoga','Pilates','Stretching','Mobility Drills','Foam Rolling'];
let category='resistance',mode='quick',draft=null,sourceTab='previous',message='',failure=false,exerciseSearch='',returnFromSmart=false;
function key(){return PREFIX+String(data?.profile?.userId||'unregistered').replace(/[^a-z0-9_-]/ig,'_').slice(0,80);}
function cleanDate(){return /^\d{4}-\d\d-\d\d$/.test(state.selectedDate)?state.selectedDate:isoDate(new Date());}
function loadDraft(){try{const d=JSON.parse(localStorage.getItem(key())||'null');return d&&d.version===1&&d.userId===String(data?.profile?.userId||'unregistered')&&d.status==='active'?d:null;}catch(_){return null;}}
function active(){const id=String(data?.profile?.userId||'unregistered');if(draft&&draft.userId!==id)draft=null;return draft||(draft=loadDraft());}
function persist(){if(!draft)return false;try{const value=JSON.stringify(draft);localStorage.setItem(key(),value);if(localStorage.getItem(key())!==value)throw Error('Draft verification failed');failure=false;return true;}catch(e){failure=true;message='Draft was not saved to device. Keep LastSet open, retry storage, or export a backup before leaving.';return false;}}
function clear(){try{localStorage.removeItem(key());}catch(_){}draft=null;failure=false;}
function begin(source){
  const userId=String(data?.profile?.userId||'unregistered');
  draft={version:1,id:cryptoId(),userId,date:cleanDate(),category,mode,status:'active',
    startAt:Date.now(),pausedAt:null,pausedMs:0,restUntil:0,restSeconds:90,
    source:source?.label||'',copied:!!source,confirmed:!source,exercises:[],entries:[],
    currentExerciseId:'',cardio:{activity:'Running',duration:'',distance:'',incline:'',notes:''},
    mobility:{activity:'Yoga',style:'General Yoga',duration:'',intensity:'Gentle',notes:''},
    smartText:'',smartCandidate:null};
  if(source?.kind==='historical'){
    for(const s of source.sessions||[]){
      if(s.type==='resistance'){
        for(const e of s.exercises||[]){
          const saved=(e.sets||[]).map(row=>({weight:row.weight??0,reps:row.reps??0,durationSeconds:row.durationSeconds||0,setType:row.setType||'working'}));
          draft.exercises.push({id:cryptoId(),exerciseId:e.exerciseId,name:e.name||e.exerciseId,loadType:e.loadType||'external',
            sets:mode==='quick'?saved:[],suggested:saved,note:'',expanded:true});
        }
      }
      if(s.type==='cardio'&&category!=='resistance'){
        draft.cardio={activity:s.activity||'Running',duration:String(s.duration||''),distance:String(s.distance??''),incline:String(s.incline??''),notes:''};
      }
      if(s.type==='mobility'&&category!=='resistance'){
        draft.mobility={activity:s.activity||'Yoga',style:s.style||'',intensity:s.intensity||'Gentle',duration:String(s.duration||''),notes:''};
      }
    }
  }
  if(source?.kind==='template'){
    for(const id of source.template.exerciseIds||[]){
      const ex=EXERCISES.find(e=>e.id===id);if(!ex)continue;
      const previous=typeof findLastExercise==='function'?findLastExercise(id,draft.date):null;
      draft.exercises.push({id:cryptoId(),exerciseId:id,name:ex.name,loadType:ex.loadType||'external',sets:[],suggested:(previous?.sets||[]).map(s=>({...s})),note:'',expanded:true});
    }
  }
  if(source?.kind==='preset'){
    if(category==='cardio')draft.cardio={...draft.cardio,...clone(source.preset.values)};
    if(category==='mobility')draft.mobility={...draft.mobility,...clone(source.preset.values)};
    if(category==='smart')draft.smartText=String(source.preset.values?.text||'');
  }
  if(category==='smart'&&mode==='quick'){
    let words='';
    if(source?.kind==='historical')words='Previous activities (REFERENCE ONLY): '+(source.sessions||[]).flatMap(s=>{
      if(s.type==='resistance')return (s.exercises||[]).map(e=>e.name);
      if(s.type==='cardio'||s.type==='mobility')return [s.activity||s.type];
      return [];
    }).join(', ')+'. Replace this note with what you actually completed today, including sets, reps, load and duration.';
    if(source?.kind==='template')words='Planned exercises: '+(source.template.exerciseIds||[]).map(id=>EXERCISES.find(e=>e.id===id)?.name||id).join(', ')+'. Add what you actually completed.';
    clear();
    state.aiDraft=words;state.aiParsed=null;state.aiError='';state.view='describe';render();return;
  }
  if(category==='smart'&&mode!=='quick'&&source?.kind==='historical'){
    draft.smartText='Reference only — describe what you actually did today. Previous: '+(source.sessions||[]).map(s=>s.type==='resistance'?(s.exercises||[]).map(e=>e.name).join(', '):s.activity).join(', ');
  }
  if(!persist()){render();return;}
  state.view='p2-workout';render();
}
function sourceRecords(){
  return Object.entries(data.sessions||{}).filter(([date])=>date<cleanDate()).sort((a,b)=>b[0].localeCompare(a[0])).flatMap(([date,records])=>{
    const sessions=(records||[]).filter(s=>s.type!=='rest'&&(category==='smart'||s.type===category));
    return sessions.length?[{kind:'historical',date,label:'Previous day · '+date,sessions:clone(sessions)}]:[];
  }).slice(0,35);
}
function savedRecords(){
  const templates=(data.templates||[]).filter(t=>Array.isArray(t.exerciseIds)&&t.exerciseIds.length);
  const presets=(data.p2Presets||[]).filter(p=>p.category===category);
  return [
    ...(category==='resistance'||category==='smart'?templates.map(t=>({kind:'template',label:t.name||'Saved Workout',template:t})):[]),
    ...presets.map(p=>({kind:'preset',label:p.name,preset:p}))
  ];
}
function pageHeading(title,sub){
  return '<main class="container ls-p2"><div class="ls-p2-page-head"><button class="ls-p2-back" data-p2-back type="button" aria-label="Back">‹</button><div><div class="ls-p2-kicker">LASTSET / P2 BETA</div><h2>'+esc(title)+'</h2><p>'+esc(sub||'')+'</p></div></div>';
}
function modeScreen(){
  return pageHeading(catNames[category],'How would you like to log?')+
    '<div class="ls-p2-modes">'+Object.entries(modes).map(([m,[label,description]])=>'<button class="ls-p2-mode" data-p2-mode="'+m+'"><span class="ls-p2-mode-icon">'+({quick:'✓',free:'🏋',timed:'◷'}[m])+'</span><span><strong>'+label+'</strong><small>'+description+'</small></span><b>›</b></button>').join('')+'</div>'+
    '<div class="ls-p2-note">Your existing quick log stays available. Timers are never required.</div></main>';
}
function sourceScreen(){
  const records=sourceTab==='previous'?sourceRecords():savedRecords();
  return pageHeading('Start '+catNames[category],modes[mode][0])+
    '<button class="primary" data-p2-blank>＋ Start fresh</button>'+
    '<div class="ls-p2-note">Copying gives you an editable draft. Previous performance is not automatically counted as completed.</div>'+
    '<div class="ls-p2-tabbar"><button class="'+(sourceTab==='previous'?'selected':'')+'" data-p2-source-tab="previous">Previous days</button><button class="'+(sourceTab==='saved'?'selected':'')+'" data-p2-source-tab="saved">Saved workouts</button></div>'+
    (records.length?records.map((s,i)=>'<button class="ls-p2-source" data-p2-source="'+i+'"><span><strong>'+esc(s.label)+'</strong><small>'+esc(s.kind==='historical'?s.sessions.map(x=>x.type==='resistance'?(x.exercises||[]).length+' exercises':x.activity||x.type).join(' · '):s.kind==='template'?s.template.exerciseIds.length+' planned exercises':'Reusable '+category+' settings')+'</small></span><b>›</b></button>').join(''):'<div class="ls-p2-empty">No '+(sourceTab==='previous'?'previous activity':'saved workouts')+' in this category yet. Start fresh to create one.</div>')+'</main>';
}
function duration(ms){const total=Math.floor(Math.max(0,ms)/1000),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
function elapsed(){if(!draft)return 0;return (draft.pausedAt||Date.now())-draft.startAt-(draft.pausedMs||0);}
function timerHtml(){
  if(!draft||draft.mode!=='timed')return '';
  const left=Math.max(0,draft.restUntil-Date.now());
  return '<section class="ls-p2-timer" aria-label="Optional timer"><div><span>SESSION TIME</span><strong data-p2-elapsed>'+duration(elapsed())+'</strong></div>'+
    ((draft.category==='resistance'||(draft.category==='smart'&&draft.exercises.some(e=>e.sets.length)))?'<div><span>REST COUNTDOWN</span><strong data-p2-rest>'+duration(left)+'</strong></div><label>Rest target <select data-p2-rest-seconds><option value="60" '+(draft.restSeconds===60?'selected':'')+'>60 sec</option><option value="90" '+(draft.restSeconds===90?'selected':'')+'>90 sec</option><option value="120" '+(draft.restSeconds===120?'selected':'')+'>120 sec</option><option value="180" '+(draft.restSeconds===180?'selected':'')+'>180 sec</option></select></label><button class="secondary" data-p2-skip-rest>Skip rest</button>':'<small>Elapsed time is informational. Confirm actual activity duration before finishing.</small>')+
    '<button class="secondary" data-p2-pause>'+(draft.pausedAt?'Resume':'Pause')+' session clock</button></section>';
}
function exRow(item,idx){
  const ex=EXERCISES.find(x=>x.id===item.exerciseId),timed=item.loadType==='timed'||ex?.loadType==='timed';
  const saved=(item.sets||[]);
  const suggested=item.suggested||[];
  return '<section class="ls-p2-exercise"><div class="ls-p2-ex-head"><button data-p2-toggle-ex="'+idx+'"><strong>'+esc(item.name)+'</strong><small>'+saved.length+' '+(draft.mode==='quick'?'entered':'completed')+' sets'+(suggested.length?' · '+suggested.length+' previous for reference':'')+'</small></button><button class="ls-p2-tiny danger" data-p2-remove-ex="'+idx+'" aria-label="Remove exercise">×</button></div>'+
   (item.expanded?'<div class="ls-p2-ex-body">'+(suggested.length?'<p class="ls-p2-reference">Previous (reference only): '+esc(suggested.slice(0,8).map(s=>timed?((s.durationSeconds||0)+' sec'):((s.weight??0)+' kg × '+(s.reps||0))).join(' · '))+'</p>':'')+
    '<div class="ls-p2-sets">'+saved.map((s,j)=>'<div class="ls-p2-set"><span>Set '+(j+1)+'</span><input aria-label="Set '+(j+1)+' '+(timed?'seconds':'weight')+'" data-p2-set="'+idx+':'+j+':'+(timed?'durationSeconds':'weight')+'" type="number" min="0" value="'+esc(timed?s.durationSeconds:s.weight)+'"><input aria-label="Set '+(j+1)+' reps" data-p2-set="'+idx+':'+j+':reps" type="number" min="0" value="'+esc(s.reps||0)+'" '+(timed?'disabled':'')+'><button class="ls-p2-tiny danger" data-p2-remove-set="'+idx+':'+j+'">×</button></div>').join('')+'</div>'+
    '<div class="ls-p2-inline"><label>'+(timed?'Hold (sec)':'Weight (kg)')+'<input data-p2-add-weight="'+idx+'" type="number" min="0" step="any" value="'+esc(suggested[0]?(timed?suggested[0].durationSeconds:suggested[0].weight):'')+'"></label>'+
    (timed?'':'<label>Reps<input data-p2-add-reps="'+idx+'" type="number" min="1" value="'+esc(suggested[0]?.reps||'')+'"></label>')+
    (draft.mode==='quick'?'<label>Sets<input data-p2-add-count="'+idx+'" type="number" min="1" max="20" value="1"></label>':'')+
    '<button class="primary" data-p2-add-set="'+idx+'">'+(draft.mode==='quick'?'Add sets':'✓ Complete set')+'</button></div></div>':'')+'</section>';
}
function resistanceScreen(){
  return '<section class="ls-p2-body"><div class="ls-p2-label">Your exercises</div>'+
  (draft.exercises.length?draft.exercises.map(exRow).join(''):'<div class="ls-p2-empty">No exercises yet. Choose an exercise below.</div>')+
  '<div class="ls-p2-picker"><label>Add an exercise<input type="search" data-p2-search placeholder="Search by name or equipment" value="'+esc(exerciseSearch)+'"></label>'+
  '<div class="ls-p2-results">'+exerciseOptions()+'</div></div></section>';
}
function exerciseOptions(){
  const q=exerciseSearch.toLowerCase().trim();
  return EXERCISES.filter(x=>!q||(x.name+' '+x.equipment).toLowerCase().includes(q)).slice(0,q?12:6).map(x=>'<button data-p2-exercise="'+esc(x.id)+'">'+esc(x.name)+' <small>'+esc(x.equipment||'')+'</small></button>').join('')||'<p>No matching exercises</p>';
}
function field(label,key,value,type='text',min=''){
  return '<label>'+label+'<input data-p2-field="'+key+'" type="'+type+'" value="'+esc(value||'')+'" '+(min?'min="'+min+'"':'')+'></label>';
}
function cardioScreen(){
  const c=draft.cardio;
  return '<section class="ls-p2-body"><label class="ls-p2-label">Cardio activity<select data-p2-field="cardio.activity">'+cardioNames.map(x=>'<option '+(x===c.activity?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>'+
  '<div class="ls-p2-inline">'+field('Duration (minutes)','cardio.duration',c.duration,'number','0')+field('Distance (km)','cardio.distance',c.distance,'number','0')+'</div>'+
  field('Incline (%) · optional','cardio.incline',c.incline,'number','0')+
  '<label>Notes · optional<textarea data-p2-field="cardio.notes">'+esc(c.notes)+'</textarea></label>'+
  (draft.mode==='quick'?'':'<button class="secondary" data-p2-add-activity>＋ Add completed cardio activity</button>')+
  activityList()+'</section>';
}
function mobilityScreen(){
  const c=draft.mobility;
  return '<section class="ls-p2-body"><label class="ls-p2-label">Mobility or recovery activity<select data-p2-field="mobility.activity">'+mobilityNames.map(x=>'<option '+(x===c.activity?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>'+
  '<div class="ls-p2-inline">'+field('Duration (minutes)','mobility.duration',c.duration,'number','1')+
  '<label>Intensity<select data-p2-field="mobility.intensity">'+['Gentle','Moderate','Intense'].map(x=>'<option '+(x===c.intensity?'selected':'')+'>'+x+'</option>').join('')+'</select></label></div>'+
  (c.activity==='Yoga'?'<label>Yoga style<select data-p2-field="mobility.style">'+['General Yoga','Hatha','Vinyasa','Yin','Power','Restorative','Other'].map(x=>'<option '+(x===c.style?'selected':'')+'>'+x+'</option>').join('')+'</select></label>':'')+
  '<label>Notes · optional<textarea data-p2-field="mobility.notes">'+esc(c.notes)+'</textarea></label>'+
  (draft.mode==='quick'?'':'<button class="secondary" data-p2-add-activity>＋ Add completed recovery activity</button>')+
  activityList()+'</section>';
}
function activityList(){
  return draft.entries.length?'<div class="ls-p2-label">Completed activities</div>'+draft.entries.map((e,i)=>'<div class="ls-p2-source"><span><strong>'+esc(e.activity)+'</strong><small>'+esc(e.duration)+' min'+(e.distance?' · '+e.distance+' km':'')+'</small></span><button class="ls-p2-tiny danger" data-p2-remove-entry="'+i+'">×</button></div>').join(''):'';
}
function smartScreen(){
  return '<section class="ls-p2-body"><label class="ls-p2-label">Describe the sets or activities you actually completed<textarea rows="5" data-p2-smart placeholder="Bench Press 60 kg 8 reps 3 sets...">'+esc(draft.smartText)+'</textarea></label>'+
  '<button class="secondary" data-p2-parse>Review description</button>'+
  (draft.smartCandidate?'<div class="ls-p2-review"><strong>Review detected activity</strong>'+draft.smartCandidate.items.map(it=>'<div class="ls-p2-source"><span><strong>'+esc(it.name)+'</strong><small>'+esc(it.kind==='resistance'?(it.sets?.length||0)+' sets':(it.durationMinutes||'?')+' min')+'</small></span></div>').join('')+
  '<p>Confirm all details. Uncertain exercises or missing values must be corrected in the description and reviewed again.</p>'+
  '<button class="primary" data-p2-accept-smart>✓ Add reviewed results to active draft</button></div>':'')+
  activityList()+'</section>';
}
function workoutScreen(){
  const d=active();if(!d)return pageHeading('No active workout','Choose a category to start.')+'</main>';
  const title=d.category==='smart'?'Smart Log':catNames[d.category];
  return pageHeading(title,modes[d.mode][0])+
    (d.source?'<div class="ls-p2-note">Loaded from '+esc(d.source)+' · '+(d.copied?'Verify actual performance before saving.':'')+'</div>':'')+
    '<div class="ls-p2-switch"><button data-p2-change-mode="free" '+(d.mode==='free'?'class="active"':'')+'>No timer</button><button data-p2-change-mode="timed" '+(d.mode==='timed'?'class="active"':'')+'>With timer</button>'+(d.mode==='quick'?'<span>After workout</span>':'')+'</div>'+
    timerHtml()+
    (d.category==='resistance'?resistanceScreen():d.category==='cardio'?cardioScreen():d.category==='mobility'?mobilityScreen():smartScreen())+
    (d.copied&&!d.confirmed?'<label class="ls-p2-check"><input type="checkbox" data-p2-confirm-copy> I checked and corrected the copied details to reflect what I actually completed.</label>':'')+
    (message?'<p class="ls-p2-message" role="status">'+esc(message)+'</p>':'')+
    '<div class="ls-p2-footer">'+(d.category!=='resistance'?'<button class="secondary" data-p2-save-preset>☆ Save as a reusable '+(d.category==='smart'?'Smart Log description':'activity')+'</button>':'')+(failure?'<button class="secondary" data-p2-retry>Retry draft storage</button><button class="secondary" data-p2-export>Export draft backup</button>':'')+
    '<button class="primary" data-p2-finish>'+ (d.mode==='quick'?'Review & Save':'Finish & Review')+'</button>'+
    '<button class="ls-p2-discard" data-p2-discard>Discard active draft</button></div></main>';
}
function finishScreen(){
  const d=active();if(!d)return pageHeading('No workout to finish','')+'</main>';
  const count=d.exercises.reduce((n,e)=>n+e.sets.length,0),entries=d.entries.length;
  return pageHeading('Review before saving','Only actual completed work will be saved to History.')+
   '<section class="ls-p2-review"><strong>'+esc(catNames[d.category])+'</strong><p>'+count+' completed resistance sets · '+entries+' completed activities'+(d.source?' · '+esc(d.source):'')+'</p>'+
   (d.exercises||[]).filter(e=>e.sets.length).map(e=>'<div class="ls-p2-source"><span><strong>'+esc(e.name)+'</strong><small>'+e.sets.length+' confirmed sets</small></span></div>').join('')+
   d.entries.map(e=>'<div class="ls-p2-source"><span><strong>'+esc(e.activity)+'</strong><small>'+esc(e.duration)+' min</small></span></div>').join('')+
   (d.mode==='timed'?'<p>Session clock: '+duration(elapsed())+' (not automatically substituted for activity duration).</p>':'')+'</section>'+
   (message?'<p class="ls-p2-message" role="alert">'+esc(message)+'</p>':'')+
   '<button class="primary" data-p2-commit>✓ Confirm and save to History</button><button class="secondary" data-p2-export>Export draft backup</button><button class="secondary" data-p2-return>Edit workout</button></main>';
}
function p2Screen(){return state.view==='p2-mode'?modeScreen():state.view==='p2-sources'?sourceScreen():state.view==='p2-workout'?workoutScreen():finishScreen();}
function decorateToday(){
  if(state.view!=='day'||!data.profile?.onboardingComplete)return;
  const main=document.querySelector('main.container');if(!main||main.querySelector('[data-p2-today]'))return;
  const list=main.querySelector('.action-list');if(!list)return;
  const section=document.createElement('section');section.className='ls-p2-today';section.dataset.p2Today='1';
  section.innerHTML='<div class="ls-p2-section-title"><strong>Log your training</strong><small>Choose a category · timers optional</small></div>'+
   '<div class="ls-p2-grid">'+Object.entries(catNames).map(([id,label])=>'<button data-p2-entry="'+id+'"><span class="ls-p2-grid-icon">'+({resistance:'🏋️',cardio:'🏃',mobility:'🧘',smart:'🎙️'}[id])+'</span><strong>'+esc(label)+'</strong><small>'+({resistance:'Weights, reps and sets',cardio:'Running, cycling and more',mobility:'Yoga, stretching and recovery',smart:'Type or speak your workout'}[id])+'</small></button>').join('')+'</div>'+
   (active()?'<div class="ls-p2-resume"><strong>Unfinished '+esc(catNames[active().category])+' workout</strong><button data-p2-resume>Resume draft →</button></div>':'')+
   '<div class="ls-p2-classic"><strong>Original quick-log shortcuts</strong><p>Keep using the proven P1 logging paths below, or choose the new P2 cards above.</p></div>';
  const motivation=main.querySelector('.ls-hero');
  // Keep the user's original motivational portrait first, then the P2
  // entry tiles, before any saved-workout or legacy logging shortcuts.
  if(motivation)motivation.insertAdjacentElement('afterend',section);
  else main.insertBefore(section,list);
}
function go(v){message='';state.view=v;render();}
function open(id){
  const old=active();
  if(old){go('p2-workout');return;}
  category=id;mode='quick';sourceTab='previous';exerciseSearch='';go('p2-mode');
}
function chooseMode(id){mode=id;sourceTab='previous';go('p2-sources');}
function update(target){
  const d=active();if(!d)return;
  const fieldName=target.dataset.p2Field;
  if(fieldName){const [kind,k]=fieldName.split('.');if(d[kind]&&k)d[kind][k]=target.value;persist();return;}
  if(target.hasAttribute('data-p2-smart')){d.smartText=target.value;d.smartCandidate=null;persist();return;}
  if(target.dataset.p2Set){const [i,j,k]=target.dataset.p2Set.split(':');if(d.exercises[+i]?.sets[+j])d.exercises[+i].sets[+j][k]=target.value;persist();return;}
  if(target.hasAttribute('data-p2-confirm-copy')){d.confirmed=target.checked;persist();}
}
function requiredNumber(v,positive=false){if(v===''||v==null)return false;const n=Number(v);return Number.isFinite(n)&&n>=0&&(!positive||n>0);}
function entryFromForm(){
  const d=active(),c=d.category==='cardio'?d.cardio:d.mobility;
  if(!requiredNumber(c.duration,true)||Number(c.duration)>720){message='Enter actual duration (1–720 minutes).';return null;}
  if(d.category==='cardio'&&c.distance!==''&&(!requiredNumber(c.distance)||Number(c.distance)>5000)){message='Enter a valid distance.';return null;}
  if(d.category==='cardio'&&c.incline!==''&&(!requiredNumber(c.incline)||Number(c.incline)>100)){message='Check the incline value.';return null;}
  return {type:d.category,activity:c.activity,duration:Number(c.duration),distance:c.distance===''?0:Number(c.distance),incline:c.incline===''?0:Number(c.incline),style:c.style||'',intensity:c.intensity||'Gentle',notes:c.notes||''};
}
function addActivity(){const e=entryFromForm();if(!e){render();return;}const d=active();d.entries.push(e);d.copied=false;d.confirmed=true;d.cardio={activity:'Running',duration:'',distance:'',incline:'',notes:''};d.mobility={activity:'Yoga',style:'General Yoga',duration:'',intensity:'Gentle',notes:''};persist();message='Activity added to your draft.';render();}
function checkResistance(){
  const d=active();
  for(const e of d.exercises)for(const s of e.sets){
    if(e.loadType==='timed'){if(!requiredNumber(s.durationSeconds,true)||Number(s.durationSeconds)>7200){message='Correct the timed hold before saving.';return false;}}
    else if(!requiredNumber(s.reps,true)||!Number.isInteger(Number(s.reps))||Number(s.reps)>500||!requiredNumber(s.weight)||Number(s.weight)>1000){message='Correct every weight and rep before saving.';return false;}
  }
  return true;
}
function review(){
  const d=active();if(!d)return;
  if(failure){message='Device storage is unavailable. Retry or export the draft before finishing.';render();return;}
  if(d.copied&&!d.confirmed){message='Please confirm you reviewed and corrected the copied performance.';render();return;}
  if(!checkResistance()){render();return;}
  if(d.mode==='quick'&&(d.category==='cardio'||d.category==='mobility')){const e=entryFromForm();if(!e){render();return;}d.entries=[e];}
  if(d.category==='smart'&&d.smartCandidate){message='Tap Add reviewed results first, then finish.';render();return;}
  const count=d.exercises.reduce((n,x)=>n+x.sets.length,0);
  if(!count&&!d.entries.length){message='No completed sets or activities were entered. Nothing to save.';render();return;}
  if(!persist()){render();return;}
  go('p2-finish');
}
function savePreset(){
  const d=active();if(!d)return;
  const name=window.prompt('Name this reusable '+catNames[d.category]+' session');if(!name?.trim())return;
  if(name.trim().length>60){message='Choose a shorter name.';render();return;}
  const values=d.category==='smart'?{text:d.smartText}:d.category==='cardio'?d.cardio:d.mobility;
  const copy=clone(data);copy.p2Presets=Array.isArray(copy.p2Presets)?copy.p2Presets:[];
  copy.p2Presets.push({id:cryptoId(),category:d.category,name:name.trim(),values:clone(values),createdAt:Date.now()});
  try{saveData(copy);data=copy;message='Reusable session saved to this profile.';render();}
  catch(_){message='Could not save the reusable session. Your workout draft is unchanged.';render();}
}
function commit(){
  const d=active();if(!d)return;if(!checkResistance()||(d.copied&&!d.confirmed)){message='Review the draft before saving.';render();return;}
  const profileId=d.userId;
  const mark=d.id;
  let stored;
  try{stored=JSON.parse(localStorage.getItem('lastset-data-v1')||'null');}catch(_){}
  const base=stored?.profile?.userId===profileId?stored:data;
  const next=clone(base);next.sessions=next.sessions||{};
  const list=next.sessions[d.date]||[];
  // An interrupted registry sync can leave the workout persisted already.
  // Same operation ID is retried, never appended again.
  const exists=list.some(s=>s.p2CommitId===mark||(s.exercises||[]).some(e=>e.p2CommitId===mark));
  if(!exists){
    const resistance=d.exercises.filter(e=>e.sets.length).map(e=>({
      exerciseId:e.exerciseId,name:e.name,loadType:e.loadType,note:e.note||'',
      p2CommitId:mark,
      sets:e.sets.map(s=>({weight:Number(s.weight)||0,reps:Number(s.reps)||0,durationSeconds:Number(s.durationSeconds)||0,setType:s.setType||'working'}))
    }));
    if(resistance.length){
      let session=list.find(s=>s.type==='resistance');
      if(!session){session={id:cryptoId(),type:'resistance',createdAt:Date.now(),exercises:[]};list.push(session);}
      session.exercises.push(...resistance);
    }
    for(const entry of d.entries){
      list.push({id:cryptoId(),p2CommitId:mark,createdAt:Date.now(),...entry});
    }
    next.sessions[d.date]=list.filter(s=>s.type!=='rest');
  }
  try{
    saveData(next);data=next;clear();message='';state.selectedDate=d.date;state.view='day';render();showToast('Workout saved to History');
  }catch(err){message='Workout was not fully saved. Keep LastSet open. Retry will not duplicate any set.';failure=true;render();}
}
function acceptSmart(){
  const d=active(),p=d?.smartCandidate;if(!p)return;
  for(const it of p.items){
    if(it.kind==='resistance'){
      const ex=EXERCISES.find(e=>e.id===it.exerciseId);if(!ex){message='An exercise is unidentified. Edit the description and review again.';render();return;}
      d.exercises.push({id:cryptoId(),exerciseId:ex.id,name:ex.name,loadType:it.loadType||ex.loadType||'external',expanded:true,suggested:[],
       sets:it.sets.map(s=>({weight:Number(s.weightKg)||0,reps:Number(s.reps)||0,durationSeconds:Number(s.durationSeconds)||0,setType:s.setType||'working'}))});
    }else if(it.kind==='cardio'||it.kind==='mobility'){
      d.entries.push({type:it.kind,activity:it.name,duration:Number(it.durationMinutes)||0,distance:Number(it.distanceKm)||0,incline:Number(it.incline)||0,
      style:it.style||'',intensity:it.intensity||'Gentle',notes:it.notes||''});
    }
  }
  if(d.mode==='timed'&&p.items.some(it=>it.kind==='resistance'))d.restUntil=Date.now()+d.restSeconds*1000;
  d.smartCandidate=null;d.smartText='';d.copied=false;d.confirmed=true;persist();message='Reviewed results added to your draft.';render();
}
function parseSmart(){
  const d=active();if(!d)return;
  const text=d.smartText.trim();
  if(!text||text.length>3000){message='Enter a workout description under 3,000 characters.';render();return;}
  try{
    const p=parseSmartWorkout(text);
    const issues=globalThis.LastSetMobileReview?.issues?.(p)||[];
    const missing=typeof getSmartMissing==='function'?getSmartMissing(p):null;
    if(!p?.items?.length||missing||issues.length||p.items.some(it=>it.kind==='resistance'&&(!it.exerciseId||!(it.sets||[]).length))){
      d.smartCandidate=null;message='Some details need clarification. Edit the original wording with actual sets, reps, load or duration, then review again.';persist();render();return;
    }
    d.smartCandidate=clone(p);message='';persist();render();
  }catch(err){message='Could not interpret the description. Your text is retained.';render();}
}
const oldScreen=screen;
screen=function(){return /^p2-(mode|sources|workout|finish)$/.test(state.view)?p2Screen():oldScreen();};
const oldRender=render;
render=function(){oldRender();decorateToday();document.documentElement.dataset.lastsetP2=V;};
document.addEventListener('click',e=>{
  const el=e.target.closest?.('[data-p2-entry],[data-p2-resume],[data-p2-mode],[data-p2-back],[data-p2-blank],[data-p2-source-tab],[data-p2-source],[data-p2-change-mode],[data-p2-toggle-ex],[data-p2-remove-ex],[data-p2-add-set],[data-p2-remove-set],[data-p2-exercise],[data-p2-add-activity],[data-p2-remove-entry],[data-p2-parse],[data-p2-accept-smart],[data-p2-finish],[data-p2-return],[data-p2-commit],[data-p2-discard],[data-p2-skip-rest],[data-p2-pause],[data-p2-retry],[data-p2-export],[data-p2-save-preset]');
  if(!el)return;e.preventDefault();e.stopImmediatePropagation();
  const d=active(),i=Number(el.dataset.p2ToggleEx||el.dataset.p2RemoveEx||el.dataset.p2AddSet||0);
  if(el.dataset.p2Entry)open(el.dataset.p2Entry);
  else if(el.hasAttribute('data-p2-resume'))go('p2-workout');
  else if(el.dataset.p2Mode)chooseMode(el.dataset.p2Mode);
  else if(el.hasAttribute('data-p2-back'))go(state.view==='p2-mode'?'day':state.view==='p2-sources'?'p2-mode':state.view==='p2-finish'?'p2-workout':'day');
  else if(el.hasAttribute('data-p2-blank'))begin(null);
  else if(el.dataset.p2SourceTab){sourceTab=el.dataset.p2SourceTab;render();}
  else if(el.hasAttribute('data-p2-source')){const x=(sourceTab==='previous'?sourceRecords():savedRecords())[Number(el.dataset.p2Source)];if(x)begin(x);}
  else if(el.dataset.p2ChangeMode&&d){if(d.mode==='quick'&&el.dataset.p2ChangeMode!=='quick')d.mode=el.dataset.p2ChangeMode;else d.mode=el.dataset.p2ChangeMode;d.restUntil=0;d.pausedAt=null;persist();render();}
  else if(el.hasAttribute('data-p2-toggle-ex')&&d){d.exercises[i].expanded=!d.exercises[i].expanded;persist();render();}
  else if(el.hasAttribute('data-p2-remove-ex')&&d){if(!window.confirm('Remove this exercise from your draft?'))return;d.exercises.splice(i,1);persist();render();}
  else if(el.hasAttribute('data-p2-exercise')&&d){const ex=EXERCISES.find(x=>x.id===el.dataset.p2Exercise);if(ex){d.exercises.push({id:cryptoId(),exerciseId:ex.id,name:ex.name,loadType:ex.loadType||'external',sets:[],suggested:[],note:'',expanded:true});exerciseSearch='';persist();render();}}
  else if(el.hasAttribute('data-p2-add-set')&&d){
    const ex=d.exercises[i],w=document.querySelector('[data-p2-add-weight="'+i+'"]')?.value,
      reps=document.querySelector('[data-p2-add-reps="'+i+'"]')?.value,raw=document.querySelector('[data-p2-add-count="'+i+'"]')?.value||'1',count=Number(raw);
    if(!Number.isInteger(count)||count<1||count>20||!requiredNumber(w)||(ex.loadType==='timed'?!requiredNumber(w,true):!requiredNumber(reps,true)||!Number.isInteger(Number(reps)))){message='Enter valid completed sets, weight, repetitions or hold duration.';render();return;}
    for(let n=0;n<count;n++)ex.sets.push({weight:ex.loadType==='timed'?0:Number(w),reps:ex.loadType==='timed'?0:Number(reps),durationSeconds:ex.loadType==='timed'?Number(w):0,setType:'working'});
    if(d.mode==='timed'&&d.category==='resistance')d.restUntil=Date.now()+d.restSeconds*1000;
    persist();message='';render();
  }
  else if(el.hasAttribute('data-p2-remove-set')&&d){const [x,y]=el.dataset.p2RemoveSet.split(':').map(Number);d.exercises[x]?.sets.splice(y,1);persist();render();}
  else if(el.hasAttribute('data-p2-add-activity'))addActivity();
  else if(el.hasAttribute('data-p2-remove-entry')&&d){d.entries.splice(Number(el.dataset.p2RemoveEntry),1);persist();render();}
  else if(el.hasAttribute('data-p2-parse'))parseSmart();
  else if(el.hasAttribute('data-p2-accept-smart'))acceptSmart();
  else if(el.hasAttribute('data-p2-save-preset'))savePreset();
  else if(el.hasAttribute('data-p2-finish'))review();
  else if(el.hasAttribute('data-p2-return'))go('p2-workout');
  else if(el.hasAttribute('data-p2-commit'))commit();
  else if(el.hasAttribute('data-p2-discard')){if(window.confirm('Discard this unfinished workout draft? Saved history is unaffected.')){clear();go('day');}}
  else if(el.hasAttribute('data-p2-skip-rest')&&d){d.restUntil=0;persist();render();}
  else if(el.hasAttribute('data-p2-pause')&&d){if(d.pausedAt){d.pausedMs+=Date.now()-d.pausedAt;d.pausedAt=null;}else{d.pausedAt=Date.now();}persist();render();}
  else if(el.hasAttribute('data-p2-retry')){if(persist()){message='Draft storage recovered.';render();}}
  else if(el.hasAttribute('data-p2-export')){const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='lastset-p2-draft-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
},true);
// The emergency storage banner belongs to the legacy shell. For a failed P2
// commit, its Retry must replay the P2 operation ID, never write stale data.
document.addEventListener('click',event=>{
  if(state.view!=='p2-finish'||!active()||!event.target.closest?.('[data-storage-retry]'))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  commit();
},true);
document.addEventListener('input',e=>{
 if(e.target.matches?.('[data-p2-field],[data-p2-set],[data-p2-smart],[data-p2-confirm-copy]'))update(e.target);
 if(e.target.hasAttribute?.('data-p2-search')){exerciseSearch=e.target.value;const box=document.querySelector('.ls-p2-results');if(box)box.innerHTML=exerciseOptions();}
},true);
document.addEventListener('change',e=>{
 const el=e.target;
 if(el.hasAttribute?.('data-p2-field')||el.hasAttribute?.('data-p2-confirm-copy'))update(el);
 if(el.hasAttribute?.('data-p2-rest-seconds')&&active()){draft.restSeconds=Number(el.value);persist();}
},true);
setInterval(()=>{
 if(state.view!=='p2-workout'||!active()||active().mode!=='timed')return;
 const el=document.querySelector('[data-p2-elapsed]'),rest=document.querySelector('[data-p2-rest]');
 if(el)el.textContent=duration(elapsed());
 if(rest)rest.textContent=duration(Math.max(0,draft.restUntil-Date.now()));
},1000);
window.addEventListener('pagehide',()=>{if(draft)persist();});
render();
globalThis.LastSetP2={version:V,loadDraft,sourceRecords,savedRecords,active};
})();