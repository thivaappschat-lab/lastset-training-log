const {test,expect}=require('@playwright/test');
const STORE='lastset-data-v1';
async function fresh(page){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()});
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#ls-onboard-name')).toBeVisible();
 await page.locator('#ls-onboard-name').fill('P2 QA');
 await page.locator('[data-onboard-save]').click();
 await expect(page.locator('.ls-onboard-finish')).toBeVisible();
 await page.locator('[data-start="day"]').click();
 await expect(page.locator('.bottom-nav')).toBeVisible();
 await expect(page.locator('[data-p2-entry="resistance"]')).toBeVisible();
}
async function choose(page,category,mode,source='blank'){
 await page.locator('.bottom-nav [data-nav="day"]').click();
 await page.locator('[data-p2-entry="'+category+'"]').click();
 if(category==='resistance'){
  await expect(page.locator('.ls-exercise-hero')).toBeVisible();
  await expect(page.locator('[data-exercise="bench-press"]')).toBeVisible();
  await page.locator('[data-exercise="bench-press"]').click();
 }else if(category==='cardio'||category==='mobility'){
  await expect(page.locator('[data-p2-mode]')).toHaveCount(0);
  await expect(page.locator('[data-p2-activity-choice]')).toHaveCount(category==='cardio'?10:5);
  await page.locator('[data-p2-activity-choice="'+(category==='cardio'?'Running':'Yoga')+'"]').click();
 }
 await expect(page.locator('[data-p2-mode="'+mode+'"]')).toBeVisible();
 await page.locator('[data-p2-mode="'+mode+'"]').click();
 await expect(page.locator('[data-p2-blank]')).toBeVisible();
 if(source==='blank')await page.locator('[data-p2-blank]').click();
 else if(source==='previous')await page.locator('[data-p2-source="0"]').click();
 else {await page.locator('[data-p2-source-tab="saved"]').click();await page.locator('[data-p2-source="0"]').click();}
 if(category!=='smart'||mode!=='quick')await expect(page.locator('.ls-p2-body')).toBeVisible();
}
async function db(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),STORE)}
async function sessions(page){return Object.values((await db(page)).sessions||{}).flat()}
async function addBench(page,w='60',r='8',n='1'){
 if(!(await page.locator('.ls-p2-exercise').filter({hasText:'Bench Press'}).count())){
  await page.locator('[data-p2-exercise="bench-press"]').click();
 }
 await page.locator('[data-p2-add-weight="0"]').fill(w);
 await page.locator('[data-p2-add-reps="0"]').fill(r);
 const count=page.locator('[data-p2-add-count="0"]');if(await count.count())await count.fill(n);
 await page.locator('[data-p2-add-set="0"]').click();
}
async function finish(page){
 await page.locator('[data-p2-finish]').click();
 await expect(page.locator('[data-p2-commit]')).toBeVisible();
 await page.locator('[data-p2-commit]').click();
 await expect(page.locator('[data-p2-entry="resistance"]')).toBeVisible();
}
async function seed(page){
 await page.evaluate(key=>{
  const d=JSON.parse(localStorage.getItem(key)),iso='2026-09-20';
  d.sessions[iso]=[
   {id:'seed-p2-bench',type:'resistance',createdAt:Date.now()-100000,
   exercises:[{exerciseId:'bench-press',name:'Bench Press',loadType:'external',sets:[{weight:50,reps:10,setType:'working'},{weight:55,reps:8,setType:'working'}]}]},
   {id:'seed-p2-run',type:'cardio',activity:'Running',duration:32,distance:5,createdAt:Date.now()-100000},
   {id:'seed-p2-yoga',type:'mobility',activity:'Yoga',style:'Vinyasa',intensity:'Moderate',duration:45,createdAt:Date.now()-100000}
  ];
  d.templates.push({id:'seed-push',name:'Saved Push Day',exerciseIds:['bench-press','assisted-dip']});
  localStorage.setItem(key,JSON.stringify(d));
 },STORE);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('.bottom-nav [data-nav="day"]').click();
 await expect(page.locator('[data-p2-entry="resistance"]')).toBeVisible();
}

