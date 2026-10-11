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
  await expect(page.locator('.ls-mobile-review')).toBeVisible({timeout:12000});
}
async function records(page){
  return page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions,KEY);
}
function resistance(sessions){return Object.values(sessions||{}).flat().find(s=>s.type==='resistance')}
test.describe('P1 progressive Smart Log end-to-end',()=>{
  test('explicit Memory recall preserves earlier sets and shows its provenance',async({page})=>{
    await start(page);
    await page.evaluate(key=>{
      const db=JSON.parse(localStorage.getItem(key));
      const day=new Date();day.setDate(day.getDate()-7);
      const iso=day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0');
      db.sessions=db.sessions||{};
      db.sessions[iso]=[{id:'p1-memory-history',type:'resistance',createdAt:Date.now()-604800000,
        exercises:[{exerciseId:'bench-press',name:'Bench Press',sets:[{weight:80,reps:10},{weight:80,reps:10},{weight:80,reps:8}]}]}];
      localStorage.setItem(key,JSON.stringify(db));
    },KEY);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await page.locator('[data-nav="day"]').click();
    await page.locator('[data-day-action="describe"]').first().click();
    await page.locator('#ai-text').fill('bench press same as last time');
    await page.locator('[data-action="parse-ai"]').click();
    await expect(page.locator('.ls-memory-used')).toBeVisible();
    await expect(page.locator('.ai-set')).toHaveCount(3);
    await page.locator('[data-action="confirm-ai-workout"]').click();
    const sessions=await records(page);
    const todays=Object.entries(sessions).sort(([a],[b])=>b.localeCompare(a));
    const today=todays.find(([_,ss])=>ss.some(v=>v.id!=='p1-memory-history'&&v.type==='resistance'));
    const newest=today?.[1].find(v=>v.id!=='p1-memory-history'&&v.type==='resistance');
    expect(newest?.exercises?.find(e=>e.exerciseId==='bench-press')?.sets.map(v=>[v.weight,v.reps])).toEqual([[80,10],[80,10],[80,8]]);
  });
  test('every bench set persists after full reload',async({page})=>{
    await start(page);
    await parse(page,'Bench press 80kg for 8, then 85kg for 6 and 5');
    expect(await page.evaluate(()=>state.aiParsed.items.filter(i=>i.kind==='resistance').reduce((n,i)=>n+(i.sets?.length||0),0))).toBe(3);
    for(const [i,w,r] of [[0,'80','8'],[1,'85','6'],[2,'85','5']]){
      expect(await page.evaluate(i=>String(state.aiParsed.items[0].sets[i].weightKg),i)).toBe(w);
      expect(await page.evaluate(i=>String(state.aiParsed.items[0].sets[i].reps),i)).toBe(r);
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
    await page.locator('[data-mobile-open="0"]').click();
    await page.locator('[data-p1-weight="0:1"]').fill('87.5');
    await page.locator('[data-p1-weight="0:1"]').blur();
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[1].weightKg))).toBe('87.5');
    await page.locator('[data-action="confirm-ai-workout"]').click();
    const session=resistance(await records(page));
    expect(session.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[80,8],[87.5,6],[85,5]]);
    expect(session.exercises[0].note).toContain('Original Smart Log:');
  });
  test('an unknown AMRAP count cannot be saved without explicit review',async({page})=>{
    await start(page);
    await parse(page,'Overhead press 60x5 then 55 amrap');
    expect(await page.evaluate(()=>state.aiParsed.items.filter(i=>i.kind==='resistance').reduce((n,i)=>n+(i.sets?.length||0),0))).toBe(2);
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    await page.locator('[data-mobile-open="0"]').click();
    await page.locator('[data-p1-reps="0:1"]').fill('7');
    await page.locator('[data-p1-reps="0:1"]').blur();
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    await page.locator('[data-p1-ack="0"]').check();
    await page.locator('[data-mobile-sheet-close]').first().click();
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    const session=resistance(await records(page));
    expect(session.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[60,5],[55,7]]);
  });
  test('critical regression: ambiguous squat is visible and cannot be silently omitted',async({page})=>{
    await start(page);
    await parse(page,'Squat 100x5, 110x3, 120x1. Pull ups bodyweight 8,6,5 then +25 for 5. OHP 60x5 then 55 amrap.');
    await expect(page.locator('.ls-mobile-exercise')).toHaveCount(3);
    expect(await page.evaluate(()=>state.aiParsed.items.filter(i=>i.kind==='resistance').reduce((n,i)=>n+(i.sets?.length||0),0))).toBe(9);
    await expect(page.locator('[data-mobile-open="0"]')).toBeVisible();
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[0].weightKg))).toBe('100');
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[1].weightKg))).toBe('110');
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[2].weightKg))).toBe('120');
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    await expect(page.locator('.ls-mobile-review')).toContainText('3 exercises');
    // A user must explicitly choose the variant and confirm the source ambiguity.
    await page.locator('[data-mobile-open="0"]').click();
    await page.locator('[data-p1-exercise="0"]').selectOption('squat');
    await page.locator('[data-p1-ack="0"]').check();
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    // The OHP AMRAP reps remain unknown, rather than being invented.
    await page.locator('[data-mobile-sheet-close]').first().click();
    await page.locator('[data-mobile-open="2"]').click();
    await page.locator('[data-p1-reps="2:1"]').fill('7');
    await page.locator('[data-p1-reps="2:1"]').blur();
    await page.locator('[data-p1-ack="2"]').check();
    await page.locator('[data-mobile-sheet-close]').first().click();
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
    await expect(page.locator('.ls-mobile-review')).toContainText('2 exercises');
    await expect(page.locator('[data-mobile-open="0"]')).toBeVisible();
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    expect(resistance(await records(page))).toBeUndefined();
  });
  test('Grok R3B: Deadlift cannot inherit assisted Chin-Up set count as kilograms',async({page})=>{
    await start(page);
    await parse(page,'Deadlift 140x5 then 150x3 then 160x1. Chin ups assisted 3x8 then bodyweight max.');
    await expect(page.locator('.ls-mobile-exercise')).toHaveCount(2);
    expect(await page.evaluate(()=>state.aiParsed.items.filter(i=>i.kind==='resistance').reduce((n,i)=>n+(i.sets?.length||0),0))).toBe(3);
    for(const [i,w,r] of [[0,'140','5'],[1,'150','3'],[2,'160','1']]){
      expect(await page.evaluate(i=>String(state.aiParsed.items[0].sets[i].weightKg),i)).toBe(w);
      expect(await page.evaluate(i=>String(state.aiParsed.items[0].sets[i].reps),i)).toBe(r);
    }
    expect(await page.evaluate(()=>state.aiParsed.items[1].p1Source)).toContain('Chin ups assisted 3x8 then bodyweight max');
    await expect(page.locator('[data-mobile-open="1"]')).toBeVisible();
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    expect(resistance(await records(page))).toBeUndefined();
  });
  test('Grok R3B: bare squat and Good Mornings are exactly two cards',async({page})=>{
    await start(page);
    await parse(page,'Squat 120x3, 130x2, 140x1. Good mornings 60 3x10.');
    await expect(page.locator('.ls-mobile-exercise')).toHaveCount(2);
    expect(await page.evaluate(()=>state.aiParsed.items.filter(i=>i.kind==='resistance').reduce((n,i)=>n+(i.sets?.length||0),0))).toBe(6);
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    await expect(page.locator('.ls-mobile-review')).toContainText('2 exercises');
  });
  test('Grok R3B: warm up squat remains one exercise with five correct sets',async({page})=>{
    await start(page);
    await parse(page,'Warm up squat 60x8 80x5 then working 100x5 110x3 120x1');
    await expect(page.locator('.ls-mobile-exercise')).toHaveCount(1);
    expect(await page.evaluate(()=>state.aiParsed.items.filter(i=>i.kind==='resistance').reduce((n,i)=>n+(i.sets?.length||0),0))).toBe(5);
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[0].setType))).toBe('warmup');
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[1].setType))).toBe('warmup');
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[2].setType))).toBe('working');
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
  });
  test('Grok R3B: messy spoken Bench / Incline / Cable Fly cannot disappear',async({page})=>{
    await start(page);
    await parse(page,'did some bench today 80 kilos for eight then put 85 on and got six and five, then incline dumbbells 30 for ten three times and cable flies light for fifteen');
    await expect(page.locator('.ls-mobile-exercise')).toHaveCount(3);
    await expect(page.locator('.ls-mobile-review')).toContainText('3 exercises');
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[0].weightKg))).toBe('80');
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[1].weightKg))).toBe('85');
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[2].weightKg))).toBe('85');
    await expect(page.locator('[data-mobile-open="1"]')).toBeVisible();
    await expect(page.locator('[data-mobile-open="2"]')).toBeVisible();
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
  });
  test('squat and deadlift each retain every progressive load and rep',async({page})=>{
    await start(page);
    await parse(page,'Back squat 100x5, 110x3, 120x1. Deadlift 140x5 then 150x3 then 160x1');
    await expect(page.locator('.ls-mobile-exercise')).toHaveCount(2);
    expect(await page.evaluate(()=>state.aiParsed.items.filter(i=>i.kind==='resistance').reduce((n,i)=>n+(i.sets?.length||0),0))).toBe(6);
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
    expect(await page.evaluate(()=>state.aiParsed.items.filter(i=>i.kind==='resistance').reduce((n,i)=>n+(i.sets?.length||0),0))).toBe(5);
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[0].setType))).toBe('warmup');
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[1].setType))).toBe('warmup');
    expect(await page.evaluate(()=>String(state.aiParsed.items[0].sets[2].setType))).toBe('working');
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
    await expect(page.locator('.ls-mobile-exercise')).toHaveCount(3);
    expect(await page.evaluate(()=>state.aiParsed.items.filter(i=>i.kind==='resistance').reduce((n,i)=>n+(i.sets?.length||0),0))).toBe(9);
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    const session=resistance(await records(page));
    expect(session.exercises.length).toBe(3);
    expect(session.exercises.map(e=>e.sets.length)).toEqual([3,3,3]);
    expect(session.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[80,8],[85,6],[85,5]]);
  });
});

