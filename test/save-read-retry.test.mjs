import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../scripts/build.mjs';
import {newRun,tap,buyProducer,project} from '../src/engine.mjs';
import {worldById} from '../src/worlds.mjs';
import {withBrowser,storageKey} from './helpers/browser-harness.mjs';

const now=1_793_797_200_000;
const out=await mkdtemp(join(tmpdir(),'idle-retry-save-'));
after(()=>rm(out,{recursive:true,force:true}));
await build(out);
const html=await readFile(join(out,'index.html'),'utf8');
const targets=[['source',fileURLToPath(new URL('../src/browser.mjs',import.meta.url))],['built',join(out,'assets/browser.mjs')]];
const world=worldById('trace-garden'),other=worldById('pocket-observatory');
const runWithTaps=(count,w=world)=>{let state=newRun(w,now);for(let i=0;i<count;i++)state=tap(w,state,now).state;return state;};
const writes=app=>app.storage.calls.filter(row=>row.operation==='set').length;
const failRead=({key})=>{if(key===storageKey(world.id))throw new Error('temporary storage read');};
for(const [name,entry] of targets){
 const run=(options,callback)=>withBrowser(entry,html,{now,...options},callback);
 test(`${name}: a recovered read restores the original world and resumes native play`,()=>run({entries:[[storageKey(world.id),JSON.stringify(runWithTaps(7))]],faults:{beforeGet:failRead}},app=>{
  assert.equal(app.get('tap').disabled,true);
  assert.equal(app.get('retry-save').hidden,false);assert.equal(app.get('retry-save').disabled,false);
  assert.equal(writes(app),0);
  delete app.storage.faults.beforeGet;app.click('retry-save');
  assert.equal(app.text('banked'),'7');assert.equal(app.get('tap').disabled,false);
  assert.equal(app.get('retry-save').hidden,true);assert.equal(app.get('retry-save').disabled,true);
  assert.equal(app.get('tap').focused,true);assert.match(app.text('status'),/Saved run recovered/);
  assert.equal(JSON.parse(app.export()).banked,7);app.tap();assert.equal(app.saved().banked,8);
 }));
 test(`${name}: recovering one world keeps another world's unsaved live progress`,()=>run({entries:[[storageKey(world.id),JSON.stringify(runWithTaps(11))]],faults:{beforeGet:failRead}},app=>{
  app.choose(other.label);app.storage.faults.beforeSet=()=>{throw new Error('quota');};app.tap(4);
  assert.equal(JSON.parse(app.export()).banked,4);app.choose(world.label);
  delete app.storage.faults.beforeGet;app.click('retry-save');
  assert.equal(JSON.parse(app.export()).banked,11);assert.match(app.text('save-status'),/Pocket Observatory/);
  app.choose(other.label);assert.equal(JSON.parse(app.export()).banked,4);
 }));
 test(`${name}: failed retries remain read-only and preserve original damaged bytes`,()=>run({entries:[[storageKey(world.id),'{original damaged']]},app=>{
  const before=writes(app);app.storage.faults.beforeGet=failRead;app.click('retry-save');
  assert.equal(app.export(),'{original damaged');assert.equal(writes(app),before);
  delete app.storage.faults.beforeGet;app.storage.data.delete(storageKey(world.id));app.click('retry-save');
  assert.match(app.text('status'),/No saved run was found/);assert.equal(app.export(),'{original damaged');
  app.storage.data.set(storageKey(world.id),'{new damaged');app.click('retry-save');
  assert.equal(app.export(),'{original damaged');assert.equal(app.get('tap').disabled,true);
  assert.equal(writes(app),before);assert.equal(app.storage.data.get(storageKey(world.id)),'{new damaged');
 }));
 test(`${name}: a newly readable damaged save can be exported after an initial read failure`,()=>run({faults:{beforeGet:failRead}},app=>{
  delete app.storage.faults.beforeGet;app.storage.data.set(storageKey(world.id),'{recovered damaged');
  app.click('retry-save');assert.equal(app.export(),'{recovered damaged');
  assert.equal(app.get('tap').disabled,true);assert.equal(writes(app),0);
 }));
 test(`${name}: a wrong-world save is refused without replacement`,()=>run({entries:[[storageKey(world.id),'{damaged']]},app=>{
  const wrong=JSON.stringify(runWithTaps(5,other));app.storage.data.set(storageKey(world.id),wrong);
  app.click('retry-save');assert.equal(app.get('tap').disabled,true);
  assert.equal(writes(app),0);assert.equal(app.storage.data.get(storageKey(world.id)),wrong);
 }));
 test(`${name}: retry cancels an old erase decision, even when reading fails`,()=>run({entries:[[storageKey(world.id),'{damaged']]},app=>{
  app.click('reset');app.click('retry-save');
  assert.equal(app.text('reset'),'Clear damaged save');assert.equal(app.get('cancel-reset').hidden,true);
  app.storage.data.set(storageKey(world.id),JSON.stringify(runWithTaps(13)));
  app.click('retry-save');app.click('reset');assert.equal(app.saved().banked,13);
  app.click('cancel-reset');assert.equal(app.saved().banked,13);
 }));
 test(`${name}: recovery keeps an admitted live run when the automatic save then fails`,()=>run({entries:[[storageKey(world.id),JSON.stringify(runWithTaps(17))]],faults:{beforeGet:failRead}},app=>{
  delete app.storage.faults.beforeGet;app.storage.faults.beforeSet=()=>{throw new Error('quota');};
  app.click('retry-save');assert.equal(app.get('tap').disabled,false);
  assert.equal(JSON.parse(app.export()).banked,17);assert.match(app.text('save-status'),/Saving could not be verified/);
  app.tap();assert.equal(JSON.parse(app.export()).banked,18);assert.equal(app.saved().banked,17);
 }));
 test(`${name}: a changed stored version after recovery is detected without overwriting it`,()=>run({entries:[[storageKey(world.id),JSON.stringify(runWithTaps(19))]],faults:{beforeGet:failRead}},app=>{
  delete app.storage.faults.beforeGet;
  const otherVersion=JSON.stringify(runWithTaps(23));let observed=false;
  app.storage.faults.afterGet=({key},data)=>{if(key===storageKey(world.id)&&!observed){observed=true;data.set(key,otherVersion);}};
  app.click('retry-save');assert.equal(JSON.parse(app.export()).banked,19);
  assert.equal(app.storage.data.get(storageKey(world.id)),otherVersion);assert.equal(writes(app),0);
  assert.match(app.text('save-status'),/Another saved version/);
 }));
 test(`${name}: recovered producers use the native capped clock and playable worlds ignore retries`,()=>{
  const initial=buyProducer(world,runWithTaps(50),world.producers[0].id,1,now).state;
  return run({entries:[[storageKey(world.id),JSON.stringify(initial)]],faults:{beforeGet:failRead}},app=>{
   app.tick((world.offlineCapSeconds+5)*1000);delete app.storage.faults.beforeGet;
   app.click('retry-save');assert.deepEqual(app.saved(),project(world,initial,app.now()).state);
   const before=app.export(),count=writes(app);app.click('retry-save');
   assert.equal(app.export(),before);assert.equal(writes(app),count);
   app.choose(other.label);assert.equal(app.get('retry-save').hidden,true);
  });
 });
}
