import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../scripts/build.mjs';
import {newRun} from '../src/engine.mjs';
import {WORLDS} from '../src/worlds.mjs';
import {withBrowser,storageKey} from './helpers/browser-harness.mjs';
const now=1_793_797_200_000;
const out=await mkdtemp(join(tmpdir(),'idle-reset-intent-'));
after(()=>rm(out,{recursive:true,force:true}));
await build(out);
const html=await readFile(join(out,'index.html'),'utf8');
const targets=[['source',fileURLToPath(new URL('../src/browser.mjs',import.meta.url))],['built',join(out,'assets/browser.mjs')]];
function invoke(app,id,type='click',event={}) {
 for(const handler of app.get(id).listeners.get(type)??[])handler(event);
}
for(const [name,entry] of targets)for(const world of WORLDS){
 const initial={...newRun(world,now),banked:17,runProduced:17,allTime:17,taps:17};
 const run=callback=>withBrowser(entry,html,{now,search:`?world=${world.id}`,entries:[[storageKey(world.id),JSON.stringify(initial)]]},callback);
 test(`${name}/${world.id}: repeated reset opener activations never erase progress`,()=>run(app=>{
  const before=app.export(),saved=app.storage.data.get(storageKey(world.id));
  const writes=app.storage.calls.filter(c=>c.operation==='set').length;
  app.click('reset');
  for(let i=0;i<8;i++)app.click('reset'); // click activations include repeated keyboard activation
  assert.equal(app.export(),before);
  assert.equal(app.storage.data.get(storageKey(world.id)),saved);
  assert.equal(app.storage.calls.filter(c=>c.operation==='set').length,writes);
  assert.equal(app.get('reset').getAttribute('aria-expanded'),'true');
 }));
 test(`${name}/${world.id}: only a separate armed confirmation erases exactly once`,()=>run(app=>{
  invoke(app,'confirm-reset');assert.equal(app.export(),JSON.stringify(initial));
  app.click('reset');
  assert.equal(app.get('reset').getAttribute('aria-controls'),'reset-confirmation');
  assert.equal(app.get('reset-confirmation').hidden,false);
  assert.equal(app.get('confirm-reset').disabled,false);
  app.click('confirm-reset');assert.deepEqual(app.saved(world.id),newRun(world,now));
  app.tap();const afterNewPlay=app.export();
  const writes=app.storage.calls.filter(c=>c.operation==='set').length;
  for(let i=0;i<4;i++)invoke(app,'confirm-reset');
  assert.equal(app.export(),afterNewPlay);
  assert.equal(app.storage.calls.filter(c=>c.operation==='set').length,writes);
  assert.equal(app.get('confirm-reset').disabled,true);
  assert.equal(app.get('reset-confirmation').hidden,true);
 }));
 test(`${name}/${world.id}: Escape on either reset control dismisses without writes`,()=>run(app=>{
  for(const id of ['reset','confirm-reset','cancel-reset']){
   app.click('reset');let prevented=false;
   const before=app.export(),writes=app.storage.calls.filter(c=>c.operation==='set').length;
   invoke(app,id,'keydown',{key:'Escape',preventDefault(){prevented=true;}});
   assert.equal(prevented,true);assert.equal(app.export(),before);
   assert.equal(app.get('reset').getAttribute('aria-expanded'),'false');
   assert.equal(app.get('reset').focused,true);
   invoke(app,'confirm-reset');assert.equal(app.export(),before);
   assert.equal(app.storage.calls.filter(c=>c.operation==='set').length,writes);
  }
 }));
 test(`${name}/${world.id}: cancelled, superseded and navigated confirmations cannot erase`,()=>run(app=>{
  for(const action of [()=>app.click('cancel-reset'),()=>app.tap(),()=>app.import('{bad'),()=>app.choose(world.label),()=>app.choose(WORLDS.find(w=>w.id!==world.id).label)]){
   app.click('reset');action();const before=app.export();
   invoke(app,'confirm-reset');assert.equal(app.export(),before);
   assert.equal(app.get('confirm-reset').disabled,true);
  }
 }));
}
