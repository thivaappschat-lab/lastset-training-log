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
  if(/\bassist(?:ed|ance)?\b/i.test(raw) && /\b(?:bodyweight|body\s*weight|\bmax\b)\b/i.test(raw)){
    return {sets:[],warnings:unique([...warnings,'Assisted and bodyweight/failure sets need separate explicit loads and reps. Do not interpret the set count as kilograms.']),recognized:false};
  }
  const weightUnit='(?:kg|kgs?|kilos?|lb|lbs|pounds?)';
  // A spoken set COUNT is not an additional rep count. Normalize explicit
  // phrases before the progressive "50 for 3, 4" parser can misread them:
  // "50 kg for three, four sets" → 4 sets of 3,
  // "50 kg assistance for seven, three sets" → 3 sets of 7.
  // Apply only when the word "sets" is explicit: "50 for 3, 4" remains
  // a progressive sequence. Avoid overriding mixed-assisted ambiguity above.
  const spokenRepThenSets=new RegExp('\\b(\\d+(?:\\.\\d+)?)\\s*('+weightUnit+')\\b(?:\\s+(?:assistance|assist))?\\s*(?:for\\s+|at\\s+)?(\\d{1,3})\\s*(?:reps?|repetitions?)?\\s*(?:[,;]\\s*|\\s+)(?:for\\s+)?(\\d{1,2})\\s*sets?\\b','i');
  const spokenSetsThenRep=new RegExp('\\b(\\d+(?:\\.\\d+)?)\\s*('+weightUnit+')\\b(?:\\s+(?:assistance|assist))?\\s*(\\d{1,2})\\s*sets?\\s*(?:of|at|for|x|×)?\\s*(\\d{1,3})\\s*(?:reps?)?\\b','i');
  const spoken=spokenRepThenSets.exec(t)||spokenSetsThenRep.exec(t);
  if(spoken){
    const count=Number(spokenRepThenSets.test(t)?spoken[4]:spoken[3]);
    const reps=Number(spokenRepThenSets.test(t)?spoken[3]:spoken[4]);
    const w=toKg(spoken[1],spoken[2],defaultUnit);
    if(w!==null&&Number.isInteger(count)&&count>=1&&count<=20&&Number.isInteger(reps)&&reps>=1&&reps<=500){
      return {sets:Array.from({length:count},()=>({weightKg:w,reps,setType:'working'})),warnings,recognized:true};
    }
  }
  if(type==='assisted'){
    return warnings.length?{sets:[],warnings:unique(warnings),recognized:false}:null;
  }
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
// Keep the source text as the source of truth. An unrecognised exercise can
// still be a hard boundary: its numbers must NEVER be parsed into the prior
// recognised lift. This intentionally prefers review over guessed records.
function buildSmartLogSourceInventory(source,mentions,defaultUnit='kg'){
  const text=safe(source);
  const found=(mentions||[]).slice().sort((a,b)=>a.start-b.start);
  const candidates=found.map(m=>{
    const preceding=text.slice(Math.max(0,m.start-32),m.start);
    const misheard=/\\bmy\\s+sister\\s*$/i.exec(preceding);
    if(m.exercise?.id==='triceps-dip'&&misheard){
      // The recognizer sometimes renders "assisted dip" as "my sister Dip".
      // Keep this as a boundary and force exercise selection; never infer
      // Triceps Dip or Assisted Dip from that ASR artifact.
      return {start:m.start-misheard[0].length,end:m.end,exercise:null,
        alias:'my sister dip',ambiguity:'unidentified',recognised:false,
        asrHint:'Possible speech recognition error near "my sister Dip". Choose the actual dip variation before saving.'};
    }
    return {start:m.start,end:m.end,exercise:m.exercise||null,alias:m.alias||'',ambiguity:null,recognised:true};
  });
  const overlaps=(start,end)=>candidates.some(m=>start<m.end&&end>m.start);
  const addUnknown=(start,end,ambiguity,alias='')=>{
    if(!overlaps(start,end))candidates.push({start,end,ambiguity,alias,exercise:null});
  };
  // These are deliberately *not* inferred as a specific exercise: the user
  // must choose the intended variation. They nevertheless act as boundaries.
  const unknown=/(?:\bsquats?\b|\bchin[\s-]?ups?\b|\bface[\s-]?pulls?\b|\bgood[\s-]?mornings?\b|\bincline\s+dumbbells?\b|\bdb\s+incline\b|\bcable\s+flies\b)/gi;
  for(const m of text.matchAll(unknown)){
    const token=m[0].toLowerCase();
    if(/^squats?$/.test(token)){
      const before=text.slice(Math.max(0,m.index-24),m.index);
      if(/\b(?:barbell|back|front|bodyweight|body\s*weight|air|hack|goblet|smith)\s*$/i.test(before))continue;
    }
    addUnknown(m.index,m.index+m[0].length,/^squats?$/.test(token)?'squat':'unidentified',m[0]);
  }
  // A wholly unidentified clause still deserves a visible review card.
  // Detect clause starts without treating a comma between *sets* as a new lift.
  const clauses=[...text.matchAll(/(?:^|[.;\n])\s*([^.;\n]+)/g)];
  for(const clause of clauses){
    const content=clause[1],start=clause.index+clause[0].indexOf(content),end=start+content.length;
    if(candidates.some(m=>m.start>=start&&m.start<end))continue;
    const firstNumber=content.search(/\d/),lead=firstNumber>=0?content.slice(0,firstNumber).trim():'';
    if(firstNumber<0||!/[a-z]{3}/i.test(lead))continue;
    if(!/\d+(?:\.\d+)?\s*(?:kg|lb|x|×|for\b)|\d+\s+sets?\b/i.test(content))continue;
    if(/^(?:(?:then|and|for|reps|sets?|drop|to|at|with)\s*)+$/i.test(lead))continue;
    addUnknown(start,start+Math.min(lead.length,content.length),'unidentified',lead);
  }
  candidates.sort((a,b)=>a.start-b.start||b.end-a.end);
  const compact=[];
  for(const candidate of candidates){
    if(compact.some(c=>candidate.start>=c.start&&candidate.start<c.end))continue;
    compact.push(candidate);
  }
  return compact.map((candidate,i)=>{
    let start=candidate.start;
    if(i===0 && /^\s*(?:warm(?:\s|-)?up\s*|did some\s*)$/i.test(text.slice(0,start)))start=0;
    const next=compact[i+1]?.start??text.length;
    let end=next;
    const punctuation=/[.;\n](?=\s*[a-z])/i.exec(text.slice(candidate.end,next));
    if(punctuation)end=Math.min(end,candidate.end+punctuation.index);
    const phrase=text.slice(start,end).trim().replace(/[.;]\s*$/,'').trim();
    const mixedAssistance=/\bassist(?:ed|ance)?\b/i.test(phrase)&&/\b(?:bodyweight|body\s*weight)\b/i.test(phrase);
    let parsed=mixedAssistance
      ?{sets:[],warnings:['Assisted and bodyweight work are different loading modes. Split these into separately specified exercises before saving.'],recognized:false}
      :parseProgressivePhrase(phrase,candidate.exercise?.loadType||'external',defaultUnit);
    if(!parsed)parsed={sets:[],warnings:[],recognized:false};
    const warnings=unique([
      ...(parsed.warnings||[]),
      ...(candidate.ambiguity==='squat'?['Squat type was not specified. Choose the exercise before saving.']:[]),
      ...(candidate.ambiguity==='unidentified'?['This exercise needs identification. Verify its sets before saving.']:[]),
      ...(candidate.asrHint?[candidate.asrHint]:[])
    ]);
    return {...candidate,source:phrase,sets:parsed.sets,warnings,
      sourceStart:candidate.start,needsRewrite:mixedAssistance};
  });
}
function findUnaccountedExerciseSegments(source,mentions,defaultUnit='kg'){
  return buildSmartLogSourceInventory(source,mentions,defaultUnit)
    .filter(x=>!x.recognised).map(x=>({
      start:x.start,source:x.source,ambiguity:x.ambiguity,
      sets:x.sets,warnings:x.warnings,needsRewrite:x.needsRewrite
    }));
}

