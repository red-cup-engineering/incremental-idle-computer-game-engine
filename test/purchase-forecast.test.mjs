import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '@red-cup-engineering/incremental-idle-game/engine';
import { WORLDS } from '../src/worlds.mjs';

const {defineWorld,newRun,advanceActive,buyProducer,buyUpgrade,incomePerSecond,MAX_POINTS,MAX_LEVEL}=engine;
const origin=137;
const world=defineWorld({...WORLDS[0],id:'purchase-forecast',offlineCapSeconds:60,
  producers:[
    {id:'source',label:'Source',baseCost:1,ratePerSecond:3,growthBasisPoints:10000,unlockAt:0},
    {id:'target',label:'Target',baseCost:30,ratePerSecond:7,growthBasisPoints:20000,unlockAt:60}],
  upgrades:[{id:'upgrade',label:'Upgrade',cost:30,unlockAt:60,effect:'production',amount:50}]});
const state=(changes={})=>({...newRun(world,origin),producers:{source:1,target:0},...changes});
const freeze=value=>{for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);};
const kinds=[
  ['producer',(w,s,from,to)=>engine.forecastProducerPurchase(w,s,'target',from,to),(w,s,at)=>buyProducer(w,s,'target',1,at)],
  ['upgrade',(w,s,from,to)=>engine.forecastUpgradePurchase(w,s,'upgrade',from,to),(w,s,at)=>buyUpgrade(w,s,'upgrade',at)]
];

