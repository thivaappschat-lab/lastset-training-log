const { test, expect } = require('@playwright/test');

const DATA_KEY = 'lastset-data-v1';
const USERS_KEY = 'lastset-user-spaces-v1';

async function resetToOnboarding(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    // Every Playwright test uses an isolated new browser context. Clearing
    // CacheStorage and unregistering while the worker is installing can leave
    // WebKit controlled by an old worker with an empty offline cache.
    // Reset user data only; let the service worker complete its installation.
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ls-onboard-screen')).toBeVisible();
  await expect(page.locator('#ls-onboard-name')).toBeVisible();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
}

async function completeOnboarding(page, name = 'QA Primary') {
  await page.locator('#ls-onboard-name').fill(name);
  await page.locator('#ls-onboard-unit').selectOption('kg');
  await page.locator('[data-onboard-save]').click();
  await expect(page.locator('.ls-onboard-finish')).toBeVisible();
  await page.locator('[data-start="day"]').click();
  await expect(page.locator('.bottom-nav')).toBeVisible();
  await expect(page.locator('[data-nav="day"]')).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.lastsetNavigation === '0.14.1');
}

async function cleanStart(page) {
  await resetToOnboarding(page);
  await completeOnboarding(page);
}

async function storedData(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, DATA_KEY);
}

async function registryData(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, USERS_KEY);
}

async function waitForSessionType(page, type) {
  await page.waitForFunction(({ key, type }) => {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : null;
      return Object.values(data?.sessions || {}).flat().some((session) => session?.type === type);
    } catch (_) {
      return false;
    }
  }, { key: DATA_KEY, type });
}

async function todayIso(page) {
  return page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}


// P2 exposes one public Today chooser. These legacy checks intentionally
// exercise the retained P1 engine without rendering duplicate public controls.
async function legacyDayAction(page,action){
  await page.locator('[data-day-action="'+action+'"]').first().evaluate(el=>el.click());
}
async function openSmartQuick(page){
  await page.locator('[data-p2-entry="smart"]').click();
  await page.locator('[data-p2-mode="quick"]').click();
  await page.locator('[data-p2-blank]').click();
}

async function goToday(page) {
  await page.locator('[data-nav="day"]').click();
  await expect(page.locator('[data-p2-entry="resistance"]')).toBeVisible();
}

async function goProfile(page) {
  await page.locator('.bottom-nav [data-nav="profile"]').click();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
}

async function openExercise(page, exerciseId) {
  await goToday(page);
  await legacyDayAction(page,'resistance');
  await expect(page.locator('#exercise-search')).toBeVisible();
  await page.locator(`[data-exercise="${exerciseId}"]`).click();
  await expect(page.locator('[data-action="save-exercise"]')).toBeVisible();
}

async function logExternalExercise(page, exerciseId, weight, reps) {
  await openExercise(page, exerciseId);
  await page.locator('[data-set-weight="0"]').fill(String(weight));
  await page.locator('[data-set-reps="0"]').fill(String(reps));
  await page.locator('[data-action="save-exercise"]').click();
  await waitForSessionType(page, 'resistance');
  await expect(page.locator('[data-p2-entry="smart"]')).toBeVisible();
}

async function createUserKeepingCurrent(page, name) {
  await goProfile(page);
  await page.locator('[data-profile-manage-users]').click();
  await expect(page.locator('[data-user-new]')).toBeVisible();
  await page.locator('[data-user-new]').click();
  await expect(page.locator('#ls-new-profile-name')).toBeVisible();
  await page.locator('#ls-new-profile-name').fill(name);
  await page.locator('[data-v14-create-user]').click();
  await expect(page.locator('.ls-onboard-finish')).toBeVisible();
  await page.locator('[data-start="day"]').click();
  await expect(page.locator('[data-nav="day"]')).toBeVisible();
}

