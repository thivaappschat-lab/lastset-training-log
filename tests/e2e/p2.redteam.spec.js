const {test,expect}=require('@playwright/test');
const STORE='lastset-data-v1';
const CATEGORIES=['resistance','cardio','mobility','smart'];
const MODES=['quick','free','timed'];
async function fresh(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()});
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#ls-onboard-name')).toBeVisible();
  await page.locator('#ls-onboard-name').fill('P2 Breaker');
  await page.locator('[data-onboard-save]').click();
  await expect(page.locator('.ls-onboard-finish')).toBeVisible();
  await page.locator('[data-start="day"]').click();
  await expect(page.locator('[data-p2-entry="resistance"]')).toBeVisible();
}
async function today(page){await page.locator('.bottom-nav [data-nav="day"]').click();}
async function start(page,category,mode='free'){
  await today(page);await page.locator('[data-p2-entry="'+category+'"]').click();
  if(category==='resistance'){
    await expect(page.locator('.ls-exercise-hero')).toBeVisible();
    await page.locator('[data-exercise="bench-press"]').click();
  }
  await expect(page.locator('[data-p2-mode="'+mode+'"]')).toBeVisible();
  await page.locator('[data-p2-mode="'+mode+'"]').click();
  await page.locator('[data-p2-blank]').click();
  if(category==='smart'&&mode==='quick')await expect(page.locator('#ai-text')).toBeVisible();
  else await expect(page.locator('.ls-p2-body')).toBeVisible();
}
async function draft(page,c){
 return page.evaluate(cat=>globalThis.LastSetP2?.loadDraft(cat),c);
}
async function history(page){
 return page.evaluate(k=>Object.values(JSON.parse(localStorage.getItem(k)).sessions||{}).flat(),STORE);
}
async function bench(page,{weight='55',reps='8',sets='1'}={}){
 const weightInput=page.locator('[data-p2-add-weight="0"]'),repsInput=page.locator('[data-p2-add-reps="0"]');
 await weightInput.fill(weight);
 if(await repsInput.count())await repsInput.fill(reps);
 const count=page.locator('[data-p2-add-count="0"]');
 if(await count.count())await count.fill(sets);
 await page.locator('[data-p2-add-set="0"]').click();
}
async function save(page){await page.locator('[data-p2-finish]').click();await expect(page.locator('[data-p2-commit]')).toBeVisible();await page.locator('[data-p2-commit]').click();}

test.describe('P2 red team routing and mode matrix',()=>{
 for(const category of CATEGORIES)for(const mode of MODES){
  test(category+' '+mode+' opens correct screen, mode and category draft',async({page})=>{
   await fresh(page);await start(page,category,mode);
   if(mode==='quick'&&category==='smart'){
    await expect(page.locator('#ai-text')).toBeVisible();
    expect(await history(page)).toHaveLength(0);return;
   }
   const d=await draft(page,category);
   expect(d).not.toBeNull();expect(d.category).toBe(category);expect(d.mode).toBe(mode);
   for(const other of CATEGORIES.filter(x=>x!==category))expect(await draft(page,other)).toBeNull();
   await expect(page.locator('[data-p2-elapsed]')).toHaveCount(mode==='timed'?1:0);
  });
 }
 test('@critical new Today displays only one visible set of categories',async({page})=>{
  await fresh(page);
  await expect(page.locator('.ls-hero')).toHaveCount(1);
  await expect(page.locator('[data-p2-entry]')).toHaveCount(4);
  await expect(page.locator('.action-list')).toBeHidden();
  await expect(page.getByText('Original quick-log shortcuts')).toHaveCount(0);
  await expect(page.locator('[data-p2-mark-rest]')).toBeVisible();
 });
 test('@critical resistance uses full library before any mode or set input',async({page})=>{
  await fresh(page);await page.locator('[data-p2-entry="resistance"]').click();
  await expect(page.locator('.ls-exercise-hero')).toBeVisible();
  await expect(page.locator('#exercise-search')).toBeVisible();
  await expect(page.locator('[data-p2-mode]')).toHaveCount(0);
  await page.locator('[data-exercise="bench-press"]').click();
  await expect(page.locator('.ls-p2-page-head h2')).toContainText('Bench Press');
  await expect(page.locator('[data-p2-mode]')).toHaveCount(3);
  await page.locator('[data-p2-back]').click();
  await expect(page.locator('#exercise-search')).toBeVisible();
 });
 test('@critical four categories do not hijack other active drafts',async({page})=>{
  await fresh(page);
  for(const cat of CATEGORIES){
   await start(page,cat,'free');
   if(cat==='resistance')await bench(page);
   if(cat==='cardio')await page.locator('[data-p2-field="cardio.duration"]').fill('31');
   if(cat==='mobility')await page.locator('[data-p2-field="mobility.duration"]').fill('45');
   if(cat==='smart')await page.locator('[data-p2-smart]').fill('Bench Press 55 kg 8 reps 3 sets');
  }
  await today(page);
  await expect(page.locator('[data-p2-resume]')).toHaveCount(4);
  await page.reload({waitUntil:'domcontentloaded'});
  await today(page);
  for(const cat of CATEGORIES){
   expect((await draft(page,cat))?.category).toBe(cat);
   await page.locator('[data-p2-resume="'+cat+'"]').click();
   await expect(page.locator('.ls-p2-page-head h2')).toContainText(cat==='resistance'?'Resistance':cat==='cardio'?'Cardio':cat==='mobility'?'Mobility':'Smart Log');
   await today(page);
  }
  expect((await draft(page,'resistance')).exercises[0].sets).toHaveLength(1);
  expect((await draft(page,'cardio')).cardio.duration).toBe('31');
  expect((await draft(page,'mobility')).mobility.duration).toBe('45');
  expect((await draft(page,'smart')).smartText).toContain('Bench Press');
  expect(await history(page)).toHaveLength(0);
 });
 test('@critical draft legacy key survives migration and other categories stay isolated',async({page})=>{
  await fresh(page);await start(page,'resistance','free');await bench(page);
  const before=await draft(page,'resistance');
  await page.evaluate(()=>{
   const key=Object.keys(localStorage).find(k=>k.includes('lastset-p2-active-v1:')&&k.endsWith(':resistance'));
   const value=localStorage.getItem(key);
   localStorage.setItem(key.slice(0,-':resistance'.length),value);
   localStorage.removeItem(key);
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await today(page);
  expect((await draft(page,'resistance'))?.id).toBe(before.id);
  await start(page,'cardio','free');
  expect((await draft(page,'resistance'))?.id).toBe(before.id);
 });
 test('damaged draft in cardio slot does not destroy resistance recovery',async({page})=>{
  await fresh(page);await start(page,'resistance','free');await bench(page);
  const old=await draft(page,'resistance');
  await page.evaluate(()=>{
   const key=Object.keys(localStorage).find(k=>k.includes('lastset-p2-active-v1:')&&k.endsWith(':resistance'));
   localStorage.setItem(key.replace(':resistance',':cardio'),'{bad json');
  });
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await draft(page,'resistance'))?.id).toBe(old.id);
  await today(page);await expect(page.locator('[data-p2-resume="resistance"]')).toBeVisible();
 });
 test('a discarded cardio draft leaves resistance history and draft untouched',async({page})=>{
  await fresh(page);await start(page,'resistance','free');await bench(page);
  const original=await draft(page,'resistance');
  await start(page,'cardio','free');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-p2-discard]').click();
  expect(await draft(page,'cardio')).toBeNull();
  expect((await draft(page,'resistance'))?.id).toBe(original.id);
 });
});

