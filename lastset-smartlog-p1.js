(() => {
'use strict';
const VERSION='0.15.0-p1';
const safe=v=>String(v??'');
const number=v=>Number.isFinite(Number(v))?Number(v):null;
const toKg=(w,unit,defaultUnit='kg')=>{
  const n=Number(w);
  if(!Number.isFinite(n)||n<0||n>2200)return null;
  return /^(?:lb|lbs|pound|pounds)$/i.test(unit||defaultUnit)?Math.round(n*0.453592*10)/10:n;
};
const unique=arr=>[...new Set(arr)];
function reviewWarnings(text){
  const t=safe(text).toLowerCase(),warn=[];
  if(/\b(?:amrap|to failure|until failure|to max|bodyweight max)\b/.test(t))warn.push('Enter completed reps for AMRAP or failure sets; these are not known in advance.');
  if(/\bdrop(?:set|\s+set)?\s+(?:last|final)\s+set\b/.test(t))warn.push('Last-set dropset is missing its drop weight and reps. Add the drop as a set.');
  if(/(?:@\s*\d+(?:\.\d+)?|\brpe\s*\d+|\brir\s*\d+)/i.test(t))warn.push('RPE/RIR was mentioned; the original wording is kept in notes, not structured effort history.');
  if(/\b(?:light|heavy)\b/i.test(t)&&!/\b(?:kg|lb|kilos|pounds?)\b/i.test(t))warn.push('The load was described qualitatively. Enter the actual weight.');
  if(/\b(?:another|more)\s+(?:\d+|two|three|four|five)\s+sets?\b/i.test(t))warn.push('Additional sets mentioned without complete loads/reps. Add each set below.');
  if(/\bsuperset\b|\bthree rounds?\b/.test(t))warn.push('Superset/round grouping is not structured yet. Review the individual sets.');
  return unique(warn);
}
function parseProgressivePhrase(text,loadType='external',defaultUnit='kg'){
  const type=safe(loadType).toLowerCase();
  if(type==='timed')return null;
  if(type==='assisted'){
    const warnings=reviewWarnings(text);
    if(/\bbodyweight\b/i.test(safe(text)))warnings.push('Assistance and bodyweight are different loading modes. Review or split these sets.');
    return warnings.length?{sets:[],warnings:unique(warnings),recognized:false}:null;
  }
  const raw=safe(text);
  if(!raw.trim())return null;
  const WORD_NUMBERS={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twelve:12,fifteen:15};
  const t=raw.toLowerCase()
    .replace(/\ba couple of sixes\b/g,'6 and 6')
    .replace(/\bput\s+(\d+(?:\.\d+)?)\s+on\s+and\s+got\s+/g,'$1 for ')
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen)\b/g,w=>WORD_NUMBERS[w])
    .replace(/\ba\s+(\d+)\b/g,'$1')
    .replace(/\s+/g,' ');
  const warnings=reviewWarnings(raw);
  const weightUnit='(?:kg|kgs?|kilos?|lb|lbs|pounds?)';
  const counted=new RegExp('(?:^|\\s)\\+?(\\d+(?:\\.\\d+)?)\\s*('+weightUnit+'|s)?\\s+(\\d{1,2})\\s*(?:[x×]|sets?\\s*(?:of)?)\\s*(\\d{1,3})(?!\\d)','i');
  // 30s / 20s mean per dumbbell, not seconds, only with a 3x10-like scheme.
  const countMatch=counted.exec(t);
  if(countMatch&&Number(countMatch[3])>=1&&Number(countMatch[3])<=20&&Number(countMatch[4])>=1&&Number(countMatch[4])<=500){
    const w=toKg(countMatch[1],countMatch[2]==='s'?undefined:countMatch[2],defaultUnit);
    if(w!==null)return {sets:Array.from({length:Number(countMatch[3])},()=>({weightKg:w,reps:Number(countMatch[4]),setType:'working'})),warnings,recognized:true};
  }
  // Explicit bodyweight set sequence followed by extra weight.
  const weightedBodyweight=/\bbodyweight\s+((?:\d{1,3}\s*,?\s*)+)\s*then\s*\+(\d+(?:\.\d+)?)\s*(?:kg|lb)?\s*for\s*(\d{1,3})\b/i.exec(t);
  if(type==='bodyweight'&&weightedBodyweight){
    const reps=weightedBodyweight[1].match(/\d{1,3}/g)?.map(Number)||[];
    const w=toKg(weightedBodyweight[2],undefined,defaultUnit);
    if(w!==null&&reps.length&&reps.every(r=>r>0&&r<=500))
      return {sets:[...reps.map(r=>({weightKg:0,reps:r,setType:'working'})),{weightKg:w,reps:Number(weightedBodyweight[3]),setType:'working'}],warnings,recognized:true};
  }
  const anchor=new RegExp('(\\+?\\d+(?:\\.\\d+)?)\\s*('+weightUnit+')?\\s*(?:[x×]\\s*|\\bfor\\s+)(\\d{1,3})\\b','gi');
  const matches=[...t.matchAll(anchor)].filter(m=>Number(m[3])>=1&&Number(m[3])<=500);
  if(matches.length){
    const sets=[];
    for(let i=0;i<matches.length;i++){
      const m=matches[i],idx=m.index;
      const w=toKg(m[1],m[2],defaultUnit);
      if(w===null)return null;
      const prefix=t.slice(0,idx),working=prefix.lastIndexOf('working'),warm=Math.max(prefix.lastIndexOf('warm up'),prefix.lastIndexOf('warmup'));
      const setType=warm>working?'warmup':'working';
      sets.push({weightKg:w,reps:Number(m[3]),setType});
      // Repetitions following "and" or commas reuse this load. The next
      // explicit weight anchor terminates this region, avoiding carry-over.
      let tail=t.slice(idx+m[0].length,i+1<matches.length?matches[i+1].index:t.length);
      tail=tail.replace(/^\s*(?:reps?|repetitions?)\b/i,'');
      const extras=/^\s*(?:,|and|&)\s*(\d{1,3})\b/i;
      for(let j=0;j<20;j++){
        const e=extras.exec(tail);
        if(!e||Number(e[1])<1||Number(e[1])>500)break;
        sets.push({weightKg:w,reps:Number(e[1]),setType});
        tail=tail.slice(e[0].length);
      }
    }
    const amrap=/\b(?:then|and)\s+(\d+(?:\.\d+)?)\s*(?:kg|lb)?\s*(?:amrap|to failure)\b/i.exec(t);
    if(amrap){
      const w=toKg(amrap[1],undefined,defaultUnit);
      if(w!==null)sets.push({weightKg:w,reps:null,setType:'working'});
    }
    if(sets.length>1||warnings.length)return {sets,warnings,recognized:true};
    return null; // Preserve the existing single-set parser.
  }
  // Weight followed by a descending rep sequence: "45 12,10,8".
  const descending=/\b(\d{1,4}(?:\.\d+)?)\s+(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d{1,3}))?\b/.exec(t);
  if(descending){
    const weightKg=toKg(descending[1],undefined,defaultUnit);
    const reps=descending.slice(2).filter(v=>v!=null).map(Number);
    if(weightKg!==null&&reps.every(r=>r>=1&&r<=500))
      return {sets:reps.map(r=>({weightKg,reps:r,setType:'working'})),warnings,recognized:true};
  }

  return warnings.length?{sets:[],warnings,recognized:false}:null;
}
// Independent source inventory: recognised and ambiguous exercises must all
// appear in the review, even when older parser layers omit them.
function findUnaccountedExerciseSegments(source,mentions,defaultUnit='kg'){
  const text=safe(source),ordered=(mentions||[]).slice().sort((a,b)=>a.start-b.start);
  const unaccounted=[];
  const intersects=(start,end)=>ordered.some(m=>m.start<end&&m.end>start);
  const endsAt=pos=>{
    const next=ordered.find(m=>m.start>pos)?.start??text.length;
    const punctuation=text.slice(pos,next).search(/[.;\n](?=\s*[A-Za-z])/);
    return punctuation>=0?Math.min(next,pos+punctuation):next;
  };
  for(const hit of text.matchAll(/\bsquats?\b/gi)){
    const start=hit.index,end=start+hit[0].length;
    if(intersects(start,end))continue; // Explicit goblet/front/etc. already recognised.
    const before=text.slice(Math.max(0,start-24),start);
    if(/\b(?:barbell|back|front|bodyweight|body\s*weight|air|hack|goblet|smith)\s*$/i.test(before))continue;
    const segment=text.slice(start,endsAt(end)).trim();
    const parsed=parseProgressivePhrase(segment,'external',defaultUnit);
    unaccounted.push({
      start,source:segment,ambiguity:'squat',
      sets:parsed?.sets||[],
      warnings:['Squat type was not specified. Choose the exercise before saving.']
    });
  }
  // Detect an entire unrecognised sentence with lifting numbers. Do not
  // hallucinate an exercise name. Force an explicit user correction instead.
  const clauses=[...text.matchAll(/(?:^|[.;\n])\s*([^.;\n]+)/g)];
  for(const match of clauses){
    const content=match[1],start=match.index+match[0].indexOf(content),end=start+content.length;
    if(intersects(start,end)||unaccounted.some(x=>x.start>=start&&x.start<end))continue;
    if(!/\b(?:\d+(?:\.\d+)?\s*(?:kg|lb|x|×|for\b)|\d+\s+sets?\b)/i.test(content))continue;
    const firstNumber=content.search(/\d/),lead=firstNumber>=0?content.slice(0,firstNumber).trim():'';
    if(!/[a-z]{3}/i.test(lead)||/^(?:(?:then|and|for|reps|sets?|drop|to|at|with)\s*)+$/i.test(lead))continue;
    const parsed=parseProgressivePhrase(content,'external',defaultUnit);
    unaccounted.push({
      start,source:content.trim(),ambiguity:'unidentified',
      sets:parsed?.sets||[],
      warnings:['An exercise in this part of your description was not identified. Correct the description before saving.']
    });
  }
  return unaccounted.sort((a,b)=>a.start-b.start);
}

