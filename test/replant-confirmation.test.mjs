import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';
import { newRun, prestige, advance } from '../src/engine.mjs';
import { WORLDS } from '../src/worlds.mjs';
import { withBrowser, storageKey } from './helpers/browser-harness.mjs';

const now=1_793_797_200_000;
const out=await mkdtemp(join(tmpdir(),'idle-replant-confirmation-'));
after(()=>rm(out,{recursive:true,force:true}));
await build(out);
const html=await readFile(join(out,'index.html'),'utf8');
const targets=[['source',fileURLToPath(new URL('../src/browser.mjs',import.meta.url))],['built',join(out,'assets/browser.mjs')]];
function ready(world) {
  const state={...newRun(world,now),banked:1234,runProduced:world.prestigeThreshold*4,allTime:world.prestigeThreshold*4,prestige:3};
  state.producers[world.producers[0].id]=7;
  state.upgrades[world.upgrades[0].id]=true;
  return state;
}
function confirmation(app,armed) {
  assert.equal(app.get('prestige').getAttribute('aria-expanded'),String(armed));
  assert.equal(app.get('replant-confirmation').hidden,!armed);
  assert.equal(app.get('confirm-prestige').disabled,!armed);
  assert.equal(app.get('cancel-prestige').disabled,!armed);
}
function invoke(app,id,type='click',event={}) {
  for(const handler of app.get(id).listeners.get(type) ?? [])handler(event);
}
function purchase(app,container) {
  const buttons=node=>[...(node.tagName==='BUTTON'?[node]:[]),...node.children.flatMap(buttons)];
  const button=buttons(app.get(container)).find(node=>!node.disabled);
  assert.ok(button,'the admitted run has an available purchase');button.click();
}
for(const [name,entry] of targets) {
  for(const world of WORLDS) {
    const run=(callback,options={})=>withBrowser(entry,html,{now,search:`?world=${world.id}`,entries:[[storageKey(world.id),JSON.stringify(ready(world))]],...options},callback);
    test(`${name}/${world.id}: reviewing and repeated original activation never replant or write`,()=>run(app=>{
      const before=app.export(),saved=app.storage.data.get(storageKey(world.id));
      const writes=app.storage.calls.filter(call=>call.operation==='set').length;
      confirmation(app,false);app.click('prestige');confirmation(app,true);
      assert.equal(app.get('prestige').getAttribute('aria-controls'),'replant-confirmation');
      assert.equal(app.get('confirm-prestige').getAttribute('aria-describedby'),'prestige-preview');
      assert.match(app.text('confirm-prestige'),/\+2 permanent sparks/);
      for(let i=0;i<5;i++)app.click('prestige');
      assert.equal(app.export(),before);assert.equal(app.storage.data.get(storageKey(world.id)),saved);
      assert.equal(app.storage.calls.filter(call=>call.operation==='set').length,writes);
      confirmation(app,true);
    }));
    test(`${name}/${world.id}: separate confirmation applies exactly one native replant`,()=>run(app=>{
      app.click('prestige');app.click('confirm-prestige');confirmation(app,false);
      const expected=prestige(world,ready(world),now).state;
      assert.deepEqual(JSON.parse(app.export()),expected);assert.deepEqual(app.saved(world.id),expected);
      assert.equal(app.get('tap').focused,true);
      invoke(app,'confirm-prestige');app.click('confirm-prestige');
      assert.deepEqual(JSON.parse(app.export()),expected);
    }));
    test(`${name}/${world.id}: cancelling and Escape preserve state and restore focus`,()=>run(app=>{
      const before=app.export(),saved=app.storage.data.get(storageKey(world.id));
      for(const cancel of ['button','escape-review','escape-original']) {
        app.click('prestige');
        if(cancel==='button')app.click('cancel-prestige');
        else {
          let prevented=false;
          invoke(app,cancel==='escape-original'?'prestige':'replant-confirmation','keydown',{key:'Escape',preventDefault:()=>{prevented=true;}});
          assert.equal(prevented,true);
        }
        confirmation(app,false);assert.equal(app.get('prestige').focused,true);
        assert.equal(app.export(),before);assert.equal(app.storage.data.get(storageKey(world.id)),saved);
        invoke(app,'confirm-prestige');assert.equal(app.export(),before);
      }
    }));
    test(`${name}/${world.id}: production and export keep review open and refresh the award`,()=>{
      const state=ready(world);state.prestige=0;state.runProduced=state.allTime=world.prestigeThreshold*4-1;
      state.producers[world.producers[0].id]=1;
      return run(app=>{
        app.click('prestige');assert.match(app.text('confirm-prestige'),/\+1 permanent sparks/);
        assert.deepEqual(JSON.parse(app.export()),state);confirmation(app,true);
        app.tick(1000);confirmation(app,true);
        assert.match(app.text('confirm-prestige'),/\+2 permanent sparks/);
        const grown=advance(world,state,now+1000).state;
        assert.deepEqual(JSON.parse(app.export()),grown);
        app.click('confirm-prestige');
        assert.deepEqual(JSON.parse(app.export()),prestige(world,grown,now+1000).state);
      },{entries:[[storageKey(world.id),JSON.stringify(state)]]});
    });
    for(const [label,action] of [
      ['manual play',app=>app.tap()],
      ['producer purchase',app=>purchase(app,'producers')],
      ['upgrade purchase',app=>purchase(app,'upgrades')],
      ['refused import',app=>app.import('{bad')],
      ['valid import',app=>app.import(JSON.stringify(ready(world)))],
      ['reset review',app=>app.click('reset')],
      ['current world selection',app=>app.choose(world.label)],
      ['another world selection',app=>app.choose(WORLDS.find(item=>item.id!==world.id).label)]
    ]) {
      test(`${name}/${world.id}: ${label} cancels old replant consent`,()=>run(app=>{
        app.click('prestige');action(app);confirmation(app,false);
        const before=app.export();invoke(app,'confirm-prestige');assert.equal(app.export(),before);
        app.choose(world.label);app.click('prestige');confirmation(app,true);
        assert.equal(app.saved(world.id).prestige,3);
      }));
    }
    test(`${name}/${world.id}: replant review cancels pending erase without erasing`,()=>run(app=>{
      app.click('reset');app.click('prestige');confirmation(app,true);
      assert.equal(app.get('reset').getAttribute('aria-expanded'),'false');
      assert.equal(app.get('cancel-reset').hidden,true);
      assert.deepEqual(JSON.parse(app.export()),ready(world));
      app.click('reset');confirmation(app,false);
      assert.equal(app.get('reset').getAttribute('aria-expanded'),'true');
      assert.deepEqual(JSON.parse(app.export()),ready(world));
    }));
    test(`${name}/${world.id}: failed replacement import cancels consent and preserves live progress`,()=>run(app=>{
      app.click('prestige');app.storage.faults.beforeSet=()=>{throw new Error('quota');};
      app.import(JSON.stringify(newRun(world,now)));confirmation(app,false);
      assert.deepEqual(JSON.parse(app.export()),ready(world));
      invoke(app,'confirm-prestige');assert.deepEqual(JSON.parse(app.export()),ready(world));
    }));
    test(`${name}/${world.id}: unreadable saves cannot arm or confirm a replant`,()=>run(app=>{
      invoke(app,'prestige');invoke(app,'confirm-prestige');confirmation(app,false);
      assert.equal(app.export(),'{damaged');assert.equal(app.storage.data.get(storageKey(world.id)),'{damaged');
      assert.equal(app.storage.calls.some(call=>call.operation==='set'),false);
    },{entries:[[storageKey(world.id),'{damaged']]}));
  }
}