test.describe('Mobile Scan Fix Save additions',()=>{
  test('system appearance follows device and profile override survives reload',async({page})=>{
    await page.emulateMedia({colorScheme:'light'});
    await start(page);
    await expect(page.locator('html')).toHaveAttribute('data-lastset-theme','light');
    await page.locator('.bottom-nav [data-nav="profile"]').click();
    await expect(page.locator('#lastset-theme-mode')).toHaveValue('system');
    await page.locator('#lastset-theme-mode').selectOption('dark');
    await page.locator('[data-action="save-profile"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-lastset-theme','dark');
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('html')).toHaveAttribute('data-lastset-theme','dark');
    await page.locator('.bottom-nav [data-nav="profile"]').click();
    await page.locator('#lastset-theme-mode').selectOption('system');
    await page.locator('[data-action="save-profile"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-lastset-theme','light');
    await page.emulateMedia({colorScheme:'dark'});
    await expect(page.locator('html')).toHaveAttribute('data-lastset-theme','dark');
  });
  test('unfinished Smart Log can resume after browser reload without saving phantom sets',async({page})=>{
    await start(page);
    await parse(page,'Deadlift 140x5 then 150x3 then 160x1');
    await expect(page.locator('.ls-mobile-exercise')).toHaveCount(1);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-nav="day"]').click();
    await page.locator('[data-day-action="describe"]').first().click();
    await expect(page.locator('[data-mobile-resume]')).toBeVisible();
    await page.locator('[data-mobile-resume]').click();
    await expect(page.locator('.ls-mobile-review')).toBeVisible();
    const sets=await page.evaluate(()=>state.aiParsed.items[0].sets.map(s=>[s.weightKg,s.reps]));
    expect(sets).toEqual([[140,5],[150,3],[160,1]]);
    expect(resistance(await records(page))).toBeUndefined();
  });
  test('mixed assisted and bodyweight must collect actual numbers before save',async({page})=>{
    await start(page);
    await parse(page,'Deadlift 140x5 then 150x3 then 160x1. Chin ups assisted 3x8 then bodyweight max.');
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    await page.locator('[data-mobile-open="1"]').click();
    await page.locator('[data-mobile-split="1"]').click();
    await page.locator('[data-mobile-assisted-type]').selectOption('assisted-pull-up');
    await page.locator('[data-mobile-body-type]').selectOption('pull-up');
    await page.locator('[data-mobile-assist-weight]').fill('25');
    await page.locator('[data-mobile-body-reps]').fill('6');
    await page.locator('[data-mobile-split-confirm="1"]').click();
    await expect(page.locator('.ls-mobile-exercise')).toHaveCount(3);
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    await expect(page.locator('.ls-mobile-success')).toBeVisible();
    await page.locator('[data-mobile-today]').click();
    const session=resistance(await records(page));
    expect(session.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[140,5],[150,3],[160,1]]);
    expect(session.exercises[1].sets.map(s=>[s.weight,s.reps])).toEqual([[25,8],[25,8],[25,8]]);
    expect(session.exercises[2].sets.map(s=>[s.weight,s.reps])).toEqual([[0,6]]);
  });
});

