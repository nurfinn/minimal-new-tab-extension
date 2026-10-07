import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../chrome-update-service.mjs').catch(() => ({}));
const PENDING = 'minimalTab.update.pending.v1';
const SNOOZE = 'minimalTab.update.snooze.v1';
const pair = (targetVersion = '1.7') => ({ baseVersion: '1.6', targetVersion });
const tick = () => new Promise(resolve => setImmediate(resolve));
function event() {
  const listeners = new Set();
  return { listeners, addListener: f => listeners.add(f), removeListener: f => listeners.delete(f),
    emit: (...args) => { for (const f of listeners) f(...args); } };
}
function fixture() {
  const changed = event();
  const updates = event();
  const area = (name) => ({ data: {}, writes: 0, failGet: false, failSet: false,
    async get(key) { if (this.failGet) throw Error('read'); return { [key]: structuredClone(this.data[key]) }; },
    async set(values) { if (this.failSet) throw Error('write'); this.writes++;
      Object.assign(this.data, structuredClone(values));
      changed.emit(Object.fromEntries(Object.entries(values).map(([k,v]) => [k,{newValue:v}])), name); },
  });
  let time = 1000;
  const api = { runtime: { getManifest: () => ({version:'1.6'}), onUpdateAvailable: updates,
    reload: () => { api.reloads++; }, requestUpdateCheck: () => { throw Error('Forbidden polling'); } },
    storage: { session:area('session'),local:area('local'),onChanged:changed,
      sync:{set:()=>{throw Error('Forbidden sync write');}} },reloads:0 };
  let views = [];
  const timers = [];
  const create = () => {
    assert.equal(typeof mod.createChromeUpdateService,'function');
    return mod.createChromeUpdateService({api,getViews:()=>views,now:()=>time,
      schedule:(f,ms)=>{ const x={f,ms}; timers.push(x);return x; },cancel:x=>{x.cancelled=true;}});
  };
  return {api,updates,changed,create,timers,setTime:x=>{time=x;},setViews:x=>{views=x;}};
}

test('versions are numeric and malformed versions fail closed', () => {
  assert.equal(typeof mod.parseUpdateVersion,'function');
  assert.deepEqual(mod.parseUpdateVersion('1.6'),[1,6,0,0]);
  assert.equal(mod.compareUpdateVersions('1.10','1.9'),1);
  assert.equal(mod.compareUpdateVersions('1.6','1.6.0.0'),0);
  for(const x of ['',null,5,'0','0.0.0.0','01.6','1..6','1.2.3.4.5','65536','1.6-beta',' 1.6','1e2']) {
    assert.equal(mod.parseUpdateVersion(x),null,String(x));
  }
});
test('listener attaches before awaiting storage; invalid and old events stay hidden',async()=>{
  const f=fixture(),s=f.create(); const started=s.start();
  assert.equal(f.updates.listeners.size,1);await started;
  for(const version of ['1.6','1.5','oops',null]) f.updates.emit({version});
  assert.equal(s.snapshot().status,'hidden');assert.equal(f.api.storage.session.writes,0);
  f.updates.emit({version:'1.7'});await tick();
  assert.equal(s.snapshot().status,'available');assert.equal(s.snapshot().targetVersion,'1.7');
  assert.deepEqual(f.api.storage.session.data[PENDING],pair());
  s.dispose();assert.equal(f.updates.listeners.size,0);assert.equal(f.changed.listeners.size,0);
});
test('late session read cannot replace a newer event',async()=>{
  const f=fixture();let finish;
  f.api.storage.session.get=()=>new Promise(resolve=>{finish=resolve;});
  const s=f.create(),start=s.start();
  f.updates.emit({version:'1.9'});await tick();finish({[PENDING]:pair('1.7')});await start;
  assert.equal(s.snapshot().targetVersion,'1.9');
});
test('local data cannot fabricate readiness; valid session restores it',async()=>{
  const f=fixture();f.api.storage.local.data[SNOOZE]={...pair(),snoozedUntil:5000};
  let s=f.create();await s.start();assert.equal(s.snapshot().status,'hidden');s.dispose();
  f.api.storage.session.data[PENDING]=pair();s=f.create();await s.start();
  assert.equal(s.snapshot().targetVersion,'1.7');assert.equal(s.snapshot().status,'hidden');
  f.setTime(5000);await s.refresh();assert.equal(s.snapshot().status,'available');
});
test('duplicate event preserves snooze with exactly 24 hours and no render writes',async()=>{
  const f=fixture(),s=f.create();await s.start();f.updates.emit({version:'1.7'});await tick();
  await s.snooze();assert.deepEqual(f.api.storage.local.data[SNOOZE],{...pair(),snoozedUntil:86401000});
  const writes=f.api.storage.session.writes;f.updates.emit({version:'1.7'});await tick();
  assert.equal(s.snapshot().status,'hidden');assert.equal(f.api.storage.session.writes,writes);
  for(let i=0;i<10;i++){s.snapshot();await s.refresh();}
  assert.equal(f.api.storage.local.writes,1);assert.equal(f.api.storage.session.writes,writes);
  f.setTime(86401000);await s.refresh();assert.equal(s.snapshot().status,'available');
});
test('new target ignores old snooze and older events never downgrade',async()=>{
  const f=fixture(),s=f.create();await s.start();f.updates.emit({version:'1.7'});await s.snooze();
  f.updates.emit({version:'1.8'});f.updates.emit({version:'1.7'});await tick();
  assert.equal(s.snapshot().status,'available');assert.equal(s.snapshot().targetVersion,'1.8');
});
test('failed local write still hides living peers and delayed read cannot erase it',async()=>{
  const f=fixture(),s=f.create();await s.start();f.updates.emit({version:'1.7'});
  let received;f.setViews([{__minimalTabUpdatePageV1:{protocol:1,defer:(p,until)=>{received={...p,snoozedUntil:until};}}}]);
  f.api.storage.local.failSet=true;await s.snooze();await s.refresh();
  assert.deepEqual(received,{...pair(),snoozedUntil:86401000});assert.equal(s.snapshot().status,'hidden');
});
test('read errors and invalid cache never write fallback or cause reload',async()=>{
  for(const data of [{baseVersion:'1.5',targetVersion:'2'},pair('bad'),{...pair(),extra:'ignored'}]) {
    const f=fixture();f.api.storage.session.data[PENDING]=data;
    f.api.storage.local.data[SNOOZE]={...pair(),snoozedUntil:Infinity};
    const s=f.create();await s.start();
    assert.equal(s.snapshot().status,data.targetVersion==='1.7'?'available':'hidden');
    assert.equal(f.api.storage.session.writes+f.api.storage.local.writes,0);assert.equal(f.api.reloads,0);
  }
  const f=fixture();f.api.storage.session.failGet=true;f.api.storage.local.failGet=true;
  const s=f.create();await s.start();assert.equal(s.snapshot().status,'hidden');
  f.updates.emit({version:'1.7'});await tick();assert.equal(s.snapshot().status,'available');
});
test('missing APIs stay inert, missing session retains a live event',async()=>{
  assert.equal(typeof mod.createChromeUpdateService,'function');
  const inert=mod.createChromeUpdateService({api:null});await inert.start();
  assert.equal(inert.snapshot().status,'hidden');await inert.snooze();inert.dispose();
  const f=fixture();delete f.api.storage.session;const s=f.create();await s.start();
  f.updates.emit({version:'1.7'});await tick();assert.equal(s.snapshot().status,'available');
});