function validateReview(parsed){
  if(parsed?.p1AuditError)return {ok:false,why:'Exercise detection could not be verified. Edit the description and try again.'};
  if(!Array.isArray(parsed?.items)||!parsed.items.length)return {ok:false,why:'No activities detected'};
  for(const item of parsed.items){
    if(item.kind!=='resistance')continue;
    if(!item.exerciseId)return {ok:false,why:'Choose the correct exercise'};
    if(!Array.isArray(item.sets)||!item.sets.length)return {ok:false,why:'Enter at least one set for '+item.name};
    for(const s of item.sets){
      if(item.loadType==='timed'){
        if(!Number.isFinite(Number(s.durationSeconds))||Number(s.durationSeconds)<=0)return {ok:false,why:'Enter the hold duration for each set'};
      }else{
        if(!Number.isInteger(Number(s.reps))||Number(s.reps)<=0)return {ok:false,why:'Enter the completed reps for each set'};
        if(item.loadType!=='bodyweight'&&(s.weightKg==null||s.weightKg===''||!Number.isFinite(Number(s.weightKg))||Number(s.weightKg)<0))
          return {ok:false,why:'Enter the correct weight for each set'};
      }
    }
    if(item.p1Warnings?.length&&!item.p1Acknowledged)return {ok:false,why:'Review and acknowledge the flagged source details'};
  }
  return {ok:true,why:''};
}
if(typeof globalThis!=='undefined'&&globalThis.__LASTSET_TEST_ONLY__){
  globalThis.LastSetSmartLogP1Test={parseProgressivePhrase,reviewWarnings,validateReview,findUnaccountedExerciseSegments};
  return;
}
if(typeof window==='undefined'||typeof parseSmartWorkout!=='function')return;
const previousParser=parseSmartWorkout,previousReview=aiParsedHtml;
parseSmartWorkout=function(text){
  const result=previousParser(text);
  if(!result||!Array.isArray(result.items))return result;
  const source=safe(text),unit=typeof data!=='undefined'?(data?.profile?.weightUnit||'kg'):'kg';
  try{
    const mentions=typeof findExerciseMentions==='function'?(findExerciseMentions(source)||[]).slice().sort((a,b)=>a.start-b.start):[];
    const used=new Set();
    for(let i=0;i<mentions.length;i++){
      const m=mentions[i];
      // Keep a leading warm-up instruction with the first named exercise.
      // Starting at "bench" alone would incorrectly mark warm-up sets as working.
      const lead=i===0?source.slice(0,m.start):'';
      const start=i===0&&/^\s*warm(?:\s|-)?up\s*$/i.test(lead)?0:m.start;
      const segment=source.slice(start,i+1<mentions.length?mentions[i+1].start:source.length);
      const index=result.items.findIndex((item,k)=>!used.has(k)&&item.kind==='resistance'&&item.exerciseId===m.exercise?.id);
      const parsed=parseProgressivePhrase(segment,m.exercise?.loadType||'external',unit);
      if(index<0){
        // Recognised exercise missing from the previous parsing layer.
        // Restore it to the review instead of silently dropping it.
        const item={
          kind:'resistance',exerciseId:m.exercise?.id||null,name:m.exercise?.name||'Unidentified exercise',
          equipment:m.exercise?.equipment||'',loadType:m.exercise?.loadType||'external',
          primaryMuscles:m.exercise?.muscles||[],sets:parsed?.sets||[],
          p1Review:true,p1Source:segment.trim(),p1SourceStart:m.start,
          p1Warnings:['This exercise was absent from the initial parse. Verify every set.'],
          p1Acknowledged:false,notes:'Original Smart Log: '+segment.trim()
        };
        result.items.push(item);
        continue;
      }
      used.add(index);
      const item=result.items[index];
      item.p1SourceStart=m.start;
      if(!parsed)continue;
      if(parsed.sets.length)item.sets=parsed.sets;
      item.p1Review=true;
      item.p1Source=segment.trim();
      item.p1Warnings=parsed.warnings;
      item.p1Acknowledged=false;
      item.notes=[item.notes,'Original Smart Log: '+item.p1Source].filter(Boolean).join(' · ');
    }
    for(const missing of findUnaccountedExerciseSegments(source,mentions,unit)){
      result.items.push({
        kind:'resistance',exerciseId:null,
        name:missing.ambiguity==='squat'?'Squat — choose variation':'Unidentified exercise',
        equipment:'',primaryMuscles:[],loadType:'external',
        sets:missing.sets,p1Review:true,p1Source:missing.source,p1SourceStart:missing.start,
        p1Warnings:missing.warnings,p1Acknowledged:false,
        ambiguity:missing.ambiguity,notes:'Original Smart Log: '+missing.source
      });
    }
    // Put the unresolved source segment back where it appeared in the text.
    // Never move cardio records into resistance or drop original items.
    result.items.sort((a,b)=>(a.p1SourceStart??Number.MAX_SAFE_INTEGER)-(b.p1SourceStart??Number.MAX_SAFE_INTEGER));
    result.p1DetectedExerciseCount=result.items.filter(item=>item.kind==='resistance').length;
    if(result.items.some(item=>item.kind==='resistance'&&!item.exerciseId)){
      result.confidence=Math.min(Number(result.confidence)||0.5,0.54);
      result.needsConfirmation=true;
      result.clarification='An exercise requires identification before this workout can be saved.';
    }
  }catch(err){
    console.warn('Smart Log P1 exercise inventory failed safely',err);
    result.p1AuditError=true;
    result.items.push({kind:'resistance',exerciseId:null,name:'Exercise verification needed',sets:[],p1Review:true,p1Warnings:['Cannot verify exercise coverage. Edit the original description before saving.'],p1Acknowledged:false,p1Source:source});
  }
  return result;
};
const escape=s=>typeof escapeHtml==='function'?escapeHtml(s):safe(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const fmt=v=>Number.isInteger(Number(v))?String(Number(v)):String(Math.round(Number(v)*10)/10);
aiParsedHtml=function(parsed){
  if(!parsed?.items?.some(item=>item.kind==='resistance'&&item.p1Review))return previousReview(parsed);
  const result=validateReview(parsed);
  const cards=parsed.items.map((item,ii)=>{
    if(item.kind!=='resistance')return aiActivityHtml(item,ii);
    const marked=item.p1Warnings||[],type=item.loadType||'external';
    const choices=!item.exerciseId?(typeof EXERCISES!=='undefined'?EXERCISES.filter(ex=>item.ambiguity==='squat'?/squat/i.test(ex.name):true).slice().sort((a,b)=>a.name.localeCompare(b.name)):[]):[];
    const chooser=!item.exerciseId?'<label style="display:block;margin:10px 0;font-size:12px;font-weight:700">Exercise identification required<select data-p1-exercise="'+ii+'" style="display:block;width:100%;margin-top:6px;padding:10px" aria-label="Choose exercise for '+escape(item.p1Source||item.name)+'"><option value="">Choose the correct exercise</option>'+choices.map(ex=>'<option value="'+escape(ex.id)+'">'+escape(ex.name)+'</option>').join('')+'</select></label>':'';
    const heading='<div class="ai-activity-head"><div><strong>'+escape(item.name)+'</strong><small>'+escape(item.p1Source||'Review all recorded sets')+'</small></div></div>'+chooser;
    const rows=(item.sets||[]).map((s,j)=>{
      const w=s.weightKg==null?'':s.weightKg,r=s.reps==null?'':s.reps;
      const fields=type==='timed'?'<label>Seconds<input data-p1-seconds="'+ii+':'+j+'" inputmode="numeric" type="number" min="1" value="'+escape(s.durationSeconds??'')+'"></label>'
        :'<label>'+ (type==='assisted'?'Assist kg':'Weight kg')+'<input data-p1-weight="'+ii+':'+j+'" inputmode="decimal" type="number" step="any" min="0" value="'+escape(w)+'"></label><label>Reps<input data-p1-reps="'+ii+':'+j+'" inputmode="numeric" type="number" min="1" step="1" value="'+escape(r)+'"></label>';
      return '<div class="ls-p1-set"><span>Set '+(j+1)+'</span>'+fields+'<label>Type<select data-p1-type="'+ii+':'+j+'"><option value="working" '+(s.setType!=='warmup'?'selected':'')+'>Working</option><option value="warmup" '+(s.setType==='warmup'?'selected':'')+'>Warm-up</option></select></label><button type="button" data-p1-remove="'+ii+':'+j+'" aria-label="Remove set '+(j+1)+'">×</button></div>';
    }).join('');
    const warn=marked.length?'<div class="ai-clarify"><strong>Review before saving</strong><div>'+marked.map(w=>escape(w)).join(' · ')+'</div><label class="ls-p1-ack"><input type="checkbox" data-p1-ack="'+ii+'" '+(item.p1Acknowledged?'checked':'')+'> I reviewed these details; keep the original wording in notes</label></div>':'';
    return '<section class="ai-activity ls-p1-card" data-p1-card="'+ii+'">'+heading+rows+'<button class="secondary ls-p1-add" type="button" data-p1-add="'+ii+'">＋ Add missing set</button>'+warn+'</section>';
  }).join('');
  const exerciseCount=parsed.items.filter(item=>item.kind==='resistance').length;
  const unrecognised=parsed.items.filter(item=>item.kind==='resistance'&&!item.exerciseId).length;
  const status='<div class="ai-clarify" role="status"><strong>'+exerciseCount+' resistance exercise'+(exerciseCount===1?'':'s')+' detected</strong> · '+(unrecognised?unrecognised+' need exercise identification before saving':'All detected exercises are identified')+'</div>';
  return '<div class="ai-result ls-p1-review"><h3>Review every set before saving</h3><p class="muted">Nothing is saved until you confirm. Correct any number or add omitted sets.</p>'+status+cards+
    (!result.ok?'<div class="ai-clarify" role="alert">'+escape(result.why)+'</div>':'')+
    '<button class="primary" data-action="confirm-ai-workout" '+(!result.ok?'disabled':'')+'>Save reviewed workout</button>'+
    '<button class="secondary" type="button" data-p1-edit-input>Change original description</button></div>';
};
function rerender(){if(typeof render==='function')render();}
function parsedLocation(raw){
  const parts=safe(raw).split(':').map(Number);
  if(parts.length!==2||parts.some(v=>!Number.isInteger(v)||v<0))return null;
  const [i,j]=parts;const item=state?.aiParsed?.items?.[i];
  return item&&Array.isArray(item.sets)&&item.sets[j]?{i,j,item,set:item.sets[j]}:null;
}
document.addEventListener('change',e=>{
  const t=e.target;
  if(t?.hasAttribute?.('data-p1-exercise')){
    const idx=Number(t.getAttribute('data-p1-exercise'));
    const item=state?.aiParsed?.items?.[idx];
    const exercise=typeof EXERCISES!=='undefined'?EXERCISES.find(ex=>ex.id===t.value):null;
    if(item&&item.kind==='resistance'&&exercise){
      item.exerciseId=exercise.id;item.name=exercise.name;
      item.equipment=exercise.equipment;
      item.primaryMuscles=exercise.muscles||[];
      item.loadType=exercise.loadType||'external';
      if(item.loadType==='bodyweight')item.sets=(item.sets||[]).map(set=>({...set,weightKg:0}));
      item.p1Acknowledged=false;
      delete item.ambiguity;
      rerender();
    }
    return;
  }
  for(const [attr,key] of [['data-p1-weight','weightKg'],['data-p1-reps','reps'],['data-p1-seconds','durationSeconds'],['data-p1-type','setType']]){
    if(!t?.hasAttribute?.(attr))continue;
    const entry=parsedLocation(t.getAttribute(attr));if(!entry)return;
    if(key==='setType')entry.set.setType=t.value;
    else entry.set[key]=t.value.trim()===''?null:number(t.value);
    rerender();return;
  }
  if(t?.hasAttribute?.('data-p1-ack')){
    const i=Number(t.getAttribute('data-p1-ack'));
    if(state?.aiParsed?.items?.[i])state.aiParsed.items[i].p1Acknowledged=t.checked;
    rerender();
  }
},true);
document.addEventListener('click',e=>{
  const t=e.target.closest?.('[data-p1-add],[data-p1-remove],[data-p1-edit-input],[data-action="confirm-ai-workout"]');
  if(!t)return;
  if(t.matches('[data-action="confirm-ai-workout"]')&&state?.aiParsed?.items?.some(it=>it.p1Review)){
    const v=validateReview(state.aiParsed);
    if(!v.ok){e.preventDefault();e.stopImmediatePropagation();showToast(v.why);return;}
  }
  if(t.hasAttribute('data-p1-edit-input')){
    e.preventDefault();e.stopImmediatePropagation();
    state.aiParsed=null;state.aiError='';rerender();return;
  }
  if(t.hasAttribute('data-p1-add')){
    e.preventDefault();e.stopImmediatePropagation();
    const i=Number(t.getAttribute('data-p1-add'));
    const item=state?.aiParsed?.items?.[i];
    if(item?.sets&&item.sets.length<30){
      item.sets.push({weightKg:null,reps:null,setType:'working'});item.p1Acknowledged=false;rerender();
    }return;
  }
  if(t.hasAttribute('data-p1-remove')){
    e.preventDefault();e.stopImmediatePropagation();
    const entry=parsedLocation(t.getAttribute('data-p1-remove'));
    if(entry){entry.item.sets.splice(entry.j,1);entry.item.p1Acknowledged=false;rerender();}
  }
},true);
const css=document.createElement('style');
css.id='lastset-smartlog-p1-style';
css.textContent='.ls-p1-review .ai-activity{margin:12px 0}.ls-p1-review .ls-p1-set{display:grid;grid-template-columns:32px minmax(0,1fr) minmax(0,1fr) minmax(0,88px) 30px;align-items:end;gap:5px;margin:9px 0}.ls-p1-set>span{font-size:11px;color:var(--muted);align-self:center}.ls-p1-set label{font-size:10px;display:block;color:var(--muted);min-width:0}.ls-p1-set input,.ls-p1-set select{display:block;width:100%;min-width:0;margin-top:4px;border-radius:8px;padding:8px 5px;font-size:13px}.ls-p1-set button{border:0;background:#35223b;color:#fff;border-radius:8px;padding:8px 3px}.ls-p1-add{margin-top:8px}.ls-p1-ack{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px}.ls-p1-ack input{width:auto}.ls-p1-review [data-p1-edit-input]{margin-top:8px}.ls-p1-review [data-action="confirm-ai-workout"]:disabled{opacity:.5;cursor:not-allowed}@media(max-width:370px){.ls-p1-set{grid-template-columns:27px minmax(0,1fr) minmax(0,1fr) 70px 24px!important}}';
document.head.appendChild(css);
document.documentElement.dataset.lastsetSmartLogP1=VERSION;
})();