test.describe('P2 profile switch and legacy draft trust',()=>{
 test('@critical switching active profiles cannot persist an old draft into a different user space',async({page})=>{
  await fresh(page);await start(page,'resistance','free');await bench(page);
  const first=await draft(page,'resistance');
  await page.locator('.bottom-nav [data-nav="profile"]').click();
  await page.locator('[data-profile-manage-users]').click();
  await page.locator('[data-user-new]').click();
  await page.locator('#ls-new-profile-name').fill('Independent P2 Tester');
  await page.locator('[data-v14-create-user]').click();
  await page.locator('[data-start="day"]').click();
  await expect(page.locator('[data-p2-resume]')).toHaveCount(0);
  const second=await page.evaluate(()=>JSON.parse(localStorage.getItem('lastset-data-v1')).profile.userId);
  await start(page,'cardio','free');
  const cross=await page.evaluate(id=>{
    const prefix='lastset-p2-active-v1:'+String(id).replace(/[^a-z0-9_-]/ig,'_').slice(0,80);
    return localStorage.getItem(prefix+':resistance');
  },second);
  expect(cross).toBeNull();
  await page.locator('.bottom-nav [data-nav="profile"]').click();
  await page.locator('[data-profile-manage-users]').click();
  await page.locator('.ls-user-row').filter({hasText:'P2 Breaker'}).first().locator('[data-user-switch]').click();
  await today(page);
  expect((await draft(page,'resistance'))?.id).toBe(first.id);
  expect((await draft(page,'resistance')).exercises[0].sets).toHaveLength(1);
 });
 test('corrupt current draft slot cannot mask a valid legacy recovery slot',async({page})=>{
  await fresh(page);await start(page,'resistance','free');await bench(page);
  const old=await draft(page,'resistance');
  await page.evaluate(()=>{
   const key=Object.keys(localStorage).find(k=>k.includes('lastset-p2-active-v1:')&&k.endsWith(':resistance'));
   localStorage.setItem(key.slice(0,-':resistance'.length),localStorage.getItem(key));
   localStorage.setItem(key,'{broken-json');
  });
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await draft(page,'resistance'))?.id).toBe(old.id);
 });
});

