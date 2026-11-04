import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engine.mjs';
import {WORLDS} from '../src/worlds.mjs';
const now=1700000000000;
const funded=(world,produced=world.prestigeThreshold*9)=>({...e.newRun(world,now),banked:produced,runProduced:produced,allTime:produced});
function assertQuote(world,state) {
  const original=structuredClone(state),quote=e.quotePrestige(world,state),actual=e.prestige(world,state,state.lastMs);
  assert.equal(quote.accepted,actual.accepted);
  assert.equal(quote.awarded,actual.awarded ?? 0);
  assert.equal(quote.reason,actual.reason);
  assert.equal(quote.awarded,e.availablePrestige(world,state));
  assert.deepEqual(state,original);
  assert.equal(Object.hasOwn(quote,'state'),false);
  if(quote.reset) {
    assert.equal(quote.reset.prestige,actual.state.prestige);
    assert.equal(quote.reset.tapYield,e.tapYield(world,actual.state));
    assert.equal(quote.reset.rate,e.incomePerSecond(world,actual.state));
    assert.equal(quote.reset.bankedLost,state.banked-actual.state.banked);
    assert.equal(quote.reset.producerUnitsLost,Object.values(state.producers).reduce((s,n)=>s+n,0));
    assert.equal(quote.reset.upgradesLost,Object.values(state.upgrades).filter(Boolean).length);
    assert.equal(actual.state.allTime,state.allTime);assert.equal(actual.state.taps,state.taps);
  } else assert.equal(quote.accepted,false);
  if(quote.next) {
    const next=quote.next;
    assert.equal(BigInt(next.runProduced),BigInt(world.prestigeThreshold)*BigInt(next.awarded)**2n);
    assert.equal(next.missingProduced,next.runProduced-state.runProduced);
    assert.ok(next.missingProduced>0);
    const before={...state,runProduced:next.runProduced-1,allTime:e.MAX_POINTS};
    const at={...state,runProduced:next.runProduced,allTime:e.MAX_POINTS};
    assert.equal(e.quotePrestige(world,before).productionAward,next.awarded-1);
    assert.equal(e.quotePrestige(world,at).productionAward,next.awarded);
  }
  return quote;
}
for(const world of WORLDS) {
  test(`${world.id}: quote shows the next spark and exactly matches native reset`,()=>{
    const start=assertQuote(world,e.newRun(world,now));
    assert.deepEqual(start.next,{awarded:1,runProduced:world.prestigeThreshold,missingProduced:world.prestigeThreshold});
    let state=funded(world);
    state=e.buyProducer(world,state,world.producers[0].id,4,now).state;
    state=e.buyUpgrade(world,state,world.upgrades[0].id,now).state;
    state=e.tap(world,state,now).state;
    state.prestige=4;
    const quote=assertQuote(world,state);
    assert.equal(quote.awarded,3);assert.equal(quote.reset.prestige,7);
    assert.equal(quote.reset.tapYield,8);assert.equal(quote.reset.rate,0);
    assert.equal(quote.reset.producerUnitsLost,4);assert.equal(quote.reset.upgradesLost,1);
    assert.equal(quote.next.awarded,4);assert.equal(quote.next.runProduced,world.prestigeThreshold*16);
  });
  test(`${world.id}: every reachable threshold and both neighbors use exact integer production`,()=>{
    let checked=0;
    for(const prestige of [0,1,7,998,999,1000])for(let award=0;award<=1000-prestige;award++) {
      const target=BigInt(world.prestigeThreshold)*BigInt(award)**2n;
      if(target>BigInt(e.MAX_POINTS))break;
      for(const delta of [-1n,0n,1n]) {
        const produced=target+delta;
        if(produced<0n || produced>BigInt(e.MAX_POINTS))continue;
        const state={...funded(world,Number(produced)),prestige};
        const quote=assertQuote(world,state);
        const expected=Math.min(1000-prestige,delta<0n?award-1:award);
        assert.equal(quote.productionAward,expected);checked++;
      }
    }
    assert.ok(checked>8000);
  });
  test(`${world.id}: cap and unattainable next threshold are distinct from more affordable production`,()=>{
    const capped={...funded(world),prestige:1000};
    const quote=assertQuote(world,capped);
    assert.equal(quote.remainingCapacity,0);assert.equal(quote.next,null);assert.equal(quote.reset,null);
    const near={...funded(world,e.MAX_POINTS),prestige:999};
    const last=assertQuote(world,near);
    assert.equal(last.awarded,1);assert.equal(last.remainingCapacity,1);assert.equal(last.next,null);
    const enormous=e.defineWorld({...world,prestigeThreshold:e.MAX_POINTS});
    const limited=assertQuote(enormous,funded(enormous,e.MAX_POINTS));
    assert.equal(limited.awarded,1);assert.equal(limited.remainingCapacity,1000);assert.equal(limited.next,null);
  });
}

