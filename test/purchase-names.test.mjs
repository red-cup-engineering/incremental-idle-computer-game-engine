import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../scripts/build.mjs';
import {newRun,MAX_POINTS} from '../src/engine.mjs';
import {WORLDS} from '../src/worlds.mjs';
import {withBrowser,storageKey} from './helpers/browser-harness.mjs';
const now=1_793_797_200_000;
const out=await mkdtemp(join(tmpdir(),'idle-purchase-names-'));
after(()=>rm(out,{recursive:true,force:true}));
await build(out);
const html=await readFile(join(out,'index.html'),'utf8');
const targets=[['source',fileURLToPath(new URL('../src/browser.mjs',import.meta.url))],['built',join(out,'assets/browser.mjs')]];
const buttons=node=>[...(node.tagName==='BUTTON'?[node]:[]),...node.children.flatMap(buttons)];
const rich=world=>({...newRun(world,now),banked:MAX_POINTS,runProduced:MAX_POINTS,allTime:MAX_POINTS});
// Assert authored naming, not a simulated accessibility tree or screen reader.
function checkNames(app,world) {
 const names=[];
 for(const [kind,items] of [['producers',world.producers],['upgrades',world.upgrades]]){
  const rows=app.get(kind).children;
  assert.equal(rows.length,items.length);
  rows.forEach((row,index)=>{
   for(const button of buttons(row)){
    const name=button.getAttribute('aria-label');
    assert.ok(name?.includes(items[index].label),`${kind}/${items[index].id}: name identifies item, got ${JSON.stringify(name)}`);
    assert.ok(name.includes(button.textContent),'accessible name retains the current visible label');
    const descriptions=button.getAttribute('aria-describedby').split(' ');
    assert.equal(descriptions[0],`readiness-${items[index].id}`);
    if(kind==='upgrades')assert.ok(descriptions.includes(`preview-upgrade-${items[index].id}`));
    names.push(name);
   }
  });
 }
 assert.equal(new Set(names).size,names.length,'shipped purchase choices have distinct names');
}
for(const [name,entry] of targets)for(const world of WORLDS){
 const run=(callback,entries=[])=>withBrowser(entry,html,{now,search:`?world=${world.id}`,entries},callback);
 test(`${name}/${world.id}: purchase names identify items at start and after unlock, spending and ownership`,()=>run(app=>{
  checkNames(app,world);
  app.import(JSON.stringify(rich(world)));checkNames(app,world);
  const producer=buttons(app.get('producers').children[0])[0];producer.click();checkNames(app,world);
  const upgrade=buttons(app.get('upgrades').children[0])[0];upgrade.click();
  assert.equal(upgrade.textContent,'Installed');checkNames(app,world);
  app.tick(1000);checkNames(app,world);
  app.import(JSON.stringify(newRun(world,now)));checkNames(app,world);
 }));
 test(`${name}/${world.id}: world switching, reset and failed import retain correct names`,()=>run(app=>{
  app.import(JSON.stringify(rich(world)));checkNames(app,world);
  const other=WORLDS.find(w=>w.id!==world.id);
  app.choose(other.label);checkNames(app,other);
  app.choose(world.label);checkNames(app,world);
  app.click('reset');app.click('cancel-reset');checkNames(app,world);
  app.click('reset');app.click('confirm-reset');checkNames(app,world);
  app.import('{bad');checkNames(app,world);
 }));
 test(`${name}/${world.id}: blocked saves keep item identity and recovery refreshes names`,()=>run(app=>{
  checkNames(app,world);
  for(const kind of ['producers','upgrades'])for(const b of buttons(app.get(kind)))assert.equal(b.disabled,true);
  app.storage.data.set(storageKey(world.id),JSON.stringify(rich(world)));
  app.click('retry-save');checkNames(app,world);
  assert.equal(buttons(app.get('upgrades').children[0])[0].disabled,false);
 },[[storageKey(world.id),'{damaged']]));
}
