const {test,expect}=require('@playwright/test');
const DATA='lastset-data-v1',REGISTRY='lastset-user-spaces-v1';
async function fresh(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()});
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#ls-onboard-name')).toBeVisible();
  await page.locator('#ls-onboard-name').fill('Profile Notice QA');
  await page.locator('[data-onboard-save]').click();
  await expect(page.locator('.ls-onboard-finish')).toBeVisible();
  await page.locator('[data-start="day"]').click();
  await page.locator('.bottom-nav [data-nav="profile"]').click();
  await expect(page.locator('[data-action="save-profile"]')).toBeVisible();
}
async function stored(page){
  return page.evaluate(({data,registry})=>{
    const d=JSON.parse(localStorage.getItem(data));
    const r=JSON.parse(localStorage.getItem(registry));
    return {data:d,active:r.users.find(u=>u.id===r.activeId)};
  },{data:DATA,registry:REGISTRY});
}
test.describe('P2 profile confirmation and persistence',()=>{
  test('@critical older notification cannot dismiss a newer confirmed profile save',async({page})=>{
    await fresh(page);
    await page.evaluate(()=>showToast('Earlier event'));
    await page.waitForTimeout(1100);
    await page.locator('#profile-name').fill('Alpha QA');
    await page.locator('#profile-weight-unit').selectOption('lb');
    await page.locator('[data-action="save-profile"]').click();
    await expect(page.locator('.toast')).toContainText('Profile saved');
    await page.waitForTimeout(2100);
    await expect(page.locator('.toast')).toContainText('Profile saved');
    const snapshot=await stored(page);
    expect(snapshot.data.profile.name).toBe('Alpha QA');
    expect(snapshot.data.profile.weightUnit).toBe('lb');
    expect(snapshot.active.data.profile.weightUnit).toBe('lb');
    await page.reload({waitUntil:'domcontentloaded'});
    const recovered=await stored(page);
    expect(recovered.data.profile.name).toBe('Alpha QA');
    expect(recovered.data.profile.weightUnit).toBe('lb');
    expect(recovered.active.data.profile.weightUnit).toBe('lb');
  });
  test('rapid consecutive saves persist only the latest values and keep latest notification',async({page})=>{
    await fresh(page);
    await page.locator('#profile-name').fill('First QA');
    await page.locator('[data-action="save-profile"]').click();
    await expect(page.locator('.toast')).toContainText('Profile saved');
    await page.waitForTimeout(1100);
    await page.locator('#profile-name').fill('Second QA');
    await page.locator('#profile-weight-unit').selectOption('lb');
    await page.locator('[data-action="save-profile"]').click();
    await page.waitForTimeout(2100);
    await expect(page.locator('.toast')).toContainText('Profile saved');
    const result=await stored(page);
    expect(result.data.profile.name).toBe('Second QA');
    expect(result.data.profile.weightUnit).toBe('lb');
    await page.reload({waitUntil:'domcontentloaded'});
    const persisted=await stored(page);
    expect(persisted.data.profile.name).toBe('Second QA');
    expect(persisted.data.profile.weightUnit).toBe('lb');
    expect(persisted.active.data.profile.weightUnit).toBe('lb');
  });
  test('@critical failed profile storage never displays saved success or corrupts durable data',async({page})=>{
    await fresh(page);
    const before=await stored(page);
    await page.locator('#profile-name').fill('Not Persisted');
    await page.evaluate(()=>{
      window.__profileOriginalSetItem=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key==='lastset-data-v1')throw new DOMException('Injected quota failure','QuotaExceededError');
        return window.__profileOriginalSetItem.call(this,key,value);
      };
    });
    await page.locator('[data-action="save-profile"]').click();
    await expect(page.locator('.toast').filter({hasText:'Profile saved'})).toHaveCount(0);
    await expect(page.locator('#ls-save-failure')).toBeVisible();
    await page.evaluate(()=>{Storage.prototype.setItem=window.__profileOriginalSetItem});
    const after=await stored(page);
    expect(after.data.sessions).toEqual(before.data.sessions);
    expect(after.active.data.sessions).toEqual(before.active.data.sessions);
    await page.reload({waitUntil:'domcontentloaded'});
    const recovered=await stored(page);
    expect(recovered.data.profile.name).toBe(before.data.profile.name);
    expect(recovered.active.data.profile.name).toBe(before.active.data.profile.name);
  });
});
