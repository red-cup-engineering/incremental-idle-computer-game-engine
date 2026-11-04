import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';
import { WORLDS } from '../src/worlds.mjs';
import { newRun, defineWorld, prestige } from '../src/engine.mjs';
import { withBrowser, storageKey } from './helpers/browser-harness.mjs';

// DOM and storage doubles exercise the actual consumer modules, not rendering.
const root=fileURLToPath(new URL('..',import.meta.url)),now=1_793_797_200_000;
const out=await mkdtemp(join(tmpdir(),'idle-prestige-preview-'));
after(()=>rm(out,{recursive:true,force:true}));
await build(join(out,'built'));
const html=await readFile(join(out,'built/index.html'),'utf8');
const targets=[['source',join(root,'src/browser.mjs')],['built',join(out,'built/assets/browser.mjs')]];
const exact=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value);
const initial=(world,state)=>({search:`?world=${world.id}`,entries:[[storageKey(world.id),JSON.stringify(state)]]});
const ready=world=>{
  const state={...newRun(world,now),banked:1234,runProduced:world.prestigeThreshold*4,allTime:world.prestigeThreshold*4,prestige:3};
  state.producers[world.producers[0].id]=7;
  state.upgrades[world.upgrades[0].id]=true;
  return state;
};
const preview=app=>app.text('prestige-preview');
function checkReady(app,world,state) {
  assert.equal(app.get('prestige').disabled,false);
  assert.equal(app.get('prestige').getAttribute('aria-describedby'),'prestige-preview');
  assert.match(preview(app),/Replant now: \+2 permanent sparks\./);
  assert.ok(preview(app).includes(`Next award: +3 sparks at ${exact(world.prestigeThreshold*9)} ${world.unit} produced this run (${exact(world.prestigeThreshold*5)} more).`));
  assert.ok(preview(app).includes(`lose ${exact(state.banked)} banked ${world.unit}, 7 producer units and 1 upgrades.`));
  assert.match(preview(app),/New run: 5 permanent sparks, \+6 per action and 0 \/ sec\./);
}

// Custom worlds are fixture-only; shipped design and build inputs are unchanged.
const objective=defineWorld({...WORLDS[0],id:'preview-objectives',prestigeObjectives:[
  {id:'practice',label:'Make two manual actions',action:'tap',count:2}
]});
await cp(join(root,'src'),join(out,'fixture-source'),{recursive:true});
await symlink(join(root,'node_modules'),join(out,'node_modules'),'dir');
await cp(join(out,'built/assets'),join(out,'fixture-built'),{recursive:true});
for(const target of ['fixture-source','fixture-built']) {
  await writeFile(join(out,target,'worlds.mjs'),`import {defineWorld} from './engine.mjs';\nexport const WORLDS=[defineWorld(${JSON.stringify(objective)})];\nexport const worldById=id=>WORLDS.find(w=>w.id===id);\n`);
}

