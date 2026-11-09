import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';
import { WORLDS } from '../src/worlds.mjs';
import { newRun, tap, buyProducer, buyUpgrade, prestige, MAX_LEVEL, MAX_POINTS, producerPrice } from '../src/engine.mjs';
import { withBrowser, storageKey } from './helpers/browser-harness.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const now=1_793_797_200_000;
const out=await mkdtemp(join(tmpdir(),'idle-purchase-readiness-'));
after(()=>rm(out,{recursive:true,force:true}));
await build(out);
const html=await readFile(join(out,'index.html'),'utf8');
const targets=[['source',join(root,'src/browser.mjs')],['built',join(out,'assets/browser.mjs')]];
const row=(app,type,index=0)=>app.get(type).children[index];
const ready=(app,type,index=0)=>row(app,type,index).children[0].children.find(node=>node.className==='purchase-readiness')?.textContent;
const producerButton=(app,index=0,label='Buy 1')=>row(app,'producers',index).children[1].children.find(node=>node.textContent===label);
const upgradeButton=(app,index=0)=>row(app,'upgrades',index).children[1];
const taps=(world,count)=>{let state=newRun(world,now);for(let i=0;i<count;i++)state=tap(world,state,now).state;return state;};
const initial=(world,state)=>({search:`?world=${world.id}`,entries:[[storageKey(world.id),JSON.stringify(state)]]});

test('built page discloses next-unit and partial-batch semantics without live countdown announcements',()=>{
  assert.match(html,/Next-unit estimates assume the current automatic rate/);
  assert.match(html,/up to 10 and 100 respectively/);
});

