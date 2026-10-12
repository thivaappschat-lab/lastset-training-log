const {test,expect}=require('@playwright/test');
const STORE='lastset-data-v1';
async function fresh(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#ls-onboard-name').fill('Round5 Disposable');
  await page.locator('[data-onboard-save]').click();
  await expect(page.locator('.ls-onboard-finish')).toBeVisible();
  await page.locator('[data-start="day"]').click();
  await expect(page.locator('[data-p2-quick]')).toBeVisible();
}
async function db(page){return page.evaluate(k=>JSON.parse(localStorage.getItem(k)),STORE);}
async function sessions(page){return Object.values((await db(page)).sessions||{}).flat();}
async function choose(page,category,activity,mode='quick'){
  await page.locator('[data-p2-entry="'+category+'"]').click();
  await page.locator('[data-p2-activity-choice="'+activity+'"]').click();
  await page.locator('[data-p2-mode="'+mode+'"]').click();
  await page.locator('[data-p2-blank]').click();
}
async function pin(page,name){
  page.once('dialog',d=>d.accept(name));
  await page.locator('[data-p2-pin-favorite]').click();
  page.once('dialog',d=>d.accept());
  await page.locator('[data-p2-discard]').click();
  await page.locator('.bottom-nav [data-nav="day"]').click();
  await expect(page.locator('[data-p2-favorite]')).toHaveCount(1);
}
async function saveFavorite(page){
  await page.locator('[data-p2-favorite]').click();
  await page.locator('[data-p2-confirm-copy]').check();
  await page.locator('[data-p2-finish]').click();
  await expect(page.locator('[data-p2-commit]')).toBeVisible();
  await page.locator('[data-p2-commit]').click();
}
test.describe('Round 5 post-independent-report focused production validation',()=>{
  test('Undo expires after 60s but the saved history is not removed',async({page})=>{
    await fresh(page);await choose(page,'cardio','Treadmill');
    await page.locator('[data-p2-field="cardio.duration"]').fill('20');
    await page.locator('[data-p2-finish]').click();
    await page.locator('[data-p2-commit]').click();
    await expect(page.locator('[data-p2-undo]')).toBeVisible();
    const saved=await sessions(page);expect(saved).toHaveLength(1);
    await page.evaluate(()=>{const old=Date.now.bind(Date);Date.now=()=>old()+61000;});
    await page.locator('.bottom-nav [data-nav="day"]').click();
    await expect(page.locator('[data-p2-undo]')).toHaveCount(0);
    const after=await sessions(page);expect(after).toHaveLength(1);
    expect(after[0].id).toBe(saved[0].id);
  });
  test('Undo is intentionally session-only; reload keeps saved history',async({page})=>{
    await fresh(page);await choose(page,'cardio','Cycling');
    await page.locator('[data-p2-field="cardio.duration"]').fill('30');
    await page.locator('[data-p2-finish]').click();
    await page.locator('[data-p2-commit]').click();
    await expect(page.locator('[data-p2-undo]')).toBeVisible();
    const before=await sessions(page);expect(before).toHaveLength(1);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.bottom-nav [data-nav="day"]').click();
    await expect(page.locator('[data-p2-undo]')).toHaveCount(0);
    const after=await sessions(page);expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);
  });
  test('Yoga favorite persists across reload and saves modified Vinyasa activity with no phantom workout',async({page})=>{
    await fresh(page);await choose(page,'mobility','Yoga');
    await page.locator('[data-p2-field="mobility.duration"]').fill('45');
    await page.locator('[data-p2-field="mobility.style"]').selectOption('Vinyasa');
    await pin(page,'45-minute Vinyasa');
    expect(await sessions(page)).toHaveLength(0);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.bottom-nav [data-nav="day"]').click();
    await expect(page.locator('[data-p2-favorite]')).toContainText('45-minute Vinyasa');
    await page.locator('[data-p2-favorite]').click();
    await expect(page.locator('[data-p2-field="mobility.duration"]')).toHaveValue('45');
    await expect(page.locator('[data-p2-field="mobility.style"]')).toHaveValue('Vinyasa');
    await page.locator('[data-p2-field="mobility.duration"]').fill('48');
    await page.locator('[data-p2-confirm-copy]').check();
    await page.locator('[data-p2-finish]').click();
    await expect(page.locator('[data-p2-commit]')).toBeVisible();
    expect(await sessions(page)).toHaveLength(0);
    await page.locator('[data-p2-commit]').click();
    const result=(await sessions(page)).filter(s=>s.type==='mobility');
    expect(result).toHaveLength(1);
    expect(result[0].activity).toBe('Yoga');
    expect(result[0].duration).toBe(48);
    expect(result[0].style).toBe('Vinyasa');
  });
  test('Cycling favorite respects no-timer selection and saves once, even after duplicate taps',async({page})=>{
    await fresh(page);await choose(page,'cardio','Cycling','free');
    await page.locator('[data-p2-field="cardio.duration"]').fill('32');
    await page.locator('[data-p2-field="cardio.distance"]').fill('8.5');
    await pin(page,'Evening ride');
    await page.locator('[data-p2-favorite]').click();
    await page.locator('[data-p2-change-mode="free"]').click();
    await expect(page.locator('[data-p2-change-mode="free"]')).toHaveClass(/active/);
    await expect(page.locator('[data-p2-field="cardio.distance"]')).toHaveValue('8.5');
    // Log As I Go supports multiple completed activities: explicitly add the current one.
    await page.locator('[data-p2-add-activity]').click();
    await expect(page.locator('.ls-p2-source')).toContainText('Cycling');
    await page.locator('[data-p2-finish]').click();
    await expect(page.locator('[data-p2-commit]')).toBeVisible();
    await page.evaluate(()=>{const button=document.querySelector('[data-p2-commit]');button.click();button.click();});
    const result=(await sessions(page)).filter(s=>s.type==='cardio');
    expect(result).toHaveLength(1);
    expect([result[0].activity,result[0].duration,result[0].distance]).toEqual(['Cycling',32,8.5]);
  });
  test('Dismissing history suggestion pin does not alter saved favorites or history',async({page})=>{
    await fresh(page);await choose(page,'cardio','Treadmill');
    await page.locator('[data-p2-field="cardio.duration"]').fill('30');
    await page.locator('[data-p2-finish]').click();
    await page.locator('[data-p2-commit]').click();
    const history=await sessions(page);
    await page.locator('[data-p2-suggest-toggle]').click();
    await expect(page.locator('[data-p2-suggestion]')).toHaveCount(1);
    const initial=await db(page);
    page.once('dialog',d=>d.dismiss());
    await page.locator('[data-p2-suggestion]').click();
    const final=await db(page);
    expect(final.p2Presets||[]).toEqual(initial.p2Presets||[]);
    expect(await sessions(page)).toEqual(history);
    await expect(page.locator('[data-p2-favorite]')).toHaveCount(0);
  });
});
// Reuse the established regression assertions against this workflow's live URL.
// Playwright creates a new disposable browser context for every test.
require('./p1.smartlog.spec.js');
require('./p1.exhaustive.spec.js');
require('./lastset.production.spec.js');
require('./p2.profile-confirmation.spec.js');
require('./p2.evening-quicklog.spec.js');

test('Live offline save retains the exact record after reconnect and reload', async ({page, context, browserName}) => {
  await fresh(page);
  await choose(page, 'cardio', 'Cycling');
  await page.locator('[data-p2-field="cardio.duration"]').fill('27');
  await page.locator('[data-p2-field="cardio.distance"]').fill('7.25');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  try {
    await page.locator('[data-p2-finish]').click();
    expect(await sessions(page)).toHaveLength(0);
    await page.locator('[data-p2-commit]').click();
    const saved = await sessions(page);
    expect(saved).toHaveLength(1);
    expect([saved[0].type, saved[0].duration, saved[0].distance]).toEqual(['cardio', 27, 7.25]);
    // Chromium supports offline service-worker navigation. WebKit's network
    // emulation limitation is covered separately by the server-stop test.
    if (browserName === 'chromium') {
      await page.reload({waitUntil:'domcontentloaded'});
      await expect(page.locator('.bottom-nav')).toBeVisible();
      expect(await sessions(page)).toEqual(saved);
    }
    await context.setOffline(false);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.bottom-nav')).toBeVisible();
    expect(await sessions(page)).toEqual(saved);
  } finally {
    await context.setOffline(false);
  }
});