for(const [kind,forecast,purchase] of kinds) {
  test(`${kind}: unlock and affordability become ready together, without changing the run`,()=>{
    const initial=freeze(state()),before=structuredClone(initial);
    const quote=forecast(world,initial,origin+499,origin+60000);
    assert.deepEqual(quote,{cost:30,missingBanked:30,missingProduced:60,rate:3,
      waitMs:19501,reachable:true,readyAtMs:origin+20000});
    assert.equal(purchase(world,initial,quote.readyAtMs-1).accepted,false);
    const ready=purchase(world,initial,quote.readyAtMs);
    assert.equal(ready.accepted,true);
    assert.equal(ready.state.banked,30);
    assert.deepEqual(initial,before);
    assert.equal(Object.hasOwn(quote,'state'),false);
  });
  test(`${kind}: paid stock, rather than unlock production, can be the later requirement`,()=>{
    const initial=state({banked:1,runProduced:59,allTime:59});
    const quote=forecast(world,initial,origin+999,origin+60000);
    assert.equal(quote.missingBanked,29);assert.equal(quote.missingProduced,1);
    assert.equal(quote.waitMs,9001);
    assert.equal(purchase(world,initial,quote.readyAtMs-1).accepted,false);
    assert.equal(purchase(world,initial,quote.readyAtMs).accepted,true);
  });
  test(`${kind}: a full bank does not prevent earning a separate production unlock`,()=>{
    const initial=state({banked:MAX_POINTS,allTime:MAX_POINTS});
    const quote=forecast(world,initial,origin,origin+60000);
    assert.equal(quote.missingBanked,0);assert.equal(quote.missingProduced,60);
    assert.equal(quote.waitMs,20000);
    const ready=purchase(world,initial,quote.readyAtMs);
    assert.equal(ready.accepted,true);assert.equal(ready.state.banked,MAX_POINTS-30);
    assert.equal(ready.state.runProduced,60);
  });
  test(`${kind}: capped production can still replenish spent stock`,()=>{
    const initial=state({banked:0,runProduced:MAX_POINTS,allTime:MAX_POINTS});
    const quote=forecast(world,initial,origin,origin+60000);
    assert.equal(quote.missingProduced,0);assert.equal(quote.waitMs,10000);
    const ready=purchase(world,initial,quote.readyAtMs);
    assert.equal(ready.accepted,true);assert.equal(ready.state.runProduced,MAX_POINTS);
  });
  test(`${kind}: every fractional phase agrees with actual native acceptance`,()=>{
    const initial=state({banked:17,runProduced:47,allTime:47});
    for(let phase=0;phase<1000;phase++) {
      const quote=forecast(world,initial,origin+phase,origin+60000);
      assert.equal(quote.waitMs,5000-phase);
      assert.equal(quote.readyAtMs,origin+5000);
      assert.equal(purchase(world,initial,quote.readyAtMs-1).accepted,false);
      assert.equal(purchase(world,initial,quote.readyAtMs).accepted,true);
    }
  });
  test(`${kind}: estimates beyond the selected active window are not arrival promises`,()=>{
    const initial=state();
    for(const duration of [0,19999,20000,60000]) {
      const quote=forecast(world,initial,origin,origin+duration);
      assert.equal(quote.waitMs,20000);assert.equal(quote.reachable,duration>=20000);
      assert.equal(quote.readyAtMs,duration>=20000?origin+20000:null);
    }
    const longWorld=defineWorld({...world,offlineCapSeconds:1});
    const quote=forecast(longWorld,initial,origin,origin+1000);
    assert.equal(quote.waitMs,20000);assert.equal(quote.reachable,false);
    assert.equal(purchase(longWorld,initial,origin+20000).accepted,false,'one offline return is capped');
    let run=initial;
    for(let tick=1;tick<=20;tick++)run=advanceActive(longWorld,run,origin+(tick-1)*1000,origin+tick*1000).state;
    assert.equal(purchase(longWorld,run,origin+20000).accepted,true,'continued active play reaches the estimate');
  });
  test(`${kind}: zero production distinguishes ready from unmet requirements`,()=>{
    const initial={...state(),producers:{source:0,target:0}};
    const quote=forecast(world,initial,origin,origin+60000);
    assert.equal(quote.waitMs,null);assert.equal(quote.reachable,false);assert.equal(quote.rate,0);
    const funded={...initial,banked:30,runProduced:60,allTime:60};
    assert.equal(forecast(world,funded,origin+999,origin+999).waitMs,0);
    assert.equal(forecast(world,funded,origin+999,origin+999).readyAtMs,origin+999);
  });
  test(`${kind}: malformed state, stale phase and invalid active intervals are refused`,()=>{
    assert.equal(typeof engine[kind==='producer'?'forecastProducerPurchase':'forecastUpgradePurchase'],'function');
    const initial=freeze(state());
    for(const [from,to] of [[origin-1,origin],[origin+1000,origin+1000],[origin+1,origin],[origin,origin+60001]])
      assert.throws(()=>forecast(world,initial,from,to),RangeError);
    for(const invalid of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'137',null,undefined]) {
      assert.throws(()=>forecast(world,initial,invalid,origin));
      assert.throws(()=>forecast(world,initial,origin,invalid));
    }
    assert.throws(()=>forecast(world,{...initial,banked:-1},origin,origin));
  });
}

test('structurally unavailable purchases never forecast another purchase',()=>{
  const initial=state();
  for(const [quote,reason] of [
    [engine.forecastProducerPurchase(world,initial,'missing',origin,origin),'unknown-producer'],
    [engine.forecastUpgradePurchase(world,initial,'missing',origin,origin),'unknown-upgrade'],
    [engine.forecastProducerPurchase(world,{...initial,producers:{source:1,target:MAX_LEVEL}},'target',origin,origin),'level-cap'],
    [engine.forecastProducerPurchase(world,{...initial,producers:{source:1,target:100}},'target',origin,origin),'price-cap'],
    [engine.forecastUpgradePurchase(world,{...initial,upgrades:{upgrade:true}},'upgrade',origin,origin),'already-owned']
  ]) {
    assert.equal(quote.reason,reason);assert.equal(quote.waitMs,null);
    assert.equal(quote.readyAtMs,null);assert.equal(quote.reachable,false);
  }
});

