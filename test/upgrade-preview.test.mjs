import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';
import { WORLDS } from '../src/worlds.mjs';
import { newRun, buyUpgrade, incomePerSecond, tapYield, MAX_POINTS } from '../src/engine.mjs';
import { withBrowser, storageKey } from './helpers/browser-harness.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),now=1_793_797_200_000;
const out=await mkdtemp(join(tmpdir(),'idle-upgrade-preview-'));
after(()=>rm(out,{recursive:true,force:true}));
await build(out);
const html=await readFile(join(out,'index.html'),'utf8');
const targets=[['source',join(root,'src/browser.mjs')],['built',join(out,'assets/browser.mjs')]];
const exact=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const funded=(world,banked=MAX_POINTS)=>({...newRun(world,now),banked,runProduced:MAX_POINTS,allTime:MAX_POINTS});
const initial=(world,state)=>({search:`?world=${world.id}`,entries:[[storageKey(world.id),JSON.stringify(state)]]});
const row=(app,i)=>app.get('upgrades').children[i];
const button=(app,i)=>row(app,i).children[1];
const previewNode=(app,i)=>row(app,i).children[0].children.find(node=>node.getAttribute('id')?.startsWith('preview-upgrade-'));
const preview=(app,i)=>{const node=previewNode(app,i);assert.ok(node);return node.textContent;};
function check(app,world,state,i) {
  const u=world.upgrades[i],actual=buyUpgrade(world,state,u.id,now);
  assert.ok(actual.accepted);
  const delta=u.effect==='tap'?tapYield(world,actual.state)-tapYield(world,state):incomePerSecond(world,actual.state)-incomePerSecond(world,state);
  const gain=u.effect==='tap'?`+${exact.format(delta)} per action`:`+${exact.format(delta)} / sec at current inventory`;
  assert.equal(preview(app,i),`Upgrade: ${exact.format(u.cost)} ${world.unit}; ${gain}.${u.effect==='production'&&delta===0?' No immediate increase at the current inventory and output limit.':''}`);
  assert.equal(button(app,i).getAttribute('aria-describedby'),`readiness-${u.id} preview-upgrade-${u.id}`);
  return actual;
}

test('built instructions distinguish immediate upgrade gains from nominal percentages',()=>{
  assert.match(html,/Affordable upgrade previews show the exact price and immediate gain per action or per second/);
  assert.match(html,/Automatic gains use your current producers, bonuses and output limit/);
});

