const {test,expect}=require('@playwright/test');

const ENDPOINT='https://lastset-telemetry.thiva-claimflow.workers.dev';
test('opt-in monitoring from disposable live browser is consent gated, writes only anonymous events, and supports removal',async({page})=>{
  // Explicitly bypass QA suppression ONLY to verify an opted-in throwaway
  // installation, then delete its remote pseudonym. No workout is created.
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'webdriver',{configurable:true,get:()=>false});
  });
  const tracked=[];
  page.on('request',r=>{if(r.url().startsWith(ENDPOINT))tracked.push(r.url());});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#ls-monitor-privacy-control')).toBeAttached({timeout:20000});
  await expect(page.locator('#ls-monitor-privacy-control')).toContainText('off');
  expect(tracked).toHaveLength(0);
  expect(await page.evaluate(()=>localStorage.getItem('lastset-monitor-install-v1'))).toBeNull();

  await page.evaluate(()=>document.querySelector('#ls-monitor-privacy-control').click());
  await expect(page.locator('[data-monitor-enable]')).toBeAttached();
  const posted=page.waitForResponse(r=>r.url()===ENDPOINT+'/v1/event'&&r.request().method()==='POST',{timeout:20000});
  await page.evaluate(()=>document.querySelector('[data-monitor-enable]').click());
  const result=await posted;
  expect(result.status()).toBe(202);
  expect(await page.evaluate(()=>window.LastSetMonitoring.isEnabled())).toBe(true);
  expect(await page.evaluate(()=>localStorage.getItem('lastset-monitor-consent-v1'))).toBe('yes');
  const json=result.request().postDataJSON();
  expect(Object.keys(json).sort()).toEqual(['installationId','platform','schema','type','version'].sort());
  expect(json.type).toBe('app_open');
  expect(json.installationId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(JSON.stringify(json)).not.toMatch(/email|reps|weight|profile|exercise|workout/i);

  await page.evaluate(()=>document.querySelector('#ls-monitor-privacy-control').click());
  const deletion=page.waitForResponse(r=>r.url()===ENDPOINT+'/v1/installation'&&r.request().method()==='DELETE',{timeout:20000});
  await page.evaluate(()=>document.querySelector('[data-monitor-disable]').click());
  const deleted=await deletion;
  expect(deleted.status()).toBe(202);
  expect(await page.evaluate(()=>window.LastSetMonitoring.isEnabled())).toBe(false);
  expect(await page.evaluate(()=>localStorage.getItem('lastset-monitor-install-v1'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('lastset-monitor-consent-v1'))).toBe('no');
  const calls=tracked.length;
  await page.evaluate(()=>window.LastSetMonitoring.record('save_failure'));
  expect(tracked.length).toBe(calls);
});
