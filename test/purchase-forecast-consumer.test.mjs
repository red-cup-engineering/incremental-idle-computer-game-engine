import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../scripts/build.mjs';
import { generateWorlds } from '../scripts/generate-worlds.mjs';
import { WORLDS } from '../src/worlds.mjs';
import * as engine from '../src/engine.mjs';
import { withBrowser, storageKey } from './helpers/browser-harness.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),now=1_793_797_200_000;
const out=await mkdtemp(join(tmpdir(),'idle-purchase-forecast-'));
after(()=>rm(out,{recursive:true,force:true}));
await build(out);
const html=await readFile(join(out,'index.html'),'utf8');
const row=(app,type,index)=>app.get(type).children[index];
const readiness=(app,type,index)=>row(app,type,index).children[0].children.find(n=>n.className==='purchase-readiness').textContent;
const producerButton=(app,index)=>row(app,'producers',index).children[1].children.find(n=>n.textContent==='Buy 1');
const upgradeButton=(app,index)=>row(app,'upgrades',index).children[1];
const initial=(world,state)=>({search:`?world=${world.id}`,entries:[[storageKey(world.id),JSON.stringify(state)]]});
const targets=[['source',join(root,'src/browser.mjs')],['built',join(out,'assets/browser.mjs')]];

test('built instructions explain combined requirements without promising an automatic purchase',()=>{
  assert.match(html,/production still needed to unlock and the stock still needed to pay/);
  assert.match(html,/Nothing is bought automatically/);
});

for(const [target,entry] of targets)for(const world of WORLDS) {
  test(`${target}: ${world.id} next locked producer can be planned before its unlock`,()=>withBrowser(entry,html,{now,search:`?world=${world.id}`},app=>{
    app.tap(world.producers[0].baseCost);producerButton(app,0).click();
    const before=JSON.parse(app.export()),item=world.producers[1],quote=engine.forecastProducerPurchase(world,before,item.id,now,now+world.offlineCapSeconds*1000);
    const readout=readiness(app,'producers',1);
    assert.ok(readout.includes(`Produce ${item.unlockAt-before.runProduced} more ${world.unit}`));
    assert.ok(readout.includes(`${item.baseCost} ${world.unit} short.`));
    assert.match(readout,/until unlocked and affordable at this rate/);
    assert.equal(producerButton(app,1).disabled,true);
    producerButton(app,1).click();app.tick(0);
    assert.deepEqual(JSON.parse(app.export()),before,'planning does not spend, unlock, or award production');
    app.tick(quote.waitMs-1);
    assert.equal(producerButton(app,1).disabled,true);
    app.tick(1);
    assert.equal(readiness(app,'producers',1),'Next unit: Ready now.');
    assert.equal(JSON.parse(app.export()).producers[item.id],0,'no automatic purchase');
    const at=app.now(),ready=JSON.parse(app.export());
    producerButton(app,1).click();
    assert.match(app.text('status'),/Purchased 1/);
    assert.deepEqual(JSON.parse(app.export()),engine.buyProducer(world,ready,item.id,1,at).state);
  }));
  test(`${target}: ${world.id} locked upgrade forecast stays advisory through spending and reload`,async()=>{
    let saved;
    await withBrowser(entry,html,{now,search:`?world=${world.id}`},app=>{
      app.tap(world.producers[0].baseCost);producerButton(app,0).click();
      const initialRun=JSON.parse(app.export()),upgrade=world.upgrades[0];
      assert.match(readiness(app,'upgrades',0),/until unlocked and affordable at this rate/);
      app.tap(20);producerButton(app,0).click();
      const changed=JSON.parse(app.export());
      assert.notEqual(changed.banked,initialRun.banked);
      const quote=engine.forecastUpgradePurchase(world,changed,upgrade.id,now,now+world.offlineCapSeconds*1000);
      app.tick(quote.waitMs-1);assert.equal(upgradeButton(app,0).disabled,true);
      app.tick(1);assert.equal(upgradeButton(app,0).disabled,false);
      assert.equal(JSON.parse(app.export()).upgrades[upgrade.id],false);
      const before=JSON.parse(app.export());
      upgradeButton(app,0).click();
      saved=JSON.parse(app.export());
      assert.deepEqual(saved,engine.buyUpgrade(world,before,upgrade.id,app.now()).state);
      assert.equal(readiness(app,'upgrades',0),'Already installed.');
    });
    await withBrowser(entry,html,{now:saved.lastMs,...initial(world,saved)},app=>{
      assert.deepEqual(JSON.parse(app.export()),saved);
      assert.equal(readiness(app,'upgrades',0),'Already installed.');
      assert.equal(upgradeButton(app,0).disabled,true);
    });
  });
}