test('mobile review stays compact until a confirmed exercise is expanded',async({page})=>{
  await start(page);
  await parse(page,'Deadlift 140x5 then 150x3 then 160x1. Bench press 80x8 then 85x6');
  await expect(page.locator('.ls-mobile-status')).toContainText('2 exercises');
  await expect(page.locator('.ls-mobile-exercise')).toHaveCount(2);
  await expect(page.locator('[data-p1-weight]')).toHaveCount(0);
  await page.locator('[data-mobile-open="0"]').click();
  await expect(page.locator('[data-p1-weight="0:0"]')).toHaveValue('140');
  await expect(page.locator('[data-p1-weight="0:2"]')).toHaveValue('160');
  await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeVisible();
  await page.locator('[data-mobile-open="1"]').click();
  await expect(page.locator('[data-p1-weight="0:0"]')).toHaveCount(0);
  await expect(page.locator('[data-p1-weight="1:0"]')).toHaveValue('80');
});


/* SpeechRecognition is mocked because CI browsers do not have a real mic.
   These tests cover the UI/controller logic, not iPhone hardware accuracy. */
async function startWithVoice(page){
  await page.addInitScript(()=>{
    class FakeSpeechRecognition{
      constructor(){this.lang='en-US';this.interimResults=false;this.continuous=false;}
      start(){
        window.__lastsetVoiceMock.instances.push(this);
        window.__lastsetVoiceMock.starts++;
      }
      stop(){this.onend?.({});}
      abort(){this.aborted=true;}
    }
    window.__lastsetVoiceMock={
      instances:[],starts:0,
      current(){return this.instances[this.instances.length-1];},
      say(text,isFinal=true){
        const result={0:{transcript:text},length:1,isFinal};
        this.current().onresult?.({results:[result],resultIndex:0});
      },
      end(){this.current().onend?.({});}
    };
    window.SpeechRecognition=FakeSpeechRecognition;
    window.webkitSpeechRecognition=FakeSpeechRecognition;
  });
  await start(page);
  await expect(page.locator('[data-action="voice-demo"]')).toBeEnabled();
}
test.describe('Round 4 voice interaction with mocked microphone',()=>{
  test('continuous mode continues past 15 seconds without auto submitting',async({page})=>{
    await startWithVoice(page);
    await page.clock.install();
    await page.locator('[data-action="voice-demo"]').click();
    await expect(page.locator('.ls-v14-voice')).toBeVisible();
    const flags=await page.evaluate(()=>({continuous:__lastsetVoiceMock.current().continuous,interim:__lastsetVoiceMock.current().interimResults}));
    expect(flags).toEqual({continuous:true,interim:true});
    await page.evaluate(()=>__lastsetVoiceMock.say('Deadlift 140x5 then 150x3 then 160x1.'));
    await page.clock.fastForward(16000);
    await expect(page.locator('[data-voice-heading]')).toContainText('Listening');
    await expect(page.locator('.ls-v14-voice')).toBeVisible();
    expect(resistance(await records(page))).toBeUndefined();
    await page.locator('[data-voice-done]').click();
    await expect(page.locator('.ls-mobile-review')).toBeVisible();
    await expect(page.locator('.ls-v14-voice')).toHaveCount(0);
    expect(await page.evaluate(()=>state.aiParsed.items[0].sets.map(s=>[s.weightKg,s.reps])))
      .toEqual([[140,5],[150,3],[160,1]]);
  });
  test('browser early onend pauses and Continue appends without losing earlier speech',async({page})=>{
    await startWithVoice(page);
    await page.locator('[data-action="voice-demo"]').click();
    await page.evaluate(()=>{
      __lastsetVoiceMock.say('Deadlift 140x5 then 150x3 then 160x1.');
      __lastsetVoiceMock.end();
    });
    await expect(page.locator('[data-voice-heading]')).toContainText('paused');
    await expect(page.locator('[data-voice-continue]')).toBeVisible();
    await expect(page.locator('.ls-v14-voice')).toBeVisible();
    expect(resistance(await records(page))).toBeUndefined();
    await page.locator('[data-voice-continue]').click();
    expect(await page.evaluate(()=>__lastsetVoiceMock.starts)).toBe(2);
    await page.evaluate(()=>__lastsetVoiceMock.say('Bench press 80x8 then 85x6.'));
    await page.locator('[data-voice-done]').click();
    await expect(page.locator('.ls-mobile-review')).toBeVisible();
    const text=await page.evaluate(()=>state.aiDraft);
    expect(text.match(/Deadlift/g)).toHaveLength(1);
    expect(text.match(/Bench press/g)).toHaveLength(1);
    const sets=await page.evaluate(()=>state.aiParsed.items.filter(i=>i.kind==='resistance').map(i=>i.sets.map(s=>[s.weightKg,s.reps])));
    expect(sets).toEqual([[[140,5],[150,3],[160,1]],[[80,8],[85,6]]]);
    expect(resistance(await records(page))).toBeUndefined();
  });
  test('voice Cancel keeps existing draft and never commits a workout',async({page})=>{
    await startWithVoice(page);
    await page.locator('#ai-text').fill('Existing note');
    await page.locator('[data-action="voice-demo"]').click();
    await page.evaluate(()=>__lastsetVoiceMock.say('Deadlift 140x5'));
    await expect(page.locator('[data-voice-text]')).toContainText('Deadlift');
    await page.locator('[data-voice-cancel]').click();
    await expect(page.locator('.ls-v14-voice')).toHaveCount(0);
    expect(await page.evaluate(()=>state.aiDraft)).toBe('Existing note');
    expect(resistance(await records(page))).toBeUndefined();
  });
});


