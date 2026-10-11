(() => {
  'use strict';

  const VERSION = '0.12.9';
  const USER_SPACES_KEY = 'lastset-user-spaces-v1';

  const clone = value => JSON.parse(JSON.stringify(value));
  const dateOnlyFromTimestamp = ts => {
    const d = new Date(Number(ts));
    if (!Number.isFinite(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const dayDiff = (laterIso, earlierIso) => {
    const a = Date.parse(`${laterIso}T12:00:00`);
    const b = Date.parse(`${earlierIso}T12:00:00`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.round((a-b)/86400000);
  };

  function isLegacyDemoSession(date, session){
    if (!session || session.type !== 'resistance' || !Array.isArray(session.exercises) || session.exercises.length !== 1) return false;
    const ex = session.exercises[0];
    if (!ex || !['chest-press','Chest Press','Chest Press Machine'].includes(ex.exerciseId || ex.name)) return false;
    const sets = ex.sets || [];
    const sig = [[50,12],[55,10],[55,8]];
    if (sets.length !== sig.length) return false;
    const exact = sets.every((s,i)=>Number(s.weight)===sig[i][0] && Number(s.reps)===sig[i][1]);
    if (!exact || ex.note || session.label) return false;
    const createdDate = dateOnlyFromTimestamp(session.createdAt);
    return createdDate ? dayDiff(createdDate,date) === 4 : false;
  }

  function stripLegacyDemoSession(value){
    let changed = false;
    if (!value || !value.sessions || typeof value.sessions !== 'object') return changed;
    Object.keys(value.sessions).forEach(date=>{
      const before = Array.isArray(value.sessions[date]) ? value.sessions[date] : [];
      const after = before.filter(session=>!isLegacyDemoSession(date,session));
      if (after.length !== before.length) changed = true;
      if (after.length) value.sessions[date] = after;
      else delete value.sessions[date];
    });
    return changed;
  }

  // Only remove the single seeded demonstration exercise from a genuinely
  // unclaimed new profile. Do not erase a real lifter's matching workout.
  function shouldCleanSeedDemo(value){
    const profile=value?.profile||{};
    const named=String(profile.name||profile.userLabel||'').trim();
    const sessionCount=Object.values(value?.sessions||{}).reduce((total,items)=>total+(Array.isArray(items)?items.length:0),0);
    return !named && sessionCount===1;
  }

  function emptyUserData(name='', previousProfile={}, preserveProfile=false){
    return {
      sessions:{}, aliases:{}, machines:{},
      profile:{
        name:String(name||'').trim(),
        weightUnit:preserveProfile?(previousProfile.weightUnit||'kg'):'kg',
        heightCm:preserveProfile?(Number(previousProfile.heightCm)||0):0,
        bodyWeightKg:preserveProfile?(Number(previousProfile.bodyWeightKg)||0):0,
        progressionPreference:preserveProfile?(previousProfile.progressionPreference||'reps_first'):'reps_first'
      },
      templates:[], favorites:[], exerciseSettings:{}, plans:{}, dayMeta:{}, schemaVersion:11
    };
  }

  function targetDateForTemplate(originView, selectedDate, todayIso){
    return originView === 'profile' ? todayIso : selectedDate;
  }

  function loadTypeForItem(item, catalogue){
    const ex = (catalogue||[]).find(x=>x.id===item.exerciseId);
    return ex?.loadType || item.loadType || 'external';
  }

  function buildProgressRows(value, catalogue){
    const history = {};
    Object.entries(value?.sessions||{}).forEach(([date,sessions])=>{
      (sessions||[]).filter(s=>s.type==='resistance').forEach(session=>{
        (session.exercises||[]).forEach(item=>{
          const id=item.exerciseId||item.name;
          if(!id) return;
          const type=loadTypeForItem(item,catalogue);
          if(!history[id]) history[id]={id,name:item.name||id,type,dates:new Set(),lastDate:date,best:null};
          const h=history[id];
          h.type=type; h.dates.add(date); if(date>h.lastDate)h.lastDate=date;
          (item.sets||[]).filter(s=>s.setType!=='warmup').forEach(set=>{
            if(type==='timed'){
              const sec=Number(set.durationSeconds)||0;
              if(sec>0 && (!h.best || sec>h.best.sec)) h.best={sec};
              return;
            }
            const reps=Number(set.reps)||0;
            if(reps<=0) return;
            const weight=set.weight==null?null:Number(set.weight);
            if(type==='assisted'){
              if(weight==null || !Number.isFinite(weight)) return;
              if(!h.best || weight<h.best.weight || (weight===h.best.weight && reps>h.best.reps)) h.best={weight,reps};
            }else if(type==='bodyweight'){
              const added=Number.isFinite(weight)&&weight>0?weight:0;
              if(!h.best || added>h.best.added || (added===h.best.added && reps>h.best.reps)) h.best={added,reps};
            }else{
              const w=Number.isFinite(weight)?weight:0;
              if(!h.best || w>h.best.weight || (w===h.best.weight && reps>h.best.reps)) h.best={weight:w,reps};
            }
          });
        });
      });
    });
    return Object.values(history).map(h=>{
      let bestLabel='No completed working sets';
      if(h.best){
        if(h.type==='timed') bestLabel=`Best ${h.best.sec} sec`;
        else if(h.type==='assisted') bestLabel=`Best ${h.best.weight} kg assistance × ${h.best.reps}`;
        else if(h.type==='bodyweight') bestLabel=h.best.added>0?`Best BW + ${h.best.added} kg × ${h.best.reps}`:`Best ${h.best.reps} reps`;
        else bestLabel=`Best ${h.best.weight} kg × ${h.best.reps}`;
      }
      return {id:h.id,name:h.name,type:h.type,sessions:h.dates.size,lastDate:h.lastDate,bestLabel};
    }).sort((a,b)=>b.lastDate.localeCompare(a.lastDate));
  }

  // Backups are parsed before they can replace the active user's data.
  // Keep older exports compatible, but reject damaged nested workout records.
  function validateBackup(value){
    const object=v=>!!v && typeof v==='object' && !Array.isArray(v);
    const numeric=v=>v==null || (typeof v==='number' && Number.isFinite(v)) ||
      (typeof v==='string' && v.trim()!=='' && Number.isFinite(Number(v)));
    if(!object(value) || !object(value.sessions)) return false;
    if(value.profile!=null && !object(value.profile)) return false;
    if(value.templates!=null && (!Array.isArray(value.templates) || !value.templates.every(object))) return false;
    if(value.favorites!=null && !Array.isArray(value.favorites)) return false;
    if(value.imports!=null && !Array.isArray(value.imports)) return false;
    if(value.plans!=null && !object(value.plans)) return false;
    if(value.schemaVersion!=null && !numeric(value.schemaVersion)) return false;
    for(const [date,sessions] of Object.entries(value.sessions)){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(sessions)) return false;
      for(const session of sessions){
        if(!object(session)) return false;
        if(session.type!=null && typeof session.type!=='string') return false;
        if(session.type==='resistance' && !Array.isArray(session.exercises)) return false;
        if(session.exercises!=null){
          if(!Array.isArray(session.exercises)) return false;
          for(const exercise of session.exercises){
            if(!object(exercise)) return false;
            if(exercise.sets!=null){
              if(!Array.isArray(exercise.sets)) return false;
              for(const set of exercise.sets){
                if(!object(set)) return false;
                if(set.setType!=null && typeof set.setType!=='string') return false;
                if(['weight','weightKg','reps','durationSeconds'].some(k=>set[k]!==undefined && !numeric(set[k]))) return false;
              }
            }
          }
        }
      }
    }
    return true;
  }

  const BACKUP_ARCHIVE_FORMAT='lastset-all-profiles-v1';
  function profileArchive(reg,current){
    if(!reg || !Array.isArray(reg.users)) throw new Error('Profile registry not available');
    const active=reg.activeId;
    const users=reg.users.map(u=>({
      id:u.id,name:u.name||u.data?.profile?.name||'User',
      data:clone(u.id===active?current:u.data)
    }));
    if(!users.length && validateBackup(current)){
      users.push({id:current?.profile?.userId||'active-user',name:current?.profile?.name||'User',data:clone(current)});
    }
    if(!users.length || users.some(u=>!validateBackup(u.data))) throw new Error('Cannot back up an invalid user record');
    return {format:BACKUP_ARCHIVE_FORMAT,version:1,exportedAt:new Date().toISOString(),activeId:active,users};
  }
  function parseProfileRestore(input){
    if(validateBackup(input)) return [clone(input)];
    if(!input || input.format!==BACKUP_ARCHIVE_FORMAT || input.version!==1 ||
      !Array.isArray(input.users) || !input.users.length || input.users.length>100) return null;
    if(input.users.some(u=>!u || typeof u!=='object' || !validateBackup(u.data))) return null;
    return input.users.map(u=>clone(u.data));
  }
  // The import is an additive snapshot of the registry. It cannot change the
  // active profile or erase existing user data, even for old backups.
  function restoredRegistry(currentReg,restore,makeId){
    if(!currentReg || !Array.isArray(currentReg.users) || !Array.isArray(restore) ||
      !restore.length || restore.some(x=>!validateBackup(x))) throw new Error('Unsafe recovery data');
    const result=clone(currentReg);
    const currentIds=new Set(result.users.map(x=>x.id));
    for(const item of restore){
      let id;
      do {id=makeId();} while(currentIds.has(id));
      currentIds.add(id);
      item.profile=item.profile||{};
      item.profile.userId=id;
      const name=String(item.profile.name||item.profile.userLabel||'Recovered User').trim()||'Recovered User';
      result.users.push({id,name,data:clone(item),updatedAt:Date.now(),recovered:true});
    }
    return result;
  }

  function validateCardioNumbers(values){
    const checks=[
      ['Duration',values.duration,0,1440],['Distance',values.distance,0,1000],['Average speed',values.avgSpeed,0,120],
      ['Incline',values.incline,0,50],['Heart rate',values.heartRate,0,260],['Calories',values.calories,0,20000],
      ['Resistance level',values.resistanceLevel,0,100],['Cadence',values.cadence,0,300],['Power',values.power,0,3000],
      ['Level',values.level,0,100],['Floors',values.floors,0,10000]
    ];
    for(const [label,raw,min,max] of checks){
      const n=Number(raw)||0;
      if(n<min || n>max) return `${label} looks invalid`;
    }
    return '';
  }

  const TEST_API={isLegacyDemoSession,shouldCleanSeedDemo,stripLegacyDemoSession,emptyUserData,targetDateForTemplate,buildProgressRows,validateBackup,validateCardioNumbers,profileArchive,parseProfileRestore,restoredRegistry};
  if(typeof globalThis!=='undefined' && globalThis.__LASTSET_TEST_ONLY__){
    globalThis.LastSetIntegrityTest=TEST_API;
    return;
  }
  if(typeof window==='undefined' || typeof document==='undefined') return;

  const baseLoadData = typeof loadData==='function' ? loadData : null;
  const baseSaveData = typeof saveData==='function' ? saveData : null;
  const baseSaveCardio = typeof saveCardio==='function' ? saveCardio : null;
  const baseSaveExercise = typeof saveExercise==='function' ? saveExercise : null;

  function storageAvailable(){
    try{
      const key='__lastset_storage_test__';
      localStorage.setItem(key,'1');
      const ok=localStorage.getItem(key)==='1';
      localStorage.removeItem(key);
      return ok;
    }catch(_){ return false; }
  }

  let registryCorrupted=false;
  function readRegistry(){
    try{
      const raw=localStorage.getItem(USER_SPACES_KEY);
      if(raw===null) return {version:1,activeId:null,users:[]};
      const parsed=JSON.parse(raw);
      if(parsed && Array.isArray(parsed.users)) return parsed;
      throw new Error('Stored user registry is invalid');
    }catch(err){
      registryCorrupted=true;
      if(typeof reportStorageFailure==='function') reportStorageFailure(err);
      // Do not silently replace the damaged registry; block further writes.
      return {version:1,activeId:null,users:[]};
    }
  }
  function writeRegistry(reg){
    try{
      if(registryCorrupted) throw new Error('Unreadable user registry: refusing to overwrite');
      const encoded=JSON.stringify(reg);
      localStorage.setItem(USER_SPACES_KEY,encoded);
      if(localStorage.getItem(USER_SPACES_KEY)!==encoded) throw new Error('Profile save verification failed');
      return true;
    }catch(err){
      if(typeof reportStorageFailure==='function') reportStorageFailure(err);
      return false;
    }
  }
  function userId(){ return `user_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

  let syncingRegistry=false;
  function ensureRegistry(){
    const reg=readRegistry();
    if(registryCorrupted) throw new Error('User registry is unreadable; export your data before further changes');
    let changed=false;
    // lastset-data-v1 is the active profile on this device. If a profile
    // switch was interrupted between its two writes, this persisted user ID
    // takes precedence over an earlier registry activeId.
    const persistedId=data?.profile?.userId;
    if(persistedId && reg.activeId!==persistedId && reg.users.some(u=>u.id===persistedId)){
      reg.activeId=persistedId;changed=true;
    }
    if(!reg.activeId || !reg.users.some(u=>u.id===reg.activeId)){
      const id=data?.profile?.userId || userId();
      data.profile=data.profile||{};
      data.profile.userId=id;
      reg.activeId=id;
      const existing=reg.users.find(u=>u.id===id);
      const snapshot=clone(data);
      if(existing){ existing.data=snapshot; existing.name=data.profile.name||existing.name||'Current user'; existing.updatedAt=Date.now(); }
      else reg.users.push({id,name:data.profile.name||'Current user',data:snapshot,updatedAt:Date.now()});
      changed=true;
      if(baseSaveData) baseSaveData(data);
    }
    if(changed && !writeRegistry(reg)) throw new Error('Could not persist profile registry');
    return reg;
  }

  function syncActiveSnapshot(value){
    if(syncingRegistry) return;
    syncingRegistry=true;
    try{
      const reg=ensureRegistry();
      let user=reg.users.find(u=>u.id===reg.activeId);
      if(!user){ user={id:reg.activeId||userId(),name:'Current user',data:null,updatedAt:0}; reg.activeId=user.id; reg.users.push(user); }
      user.name=value?.profile?.name||user.name||'Current user';
      user.data=clone(value);
      user.updatedAt=Date.now();
      if(!writeRegistry(reg)) throw new Error('LastSet user history could not be saved');
    }finally{ syncingRegistry=false; }
  }

  if(baseLoadData){
    loadData=function(){
      const value=baseLoadData();
      if(shouldCleanSeedDemo(value) && stripLegacyDemoSession(value) && baseSaveData) baseSaveData(value);
      return value;
    };
  }

  if(typeof data!=='undefined' && shouldCleanSeedDemo(data) && stripLegacyDemoSession(data) && baseSaveData) baseSaveData(data);

  if(baseSaveData){
    saveData=function(value){
      baseSaveData(value);
      syncActiveSnapshot(value);
      // Only the verified two-part transaction clears an earlier
      // storage-failure notice. A partial active-profile write cannot.
      document.getElementById('ls-save-failure')?.remove();
      return true;
    };
  }
  try{
    ensureRegistry();
    syncActiveSnapshot(data);
  }catch(err){
    if(typeof reportStorageFailure==='function') reportStorageFailure(err);
  }

  function resetViewTo(date){
    state.selectedDate=date;
    state.month=new Date(`${date}T12:00:00`);
    state.month=new Date(state.month.getFullYear(),state.month.getMonth(),1);
    state.tab=date===isoDate(new Date())?'today':'calendar';
    state.view='day';
    state.selectedExercise=null; state.editingExercise=null; state.editingCardioId=null;
    state.resistanceDraft={sets:[]}; state.cardioDraft={};
  }

  function switchToUser(id){
    try{
      syncActiveSnapshot(data);
      const reg=readRegistry();
      if(registryCorrupted) throw new Error('Profile registry is unreadable');
      const target=reg.users.find(u=>u.id===id);
      if(!target || !validateBackup(target.data)) return false;
      const next=clone(target.data);
      next.profile=next.profile||{};next.profile.userId=id;
      const previousActiveId=reg.activeId;
      reg.activeId=id;
      if(!writeRegistry(reg)) return false;
      try{if(baseSaveData) baseSaveData(next);}
      catch(err){
        reg.activeId=previousActiveId;
        writeRegistry(reg);
        throw err;
      }
      data=next;
      resetViewTo(isoDate(new Date()));
      render();
      showToast(`Switched to ${data.profile.name||'user'}`);
      return true;
    }catch(err){
      if(typeof reportStorageFailure==='function') reportStorageFailure(err);
      showToast('Could not switch users safely. Existing workout data is unchanged.');
      return false;
    }
  }

  function createNewUser(name,deleteCurrent){
    try{
      syncActiveSnapshot(data);
      const reg=readRegistry();
      if(registryCorrupted) throw new Error('Profile registry is unreadable');
      const original=clone(reg);
      const currentId=reg.activeId;
      if(deleteCurrent) reg.users=reg.users.filter(u=>u.id!==currentId);
      const id=userId();
      const fresh=emptyUserData(name);
      fresh.profile.userId=id;
      reg.activeId=id;
      reg.users.push({id,name:name||'New user',data:clone(fresh),updatedAt:Date.now()});
      if(!writeRegistry(reg)) return false;
      try{if(baseSaveData)baseSaveData(fresh);}
      catch(err){writeRegistry(original);throw err;}
      data=fresh;
      resetViewTo(isoDate(new Date()));
      render();
      showToast('New user started fresh');
      return true;
    }catch(err){
      if(typeof reportStorageFailure==='function')reportStorageFailure(err);
      showToast('Could not create a new profile safely.');
      return false;
    }
  }

  function deleteInactiveUser(id){
    const reg=readRegistry();
    if(id===reg.activeId) return false;
    reg.users=reg.users.filter(u=>u.id!==id);
    return writeRegistry(reg);
  }

  function openUsersManager(){
    document.querySelector('.ls-users-modal')?.remove();
    const reg=readRegistry();
    const active=reg.activeId;
    const overlay=document.createElement('div');
    overlay.className='ls-users-modal';
    overlay.innerHTML=`<div class="ls-users-panel"><div class="ls-users-head"><div><div class="ls-integrity-kicker">Profiles</div><h3>Users and training data</h3></div><button type="button" data-users-close>×</button></div>
      <p class="muted">Each user keeps separate workout history, Saved Workouts and progress.</p>
      <div class="ls-users-list">${reg.users.map(u=>`<div class="ls-user-row"><div><strong>${escapeHtml(u.name||'Unnamed user')}</strong><small>${u.id===active?'Current user':'Stored profile'}</small></div><div class="ls-user-actions">${u.id===active?'<span class="session-tag">Active</span>':`<button class="secondary" type="button" data-user-switch="${u.id}">Switch</button><button class="mini-btn danger" type="button" data-user-delete="${u.id}">Delete</button>`}</div></div>`).join('')}</div>
      <button class="primary" type="button" data-user-new>Start a new user</button>
    </div>`;
    document.body.appendChild(overlay);
    const close=()=>overlay.remove();
    overlay.querySelector('[data-users-close]').onclick=close;
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.querySelectorAll('[data-user-switch]').forEach(btn=>btn.onclick=()=>{if(switchToUser(btn.dataset.userSwitch))close();});
    overlay.querySelectorAll('[data-user-delete]').forEach(btn=>btn.onclick=()=>{
      const u=reg.users.find(x=>x.id===btn.dataset.userDelete);
      if(!confirm(`Permanently delete ${u?.name||'this user'} and all stored training data?`)) return;
      if(deleteInactiveUser(btn.dataset.userDelete)){close();openUsersManager();}
      else showToast('Could not delete profile. Please export a backup first.');
    });
    overlay.querySelector('[data-user-new]').onclick=()=>openNewUserDialog(close);
  }

  function openNewUserDialog(closeParent){
    closeParent?.();
    document.querySelector('.ls-new-user-modal')?.remove();
    const reg=readRegistry();
    const current=reg.users.find(u=>u.id===reg.activeId);
    const overlay=document.createElement('div');
    overlay.className='ls-users-modal ls-new-user-modal';
    overlay.innerHTML=`<div class="ls-users-panel"><div class="ls-users-head"><div><div class="ls-integrity-kicker">New user</div><h3>Start fresh</h3></div><button type="button" data-new-close>×</button></div>
      <label class="ls-integrity-label">Name</label><input class="ls-integrity-input" id="ls-new-user-name" maxlength="40" placeholder="New user name">
      <div class="ls-choice-card"><strong>Keep ${escapeHtml(current?.name||'current user')} and start fresh</strong><p>Your existing workouts stay stored and you can switch back later.</p><button class="primary" type="button" data-new-keep>Keep existing data and start new user</button></div>
      <div class="ls-choice-card danger"><strong>Delete current user and start fresh</strong><p>This permanently removes the current user’s stored history after one more confirmation.</p><button class="secondary" type="button" data-new-delete>Delete current data and start new user</button></div>
    </div>`;
    document.body.appendChild(overlay);
    const close=()=>overlay.remove();
    overlay.querySelector('[data-new-close]').onclick=close;
    const name=()=>overlay.querySelector('#ls-new-user-name').value.trim();
    overlay.querySelector('[data-new-keep]').onclick=()=>{ if(!name()){showToast('Enter the new user name');return;} if(createNewUser(name(),false))close(); };
    overlay.querySelector('[data-new-delete]').onclick=()=>{
      if(!name()){showToast('Enter the new user name');return;}
      if(!confirm(`Permanently delete ${current?.name||'the current user'} and all training data? This cannot be undone unless you exported a backup.`)) return;
      if(createNewUser(name(),true))close();
    };
  }

  repeatLastResistanceWorkout=function(){
    if(getResistanceSession(state.selectedDate)){ showToast('A resistance workout already exists for this day'); return; }
    const last=findLastResistanceWorkout(state.selectedDate);
    if(!last){ showToast('No previous resistance workout found'); return; }
    data.plans=data.plans||{};
    data.plans[state.selectedDate]={
      templateId:null,
      name:last.session.label||'Previous workout',
      exerciseIds:[...new Set((last.session.exercises||[]).map(e=>e.exerciseId).filter(Boolean))],
      source:'previous-workout', sourceDate:last.date, createdAt:Date.now()
    };
    saveData(data);
    render();
    showToast('Previous workout added as a plan');
  };

  let templateOriginView='day';
  const baseStartTemplate = typeof startTemplate==='function' ? startTemplate : null;
  if(baseStartTemplate){
    startTemplate=function(id){
      const t=(data.templates||[]).find(x=>x.id===id); if(!t)return;
      const today=isoDate(new Date());
      const target=targetDateForTemplate(templateOriginView,state.selectedDate,today);
      state.selectedDate=target;
      data.plans=data.plans||{};
      data.plans[target]={templateId:t.id,name:t.name,exerciseIds:[...t.exerciseIds],createdAt:Date.now()};
      const r=getResistanceSession(target); if(r)r.label=t.name;
      saveData(data);
      state.tab=target===today?'today':'calendar'; state.view='day';
      showToast(`${t.name} ready`);
    };
  }

  function mergeSmartResistance(parsed){
    const resistanceItems=parsed.items.filter(it=>it.kind==='resistance');
    if(!resistanceItems.length) return;
    let session=getResistanceSession(state.selectedDate);
    if(!session){
      session={id:cryptoId(),type:'resistance',createdAt:Date.now(),exercises:[]};
      if(!data.sessions[state.selectedDate])data.sessions[state.selectedDate]=[];
      data.sessions[state.selectedDate].push(session);
    }
    resistanceItems.forEach(it=>{
      const ex=EXERCISES.find(e=>e.id===it.exerciseId);
      const type=it.loadType||ex?.loadType||'external';
      const sets=(it.sets||[]).filter(s=>type==='timed'?Number(s.durationSeconds)>0:Number(s.reps)>0).map(s=>
        type==='timed'
          ? {durationSeconds:Number(s.durationSeconds),weight:0,reps:0,setType:s.setType||'working'}
          : {weight:s.weightKg==null?(type==='bodyweight'?0:null):Number(s.weightKg),reps:Number(s.reps),setType:s.setType||'working'}
      );
      const note=[it.notes,'Logged with Smart Log'].filter(Boolean).join(' · ');
      const existing=session.exercises.find(e=>e.exerciseId===it.exerciseId);
      if(existing){
        existing.sets=[...(existing.sets||[]),...sets];
        existing.loadType=type;
        if(note && !(existing.note||'').includes(note)) existing.note=[existing.note,note].filter(Boolean).join(' · ');
      }else{
        session.exercises.push({exerciseId:it.exerciseId||`smart-${slugify(it.name)}`,name:it.name,loadType:type,sets,note});
      }
    });
  }

  saveSmartLogWorkout=function(){
    const p=state.aiParsed;
    if(!p||!Array.isArray(p.items)||!p.items.length){showToast('Nothing to log');return;}
    if(getSmartMissing(p)){showToast('Answer the missing detail before saving');return;}
    removeRestSessions(state.selectedDate);
    mergeSmartResistance(p);
    p.items.filter(it=>it.kind==='cardio').forEach(it=>{
      if(!data.sessions[state.selectedDate])data.sessions[state.selectedDate]=[];
      data.sessions[state.selectedDate].push({id:cryptoId(),type:'cardio',activity:it.name||'Other',duration:it.durationMinutes||0,distance:it.distanceKm||0,environment:it.environment||'',avgSpeed:it.avgSpeed||0,incline:it.incline==null?0:it.incline,pace:it.pace||'',speedIntervals:it.speedIntervals||[],intervalMinutes:it.intervalMinutes||0,cooldown:!!it.cooldown,resistanceLevel:it.resistanceLevel||0,cadence:it.cadence||0,power:it.power||0,level:it.level||0,floors:it.floors||0,heartRate:it.heartRate||0,calories:it.calories||0,notes:[it.notes,'Logged with Smart Log'].filter(Boolean).join(' · '),createdAt:Date.now()});
    });
    saveData(data);
    state.aiParsed=null; state.aiDraft=''; state.aiError=''; state.aiSource=''; state.aiCorrection=''; state.smartConversation=[]; state.aiLoading=false; state.view='day';
    showToast('Smart workout logged');
  };

  progressScreen=function(){
    const rows=buildProgressRows(data,EXERCISES);
    return `<main class="container"><h2 style="margin:4px 0 14px">Progress</h2><div class="card">${rows.length?rows.map(h=>`<div class="progress-row"><strong>${escapeHtml(h.name)}</strong><span>${h.sessions} session${h.sessions===1?'':'s'} · ${escapeHtml(h.bestLabel)} · Last ${dateLabel(h.lastDate)}</span></div>`).join(''):`<div class="empty">Your exercise history will appear here.</div>`}</div>${(data.templates||[]).length?`<div class="section-title">Saved Workouts</div><div class="card">${data.templates.map(t=>`<div class="progress-row"><strong>${escapeHtml(t.name)}</strong><span>${t.exerciseIds.length} exercises</span></div>`).join('')}</div>`:''}</main>`;
  };

  if(baseSaveCardio){
    saveCardio=function(){
      const values={duration:valueNum('cardio-duration'),distance:valueNum('cardio-distance'),avgSpeed:valueNum('cardio-speed'),incline:valueNum('cardio-incline'),heartRate:valueNum('cardio-hr'),calories:valueNum('cardio-cal'),resistanceLevel:valueNum('cardio-resistance'),cadence:valueNum('cardio-cadence'),power:valueNum('cardio-power'),level:valueNum('cardio-level'),floors:valueNum('cardio-floors')};
      const error=validateCardioNumbers(values); if(error){showToast(error);return;}
      baseSaveCardio();
    };
  }
  if(baseSaveExercise){
    saveExercise=function(addNext=false){
      const e=EXERCISES.find(x=>x.id===state.selectedExercise);
      for(const s of state.resistanceDraft.sets||[]){
        if(e?.loadType==='timed'){
          const sec=Number(s.durationSeconds)||0; if(sec<0||sec>7200){showToast('Timed set looks invalid');return;}
        }else{
          const reps=Number(s.reps)||0; const weight=String(s.weight??'').trim()===''?0:Number(s.weight);
          if(reps<0||reps>500){showToast('Rep count looks invalid');return;}
          if(!Number.isFinite(weight)||weight<0||weight>1000){showToast(e?.loadType==='assisted'?'Assistance value looks invalid':'Weight looks invalid');return;}
        }
      }
      baseSaveExercise(addNext);
    };
  }

  function downloadJsonBackup(payload,name){
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    // Immediate revocation can invalidate a download on iOS Safari.
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function exportAllProfiles(){
    try{
      syncActiveSnapshot(data);
      const raw=localStorage.getItem(USER_SPACES_KEY);
      if(raw==null) throw new Error('Profile registry missing');
      const reg=JSON.parse(raw);
      const archive=profileArchive(reg,data);
      downloadJsonBackup(archive,'lastset-all-profiles-backup.json');
      showToast('All profiles backup prepared — keep the file outside LastSet');
    }catch(err){
      if(typeof reportStorageFailure==='function') reportStorageFailure(err);
      showToast('Could not verify all profiles for backup. Export the current user instead.');
    }
  }
  function importBackupFile(file){
    if(!file || file.size>30*1024*1024){showToast('Choose a backup smaller than 30 MB');return;}
    const reader=new FileReader();
    reader.onerror=()=>showToast('Could not read the selected backup');
    reader.onload=()=>{
      try{
        const parsed=JSON.parse(String(reader.result||''));
        const restore=parseProfileRestore(parsed);
        if(!restore) throw new Error('Invalid LastSet backup');
        // A file restore must NEVER overwrite current or newer workouts.
        const quantity=restore.length;
        if(!confirm('Recover '+quantity+' profile(s) as NEW profiles on this device? Existing workouts and profiles will not be replaced. You can switch to recovered profiles afterwards.')) return;
        syncActiveSnapshot(data);
        const raw=localStorage.getItem(USER_SPACES_KEY);
        if(raw==null) throw new Error('Profile registry missing');
        const reg=JSON.parse(raw);
        if(!reg || !Array.isArray(reg.users)) throw new Error('Corrupt profile registry');
        const next=restoredRegistry(reg,restore,userId);
        if(!writeRegistry(next)) throw new Error('Device storage could not save recovered profiles');
        render();
        showToast(quantity+' profile(s) recovered. Open Manage users to switch.');
      }catch(err){
        console.warn('LastSet backup recovery failed:',err?.message||'Error');
        showToast('Backup not restored. Existing training data was not changed.');
      }
    };
    reader.readAsText(file);
  }

  const style=document.createElement('style');
  style.id='lastset-integrity-style';
  style.textContent=`
    .ls-integrity-card{border:1px solid rgba(169,255,80,.32);background:linear-gradient(135deg,rgba(28,20,45,.98),rgba(14,28,26,.96));border-radius:20px;padding:15px;margin:12px 0}.ls-integrity-kicker{text-transform:uppercase;letter-spacing:.16em;font-size:10px;font-weight:900;color:#a9ff50}.ls-integrity-card strong{display:block;font-size:15px;margin-top:4px}.ls-integrity-card p{font-size:11px;line-height:1.45;color:var(--muted);margin:5px 0 11px}.ls-integrity-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ls-storage-ok{color:#a9ff50}.ls-storage-bad{color:#ff8f9b}.ls-users-modal{position:fixed;inset:0;z-index:1300;background:rgba(5,3,12,.86);backdrop-filter:blur(12px);display:flex;align-items:flex-end;justify-content:center;padding:10px}.ls-users-panel{width:min(680px,100%);max-height:92vh;overflow:auto;background:#110d1c;border:1px solid #493066;border-radius:24px;padding:18px;box-shadow:0 -18px 60px rgba(0,0,0,.55)}.ls-users-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.ls-users-head h3{margin:3px 0 0}.ls-users-head>button{width:38px;height:38px;border-radius:11px;border:1px solid #493066;background:#1a1228;color:#fff;font-size:20px}.ls-users-list{display:grid;gap:8px;margin:14px 0}.ls-user-row{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #352747;border-radius:14px;background:#151020;padding:11px}.ls-user-row strong,.ls-user-row small{display:block}.ls-user-row small{font-size:10px;color:var(--muted);margin-top:3px}.ls-user-actions{display:flex;align-items:center;gap:6px}.ls-user-actions .secondary{width:auto;padding:8px 10px}.ls-integrity-label{display:block;font-size:11px;font-weight:800;color:#b9adc9;margin:14px 0 6px}.ls-integrity-input{width:100%;border:1px solid #493066;border-radius:13px;background:#100c18;color:#fff;padding:12px}.ls-choice-card{border:1px solid #352747;border-radius:15px;padding:13px;margin-top:12px}.ls-choice-card strong{font-size:13px}.ls-choice-card p{font-size:11px;color:var(--muted);line-height:1.45}.ls-choice-card.danger{border-color:#60303b}@media(max-width:430px){.ls-users-modal{padding:0}.ls-users-panel{border-radius:22px 22px 0 0;max-height:94vh}.ls-integrity-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  function normalizeTerminology(){
    document.querySelectorAll('.plan-head .muted').forEach(el=>{if(/saved Training Day/i.test(el.textContent||''))el.textContent="Today's saved workout";});
    document.querySelectorAll('button,strong,.section-title,h2,h3').forEach(el=>{
      const text=(el.textContent||'').trim();
      if(text==='Saved Training Days')el.textContent='Saved Workouts';
      if(text==='Choose Training Day')el.textContent='Choose Saved Workout';
      if(text==='Save today’s exercises as a Training Day')el.textContent='Save today’s exercises as a workout';
      if(text==='Update saved Training Day')el.textContent='Update saved workout';
    });
  }

  function decorateMachineBeta(){
    document.querySelectorAll('.action').forEach(btn=>{
      const strong=btn.querySelector('strong'); if(strong?.textContent.trim()!=='Scan Machine')return;
      strong.textContent='Machine Scan Beta';
      const sub=btn.querySelector('.text span'); if(sub)sub.textContent='Photo assisted identification, limited beta';
    });
  }

  function decorateTemplatesTarget(){
    if(state.view!=='templates')return;
    const today=isoDate(new Date());
    const target=targetDateForTemplate(templateOriginView,state.selectedDate,today);
    document.querySelectorAll('[data-template-start]').forEach(btn=>{
      btn.textContent=target===today?'Start today':`Use on ${new Date(target+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;
    });
  }

  function decorateProfileIntegrity(){
    if(state.view!=='profile')return;
    const main=document.querySelector('main.container'); if(!main)return;
    if(!main.querySelector('[data-integrity-users]')){
      const reg=readRegistry(); const current=reg.users.find(u=>u.id===reg.activeId);
      const card=document.createElement('section'); card.className='ls-integrity-card'; card.dataset.integrityUsers='1';
      card.innerHTML=`<div class="ls-integrity-kicker">User data</div><strong>${escapeHtml(current?.name||data.profile?.name||'Current user')}</strong><p>Switch users without mixing training history. Starting a new user can keep this data stored, or delete it only after a separate confirmation.</p><div class="ls-integrity-actions"><button class="secondary" type="button" data-manage-users>Manage users</button><button class="secondary" type="button" data-import-backup>Restore backup</button><button class="secondary" type="button" data-export-all>Export all profiles</button></div><div style="font-size:10px;margin-top:9px" class="${storageAvailable()?'ls-storage-ok':'ls-storage-bad'}">${storageAvailable()?'● Device storage healthy':'● Device storage unavailable — export a backup before continuing'}</div><input type="file" accept="application/json,.json" data-backup-input hidden>`;
      const saved=main.querySelector('[data-saved-workouts-entry="profile"]');
      if(saved)saved.insertAdjacentElement('afterend',card); else main.appendChild(card);
      card.querySelector('[data-manage-users]').onclick=openUsersManager;
      card.querySelector('[data-export-all]').onclick=exportAllProfiles;
      const fileInput=card.querySelector('[data-backup-input]');
      card.querySelector('[data-import-backup]').onclick=()=>fileInput.click();
      fileInput.onchange=()=>{const f=fileInput.files?.[0];if(f)importBackupFile(f);fileInput.value='';};
    }
    const exportCurrent=main.querySelector('[data-action="export-data"]');if(exportCurrent)exportCurrent.textContent='Export current profile only';
    const reset=document.querySelector('[data-action="clear-data"]'); if(reset)reset.textContent="Reset current user's training data";
    const version=[...document.querySelectorAll('.muted')].find(el=>/LastSet v0\.12/i.test(el.textContent||''));
    if(version)version.textContent=`LastSet v${VERSION} Trust + Data Integrity`;
  }

  let lastRenderedView=state.view;
  const baseRender=render;
  render=function(){
    const before=lastRenderedView;
    baseRender();
    if(state.view==='templates' && before!=='templates') templateOriginView=before;
    normalizeTerminology(); decorateMachineBeta(); decorateTemplatesTarget(); decorateProfileIntegrity();
    EXERCISES.forEach(ex=>{ex.primary=[ex.primaryMuscle,...(ex.secondaryMuscles||[]),...(ex.filterMuscles||[]),...(ex.aliases||[]),ex.movement].filter(Boolean).join(' ');});
    document.documentElement.dataset.lastsetIntegrity='v0129';
    lastRenderedView=state.view;
  };

  document.addEventListener('click',event=>{
    const reset=event.target.closest?.('[data-action="clear-data"]');
    if(!reset)return;
    event.preventDefault(); event.stopImmediatePropagation();
    const name=data.profile?.name||'current user';
    if(!confirm(`Reset training data for ${name}? Sessions, Saved Workouts and plans for this user will be cleared. Other users are kept.`))return;
    const profile=clone(data.profile||{});
    data=emptyUserData(profile.name||'',profile,true); data.profile.userId=readRegistry().activeId;
    saveData(data); resetViewTo(isoDate(new Date())); render(); showToast('Current user training data reset');
  },true);

  render();
})();