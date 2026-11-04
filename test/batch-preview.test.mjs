import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';
import { WORLDS } from '../src/worlds.mjs';
import { newRun, buyProducer, incomePerSecond, MAX_LEVEL, MAX_POINTS } from '../src/engine.mjs';
import { withBrowser, storageKey } from './helpers/browser-harness.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const now=1_793_797_200_000;
const out=await mkdtemp(join(tmpdir(),'idle-batch-preview-'));
after(()=>rm(out,{recursive:true,force:true}));
await build(out);
const html=await readFile(join(out,'index.html'),'utf8');
const targets=[['source',join(root,'src/browser.mjs')],['built',join(out,'assets/browser.mjs')]];
const exact=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const row=(app,index=0)=>app.get('producers').children[index];
const button=(app,n,index=0)=>row(app,index).children[1].children.find(node=>node.textContent===`Buy ${n}`);
const previewNode=(app,n,index=0)=>row(app,index).children[0].children.find(node=>node.getAttribute('id')===`preview-${WORLDS.find(w=>w.label===app.text('world-name')).producers[index].id}-${n}`);
const preview=(app,n,index=0)=>{
  const node=previewNode(app,n,index);
  assert.ok(node,`visible preview exists for Buy ${n}`);
  return node.textContent;
};
const initial=(world,state)=>({search:`?world=${world.id}`,entries:[[storageKey(world.id),JSON.stringify(state)]]});
const funded=(world,banked)=>({...newRun(world,now),banked,allTime:MAX_POINTS,runProduced:MAX_POINTS});
const checkQuote=(app,world,state,n,index=0)=>{
  const quote=buyProducer(world,state,world.producers[index].id,n,now);
  assert.ok(quote.accepted);
  assert.equal(preview(app,n,index),`Buy ${n}: ${quote.count} for ${exact.format(quote.spent)} ${world.unit}; +${exact.format(incomePerSecond(world,quote.state)-incomePerSecond(world,state))} / sec.`);
  return quote;
};

test('built instructions explain current exact batch alternatives and the existing quantity limits',()=>{
  assert.match(html,/up to 10 and 100 respectively/);
  assert.match(html,/quantity, exact total price and added automatic production available now/);
  assert.match(html,/Each preview is a separate alternative; buying one changes the others/);
});