for(const [target,entry] of targets) {
  test(`${target}: upgrade decisions use the actual playable consumer`,async t=>{
    const run=(options,callback)=>withBrowser(entry,html,{now,...options},callback);
    for(const world of WORLDS) {
      await t.test(`${world.id}: every upgrade has exact alternatives without spending, then executes once`,()=>{
        const state=funded(world);state.prestige=7;
        for(const p of world.producers)state.producers[p.id]=3;
        return run(initial(world,state),app=>{
          for(let i=0;i<world.upgrades.length;i++)check(app,world,state,i);
          app.tick(0);app.tick(0);
          assert.deepEqual(JSON.parse(app.export()),state);
          const actual=check(app,world,state,0);button(app,0).click();
          assert.equal(app.text('status'),`Installed ${world.upgrades[0].label} for ${exact.format(world.upgrades[0].cost)} ${world.unit}.`);
          assert.deepEqual(JSON.parse(app.export()),actual.state);
          assert.equal(preview(app,0),'Upgrade: already installed.');
          assert.equal(button(app,0).disabled,true);button(app,0).click();
          assert.deepEqual(JSON.parse(app.export()),actual.state);
          for(let i=1;i<world.upgrades.length;i++)check(app,world,actual.state,i);
        });
      });
      await t.test(`${world.id}: locked, unfunded, funded and owned previews replace stale claims`,()=>run({search:`?world=${world.id}`},app=>{
        for(let i=0;i<world.upgrades.length;i++)assert.equal(preview(app,i),'Upgrade: locked.');
        const poor=funded(world,0);app.import(JSON.stringify(poor));
        for(let i=0;i<world.upgrades.length;i++)assert.equal(preview(app,i),'Upgrade: not affordable yet.');
        const rich=funded(world);app.import(JSON.stringify(rich));
        for(let i=0;i<world.upgrades.length;i++)check(app,world,rich,i);
        const owned=structuredClone(rich);for(const u of world.upgrades)owned.upgrades[u.id]=true;
        app.import(JSON.stringify(owned));
        for(let i=0;i<world.upgrades.length;i++)assert.equal(preview(app,i),'Upgrade: already installed.');
        app.click('reset');app.click('reset');
        for(let i=0;i<world.upgrades.length;i++)assert.equal(preview(app,i),'Upgrade: locked.');
      }));
      await t.test(`${world.id}: production gains reflect additive bonuses, rounding and zero producers`,()=>{
        const state=funded(world),i=world.upgrades.findIndex(u=>u.effect==='production');
        return run(initial(world,state),app=>{
          check(app,world,state,i);assert.match(preview(app,i),/\+0 \/ sec.*No immediate increase/);
          state.producers[world.producers[0].id]=1;state.prestige=3;
          app.import(JSON.stringify(state));check(app,world,state,i);
          const actual=buyUpgrade(world,state,world.upgrades[i].id,now);
          assert.equal(incomePerSecond(world,actual.state)-incomePerSecond(world,state),1);
          button(app,i).click();assert.deepEqual(app.saved(world.id),actual.state);
          assert.equal(tapYield(world,actual.state),tapYield(world,state));
        });
      });
      await t.test(`${world.id}: actual click settles elapsed time and a purchase updates affordability`,()=>{
        const first=world.upgrades[0],second=world.upgrades[1],state=funded(world,first.cost);
        state.producers[world.producers[0].id]=1;
        return run(initial(world,state),app=>{
          check(app,world,state,0);assert.equal(preview(app,1),'Upgrade: not affordable yet.');
          app.tick(second.cost*1000);
          const current=JSON.parse(app.export());check(app,world,current,0);check(app,world,current,1);
          const expected=buyUpgrade(world,current,second.id,app.now());button(app,1).click();
          assert.deepEqual(JSON.parse(app.export()),expected.state);
          check(app,world,expected.state,0);
          button(app,0).click();assert.equal(preview(app,0),'Upgrade: already installed.');
          assert.equal(preview(app,2),'Upgrade: not affordable yet.');
        });
      });
    }
    await t.test('switching worlds restores their own inventory-dependent gains',()=>{
      const first=funded(WORLDS[0]),second=funded(WORLDS[1]);
      first.producers.pencil=7;second.producers.antenna=2;
      return run({entries:[[storageKey(WORLDS[0].id),JSON.stringify(first)],[storageKey(WORLDS[1].id),JSON.stringify(second)]]},app=>{
        check(app,WORLDS[0],first,1);app.choose(WORLDS[1].label);check(app,WORLDS[1],second,1);
        app.choose(WORLDS[0].label);check(app,WORLDS[0],first,1);
      });
    });
    await t.test('damaged saves show no speculative upgrade values',()=>run({entries:[[storageKey(WORLDS[0].id),'{bad']]},app=>{
      for(let i=0;i<WORLDS[0].upgrades.length;i++) {
        assert.equal(preview(app,i),'Load a valid save to preview this upgrade.');assert.equal(button(app,i).disabled,true);
      }
      assert.equal(app.export(),'{bad');
    }));
    await t.test('storage failure preserves live previews and export instead of reverting the purchase',()=>{
      const world=WORLDS[0],state=funded(world);state.producers.pencil=3;
      return run({...initial(world,state),faults:{beforeSet:()=>{throw new Error('quota');}}},app=>{
        const actual=check(app,world,state,1);button(app,1).click();
        assert.deepEqual(JSON.parse(app.export()),actual.state);
        assert.equal(preview(app,1),'Upgrade: already installed.');assert.match(app.text('save-status'),/could not be verified/);
        check(app,world,actual.state,0);
        assert.deepEqual(app.saved(world.id),state);
      });
    });
  });
}
