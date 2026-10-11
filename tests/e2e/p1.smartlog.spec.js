const {test,expect}=require('@playwright/test');
const KEY='lastset-data-v1';
async function start(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()});
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#ls-onboard-name')).toBeVisible();
  await page.locator('#ls-onboard-name').fill('Smart Log P1 Test');
  await page.locator('[data-onboard-save]').click();
  await expect(page.locator('.ls-onboard-finish')).toBeVisible();
  await page.locator('[data-start="day"]').click();
  await expect(page.locator('.bottom-nav')).toBeVisible();
  await page.locator('[data-day-action="describe"]').first().click();
  await expect(page.locator('#ai-text')).toBeVisible();
}
async function parse(page,phrase){
  await page.locator('#ai-text').fill(phrase);
  await page.locator('[data-action="parse-ai"]').click();
  await expect(page.locator('.ls-p1-review')).toBeVisible({timeout:12000});
}
async function records(page){
  return page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions,KEY);
}
function resistance(sessions){return Object.values(sessions||{}).flat().find(s=>s.type==='resistance')}
test.describe('P1 progressive Smart Log end-to-end',()=>{
  test('every bench set persists after full reload',async({page})=>{
    await start(page);
    await parse(page,'Bench press 80kg for 8, then 85kg for 6 and 5');
    await expect(page.locator('.ls-p1-set')).toHaveCount(3);
    for(const [i,w,r] of [[0,'80','8'],[1,'85','6'],[2,'85','5']]){
      await expect(page.locator('[data-p1-weight="0:'+i+'"]')).toHaveValue(w);
      await expect(page.locator('[data-p1-reps="0:'+i+'"]')).toHaveValue(r);
    }
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    await expect(page.locator('.session-card')).toContainText('85 kg');
    let session=resistance(await records(page));
    expect(session.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[80,8],[85,6],[85,5]]);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.bottom-nav')).toBeVisible();
    session=resistance(await records(page));
    expect(session.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[80,8],[85,6],[85,5]]);
  });
  test('editing the second weight changes the saved set, not the original',async({page})=>{
    await start(page);
    await parse(page,'Bench press 80kg for 8, then 85kg for 6 and 5');
    await page.locator('[data-p1-weight="0:1"]').fill('87.5');
    await page.locator('[data-p1-weight="0:1"]').blur();
    await expect(page.locator('[data-p1-weight="0:1"]')).toHaveValue('87.5');
    await page.locator('[data-action="confirm-ai-workout"]').click();
    const session=resistance(await records(page));
    expect(session.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[80,8],[87.5,6],[85,5]]);
    expect(session.exercises[0].note).toContain('Original Smart Log:');
  });
  test('an unknown AMRAP count cannot be saved without explicit review',async({page})=>{
    await start(page);
    await parse(page,'Overhead press 60x5 then 55 amrap');
    await expect(page.locator('.ls-p1-set')).toHaveCount(2);
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeDisabled();
    await page.locator('[data-p1-reps="0:1"]').fill('7');
    await page.locator('[data-p1-reps="0:1"]').blur();
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeDisabled();
    await page.locator('[data-p1-ack="0"]').check();
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    const session=resistance(await records(page));
    expect(session.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[60,5],[55,7]]);
  });
  test('critical regression: ambiguous squat is visible and cannot be silently omitted',async({page})=>{
    await start(page);
    await parse(page,'Squat 100x5, 110x3, 120x1. Pull ups bodyweight 8,6,5 then +25 for 5. OHP 60x5 then 55 amrap.');
    await expect(page.locator('.ls-p1-card')).toHaveCount(3);
    await expect(page.locator('.ls-p1-set')).toHaveCount(9);
    await expect(page.locator('[data-p1-exercise="0"]')).toBeVisible();
    await expect(page.locator('[data-p1-weight="0:0"]')).toHaveValue('100');
    await expect(page.locator('[data-p1-weight="0:1"]')).toHaveValue('110');
    await expect(page.locator('[data-p1-weight="0:2"]')).toHaveValue('120');
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeDisabled();
    await expect(page.locator('.ls-p1-review')).toContainText('3 resistance exercises detected');
    // A user must explicitly choose the variant and confirm the source ambiguity.
    await page.locator('[data-p1-exercise="0"]').selectOption('squat');
    await page.locator('[data-p1-ack="0"]').check();
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeDisabled();
    // The OHP AMRAP reps remain unknown, rather than being invented.
    await page.locator('[data-p1-reps="2:1"]').fill('7');
    await page.locator('[data-p1-reps="2:1"]').blur();
    await page.locator('[data-p1-ack="2"]').check();
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    const before=resistance(await records(page));
    expect(before.exercises.map(x=>x.exerciseId)).toEqual(['squat','pull-up','barbell-overhead-press']);
    expect(before.exercises.map(x=>x.sets.map(y=>[y.weight,y.reps]))).toEqual([
      [[100,5],[110,3],[120,1]],
      [[0,8],[0,6],[0,5],[25,5]],
      [[60,5],[55,7]]
    ]);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.bottom-nav')).toBeVisible();
    const after=resistance(await records(page));
    expect(after.exercises).toEqual(before.exercises);
  });
  test('unrecognised full exercise sentence is visible and cannot be confirmed silently',async({page})=>{
    await start(page);
    await parse(page,'Mystery lifter move 50x8. Bench press 80x8 then 85x6');
    await expect(page.locator('.ls-p1-review')).toContainText('2 resistance exercises detected');
    await expect(page.locator('[data-p1-exercise="0"]')).toBeVisible();
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeDisabled();
    expect(resistance(await records(page))).toBeUndefined();
  });
  test('squat and deadlift each retain every progressive load and rep',async({page})=>{
    await start(page);
    await parse(page,'Back squat 100x5, 110x3, 120x1. Deadlift 140x5 then 150x3 then 160x1');
    await expect(page.locator('.ls-p1-card')).toHaveCount(2);
    await expect(page.locator('.ls-p1-set')).toHaveCount(6);
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    let session=resistance(await records(page));
    expect(session.exercises.map(e=>e.sets.map(set=>[set.weight,set.reps]))).toEqual([
      [[100,5],[110,3],[120,1]],
      [[140,5],[150,3],[160,1]]
    ]);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.bottom-nav')).toBeVisible();
    session=resistance(await records(page));
    expect(session.exercises.map(e=>e.sets.map(set=>[set.weight,set.reps]))).toEqual([
      [[100,5],[110,3],[120,1]],
      [[140,5],[150,3],[160,1]]
    ]);
  });
  test('warm-up and working-set labels survive saving and reopening',async({page})=>{
    await start(page);
    await parse(page,'Warm up bench 60x8, 70x5 then working 80x5, 85x5, 90x3');
    await expect(page.locator('.ls-p1-set')).toHaveCount(5);
    await expect(page.locator('[data-p1-type="0:0"]')).toHaveValue('warmup');
    await expect(page.locator('[data-p1-type="0:1"]')).toHaveValue('warmup');
    await expect(page.locator('[data-p1-type="0:2"]')).toHaveValue('working');
    await page.locator('[data-action="confirm-ai-workout"]').click();
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.bottom-nav')).toBeVisible();
    const session=resistance(await records(page));
    expect(session.exercises[0].sets.map(x=>[x.weight,x.reps,x.setType])).toEqual([
      [60,8,'warmup'],[70,5,'warmup'],[80,5,'working'],[85,5,'working'],[90,3,'working']
    ]);
  });
  test('compound plus accessory descriptions keep all exercises',async({page})=>{
    await start(page);
    await parse(page,'Bench press 80kg for 8, then 85kg for 6 and 5. Incline dumbbell press 30kg 3x10. Cable fly 15kg 3 sets of 12');
    await expect(page.locator('.ls-p1-card')).toHaveCount(3);
    await expect(page.locator('.ls-p1-set')).toHaveCount(9);
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    const session=resistance(await records(page));
    expect(session.exercises.length).toBe(3);
    expect(session.exercises.map(e=>e.sets.length)).toEqual([3,3,3]);
    expect(session.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[80,8],[85,6],[85,5]]);
  });
});