test.describe('iPhone voice mishearing recovery — 50 kg bench and assisted dips',()=>{
  test('garbled ASR retains both lifts as flagged candidates and saves only after explicit confirmation',async({page})=>{
    await start(page);
    await parse(page,'50 KG Three steps faucets bench press and then my sister 50 KG seven wraps three cents');
    await expect(page.locator('.ls-mobile-exercise')).toHaveCount(2);
    await expect(page.locator('.ls-mobile-status')).toContainText('2 exercises');
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    const items=await page.evaluate(()=>state.aiParsed.items.map(x=>({
      id:x.exerciseId,sets:x.sets.map(s=>[s.weightKg,s.reps]),warnings:x.p1Warnings,source:x.p1Source
    })));
    expect(items[0].id).toBe('bench-press');
    expect(items[0].sets).toEqual(Array.from({length:4},()=>[50,3]));
    expect(items[1].id).toBeNull();
    expect(items[1].sets).toEqual(Array.from({length:3},()=>[50,7]));
    expect(items[1].warnings.join(' ')).toMatch(/not assumed/i);
    expect(resistance(await records(page))).toBeUndefined();
    await page.locator('[data-mobile-open="0"]').click();
    await expect(page.locator('.ls-mobile-sheet')).toContainText('Speech recognition');
    await page.locator('[data-p1-ack="0"]').check();
    await page.locator('[data-mobile-sheet-close]').first().click();
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    await page.locator('[data-mobile-open="1"]').click();
    await page.locator('[data-p1-exercise="1"]').selectOption('assisted-dip');
    await expect(page.locator('.ls-mobile-sheet')).toContainText('Assisted Dip');
    await page.locator('[data-p1-ack="1"]').check();
    await page.locator('[data-mobile-sheet-close]').first().click();
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    await expect(page.locator('.ls-mobile-success')).toBeVisible();
    const session=resistance(await records(page));
    expect(session.exercises.map(x=>x.exerciseId)).toEqual(['bench-press','assisted-dip']);
    expect(session.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual(Array.from({length:4},()=>[50,3]));
    expect(session.exercises[1].sets.map(s=>[s.weight,s.reps])).toEqual(Array.from({length:3},()=>[50,7]));
  });
  test('clear utterance: bench 50 kg 3 reps 4 sets and assisted dip 50 kg 7 reps 3 sets',async({page})=>{
    await start(page);
    await parse(page,'Bench press 50 kg 3 reps 4 sets. Assisted dip 50 kg 7 reps 3 sets');
    const items=await page.evaluate(()=>state.aiParsed.items.filter(x=>x.kind==='resistance').map(x=>({
      id:x.exerciseId,sets:x.sets.map(s=>[s.weightKg,s.reps]),loadType:x.loadType
    })));
    expect(items.map(x=>x.id)).toEqual(['bench-press','assisted-dip']);
    expect(items[0].sets).toEqual(Array.from({length:4},()=>[50,3]));
    expect(items[1].sets).toEqual(Array.from({length:3},()=>[50,7]));
    expect(items[1].loadType).toBe('assisted');
  });
});


test.describe('Round 4C — natural spoken set count is not a rep sequence',()=>{
  test('exact clean Grok wording: four bench sets plus three assisted dip sets persist after reload',async({page})=>{
    await start(page);
    await parse(page,'Bench Press 50 kg for 3, four sets. Assisted Dip 50 kg assistance for 7, three sets.');
    await expect(page.locator('.ls-mobile-status')).toContainText('2 exercises · 7 sets');
    await expect(page.locator('.ls-mobile-state.good')).toContainText('All clear');
    const expected={
      ids:['bench-press','assisted-dip'],
      sets:[Array.from({length:4},()=>[50,3]),Array.from({length:3},()=>[50,7])]
    };
    const parsed=await page.evaluate(()=>({
      ids:state.aiParsed.items.map(i=>i.exerciseId),
      sets:state.aiParsed.items.map(i=>i.sets.map(s=>[s.weightKg,s.reps]))
    }));
    expect(parsed).toEqual(expected);
    await page.locator('[data-action="confirm-ai-workout"]').click();
    await expect(page.locator('.ls-mobile-success')).toBeVisible();
    expect(resistance(await records(page)).exercises.map(i=>i.sets.map(s=>[s.weight,s.reps]))).toEqual(expected.sets);
    await page.reload({waitUntil:'domcontentloaded'});
    expect(resistance(await records(page)).exercises.map(i=>i.sets.map(s=>[s.weight,s.reps]))).toEqual(expected.sets);
  });
  test('misheard my sister Dip remains unidentified with seven candidate sets until confirmation',async({page})=>{
    await start(page);
    await parse(page,'Bench Press 50 kg for 3, four sets. My sister Dip 50 kg assistance for 7, three sets.');
    await expect(page.locator('.ls-mobile-status')).toContainText('2 exercises · 7 sets');
    await expect(page.locator('.ls-mobile-state.warning')).toContainText('1 issue');
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    const parsed=await page.evaluate(()=>state.aiParsed.items.map(x=>({
      id:x.exerciseId,sets:x.sets.map(s=>[s.weightKg,s.reps]),warnings:x.p1Warnings
    })));
    expect(parsed.map(x=>x.id)).toEqual(['bench-press',null]);
    expect(parsed[0].sets).toEqual(Array.from({length:4},()=>[50,3]));
    expect(parsed[1].sets).toEqual(Array.from({length:3},()=>[50,7]));
    expect(parsed[1].warnings.join(' ')).toMatch(/speech recognition error/i);
    expect(resistance(await records(page))).toBeUndefined();
    await page.locator('[data-mobile-fix-next]').click();
    await page.locator('[data-p1-exercise="1"]').selectOption('assisted-dip');
    await page.locator('[data-p1-ack="1"]').check();
    await page.locator('[data-mobile-sheet-close]').first().click();
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    expect(resistance(await records(page)).exercises.map(i=>[i.exerciseId,i.sets.length])).toEqual([['bench-press',4],['assisted-dip',3]]);
  });
  test('count-first wording three sets of seven and four sets of three',async({page})=>{
    await start(page);
    await parse(page,'Bench Press 50kg four sets of three. Assisted Dip 50 kg three sets of seven.');
    await expect(page.locator('.ls-mobile-status')).toContainText('2 exercises · 7 sets');
    expect(await page.evaluate(()=>state.aiParsed.items.map(i=>i.sets.map(s=>[s.weightKg,s.reps]))))
      .toEqual([Array.from({length:4},()=>[50,3]),Array.from({length:3},()=>[50,7])]);
  });
  test('progressive repetitions without explicit sets remains a sequence not multiplied',async({page})=>{
    await start(page);
    await parse(page,'Bench Press 50 kg for 3, 4 and 5');
    await expect(page.locator('.ls-mobile-status')).toContainText('1 exercises · 3 sets');
    expect(await page.evaluate(()=>state.aiParsed.items[0].sets.map(s=>[s.weightKg,s.reps])))
      .toEqual([[50,3],[50,4],[50,5]]);
  });
});


test.describe('0.16.5 — tap exercise, edit sets, opt-in learn',()=>{
  async function seedHistory(page){
    await page.evaluate(key=>{
      const db=JSON.parse(localStorage.getItem(key));
      db.sessions=db.sessions||{};
      db.sessions['2026-09-20']=[{id:'seed-assisted-history',type:'resistance',createdAt:Date.now()-1209600000,
        exercises:[{exerciseId:'assisted-dip',name:'Assisted Dip',loadType:'assisted',sets:[
          {weight:50,reps:10,setType:'working'},{weight:50,reps:10,setType:'working'},{weight:50,reps:10,setType:'working'}
        ]}]}];
      localStorage.setItem(key,JSON.stringify(db));
    },KEY);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.bottom-nav [data-nav="day"]').click();
    await page.locator('[data-day-action="describe"]').first().click();
  }
  test('history suggestion never triggers old conversation editor; tap Dip and apply all 3×7 directly',async({page})=>{
    await start(page);
    await seedHistory(page);
    await parse(page,'Bench Press 50 kg 3 reps 4 sets. Assisted Dip 50 kg assistance');
    await expect(page.locator('.ls-mobile-review')).toBeVisible();
    await expect(page.locator('.smart-turn.pending')).toHaveCount(0);
    await expect(page.locator('.ls-mobile-exercise')).toHaveCount(2);
    await expect(page.locator('[data-mobile-fix-next]')).toBeVisible();
    expect(await page.evaluate(()=>state.aiParsed.items[1].sets.length)).toBe(0);
    await page.locator('[data-mobile-open="1"]').click();
    await expect(page.locator('.ls-mobile-sheet')).toBeVisible();
    await expect(page.locator('[data-memory-use="1"]')).toBeVisible();
    expect(await page.locator('[data-mobile-quick-reps="1"]').inputValue()).toBe('');
    await page.locator('[data-mobile-quick-sets="1"]').fill('3');
    await page.locator('[data-mobile-quick-reps="1"]').fill('7');
    await page.locator('[data-mobile-quick-weight="1"]').fill('50');
    await page.locator('[data-mobile-apply="1"]').click();
    expect(await page.evaluate(()=>state.aiParsed.items[1].sets.map(s=>[s.weightKg,s.reps])))
      .toEqual([[50,7],[50,7],[50,7]]);
    await page.locator('[data-mobile-sheet-close]').first().click();
    await expect(page.locator('.ls-mobile-status')).toContainText('2 exercises · 7 sets');
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    await expect(page.locator('.ls-mobile-success')).toBeVisible();
    await page.reload({waitUntil:'domcontentloaded'});
    const rows=await page.evaluate(key=>{
      const entries=Object.values(JSON.parse(localStorage.getItem(key)).sessions).flat().filter(s=>s.type==='resistance'&&s.id!=='seed-assisted-history');
      return entries.at(-1).exercises.map(ex=>({id:ex.exerciseId,sets:ex.sets.map(s=>[s.weight,s.reps])}));
    },KEY);
    expect(rows).toEqual([
      {id:'bench-press',sets:Array.from({length:4},()=>[50,3])},
      {id:'assisted-dip',sets:Array.from({length:3},()=>[50,7])}
    ]);
    expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).memory?.aliases||{},KEY)).toEqual({});
  });
  test('bulk edit changes only chosen exercise and survives draft recovery',async({page})=>{
    await start(page);
    await parse(page,'Bench Press 80kg for 8, then 85kg for 6 and 5. Assisted Dip 50 kg');
    await page.locator('[data-mobile-open="1"]').click();
    await page.locator('[data-mobile-quick-sets="1"]').fill('3');
    await page.locator('[data-mobile-quick-reps="1"]').fill('7');
    await page.locator('[data-mobile-quick-weight="1"]').fill('50');
    await page.locator('[data-mobile-apply="1"]').click();
    const sets=await page.evaluate(()=>state.aiParsed.items.map(x=>x.sets.map(s=>[s.weightKg,s.reps])));
    expect(sets).toEqual([[[80,8],[85,6],[85,5]],[[50,7],[50,7],[50,7]]]);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.bottom-nav [data-nav="day"]').click();
    await page.locator('[data-day-action="describe"]').first().click();
    await page.locator('[data-mobile-resume]').click();
    expect(await page.evaluate(()=>state.aiParsed.items.map(x=>x.sets.map(s=>[s.weightKg,s.reps])))).toEqual(sets);
    expect(resistance(await records(page))).toBeUndefined();
  });
  test('corrected misheard name learned only after checkbox and successful save',async({page})=>{
    await start(page);
    await parse(page,'Bench Press 50 kg for 3, four sets. My sister Dip 50 kg assistance for 7, three sets.');
    await page.locator('[data-mobile-fix-next]').click();
    await page.locator('[data-p1-exercise="1"]').selectOption('assisted-dip');
    await expect(page.locator('[data-mobile-remember="1"]')).toBeVisible();
    await page.locator('[data-mobile-remember="1"]').check();
    await expect(page.locator('[data-mobile-alias-phrase="1"]')).toHaveValue('my sister dip');
    // Opted-in corrections must not be learned before the workout is saved.
    expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).memory?.aliases?.['my sister dip'],KEY)).toBeUndefined();
    await page.locator('[data-p1-ack="1"]').check();
    await page.locator('[data-mobile-sheet-close]').first().click();
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toBeEnabled();
    await page.locator('[data-action="confirm-ai-workout"]').click();
    await expect(page.locator('.ls-mobile-success')).toBeVisible();
    const alias=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).memory?.aliases?.['my sister dip'],KEY);
    expect(alias?.exerciseId).toBe('assisted-dip');
    await page.reload({waitUntil:'domcontentloaded'});
    const next=await page.evaluate(()=>parseSmartWorkout('Bench Press 50 kg for 3, four sets. My sister Dip 50 kg assistance for 7, three sets.'));
    expect(next.items.map(x=>x.exerciseId)).toEqual(['bench-press','assisted-dip']);
    expect(next.items[1].sets.map(s=>[s.weightKg,s.reps])).toEqual([[50,7],[50,7],[50,7]]);
    expect(next.items[1].p1Review).toBe(true);
  });
  test('invalid quick values do not alter sets or permit save',async({page})=>{
    await start(page);
    await parse(page,'Assisted Dip 50 kg assistance');
    await page.locator('[data-mobile-open="0"]').click();
    await page.locator('[data-mobile-quick-sets="0"]').fill('3');
    await page.locator('[data-mobile-quick-reps="0"]').fill('');
    await page.locator('[data-mobile-apply="0"]').click();
    await expect(page.locator('.ls-mobile-quick-error')).toContainText('completed reps');
    expect(await page.evaluate(()=>state.aiParsed.items[0].sets.length)).toBe(0);
    await expect(page.locator('[data-action="confirm-ai-workout"]')).toHaveCount(0);
  });
});


