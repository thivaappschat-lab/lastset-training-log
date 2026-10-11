const assert=require('node:assert/strict');
global.__LASTSET_TEST_ONLY__=true;
require('../lastset-smartlog-p1.js');
const p=global.LastSetSmartLogP1Test;
const exercise=(id,name,loadType='external')=>({id,name,loadType});
const inventory=(phrase,mentions=[])=>p.buildSmartLogSourceInventory(phrase,mentions);
const sets=entry=>entry.sets.map(s=>[s.weightKg,s.reps]);
const match=(phrase,name,id,loadType='external')=>{
  const start=phrase.indexOf(name);
  if(start<0)throw Error('missing exercise marker '+name);
  return {start,end:start+name.length,exercise:exercise(id,name,loadType),alias:name};
};
// Grok R3B: the assistant or parser MUST NOT transform assisted set count
// into the prior Deadlift's fourth 3 kg x8 set.
{
  const phrase='Deadlift 140x5 then 150x3 then 160x1. Chin ups assisted 3x8 then bodyweight max.';
  const values=inventory(phrase,[match(phrase,'Deadlift','deadlift')]);
  assert.equal(values.length,2);
  assert.deepStrictEqual(sets(values[0]),[[140,5],[150,3],[160,1]]);
  assert.deepStrictEqual(sets(values[1]),[]);
  assert.equal(values[1].ambiguity,'unidentified');
  assert.equal(values[1].needsRewrite,true);
  assert(values[1].source.includes('assisted 3x8'));
  assert(!values[0].source.includes('assisted'));
}
{
  const phrase='Deadlift 140x5 150x3 160x1. Good mornings 60 3x10';
  const values=inventory(phrase,[match(phrase,'Deadlift','deadlift')]);
  assert.equal(values.length,2);
  assert.deepStrictEqual(sets(values[0]),[[140,5],[150,3],[160,1]]);
  assert.deepStrictEqual(sets(values[1]),[[60,10],[60,10],[60,10]]);
}
{
  const phrase='Squat 120x3, 130x2, 140x1. Good mornings 60 3x10.';
  const values=inventory(phrase);
  assert.equal(values.length,2,'Only two source exercises, no extra squat');
  assert.equal(values[0].ambiguity,'squat');
  assert.deepStrictEqual(sets(values[0]),[[120,3],[130,2],[140,1]]);
  assert.equal(values[1].ambiguity,'unidentified');
  assert.deepStrictEqual(sets(values[1]),[[60,10],[60,10],[60,10]]);
}
{
  const phrase='Warm up squat 60x8 80x5 then working 100x5 110x3 120x1';
  const values=inventory(phrase);
  assert.equal(values.length,1);
  assert.deepStrictEqual(sets(values[0]),[[60,8],[80,5],[100,5],[110,3],[120,1]]);
  assert.deepStrictEqual(values[0].sets.map(s=>s.setType),['warmup','warmup','working','working','working']);
}
{
  const phrase='did some bench today 80 kilos for eight then put 85 on and got six and five, then incline dumbbells 30 for ten three times and cable flies light for fifteen';
  const values=inventory(phrase,[match(phrase,'bench','bench-press')]);
  assert.equal(values.length,3);
  assert.deepStrictEqual(sets(values[0]),[[80,8],[85,6],[85,5]]);
  assert.equal(values[1].ambiguity,'unidentified');
  assert.equal(values[2].ambiguity,'unidentified');
  assert(values[2].source.includes('light'));
}
{
  const phrase='RDL 100 3x8. Weighted dips +20 3x8. Face pulls 20x15 three sets.';
  const values=inventory(phrase,[match(phrase,'RDL','romanian-deadlift'),match(phrase,'dips','triceps-dip','bodyweight')]);
  assert.equal(values.length,3);
  assert.deepStrictEqual(sets(values[0]),[[100,8],[100,8],[100,8]]);
  assert.deepStrictEqual(sets(values[1]),[[20,8],[20,8],[20,8]]);
  assert.equal(values[2].ambiguity,'unidentified');
}
{
  const phrase='Bench 100x5 @8 100x5 @9 100x4 @10. DB incline 28x10';
  const values=inventory(phrase,[match(phrase,'Bench','bench-press')]);
  assert.equal(values.length,2);
  assert.deepStrictEqual(sets(values[0]),[[100,5],[100,5],[100,4]]);
  assert.equal(values[1].ambiguity,'unidentified');
}
{
  const phrase='Leg press 200 for 15 drop to 150 for 12 then 100 for 15';
  const values=inventory(phrase,[match(phrase,'Leg press','leg-press')]);
  assert.equal(values.length,1);
  assert.deepStrictEqual(sets(values[0]),[[200,15],[150,12],[100,15]]);
}
{
  const phrase='Hammer curl 20s 3x12. Tricep pushdown 25 3x15';
  const values=inventory(phrase,[match(phrase,'Hammer curl','hammer-curl'),match(phrase,'Tricep pushdown','triceps-pushdown')]);
  assert.equal(values.length,2);
  assert.deepStrictEqual(sets(values[0]),[[20,12],[20,12],[20,12]]);
  assert.deepStrictEqual(sets(values[1]),[[25,15],[25,15],[25,15]]);
}
{
  const phrase='Cable row 50 three sets of 12 dropset last set. Lat pulldown 70 for 10 then 60 to failure';
  const values=inventory(phrase,[match(phrase,'Cable row','seated-row'),match(phrase,'Lat pulldown','lat-pulldown')]);
  assert.equal(values.length,2);
  assert.deepStrictEqual(sets(values[0]),[[50,12],[50,12],[50,12]]);
  assert.deepStrictEqual(sets(values[1]),[[70,10],[60,null]]);
}
assert.equal(p.validateReview({items:[{kind:'resistance',exerciseId:'chin-up',sets:[{weightKg:0,reps:8}],p1RequiresRewrite:true}]}).ok,false,'Unsupported mixed assisted / bodyweight mode must block save');
{
  const expected=[{weightKg:80,reps:10},{weightKg:80,reps:10},{weightKg:80,reps:8}];
  const memory={memoryAssumptions:[{sourceDate:'2026-10-01'}],items:[{kind:'resistance',exerciseId:'bench-press',sets:expected}]};
  assert.equal(p.preserveExplicitMemoryResult(memory),true,'explicit memory commands must bypass source-set parsing');
  assert.deepStrictEqual(memory.items[0].sets,expected,'the recalled set sequence is the source of truth');
  assert.equal(p.preserveExplicitMemoryResult({memoryLearnedAliases:[{phrase:'my bench'}],items:[{}]}),true);
  assert.equal(p.preserveExplicitMemoryResult({items:[{memorySuggestion:{sourceDate:'2026-10-01'}}]}),true);
  assert.equal(p.preserveExplicitMemoryResult({items:[{kind:'resistance',exerciseId:'bench-press'}]}),false);
}
console.log('P1 source-boundary / invented-set regression passed: 10 compound fixtures and fail-closed review');