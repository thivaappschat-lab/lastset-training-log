const {test,expect}=require('@playwright/test');
const STORE='lastset-data-v1';
async function fresh(page){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#ls-onboard-name').fill('P2 Extended QA');
 await page.locator('[data-onboard-save]').click();
 await expect(page.locator('.ls-onboard-finish')).toBeVisible();
 await page.locator('[data-start="day"]').click();
 await expect(page.locator('[data-p2-entry="resistance"]')).toBeVisible();
}
async function today(page){await page.locator('.bottom-nav [data-nav="day"]').click();}
async function open(page,cat,mode){
 await today(page);await page.locator('[data-p2-entry="'+cat+'"]').click();
 if(cat==='resistance')await page.locator('[data-exercise="bench-press"]').click();
 await page.locator('[data-p2-mode="'+mode+'"]').click();
 await page.locator('[data-p2-blank]').click();
}
async function draft(page,cat){return page.evaluate(c=>globalThis.LastSetP2.loadDraft(c),cat);}
async function history(page){return page.evaluate(k=>Object.values(JSON.parse(localStorage.getItem(k)).sessions||{}).flat(),STORE);}
async function finish(page){
 await page.locator('[data-p2-finish]').click();
 await expect(page.locator('[data-p2-commit]')).toBeVisible();
 await page.locator('[data-p2-commit]').click();
 await expect(page.locator('[data-p2-entry="resistance"]')).toBeVisible();
}
test.describe('P2 extended adversarial data durability',()=>{
 test('two separate cardio activities persist once and in order',async({page})=>{
  await fresh(page);await open(page,'cardio','free');
  await page.locator('[data-p2-field="cardio.activity"]').selectOption('Running');
  await page.locator('[data-p2-field="cardio.duration"]').fill('21');
  await page.locator('[data-p2-field="cardio.distance"]').fill('4.25');
  await page.locator('[data-p2-add-activity]').click();
  await page.locator('[data-p2-field="cardio.activity"]').selectOption('Cycling');
  await page.locator('[data-p2-field="cardio.duration"]').fill('34');
  await page.locator('[data-p2-field="cardio.distance"]').fill('11.5');
  await page.locator('[data-p2-add-activity]').click();
  expect((await draft(page,'cardio')).entries).toHaveLength(2);
  await page.reload({waitUntil:'domcontentloaded'});await today(page);
  await page.locator('[data-p2-resume="cardio"]').click();
  await expect(page.locator('[data-p2-remove-entry]')).toHaveCount(2);
  await finish(page);
  const list=(await history(page)).filter(x=>x.type==='cardio');
  expect(list.map(x=>[x.activity,x.duration,x.distance])).toEqual([['Running',21,4.25],['Cycling',34,11.5]]);
 });
 test('removing one completed activity does not remove its sibling',async({page})=>{
  await fresh(page);await open(page,'mobility','free');
  await page.locator('[data-p2-field="mobility.duration"]').fill('20');
  await page.locator('[data-p2-add-activity]').click();
  await page.locator('[data-p2-field="mobility.activity"]').selectOption('Stretching');
  await page.locator('[data-p2-field="mobility.duration"]').fill('10');
  await page.locator('[data-p2-add-activity]').click();
  await page.locator('[data-p2-remove-entry="0"]').click();
  expect((await draft(page,'mobility')).entries.map(x=>x.activity)).toEqual(['Stretching']);
  await finish(page);
  expect((await history(page)).filter(x=>x.type==='mobility').map(x=>x.activity)).toEqual(['Stretching']);
 });
 test('switching optional timer on and off preserves completed sets',async({page})=>{
  await fresh(page);await open(page,'resistance','free');
  await page.locator('[data-p2-add-weight="0"]').fill('55');
  await page.locator('[data-p2-add-reps="0"]').fill('9');
  await page.locator('[data-p2-add-set="0"]').click();
  await page.locator('[data-p2-change-mode="timed"]').click();
  await expect(page.locator('[data-p2-elapsed]')).toBeVisible();
  await page.locator('[data-p2-change-mode="free"]').click();
  await expect(page.locator('[data-p2-elapsed]')).toHaveCount(0);
  expect((await draft(page,'resistance')).exercises[0].sets).toHaveLength(1);
  await finish(page);
  expect((await history(page)).find(x=>x.type==='resistance').exercises[0].sets[0].reps).toBe(9);
 });
 test('paused timer state survives reload and resume',async({page})=>{
  await fresh(page);await open(page,'resistance','timed');
  await page.locator('[data-p2-pause]').click();
  expect((await draft(page,'resistance')).pausedAt).toBeGreaterThan(0);
  await page.reload({waitUntil:'domcontentloaded'});await today(page);
  await page.locator('[data-p2-resume="resistance"]').click();
  await expect(page.locator('[data-p2-pause]')).toContainText('Resume');
  await page.locator('[data-p2-pause]').click();
  const resumed=await draft(page,'resistance');
  expect(resumed.pausedAt).toBeNull();
  expect(resumed.pausedMs).toBeGreaterThanOrEqual(0);
  expect(await history(page)).toHaveLength(0);
 });
 test('angle brackets in notes persist as text without creating markup',async({page})=>{
  await fresh(page);await open(page,'cardio','free');
  const note='<b>Hard effort</b> & easy cooldown';
  await page.locator('[data-p2-field="cardio.notes"]').fill(note);
  await page.locator('[data-p2-field="cardio.duration"]').fill('15');
  await page.locator('[data-p2-add-activity]').click();
  await page.reload({waitUntil:'domcontentloaded'});await today(page);
  await page.locator('[data-p2-resume="cardio"]').click();
  expect((await draft(page,'cardio')).entries[0].notes).toBe(note);
  await finish(page);
  expect((await history(page)).find(x=>x.type==='cardio').notes).toBe(note);
 });
 test('discarding unfinished timed workout never saves phantom history',async({page})=>{
  await fresh(page);await open(page,'resistance','timed');
  await page.locator('[data-p2-add-weight="0"]').fill('25');
  await page.locator('[data-p2-add-reps="0"]').fill('12');
  await page.locator('[data-p2-add-set="0"]').click();
  page.once('dialog',d=>d.accept());
  await page.locator('[data-p2-discard]').click();
  expect(await draft(page,'resistance')).toBeNull();
  expect(await history(page)).toHaveLength(0);
  await page.reload({waitUntil:'domcontentloaded'});
  await today(page);
  await expect(page.locator('[data-p2-resume="resistance"]')).toHaveCount(0);
 });
 test('cancelled discard leaves draft and history intact',async({page})=>{
  await fresh(page);await open(page,'resistance','free');
  await page.locator('[data-p2-add-weight="0"]').fill('30');
  await page.locator('[data-p2-add-reps="0"]').fill('10');
  await page.locator('[data-p2-add-set="0"]').click();
  const id=(await draft(page,'resistance')).id;
  page.once('dialog',d=>d.dismiss());
  await page.locator('[data-p2-discard]').click();
  expect((await draft(page,'resistance')).id).toBe(id);
  expect(await history(page)).toHaveLength(0);
 });
 test('overlong Smart Log text cannot create a saved record',async({page})=>{
  await fresh(page);await open(page,'smart','free');
  await page.locator('[data-p2-smart]').fill('Bench Press 50 kg 10 reps. '.repeat(130));
  await page.locator('[data-p2-parse]').click();
  await expect(page.locator('[data-p2-accept-smart]')).toHaveCount(0);
  expect(await history(page)).toHaveLength(0);
 });
 test('unrelated malformed local storage key does not hide active draft',async({page})=>{
  await fresh(page);await open(page,'mobility','free');
  await page.locator('[data-p2-field="mobility.duration"]').fill('30');
  const id=(await draft(page,'mobility')).id;
  await page.evaluate(()=>localStorage.setItem('unrelated-lastset-damaged','{'));
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await draft(page,'mobility')).id).toBe(id);
  expect(await history(page)).toHaveLength(0);
 });
 test('unsubmitted workout never mutates previously saved training',async({page})=>{
  await fresh(page);await open(page,'cardio','quick');
  await page.locator('[data-p2-field="cardio.duration"]').fill('15');
  await finish(page);
  const baseline=await history(page);
  await open(page,'mobility','free');
  await page.locator('[data-p2-field="mobility.duration"]').fill('40');
  await page.reload({waitUntil:'domcontentloaded'});
  expect(await history(page)).toEqual(baseline);
 });
});