// Exercise the complete P2 acceptance set twice: against the isolated candidate
// and against deployed production using Playwright's fresh disposable contexts.
// Each test onboards its own throwaway local profile; no real user records are read.
for(const [acceptanceTarget,acceptanceBaseURL] of [
 ['isolated candidate',null],
 ['production disposable','https://lastset-training-log.thiva-claimflow.workers.dev/']
]){
 test.describe('P2 '+acceptanceTarget+' acceptance',()=>{
  if(acceptanceBaseURL)test.use({baseURL:acceptanceBaseURL});
test.describe('P2 four-category logging modes and safe source reuse',()=>{
 test('Today keeps the hero and one visible group of four correctly routed categories',async({page})=>{
  await fresh(page);
  await expect(page.locator('.ls-hero')).toHaveCount(1);
  expect(await page.evaluate(()=>{
   const hero=document.querySelector('.ls-hero'),tiles=document.querySelector('[data-p2-today]');
   return hero?.nextElementSibling===tiles;
  })).toBe(true);
  for(const category of ['resistance','cardio','mobility','smart']){
   await expect(page.locator('[data-p2-entry="'+category+'"]')).toBeVisible();
   await expect(page.locator('[data-day-action="'+(category==='smart'?'describe':category)+'"]')).toBeHidden();
   await page.locator('[data-p2-entry="'+category+'"]').click();
   if(category==='resistance'){
    await expect(page.locator('.ls-exercise-hero')).toBeVisible();
    await page.locator('[data-exercise="bench-press"]').click();
   }
   if(category==='cardio'||category==='mobility'){
    await expect(page.locator('[data-p2-mode]')).toHaveCount(0);
    await expect(page.locator('.ls-p2-page-head h2')).toContainText(category==='cardio'?'cardio':'mobility');
    await page.locator('[data-p2-activity-choice="'+(category==='cardio'?'Running':'Yoga')+'"]').click();
   }
   await expect(page.locator('.ls-p2-page-head h2')).toContainText(category==='resistance'?'Bench Press':category==='cardio'?'Running':category==='mobility'?'Yoga':'Smart Log');
   for(const m of ['quick','free','timed'])await expect(page.locator('[data-p2-mode="'+m+'"]')).toBeVisible();
   await page.locator('[data-p2-back]').click();
   await page.locator('.bottom-nav [data-nav="day"]').click();
  }
 });

 test('an unfinished Resistance draft does not hijack Cardio, Mobility or Smart Log',async({page})=>{
   await fresh(page);await choose(page,'resistance','free');await addBench(page);
   await page.locator('.bottom-nav [data-nav="day"]').click();
   await page.locator('[data-p2-entry="cardio"]').click();
   await expect(page.locator('.ls-p2-page-head h2')).toHaveText('Choose cardio type');
   await page.locator('[data-p2-activity-choice="Running"]').click();
   await page.locator('[data-p2-mode="free"]').click();await page.locator('[data-p2-blank]').click();
   await expect(page.locator('[data-p2-field="cardio.duration"]')).toBeVisible();
   await page.locator('.bottom-nav [data-nav="day"]').click();
   await page.locator('[data-p2-entry="mobility"]').click();
   await expect(page.locator('.ls-p2-page-head h2')).toHaveText('Choose mobility & recovery type');
   await page.locator('[data-p2-activity-choice="Yoga"]').click();
   await page.locator('[data-p2-mode="free"]').click();await page.locator('[data-p2-blank]').click();
   await expect(page.locator('[data-p2-field="mobility.duration"]')).toBeVisible();
   await page.locator('.bottom-nav [data-nav="day"]').click();
   await page.locator('[data-p2-entry="smart"]').click();
   await expect(page.locator('.ls-p2-page-head h2')).toHaveText('Smart Log');
   await page.locator('[data-p2-mode="free"]').click();await page.locator('[data-p2-blank]').click();
   await expect(page.locator('[data-p2-smart]')).toBeVisible();
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('.bottom-nav [data-nav="day"]').click();
   await expect(page.locator('[data-p2-resume]')).toHaveCount(4);
   await page.locator('[data-p2-resume="resistance"]').click();
   await expect(page.locator('.ls-p2-set')).toHaveCount(1);
   expect((await sessions(page)).filter(s=>s.type==='resistance')).toHaveLength(0);
 });
 test('quick resistance: 3 sets saved exactly once to shared history',async({page})=>{
  await fresh(page);await choose(page,'resistance','quick');await addBench(page,'60','8','3');await finish(page);
  let s=(await sessions(page)).find(x=>x.type==='resistance');
  expect(s.exercises.find(x=>x.exerciseId==='bench-press').sets.map(x=>[x.weight,x.reps])).toEqual([[60,8],[60,8],[60,8]]);
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await sessions(page)).filter(x=>x.type==='resistance')).toHaveLength(1);
 });
 test('live resistance no timer: complete sets with no timer shown, safely resume on reload',async({page})=>{
  await fresh(page);await choose(page,'resistance','free');await addBench(page);
  await expect(page.locator('[data-p2-elapsed]')).toHaveCount(0);
  expect((await sessions(page)).filter(x=>x.type==='resistance')).toHaveLength(0);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.bottom-nav [data-nav="day"]').click();
  await page.locator('[data-p2-resume]').click();
  await expect(page.locator('.ls-p2-set')).toHaveCount(1);
  await finish(page);
  expect((await sessions(page)).find(x=>x.type==='resistance').exercises[0].sets).toHaveLength(1);
 });
 test('timed resistance: rest starts after set and can be skipped; history saves actual sets',async({page})=>{
  await fresh(page);await choose(page,'resistance','timed');await addBench(page);
  await expect(page.locator('[data-p2-elapsed]')).toBeVisible();
  await expect(page.locator('[data-p2-rest]')).not.toHaveText('00:00');
  await page.locator('[data-p2-skip-rest]').click();
  await expect(page.locator('[data-p2-rest]')).toHaveText('00:00');
  await finish(page);
  expect((await sessions(page)).filter(x=>x.type==='resistance')).toHaveLength(1);
 });
 test('copied prior resistance is only reference in live mode, never phantom completed sets',async({page})=>{
  await fresh(page);await seed(page);await choose(page,'resistance','free','previous');
  await expect(page.locator('.ls-p2-reference')).toContainText('50 kg × 10');
  await expect(page.locator('.ls-p2-set')).toHaveCount(0);
  await page.locator('[data-p2-finish]').click();
  await expect(page.locator('[data-p2-commit]')).toHaveCount(0);
  const before=await sessions(page);
  expect(before.filter(x=>x.type==='resistance')).toHaveLength(1);
 });
 test('copy previous after workout requires explicit confirmation and can edit copied sets',async({page})=>{
  await fresh(page);await seed(page);await choose(page,'resistance','quick','previous');
  await expect(page.locator('.ls-p2-set')).toHaveCount(2);
  await page.locator('[data-p2-finish]').click();
  await expect(page.locator('[data-p2-commit]')).toHaveCount(0);
  await page.locator('[data-p2-set="0:1:reps"]').fill('7');
  await page.locator('[data-p2-confirm-copy]').check();
  await finish(page);
  const list=(await sessions(page)).filter(x=>x.type==='resistance');
  expect(list).toHaveLength(2);
  expect(list.find(x=>x.id==='seed-p2-bench').exercises[0].sets.map(s=>s.reps)).toEqual([10,8]);
  expect(list.find(x=>x.id!=='seed-p2-bench').exercises[0].sets.map(s=>s.reps)).toEqual([10,7]);
 });
 test('saved routine lists planned exercises and never silently copies old performances',async({page})=>{
  await fresh(page);await seed(page);await choose(page,'resistance','free','saved');
  await expect(page.locator('.ls-p2-exercise')).toHaveCount(2);
  await expect(page.locator('.ls-p2-set')).toHaveCount(0);
  await expect(page.locator('.ls-p2-note')).toContainText('Saved Push Day');
  expect((await sessions(page)).filter(s=>s.type==='resistance')).toHaveLength(1);
 });
 test('quick cardio logs duration and distance without a timer',async({page})=>{
  await fresh(page);await choose(page,'cardio','quick');
  await page.locator('[data-p2-field="cardio.duration"]').fill('25');
  await page.locator('[data-p2-field="cardio.distance"]').fill('3.2');
  await expect(page.locator('[data-p2-elapsed]')).toHaveCount(0);
  await finish(page);
  const s=(await sessions(page)).find(x=>x.type==='cardio');expect([s.activity,s.duration,s.distance]).toEqual(['Running',25,3.2]);
 });
 test('timed cardio adds recorded activities, stopwatch is optional metadata',async({page})=>{
  await fresh(page);await choose(page,'cardio','timed');
  await expect(page.locator('[data-p2-elapsed]')).toBeVisible();
  await page.locator('[data-p2-field="cardio.duration"]').fill('30');
  await page.locator('[data-p2-add-activity]').click();await finish(page);
  expect((await sessions(page)).filter(x=>x.type==='cardio')).toHaveLength(1);
 });
 test('mobility quick records yoga with style, and no mandatory stopwatch',async({page})=>{
  await fresh(page);await choose(page,'mobility','quick');
  await page.locator('[data-p2-field="mobility.duration"]').fill('45');
  await page.locator('[data-p2-field="mobility.style"]').selectOption('Vinyasa');
  await expect(page.locator('[data-p2-elapsed]')).toHaveCount(0);
  await finish(page);
  const s=(await sessions(page)).find(x=>x.type==='mobility');expect([s.activity,s.duration,s.style]).toEqual(['Yoga',45,'Vinyasa']);
 });
 test('mobility free/timed share the same canonical mobility history',async({page})=>{
  for(const m of ['free','timed']){
   await fresh(page);await choose(page,'mobility',m);
   await page.locator('[data-p2-field="mobility.duration"]').fill('30');
   if(m==='timed')await expect(page.locator('[data-p2-elapsed]')).toBeVisible();
   else await expect(page.locator('[data-p2-elapsed]')).toHaveCount(0);
   await page.locator('[data-p2-add-activity]').click();await finish(page);
   expect((await sessions(page)).find(x=>x.type==='mobility').duration).toBe(30);
  }
 });
 test('Smart Log quick mode delegates to existing P1 editor',async({page})=>{
  await fresh(page);await choose(page,'smart','quick');
  await expect(page.locator('#ai-text')).toBeVisible();
  await expect(page.locator('[data-action="parse-ai"]')).toBeVisible();
 });
 test('Smart Log live mode reviews and saves actual parsed resistance',async({page})=>{
  await fresh(page);await choose(page,'smart','free');
  await page.locator('[data-p2-smart]').fill('Bench Press 50 kg for 3, four sets.');
  await page.locator('[data-p2-parse]').click();
  await expect(page.locator('[data-p2-accept-smart]')).toBeVisible();
  await page.locator('[data-p2-accept-smart]').click();
  await finish(page);
  expect((await sessions(page)).find(x=>x.type==='resistance').exercises[0].sets).toHaveLength(4);
 });
 test('copied cardio and mobility previous records remain separate, editable and history safe',async({page})=>{
  for(const [cat,field,value] of [['cardio','cardio.duration','28'],['mobility','mobility.duration','35']]){
   await fresh(page);await seed(page);await choose(page,cat,'quick','previous');
   await page.locator('[data-p2-field="'+field+'"]').fill(value);
   await page.locator('[data-p2-confirm-copy]').check();
   await finish(page);
   const list=(await sessions(page)).filter(s=>s.type===cat);
   expect(list).toHaveLength(2);
   expect(list.some(x=>x.duration===Number(value))).toBe(true);
  }
 });
 test('saved custom cardio and mobility presets are available by category',async({page})=>{
  for(const cat of ['cardio','mobility']){
   await fresh(page);await choose(page,cat,'quick');
   await page.locator('[data-p2-field="'+cat+'.duration"]').fill('30');
   page.once('dialog',dialog=>dialog.accept('QA Saved '+cat));
   await page.locator('[data-p2-save-preset]').click();
   expect((await db(page)).p2Presets.some(p=>p.category===cat)).toBe(true);
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('[data-p2-discard]').click();
   await choose(page,cat,'free','saved');
   await expect(page.locator('.ls-p2-body')).toBeVisible();
  }
 });
 test('invalid values cannot create phantom histories',async({page})=>{
  await fresh(page);await choose(page,'resistance','quick');
  await addBench(page,'60','8');
  await page.locator('[data-p2-set="0:0:reps"]').fill('-5');
  await page.locator('[data-p2-finish]').click();
  await expect(page.locator('[data-p2-commit]')).toHaveCount(0);
  expect(await sessions(page)).toHaveLength(0);
 });
});


test.describe('P2 recovery and optional timer hardening',()=>{
 test('cardio as-I-go without timer records one valid session',async({page})=>{
  await fresh(page);await choose(page,'cardio','free');
  await expect(page.locator('[data-p2-elapsed]')).toHaveCount(0);
  await page.locator('[data-p2-field="cardio.duration"]').fill('27');
  await page.locator('[data-p2-add-activity]').click();
  await finish(page);
  const cardio=(await sessions(page)).filter(x=>x.type==='cardio');
  expect(cardio).toHaveLength(1);expect(cardio[0].duration).toBe(27);
 });
 test('Smart Log timer begins optional rest after reviewed resistance, without phantom set',async({page})=>{
  await fresh(page);await choose(page,'smart','timed');
  await expect(page.locator('[data-p2-elapsed]')).toBeVisible();
  await page.locator('[data-p2-smart]').fill('Bench Press 50 kg for 3, four sets.');
  await page.locator('[data-p2-parse]').click();
  await page.locator('[data-p2-accept-smart]').click();
  await expect(page.locator('[data-p2-rest]')).toBeVisible();
  await expect(page.locator('[data-p2-rest]')).not.toHaveText('00:00');
  await finish(page);
  const s=(await sessions(page)).find(x=>x.type==='resistance');
  expect(s.exercises[0].sets).toHaveLength(4);
 });
 test('rapid repeated final Save commits exactly one resistance set group',async({page})=>{
  await fresh(page);await choose(page,'resistance','free');await addBench(page);
  await page.locator('[data-p2-finish]').click();
  await expect(page.locator('[data-p2-commit]')).toBeVisible();
  await page.evaluate(()=>{
   const button=document.querySelector('[data-p2-commit]');
   button?.click();
   button?.click();
  });
  expect((await sessions(page)).filter(s=>s.type==='resistance')).toHaveLength(1);
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await sessions(page)).filter(s=>s.type==='resistance')[0].exercises[0].sets).toHaveLength(1);
 });
 test('profile switch never reveals another users in-progress workout draft',async({page})=>{
  await fresh(page);await choose(page,'resistance','free');await addBench(page);
  await page.locator('.bottom-nav [data-nav="profile"]').click();
  await page.locator('[data-profile-manage-users]').click();
  await page.locator('[data-user-new]').click();
  await page.locator('#ls-new-profile-name').fill('P2 QA B');
  await page.locator('[data-v14-create-user]').click();
  await page.locator('[data-start="day"]').click();
  await expect(page.locator('[data-p2-resume]')).toHaveCount(0);
  expect((await sessions(page)).length).toBe(0);
  await page.locator('.bottom-nav [data-nav="profile"]').click();
  await page.locator('[data-profile-manage-users]').click();
  await page.locator('.ls-user-row').filter({hasText:'P2 QA'}).first().locator('[data-user-switch]').click();
  await page.locator('.bottom-nav [data-nav="day"]').click();
  await expect(page.locator('[data-p2-resume]')).toBeVisible();
  await page.locator('[data-p2-resume]').click();
  await expect(page.locator('.ls-p2-set')).toHaveCount(1);
 });
 for(const storageKey of ['lastset-data-v1','lastset-user-spaces-v1']){
  test('failed '+storageKey+' write recovers with same P2 commit ID, no duplicate sets',async({page})=>{
   await fresh(page);await choose(page,'resistance','free');await addBench(page);
   await page.locator('[data-p2-finish]').click();
   await page.evaluate(k=>{
    window.__p2OrigSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key===k)throw new DOMException('Simulated storage failure','QuotaExceededError');
      return window.__p2OrigSet.call(this,key,value);
    };
   },storageKey);
   await page.locator('[data-p2-commit]').click();
   await expect(page.locator('#ls-save-failure')).toBeVisible();
   await expect(page.locator('[data-p2-commit]')).toBeVisible();
   await page.evaluate(()=>{Storage.prototype.setItem=window.__p2OrigSet;});
   await page.locator('[data-storage-retry]').click();
   await expect(page.locator('#ls-save-failure')).toHaveCount(0);
   await page.reload({waitUntil:'domcontentloaded'});
   const workouts=(await sessions(page)).filter(x=>x.type==='resistance');
   expect(workouts).toHaveLength(1);
   expect(workouts[0].exercises[0].sets).toHaveLength(1);
  });
 }
});