test('built replant control has a descriptive summary',()=>{
  assert.match(html,/id="prestige" aria-describedby="prestige-preview"/);
  assert.match(html,/id="prestige-preview"/);
});
for(const [target,entry] of targets) {
  test(`${target}: replant planning follows playable state without spending or advancing twice`,async t=>{
    const run=(options,callback)=>withBrowser(entry,html,{now,...options},callback);
    for(const world of WORLDS) {
      await t.test(`${world.id}: exact award, next goal and reset costs agree with click`,()=>{
        const state=ready(world);
        return run(initial(world,state),app=>{
          checkReady(app,world,state);app.tick(0);app.tick(0);
          assert.deepEqual(JSON.parse(app.export()),state);
          const expected=prestige(world,state,now);
          app.click('prestige');assert.deepEqual(JSON.parse(app.export()),expected.state);
          assert.equal(app.get('prestige').disabled,true);
          assert.match(preview(app),/Replant now: unavailable/);assert.doesNotMatch(preview(app),/Replant resets:/);
          app.click('prestige');assert.deepEqual(JSON.parse(app.export()),expected.state);
          // Dispatch a stale handler directly: command refuses and render refreshes.
          for(const handler of app.get('prestige').listeners.get('click'))handler();
          assert.match(app.text('status'),/threshold not met/);
          assert.deepEqual(JSON.parse(app.export()),expected.state);
          assert.doesNotMatch(preview(app),/Replant resets:/);
        });
      });
      await t.test(`${world.id}: threshold, import, reset and cap replace stale forecasts`,()=>run({search:`?world=${world.id}`},app=>{
        assert.ok(preview(app).includes(`Next award: +1 sparks at ${exact(world.prestigeThreshold)}`));
        const state=ready(world);app.import(JSON.stringify(state));checkReady(app,world,state);
        const capped={...state,prestige:1000};app.import(JSON.stringify(capped));
        assert.equal(app.get('prestige').disabled,true);assert.match(preview(app),/Permanent spark limit reached/);
        assert.doesNotMatch(preview(app),/Next award:|Replant resets:/);
        app.import(JSON.stringify({...state,prestige:999}));
        assert.equal(app.get('prestige').disabled,false);assert.match(preview(app),/Replant now: \+1 permanent sparks/);
        assert.match(preview(app),/This replant reaches the permanent spark limit/);assert.doesNotMatch(preview(app),/Next award:/);
        app.click('reset');app.click('reset');assert.doesNotMatch(preview(app),/Replant resets:|limit reached/);
        assert.ok(preview(app).includes(`(${exact(world.prestigeThreshold)} more)`));
      }));
      await t.test(`${world.id}: settled income refreshes goal exactly once`,()=>{
        const state=newRun(world,now);state.producers[world.producers[0].id]=1;
        state.banked=state.runProduced=state.allTime=world.prestigeThreshold-1;
        return run(initial(world,state),app=>{
          assert.match(preview(app),/\(1 more\)/);app.tick(1000);
          assert.match(preview(app),/Replant now: \+1 permanent sparks/);
          const current=JSON.parse(app.export());assert.equal(current.runProduced,world.prestigeThreshold);
          app.tick(0);assert.deepEqual(JSON.parse(app.export()),current);
        });
      });
    }
    await t.test('world switches and damaged save recovery do not retain another forecast',()=>{
      const first=WORLDS[0],second=WORLDS[1],state=ready(first);
      return run({entries:[[storageKey(first.id),JSON.stringify(state)],[storageKey(second.id),'{bad']]},app=>{
        checkReady(app,first,state);app.choose(second.label);
        assert.equal(preview(app),'Load a valid save to preview replanting.');assert.equal(app.get('prestige').disabled,true);
        app.import(JSON.stringify(ready(second)));checkReady(app,second,ready(second));
        app.choose(first.label);checkReady(app,first,state);
      });
    });
    await t.test('failed writes keep live post-replant state, not stale saved costs',()=>{
      const world=WORLDS[0],state=ready(world);
      return run({...initial(world,state),faults:{beforeSet:()=>{throw new Error('quota');}}},app=>{
        app.click('prestige');assert.deepEqual(JSON.parse(app.export()),prestige(world,state,now).state);
        assert.deepEqual(app.saved(world.id),state);assert.doesNotMatch(preview(app),/Replant resets:/);
        assert.match(app.text('save-status'),/could not be verified/);
      });
    });
  });
}

for(const target of ['fixture-source','fixture-built']) {
  test(`${target}: objective blockers show progress and clear after actual actions`,()=>{
    const state=ready(objective);
    return withBrowser(join(out,target,'browser.mjs'),html,{now,...initial(objective,state)},app=>{
      assert.equal(app.get('prestige').disabled,true);
      assert.match(preview(app),/Production qualifies for 2 sparks/);
      assert.match(preview(app),/Make two manual actions \(0\/2\)/);
      assert.match(preview(app),/All objectives must also be complete/);
      assert.doesNotMatch(preview(app),/Replant resets:/);
      app.tap();assert.match(preview(app),/Make two manual actions \(1\/2\)/);
      app.tick(0);assert.match(preview(app),/Make two manual actions \(1\/2\)/);
      app.tap();assert.equal(app.get('prestige').disabled,false);
      assert.doesNotMatch(preview(app),/Still needed:/);assert.match(preview(app),/Objectives start over/);
      const before=JSON.parse(app.export());app.click('prestige');
      assert.deepEqual(JSON.parse(app.export()),prestige(objective,before,now).state);
      assert.match(preview(app),/Make two manual actions \(0\/2\)/);assert.doesNotMatch(preview(app),/Replant resets:/);
    });
  });
}
