const {test,expect}=require('@playwright/test');
const STORE='lastset-data-v1';
async function fresh(page,name='Evening QA'){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#ls-onboard-name').fill(name);
 await page.locator('[data-onboard-save]').click();
 await expect(page.locator('.ls-onboard-finish')).toBeVisible();
 await page.locator('[data-start="day"]').click();
 await expect(page.locator('[data-p2-quick]')).toBeVisible();
}
async function db(page){return page.evaluate(k=>JSON.parse(localStorage.getItem(k)),STORE);}
async function allSessions(page){return Object.values((await db(page)).sessions||{}).flat();}
async function cardioDraft(page){
 await page.locator('[data-p2-entry="cardio"]').click();
 await page.locator('[data-p2-activity-choice="Treadmill"]').click();
 await page.locator('[data-p2-mode="quick"]').click();
 await page.locator('[data-p2-blank]').click();
 await page.locator('[data-p2-field="cardio.duration"]').fill('20');
 await page.locator('[data-p2-field="cardio.distance"]').fill('2');
 await page.locator('[data-p2-field="cardio.incline"]').fill('3');
}
async function pinCardio(page){
 await cardioDraft(page);
 page.once('dialog',dialog=>dialog.accept('2 km incline treadmill'));
 await page.locator('[data-p2-pin-favorite]').click();
 expect((await db(page)).p2Presets.filter(p=>p.pinned)).toHaveLength(1);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-p2-discard]').click();
 await page.locator('.bottom-nav [data-nav="day"]').click();
 await expect(page.locator('[data-p2-favorite]')).toHaveCount(1);
}
test.describe('Evening Quick Log iPhone-first acceptance on isolated candidate only',()=>{
 test('Today preserves motivation, category order and direct Saved Workouts shortcut',async({page})=>{
  await fresh(page);
  await expect(page.locator('.ls-hero')).toBeVisible();
  await expect(page.locator('[data-p2-entry]')).toHaveCount(4);
  const order=await page.evaluate(()=>{
   const today=document.querySelector('[data-p2-today]');
   return {hero:document.querySelector('.ls-hero')?.nextElementSibling===today,
     categories:today?.querySelector('.ls-p2-grid')?.compareDocumentPosition(today.querySelector('[data-p2-quick]'))&Node.DOCUMENT_POSITION_FOLLOWING,
     quick:!!today.querySelector('[data-p2-quick]')};
  });
  expect(order).toEqual({hero:true,categories:4,quick:true});
  await page.locator('[data-p2-today-saved="resistance"]').click();
  await expect(page.locator('[data-p2-source-tab="saved"]')).toHaveClass(/selected/);
 });
 test('pin a 2km 3% 20min cardio favorite without phantom history, then edit and confirm save',async({page})=>{
  await fresh(page);await pinCardio(page);
  expect(await allSessions(page)).toHaveLength(0);
  const card=page.locator('[data-p2-favorite]').first();
  await expect(card).toContainText('2 km');
  await expect(card).toContainText('3% incline');
  await expect(card).toContainText('20 min');
  await card.click();
  await expect(page.locator('[data-p2-field="cardio.duration"]')).toHaveValue('20');
  await expect(page.locator('[data-p2-field="cardio.distance"]')).toHaveValue('2');
  await expect(page.locator('[data-p2-field="cardio.incline"]')).toHaveValue('3');
  await page.locator('[data-p2-field="cardio.duration"]').fill('21');
  await page.locator('[data-p2-finish]').click();
  await expect(page.locator('[data-p2-commit]')).toHaveCount(0);
  await page.locator('[data-p2-confirm-copy]').check();
  await page.locator('[data-p2-finish]').click();
  await expect(page.locator('[data-p2-commit]')).toBeVisible();
  expect(await allSessions(page)).toHaveLength(0);
  await page.locator('[data-p2-commit]').click();
  const cardio=(await allSessions(page)).filter(s=>s.type==='cardio');
  expect(cardio).toHaveLength(1);
  expect([cardio[0].duration,cardio[0].distance,cardio[0].incline]).toEqual([21,2,3]);
 });
 test('Undo removes only the precise new cardio workout without deleting older history',async({page})=>{
  await fresh(page);await pinCardio(page);
  await page.evaluate(k=>{const d=JSON.parse(localStorage.getItem(k));d.sessions['2026-09-20']=[{id:'preserve-this-run',type:'cardio',activity:'Running',duration:30}];localStorage.setItem(k,JSON.stringify(d));},STORE);
  await page.locator('[data-p2-favorite]').click();
  await page.locator('[data-p2-confirm-copy]').check();
  await page.locator('[data-p2-finish]').click();
  await page.locator('[data-p2-commit]').click();
  await expect(page.locator('[data-p2-undo]')).toBeVisible();
  expect(await allSessions(page)).toHaveLength(2);
  await page.locator('[data-p2-undo]').click();
  const list=await allSessions(page);
  expect(list).toHaveLength(1);
  expect(list[0].id).toBe('preserve-this-run');
  await expect(page.locator('[data-p2-undo]')).toHaveCount(0);
 });
 test('Resistance favorites are reference only and do not auto-mark sets completed',async({page})=>{
  await fresh(page);
  await page.locator('[data-p2-entry="resistance"]').click();
  await page.locator('[data-exercise="bench-press"]').click();
  await page.locator('[data-p2-mode="quick"]').click();
  await page.locator('[data-p2-blank]').click();
  await page.locator('[data-p2-add-weight="0"]').fill('60');
  await page.locator('[data-p2-add-reps="0"]').fill('8');
  await page.locator('[data-p2-add-set="0"]').click();
  page.once('dialog',dialog=>dialog.accept('Bench press plan'));
  await page.locator('[data-p2-pin-favorite]').click();
  await page.locator('.bottom-nav [data-nav="day"]').click();
  await expect(page.locator('[data-p2-favorite]')).toContainText('Bench press plan');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-p2-resume="resistance"]').click();
  await page.locator('[data-p2-discard]').click();
  await page.locator('[data-p2-favorite]').click();
  await expect(page.locator('.ls-p2-exercise')).toHaveCount(1);
  await expect(page.locator('.ls-p2-set')).toHaveCount(0);
  await expect(page.locator('.ls-p2-reference')).toContainText('60 kg × 8');
  expect(await allSessions(page)).toHaveLength(0);
 });
 test('favorites survive reload, rename and unpin without deleting the saved preset',async({page})=>{
  await fresh(page);await pinCardio(page);await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.bottom-nav [data-nav="day"]').click();
  await expect(page.locator('[data-p2-favorite]')).toHaveCount(1);
  page.once('dialog',dialog=>dialog.accept('Incline run'));
  await page.locator('[data-p2-fav-rename]').click();
  await expect(page.locator('[data-p2-favorite]')).toContainText('Incline run');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-p2-fav-remove]').click();
  await expect(page.locator('[data-p2-favorite]')).toHaveCount(0);
  const saved=(await db(page)).p2Presets;
  expect(saved).toHaveLength(1);expect(saved[0].pinned).toBe(false);
 });
 test('favorites remain isolated between local profiles',async({page})=>{
  await fresh(page);await pinCardio(page);
  await page.locator('.bottom-nav [data-nav="profile"]').click();
  await page.locator('[data-profile-manage-users]').click();
  await page.locator('[data-user-new]').click();
  await page.locator('#ls-new-profile-name').fill('Another user');
  await page.locator('[data-v14-create-user]').click();
  await page.locator('[data-start="day"]').click();
  await expect(page.locator('[data-p2-favorite]')).toHaveCount(0);
  expect((await db(page)).p2Presets||[]).toHaveLength(0);
 });
});