function preserveExplicitMemoryResult(parsed){
  return !!(parsed && (
    (Array.isArray(parsed.memoryAssumptions)&&parsed.memoryAssumptions.length) ||
    (Array.isArray(parsed.memoryLearnedAliases)&&parsed.memoryLearnedAliases.length) ||
    (Array.isArray(parsed.items)&&parsed.items.some(item=>item?.memorySuggestion))
  ));
}
function validateReview(parsed){
  if(parsed?.p1AuditError)return {ok:false,why:'Exercise detection could not be verified. Edit the description and try again.'};
  if(!Array.isArray(parsed?.items)||!parsed.items.length)return {ok:false,why:'No activities detected'};
  for(const item of parsed.items){
    if(item.kind!=='resistance')continue;
    if(item.p1RequiresRewrite)return {ok:false,why:'Split the assisted and bodyweight movements in the description before saving'};
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
  globalThis.LastSetSmartLogP1Test={parseProgressivePhrase,reviewWarnings,validateReview,findUnaccountedExerciseSegments,buildSmartLogSourceInventory,preserveExplicitMemoryResult};
  return;
}
if(typeof window==='undefined'||typeof parseSmartWorkout!=='function')return;
const previousParser=parseSmartWorkout,previousReview=aiParsedHtml;
parseSmartWorkout=function(text){
  const result=previousParser(text);
  if(!result||!Array.isArray(result.items))return result;
  // LastSet Memory has an explicit user-requested source of truth: recorded
  // historical sets. Do not reparse a command such as "same as last time"
  // into an empty or invented workout, or replace the Memory review renderer.
  if(preserveExplicitMemoryResult(result))return result;
  const source=safe(text),unit=typeof data!=='undefined'?(data?.profile?.weightUnit||'kg'):'kg';
  try{
    const mentions=typeof findExerciseMentions==='function'?(findExerciseMentions(source)||[]).slice().sort((a,b)=>a.start-b.start):[];
    const inventory=buildSmartLogSourceInventory(source,mentions,unit);
    const used=new Set();
    const previousItems=result.items.slice();
    const ordered=[];
    for(const entry of inventory){
      let index=previousItems.findIndex((item,k)=>!used.has(k)&&item.kind==='resistance'&&entry.exercise&&item.exerciseId===entry.exercise.id);
      if(index<0 && entry.ambiguity==='squat')
        index=previousItems.findIndex((item,k)=>!used.has(k)&&item.kind==='resistance'&&!item.exerciseId&&item.ambiguity==='squat');
      if(index<0 && entry.ambiguity==='unidentified')
        index=previousItems.findIndex((item,k)=>!used.has(k)&&item.kind==='resistance'&&!item.exerciseId&&item.ambiguity!=='squat');
      if(index>=0)used.add(index);
      const ex=entry.exercise;
      const item=index>=0?previousItems[index]:{
        kind:'resistance',exerciseId:ex?.id||null,name:ex?.name||(entry.ambiguity==='squat'?'Squat — choose variation':'Unidentified exercise'),
        equipment:ex?.equipment||'',loadType:ex?.loadType||'external',
        primaryMuscles:ex?.muscles||[],sets:[],notes:null
      };
      // Always replace legacy-parser sets with this exercise's *own* source.
      // Keeping a legacy set when the new segmented parser returns nothing
      // would reintroduce the invented 3 kg × 8 Deadlift set.
      if(entry.sets.length)item.sets=entry.sets;
      else if(entry.needsRewrite || /\bmax\b/i.test(entry.source) ||
        (/\bassist(?:ed|ance)?\b/i.test(entry.source) &&
         !/\b\d+(?:\.\d+)?\s*(?:kg|kgs?|kilos?|lb|lbs|pounds?)\s+\d{1,3}\s+reps?\s+\d{1,2}\s+sets?\b/i.test(entry.source)))item.sets=[];
      else if(ex && typeof parseExerciseSetsV11==='function'){
        const fallback=parseExerciseSetsV11(ex,entry.source);
        item.sets=Array.isArray(fallback)?fallback:[];
      }else item.sets=[];
      item.exerciseId=ex?.id||null;
      item.name=ex?.name||(entry.ambiguity==='squat'?'Squat — choose variation':'Unidentified exercise');
      item.equipment=ex?.equipment||'';
      item.loadType=ex?.loadType||'external';
      item.primaryMuscles=ex?.muscles||[];
      item.ambiguity=entry.ambiguity||undefined;
      item.p1Source=entry.source;
      item.p1SourceStart=entry.sourceStart;
      item.p1Review=true;
      item.p1Acknowledged=false;
      item.p1RequiresRewrite=entry.needsRewrite;
      item.p1Warnings=unique([...entry.warnings,...(entry.needsRewrite?['Edit and split the original description before saving.']:[])]);
      item.notes=[index>=0?previousItems[index].notes:null,'Original Smart Log: '+entry.source].filter(Boolean).join(' · ');
      ordered.push(item);
    }
    // Preserve cardio data and genuinely independent inferred records. Drop
    // only unclaimed legacy resistance records that conflict with source
    // inventory, to avoid duplicate bare-squat cards and fabricated sets.
    const outside=previousItems.filter((item,k)=>item.kind!=='resistance'||(!used.has(k)&&inventory.length===0));
    result.items=[...ordered,...outside];
    result.p1DetectedExerciseCount=ordered.length;
    if(ordered.some(item=>!item.exerciseId||item.p1RequiresRewrite)){
      result.confidence=Math.min(Number(result.confidence)||0.5,0.54);
      result.needsConfirmation=true;
      result.clarification='Confirm the exercise and each set before saving.';
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
/* LastSet v0.16.2 — recover suspicious ASR without silently guessing.
 * A phonetic transcription is NOT authoritative workout data.
 * Candidate sets are visible, preserve source words, and require user approval.
 */
(()=>{
'use strict';
const VERSION='0.16.2';
const numerals={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,fifteen:15,twenty:20};
const asNumber=t=>Object.hasOwn(numerals,String(t).toLowerCase())?numerals[String(t).toLowerCase()]:Number(t);
const n='(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|\\d{1,2})';
const weight='(?:kg|kgs?|kilograms?|kilos?|lb|lbs|pounds?)';
const pattern=new RegExp(
  '^\\s*(?:i\\s+(?:did|do)\\s+)?'+
  '(\\d+(?:\\.\\d+)?)\\s*('+weight+')\\s+('+n+')\\s+(?:reps?|steps|wraps?)\\s+'+
  '(faucets|'+n+'\\s*(?:sets?|cents|sense))\\s+'+
  '(bench\\s+press)\\s+(?:and\\s+then|then)\\s+'+
  '(my\\s+sister|assisted\\s+dips?)\\s+'+
  '(\\d+(?:\\.\\d+)?)\\s*('+weight+')\\s+('+n+')\\s+(?:reps?|wraps?)\\s+'+
  '('+n+')\\s+(?:sets?|cents|sense)\\s*[.!?]*$','i'
);
function findNoisyVoiceCandidate(source){
  if(typeof source!=='string'||source.length>450)return null;
  const m=pattern.exec(source);
  if(!m)return null;
  const reps1=asNumber(m[3]),count1=/^faucets$/i.test(m[4])?4:asNumber(m[4].split(/\s/)[0]);
  const reps2=asNumber(m[9]),count2=asNumber(m[10]);
  const weight1=Number(m[1]),weight2=Number(m[7]);
  const unit1=m[2],unit2=m[8];
  const firstIsKg=!/^(lb|lbs|pounds?)$/i.test(unit1),secondIsKg=!/^(lb|lbs|pounds?)$/i.test(unit2);
  const kg=(v,isKg)=>isKg?v:Math.round(v*0.453592*10)/10;
  if(!Number.isInteger(count1)||count1<1||count1>20||
     !Number.isInteger(count2)||count2<1||count2>20||
     !Number.isInteger(reps1)||reps1<1||reps1>500||
     !Number.isInteger(reps2)||reps2<1||reps2>500||
     !Number.isFinite(weight1)||weight1<0||weight1>2200||
     !Number.isFinite(weight2)||weight2<0||weight2>2200)return null;
  const boundary=source.toLowerCase().indexOf(m[6].toLowerCase());
  return {
    source,
    first:{exerciseId:'bench-press',weightKg:kg(weight1,firstIsKg),reps:reps1,count:count1},
    second:{weightKg:kg(weight2,secondIsKg),reps:reps2,count:count2,unidentified:/my\s+sister/i.test(m[6])},
    firstWords:source.slice(0,source.toLowerCase().indexOf(' and then ')).trim(),
    secondWords:source.slice(source.toLowerCase().indexOf(' and then ')+10).trim(),
    warning:'Speech recognition changed the workout wording. These weights, repetitions and set counts are only possible interpretations. Check every number and explicitly confirm before saving.'
  };
}
if(typeof globalThis!=='undefined'&&globalThis.__LASTSET_TEST_ONLY__){
  globalThis.LastSetVoiceRepairTest={findNoisyVoiceCandidate};
  return;
}
if(typeof window==='undefined'||typeof parseSmartWorkout!=='function')return;
const previous=parseSmartWorkout;
parseSmartWorkout=function(text){
  const candidate=findNoisyVoiceCandidate(text);
  if(!candidate)return previous(text);
  const c=candidate;
  // The normal parser is still invoked for its metadata and established safety checks.
  const normalized='Bench press '+c.first.weightKg+' kg '+c.first.reps+' reps '+c.first.count+' sets. '+
    (c.second.unidentified?'Unidentified movement':'Assisted dip')+' '+c.second.weightKg+' kg '+c.second.reps+' reps '+c.second.count+' sets';
  const parsed=previous(normalized);
  if(!parsed||!Array.isArray(parsed.items))return previous(text);
  const catalog=typeof EXERCISES!=='undefined'?EXERCISES:[];
  const bench=catalog.find(x=>x.id==='bench-press');
  const dip=catalog.find(x=>x.id==='assisted-dip');
  const metadata=(ex)=>({equipment:ex?.equipment||'',primaryMuscles:ex?.muscles||[],loadType:ex?.loadType||'external'});
  const make=(exercise,src,details,ambiguous)=>{
    const warning=ambiguous
      ?'Possible second exercise omitted by speech recognition ("my sister"). Choose the actual exercise before saving; Assisted Dip is not assumed.'
      :'Speech recognition rendered the first exercise and its set details out of order.';
    return {
      kind:'resistance',
      exerciseId:exercise?.id||null,
      name:exercise?.name||(ambiguous?'Unidentified exercise — confirm movement':'Unidentified exercise'),
      ...metadata(exercise),
      sets:Array.from({length:details.count},()=>({weightKg:details.weightKg,reps:details.reps,setType:'working'})),
      p1Review:true,p1Acknowledged:false,p1RequiresRewrite:false,
      p1Warnings:[warning,c.warning],
      p1Source:src,p1SourceStart:0,
      notes:'Original voice transcription: '+src+' · Candidate interpretation requires confirmation'
    };
  };
  const a=make(bench,c.firstWords,c.first,false);
  const b=make(c.second.unidentified?null:dip,c.secondWords,c.second,c.second.unidentified);
  if(c.second.unidentified)b.ambiguity='unidentified';
  parsed.items=[a,b];
  parsed.p1DetectedExerciseCount=2;
  parsed.p1AuditError=false;
  parsed.confidence=Math.min(Number(parsed.confidence)||.5,.35);
  parsed.needsConfirmation=true;
  parsed.clarification='Speech was unclear. Review both sets and identify the second exercise. Nothing will be saved until confirmed.';
  parsed.p1SpeechRepair=true;
  parsed.p1OriginalVoiceSource=text;
  return parsed;
};
globalThis.LastSetVoiceRepair={version:VERSION,findNoisyVoiceCandidate};
document.documentElement.dataset.lastsetVoiceRepair=VERSION;
})();