async function switchUser(page, name) {
  await goProfile(page);
  await page.locator('[data-profile-manage-users]').click();
  const row = page.locator('.ls-user-row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.locator('[data-user-switch]').click();
  await expect(page.locator('[data-nav="day"]')).toBeVisible();
}

async function saveProfileValues(page, { displayName, bodyWeight, height, gender } = {}) {
  await goProfile(page);
  if (displayName != null) await page.locator('#profile-name').fill(String(displayName));
  if (bodyWeight != null) await page.locator('#profile-bodyweight').fill(String(bodyWeight));
  if (height != null) await page.locator('#profile-height').fill(String(height));
  if (gender != null) await page.locator('#profile-gender').selectOption(gender);
  await page.locator('[data-action="save-profile"]').click();
  await expect(page.locator('.toast')).toContainText('Profile saved');
}

async function runSmartLog(page, text, expectedType) {
  await goToday(page);
  await openSmartQuick(page);
  await expect(page.locator('#ai-text')).toBeVisible();
  await page.locator('#ai-text').fill(text);
  await page.locator('[data-action="parse-ai"]').click();
  await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeVisible({ timeout: 8_000 });
  await page.locator('[data-action="confirm-ai-workout"]').click();
  await waitForSessionType(page, expectedType);
  await expect(page.locator('[data-p2-entry="smart"]')).toBeVisible();
}

test.describe('LastSet production v0.14.0', () => {
  test('Mobility is a visible primary category, while Machine Scan remains hidden',async ({page})=>{
    await goToday(page);
    await expect(page.locator('[data-p2-entry="mobility"]')).toBeVisible();
    await expect(page.locator('[data-p2-entry="mobility"]')).toContainText('Mobility');
    expect(await page.locator('[data-day-action="scan"]').count()).toBe(0);
    await legacyDayAction(page,'mobility');
    await expect(page.locator('[data-mobility-activity="Yoga"]')).toBeVisible();
    await expect(page.locator('[data-mobility-activity="Pilates"]')).toBeVisible();
    await expect(page.locator('[data-mobility-activity="Stretching"]')).toBeVisible();
    await expect(page.locator('[data-mobility-activity="Mobility Drills"]')).toBeVisible();
    await expect(page.locator('[data-mobility-activity="Foam Rolling"]')).toBeVisible();
  });

  test('Yoga saves, edits and tracks as mobility without changing cardio totals',async ({page})=>{
    await goToday(page);
    const today=await todayIso(page);
    await legacyDayAction(page,'mobility');
    await page.locator('[data-mobility-activity="Yoga"]').click();
    await page.locator('#mobility-style').selectOption('Vinyasa');
    await page.locator('#mobility-duration').fill('45');
    await page.locator('#mobility-intensity').selectOption('Moderate');
    await page.locator('#mobility-notes').fill('Felt more flexible');
    await page.locator('[data-action="save-mobility"]').click();
    await expect(page.locator('.ls-mobility-session')).toContainText('Vinyasa');
    let d=await storedData(page);
    const entries=d.sessions?.[today]||[];
    expect(entries.filter(x=>x.type==='mobility')).toHaveLength(1);
    expect(entries.filter(x=>x.type==='cardio')).toHaveLength(0);
    expect(entries.find(x=>x.type==='mobility').duration).toBe(45);
    await page.locator('[data-edit-mobility]').click();
    await expect(page.locator('#mobility-duration')).toHaveValue('45');
    await page.locator('#mobility-duration').fill('50');
    await page.locator('[data-action="save-mobility"]').click();
    d=await storedData(page);
    expect(d.sessions[today].filter(x=>x.type==='mobility')).toHaveLength(1);
    expect(d.sessions[today].find(x=>x.type==='mobility').duration).toBe(50);
    await page.locator('[data-nav="calendar"]').click();
    await expect(page.locator('.ls-mobility-stat')).toContainText('1');
    await page.locator('[data-nav="progress"]').click();
    await expect(page.locator('.ls-mobility-progress-card')).toContainText('50');
  });

  test('Mobility sessions prevent an accidental Rest Day and keep existing training intact',async ({page})=>{
    await goToday(page);
    const before=await storedData(page);
    await legacyDayAction(page,'mobility');
    await page.locator('[data-mobility-activity="Stretching"]').click();
    await page.locator('#mobility-duration').fill('20');
    await page.locator('[data-action="save-mobility"]').click();
    await page.locator('[data-p2-mark-rest]').click();
    await expect(page.locator('.toast')).toContainText('Training is already logged');
    const d=await storedData(page);
    expect(Object.values(d.sessions||{}).flat().some(x=>x.type==='rest')).toBeFalsy();
    expect(d.profile).toEqual(before.profile);
    expect(d.sessions).toBeTruthy();
  });

  test('Smart Log identifies yoga and asks for missing session duration',async ({page})=>{
    await goToday(page);
    await openSmartQuick(page);
    await page.locator('#ai-text').fill('Did Vinyasa yoga this morning');
    await page.locator('[data-action="parse-ai"]').click();
    await expect(page.locator('.ls-mobility-preview')).toBeVisible();
    await expect(page.locator('#ai-correction')).toBeVisible();
    await page.locator('#ai-correction').fill('45 minutes');
    await page.locator('[data-action="smart-reply"]').click();
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeVisible();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    await expect(page.locator('.ls-mobility-session')).toContainText('45 min');
    const d=await storedData(page);
    expect(Object.values(d.sessions||{}).flat().filter(x=>x.type==='mobility')).toHaveLength(1);
    expect(Object.values(d.sessions||{}).flat().filter(x=>x.type==='cardio')).toHaveLength(0);
  });


  test.beforeEach(async ({ page }) => {
    await cleanStart(page);
  });

  test('fresh install is blocked until a profile is saved', async ({ page }) => {
    await resetToOnboarding(page);
    await expect(page.getByRole('heading', { name: 'Your training starts with you.' })).toBeVisible();
    await expect(page.locator('.bottom-nav')).toHaveCount(0);

    await completeOnboarding(page, 'Onboarding QA');
    const data = await storedData(page);
    expect(data.profile?.name).toBe('Onboarding QA');
    expect(data.profile?.onboardingComplete).toBe(true);
    await expect(page.locator('.bottom-nav')).toBeVisible();
  });

  test('fresh browser data is clean and Today is a top level destination without Back', async ({ page }) => {
    let data = await storedData(page);
    expect(data).toBeTruthy();
    expect(Object.keys(data.sessions || {})).toHaveLength(0);

    await goToday(page);
    await expect(page.locator('[data-nav="day"]')).toHaveClass(/active/);
    await expect(page.locator('[data-action="back"]')).toHaveCount(0);

    data = await storedData(page);
    expect(Object.keys(data.sessions || {})).toHaveLength(0);
  });

  test('Calendar to today uses genuine app Back and returns to Calendar', async ({ page }) => {
    await page.locator('[data-nav="calendar"]').click();
    await expect(page.locator('.calendar-grid')).toBeVisible();

    const iso = await todayIso(page);
    await page.locator(`[data-date="${iso}"]`).click();
    await expect(page.locator('[data-action="back"]')).toBeVisible();

    await page.locator('[data-action="back"]').click();
    await expect(page.locator('.calendar-grid')).toBeVisible();
    await expect(page.locator('[data-nav="calendar"]')).toHaveClass(/active/);
  });

  test('nested Calendar workout navigation unwinds day by day', async ({ page }) => {
    await page.locator('[data-nav="calendar"]').click();
    const iso = await todayIso(page);
    await page.locator(`[data-date="${iso}"]`).click();

    await legacyDayAction(page,'resistance');
    await expect(page.locator('#exercise-search')).toBeVisible();
    await page.locator('[data-exercise="chest-press"]').click();
    await expect(page.locator('[data-action="save-exercise"]')).toBeVisible();

    await page.locator('[data-action="back"]').click();
    await expect(page.locator('#exercise-search')).toBeVisible();

    await page.locator('[data-action="back"]').click();
    await expect(page.locator('[data-p2-entry="resistance"]')).toBeVisible();

    await page.locator('[data-action="back"]').click();
    await expect(page.locator('.calendar-grid')).toBeVisible();
  });

  test('top right profile shortcut opens Profile directly', async ({ page }) => {
    await expect(page.locator('.ls-user-chip')).toBeVisible();
    await page.locator('.ls-user-chip').click();
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.locator('[data-action="back"]')).toHaveCount(0);
  });


  test('Premium anatomy atlas has clickable front and back muscle regions', async ({ page }) => {
    await page.locator('[data-nav="explore"]').click();
    await expect(page.locator('.ls-anatomy-premium.male')).toBeVisible();
    await expect(page.locator('.ls-anatomy-premium [data-explore-group="Chest"]')).toHaveCount(1);
    await expect(page.locator('.ls-anatomy-premium .ls-atlas-segment').first()).toBeVisible();
    await page.locator('.ls-anatomy-premium .ls-atlas-hit[data-anatomy-region="Mid Chest"]').first().click();
    await expect(page.locator('[data-explore-region="Upper Chest"]')).toBeVisible();
    await expect(page.locator('.ls-anatomy-premium [data-explore-group="Chest"]')).toHaveAttribute('aria-pressed','true');
    await page.locator('[data-explore-side="back"]').click();
    await expect(page.locator('.ls-anatomy-premium [data-explore-group="Back"]')).toHaveCount(1);
    await page.locator('.ls-anatomy-premium .ls-atlas-hit[data-anatomy-region="Lats"]').first().click();
    await expect(page.locator('[data-explore-region="Lats"]')).toBeVisible();
    await expect(page.locator('.ls-anatomy-premium [data-explore-group="Back"]')).toHaveAttribute('aria-pressed','true');
  });

  test('Atlas uses source pixel coordinates and distinct selectable vs selected colors', async ({ page }) => {
    await page.locator('[data-nav="explore"]').click();
    const svg=page.locator('.ls-anatomy-premium.male');
    await expect(svg).toHaveAttribute('viewBox','0 0 929 1693');
    const front=await page.request.get('/assets/anatomy-male-front.webp');
    expect(front.status()).toBe(200);
    expect((await front.body()).byteLength).toBeGreaterThan(16000);

    const defaultVisual=svg.locator('.ls-atlas-visual').first();
    await expect(defaultVisual).toBeVisible();
    const purple=await defaultVisual.evaluate(el=>getComputedStyle(el).fill);
    await page.locator('.ls-atlas-hit[data-anatomy-region="Quads"]').first().click();
    await expect(svg.locator('.ls-region-selected').first()).toBeVisible();
    const lime=await svg.locator('.ls-region-selected').first().evaluate(el=>getComputedStyle(el).fill);
    expect(lime).not.toEqual(purple);
    await page.locator('[data-explore-side="back"]').click();
    await expect(page.locator('.ls-anatomy-premium.male')).toHaveAttribute('viewBox','0 0 929 1693');
  });


  test('Normal muscle selections and atlas thumbnails match the selected view', async ({page}) => {
    await page.locator('[data-nav="explore"]').click();
    await expect(page.locator('.ls-anatomy-front [data-anatomy-region="Triceps"]')).toHaveCount(0);
    await page.locator('.ls-atlas-hit[data-anatomy-region="Mid Chest"]').first().click();
    await expect(page.locator('[data-explore-region="Normal"]')).toBeVisible();
    await page.locator('[data-explore-region="Normal"]').click();
    await expect(page.locator('[data-explore-exercise="incline-cable-fly"]')).toBeVisible();
    const thumbnail=page.locator('.ls-thumb-atlas svg').first();
    await expect(thumbnail).toBeVisible();
    expect(await thumbnail.locator('image').getAttribute('href')).toContain('anatomy-male-front.webp');
    await page.locator('[data-explore-close]').click();
    await page.locator('.ls-atlas-hit[data-anatomy-region="Biceps"]').first().click();
    await expect(page.locator('[data-explore-subregion="Normal"]')).toBeVisible();
    await page.locator('[data-explore-subregion="Normal"]').click();
    await expect(page.locator('[data-explore-exercise="standing-barbell-curl"]')).toBeVisible();
    await page.locator('[data-explore-side="back"]').click();
    await expect(page.locator('.ls-anatomy-back [data-anatomy-region="Biceps"]')).toHaveCount(0);
    await page.locator('.ls-atlas-hit[data-anatomy-region="Triceps"]').first().click();
    await expect(page.locator('[data-explore-subregion="Normal"]')).toBeVisible();
  });

  test('Biceps offers only biceps heads with selectable specialist overlay and inline panel', async ({ page }) => {
    await page.locator('[data-nav="explore"]').click();
    await page.locator('.ls-atlas-hit[data-anatomy-region="Biceps"]').first().click();
    const panel=page.locator('.ls-explore-sheet');
    await expect(panel.locator('.ls-sheet-head strong')).toHaveText('Biceps');
    for(const s of ['Long Head','Short Head','Brachialis'])await expect(panel.locator('[data-explore-subregion="'+s+'"]')).toBeVisible();
    await expect(panel.locator('[data-explore-region="Triceps"]')).toHaveCount(0);
    await expect(panel.locator('[data-explore-region="Forearms"]')).toHaveCount(0);
    const position=await page.evaluate(()=>{
      const stage=document.querySelector('.ls-anatomy-stage').getBoundingClientRect();
      const p=document.querySelector('.ls-explore-sheet').getBoundingClientRect();
      return {gap:p.top-stage.bottom,position:getComputedStyle(document.querySelector('.ls-explore-sheet')).position};
    });
    expect(position.position).not.toBe('fixed');
    expect(position.gap).toBeGreaterThan(0);
    await panel.locator('[data-explore-subregion="Long Head"]').click();
    await expect(page.locator('.ls-specialist-visual.ls-region-selected')).toHaveCount(2);
    await expect(page.locator('[data-explore-exercise="incline-biceps-curl"]')).toBeVisible();
  });

  test('Triceps offers long lateral medial heads and specialist back selection', async ({ page }) => {
    await page.locator('[data-nav="explore"]').click();
    await expect(page.locator('.ls-anatomy-premium.ls-anatomy-front [data-anatomy-region="Triceps"]')).toHaveCount(0);
    await page.locator('[data-explore-side="back"]').click();
    await expect(page.locator('.ls-anatomy-premium.ls-anatomy-back [data-anatomy-region="Biceps"]')).toHaveCount(0);
    await page.locator('.ls-atlas-hit[data-anatomy-region="Triceps"]').first().click();
    await expect(page.locator('.ls-anatomy-premium.ls-anatomy-back')).toBeVisible();
    const panel=page.locator('.ls-explore-sheet');
    for(const s of ['Long Head','Lateral Head','Medial Head'])await expect(panel.locator('[data-explore-subregion="'+s+'"]')).toBeVisible();
    await panel.locator('[data-explore-subregion="Medial Head"]').click();
    await expect(page.locator('.ls-specialist-visual.ls-region-selected')).toHaveCount(2);
    await expect(page.locator('[data-explore-exercise="reverse-grip-triceps-pushdown"]')).toBeVisible();
  });




  test('Approved male native-resolution anatomy renders and retains muscle drilldown', async ({page}) => {
    await page.locator('[data-nav="explore"]').click();
    const atlas=page.locator('.ls-anatomy-premium.male');
    for(const side of ['front','back']){
      await page.locator('[data-explore-side="'+side+'"]').click();
      await expect(atlas).toHaveAttribute('viewBox','0 0 929 1693');
      await expect(atlas.locator('.ls-male-photo')).toBeVisible();
      const photo=await page.evaluate(async side=>{
        const im=new Image();
        im.src='/assets/anatomy-male-'+side+'.webp?v=approved0280';
        await im.decode();
        const cv=document.createElement('canvas');cv.width=40;cv.height=40;
        const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0,40,40);
        return {width:im.naturalWidth,height:im.naturalHeight,alpha:ctx.getImageData(0,0,1,1).data[3]};
      },side);
      expect(photo.width).toBe(929);
      expect(photo.height).toBe(1693);
      expect(photo.alpha).toBeLessThanOrEqual(3);
    }
    await page.locator('[data-explore-side="front"]').click();
    await atlas.locator('.ls-atlas-hit[data-anatomy-region="Biceps"]').first().click();
    await page.locator('[data-explore-subregion="Brachialis"]').click();
    await expect(atlas.locator('.ls-specialist-visual.ls-region-selected')).toHaveCount(2);
    await expect(page.locator('[data-focus-kind="primary"] [data-explore-exercise="hammer-curl"]')).toBeVisible();
    await page.locator('[data-explore-close]').click();
    await page.locator('[data-explore-side="back"]').click();
    await atlas.locator('.ls-atlas-hit[data-anatomy-region="Triceps"]').first().click();
    await page.locator('[data-explore-subregion="Long Head"]').click();
    await expect(atlas.locator('.ls-specialist-visual.ls-region-selected')).toHaveCount(2);
  });

  test('Approved female image renders at native resolution with registered muscle highlights', async ({page}) => {
    await page.evaluate(() => {
      const d=JSON.parse(localStorage.getItem('lastset-data-v1')||'{}');
      d.profile=d.profile||{};d.profile.gender='Female';
      localStorage.setItem('lastset-data-v1',JSON.stringify(d));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-nav="explore"]').click();
    const model=page.locator('.ls-anatomy-premium.female');
    for(const side of ['front','back']){
      await page.locator('[data-explore-side="'+side+'"]').click();
      await expect(model).toHaveAttribute('viewBox','0 0 941 1672');
      const photo=page.locator('.ls-female-photo');
      await expect(photo).toBeVisible();
      const result=await page.evaluate(async side=>{
        const im=new Image();im.src='/assets/anatomy-female-'+side+'.webp?v=approved0270';await im.decode();
        const can=document.createElement('canvas');can.width=40;can.height=40;
        const ctx=can.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0,40,40);
        return {width:im.naturalWidth,height:im.naturalHeight,corner:ctx.getImageData(0,0,1,1).data[3]};
      },side);
      expect(result).toEqual({width:941,height:1672,corner:0});
      await expect(model.locator('.ls-atlas-visual').first()).toBeVisible();
    }
    await page.locator('[data-explore-side="front"]').click();
    await model.locator('.ls-atlas-hit[data-anatomy-region="Biceps"]').first().click();
    await page.locator('[data-explore-subregion="Long Head"]').click();
    await expect(model.locator('.ls-specialist-visual.ls-region-selected')).toHaveCount(2);
    await expect(page.locator('[data-focus-kind="primary"] [data-explore-exercise="incline-biceps-curl"]')).toBeVisible();
  });

  test('Female muscle model selects Biceps Long Head and shows primary versus supplementary exercises', async ({ page }) => {
    await page.evaluate(() => {
      const raw=localStorage.getItem('lastset-data-v1');
      const current=raw?JSON.parse(raw):{};
      current.profile=current.profile||{};
      current.profile.gender='Female';
      localStorage.setItem('lastset-data-v1',JSON.stringify(current));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-nav="explore"]').click();
    await expect(page.locator('.ls-anatomy-premium.female')).toBeVisible();
    await page.locator('.ls-anatomy-premium.female [data-anatomy-region="Biceps"]').first().click();
    await expect(page.locator('.ls-sheet-head strong')).toHaveText('Biceps');
    for(const name of ['Long Head','Short Head','Brachialis']){
      await expect(page.locator('[data-explore-subregion="'+name+'"]')).toBeVisible();
    }
    await page.locator('[data-explore-subregion="Long Head"]').click();
    await expect(page.locator('.ls-anatomy-premium.female .ls-specialist-visual.ls-region-selected')).toHaveCount(2);
    await expect(page.locator('[data-focus-kind="primary"]')).toBeVisible();
    await expect(page.locator('[data-focus-kind="supplementary"]')).toBeVisible();
    await expect(page.locator('[data-focus-kind="primary"] [data-explore-exercise="incline-biceps-curl"]')).toBeVisible();
    await expect(page.locator('[data-focus-kind="supplementary"] [data-explore-exercise="incline-biceps-curl"]')).toHaveCount(0);
  });

  test('Female back anatomy provides Triceps Long Head specialist highlighting', async ({ page }) => {
    await page.evaluate(() => {
      const raw=localStorage.getItem('lastset-data-v1');
      const current=raw?JSON.parse(raw):{};
      current.profile=current.profile||{};current.profile.gender='Female';
      localStorage.setItem('lastset-data-v1',JSON.stringify(current));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-nav="explore"]').click();
    await page.locator('[data-explore-side="back"]').click();
    await expect(page.locator('.ls-anatomy-premium.female.ls-anatomy-back')).toBeVisible();
    await page.locator('.ls-anatomy-premium.female [data-anatomy-region="Triceps"]').first().click();
    await page.locator('[data-explore-subregion="Long Head"]').click();
    await expect(page.locator('.ls-anatomy-premium.female .ls-specialist-visual.ls-region-selected')).toHaveCount(2);
    await expect(page.locator('[data-focus-kind="primary"]')).toBeVisible();
    await expect(page.locator('[data-focus-kind="supplementary"]')).toBeVisible();
  });

  test('Brachialis lists Hammer Curl as primary and Biceps as selected label', async ({ page }) => {
    await page.locator('[data-nav="explore"]').click();
    await page.locator('.ls-atlas-hit[data-anatomy-region="Biceps"]').first().click();
    await expect(page.locator('.ls-anatomy-hint')).toContainText('Selected: Biceps');
    await page.locator('[data-explore-subregion="Brachialis"]').click();
    await expect(page.locator('.ls-anatomy-hint')).toContainText('Brachialis');
    await expect(page.locator('[data-focus-kind="primary"] [data-explore-exercise="hammer-curl"]')).toBeVisible();
    await expect(page.locator('[data-focus-kind="supplementary"] [data-explore-exercise]').first()).toBeVisible();
  });

  test('Smart Log after onboarding uses refreshed journal layout', async ({ page }) => {
    await resetToOnboarding(page);
    await page.locator('#ls-onboard-name').fill('New Training User');
    await page.locator('#ls-onboard-unit').selectOption('kg');
    await page.locator('[data-onboard-save]').click();
    await expect(page.locator('.ls-onboard-finish')).toBeVisible();
    await page.locator('[data-start="describe"]').click();
    await expect(page.locator('main.ls-smartlog-screen')).toBeVisible();
    await expect(page.getByRole('heading',{name:'What did you train?'})).toBeVisible();
    await expect(page.locator('[data-action="parse-ai"]')).toBeVisible();
    await expect(page.locator('#ai-text')).toBeVisible();
  });

  test('Front and back 4K atlas assets preserve full body ratios', async ({ page }) => {
    await page.locator('[data-nav="explore"]').click();
    for (const side of ['front','back']) {
      const size=await page.evaluate(async (side)=>{
        const im=new Image();
        im.src='/assets/anatomy-'+side+'.webp?v=transparent0260';
        await im.decode();
        
        const canvas=document.createElement('canvas');canvas.width=60;canvas.height=60;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(im,0,0,60,60);
        return {
          width:im.naturalWidth,height:im.naturalHeight,
          cornerAlpha:ctx.getImageData(0,0,1,1).data[3],
          bodyAlpha:ctx.getImageData(30,22,1,1).data[3]
        };
      },side);
      expect(size.height).toBe(4096);
      expect(size.width).toBeGreaterThan(2100);
      expect(size.width).toBeLessThan(2450);
      expect(size.cornerAlpha).toBe(0);
      expect(size.bodyAlpha).toBeGreaterThan(190);
    }
  });

  test('Forearm atlas tap opens specific forearm exercises', async ({ page }) => {
    await page.locator('[data-nav="explore"]').click();
    const forearm=page.locator('.ls-anatomy-premium [data-anatomy-region="Forearms"]').first();
    await expect(forearm).toBeVisible();
    await forearm.click();
    await expect(page.locator('.ls-sheet-head strong')).toHaveText('Forearms');
    await expect(page.locator('.ls-explore-has-selection')).toBeVisible();
    await expect(page.locator('[data-explore-subregion="Brachioradialis"]')).toBeVisible();
    await page.locator('[data-explore-subregion="Wrist Flexors"]').click();
    await expect(page.locator('[data-explore-exercise="barbell-wrist-curl"]')).toBeVisible();
    await page.locator('[data-explore-subregion="Wrist Extensors"]').click();
    await expect(page.locator('[data-explore-exercise="reverse-wrist-curl"]')).toBeVisible();
    await expect(page.locator('[data-explore-exercise="barbell-wrist-curl"]')).toHaveCount(0);
    await page.screenshot({path:'test-results/lastset-forearm-'+test.info().project.name+'.png'});
  });

  test('Muscle Explorer filters Upper Chest dumbbell exercises and adds one to Today', async ({ page }) => {
    await page.locator('[data-nav="explore"]').click();
    await expect(page.getByRole('heading', { name: 'Muscle Explorer' })).toBeVisible();
    await expect(page.locator('.ls-anatomy.male')).toBeVisible();

    await page.locator('.ls-anatomy-premium .ls-atlas-hit[data-anatomy-region="Mid Chest"]').first().click();
    await page.locator('[data-explore-region="Upper Chest"]').click();
    await page.locator('[data-explore-equipment="dumbbell"]').click();

    await expect(page.locator('[data-explore-exercise="incline-dumbbell-press"]')).toBeVisible();
    await page.locator('[data-explore-exercise="incline-dumbbell-press"]').click();
    await expect(page.locator('[data-explore-today="incline-dumbbell-press"]')).toBeVisible();
    await page.locator('[data-explore-today="incline-dumbbell-press"]').click();

    const iso = await todayIso(page);
    const data = await storedData(page);
    expect(data.plans?.[iso]?.exerciseIds || []).toContain('incline-dumbbell-press');

    await page.locator('[data-nav="day"]').click();
    await expect(page.locator('.plan-card')).toContainText('Incline Dumbbell Press');
  });

  test('offline cache is installed and the app survives a real offline reload where emulation supports service workers', async ({ page, context, browserName }) => {
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 10_000 });

    // WebKit sometimes reports a controlling service worker before its cache
    // visibility settles. Ask the worker to refresh, then verify real entries.
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      (navigator.serviceWorker.controller || registration.active)?.postMessage({ type: 'LASTSET_WARM_OFFLINE' });
    });

    const expectedCacheState = {
      controlled: true,
      shell: true,
      index: true,
      explore: true,
      offline: true,
      shellHasApp: true
    };
    await expect.poll(async () => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const cacheNames = (await caches.keys()).filter(name => name.startsWith('lastset-v1-beta1-'));
      const shellUrl = new URL('./__lastset_offline_shell__', registration.scope).toString();
      const versions = await Promise.all(cacheNames.map(async name => {
        const cache = await caches.open(name);
        const shell = await cache.match(shellUrl);
        const index = await cache.match('./index.html', { ignoreSearch: true });
        const explore = await cache.match('./lastset-explore.js', { ignoreSearch: true });
        const offline = await cache.match('./lastset-offline.js', { ignoreSearch: true });
        return {
          controlled: Boolean(navigator.serviceWorker.controller),
          shell: Boolean(shell),
          index: Boolean(index),
          explore: Boolean(explore),
          offline: Boolean(offline),
          shellHasApp: shell ? (await shell.clone().text()).includes('LastSet') : false
        };
      }));
      return versions.find(value => value.shell && value.index && value.explore && value.offline) ||
        versions.at(-1) || {
          controlled: Boolean(navigator.serviceWorker.controller),
          shell: false, index: false, explore: false, offline: false, shellHasApp: false
        };
    }), { timeout: 35000, intervals: [500, 1000, 2000, 2000] }).toEqual(expectedCacheState);

    // Playwright WebKit currently rejects service-worker responses after
    // browserContext.setOffline(true), even literal local responses. Its cache
    // presence/control checks above cover WebKit until that upstream issue is fixed.
    if (browserName === 'webkit') {
      await page.locator('[data-nav="explore"]').click();
      await expect(page.getByRole('heading', { name: 'Muscle Explorer' })).toBeVisible();
      return;
    }

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(page.locator('.ls-offline-pill')).toContainText('Offline');

    await page.locator('[data-nav="day"]').click();
    await expect(page.locator('[data-p2-entry="resistance"]')).toBeVisible();

    await page.locator('[data-nav="explore"]').click();
    await expect(page.getByRole('heading', { name: 'Muscle Explorer' })).toBeVisible();

    await page.locator('[data-explore-group="Chest"]').first().click();
    await page.locator('[data-explore-region="Mid Chest"]').click();
    await expect(page.locator('[data-explore-exercise]').first()).toBeVisible();

    await context.setOffline(false);
  });

  test('equipment filters and aliases find the new v0.13.0 exercise variants', async ({ page }) => {
    await goToday(page);
    await legacyDayAction(page,'resistance');

    await page.locator('#equipment-filter').selectOption({ label: 'EZ Bar' });
    await page.locator('#exercise-search').fill('easy curl bar');
    await expect(page.locator('[data-exercise-row="ez-bar-curl"]')).toBeVisible();

    await page.locator('#exercise-search').fill('kb squat');
    await page.locator('#equipment-filter').selectOption({ label: 'Kettlebell' });
    await expect(page.locator('[data-exercise-row="kettlebell-goblet-squat"]')).toBeVisible();

    await page.locator('#exercise-search').fill('band pull up');
    await page.locator('#equipment-filter').selectOption({ label: 'Resistance Band' });
    await expect(page.locator('[data-exercise-row="band-assisted-pull-up"]')).toBeVisible();
  });

  test('negative resistance weight is blocked and does not create history', async ({ page }) => {
    await openExercise(page, 'chest-press');
    await page.locator('[data-set-weight="0"]').fill('-100');
    await page.locator('[data-set-reps="0"]').fill('10');
    await page.locator('[data-action="save-exercise"]').click();

    await expect(page.locator('.toast')).toContainText('Weight looks invalid');
    const data = await storedData(page);
    expect(Object.keys(data.sessions || {})).toHaveLength(0);
  });

  test('Smart Log ignores rest 120 sec as a load and records bench 80 kg 3x5', async ({ page }) => {
    await runSmartLog(page, 'Bench press 80kg 3x5 rest 120 sec', 'resistance');

    const data = await storedData(page);
    const sessions = Object.values(data.sessions || {}).flat();
    const resistance = sessions.find((s) => s.type === 'resistance');
    expect(resistance).toBeTruthy();

    const item = resistance.exercises.find((e) => /bench/i.test(e.name || '') || /bench/.test(e.exerciseId || ''));
    expect(item).toBeTruthy();
    expect(item.sets).toHaveLength(3);
    expect(item.sets.map((s) => Number(s.weight))).toEqual([80, 80, 80]);
    expect(item.sets.map((s) => Number(s.reps))).toEqual([5, 5, 5]);
    expect(item.sets.some((s) => Number(s.weight) === 120 || Number(s.reps) === 120)).toBeFalsy();
  });

  test('Smart Log expands natural spoken set counts into repeated sets', async ({ page }) => {
    await runSmartLog(page, 'Chest press machine 55 KG 10 reps three sets', 'resistance');

    const data = await storedData(page);
    const sessions = Object.values(data.sessions || {}).flat();
    const resistance = sessions.find((session) => session.type === 'resistance');
    expect(resistance).toBeTruthy();

    const item = resistance.exercises.find((exercise) => exercise.exerciseId === 'chest-press' || /chest press/i.test(exercise.name || ''));
    expect(item).toBeTruthy();
    expect(item.sets).toHaveLength(3);
    expect(item.sets.map((set) => Number(set.weight))).toEqual([55, 55, 55]);
    expect(item.sets.map((set) => Number(set.reps))).toEqual([10, 10, 10]);
  });

  test('Smart Log keeps treadmill speed and incline separate from distance', async ({ page }) => {
    await runSmartLog(page, 'treadmill 20 min 8 km/h 3% incline', 'cardio');

    const data = await storedData(page);
    const sessions = Object.values(data.sessions || {}).flat();
    const cardio = sessions.find((s) => s.type === 'cardio');
    expect(cardio).toBeTruthy();
    expect(Number(cardio.duration)).toBe(20);
    expect(Number(cardio.avgSpeed)).toBe(8);
    expect(Number(cardio.incline)).toBe(3);
    expect(Number(cardio.distance || 0)).toBe(0);
  });

  test('starting a Saved Workout from Profile creates a plan, not completed history', async ({ page }) => {
    await goProfile(page);
    await page.locator('[data-open-saved-workouts]').click();
    await expect(page.getByRole('heading', { name: 'Saved Workouts' })).toBeVisible();

    await page.locator('[data-workout-create]').first().click();
    await page.locator('#ls-workout-name').fill('QA Push');
    await page.locator('#ls-workout-search').fill('Chest Press');
    await page.locator('[data-add="chest-press"]').click();
    await page.locator('[data-builder-save]').click();

    const card = page.locator('.ls-workout-card').filter({ hasText: 'QA Push' });
    await expect(card).toBeVisible();
    await card.locator('[data-template-start]').click();
    await expect(page.locator('[data-p2-entry="resistance"]')).toBeVisible();

    const iso = await todayIso(page);
    const data = await storedData(page);
    expect(Object.keys(data.sessions || {})).toHaveLength(0);
    expect(data.plans?.[iso]?.exerciseIds || []).toContain('chest-press');
  });

  test('two test users keep bodyweight and workout history isolated', async ({ page }) => {
    await createUserKeepingCurrent(page, 'QA User A');
    await saveProfileValues(page, { displayName: 'Alpha', bodyWeight: 70, height: 175, gender: 'male' });
    await logExternalExercise(page, 'chest-press', 50, 10);

    await createUserKeepingCurrent(page, 'QA User B');
    await goProfile(page);
    await expect(page.locator('#profile-bodyweight')).toHaveValue('');
    let data = await storedData(page);
    expect(Object.keys(data.sessions || {})).toHaveLength(0);

    await saveProfileValues(page, { displayName: 'Beta', bodyWeight: 95, height: 182, gender: 'prefer_not_to_say' });

    await switchUser(page, 'QA User A');
    await goProfile(page);
    await expect(page.locator('.ls-profile-identity strong')).toHaveText('QA User A');
    await expect(page.locator('#profile-bodyweight')).toHaveValue('70');
    data = await storedData(page);
    expect(Object.keys(data.sessions || {}).length).toBeGreaterThan(0);

    await switchUser(page, 'QA User B');
    await goProfile(page);
    await expect(page.locator('.ls-profile-identity strong')).toHaveText('QA User B');
    await expect(page.locator('#profile-bodyweight')).toHaveValue('95');
    data = await storedData(page);
    expect(Object.keys(data.sessions || {})).toHaveLength(0);

    const registry = await registryData(page);
    expect(registry.users.filter((u) => /QA User [AB]/.test(u.name || '')).length).toBe(2);
  });

  test('Progress drill-down shows chart, guidance and one-tap last sets', async ({ page }) => {
    await logExternalExercise(page, 'chest-press', 60, 10);

    await page.locator('[data-nav="progress"]').click();
    const progress = page.locator('[data-progress-exercise="chest-press"]');
    await expect(progress).toBeVisible();
    await progress.click();

    await expect(page.locator('.ls-v14-chart-card')).toBeVisible();
    await expect(page.locator('.ls-v14-guide')).toBeVisible();
    await expect(page.locator('[data-use-last-progress="chest-press"]')).toBeVisible();
  });

  test('CSV import previews, imports and rolls back as one transaction', async ({ page }) => {
    await goProfile(page);
    await page.locator('[data-open-import-center]').click();
    await expect(page.getByRole('heading', { name: 'Import Training History' })).toBeVisible();

    const csv = [
      'Date,Workout Name,Exercise Name,Set Order,Weight,Weight Unit,Reps',
      '2026-09-01,QA Push,Chest Press,1,50,kg,10',
      '2026-09-01,QA Push,Chest Press,2,55,kg,8'
    ].join('\n');

    await page.locator('[data-import-file]').setInputFiles({
      name: 'strong-qa.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv)
    });
    await expect(page.locator('.ls-v14-import-preview')).toBeVisible();
    await expect(page.locator('.ls-v14-import-preview')).toContainText('Strong preview');

    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-import-confirm]').click();
    await expect(page.locator('[data-rollback-import]')).toBeVisible();

    let data = await storedData(page);
    const imported = Object.values(data.sessions || {}).flat().filter(s => s.importId);
    expect(imported).toHaveLength(1);
    expect(data.imports || []).toHaveLength(1);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-rollback-import]').click();
    data = await storedData(page);
    expect(Object.values(data.sessions || {}).flat().filter(s => s.importId)).toHaveLength(0);
    expect(data.imports || []).toHaveLength(0);
  });

  test('Hidden debug console captures errors, redacts secrets and preserves workouts', async ({page}) => {
    const panel=page.locator('#ls-diagnostics-panel');
    await expect(panel).toBeHidden();
    const previous=await storedData(page);
    await page.evaluate(()=>{
      console.error('LASTSET_QA_ERROR Bearer abcDEF1234 test.private@example.com');
      for(let i=0;i<3;i++){
        document.dispatchEvent(new PointerEvent('pointerup',{
          bubbles:true,pointerType:'touch',clientX:innerWidth-10,clientY:35
        }));
      }
    });
    await expect(panel).toBeVisible();
    const text=await panel.locator('[data-ls-diagnostics-logs]').innerText();
    expect(text).toContain('LASTSET_QA_ERROR');
    expect(text).not.toContain('abcDEF1234');
    expect(text).not.toContain('test.private@example.com');
    await panel.locator('[data-ls-diagnostics-copy]').click();
    await expect(panel.locator('[data-ls-diagnostics-status]')).not.toBeEmpty();
    await panel.locator('[data-ls-diagnostics-close]').click();
    await expect(panel).toBeHidden();
    expect(await storedData(page)).toEqual(previous);
  });

  test('Release version is consistent across JavaScript, CSS and manifest',async ({page})=>{
    const id=await page.locator('meta[name="lastset-release"]').getAttribute('content');
    expect(id).toMatch(/^[A-Za-z0-9_-]{5,32}$/);
    const loaded=await page.evaluate(()=>{
      const urls=[...document.querySelectorAll('script[src],link[rel="stylesheet"][href]')]
        .map(el=>el.src||el.href)
        .filter(Boolean)
        .filter(href=>/\.(js|css)(?:\?|$)/i.test(href));
      return urls.map(href=>({href,version:new URL(href).searchParams.get('v')}));
    });
    expect(loaded.length).toBeGreaterThan(6);
    expect(loaded.every(item=>item.version===id)).toBeTruthy();
    const response=await page.request.get('/lastset-build.json');
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).id).toBe(id);
  });

  test('LastSet Memory recalls a previous exercise only when explicitly requested', async ({ page }) => {
    await page.evaluate((key) => {
      const raw=localStorage.getItem(key);
      const current=raw?JSON.parse(raw):{sessions:{},profile:{}};
      const d=new Date();
      d.setDate(d.getDate()-7);
      const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      current.sessions=current.sessions||{};
      current.sessions[iso]=[{
        id:'qa-memory-history',
        type:'resistance',
        createdAt:Date.now()-7*86400000,
        exercises:[{
          exerciseId:'bench-press',
          name:'Bench Press',
          sets:[
            {weight:80,reps:10},
            {weight:80,reps:10},
            {weight:80,reps:8}
          ]
        }]
      }];
      localStorage.setItem(key,JSON.stringify(current));
    }, DATA_KEY);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.bottom-nav')).toBeVisible();

    await goToday(page);
    await openSmartQuick(page);
    await page.locator('#ai-text').fill('bench press same as last time');
    await page.locator('[data-action="parse-ai"]').click();

    await expect(page.locator('.ls-memory-used')).toBeVisible();
    await expect(page.locator('.ls-memory-used')).toContainText('Using your previous training');
    await expect(page.locator('.ai-set')).toHaveCount(3);
    await expect(page.locator('.ai-set').nth(0)).toContainText('80 kg');
    await expect(page.locator('.ai-set').nth(2)).toContainText('8');

    await page.locator('[data-action="confirm-ai-workout"]').click();
    await waitForSessionType(page,'resistance');

    const data=await storedData(page);
    const today=await todayIso(page);
    const session=(data.sessions?.[today]||[]).find(x=>x.type==='resistance');
    const bench=session?.exercises?.find(x=>x.exerciseId==='bench-press');
    expect(bench).toBeTruthy();
    expect(bench.sets.map(x=>[Number(x.weight),Number(x.reps)])).toEqual([[80,10],[80,10],[80,8]]);
  });

});
