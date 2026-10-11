const {test,expect}=require('@playwright/test');
const KEY='lastset-data-v1';
const REGISTRY='lastset-user-spaces-v1';
const phrase='Bench Press 50 kg for 3, four sets. Assisted Dip 50 kg assistance for 7, three sets.';
const expected=[Array.from({length:4},()=>[50,3]),Array.from({length:3},()=>[50,7])];

async function start(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#ls-onboard-name').fill('P1 Exhaustive QA');
  await page.locator('[data-onboard-save]').click();
  await expect(page.locator('.ls-onboard-finish')).toBeVisible();
  await page.locator('[data-start="day"]').click();
  await expect(page.locator('.bottom-nav')).toBeVisible();
}
async function describe(page){
  await page.locator('.bottom-nav [data-nav="day"]').click();
  await page.locator('[data-day-action="describe"]').first().click();
  await expect(page.locator('#ai-text')).toBeVisible();
}
async function parse(page,text){
  await page.locator('#ai-text').fill(text);
  await page.locator('[data-action="parse-ai"]').click();
  await expect(page.locator('.ls-mobile-review,.ls-p1-review,.ai-review')).toBeVisible({timeout:12000});
  return page.evaluate(()=>({items:state.aiParsed?.items,source:state.aiDraft}));
}
async function save(page){
  await page.locator('[data-action="confirm-ai-workout"]').click();
  await expect(page.locator('.ls-mobile-success')).toBeVisible();
}
async function dismiss(page,action='view'){
  await page.locator(action==='view'?'[data-mobile-view]':'[data-mobile-today]').click();
  await expect(page.locator('.ls-mobile-success')).toHaveCount(0);
}
async function db(page){return page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);}
async function sessions(page){return (await db(page)).sessions||{};}
async function today(page){return page.evaluate(()=>isoDate(new Date()));}
async function todayRes(page){const ss=await sessions(page);return (ss[await today(page)]||[]).find(s=>s.type==='resistance');}
async function makeHistory(page){
  await page.evaluate(key=>{
    const d=JSON.parse(localStorage.getItem(key));
    const date=new Date();date.setDate(date.getDate()-5);
    const iso=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
    d.sessions[iso]=[{id:'qa-old-workout',type:'resistance',createdAt:Date.now()-432000000,
      exercises:[{exerciseId:'assisted-dip',name:'Assisted Dip',loadType:'assisted',
      sets:Array.from({length:3},()=>({weight:50,reps:10,setType:'working'}))}]}];
    localStorage.setItem(key,JSON.stringify(d));
  },KEY);
  await page.reload({waitUntil:'domcontentloaded'});
}
async function newProfile(page,name){
  await page.locator('.bottom-nav [data-nav="profile"]').click();
  await page.locator('[data-profile-manage-users]').click();
  await page.locator('[data-user-new]').click();
  await page.locator('#ls-new-profile-name').fill(name);
  await page.locator('[data-v14-create-user]').click();
  await expect(page.locator('.ls-onboard-finish')).toBeVisible();
  await page.locator('[data-start="day"]').click();
  await expect(page.locator('.bottom-nav')).toBeVisible();
}
async function switchProfile(page,name){
  await page.locator('.bottom-nav [data-nav="profile"]').click();
  await page.locator('[data-profile-manage-users]').click();
  await page.locator('.ls-user-row').filter({hasText:name}).locator('[data-user-switch]').click();
  await expect(page.locator('.bottom-nav')).toBeVisible();
}

