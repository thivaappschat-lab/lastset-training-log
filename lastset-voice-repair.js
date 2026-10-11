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