async function guarded() {
  const f=fixture(),s=f.create();await s.start();f.updates.emit({version:'1.7'});await tick();
  assert.equal(typeof mod.registerUpdatePage,'function');
  const states=[{reason:null,locked:false},{reason:null,locked:false}];
  const views=states.map(()=>({}));f.setViews(views);
  const other=f.create();await other.start();
  for(let i=0;i<2;i++)mod.registerUpdatePage({window:views[i],service:i?other:s,
    safety:{getBlockReason:()=>states[i].reason,setInputLocked:x=>{states[i].locked=x;}}});
  return {...f,s,other,states,views};
}
test('apply refuses every busy reason and never edits or closes the other page',async()=>{
  for(const reason of ['initializing','dialog','editing','drag','file','saving','selection']){
    const f=await guarded();f.states[1].reason=reason;
    assert.equal(f.s.apply().ok,false,reason);assert.equal(f.api.reloads,0);
    assert.deepEqual(f.states.map(x=>x.locked),[false,false]);assert.equal(f.states[1].reason,reason);
  }
});
test('unknown or throwing page fails closed and releases preparing locks',async()=>{
  for(const page of [{},{__minimalTabUpdatePageV1:{protocol:1,inspect(){throw Error('closed');}}}]){
    const f=await guarded();f.views.push(page);
    assert.equal(f.s.apply().ok,false);assert.equal(f.api.reloads,0);assert(!f.states.some(x=>x.locked));
  }
});
test('changed view set releases all preparing locks and two callers cause one reload',async()=>{
  const f=await guarded();const peer=f.views[1].__minimalTabUpdatePageV1,acquire=peer.acquire;
  peer.acquire=token=>{const result=acquire(token);f.views.push({});return result;};
  assert.equal(f.s.apply().ok,false);assert.equal(f.api.reloads,0);assert(!f.states.some(x=>x.locked));
  f.views.pop();peer.acquire=acquire;
  assert.equal(f.s.apply().ok,true);assert.equal(f.other.apply().ok,false);assert.equal(f.api.reloads,1);
  assert(f.states.every(x=>x.locked));
});
test('reload throws unlocks before dispatch; no-op reload becomes recovery without permitting edits',async()=>{
  const f=await guarded();f.api.runtime.reload=()=>{throw Error('invalidated');};
  assert.equal(f.s.apply().reason,'reload-error');assert(!f.states.some(x=>x.locked));
  f.api.runtime.reload=()=>{};assert.equal(f.s.apply().ok,true);
  assert.equal(f.s.snapshot().status,'applying');
  for(const timer of f.timers.filter(t=>!t.cancelled)){assert.equal(timer.ms,3000);timer.f();}
  assert.equal(f.s.snapshot().status,'recovery');assert(f.states.every(x=>x.locked));
});
test('new page inherits committed lock; failed commit cancels before dispatch',async()=>{
  const f=await guarded(),peer=f.views[1].__minimalTabUpdatePageV1,commit=peer.commit;
  peer.commit=()=>false;assert.equal(f.s.apply().ok,false);assert.equal(f.api.reloads,0);assert(!f.states.some(x=>x.locked));
  peer.commit=commit;f.s.apply();
  const win={},s=f.create();let locked=false;f.views.push(win);
  mod.registerUpdatePage({window:win,service:s,safety:{getBlockReason:()=>null,setInputLocked:v=>{locked=v;}}});
  assert.equal(locked,true);assert.equal(win.__minimalTabUpdatePageV1.inspect().phase,'committed');
});

