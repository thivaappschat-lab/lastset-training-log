const {test,expect}=require('@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const KEY='lastset-data-v1',USERS='lastset-user-spaces-v1';
async function fresh(page,url='/'){
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#ls-onboard-name')).toBeVisible();
  await page.locator('#ls-onboard-name').fill('P0 QA');
  await page.locator('[data-onboard-save]').click();
  await expect(page.locator('.ls-onboard-finish')).toBeVisible();
  await page.locator('[data-start="day"]').click();
  await expect(page.locator('.bottom-nav')).toBeVisible();
}
async function stored(page,key=KEY){
  return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
}
test.describe('Phase 0 local-first data trust',()=>{
  test('three progressive manual sets survive reload unchanged',async({page})=>{
    await fresh(page);
    await page.locator('[data-day-action="resistance"]').first().evaluate(el=>el.click());
    await expect(page.locator('#exercise-search')).toBeVisible();
    await page.locator('[data-exercise="chest-press"]').click();
    await expect(page.locator('[data-set-weight="0"]')).toBeVisible();
    await page.locator('[data-set-weight="0"]').fill('80');
    await page.locator('[data-set-reps="0"]').fill('8');
    await page.locator('[data-action="add-set"]').click();
    await page.locator('[data-set-weight="1"]').fill('85');
    await page.locator('[data-set-reps="1"]').fill('6');
    await page.locator('[data-action="add-set"]').click();
    await page.locator('[data-set-weight="2"]').fill('85');
    await page.locator('[data-set-reps="2"]').fill('5');
    await page.locator('[data-action="save-exercise"]').click();
    await page.waitForFunction(key=>Object.values(JSON.parse(localStorage.getItem(key)||'{}').sessions||{}).flat().some(s=>s.type==='resistance'),KEY);
    const original=await stored(page);
    const session=Object.values(original.sessions).flat().find(s=>s.type==='resistance');
    expect(session.exercises[0].sets.map(s=>[Number(s.weight),Number(s.reps)])).toEqual([[80,8],[85,6],[85,5]]);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.bottom-nav')).toBeVisible();
    const reopened=await stored(page);
    expect(reopened.sessions).toEqual(original.sessions);
    const reg=await stored(page,USERS);
    const active=reg.users.find(u=>u.id===reg.activeId);
    expect(active.data.sessions).toEqual(original.sessions);
  });
  test('backup restores into new profile without overwriting newer workouts',async({page})=>{
    await fresh(page);
    const before=await stored(page);
    const backup={sessions:{'2026-10-01':[{type:'resistance',exercises:[{exerciseId:'chest-press',sets:[{weight:80,reps:8},{weight:85,reps:6},{weight:85,reps:5}]}]}]},profile:{name:'Recovered Lifter',weightUnit:'kg'},templates:[{id:'push',name:'Push Day',exerciseIds:['chest-press']}]};
    await page.locator('.bottom-nav [data-nav="profile"]').click();
    await expect(page.locator('[data-backup-input]')).toHaveCount(1);
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('[data-backup-input]').setInputFiles({name:'my-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await expect.poll(async()=>{const r=await stored(page,USERS);return r.users.filter(u=>u.name==='Recovered Lifter').length;}).toBe(1);
    const current=await stored(page);
    expect(current.sessions).toEqual(before.sessions);
    const reg=await stored(page,USERS);
    expect(reg.activeId).toBe(before.profile.userId);
    expect(reg.users.find(u=>u.name==='Recovered Lifter').data.sessions).toEqual(backup.sessions);
    await page.reload();
    expect((await stored(page,USERS)).users.find(u=>u.name==='Recovered Lifter')).toBeTruthy();
    await page.locator('.bottom-nav [data-nav="profile"]').click();
    await page.locator('[data-backup-input]').setInputFiles({name:'damaged.json',mimeType:'application/json',buffer:Buffer.from('{"sessions":{"oops":[null]}}')});
    await page.waitForTimeout(100);
    expect((await stored(page,USERS)).users.length).toBe(reg.users.length);
    expect((await stored(page)).sessions).toEqual(before.sessions);
  });
  test('offline reload keeps confirmed training records intact',async({page})=>{
    // A slow WebKit registration is bounded, but offline and data checks must still run.
    test.setTimeout(120_000);
    // WebKit's Playwright context.setOffline can reject a service-worker
    // response even if it contains literal cached HTML (Playwright #42775).
    // Use a dedicated origin instead. Stopping it exercises a genuine failed
    // network fetch and the service worker's cached fallback on both engines.
    const root=path.resolve('dist');
    const server=http.createServer((req,res)=>{
      try{
        const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const full=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
        if(!full.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
        fs.readFile(full,(err,bytes)=>{
          if(err){res.writeHead(404).end();return;}
          const ext=path.extname(full).toLowerCase();
          const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json'};
          res.writeHead(200,{'content-type':types[ext]||'application/octet-stream'});
          res.end(bytes);
        });
      }catch(_){res.writeHead(400).end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let stopped=false;
    try{
      await fresh(page,'http://127.0.0.1:'+server.address().port+'/');
      await page.locator('[data-day-action="resistance"]').first().evaluate(el=>el.click());
      await page.locator('[data-exercise="chest-press"]').click();
      await page.locator('[data-set-weight="0"]').fill('80');
      await page.locator('[data-set-reps="0"]').fill('8');
      await page.locator('[data-action="save-exercise"]').click();
      const before=await stored(page);
      // Loopback is a secure context. Start registration without making the
      // Playwright evaluation wait indefinitely for WebKit's SW.ready promise.
      // Never treat the registration request as proof of offline readiness.
      await page.evaluate(()=>{
        window.__p0SwProbe={phase:'registering',error:null,startedAt:Date.now()};
        navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'})
          .then(reg=>{
            window.__p0SwProbe.phase='registered';
            window.__p0SwProbe.scope=reg.scope;
          }).catch(error=>{
            window.__p0SwProbe.phase='failed';
            window.__p0SwProbe.error=String(error);
          });
      });
      const serviceWorkerState=async()=>page.evaluate(async()=>{
        const probe=window.__p0SwProbe||{};
        const registration=await Promise.race([
          navigator.serviceWorker.getRegistration(),
          new Promise(resolve=>setTimeout(()=>resolve(null),2500))
        ]);
        return {phase:probe.phase||'unknown',error:probe.error||null,
          active:registration?.active?.state||null,
          installing:registration?.installing?.state||null,
          waiting:registration?.waiting?.state||null,
          controller:Boolean(navigator.serviceWorker.controller)};
      });
      try {
        await expect.poll(async()=>{
          const status=await serviceWorkerState();
          if(status.error)throw new Error('Service worker registration failed: '+status.error);
          return status.active;
        },{timeout:45000,intervals:[300,700,1000,2000]}).toBe('activated');
      } catch(error) {
        console.log('P0 service worker activation diagnostic:',JSON.stringify(await serviceWorkerState().catch(e=>({diagnosticError:String(e)}))));
        throw error;
      }
      await page.waitForFunction(async()=>{
        if(!navigator.serviceWorker)return false;
        const keys=await caches.keys();
        if(!keys.some(key=>key.startsWith('lastset-v1-beta1')))return false;
        return !!(await caches.match(new URL('/index.html',location.origin).href));
      },null,{timeout:30000});
      await page.reload({waitUntil:'domcontentloaded'});
      await expect(page.locator('.bottom-nav')).toBeVisible();
      const swStatus=await page.evaluate(async()=>{
        const reg=await navigator.serviceWorker?.getRegistration();
        return {origin:location.origin,controller:navigator.serviceWorker?.controller?.scriptURL||null,
          scope:reg?.scope||null,active:reg?.active?.state||null,
          waiting:reg?.waiting?.state||null,installing:reg?.installing?.state||null};
      });
      console.log('P0 service-worker preflight:',JSON.stringify(swStatus));
      await page.waitForFunction(()=>Boolean(navigator.serviceWorker?.controller),null,{timeout:12000});
      await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
      stopped=true;
      await page.reload({waitUntil:'domcontentloaded',timeout:20000});
      await expect(page.locator('.bottom-nav')).toBeVisible({timeout:10000});
      expect((await stored(page)).sessions).toEqual(before.sessions);
    }finally{
      if(!stopped)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    }
  });
  test('quota failure shows emergency backup and does not claim the workout saved',async({page})=>{
    await fresh(page);
    const before=await stored(page);
    await page.locator('[data-day-action="resistance"]').first().evaluate(el=>el.click());
    await page.locator('[data-exercise="chest-press"]').click();
    await page.locator('[data-set-weight="0"]').fill('80');
    await page.locator('[data-set-reps="0"]').fill('8');
    await page.evaluate(()=>{
      const orig=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key==='lastset-data-v1'||key==='lastset-user-spaces-v1')throw new DOMException('Quota exceeded','QuotaExceededError');
        return orig.call(this,key,value);
      };
    });
    await page.locator('[data-action="save-exercise"]').click();
    await expect(page.locator('#ls-save-failure')).toBeVisible();
    await expect(page.locator('#ls-save-failure')).toContainText('Workout NOT saved');
    const after=await stored(page);
    expect(after.sessions).toEqual(before.sessions);
  });
});