for(const [target,entry] of targets)test(`${target}: locked forecasts pause on reversed time and resume at the retained fractional tick`,()=> {
  const world=WORLDS[0];
  let state=engine.newRun(world,now+5000);
  for(let n=0;n<10;n++)state=engine.tap(world,state,now+5000).state;
  state=engine.buyProducer(world,state,'pencil',1,now+5000).state;
  return withBrowser(entry,html,{now,...initial(world,state)},app=>{
    assert.match(readiness(app,'producers',1),/Produce 50 more marks.*90 marks short.*Idle estimate paused/);
    app.tick(5499);
    assert.match(readiness(app,'producers',1),/About 1m 30s until unlocked and affordable/);
    app.tick(89500);assert.equal(producerButton(app,1).disabled,true);
    app.tick(1);assert.equal(producerButton(app,1).disabled,false);
    assert.equal(JSON.parse(app.export()).producers.press,0);
  });
});

test('an authored unlock above price survives generation, static building and an independently full bank',async t=>{
  const fixture=await mkdtemp(join(tmpdir(),'idle-unlock-forecast-design-'));
  t.after(()=>rm(fixture,{recursive:true,force:true}));
  for(const directory of ['src','scripts','design'])
    await cp(join(root,directory),join(fixture,directory),{recursive:true});
  await symlink(await realpath(join(root,'node_modules')),join(fixture,'node_modules'),'dir');
  const catalogPath=join(fixture,'design/world-catalog.json'),catalog=JSON.parse(await readFile(catalogPath,'utf8'));
  catalog[0].producers[1].baseCost=30;catalog[0].producers[1].unlockAt=60;
  catalog[0].upgrades[0].cost=30;catalog[0].upgrades[0].unlockAt=60;
  await writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
  await generateWorlds({root:fixture});
  const {build:buildFixture}=await import(pathToFileURL(join(fixture,'scripts/build.mjs')).href);
  await buildFixture(join(fixture,'dist'));
  const {WORLDS:worlds}=await import(pathToFileURL(join(fixture,'src/worlds.mjs')).href);
  const world=worlds[0],state={...engine.newRun(world,now),banked:engine.MAX_POINTS,allTime:engine.MAX_POINTS};
  state.producers.pencil=1;
  const fixtureHtml=await readFile(join(fixture,'dist/index.html'),'utf8');
  for(const entry of [join(fixture,'src/browser.mjs'),join(fixture,'dist/assets/browser.mjs')]) {
    await withBrowser(entry,fixtureHtml,{now,...initial(world,state)},app=>{
      for(const type of ['producers','upgrades'])
        assert.equal(readiness(app,type,type==='producers'?1:0),'Produce 60 more marks this run to unlock. About 1m until unlocked and affordable at this rate.');
      app.tick(59999);
      assert.equal(producerButton(app,1).disabled,true);assert.equal(upgradeButton(app,0).disabled,true);
      app.tick(1);
      assert.equal(JSON.parse(app.export()).banked,engine.MAX_POINTS);
      producerButton(app,1).click();upgradeButton(app,0).click();
      const result=JSON.parse(app.export());
      assert.equal(result.producers.press,1);assert.equal(result.upgrades.ink,true);
      assert.equal(result.banked,engine.MAX_POINTS-60);assert.equal(result.runProduced,60);
    });
  }
});
