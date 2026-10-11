(() => {
'use strict';

const VERSION='0.14.0.2';
const clone=v=>JSON.parse(JSON.stringify(v));
const norm=v=>String(v||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9.+/% -]+/g,' ').replace(/\s+/g,' ').trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const fmt=v=>Number.isInteger(Number(v))?String(Number(v)):String(Math.round(Number(v)*10)/10);

function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  const source=String(text||'');
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(quoted){
      if(ch==='"'&&source[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"')quoted=false;
      else cell+=ch;
    }else{
      if(ch==='"')quoted=true;
      else if(ch===','){row.push(cell);cell='';}
      else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
      else cell+=ch;
    }
  }
  if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  return rows.filter(r=>r.some(c=>String(c).trim()!==''));
}
function headerKey(v){return norm(v).replace(/[./]/g,' ').replace(/\s+/g,' ');}
function pickHeader(headers,candidates){
  const hs=headers.map(headerKey);
  for(const c of candidates){
    const i=hs.indexOf(headerKey(c));if(i>=0)return i;
  }
  return -1;
}
function detectCsvFormat(headers){
  const h=headers.map(headerKey);
  if(h.includes('exercise title')||h.includes('weight kg')||h.includes('start time'))return 'Hevy';
  if(h.includes('set order')||h.includes('workout name')||h.includes('exercise name'))return 'Strong';
  return 'Generic CSV';
}
function parseDateValue(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const direct=/^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if(direct)return direct[1]+'-'+direct[2]+'-'+direct[3];
  const slash=/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/.exec(raw);
  if(slash){
    const a=Number(slash[1]),b=Number(slash[2]);
    const month=a>12?b:a,day=a>12?a:b;
    return slash[3]+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  }
  const d=new Date(raw);
  if(!Number.isFinite(d.getTime()))return '';
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function editDistance(a,b){
  a=norm(a);b=norm(b);
  const d=Array(b.length+1).fill(0).map((_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let prev=d[0];d[0]=i;
    for(let j=1;j<=b.length;j++){
      const tmp=d[j];
      d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));
      prev=tmp;
    }
  }
  return d[b.length];
}
function matchExerciseName(name,catalogue){
  const q=norm(name);if(!q)return null;
  let best=null;
  for(const ex of catalogue||[]){
    const names=[ex.name].concat(ex.aliases||[]);
    for(const candidate of names){
      const c=norm(candidate);if(!c)continue;
      let score=0;
      if(q===c)score=1;
      else if(q.length>=4&&(c.includes(q)||q.includes(c)))score=.89;
      else{
        const qt=q.split(' ').filter(Boolean),ct=c.split(' ').filter(Boolean);
        const ok=qt.filter(t=>ct.some(x=>x===t||x.startsWith(t)||t.startsWith(x)||(t.length>=4&&editDistance(t,x)<=1))).length;
        score=qt.length?(.55+.35*(ok/qt.length)):0;
      }
      if(!best||score>best.score)best={exerciseId:ex.id,name:ex.name,score};
    }
  }
  return best&&best.score>=.76?best:null;
}
function csvPreview(text,catalogue){
  const table=parseCsv(text);
  if(table.length<2)return {error:'No workout rows found',format:'Unknown',records:[],unmatched:[],matchedRows:0};
  const headers=table[0].map(v=>String(v||'').trim()),format=detectCsvFormat(headers);
  const idx={
    date:pickHeader(headers,['date','start_time','start time','workout date','workout_date','timestamp']),
    workout:pickHeader(headers,['title','workout name','workout_name','routine','session']),
    exercise:pickHeader(headers,['exercise_title','exercise title','exercise name','exercise_name','exercise']),
    weight:pickHeader(headers,['weight_kg','weight kg','weight','kg']),
    unit:pickHeader(headers,['weight unit','weight_unit','unit']),
    reps:pickHeader(headers,['reps','repetitions','rep']),
    setType:pickHeader(headers,['set_type','set type','type']),
    notes:pickHeader(headers,['exercise_notes','exercise notes','notes','set notes'])
  };
  if(idx.date<0||idx.exercise<0||idx.reps<0)return {error:'CSV needs Date, Exercise and Reps columns',format,records:[],unmatched:[],matchedRows:0,headers};
  const records=[];
  for(let r=1;r<table.length;r++){
    const row=table[r],sourceName=String(row[idx.exercise]||'').trim(),date=parseDateValue(row[idx.date]),reps=num(row[idx.reps]);
    if(!sourceName||!date||reps<=0)continue;
    let weight=idx.weight>=0?num(row[idx.weight]):0;
    const unit=idx.unit>=0?norm(row[idx.unit]):'kg';
    if(unit==='lb'||unit==='lbs'||unit.includes('pound'))weight=Math.round(weight*0.453592*10)/10;
    const auto=matchExerciseName(sourceName,catalogue);
    records.push({
      row:r+1,date,title:idx.workout>=0?String(row[idx.workout]||'Imported Workout').trim()||'Imported Workout':'Imported Workout',
      sourceName,weightKg:weight,reps,
      setType:idx.setType>=0&&norm(row[idx.setType]).includes('warm')?'warmup':'working',
      notes:idx.notes>=0?String(row[idx.notes]||'').trim():'',
      mappedId:auto?.exerciseId||'',mappedName:auto?.name||'',confidence:auto?.score||0
    });
  }
  const names=[...new Set(records.filter(x=>!x.mappedId).map(x=>x.sourceName))];
  return {format,headers,records,unmatched:names,matchedRows:records.filter(x=>x.mappedId).length,error:records.length?'':'No importable strength sets were found'};
}
function buildImportSessions(preview,mappings,catalogue,importId,idFactory){
  const groups=new Map(),makeId=idFactory||(()=>('imp_'+Math.random().toString(36).slice(2)));
  for(const rec of preview?.records||[]){
    const exerciseId=rec.mappedId||(mappings||{})[rec.sourceName]||'';
    if(!exerciseId)continue;
    const ex=(catalogue||[]).find(x=>x.id===exerciseId);
    if(!ex)continue;
    const key=rec.date+'||'+rec.title;
    if(!groups.has(key))groups.set(key,{date:rec.date,session:{id:makeId(),type:'resistance',createdAt:Date.now(),label:rec.title,importId,importSource:preview.format,exercises:[]}});
    const group=groups.get(key),list=group.session.exercises;
    let item=list.find(x=>x.exerciseId===exerciseId);
    if(!item){item={exerciseId,name:ex.name,loadType:ex.loadType||'external',sets:[],note:''};list.push(item);}
    item.sets.push({weight:rec.weightKg,reps:rec.reps,setType:rec.setType||'working'});
    if(rec.notes&&!item.note)item.note=rec.notes;
  }
  return [...groups.values()].filter(x=>x.session.exercises.length);
}
function applyImport(value,preview,mappings,catalogue,meta,idFactory){
  const next=value,importId=meta?.id||('import_'+Date.now());
  const sessions=buildImportSessions(preview,mappings,catalogue,importId,idFactory);
  next.sessions=next.sessions||{};
  const sessionIds=[];
  for(const entry of sessions){
    next.sessions[entry.date]=next.sessions[entry.date]||[];
    next.sessions[entry.date].push(entry.session);sessionIds.push(entry.session.id);
  }
  next.imports=next.imports||[];
  next.imports.push({id:importId,source:preview.format,fileName:meta?.fileName||'workout-history.csv',createdAt:meta?.createdAt||Date.now(),sessionIds,sessionCount:sessions.length,setCount:(preview.records||[]).filter(r=>r.mappedId||(mappings||{})[r.sourceName]).length});
  return {importId,sessionCount:sessions.length,sessionIds};
}
function rollbackImport(value,importId){
  let removed=0;
  Object.keys(value?.sessions||{}).forEach(date=>{
    const before=value.sessions[date]||[],after=before.filter(s=>s.importId!==importId);
    removed+=before.length-after.length;
    if(after.length)value.sessions[date]=after;else delete value.sessions[date];
  });
  value.imports=(value.imports||[]).filter(x=>x.id!==importId);
  return removed;
}
function typeFor(ex,item){return item?.loadType||ex?.loadType||'external';}
function historyForExercise(value,exerciseId,catalogue){
  const ex=(catalogue||[]).find(x=>x.id===exerciseId),out=[];
  Object.keys(value?.sessions||{}).sort().reverse().forEach(date=>{
    for(const session of value.sessions[date]||[]){
      if(session.type!=='resistance')continue;
      const item=(session.exercises||[]).find(x=>x.exerciseId===exerciseId);if(!item)continue;
      const sets=(item.sets||[]).filter(x=>x.setType!=='warmup');
      if(sets.length)out.push({date,item,sets,type:typeFor(ex,item)});
    }
  });
  return out;
}
function bestSet(record){
  if(!record||!record.sets?.length)return null;
  const type=record.type;
  const score=s=>{
    if(type==='timed')return num(s.durationSeconds);
    if(type==='assisted')return 100000-num(s.weight)*100+num(s.reps);
    if(type==='bodyweight')return Math.max(0,num(s.weight))*1000+num(s.reps);
    return num(s.weight)*1000+num(s.reps);
  };
  return record.sets.reduce((a,b)=>!a||score(b)>score(a)?b:a,null);
}
function chartSeries(history,limit){
  const list=(history||[]).slice(0,limit||12).reverse();
  return list.map(record=>{
    const set=bestSet(record)||{},type=record.type;
    let value=0,label='';
    if(type==='timed'){value=num(set.durationSeconds);label=fmt(value)+' sec';}
    else if(type==='assisted'){value=-num(set.weight);label=fmt(num(set.weight))+' kg assist';}
    else if(type==='bodyweight'&&num(set.weight)<=0){value=num(set.reps);label=fmt(value)+' reps';}
    else{value=num(set.weight);label=fmt(value)+' kg';}
    return {date:record.date,value,label,reps:num(set.reps)};
  });
}
function guideForExercise(ex){
  const movement=norm(ex?.movement),equipment=norm(ex?.equipment);
  let setup='Set the equipment so you can move through a comfortable range without reaching or twisting.';
  let action='Move with control through the intended range and keep the working muscles loaded.';
  let avoid='Avoid using momentum or changing position just to finish the rep.';
  if(equipment.includes('machine'))setup='Adjust the seat, pads and start position so the machine joints line up comfortably with yours.';
  if(equipment.includes('dumbbell'))setup='Choose a stable position and start with the dumbbells controlled before the first rep.';
  if(equipment.includes('barbell'))setup='Set your grip and body position before unracking, then brace before each working set.';
  if(movement.includes('horizontal press')){action='Press forward while keeping your upper back supported and control the return.';avoid='Avoid bouncing the load or letting the shoulders roll forward at the end range.';}
  else if(movement.includes('vertical press')){action='Press overhead smoothly while keeping ribs and trunk controlled.';avoid='Avoid excessive lower-back arching to turn the movement into an incline press.';}
  else if(movement.includes('vertical pull')){action='Drive the elbows down toward your sides and control the handles back to the start.';avoid='Avoid excessive backward lean that turns the movement into a row.';}
  else if(movement.includes('horizontal pull')){action='Pull the elbows back while keeping the chest and torso stable, then reach forward under control.';avoid='Avoid jerking the torso backward to move more load.';}
  else if(movement.includes('knee dominant')){action='Lower under control, keep the knees tracking with the feet, then drive through the whole foot.';avoid='Avoid collapsing the knees inward or shortening range only to add load.';}
  else if(movement.includes('hip dominant')||movement.includes('hip extension')){action='Drive the hips through while keeping the trunk braced and the movement controlled.';avoid='Avoid finishing the rep by overextending the lower back.';}
  else if(movement.includes('elbow flexion')){action='Curl by bending the elbow while keeping the upper arm stable.';avoid='Avoid swinging the torso or letting the elbows travel excessively.';}
  else if(movement.includes('elbow extension')){action='Extend the elbows fully under control while keeping the upper arms stable.';avoid='Avoid using shoulder movement to finish the rep.';}
  else if(movement.includes('shoulder abduction')){action='Raise the arms smoothly in the machine or dumbbell path while keeping the shoulders controlled.';avoid='Avoid shrugging hard or using momentum.';}
  else if(movement.includes('hip abduction')){action='Drive the knees or legs outward under control and return without letting the stack crash.';avoid='Avoid rocking the torso to create extra range.';}
  else if(movement.includes('hip adduction')){action='Bring the legs inward smoothly, pause briefly, and control the return.';avoid='Avoid bouncing out of the stretched position.';}
  else if(movement.includes('torso rotation')){action='Rotate through the intended torso range while keeping the hips anchored.';avoid='Avoid forcing range with momentum.';}
  else if(movement.includes('spinal flexion')){action='Curl the torso through the abdominal range while keeping tension on the abs.';avoid='Avoid pulling with the arms or turning it into a hip movement.';}
  else if(movement.includes('spinal extension')){action='Extend to a neutral strong position under control.';avoid='Avoid hyperextending past a comfortable neutral position.';}
  else if(movement.includes('plantar')){action='Press through the ball of the foot, pause at the top, and lower into a controlled stretch.';avoid='Avoid bouncing rapidly through the bottom position.';}
  return {setup,action,avoid,primary:ex?.primaryMuscle||ex?.muscles?.[0]||'',secondary:(ex?.secondaryMuscles||ex?.muscles?.slice(1)||[]).filter(Boolean)};
}
function formatSetLine(set,type){
  if(type==='timed')return fmt(num(set.durationSeconds))+' sec';
  if(type==='assisted')return fmt(num(set.weight))+' kg assist × '+fmt(num(set.reps));
  if(type==='bodyweight'&&num(set.weight)<=0)return 'BW × '+fmt(num(set.reps));
  if(type==='bodyweight')return 'BW + '+fmt(num(set.weight))+' kg × '+fmt(num(set.reps));
  return fmt(num(set.weight))+' kg × '+fmt(num(set.reps));
}

function resolveVoiceTranscript(finalText,liveText){
  const finalValue=String(finalText||'').trim().replace(/\s+/g,' ');
  const liveValue=String(liveText||'').trim().replace(/\s+/g,' ');
  if(liveValue&&(!finalValue||liveValue.length>finalValue.length))return liveValue;
  return finalValue;
}
function normalizeVoiceTranscript(text){
  return String(text||'').trim()
    .replace(/\b(?:literal|littoral)\s+raise\b/gi,'lateral raise')
    .replace(/\b(?:literal|littoral|lateral)\s+(?:race|rays)\b/gi,'lateral raise')
    .replace(/\s+/g,' ');
}

if(typeof globalThis!=='undefined'&&globalThis.__LASTSET_TEST_ONLY__){
  globalThis.LastSetV14Test={parseCsv,detectCsvFormat,parseDateValue,matchExerciseName,csvPreview,buildImportSessions,applyImport,rollbackImport,historyForExercise,bestSet,chartSeries,guideForExercise,formatSetLine,resolveVoiceTranscript,normalizeVoiceTranscript};
  return;
}
if(typeof window==='undefined'||typeof document==='undefined')return;

const cat=()=>typeof EXERCISES!=='undefined'?EXERCISES:[];
const db=()=>typeof data!=='undefined'?data:null;
const esc=v=>typeof escapeHtml==='function'?escapeHtml(v):String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let importDraft=null;
let voiceSession=null;

function dateShort(iso){try{return new Date(iso+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'});}catch(_){return iso;}}
function historyMetric(exerciseId){
  const h=historyForExercise(db(),exerciseId,cat()),ex=cat().find(x=>x.id===exerciseId);
  if(!h.length)return null;
  const best=h.map(r=>({record:r,set:bestSet(r)})).filter(x=>x.set).reduce((a,b)=>{
    if(!a)return b;
    const av=chartSeries([a.record],1)[0]?.value||0,bv=chartSeries([b.record],1)[0]?.value||0;
    return bv>av?b:a;
  },null);
  return {exerciseId,name:h[0].item.name||ex?.name||exerciseId,history:h,sessions:h.length,type:h[0].type,best:best?.set||null,last:h[0]};
}
function sparkline(series,width,height){
  const w=width||120,h=height||38;
  if(!series.length)return '';
  const values=series.map(x=>x.value),min=Math.min(...values),max=Math.max(...values),span=max-min||1;
  const pts=series.map((p,i)=>{
    const x=series.length===1?w/2:4+i*((w-8)/(series.length-1));
    const y=h-5-((p.value-min)/span)*(h-10);
    return x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
  return '<svg class="ls-v14-spark" viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><polyline points="'+pts+'" fill="none" vector-effect="non-scaling-stroke"/><circle cx="'+pts.split(' ').slice(-1)[0].split(',')[0]+'" cy="'+pts.split(' ').slice(-1)[0].split(',')[1]+'" r="2.4"/></svg>';
}
function fullChart(series){
  if(!series.length)return '<div class="ls-v14-empty-chart">More sessions will build your trend chart.</div>';
  const w=320,h=126,pad=18,vals=series.map(x=>x.value),min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;
  const points=series.map((p,i)=>{
    const x=series.length===1?w/2:pad+i*((w-pad*2)/(series.length-1));
    const y=h-pad-((p.value-min)/span)*(h-pad*2);
    return {x,y,p};
  });
  return '<div class="ls-v14-chart-wrap"><svg class="ls-v14-chart" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Recent exercise progress"><path class="grid" d="M18 18H302 M18 63H302 M18 108H302"/><polyline class="line" points="'+points.map(x=>x.x.toFixed(1)+','+x.y.toFixed(1)).join(' ')+'"/>'+points.map(x=>'<circle class="point" cx="'+x.x.toFixed(1)+'" cy="'+x.y.toFixed(1)+'" r="3.3"/>').join('')+'</svg><div class="ls-v14-chart-labels"><span>'+esc(series[0].label)+' · '+dateShort(series[0].date)+'</span><span>'+esc(series[series.length-1].label)+' · '+dateShort(series[series.length-1].date)+'</span></div></div>';
}
function guidanceHtml(ex){
  if(!ex)return '';
  const g=guideForExercise(ex);
  return '<details class="ls-v14-guide"><summary><span>Exercise guide</span><small>Setup · execution · common mistake</small></summary><div class="ls-v14-guide-body"><div class="ls-v14-muscles"><span><b>Primary</b>'+esc(g.primary||'—')+'</span><span><b>Secondary</b>'+esc(g.secondary.length?g.secondary.join(', '):'—')+'</span></div><div><b>Setup</b><p>'+esc(g.setup)+'</p></div><div><b>Do</b><p>'+esc(g.action)+'</p></div><div><b>Avoid</b><p>'+esc(g.avoid)+'</p></div></div></details>';
}
function progressOverview(){
  const ids=new Set();
  Object.values(db()?.sessions||{}).forEach(ss=>(ss||[]).filter(s=>s.type==='resistance').forEach(s=>(s.exercises||[]).forEach(e=>{if(e.exerciseId)ids.add(e.exerciseId);})));
  const metrics=[...ids].map(historyMetric).filter(Boolean).sort((a,b)=>b.last.date.localeCompare(a.last.date));
  return '<main class="container ls-v14-progress"><div class="ls-i-head"><div><div class="ls-i-kicker">Training intelligence</div><h2>Progress</h2><p>Tap an exercise for its history, chart, best work and next-session context.</p></div></div>'+
    (metrics.length?metrics.map(m=>{
      const series=chartSeries(m.history,8),best=m.best?formatSetLine(m.best,m.type):'—',last=m.last.sets.map(s=>formatSetLine(s,m.type)).join(' · ');
      return '<button class="card ls-v14-progress-row" data-progress-exercise="'+esc(m.exerciseId)+'"><div class="ls-v14-progress-copy"><strong>'+esc(m.name)+'</strong><small>'+m.sessions+' session'+(m.sessions===1?'':'s')+' · Last '+dateShort(m.last.date)+'</small><span>'+esc(last)+'</span><em>Best '+esc(best)+'</em></div>'+sparkline(series,116,40)+'<i>›</i></button>';
    }).join(''):'<div class="card pad"><div class="empty">Your exercise history will appear here after you log workouts.</div></div>')+
  '</main>';
}
function progressDetail(){
  const id=state.progressExerciseId,m=historyMetric(id),ex=cat().find(x=>x.id===id);
  if(!m)return '<main class="container"><div class="card pad"><h2>Exercise history unavailable</h2></div></main>';
  const series=chartSeries(m.history,12),last=m.last.sets.map(s=>formatSetLine(s,m.type)).join(' · '),best=m.best?formatSetLine(m.best,m.type):'—';
  return '<main class="container ls-v14-detail"><div class="ls-v14-detail-head"><div class="ls-i-kicker">Exercise progress</div><h2>'+esc(m.name)+'</h2><p>'+esc(ex?.equipment||'Resistance')+' · '+esc((ex?.muscles||[]).join(', '))+'</p></div>'+
    '<div class="ls-v14-detail-grid"><div class="card"><span>Sessions</span><strong>'+m.sessions+'</strong></div><div class="card"><span>Best</span><strong>'+esc(best)+'</strong></div></div>'+
    '<section class="card ls-v14-chart-card"><div class="ls-v14-section-head"><strong>Recent trend</strong><span>Last '+Math.min(12,m.sessions)+' sessions</span></div>'+fullChart(series)+'</section>'+
    '<section class="card ls-v14-last-card"><div class="ls-v14-section-head"><strong>Last session</strong><span>'+dateShort(m.last.date)+'</span></div><p>'+esc(last)+'</p><button class="primary" data-use-last-progress="'+esc(id)+'">Use last sets today</button></section>'+
    guidanceHtml(ex)+
    '<div class="section-title">History</div><section class="card ls-v14-history">'+m.history.slice(0,20).map(r=>'<div class="ls-v14-history-row"><span>'+dateShort(r.date)+'</span><strong>'+esc(r.sets.map(s=>formatSetLine(s,r.type)).join(' · '))+'</strong></div>').join('')+'</section>'+
  '</main>';
}
function recentImportsHtml(){
  const list=(db()?.imports||[]).slice().reverse().slice(0,6);
  if(!list.length)return '';
  return '<div class="section-title">Recent imports</div>'+list.map(x=>'<section class="card ls-v14-import-record"><div><strong>'+esc(x.fileName||x.source||'Import')+'</strong><small>'+esc(x.source||'CSV')+' · '+(x.sessionCount||0)+' sessions</small></div><button class="secondary" data-rollback-import="'+esc(x.id)+'">Undo import</button></section>').join('');
}
function mappingOptions(sourceName,selected){
  const options=['<option value="">Skip this exercise</option>'].concat(cat().slice().sort((a,b)=>a.name.localeCompare(b.name)).map(ex=>'<option value="'+esc(ex.id)+'"'+(selected===ex.id?' selected':'')+'>'+esc(ex.name)+'</option>'));
  return '<label class="ls-v14-map-row"><span>'+esc(sourceName)+'</span><select data-import-map="'+esc(sourceName)+'">'+options.join('')+'</select></label>';
}
function importCenter(){
  const draft=importDraft;
  return '<main class="container ls-v14-import"><div class="ls-v14-detail-head"><div class="ls-i-kicker">Migration</div><h2>Import Training History</h2><p>Hevy, Strong and generic strength CSV files are analysed locally before anything is added.</p></div>'+
    '<section class="card ls-v14-import-drop"><strong>Choose CSV export</strong><p>Nothing is imported until you review the preview. Unmatched exercises are skipped unless you map them.</p><button class="primary" data-import-choose>Choose CSV</button><input hidden data-import-file type="file" accept=".csv,text/csv"></section>'+
    (draft?(draft.error?'<div class="card ls-v14-import-error">'+esc(draft.error)+'</div>':
      '<section class="card ls-v14-import-preview"><div class="ls-v14-section-head"><strong>'+esc(draft.format)+' preview</strong><span>'+draft.records.length+' sets found</span></div><div class="ls-v14-import-stats"><div><b>'+draft.matchedRows+'</b><span>Auto-matched</span></div><div><b>'+draft.unmatched.length+'</b><span>Names to review</span></div></div>'+
      (draft.unmatched.length?'<div class="section-title">Review unmatched exercises</div><div class="ls-v14-mappings">'+draft.unmatched.slice(0,30).map(name=>mappingOptions(name,draft.manualMappings?.[name]||'')).join('')+'</div><p class="muted" style="font-size:9px">Anything left as “Skip this exercise” will not be imported.</p>':'<div class="ls-v14-import-ok">All exercise names matched automatically.</div>')+
      '<button class="primary" data-import-confirm>Import reviewed history</button></section>'):'')+
    recentImportsHtml()+
    '<section class="card ls-v14-import-safety"><strong>Safe by design</strong><p>Imported sessions are tagged with one transaction ID. Undo removes only that import and leaves your existing LastSet workouts untouched.</p></section>'+
  '</main>';
}
function searchGapCard(){
  const rows=(db()?.telemetry?.zeroResultSearches||[]).slice(0,8);
  if(!rows.length)return '';
  return '<section class="card ls-v14-gap-card" data-v14-search-gaps><div class="ls-i-kicker">Exercise library feedback</div><strong>Searches LastSet could not match</strong><p>These stay with your local beta data and show us which names or machines need attention.</p><div class="ls-v14-gap-list">'+rows.map(x=>'<div><span>'+esc(x.query)+'</span><b>'+num(x.count)+'×</b></div>').join('')+'</div><button class="secondary" data-clear-search-gaps>Clear list</button></section>';
}
function importCard(){
  return '<section class="card ls-v14-import-entry" data-v14-import-entry><div class="ls-i-kicker">Bring your history</div><strong>Import Training History</strong><p>Move resistance history from Hevy, Strong or a generic CSV with preview, mapping and one-tap rollback.</p><button class="secondary" data-open-import-center>Open Import Center</button></section>';
}
function decorateProfile(){
  if(state.view!=='profile')return;
  const main=document.querySelector('main.container');if(!main)return;
  if(!main.querySelector('[data-v14-import-entry]')){
    const anchor=main.querySelector('[data-integrity-users]')||main.querySelector('[data-saved-workouts-entry="profile"]')||main.querySelector('.card.pad');
    const wrap=document.createElement('div');wrap.innerHTML=importCard()+searchGapCard();
    const nodes=[...wrap.children];
    nodes.reverse().forEach(node=>anchor?anchor.insertAdjacentElement('afterend',node):main.appendChild(node));
  }
}
function decorateDescribe(){
  if(state.view!=='describe')return;
  const btn=document.querySelector('[data-action="voice-demo"]');
  if(btn){btn.textContent=(window.SpeechRecognition||window.webkitSpeechRecognition)?'🎙 Speak workout':'Voice unavailable';btn.disabled=!(window.SpeechRecognition||window.webkitSpeechRecognition);}
}
function decorateDay(){
  if(state.view!=='day')return;
  const btn=document.querySelector('[data-action="repeat-last-workout"]');
  if(btn){btn.textContent='Repeat previous workout';const card=btn.closest('.quick-workout');if(card&&!card.querySelector('.ls-v14-repeat-note')){const note=document.createElement('div');note.className='ls-v14-repeat-note';note.textContent='Uses the previous workout structure. Completed sets stay in history.';btn.before(note);}}
}
function useLastSets(id){
  const h=historyForExercise(db(),id,cat());if(!h.length){showToast('No previous sets found');return;}
  const today=isoDate(new Date());state.selectedDate=today;state.month=new Date();state.month=new Date(state.month.getFullYear(),state.month.getMonth(),1);state.tab='today';
  const current=typeof getResistanceSession==='function'?getResistanceSession(today):null;
  const existing=current?.exercises?.findIndex(e=>e.exerciseId===id)??-1;
  if(current&&existing>=0&&typeof openSavedExercise==='function'){openSavedExercise(current.id,existing);return;}
  state.editingExercise=null;state.selectedExercise=id;state.resistanceDraft={sets:h[0].sets.map(s=>Object.assign({},s,{setType:s.setType||'working'})),note:''};state.view='exercise-log';render();
}
function startVoice(){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){showToast('Voice input is not supported in this browser');return;}
  if(voiceSession){
    try{voiceSession.abort();}catch(_){}
    voiceSession=null;
  }

  // Each take has a 60 second safety ceiling. Early browser stops are NOT
  // permission to submit an incomplete workout. Users choose Done or Continue.
  const MAX_LISTEN_MS=60000;
  const originalDraft=String(state.aiDraft||'');
  const overlay=document.createElement('div');
  overlay.className='ls-v14-voice';
  overlay.innerHTML='<div class="ls-v14-voice-card"><div class="ls-v14-mic">●</div><div class="ls-i-kicker">Voice Smart Log</div><h3 data-voice-heading>Listening…</h3><p data-voice-text aria-live="polite">Say your exercises, weights and reps naturally.</p><p class="ls-v14-voice-hint" data-voice-hint>Speak at your normal pace. Tap Done when finished. A recording can last up to 60 seconds.</p><div class="ls-v14-mic-help" data-voice-permission-help role="status" hidden><strong>How to allow the microphone</strong><p data-voice-settings-guide></p><small>iOS may remember a denial. LastSet cannot override the phone’s privacy setting, but you can retry after changing it. Your draft is safe.</small></div><div class="ls-v14-voice-actions"><button class="primary" data-voice-done type="button">Done</button><button class="secondary" data-voice-retry type="button" hidden>Try microphone again</button><button class="secondary" data-voice-continue type="button" hidden>Continue speaking</button><button class="secondary" data-voice-type type="button" hidden>Type workout instead</button><button class="secondary" data-voice-cancel type="button">Cancel</button></div></div>';
  document.body.appendChild(overlay);
  const heading=overlay.querySelector('[data-voice-heading]');
  const hint=overlay.querySelector('[data-voice-hint]');
  const transcriptNode=overlay.querySelector('[data-voice-text]');
  const continueButton=overlay.querySelector('[data-voice-continue]');
  const doneButton=overlay.querySelector('[data-voice-done]');
  const retryButton=overlay.querySelector('[data-voice-retry]');
  const typeButton=overlay.querySelector('[data-voice-type]');
  const permissionHelp=overlay.querySelector('[data-voice-permission-help]');
  const settingsGuide=overlay.querySelector('[data-voice-settings-guide]');
  let recognition=null,finalText='',liveText='',pieces=[];
  let settled=false,cancelled=false,paused=false,finishing=false,permissionDenied=false;
  let watchdog=null,stopFallback=null;
  const clearTimers=()=>{
    if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
    if(stopFallback!==null){clearTimeout(stopFallback);stopFallback=null;}
  };
  const takeText=()=>resolveVoiceTranscript(finalText,liveText);
  const capturedText=()=>[...pieces,takeText()].map(s=>String(s||'').trim()).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  const combinedText=()=>{
    const spoken=capturedText();
    return [originalDraft.trim(),spoken].filter(Boolean).join(originalDraft.trim()&&spoken?'. ':'').trim();
  };
  const refreshTranscript=()=>{
    const spoken=capturedText();
    transcriptNode.textContent=spoken||'Listening…';
    // Keep partial input recoverable if Safari suspends or reloads the page.
    if(spoken)state.aiDraft=combinedText();
  };
  const cleanup=()=>{
    clearTimers();
    if(voiceSession===recognition)voiceSession=null;
    overlay.remove();
  };
  const commitVoice=()=>{
    if(settled||cancelled)return;
    settled=true;
    const text=combinedText();
    cleanup();
    if(!capturedText()){
      state.aiDraft=originalDraft;
      showToast('No voice was captured. Your previous text is still here.');
      return;
    }
    state.aiDraft=text;
    state.aiError='';
    state.aiLoading=false;
    try{
      state.aiParsed=parseSmartWorkout(normalizeVoiceTranscript(text));
      state.aiSource='voice';
    }catch(err){
      console.warn('Voice Smart Log parsing failed safely',err);
      state.aiParsed=null;
      state.aiError='The words were captured. Please review or edit the description and try again.';
    }
    render();
  };
  const showPaused=(reason)=>{
    if(cancelled||settled||finishing)return;
    clearTimers();
    paused=true;
    if(voiceSession===recognition)voiceSession=null;
    heading.textContent='Listening paused';
    hint.textContent=reason||'Your browser paused the microphone. Tap Continue speaking or Done to review your words.';
    continueButton.hidden=false;
    doneButton.disabled=false;
    refreshTranscript();
  };
  const showPermissionBlocked=(kind)=>{
    if(settled||cancelled||finishing)return;
    clearTimers();
    paused=true;
    permissionDenied=true;
    if(voiceSession===recognition)voiceSession=null;
    const isPwa=!!(navigator.standalone||window.matchMedia?.('(display-mode: standalone)')?.matches);
    heading.textContent='Microphone access blocked';
    hint.textContent='You can try again now. If iPhone remembers “Don’t Allow”, change its permission and try once more.';
    settingsGuide.textContent=isPwa
      ? 'Installed LastSet: check iPhone Settings → Privacy & Security → Microphone → LastSet (if listed). Otherwise open the same website in Safari → page menu → Website Settings → Microphone → Ask or Allow, then return and retry.'
      : 'In Safari: tap the page menu beside the address bar → Website Settings → Microphone → Ask or Allow. Then come back and tap Try microphone again.';
    permissionHelp.hidden=false;
    retryButton.hidden=false;
    typeButton.hidden=false;
    continueButton.hidden=true;
    doneButton.hidden=!capturedText();
    doneButton.disabled=!capturedText();
    transcriptNode.textContent=capturedText()||'No speech captured yet. Your workout draft is still available.';
  };
  const beginTake=()=>{
    clearTimers();
    paused=false;
    finishing=false;
    permissionDenied=false;
    permissionHelp.hidden=true;
    retryButton.hidden=true;
    typeButton.hidden=true;
    doneButton.hidden=false;
    doneButton.disabled=false;
    finalText='';
    liveText='';
    continueButton.hidden=true;
    heading.textContent='Listening…';
    hint.textContent='Speak naturally. Tap Done to finish, or continue if your browser pauses.';
    const r=new Recognition();
    recognition=r;
    voiceSession=r;
    r.lang=navigator.language||'en-US';
    r.interimResults=true;
    r.continuous=true;
    r.maxAlternatives=1;
    r.onresult=e=>{
      if(settled||cancelled||recognition!==r)return;
      const all=[],finalParts=[];
      for(let i=0;i<e.results.length;i++){
        const transcript=String(e.results[i]?.[0]?.transcript||'').trim();
        if(!transcript)continue;
        all.push(transcript);
        if(e.results[i].isFinal)finalParts.push(transcript);
      }
      if(all.length)liveText=all.join(' ').replace(/\s+/g,' ').trim();
      if(finalParts.length)finalText=finalParts.join(' ').replace(/\s+/g,' ').trim();
      refreshTranscript();
    };
    r.onerror=e=>{
      if(settled||cancelled||recognition!==r)return;
      const error=String(e?.error||'');
      if(finishing){commitVoice();return;}
      if(error==='not-allowed'||error==='service-not-allowed'){
        showPermissionBlocked(error);
      }else if(error==='audio-capture'){
        showPaused('The microphone became unavailable. Your captured words are preserved.');
      }else{
        showPaused('Speech recognition paused. Continue speaking or tap Done to review.');
      }
    };
    r.onend=()=>{
      if(settled||cancelled||recognition!==r)return;
      if(finishing){commitVoice();return;}
      // A denied permission often fires onerror followed by onend.
      // Do not erase the recovery instructions or close the retry screen.
      if(permissionDenied)return;
      showPaused('Your browser stopped listening. No words were submitted. Continue speaking or tap Done.');
    };
    try{
      r.start();
      watchdog=setTimeout(()=>{
        if(settled||cancelled||recognition!==r||paused||finishing)return;
        heading.textContent='60 second take complete';
        try{r.stop();}catch(_){}
        // WebKit can occasionally omit onend, so never leave the UI trapped.
        stopFallback=setTimeout(()=>showPaused('60 seconds reached. Tap Continue for another take or Done to review.'),1200);
      },MAX_LISTEN_MS);
    }catch(err){
      console.warn('Voice recording could not restart',err);
      if(/notallowed|permission|denied|security/i.test(String(err?.name||'')+' '+String(err?.message||'')))showPermissionBlocked('not-allowed');
      else showPaused('Microphone could not start. Your existing words remain available.');
    }
  };
  doneButton.onclick=()=>{
    if(settled||cancelled||finishing)return;
    if(paused){commitVoice();return;}
    finishing=true;
    doneButton.disabled=true;
    heading.textContent='Finishing…';
    clearTimers();
    try{recognition?.stop();}catch(_){commitVoice();return;}
    stopFallback=setTimeout(commitVoice,1200);
  };
  continueButton.onclick=()=>{
    if(settled||cancelled||!paused)return;
    const previous=takeText();
    if(previous)pieces.push(previous);
    beginTake();
  };
  retryButton.onclick=()=>{
    if(settled||cancelled||!paused||!permissionDenied)return;
    const previous=takeText();
    if(previous)pieces.push(previous);
    // Starting a fresh SpeechRecognition from this explicit tap lets the
    // browser prompt again when its site permission is set to Ask.
    // Persistent Deny can only be changed by the user in iPhone settings.
    beginTake();
  };
  typeButton.onclick=()=>{
    if(settled||cancelled)return;
    settled=true;
    state.aiDraft=combinedText();
    try{recognition?.abort();}catch(_){}
    cleanup();render();
    const input=document.getElementById('ai-text');
    input?.focus?.();
  };
  overlay.querySelector('[data-voice-cancel]').onclick=()=>{
    if(settled)return;
    cancelled=true;settled=true;
    state.aiDraft=originalDraft;
    try{recognition?.abort();}catch(_){}
    cleanup();
  };
  beginTake();
}
if(typeof progressScreen==='function')progressScreen=progressOverview;
if(typeof exerciseLogScreen==='function'){
  const baseExerciseLog=exerciseLogScreen;
  exerciseLogScreen=function(){
    let html=baseExerciseLog();const ex=cat().find(x=>x.id===state.selectedExercise);
    html=html.replace('Copy all previous sets','Use last sets');
    const guide=guidanceHtml(ex);
    const marker='<div class="section-title"';
    const at=html.indexOf(marker);
    if(guide&&at>=0)html=html.slice(0,at)+guide+html.slice(at);
    return html;
  };
}
if(typeof voiceInput==='function')voiceInput=startVoice;

const baseScreen=typeof screen==='function'?screen:null;
if(baseScreen){
  screen=function(){
    if(state.view==='progress-detail')return progressDetail();
    if(state.view==='import-center')return importCenter();
    return baseScreen();
  };
}
const baseRender=typeof render==='function'?render:null;
if(baseRender){
  render=function(){baseRender();decorateProfile();decorateDescribe();decorateDay();document.documentElement.dataset.lastsetV14=VERSION;};
}

document.addEventListener('click',event=>{
  const progress=event.target.closest?.('[data-progress-exercise]');
  if(progress){event.preventDefault();state.progressExerciseId=progress.dataset.progressExercise;state.tab='progress';state.view='progress-detail';render();return;}
  const back=event.target.closest?.('[data-action="back"]');
  if(back&&state.view==='progress-detail'){event.preventDefault();event.stopImmediatePropagation();state.tab='progress';state.view='progress';render();return;}
  if(back&&state.view==='import-center'){event.preventDefault();event.stopImmediatePropagation();state.tab='profile';state.view='profile';render();return;}
  const use=event.target.closest?.('[data-use-last-progress]');
  if(use){event.preventDefault();useLastSets(use.dataset.useLastProgress);return;}
  const openImport=event.target.closest?.('[data-open-import-center]');
  if(openImport){event.preventDefault();state.tab='profile';state.view='import-center';render();return;}
  const choose=event.target.closest?.('[data-import-choose]');
  if(choose){event.preventDefault();document.querySelector('[data-import-file]')?.click();return;}
  const confirmImport=event.target.closest?.('[data-import-confirm]');
  if(confirmImport&&importDraft&&!importDraft.error){
    event.preventDefault();
    const mapped=importDraft.records.filter(r=>r.mappedId||importDraft.manualMappings?.[r.sourceName]).length;
    if(!mapped){showToast('Map at least one exercise before importing');return;}
    if(!confirm('Import '+mapped+' reviewed sets into this user?'))return;
    const meta={id:'import_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),fileName:importDraft.fileName,createdAt:Date.now()};
    const result=applyImport(data,importDraft,importDraft.manualMappings||{},cat(),meta,()=>cryptoId());
    saveData(data);importDraft=null;render();showToast('Imported '+result.sessionCount+' workout sessions');return;
  }
  const rollback=event.target.closest?.('[data-rollback-import]');
  if(rollback){event.preventDefault();if(!confirm('Undo this import? Existing LastSet workouts will stay untouched.'))return;const removed=rollbackImport(data,rollback.dataset.rollbackImport);saveData(data);render();showToast('Removed '+removed+' imported sessions');return;}
  const clear=event.target.closest?.('[data-clear-search-gaps]');
  if(clear){event.preventDefault();data.telemetry=data.telemetry||{};data.telemetry.zeroResultSearches=[];saveData(data);render();showToast('Unmatched search list cleared');return;}
},true);

document.addEventListener('change',event=>{
  const fileInput=event.target.closest?.('[data-import-file]');
  if(fileInput){
    const file=fileInput.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{importDraft=csvPreview(String(reader.result||''),cat());importDraft.fileName=file.name;importDraft.manualMappings={};render();};
    reader.onerror=()=>showToast('Could not read CSV');
    reader.readAsText(file);
    return;
  }
  const mapping=event.target.closest?.('[data-import-map]');
  if(mapping&&importDraft){importDraft.manualMappings=importDraft.manualMappings||{};importDraft.manualMappings[mapping.dataset.importMap]=mapping.value;const rows=importDraft.records.filter(r=>r.mappedId||importDraft.manualMappings[r.sourceName]).length;importDraft.matchedRows=rows;}
},true);

if(typeof render==='function')render();

globalThis.LastSetV14={version:VERSION,startVoice,progressDetail,importCenter};
})();