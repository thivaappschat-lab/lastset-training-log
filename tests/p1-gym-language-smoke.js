// Living gym-language corpus: user-supplied real-lifter stress cases.
// A "review" case must not be silently accepted as if all its fields are known.
const assert=require('node:assert/strict');
global.__LASTSET_TEST_ONLY__=true;
require('../lastset-smartlog-p1.js');
const P=global.LastSetSmartLogP1Test;
assert(P,'P1 parser test API is not available');
const rows=[
  {id:1,phrase:'Bench 80 for 8 then 85 for 6 and 5',type:'external',want:[[80,8],[85,6],[85,5]]},
  {id:2,phrase:'Squat 100x5, 110x3, 120x1',type:'external',want:[[100,5],[110,3],[120,1]]},
  {id:3,phrase:'DB incline 30s 3x10',type:'external',want:[[30,10],[30,10],[30,10]]},
  {id:4,phrase:'Pull ups bodyweight 8,6,5 then +25 for 5',type:'bodyweight',want:[[0,8],[0,6],[0,5],[25,5]]},
  {id:5,phrase:'Cable fly 15 three sets of 12',type:'external',want:[[15,12],[15,12],[15,12]]},
  {id:6,phrase:'Leg press 200 for 15, drop to 150 for 12, then 100 for 15',type:'external',want:[[200,15],[150,12],[100,15]]},
  {id:7,phrase:'OHP 60x5 then 55 amrap',type:'external',want:[[60,5],[55,null]],warn:true},
  {id:8,phrase:'RDL 100 3x8',type:'external',want:[[100,8],[100,8],[100,8]]},
  {id:9,phrase:'Hammer curl 20s 3x12',type:'external',want:[[20,12],[20,12],[20,12]]},
  {id:10,phrase:'Bench 100x5 @8, 100x5 @9, 100x4 @10',type:'external',want:[[100,5],[100,5],[100,4]],warn:true},
  {id:11,phrase:'Lat pulldown 70 for 10 then 60 to failure',type:'external',want:[[70,10],[60,null]],warn:true},
  {id:12,phrase:'Superset: incline db 28x10 with face pulls 20x15, three rounds',type:'external',warn:true},
  {id:13,phrase:'Weighted dips +20 3x8',type:'bodyweight',want:[[20,8],[20,8],[20,8]]},
  {id:14,phrase:'Machine chest press 45 12,10,8',type:'external',want:[[45,12],[45,10],[45,8]]},
  {id:15,phrase:'Deadlift 140x5 then 150x3 then 160x1',type:'external',want:[[140,5],[150,3],[160,1]]},
  {id:16,phrase:'Warm up bench 60x8, 70x5 then working 80x5, 85x5, 90x3',type:'external',want:[[60,8],[70,5],[80,5],[85,5],[90,3]],warmups:2},
  {id:17,phrase:'Cable row 50 three sets of 12, dropset last set',type:'external',want:[[50,12],[50,12],[50,12]],warn:true},
  {id:18,phrase:'Chin ups assisted 3x8 then bodyweight max',type:'assisted',warn:true},
  {id:19,phrase:'Leg curl 40x12, 40x10, 35x12',type:'external',want:[[40,12],[40,10],[35,12]]},
  {id:20,phrase:'did some bench today 80 kilos for eight then put 85 on and got six and five',type:'external',want:[[80,8],[85,6],[85,5]]}
];
for(const t of rows){
  const got=P.parseProgressivePhrase(t.phrase,t.type,'kg');
  assert(got,'Case '+t.id+' must either parse or be explicitly marked for review');
  if(t.want)assert.deepStrictEqual(got.sets.map(s=>[s.weightKg,s.reps]),t.want,'Case '+t.id+': incorrect set weights/reps');
  if(t.warn)assert(got.warnings.length>0,'Case '+t.id+': source ambiguities must be visible');
  if(t.warmups!=null)assert.equal(got.sets.filter(s=>s.setType==='warmup').length,t.warmups,'warm-ups retained');
}
const extra=[
  ['Bench press 80kg for 8, then 85kg for 6 and 5.','external',[[80,8],[85,6],[85,5]]],
  ['bench 80 for 8 then 85 for a couple of sixes and a five','external',[[80,8],[85,6],[85,6],[85,5]]],
  ['Bench 176lb 2x8','external',[[79.8,8],[79.8,8]]]
];
for(const [phrase,type,want] of extra)assert.deepStrictEqual(P.parseProgressivePhrase(phrase,type,'kg')?.sets.map(s=>[s.weightKg,s.reps]),want,phrase);
assert.deepStrictEqual(P.parseProgressivePhrase('Bench 100x5 then 105x4','external','lb').sets.map(s=>[s.weightKg,s.reps]),[[45.4,5],[47.6,4]]);
assert.equal(P.parseProgressivePhrase('rest 120 sec','external','kg'),null);
const pending={items:[{kind:'resistance',exerciseId:'bench-press',name:'Bench',loadType:'external',p1Warnings:[],sets:[{weightKg:80,reps:8},{weightKg:85,reps:6},{weightKg:85,reps:5}]}]};
assert.equal(P.validateReview(pending).ok,true);
pending.items[0].sets[2].reps=null;
assert.equal(P.validateReview(pending).ok,false,'missing reps must block save');
pending.items[0].sets[2].reps=5;
pending.items[0].p1Warnings=['Please review dropset weight'];
assert.equal(P.validateReview(pending).ok,false,'unacknowledged warnings block save');
pending.items[0].p1Acknowledged=true;
assert.equal(P.validateReview(pending).ok,true);

// Regression: a plain squat is intentionally ambiguous, but it cannot vanish
// because recognised pull-ups and OHP occur later in the same description.
const report='Squat 100x5, 110x3, 120x1. Pull ups bodyweight 8,6,5 then +25 for 5. OHP 60x5 then 55 amrap.';
const mentions=[
  {start:report.indexOf('Pull ups'),end:report.indexOf('Pull ups')+8},
  {start:report.indexOf('OHP'),end:report.indexOf('OHP')+3}
];
const omitted=P.findUnaccountedExerciseSegments(report,mentions,'kg');
assert.equal(omitted.length,1,'One unresolved squat must be presented even alongside recognised exercises');
assert.equal(omitted[0].ambiguity,'squat');
assert.deepStrictEqual(omitted[0].sets.map(x=>[x.weightKg,x.reps]),[[100,5],[110,3],[120,1]]);
const missing={items:[{kind:'resistance',name:'Squat — choose variation',exerciseId:null,sets:omitted[0].sets,p1Review:true}]};
assert.equal(P.validateReview(missing).ok,false,'unidentified exercises must block save');
const unidentified=P.findUnaccountedExerciseSegments('Unlisted lift 50x10. Bench press 80x8',[
  {start:'Unlisted lift 50x10. '.length,end:'Unlisted lift 50x10. '.length+11}
],'kg');
assert.equal(unidentified.length,1,'Unrecognised entire exercise sentence must not be silently omitted');
assert.equal(unidentified[0].ambiguity,'unidentified');
assert.equal(P.findUnaccountedExerciseSegments('Back Squat 100x5',[
  {start:0,end:10}
],'kg').length,0,'Explicit known squat must not create duplicates');
assert.equal(P.findUnaccountedExerciseSegments('Bench press 80kg for 8, then 85kg for 6 and 5.',[
  {start:0,end:11}
],'kg').length,0,'Progressive sets for a known exercise must not create false omissions');

console.log('LastSet P1 living gym-language corpus passed:',rows.length,'scenarios plus progressive, units and review guards');