test.describe('P1 exhaustive adversarial release audit',()=>{
  test('saved seven-set workout remains editable after save, with exact one-set change on reload',async({page})=>{
    await start(page);await describe(page);await parse(page,phrase);await save(page);await dismiss(page);
    const item=await todayRes(page);
    expect(item.exercises.map(e=>e.sets.map(s=>[s.weight,s.reps]))).toEqual(expected);
    const id=item.id;
    await page.locator('[data-edit-exercise="'+id+'"][data-exercise-index="1"]').click();
    await expect(page.locator('[data-action="save-exercise"]')).toBeVisible();
    await page.locator('[data-set-reps="1"]').fill('6');
    await page.locator('[data-action="save-exercise"]').click();
    await page.reload({waitUntil:'domcontentloaded'});
    const changed=await todayRes(page);
    expect(changed.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual(expected[0]);
    expect(changed.exercises[1].sets.map(s=>[s.weight,s.reps])).toEqual([[50,7],[50,6],[50,7]]);
    expect((await sessions(page))[await today(page)].filter(x=>x.type==='resistance')).toHaveLength(1);
  });

  test('draft typed but not parsed survives reload and can be resumed without saving',async({page})=>{
    await start(page);await describe(page);
    await page.locator('#ai-text').fill('Bench Press 70 kg 3x8');
    await page.reload({waitUntil:'domcontentloaded'});
    await describe(page);
    await expect(page.locator('[data-mobile-resume]')).toBeVisible();
    await page.locator('[data-mobile-resume]').click();
    await expect(page.locator('#ai-text')).toHaveValue('Bench Press 70 kg 3x8');
    expect(Object.values(await sessions(page)).flat()).toHaveLength(0);
  });

  test('edited unresolved smartlog stays in draft and does not become saved after reload',async({page})=>{
    await start(page);await describe(page);
    await parse(page,'Bench Press 50 kg for 3, four sets. Assisted Dip 50 kg assistance');
    await page.locator('[data-mobile-open="1"]').click();
    await page.locator('[data-mobile-quick-sets="1"]').fill('3');
    await page.locator('[data-mobile-quick-reps="1"]').fill('7');
    await page.locator('[data-mobile-quick-weight="1"]').fill('50');
    await page.locator('[data-mobile-apply="1"]').click();
    await page.reload({waitUntil:'domcontentloaded'});
    await describe(page);
    await page.locator('[data-mobile-resume]').click();
    expect(await page.evaluate(()=>state.aiParsed.items.map(e=>e.sets.map(s=>[s.weightKg,s.reps])))).toEqual(expected);
    expect(Object.values(await sessions(page)).flat()).toHaveLength(0);
  });

  test('successful save clears recoverable draft and never resurrects saved workout',async({page})=>{
    await start(page);await describe(page);await parse(page,phrase);await save(page);await dismiss(page,'today');
    await page.reload({waitUntil:'domcontentloaded'});
    await describe(page);
    await expect(page.locator('[data-mobile-resume]')).toHaveCount(0);
    expect((await todayRes(page)).exercises.map(e=>e.sets.map(s=>[s.weight,s.reps]))).toEqual(expected);
  });

  test('history suggestion remains advisory; changing todays reps leaves old record unchanged',async({page})=>{
    await start(page);await makeHistory(page);await describe(page);
    const parsed=await parse(page,'Assisted Dip 50 kg assistance');
    expect(parsed.items[0].memorySuggestion?.sets).toHaveLength(3);
    expect(parsed.items[0].sets).toHaveLength(0);
    await page.locator('[data-mobile-open="0"]').click();
    await expect(page.locator('[data-memory-use="0"]')).toBeVisible();
    await page.locator('[data-mobile-quick-weight="0"]').fill('50');
    await page.locator('[data-mobile-quick-sets="0"]').fill('3');
    await page.locator('[data-mobile-quick-reps="0"]').fill('7');
    await page.locator('[data-mobile-apply="0"]').click();
    await page.locator('[data-mobile-sheet-close]').first().click();
    await save(page);await dismiss(page);
    const d=await db(page);
    const historical=Object.values(d.sessions).flat().find(s=>s.id==='qa-old-workout');
    expect(historical.exercises[0].sets.map(x=>x.reps)).toEqual([10,10,10]);
    expect((await todayRes(page)).exercises[0].sets.map(x=>x.reps)).toEqual([7,7,7]);
  });

  test('explicit Use previous sets fills only after click and does not mutate source',async({page})=>{
    await start(page);await makeHistory(page);await describe(page);
    await parse(page,'Assisted Dip 50 kg assistance');
    await page.locator('[data-mobile-open="0"]').click();
    await page.locator('[data-memory-use="0"]').click();
    expect(await page.evaluate(()=>state.aiParsed.items[0].sets.map(s=>[s.weightKg,s.reps]))).toEqual([[50,10],[50,10],[50,10]]);
    await save(page);await dismiss(page);
    expect((await todayRes(page)).exercises[0].sets.map(x=>x.reps)).toEqual([10,10,10]);
    const older=Object.values(await sessions(page)).flat().find(x=>x.id==='qa-old-workout');
    expect(older.exercises[0].sets.map(x=>x.reps)).toEqual([10,10,10]);
  });

  test('corrected misheard name WITHOUT Remember is not stored even after confirmed save',async({page})=>{
    await start(page);await describe(page);
    await parse(page,'Bench Press 50 kg for 3, four sets. My sister Dip 50 kg assistance for 7, three sets.');
    await page.locator('[data-mobile-fix-next]').click();
    await page.locator('[data-p1-exercise="1"]').selectOption('assisted-dip');
    await expect(page.locator('[data-mobile-remember="1"]')).toBeVisible();
    expect(await page.locator('[data-mobile-remember="1"]').isChecked()).toBe(false);
    await page.locator('[data-p1-ack="1"]').check();
    await page.locator('[data-mobile-sheet-close]').first().click();
    await save(page);await dismiss(page);
    expect((await db(page)).memory?.aliases?.['my sister dip']).toBeUndefined();
    await page.reload({waitUntil:'domcontentloaded'});
    const next=await page.evaluate(()=>parseSmartWorkout('My sister Dip 60 kg assistance for 9, two sets.'));
    expect(next.items.some(item=>item.exerciseId==='assisted-dip'&&item.memoryLearnedAliases)).toBe(false);
  });

  test('consented nickname persists and today values come from new spoken text',async({page})=>{
    await start(page);await describe(page);
    await parse(page,'Bench Press 50 kg for 3, four sets. My sister Dip 50 kg assistance for 7, three sets.');
    await page.locator('[data-mobile-fix-next]').click();
    await page.locator('[data-p1-exercise="1"]').selectOption('assisted-dip');
    await page.locator('[data-mobile-remember="1"]').check();
    await page.locator('[data-p1-ack="1"]').check();
    await page.locator('[data-mobile-sheet-close]').first().click();
    await save(page);await dismiss(page);
    await page.reload({waitUntil:'domcontentloaded'});
    expect((await db(page)).memory?.aliases?.['my sister dip']?.exerciseId).toBe('assisted-dip');
    const next=await page.evaluate(()=>parseSmartWorkout('Bench Press 60 kg for 5, two sets. My sister Dip 40 kg assistance for 9, two sets.'));
    expect(next.items.map(i=>i.exerciseId)).toEqual(['bench-press','assisted-dip']);
    expect(next.items[0].sets.map(s=>[s.weightKg,s.reps])).toEqual([[60,5],[60,5]]);
    expect(next.items[1].sets.map(s=>[s.weightKg,s.reps])).toEqual([[40,9],[40,9]]);
    expect((await todayRes(page)).exercises.map(e=>e.sets.map(s=>[s.weight,s.reps]))).toEqual(expected);
  });

  test('nickname and saved workout history do not bleed into new user profile',async({page})=>{
    await start(page);await describe(page);
    await parse(page,'Bench Press 50 kg for 3, four sets. My sister Dip 50 kg assistance for 7, three sets.');
    await page.locator('[data-mobile-fix-next]').click();
    await page.locator('[data-p1-exercise="1"]').selectOption('assisted-dip');
    await page.locator('[data-mobile-remember="1"]').check();
    await page.locator('[data-p1-ack="1"]').check();
    await page.locator('[data-mobile-sheet-close]').first().click();
    await save(page);await dismiss(page);
    await newProfile(page,'Isolated QA B');
    expect(Object.values(await sessions(page)).flat()).toHaveLength(0);
    expect((await db(page)).memory?.aliases?.['my sister dip']).toBeUndefined();
    const candidate=await page.evaluate(()=>parseSmartWorkout('My sister Dip 40 kg assistance for 9, two sets.'));
    expect(candidate.items.some(x=>x.exerciseId==='assisted-dip')).toBe(false);
    await switchProfile(page,'P1 Exhaustive QA');
    expect((await db(page)).memory?.aliases?.['my sister dip']?.exerciseId).toBe('assisted-dip');
    expect(Object.values(await sessions(page)).flat().some(x=>x.type==='resistance')).toBe(true);
  });

  test('bad quick edit inputs never overwrite actual parsed sets',async({page})=>{
    await start(page);await describe(page);await parse(page,phrase);
    await page.locator('[data-mobile-open="1"]').click();
    for(const [field,value,part] of [
      ['sets','0','number of sets'],['sets','21','number of sets'],
      ['sets','2.5','number of sets'],['reps','0','completed reps'],
      ['reps','501','completed reps'],['weight','-3','non-negative load']
    ]){
      await page.locator('[data-mobile-quick-sets="1"]').fill('3');
      await page.locator('[data-mobile-quick-reps="1"]').fill('7');
      await page.locator('[data-mobile-quick-weight="1"]').fill('50');
      await page.locator('[data-mobile-quick-'+field+'="1"]').fill(value);
      await page.locator('[data-mobile-apply="1"]').click();
      await expect(page.locator('.ls-mobile-quick-error')).toContainText(part);
      expect(await page.evaluate(()=>state.aiParsed.items[1].sets.map(s=>[s.weightKg,s.reps]))).toEqual(expected[1]);
    }
    expect(Object.values(await sessions(page)).flat()).toHaveLength(0);
  });

  test('quick edit explicitly changes only selected exercise and supports nonuniform individual sets',async({page})=>{
    await start(page);await describe(page);await parse(page,phrase);
    await page.locator('[data-mobile-open="1"]').click();
    await page.locator('[data-p1-reps="1:1"]').fill('6');
    await page.locator('[data-p1-reps="1:1"]').blur();
    expect(await page.evaluate(()=>state.aiParsed.items[1].sets.map(s=>s.reps))).toEqual([7,6,7]);
    await page.locator('[data-mobile-open="1"]').click();
    await expect(page.locator('[data-mobile-open="1"]')).toHaveAttribute('aria-expanded','false');
    await page.locator('[data-mobile-open="1"]').click();
    expect(await page.evaluate(()=>state.aiParsed.items[1].sets.map(s=>s.reps))).toEqual([7,6,7]);
    await save(page);await dismiss(page);
    expect((await todayRes(page)).exercises.map(e=>e.sets.map(s=>[s.weight,s.reps]))).toEqual([expected[0],[[50,7],[50,6],[50,7]]]);
  });

  test('missing assisted reps cannot be saved by dismissing the correction panel',async({page})=>{
    await start(page);await describe(page);await parse(page,'Assisted Dip 50 kg assistance');
    await page.locator('[data-mobile-fix-next]').click();
    await expect(page.locator('.ls-mobile-sheet')).toBeVisible();
    await page.locator('[data-mobile-sheet-close]').first().click();
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toHaveCount(0);
    expect(Object.values(await sessions(page)).flat()).toHaveLength(0);
  });

  test('bodyweight exercise counts never become external kg volume',async({page})=>{
    await start(page);await describe(page);const r=await parse(page,'Pull ups bodyweight 8, 6 and 5.');
    const body=r.items.find(i=>i.exerciseId==='pull-up');
    expect(body).toBeTruthy();
    expect(body.sets.map(s=>s.reps)).toEqual([8,6,5]);
    await save(page);await dismiss(page);
    const logged=await todayRes(page);
    expect(logged.exercises[0].sets.map(s=>s.weight)).toEqual([0,0,0]);
    await expect(page.locator('.session-card')).toContainText('External kg volume');
    await expect(page.locator('.session-card')).not.toContainText('kg volume 0');
  });

  test('desktop narrow mobile layout has no horizontal page overflow in review, correction sheet or saved screen',async({page})=>{
    await page.setViewportSize({width:320,height:640});
    await start(page);await describe(page);
    await parse(page,'Bench Press 50 kg 3 reps 4 sets. Assisted Dip 50 kg assistance');
    const screen=async()=>page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
    expect((await screen()).scroll).toBeLessThanOrEqual((await screen()).viewport+2);
    await page.locator('[data-mobile-fix-next]').click();
    expect((await screen()).scroll).toBeLessThanOrEqual((await screen()).viewport+2);
    await page.locator('[data-mobile-quick-weight="1"]').fill('50');
    await page.locator('[data-mobile-quick-sets="1"]').fill('3');
    await page.locator('[data-mobile-quick-reps="1"]').fill('7');
    await page.locator('[data-mobile-apply="1"]').click();
    await page.locator('[data-mobile-sheet-close]').first().click();
    await save(page);await dismiss(page);
    expect((await screen()).scroll).toBeLessThanOrEqual((await screen()).viewport+2);
  });

  const phrases=[
    {id:'G02',input:'Bench Press 50 kg four sets of three. Assisted Dip 50 kg three sets of seven.',names:['bench-press','assisted-dip'],sets:[4,3]},
    {id:'G03',input:'Bench Press 50 kg for 3, 4 and 5.',names:['bench-press'],reps:[[3,4,5]]},
    {id:'G05',input:'Deadlift 140x5 then 150x3 then 160x1. Chin ups assisted 3x8 then bodyweight max.',names:['deadlift'],sets:[3],blocked:true},
    {id:'G06',input:'Squat 120x3, 130x2, 140x1. Good mornings 60 3x10.',names:['good-morning'],minItems:2,blocked:true},
    {id:'G07',input:'Warm up squat 60x8 80x5 then working 100x5 110x3 120x1',minItems:1,totalSets:5,blocked:true},
    {id:'G08',input:'Warm up bench 60x8, 70x5 then working 80x5, 85x5, 90x3',names:['bench-press'],totalSets:5},
    {id:'G09',input:'Bench press 80kg for 8, then 85kg for 6 and 5. Incline dumbbell press 30kg 3x10. Cable fly 15kg 3 sets of 12',minItems:3,totalSets:9},
    {id:'G11',input:'Back squat 100x5, 110x3, 120x1. Deadlift 140x5 then 150x3 then 160x1',names:['deadlift'],minItems:2,totalSets:6},
    {id:'G12',input:'Overhead press 60x5 then 55 amrap',names:['overhead-press'],blocked:true},
    {id:'G14',input:'Mystery lifter move 50x8. Bench press 80x8 then 85x6',names:['bench-press'],minItems:2,blocked:true},
    {id:'G15',input:'Bench press 80kg 3x5 rest 120 sec',names:['bench-press'],sets:[3]},
    {id:'G21',input:'Leg press 200 for 15 drop to 150 for 12 then 100 for 15',names:['leg-press'],sets:[3]},
    {id:'G22',input:'Assisted Dip 50 kg assistance',names:['assisted-dip'],blocked:true},
    {id:'G23',input:'Pull ups bodyweight 8, 6, 5',names:['pull-up'],sets:[3]},
    {id:'G04',input:'Bench Press 50 kg for 3, four sets. My sister Dip 50 kg assistance for 7, three sets.',minItems:2,blocked:true}
  ];
  for(const c of phrases){
    test(c.id+' source-faithful browser parser: '+c.input,async({page})=>{
      await start(page);await describe(page);
      const r=await parse(page,c.input);
      expect(r.items?.length||0).toBeGreaterThanOrEqual(c.minItems||c.names?.length||1);
      for(const name of c.names||[])expect(r.items.some(it=>it.exerciseId===name)).toBe(true);
      if(c.sets)for(let i=0;i<c.sets.length;i++)expect(r.items[i].sets.length).toBe(c.sets[i]);
      if(c.totalSets)expect(r.items.reduce((sum,it)=>sum+(it.sets?.length||0),0)).toBe(c.totalSets);
      if(c.reps)for(let i=0;i<c.reps.length;i++)expect(r.items[i].sets.map(s=>s.reps)).toEqual(c.reps[i]);
      if(c.blocked)await expect(page.locator('[data-action="confirm-ai-workout"]')).toHaveCount(0);
      expect(Object.values(await sessions(page)).flat()).toHaveLength(0);
    });
  }

  const perturbations=[
    'bench 50kg 3x10 then assisted dip 35kg 2x8',
    'Back squat 100 kg for 5, three sets, and a barbell row 60 kg for 8, two sets.',
    'Bench press 40kg warm up 12 reps then 60kg 8 reps then 80kg 5 reps',
    'Cable row 50 3x12. Lat pulldown 70x10 60x8',
    'Machine chest press 55kg 3 sets of ten',
    'Incline dumbbell press 22kg 10 9 8',
    'Deadlift 100x8 120x5 140x3',
    'Assisted chin up 25 kg assistance 3 sets of eight',
    'Bench press 80x8, 85x6 and 85x4',
    'Squat and bench, both 50kg but forgot how many reps',
    'I did an unknown lift after bench 80x8',
    'Bench 50kg x10 x8 x6 and pull ups bodyweight 5',
    'Overhead press 60kg 3x5 rest two minutes',
    'Cable tricep pushdown 15 kilos for twelve, ten and eight',
    'Leg press 100 kg x12, 150 kg x10, 180 kg x8',
    'Bench press 50 kg three reps four sets followed by assisted dips 50 kilos seven reps three sets',
    'bench press 50 kilograms eight reps for four sets and then pull ups 8 reps',
    'Tried deadlift 140 kg for five and then 150 for three',
    'My sister dip 50kg seven wraps three cents',
    'No workout today just rested',
  ];
  for(let i=0;i<perturbations.length;i++){
    const input=perturbations[i];
    test('A'+String(i+1).padStart(2,'0')+' adversarial natural-language smoke preserves plausible items without phantom saves',async({page})=>{
      await start(page);await describe(page);
      await page.locator('#ai-text').fill(input);
      await page.locator('[data-action="parse-ai"]').click();
      await expect(page.locator('#ai-text')).toBeAttached();
      const result=await page.evaluate(()=>({
        parsed:state.aiParsed?.items?.map(it=>({name:it.name,kind:it.kind,reps:it.sets?.map(s=>s.reps),kg:it.sets?.map(s=>s.weightKg)}))||[],
        failure:state.aiError||''
      }));
      expect(result.parsed.length>0||result.failure.length>0).toBe(true);
      expect(result.parsed.length).toBeLessThanOrEqual(20);
      expect(result.parsed.every(it=>!it.sets||it.sets.length<=20)).toBe(true);
      expect(Object.values(await sessions(page)).flat()).toHaveLength(0);
    });
  }
});