test('concurrent Later writes finishing out of order preserve the latest target on reopen',async()=>{
  const f=await guarded();const original=f.api.storage.local.set.bind(f.api.storage.local);
  const writes=[];
  f.api.storage.local.set=value=>new Promise(resolve=>writes.push(async()=>{await original(value);resolve();}));
  const older=f.s.snooze();f.updates.emit({version:'1.8'});await tick();
  const newer=f.other.snooze();
  f.api.storage.local.set=original;
  await writes[1]();await newer;await writes[0]();await older;await tick();await tick();
  const reopened=f.create();await reopened.start();
  assert.equal(reopened.snapshot().targetVersion,'1.8');assert.equal(reopened.snapshot().status,'hidden');
});
test('stale cross-page session writes cannot regress the next opened page',async()=>{
  const f=await guarded();f.updates.emit({version:'1.9'});await tick();
  await f.api.storage.session.set({[PENDING]:pair('1.7')});await tick();await tick();
  const reopened=f.create();await reopened.start();assert.equal(reopened.snapshot().targetVersion,'1.9');
});
test('closing and inaccessible peers fail closed; abandoned preparing owner releases its lease',async()=>{
  const f=await guarded();const peer=f.views[1].__minimalTabUpdatePageV1;
  const inspect=peer.inspect;peer.inspect=()=>{throw Error('inaccessible context');};
  assert.equal(f.s.apply().ok,false);assert.equal(f.api.reloads,0);assert(!f.states.some(x=>x.locked));
  peer.inspect=inspect;f.views[1].closed=true;
  assert.equal(f.s.apply().ok,false);assert.equal(f.api.reloads,0);f.views[1].closed=false;
  assert.equal(peer.acquire(f.views[0].__minimalTabUpdatePageV1.id+'/abandoned'),true);
  f.views.shift();assert.equal(peer.inspect().phase,'idle');assert.equal(f.states[1].locked,false);
});

test('registration enumeration or inspection failure stays locked and recoverable, never idle-ready',async()=>{
  for(const failure of ['enumeration','inspection']) {
    const f=await guarded();assert.equal(f.s.apply().ok,true);
    const win={},service=mod.createChromeUpdateService({api:f.api,
      getViews:()=>{if(failure==='enumeration')throw Error('temporarily inaccessible');return [...f.views,win];}});
    if(failure==='inspection')f.views[0].__minimalTabUpdatePageV1.inspect=()=>{throw Error('closing');};
    let locked=false;await service.start();
    mod.registerUpdatePage({window:win,service,safety:{getBlockReason:()=>null,setInputLocked:value=>{locked=value;}}});
    assert.equal(locked,true,failure);assert.equal(service.snapshot().status,'recovery');
    assert.equal(win.__minimalTabUpdatePageV1.inspect().reason,'unknown-context');
    assert.equal(service.apply().ok,false);assert.equal(f.api.reloads,1);
  }
});
test('a fresh Later works after a backward clock correction and never repairs an invalid old deadline',async()=>{
  const f=fixture();f.setTime(200_000_000);const s=f.create();await s.start();
  f.updates.emit({version:'1.7'});await s.snooze();
  f.setTime(200_000_000-2*86_400_000);await s.refresh();assert.equal(s.snapshot().status,'available');
  await s.snooze();await tick();
  assert.equal(s.snapshot().status,'hidden');
  assert.equal(f.api.storage.local.data[SNOOZE].snoozedUntil,200_000_000-86_400_000);
  const reopened=f.create();await reopened.start();assert.equal(reopened.snapshot().status,'hidden');
});