test.describe('iPhone microphone permissions — deny and recover',()=>{
  test('denied microphone does not leave a dead-end: retry starts a new recognition session',async({page})=>{
    await startWithVoice(page);
    await page.locator('[data-action="voice-demo"]').click();
    await page.evaluate(()=>{
      const mic=__lastsetVoiceMock.current();
      mic.onerror?.({error:'not-allowed'});
      mic.onend?.({});
    });
    await expect(page.locator('[data-voice-heading]')).toContainText('Microphone access blocked');
    await expect(page.locator('[data-voice-permission-help]')).toBeVisible();
    await expect(page.locator('[data-voice-settings-guide]')).toContainText('Website Settings');
    await expect(page.locator('[data-voice-retry]')).toBeVisible();
    await expect(page.locator('[data-voice-type]')).toBeVisible();
    await expect(page.locator('[data-voice-done]')).toBeHidden();
    expect(await page.evaluate(()=>__lastsetVoiceMock.starts)).toBe(1);
    await page.locator('[data-voice-retry]').click();
    await expect(page.locator('[data-voice-heading]')).toContainText('Listening');
    expect(await page.evaluate(()=>__lastsetVoiceMock.starts)).toBe(2);
    await page.evaluate(()=>__lastsetVoiceMock.say('Bench Press 50 kg 3 reps 4 sets.'));
    await page.locator('[data-voice-done]').click();
    await expect(page.locator('.ls-mobile-review')).toBeVisible();
    await expect(page.locator('.ls-mobile-status')).toContainText('1 exercises · 4 sets');
    expect(resistance(await records(page))).toBeUndefined();
  });
  test('repeated rejection keeps settings guide available and preserves typed draft',async({page})=>{
    await startWithVoice(page);
    await page.locator('#ai-text').fill('Bench press 50kg 3 reps 4 sets.');
    await page.locator('[data-action="voice-demo"]').click();
    await page.evaluate(()=>__lastsetVoiceMock.current().onerror?.({error:'not-allowed'}));
    await page.locator('[data-voice-retry]').click();
    await page.evaluate(()=>__lastsetVoiceMock.current().onerror?.({error:'service-not-allowed'}));
    await expect(page.locator('[data-voice-retry]')).toBeVisible();
    await expect(page.locator('[data-voice-permission-help]')).toBeVisible();
    await page.locator('[data-voice-type]').click();
    await expect(page.locator('.ls-v14-voice')).toHaveCount(0);
    await expect(page.locator('#ai-text')).toHaveValue('Bench press 50kg 3 reps 4 sets.');
    expect(resistance(await records(page))).toBeUndefined();
  });
  test('installed PWA microphone denial displays installed-app privacy instructions',async({page})=>{
    await startWithVoice(page);
    await page.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
    await page.locator('[data-action="voice-demo"]').click();
    await page.evaluate(()=>__lastsetVoiceMock.current().onerror?.({error:'not-allowed'}));
    await expect(page.locator('[data-voice-settings-guide]')).toContainText('Installed LastSet');
    await expect(page.locator('[data-voice-settings-guide]')).toContainText('Privacy & Security');
    await page.locator('[data-voice-cancel]').click();
    await expect(page.locator('.ls-v14-voice')).toHaveCount(0);
  });
});