for(const [target,entry] of targets) {
  test(`${target}: player purchase readiness through the actual browser`,async t=>{
    const run=(options,callback)=>withBrowser(entry,html,{now,...options},callback);
    for(const world of WORLDS) {
      await t.test(`${world.id}: no-income shortfall becomes ready through the original manual action`,()=>run({search:`?world=${world.id}`},app=>{
        const first=world.producers[0];
        assert.match(ready(app,'producers'),new RegExp(`${first.baseCost} ${world.unit} short`));
        assert.ok(ready(app,'producers').includes(world.verb));
        assert.equal(producerButton(app).disabled,true);
        app.tap(first.baseCost);
        assert.equal(ready(app,'producers'),'Next unit: Ready now.');
        assert.equal(producerButton(app).disabled,false);
        const before=JSON.parse(app.export());
        app.tick(0);app.tick(0);
        assert.deepEqual(JSON.parse(app.export()),before,'readiness does not mint time, points, or purchases');
        producerButton(app).click();
        const expected=buyProducer(world,before,first.id,1,now);
        assert.match(app.text('status'),new RegExp(`Purchased 1 × ${first.label}`));
        assert.deepEqual(JSON.parse(app.export()),expected.state);
        assert.match(ready(app,'producers'),/at this rate/);
      }));
    }
    await t.test('retains fractional ticks and becomes ready exactly on the real production tick',()=>run({},app=>{
      app.tap(10);producerButton(app).click();
      assert.equal(ready(app,'producers'),'Next unit: 12 marks short. About 12s at this rate.');
      app.tick(500);
      assert.equal(ready(app,'producers'),'Next unit: 12 marks short. About 12s at this rate.');
      app.tick(11499);
      assert.equal(ready(app,'producers'),'Next unit: 1 marks short. About 1s at this rate.');
      assert.equal(producerButton(app).disabled,true);
      app.tick(1);
      assert.equal(ready(app,'producers'),'Next unit: Ready now.');
      assert.equal(producerButton(app).disabled,false);
      assert.equal(app.saved().banked,12);
    }));
    await t.test('whole-second estimates stay accurate across minute and hour boundaries',async()=>{
      const world=WORLDS[0],owned=59,cost=producerPrice(world.producers[0],owned);
      for(const [ticks,phase,label] of [[59,0,'59s'],[60,0,'1m'],[61,0,'1m 1s'],[3599,0,'59m 59s'],[3600,0,'1h'],[3601,0,'1h 1s'],[3601,999,'1h 1s']]){
        const state={...newRun(world,now-phase),banked:cost-ticks*owned,allTime:MAX_POINTS,runProduced:MAX_POINTS};state.producers.pencil=owned;
        assert.ok(state.banked>=0);
        await run(initial(world,state),app=>{
          assert.ok(ready(app,'producers').includes(`About ${label} at this rate.`),ready(app,'producers'));
          assert.deepEqual(JSON.parse(app.export()),state);
        });
      }
    });
    await t.test('locks describe earned-this-run progress even with an imported large balance',()=>{
      const world=WORLDS[0],state={...newRun(world,now),banked:1000,allTime:1000};
      return run(initial(world,state),app=>{
        assert.match(ready(app,'producers',1),/^Produce 60 more marks this run to unlock\./);
        assert.match(ready(app,'upgrades',0),/^Produce 20 more marks this run to unlock\./);
        assert.equal(producerButton(app,1).disabled,true);
        assert.equal(upgradeButton(app).disabled,true);
        app.tap(20);
        assert.equal(ready(app,'upgrades',0),'Ready now.');
      });
    });
    await t.test('partial batches report actual count and spent points, then update next-unit price',()=>run({},app=>{
      app.tap(23);const before=JSON.parse(app.export());
      producerButton(app,0,'Buy 10').click();
      assert.equal(app.text('status'),'Purchased 2 × Patient pencil for 22 marks.');
      assert.deepEqual(JSON.parse(app.export()),buyProducer(WORLDS[0],before,'pencil',10,now).state);
      assert.equal(ready(app,'producers'),'Next unit: 14 marks short. About 7s at this rate.');
    }));
    await t.test('production upgrade updates all quotes and its own installed state',()=>{
      const world=WORLDS[0];let state=buyProducer(world,taps(world,262),'pencil',2,now).state;
      return run(initial(world,state),app=>{
        assert.equal(ready(app,'upgrades',1),'Ready now.');
        upgradeButton(app,1).click();
        assert.deepEqual(JSON.parse(app.export()),buyUpgrade(world,state,'binding',now).state);
        assert.equal(ready(app,'upgrades',1),'Already installed.');
        assert.equal(upgradeButton(app,1).disabled,true);
        assert.equal(ready(app,'producers'),'Next unit: 15 marks short. About 5s at this rate.');
      });
    });
    await t.test('replant recomputes zero income, locked tiers and cheaper first unit',()=>{
      const world=WORLDS[0],state=buyProducer(world,taps(world,2500),'pencil',2,now).state;
      return run(initial(world,state),app=>{
        app.click('prestige');app.click('confirm-prestige');
        assert.deepEqual(JSON.parse(app.export()),prestige(world,state,now).state);
        assert.match(ready(app,'producers'),/10 marks short.*Make a mark/);
        assert.match(ready(app,'producers',1),/^Produce 60 more marks this run to unlock\./);
      });
    });
    await t.test('capped inventories and unreachable prices have no misleading countdown',()=>{
      const world=WORLDS[0],state={...taps(world,1),banked:MAX_POINTS,allTime:MAX_POINTS,runProduced:MAX_POINTS};
      state.producers.pencil=MAX_LEVEL;state.producers.press=200;
      assert.equal(producerPrice(world.producers[1],200),MAX_POINTS+1);
      return run(initial(world,state),app=>{
        assert.equal(ready(app,'producers'),'Maximum owned (1000).');
        assert.equal(producerButton(app).disabled,true);
        assert.equal(ready(app,'producers',1),'Next unit: Price exceeds the balance limit; no further purchase is possible.');
        assert.equal(producerButton(app,1).disabled,true);
      });
    });
    await t.test('wait beyond offline cap is explicitly qualified',()=>{
      const world=WORLDS[0],state={...newRun(world,now),allTime:1,runProduced:1};state.producers.pencil=75;
      return run(initial(world,state),app=>{
        assert.match(ready(app,'producers'),/at this rate \(beyond one offline collection cap\)/);
        assert.equal(producerButton(app).disabled,true);
      });
    });
    await t.test('clock reversal pauses deficit estimates but not funded readiness',()=>{
      const world=WORLDS[0],state=buyProducer(world,taps(world,10),'pencil',1,now+5000).state;
      return run(initial(world,state),app=>{
        assert.match(ready(app,'producers'),/Idle estimate paused/);
        app.tap(12);
        assert.equal(ready(app,'producers'),'Next unit: Ready now.');
        producerButton(app).click();
        assert.match(ready(app,'producers'),/Idle estimate paused/);
        app.tick(5000);
        assert.match(ready(app,'producers'),/About .* at this rate/);
      });
    });
    await t.test('world switches, imports and confirmed reset display the selected run only',()=>run({},app=>{
      app.tap(10);producerButton(app).click();
      app.choose('Pocket Observatory');
      assert.match(ready(app,'producers'),/8 signals short/);
      app.tap(8);producerButton(app).click();
      app.choose('Trace Garden');
      assert.match(ready(app,'producers'),/12 marks short/);
      app.import(JSON.stringify(taps(WORLDS[0],40)));
      assert.equal(ready(app,'producers'),'Next unit: Ready now.');
      app.click('reset');
      assert.equal(ready(app,'producers'),'Next unit: Ready now.','unconfirmed reset preserves current run');
      app.click('reset');
      assert.match(ready(app,'producers'),/10 marks short.*Make a mark/);
      app.choose('Pocket Observatory');
      assert.match(ready(app,'producers'),/10 signals short.*at this rate/);
    }));
    await t.test('blocked saves do not display placeholder estimates, but valid import restores them',()=>run({entries:[[storageKey('trace-garden'),'{broken']]},app=>{
      assert.equal(ready(app,'producers'),'Load a valid save to see purchase readiness.');
      assert.equal(ready(app,'upgrades'),'Load a valid save to see purchase readiness.');
      assert.equal(producerButton(app).disabled,true);
      app.import(JSON.stringify(taps(WORLDS[0],10)));
      assert.equal(ready(app,'producers'),'Next unit: Ready now.');
    }));
    await t.test('readiness is visible and associated with each purchase control without live-region chatter',()=>run({},app=>{
      for(const [type,definitions] of [['producers',WORLDS[0].producers],['upgrades',WORLDS[0].upgrades]]){
        for(let i=0;i<definitions.length;i++){
          const node=row(app,type,i).children[0].children.find(node=>node.className==='purchase-readiness');
          assert.equal(node.getAttribute('id'),`readiness-${definitions[i].id}`);
          assert.equal(node.getAttribute('aria-live'),null);
          const buttons=type==='producers'?row(app,type,i).children[1].children.filter(node=>node.tagName==='BUTTON'):[upgradeButton(app,i)];
          for(const button of buttons)assert.ok(button.getAttribute('aria-describedby').split(' ').includes(node.getAttribute('id')));
        }
      }
    }));
  });
}