test('next producer price follows owned quantity rather than a first-unit estimate',()=>{
  const initial=state({banked:0,runProduced:60,allTime:60,producers:{source:1,target:1}});
  const quote=engine.forecastProducerPurchase(world,initial,'target',origin,origin+60000);
  assert.equal(quote.cost,60);assert.equal(quote.rate,10);assert.equal(quote.waitMs,6000);
  assert.equal(buyProducer(world,initial,'target',1,quote.readyAtMs-1).accepted,false);
  assert.equal(buyProducer(world,initial,'target',1,quote.readyAtMs).spent,60);
});

test('all shipped locked tiers reach their quoted tick and not the previous millisecond',()=>{
  for(const w of WORLDS) {
    let initial=newRun(w,origin);
    for(let n=0;n<w.producers[0].baseCost;n++)initial=engine.tap(w,initial,origin).state;
    initial=buyProducer(w,initial,w.producers[0].id,1,origin).state;
    for(const [rows,forecast,purchase] of [
      [w.producers,engine.forecastProducerPurchase,(s,id,at)=>buyProducer(w,s,id,1,at)],
      [w.upgrades,engine.forecastUpgradePurchase,(s,id,at)=>buyUpgrade(w,s,id,at)]
    ])for(const row of rows) {
      const quote=forecast(w,initial,row.id,origin+999,origin+w.offlineCapSeconds*1000);
      assert.equal(quote.reachable,true);
      assert.equal(purchase(initial,row.id,quote.readyAtMs-1).accepted,false);
      assert.equal(purchase(initial,row.id,quote.readyAtMs).accepted,true);
    }
  }
});

test('maximal rates, safe clock endpoints and unsafe duration estimates remain exact',()=>{
  const fast=defineWorld({...world,producers:world.producers.map((p,i)=>i===0?{...p,ratePerSecond:MAX_POINTS}:p)});
  const max=Number.MAX_SAFE_INTEGER;
  const initial={...state(),lastMs:max-1000};
  const quote=engine.forecastProducerPurchase(fast,initial,'target',max-1,max);
  assert.equal(quote.waitMs,1);assert.equal(quote.readyAtMs,max);
  assert.equal(buyProducer(fast,initial,'target',1,max-1).accepted,false);
  assert.equal(buyProducer(fast,initial,'target',1,max).accepted,true);
  const slow=defineWorld({...world,producers:world.producers.map((p,i)=>i===0?{...p,ratePerSecond:1}:{...p,unlockAt:MAX_POINTS})});
  const unsafe=engine.forecastProducerPurchase(slow,state(),'target',origin,origin+60000);
  assert.equal(unsafe.waitMs,null);assert.equal(unsafe.readyAtMs,null);
  const nearEnd=engine.forecastProducerPurchase(world,initial,'target',max-1,max);
  assert.equal(nearEnd.waitMs,19001);assert.equal(nearEnd.reachable,false);assert.equal(nearEnd.readyAtMs,null);
});

test('readiness uses exact bonuses without awarding objective progress or purchases',()=>{
  const w=defineWorld({...world,prestigeObjectives:[{id:'purchase',label:'Buy target',action:'buy-producer',targetId:'target',count:1}]});
  const initial=freeze({...newRun(w,origin),producers:{source:1,target:0},prestige:2,upgrades:{upgrade:true}});
  const before=structuredClone(initial),rate=incomePerSecond(w,initial);
  const quote=engine.forecastProducerPurchase(w,initial,'target',origin,origin+60000);
  assert.equal(rate,5);assert.equal(quote.waitMs,12000);
  assert.deepEqual(initial,before);assert.equal(initial.objectiveProgress.purchase,0);
  const ready=buyProducer(w,initial,'target',1,quote.readyAtMs);
  assert.equal(ready.state.objectiveProgress.purchase,1);
  assert.deepEqual(engine.admitRun(w,JSON.parse(JSON.stringify(initial))),initial);
});