test.describe('P2 activity before recording mode',()=>{
 test('Cardio Cycling is picked before a timer decision and survives a quick save and reload',async({page})=>{
   await fresh(page);
   await page.locator('[data-p2-entry="cardio"]').click();
   await expect(page.locator('[data-p2-activity-choice]')).toHaveCount(10);
   await expect(page.locator('[data-p2-mode]')).toHaveCount(0);
   await page.locator('[data-p2-activity-choice="Cycling"]').click();
   await expect(page.locator('.ls-p2-page-head h2')).toHaveText('Cycling');
   await page.locator('[data-p2-mode="quick"]').click();
   await expect(page.locator('[data-p2-blank]')).toBeVisible();
   await page.locator('[data-p2-blank]').click();
   await expect(page.locator('[data-p2-field="cardio.activity"]')).toHaveValue('Cycling');
   await page.locator('[data-p2-field="cardio.duration"]').fill('26');
   await page.locator('[data-p2-field="cardio.distance"]').fill('9.2');
   await finish(page);
   await page.reload({waitUntil:'domcontentloaded'});
   const saved=(await sessions(page)).filter(x=>x.type==='cardio');
   expect(saved).toHaveLength(1);
   expect([saved[0].activity,saved[0].duration,saved[0].distance]).toEqual(['Cycling',26,9.2]);
 });
 test('Mobility Pilates is chosen before no-timer logging, persisted separately from Yoga',async({page})=>{
   await fresh(page);
   await page.locator('[data-p2-entry="mobility"]').click();
   await expect(page.locator('[data-p2-activity-choice]')).toHaveCount(5);
   await expect(page.locator('[data-p2-mode]')).toHaveCount(0);
   await page.locator('[data-p2-activity-choice="Pilates"]').click();
   await expect(page.locator('.ls-p2-page-head h2')).toHaveText('Pilates');
   await page.locator('[data-p2-mode="free"]').click();
   await page.locator('[data-p2-blank]').click();
   await expect(page.locator('[data-p2-field="mobility.activity"]')).toHaveValue('Pilates');
   await expect(page.locator('[data-p2-field="mobility.style"]')).toHaveCount(0);
   await expect(page.locator('[data-p2-elapsed]')).toHaveCount(0);
   await page.locator('[data-p2-field="mobility.duration"]').fill('40');
   await page.locator('[data-p2-add-activity]').click();
   await finish(page);
   await page.reload({waitUntil:'domcontentloaded'});
   const saved=(await sessions(page)).filter(x=>x.type==='mobility');
   expect(saved).toHaveLength(1);
   expect([saved[0].activity,saved[0].duration]).toEqual(['Pilates',40]);
 });
 test('Back from timer choice returns to activity picker without creating or losing a draft',async({page})=>{
   await fresh(page);
   await page.locator('[data-p2-entry="cardio"]').click();
   await page.locator('[data-p2-activity-choice="Swimming"]').click();
   await expect(page.locator('[data-p2-mode="timed"]')).toBeVisible();
   await page.locator('[data-p2-back]').click();
   await expect(page.locator('[data-p2-activity-choice="Walking"]')).toBeVisible();
   await expect(page.locator('[data-p2-mode]')).toHaveCount(0);
   expect(await page.evaluate(()=>globalThis.LastSetP2.loadDraft('cardio'))).toBeNull();
   await page.locator('[data-p2-activity-choice="Walking"]').click();
   await expect(page.locator('.ls-p2-page-head h2')).toHaveText('Walking');
   await page.locator('[data-p2-mode="timed"]').click();
   await page.locator('[data-p2-back]').click();
   await expect(page.locator('.ls-p2-page-head h2')).toHaveText('Walking');
   await page.locator('[data-p2-back]').click();
   await expect(page.locator('[data-p2-activity-choice="Swimming"]')).toBeVisible();
 });
 test('Previous and saved entries are filtered by chosen activity, never silently copy another type',async({page})=>{
   await fresh(page);await seed(page);
   await page.locator('[data-p2-entry="cardio"]').click();
   await page.locator('[data-p2-activity-choice="Swimming"]').click();
   await page.locator('[data-p2-mode="quick"]').click();
   await expect(page.locator('[data-p2-source]')).toHaveCount(0);
   await page.locator('[data-p2-source-tab="saved"]').click();
   await expect(page.locator('[data-p2-source]')).toHaveCount(0);
   await page.locator('[data-p2-blank]').click();
   await expect(page.locator('[data-p2-field="cardio.activity"]')).toHaveValue('Swimming');
   const prior=(await sessions(page)).filter(x=>x.type==='cardio');
   expect(prior).toHaveLength(1);
   expect(prior[0].activity).toBe('Running');
 });
 test('Timed mobility choice is retained on resume after reload with no phantom session',async({page})=>{
   await fresh(page);
   await page.locator('[data-p2-entry="mobility"]').click();
   await page.locator('[data-p2-activity-choice="Stretching"]').click();
   await page.locator('[data-p2-mode="timed"]').click();
   await page.locator('[data-p2-blank]').click();
   await expect(page.locator('[data-p2-field="mobility.activity"]')).toHaveValue('Stretching');
   await expect(page.locator('[data-p2-elapsed]')).toBeVisible();
   await page.reload({waitUntil:'domcontentloaded'});
   await expect.poll(async()=>page.evaluate(()=>globalThis.LastSetP2.loadDraft('mobility')?.mobility.activity)).toBe('Stretching');
   await page.locator('.bottom-nav [data-nav="day"]').click();
   await expect(page.locator('[data-p2-resume="mobility"]')).toBeVisible();
   await page.locator('[data-p2-resume="mobility"]').click();
   await expect(page.locator('[data-p2-field="mobility.activity"]')).toHaveValue('Stretching');
   expect((await sessions(page)).filter(x=>x.type==='mobility')).toHaveLength(0);
 });
});

 });
}
