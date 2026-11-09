import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../scripts/build.mjs';
import {newRun,tap,buyProducer} from '../src/engine.mjs';
import {worldById} from '../src/worlds.mjs';
import {withBrowser,storageKey} from './helpers/browser-harness.mjs';

const now=1_793_797_200_000;
const out=await mkdtemp(join(tmpdir(),'idle-reset-confirmation-'));
after(()=>rm(out,{recursive:true,force:true}));
await build(out);
const html=await readFile(join(out,'index.html'),'utf8');
const targets=[['source',fileURLToPath(new URL('../src/browser.mjs',import.meta.url))],['built',join(out,'assets/browser.mjs')]];
const world=worldById('trace-garden');
const runWithTaps=count=>{let state=newRun(world,now);for(let i=0;i<count;i++)state=tap(world,state,now).state;return state;};
const assertDisarmed=app=>{
 assert.equal(app.text('reset'),'Reset this world');
 assert.equal(app.get('cancel-reset').hidden,true);
 assert.equal(app.get('cancel-reset').disabled,true);
 assert.equal(app.get('reset').getAttribute('aria-expanded'),'false');
};
const assertArmed=app=>{
 assert.equal(app.get('confirm-reset').disabled,false);
 assert.equal(app.get('reset-confirmation').hidden,false);
 assert.equal(app.get('cancel-reset').hidden,false);
 assert.equal(app.get('cancel-reset').disabled,false);
 assert.equal(app.get('reset').getAttribute('aria-expanded'),'true');
};
for(const [name,entry] of targets){
 const run=(options,callback)=>withBrowser(entry,html,{now,...options},callback);
 test(`${name}: resumed manual play invalidates the pending reset`,()=>run({},app=>{
  app.tap(5);app.click('reset');app.tap();
  assertDisarmed(app);const before=app.export();
  app.click('reset');assertArmed(app);assert.equal(app.export(),before);
  assert.equal(app.saved().banked,6);
 }));
 test(`${name}: producer and upgrade choices invalidate the pending reset`,()=>run({entries:[[storageKey(world.id),JSON.stringify(runWithTaps(300))]]},app=>{
  for(const [container,label] of [['producers','Buy 1'],['upgrades',null]]){
   app.click('reset');
   const button=app.get(container).children.flatMap(row=>row.children).flatMap(node=>node.children.length?node.children:[node]).find(node=>node.tagName==='BUTTON'&&!node.disabled&&(!label||node.textContent===label));
   assert.ok(button);button.click();assertDisarmed(app);
  }
  assert.ok(app.saved().producers[world.producers[0].id]>0);
  assert.ok(Object.values(app.saved().upgrades).some(Boolean));
 }));
 test(`${name}: rejected import invalidates the pending reset without changing play`,()=>run({},app=>{
  app.tap(7);const before=app.export();app.click('reset');app.import('{bad');
  assertDisarmed(app);assert.match(app.text('status'),/Import refused/);
  app.click('reset');assert.equal(app.export(),before);assert.equal(app.saved().banked,7);
 }));
 test(`${name}: prestige starts a new run without retaining erase consent`,()=>run({entries:[[storageKey(world.id),JSON.stringify(runWithTaps(world.prestigeThreshold))]]},app=>{
  app.click('reset');app.click('prestige');app.click('confirm-prestige');assertDisarmed(app);assert.equal(app.saved().prestige,1);
  app.click('reset');assert.equal(app.saved().prestige,1);app.click('cancel-reset');assert.equal(app.saved().prestige,1);
 }));
 test(`${name}: a failed verified import cancels erase consent and keeps the live run`,()=>run({},app=>{
  app.tap(5);app.click('reset');app.storage.faults.beforeSet=()=>{throw new Error('quota');};
  app.import(JSON.stringify(runWithTaps(12)));assertDisarmed(app);assert.match(app.text('status'),/Import could not be verified/);
  assert.equal(JSON.parse(app.export()).banked,5);delete app.storage.faults.beforeSet;
  app.click('reset');assert.equal(app.saved().banked,5);
 }));
 test(`${name}: explicit cancel preserves live and persisted bytes and returns focus`,()=>run({},app=>{
  app.tap(9);const before=app.export(),saved=app.storage.data.get(storageKey(world.id));
  const writes=app.storage.calls.filter(row=>row.operation==='set').length;
  app.click('reset');assertArmed(app);app.click('cancel-reset');assertDisarmed(app);
  assert.match(app.text('status'),/Reset cancelled/);assert.equal(app.get('reset').focused,true);
  assert.equal(app.export(),before);assert.equal(app.storage.data.get(storageKey(world.id)),saved);
  assert.equal(app.storage.calls.filter(row=>row.operation==='set').length,writes);
  app.click('reset');assert.equal(app.export(),before);app.click('confirm-reset');assert.equal(app.saved().banked,0);
 }));
 test(`${name}: switching worlds and selecting the current world cancel pending resets`,()=>run({},app=>{
  app.tap(3);app.click('reset');app.choose('Trace Garden');assertDisarmed(app);assert.match(app.text('status'),/Reset cancelled/);
  app.click('reset');app.choose('Pocket Observatory');assertDisarmed(app);assert.doesNotMatch(app.text('status'),/Press Confirm/);app.tap(2);
  app.choose('Trace Garden');assertDisarmed(app);assert.equal(app.saved().banked,3);
  assert.equal(app.saved('pocket-observatory').banked,2);
 }));
 test(`${name}: export and automatic production retain an intentional reset confirmation`,()=>{
  const state=buyProducer(world,runWithTaps(50),world.producers[0].id,1,now).state;
  return run({entries:[[storageKey(world.id),JSON.stringify(state)]]},app=>{
   app.click('reset');const before=JSON.parse(app.export());app.tick(1000);assertArmed(app);
   assert.ok(app.saved().banked>before.banked);app.click('confirm-reset');assert.equal(app.saved().banked,0);assertDisarmed(app);
  });
 });
 test(`${name}: damaged saves can cancel clear without replacing original text`,()=>run({entries:[[storageKey(world.id),'{damaged']]},app=>{
  app.click('reset');assertArmed(app);app.click('cancel-reset');
  assert.equal(app.text('reset'),'Clear damaged save');assert.equal(app.get('cancel-reset').hidden,true);
  assert.equal(app.storage.data.get(storageKey(world.id)),'{damaged');assert.equal(app.export(),'{damaged');
  app.click('reset');assertArmed(app);app.click('confirm-reset');assert.equal(app.saved().banked,0);assertDisarmed(app);
 }));
}