for(const [target,entry] of targets) {
  test(`${target}: batch choices through the actual player consumer`,async t=>{
    const run=(options,callback)=>withBrowser(entry,html,{now,...options},callback);
    for(const world of WORLDS) {
      await t.test(`${world.id}: disclose a partial batch before spending, then execute the native purchase`,()=>run({search:`?world=${world.id}`},app=>{
        assert.equal(preview(app,10),'Buy 10: no affordable units yet.');
        assert.equal(preview(app,'max'),'Buy max: no affordable units yet.');
        app.tap(23);
        const before=JSON.parse(app.export());
        const expectedCost=world.id==='trace-garden'?22:18;
        assert.equal(preview(app,10),`Buy 10: 2 for ${expectedCost} ${world.unit}; +2 / sec.`);
        assert.equal(preview(app,'max'),`Buy max: 2 for ${expectedCost} ${world.unit}; +2 / sec.`);
        const quote=checkQuote(app,world,before,10);
        button(app,10).click();
        assert.equal(app.text('status'),`Purchased 2 × ${world.producers[0].label} for ${expectedCost} ${world.unit}.`);
        assert.deepEqual(JSON.parse(app.export()),quote.state);
        assert.deepEqual(app.saved(world.id),quote.state);
        assert.equal(preview(app,10),'Buy 10: no affordable units yet.');
      }));
      await t.test(`${world.id}: all producer previews match native alternatives and never buy or spend`,()=>{
        const state=funded(world,MAX_POINTS);
        return run(initial(world,state),app=>{
          for(let i=0;i<world.producers.length;i++) {
            checkQuote(app,world,state,10,i);
            checkQuote(app,world,state,'max',i);
          }
          assert.match(preview(app,10),/^Buy 10: 10 for /);
          assert.match(preview(app,'max'),/^Buy max: 100 for /);
          app.tick(0);app.tick(0);
          assert.deepEqual(JSON.parse(app.export()),state);
          assert.deepEqual(app.saved(world.id),state);
          const quote=checkQuote(app,world,state,'max');
          button(app,'max').click();
          assert.deepEqual(JSON.parse(app.export()),quote.state);
        });
      });
      await t.test(`${world.id}: large exact costs are not compact-rounded and the click reports the same debit`,()=>{
        const state=funded(world,MAX_POINTS);state.producers[world.producers[0].id]=140;
        return run(initial(world,state),app=>{
          const quote=checkQuote(app,world,state,'max');
          assert.ok(quote.spent>1_000_000_000);
          assert.ok(preview(app,'max').includes(exact.format(quote.spent)));
          button(app,'max').click();
          assert.ok(app.text('status').includes(`for ${exact.format(quote.spent)} ${world.unit}.`));
          assert.deepEqual(JSON.parse(app.export()),quote.state);
        });
      });
    }
    await t.test('gain includes upgrades, prestige and the actual rounding of total automatic income',()=>{
      const world=WORLDS[0],state=funded(world,12);
      state.producers.pencil=1;state.upgrades.binding=true;
      return run(initial(world,state),app=>{
        assert.equal(preview(app,10),'Buy 10: 1 for 12 marks; +2 / sec.');
        const upgraded={...state,prestige:3};
        app.import(JSON.stringify(upgraded));
        checkQuote(app,world,upgraded,10);
        const bonus=buyProducer(world,upgraded,'pencil',10,now);
        assert.equal(incomePerSecond(world,bonus.state)-incomePerSecond(world,upgraded),2);
      });
    });
    await t.test('each alternative refreshes after a different purchase consumes the shared balance',()=>{
      const world=WORLDS[0],state=funded(world,100);
      return run(initial(world,state),app=>{
        assert.equal(preview(app,10,1),'Buy 10: 1 for 90 marks; +7 / sec.');
        button(app,10).click();
        assert.equal(preview(app,10,1),'Buy 10: no affordable units yet.');
        assert.equal(button(app,10,1).disabled,true);
      });
    });
    await t.test('no unlocked, capped or over-balance-limit producer is falsely offered',()=>{
      const world=WORLDS[0],state={...funded(world,MAX_POINTS),runProduced:0};
      state.producers.pencil=MAX_LEVEL;
      return run(initial(world,state),app=>{
        assert.equal(preview(app,10),'Buy 10: level limit reached.');
        assert.equal(preview(app,'max',1),'Buy max: locked.');
        assert.equal(button(app,10).disabled,true);
        assert.equal(button(app,'max',1).disabled,true);
        state.runProduced=MAX_POINTS;state.producers.press=200;
        app.import(JSON.stringify(state));
        assert.equal(preview(app,'max',1),'Buy max: no affordable units yet.');
        assert.equal(button(app,'max',1).disabled,true);
      });
    });
    await t.test('a timer alone refreshes affordability without buying a speculative batch',()=>{
      const world=WORLDS[0],state=funded(world,12);state.producers.pencil=1;
      return run(initial(world,state),app=>{
        assert.equal(preview(app,10),'Buy 10: 1 for 12 marks; +1 / sec.');
        app.tick(15_000);
        assert.equal(preview(app,10),'Buy 10: 2 for 27 marks; +2 / sec.');
        assert.equal(app.saved().banked,27);
        assert.equal(app.saved().producers.pencil,1);
        assert.equal(JSON.parse(app.export()).producers.pencil,1);
      });
    });
    await t.test('clicks recompute against newly accrued time after delayed rendering',()=>{
      const world=WORLDS[0],state=funded(world,12);state.producers.pencil=1;
      return run(initial(world,state),app=>{
        assert.equal(preview(app,10),'Buy 10: 1 for 12 marks; +1 / sec.');
        // A real click can arrive before the next scheduled render. Its native
        // transition must settle time rather than commit a stale preview state.
        Date.now=()=>now+15_000;
        const expected=buyProducer(world,state,'pencil',10,now+15_000);
        assert.equal(expected.count,2);
        button(app,10).click();
        assert.deepEqual(JSON.parse(app.export()),expected.state);
        assert.equal(app.saved().producers.pencil,3);
      });
    });
    await t.test('backward clocks do not let previews credit output or lose the admitted run',()=>{
      const world=WORLDS[0],state=funded(world,12);state.producers.pencil=1;state.lastMs=now+5000;
      return run(initial(world,state),app=>{
        assert.equal(preview(app,10),'Buy 10: 1 for 12 marks; +1 / sec.');
        app.tick(1000);
        assert.deepEqual(JSON.parse(app.export()),state);
      });
    });
    await t.test('switch, import and reset derive the selected live world rather than stale previews',()=>run({},app=>{
      app.tap(23);
      assert.equal(preview(app,10),'Buy 10: 2 for 22 marks; +2 / sec.');
      app.choose('Pocket Observatory');
      assert.equal(preview(app,10),'Buy 10: no affordable units yet.');
      app.tap(23);
      assert.equal(preview(app,10),'Buy 10: 2 for 18 signals; +2 / sec.');
      app.choose('Trace Garden');
      assert.equal(preview(app,10),'Buy 10: 2 for 22 marks; +2 / sec.');
      app.import(JSON.stringify(funded(WORLDS[0],10)));
      assert.equal(preview(app,10),'Buy 10: 1 for 10 marks; +1 / sec.');
      app.click('reset');app.click('reset');
      assert.equal(preview(app,10),'Buy 10: no affordable units yet.');
    }));
    await t.test('blocked saves never show speculative inventory, and recovery restores quotes',()=>run({entries:[[storageKey('trace-garden'),'{broken']]},app=>{
      assert.equal(preview(app,10),'Load a valid save to preview this batch.');
      assert.equal(button(app,10).disabled,true);
      assert.equal(app.storage.data.get(storageKey('trace-garden')),'{broken');
      app.import(JSON.stringify(funded(WORLDS[0],23)));
      assert.equal(preview(app,10),'Buy 10: 2 for 22 marks; +2 / sec.');
    }));
    await t.test('storage failures preserve a live affordable preview without saving its speculative state',()=>run({},app=>{
      app.storage.faults.beforeSet=()=>{throw new Error('quota');};
      app.tap(23);
      const before=app.export();
      assert.equal(preview(app,10),'Buy 10: 2 for 22 marks; +2 / sec.');
      app.tick(0);
      assert.equal(app.export(),before);
      assert.equal(app.saved().banked,0);
      assert.equal(JSON.parse(before).producers.pencil,0);
      assert.match(app.text('save-status'),/Live progress remains/);
    }));
    await t.test('bulk controls describe their own visible alternative without a noisy live region',()=>run({},app=>{
      for(let i=0;i<WORLDS[0].producers.length;i++)for(const n of [10,'max']) {
        const node=previewNode(app,n,i);
        assert.ok(node);
        assert.equal(node.getAttribute('aria-live'),null);
        assert.ok(button(app,n,i).getAttribute('aria-describedby').split(' ').includes(node.getAttribute('id')));
      }
    }));
  });
}