test.describe('P1 save confirmation dismissal and follow-through',()=>{
  const phrase='Bench Press 50 kg for 3, four sets. Assisted Dip 50 kg assistance for 7, three sets.';
  const expected=[Array.from({length:4},()=>[50,3]),Array.from({length:3},()=>[50,7])];

  test('View workout removes modal immediately, reveals correct saved sets and stays closed after navigation/reload',async({page})=>{
    await start(page);
    await parse(page,phrase);
    await expect(page.locator('.ls-mobile-status')).toContainText('2 exercises · 7 sets');
    await page.locator('[data-action="confirm-ai-workout"]').click();
    await expect(page.locator('.ls-mobile-success')).toBeVisible();
    await expect(page.locator('[data-mobile-view]')).toBeVisible();
    await page.locator('[data-mobile-view]').click();
    await expect(page.locator('.ls-mobile-success')).toHaveCount(0);
    await expect(page.locator('.session-card')).toContainText('Bench Press');
    await expect(page.locator('.session-card')).toContainText('Assisted Dip');
    await expect(page.locator('.session-card')).toContainText('50 kg');
    expect(resistance(await records(page)).exercises.map(x=>x.sets.map(s=>[s.weight,s.reps]))).toEqual(expected);
    await page.locator('.bottom-nav [data-nav="day"]').click();
    await expect(page.locator('.ls-mobile-success')).toHaveCount(0);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.ls-mobile-success')).toHaveCount(0);
    expect(resistance(await records(page)).exercises.map(x=>x.sets.map(s=>[s.weight,s.reps]))).toEqual(expected);
  });

  test('Back to Today dismisses modal and allows immediate second workout interaction',async({page})=>{
    await start(page);
    await parse(page,phrase);
    await page.locator('[data-action="confirm-ai-workout"]').click();
    await expect(page.locator('.ls-mobile-success')).toBeVisible();
    await page.locator('[data-mobile-today]').click();
    await expect(page.locator('.ls-mobile-success')).toHaveCount(0);
    await expect(page.locator('[data-day-action="describe"]').first()).toBeVisible();
    await page.locator('[data-day-action="describe"]').first().click();
    await expect(page.locator('#ai-text')).toBeVisible();
    await expect(page.locator('.ls-mobile-success')).toHaveCount(0);
    expect(resistance(await records(page)).exercises.map(x=>x.sets.map(s=>[s.weight,s.reps]))).toEqual(expected);
  });

  test('rapid repeated Save click does not duplicate sessions and modal dismisses once',async({page})=>{
    await start(page);
    await parse(page,phrase);
    await page.evaluate(()=>{
      const button=document.querySelector('[data-action="confirm-ai-workout"]');
      button.click();
      button.click();
    });
    await expect(page.locator('.ls-mobile-success')).toHaveCount(1);
    const before=await records(page);
    const resistanceRecords=Object.values(before).flat().filter(s=>s.type==='resistance');
    expect(resistanceRecords).toHaveLength(1);
    expect(resistanceRecords[0].exercises.map(x=>x.sets.map(s=>[s.weight,s.reps]))).toEqual(expected);
    await page.locator('[data-mobile-today]').click();
    await expect(page.locator('.ls-mobile-success')).toHaveCount(0);
    const after=await records(page);
    expect(Object.values(after).flat().filter(s=>s.type==='resistance')).toHaveLength(1);
  });

  test('dismissed success modal never reappears on rerender',async({page})=>{
    await start(page);
    await parse(page,phrase);
    await page.locator('[data-action="confirm-ai-workout"]').click();
    await expect(page.locator('.ls-mobile-success')).toBeVisible();
    await page.locator('[data-mobile-today]').click();
    await expect(page.locator('.ls-mobile-success')).toHaveCount(0);
    await page.evaluate(()=>render());
    await expect(page.locator('.ls-mobile-success')).toHaveCount(0);
    await page.locator('.bottom-nav [data-nav="profile"]').click();
    await page.locator('.bottom-nav [data-nav="day"]').click();
    await expect(page.locator('.ls-mobile-success')).toHaveCount(0);
  });
});