test('objective shortfalls are detached and do not become production or completed actions',()=>{
  const base=WORLDS[0],world=e.defineWorld({...base,id:'replant-objectives',prestigeObjectives:[
    {id:'practice',label:'Make two manual actions',action:'tap',count:2},
    {id:'tools',label:'Buy two tools',action:'buy-producer',targetId:base.producers[0].id,count:2},
  ]});
  let state=funded(world);
  const first=assertQuote(world,state);
  assert.equal(first.productionAward,3);assert.equal(first.awarded,0);assert.equal(first.reason,'objectives-not-met');
  assert.equal(first.next.awarded,4);assert.equal(first.reset,null);assert.equal(first.missingObjectives.length,2);
  first.missingObjectives[0].progress=2;first.missingObjectives.splice(1);
  assert.equal(state.objectiveProgress.practice,0);
  assert.equal(e.quotePrestige(world,state).missingObjectives.length,2);
  state=e.tap(world,state,now).state;state=e.tap(world,state,now).state;
  const partial=assertQuote(world,state);assert.equal(partial.missingObjectives.length,1);assert.equal(partial.missingObjectives[0].id,'tools');
  state=e.buyProducer(world,state,base.producers[0].id,2,now).state;
  const done=assertQuote(world,state);assert.equal(done.awarded,3);assert.deepEqual(done.missingObjectives,[]);
  const reset=e.prestige(world,state,now).state;
  assert.equal(e.quotePrestige(world,reset).missingObjectives.length,2);
  assert.deepEqual(reset.objectiveProgress,e.newRun(world,now).objectiveProgress);
});

test('quotes never settle clocks; later commands recompute production, inventory and award',()=>{
  const world=WORLDS[0];
  let state=funded(world,world.prestigeThreshold-1);
  state.producers[world.producers[0].id]=1;
  const copy=structuredClone(state),quote=e.quotePrestige(world,state);
  assert.equal(quote.accepted,false);assert.deepEqual(state,copy);
  assert.equal(e.prestige(world,state,now+1000).accepted,true);
  state=funded(world);const before=e.quotePrestige(world,state);
  const spent=e.buyProducer(world,state,world.producers[0].id,2,now).state;
  const after=e.quotePrestige(world,spent);
  assert.equal(after.awarded,before.awarded);
  assert.ok(after.reset.bankedLost<before.reset.bankedLost);
  assert.equal(after.reset.producerUnitsLost,2);
});

test('malformed runs cannot yield a plausible reset quote',()=>{
  const world=WORLDS[0],state=funded(world);
  for(const mutate of [s=>s.kind='other',s=>s.worldId='other',s=>s.banked=-1,s=>s.prestige=1001,
    s=>s.runProduced=s.allTime+1,s=>s.producers={},s=>s.upgrades={},s=>s.lastMs=Infinity]) {
    const bad=structuredClone(state);mutate(bad);assert.throws(()=>e.quotePrestige(world,bad));
  }
});

test('large custom thresholds retain exact attainable goals and never overflow the point cap',()=>{
  for(const threshold of [100,1000000007,111111111111111,250000000000000,999999999999999,e.MAX_POINTS]) {
    const world=e.defineWorld({...WORLDS[0],prestigeThreshold:threshold});
    for(let award=1;award<=1000;award++) {
      const target=BigInt(threshold)*BigInt(award)**2n;
      if(target>BigInt(e.MAX_POINTS))break;
      for(const produced of [Number(target)-1,Number(target),Math.min(e.MAX_POINTS,Number(target)+1)])
        assertQuote(world,funded(world,produced));
    }
  }
});