test.describe('P2 red team validation and data trust',()=>{
 const loads=[
  ['zero','0','8',true],['decimal','12.5','8',true],['heavy','1000','1',true],
  ['overlimit','1000.1','8',false],['negative','-1','8',false],
  ['repszero','40','0',false],['repsnegative','40','-1',false],
  ['repsdecimal','40','3.5',false],['repsmaximum','1','500',true],
  ['repsover','40','501',false]
 ];
 for(const [name,weight,reps,valid] of loads){
  test('resistance '+name+' '+(valid?'accepted':'rejected')+' at save gate',async({page})=>{
   await fresh(page);await start(page,'resistance','free');
   await bench(page,{weight,reps});
   await page.locator('[data-p2-finish]').click();
   if(valid)await expect(page.locator('[data-p2-commit]')).toBeVisible();
   else await expect(page.locator('[data-p2-commit]')).toHaveCount(0);
   expect(await history(page)).toHaveLength(0);
  });
 }
 const durationCases=[
  ['zero','0',false],['negative','-2',false],['maximum','720',true],
  ['overflow','721',false],['fractional','7.5',true]
 ];
 for(const [name,value,valid] of durationCases)for(const cat of ['cardio','mobility']){
  test(cat+' duration '+name+' save boundary',async({page})=>{
   await fresh(page);await start(page,cat,'quick');
   await page.locator('[data-p2-field="'+cat+'.duration"]').fill(value);
   await page.locator('[data-p2-finish]').click();
   if(valid)await expect(page.locator('[data-p2-commit]')).toBeVisible();
   else await expect(page.locator('[data-p2-commit]')).toHaveCount(0);
   expect(await history(page)).toHaveLength(0);
  });
 }
 for(const cat of ['resistance','cardio','mobility','smart']){
  test(cat+' empty draft cannot create phantom history',async({page})=>{
   await fresh(page);await start(page,cat,'free');
   await page.locator('[data-p2-finish]').click();
   await expect(page.locator('[data-p2-commit]')).toHaveCount(0);
   expect(await history(page)).toHaveLength(0);
  });
 }
 test('@critical same resistance save cannot append twice',async({page})=>{
  await fresh(page);await start(page,'resistance','free');await bench(page);
  await save(page);
  const before=await history(page);
  await page.reload({waitUntil:'domcontentloaded'});
  const after=await history(page);
  expect(before).toEqual(after);
  expect(after.filter(x=>x.type==='resistance')).toHaveLength(1);
  expect(after.find(x=>x.type==='resistance').exercises).toHaveLength(1);
  expect(await draft(page,'resistance')).toBeNull();
 });
 test('removing sets does not erase saved history until explicit save',async({page})=>{
  await fresh(page);await start(page,'resistance','free');
  await bench(page);
  await page.locator('[data-p2-remove-set="0:0"]').click();
  expect((await draft(page,'resistance')).exercises[0].sets).toHaveLength(0);
  await page.locator('[data-p2-finish]').click();
  await expect(page.locator('[data-p2-commit]')).toHaveCount(0);
  expect(await history(page)).toHaveLength(0);
 });
 test('repeat tapping review never saves without final confirmation',async({page})=>{
  await fresh(page);await start(page,'resistance','free');await bench(page);
  await page.locator('[data-p2-finish]').click();
  await expect(page.locator('[data-p2-commit]')).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});
  expect(await history(page)).toHaveLength(0);
  expect((await draft(page,'resistance')).exercises[0].sets).toHaveLength(1);
 });
 test('@critical no timer remains truly optional after reloading a saved draft',async({page})=>{
  await fresh(page);await start(page,'resistance','free');await bench(page);
  await page.reload({waitUntil:'domcontentloaded'});await today(page);
  await page.locator('[data-p2-resume="resistance"]').click();
  await expect(page.locator('[data-p2-elapsed]')).toHaveCount(0);
  await expect(page.locator('[data-p2-rest]')).toHaveCount(0);
 });
 test('quick Cardio saves one activity and exact distance',async({page})=>{
  await fresh(page);await start(page,'cardio','quick');
  await page.locator('[data-p2-field="cardio.duration"]').fill('31');
  await page.locator('[data-p2-field="cardio.distance"]').fill('5.25');
  await save(page);const s=(await history(page)).filter(x=>x.type==='cardio');
  expect(s).toHaveLength(1);
  expect([s[0].duration,s[0].distance]).toEqual([31,5.25]);
 });
 test('mobility Yoga style and intensity persist through reload and save',async({page})=>{
  await fresh(page);await start(page,'mobility','quick');
  await page.locator('[data-p2-field="mobility.duration"]').fill('45');
  await page.locator('[data-p2-field="mobility.style"]').selectOption('Vinyasa');
  await page.locator('[data-p2-field="mobility.intensity"]').selectOption('Moderate');
  await page.reload({waitUntil:'domcontentloaded'});await today(page);
  await page.locator('[data-p2-resume="mobility"]').click();
  await expect(page.locator('[data-p2-field="mobility.style"]')).toHaveValue('Vinyasa');
  await save(page);
  const m=(await history(page)).filter(x=>x.type==='mobility');
  expect(m).toHaveLength(1);expect([m[0].style,m[0].duration,m[0].intensity]).toEqual(['Vinyasa',45,'Moderate']);
 });
});
