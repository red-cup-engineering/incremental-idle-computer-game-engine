import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '@red-cup-engineering/incremental-idle-computer-game-engine/engine';
import { WORLDS } from './fixtures/worlds.mjs';

const {MAX_POINTS,MAX_LEVEL,newRun,defineWorld,admitRun,advance,buyUpgrade,
  quoteUpgradePurchase,incomePerSecond,tapYield,availablePrestige}=engine;
const now=1_793_797_200_000;
const funded=(world,banked=MAX_POINTS)=>({...newRun(world,now),banked,runProduced:MAX_POINTS,allTime:MAX_POINTS});
const freeze=state=>{for(const value of Object.values(state))if(value&&typeof value==='object')Object.freeze(value);return Object.freeze(state);};
function compare(world,state,id) {
  const before=structuredClone(state),quote=quoteUpgradePurchase(world,freeze(state),id);
  const actual=buyUpgrade(world,state,id,state.lastMs);
  assert.equal(quote.accepted,actual.accepted);assert.equal(quote.reason,actual.reason);
  assert.deepEqual(Object.keys(quote).sort(),(quote.accepted ? ['accepted','spent','rateGain','tapGain'] : ['accepted','reason','spent','rateGain','tapGain']).sort());
  assert.deepEqual(Object.keys(actual).sort(),(actual.accepted ? ['accepted','state'] : ['accepted','reason','state']).sort());
  assert.equal(quote.spent,state.banked-actual.state.banked);
  assert.equal(quote.rateGain,incomePerSecond(world,actual.state)-incomePerSecond(world,state));
  assert.equal(quote.tapGain,tapYield(world,actual.state)-tapYield(world,state));
  assert.deepEqual(state,before);
  assert.deepEqual(admitRun(world,actual.state),actual.state);
  return {quote,actual};
}
function fixture({rate=1,amount=50,effect='production',cost=1,unlockAt=0}={}) {
  const base=WORLDS[0];
  return defineWorld({...base,id:'upgrade-quote-fixture',
    producers:[{...base.producers[0],ratePerSecond:rate}],
    upgrades:[{...base.upgrades[0],id:'boost',amount,effect,cost,unlockAt}]});
}

test('upgrade quote is available from the existing public engine entrance',()=>{
  assert.equal(typeof quoteUpgradePurchase,'function');
});
test('every shipped upgrade matches its command and independent bounded output arithmetic',()=>{
  let cases=0;
  for(const world of WORLDS)for(const upgrade of world.upgrades)
    for(const banked of [0,upgrade.cost-1,upgrade.cost,upgrade.cost+1,MAX_POINTS])
      for(const prestige of [0,1,13,1000])for(const owned of [0,1,7,MAX_LEVEL])for(const otherUpgrades of [false,true]) {
        const state=funded(world,banked);state.prestige=prestige;
        for(const p of world.producers)state.producers[p.id]=owned;
        for(const u of world.upgrades)state.upgrades[u.id]=u.id!==upgrade.id&&otherUpgrades;
        const {quote}=compare(world,state,upgrade.id),accepted=banked>=upgrade.cost;
        const base=world.producers.reduce((sum,p)=>sum+BigInt(p.ratePerSecond)*BigInt(owned),0n);
        const bonus=world.upgrades.reduce((sum,u)=>sum+(state.upgrades[u.id]&&u.effect==='production'?u.amount:0),100+prestige*20);
        const rate=percent=>Math.min(MAX_POINTS,Number(base*BigInt(percent)/100n));
        assert.equal(quote.accepted,accepted);
        assert.equal(quote.spent,accepted?upgrade.cost:0);
        assert.equal(quote.rateGain,accepted&&upgrade.effect==='production'?rate(bonus+upgrade.amount)-rate(bonus):0);
        assert.equal(quote.tapGain,accepted&&upgrade.effect==='tap'?upgrade.amount:0);
        cases++;
      }
  assert.equal(cases,1280);
});
test('unknown, owned, locked and unaffordable upgrades retain precedence and zero metrics',()=>{
  const world=WORLDS[0],upgrade=world.upgrades[0];
  const owned=newRun(world,now);owned.upgrades[upgrade.id]=true;
  for(const [state,id,reason] of [
    [owned,'missing','unknown-upgrade'],[owned,upgrade.id,'already-owned'],
    [newRun(world,now),upgrade.id,'locked'],
    [{...funded(world),runProduced:upgrade.unlockAt-1},upgrade.id,'locked'],
    [funded(world,upgrade.cost-1),upgrade.id,'insufficient-points']
  ])assert.deepEqual(compare(world,state,id).quote,{accepted:false,reason,spent:0,rateGain:0,tapGain:0});
  for(const id of [undefined,null,0,{},[],Symbol('unknown')])
    assert.equal(compare(world,newRun(world,now),id).quote.reason,'unknown-upgrade');
  for(const w of WORLDS)for(const u of w.upgrades) {
    const state=funded(w);state.upgrades[u.id]=true;
    assert.equal(compare(w,state,u.id).quote.reason,'already-owned');
  }
});
test('eligibility uses earned run production, exact cost and unchanged command result shapes',()=>{
  const world=fixture({cost:35,unlockAt:20});
  for(const [banked,runProduced,accepted,reason] of [[35,19,false,'locked'],[34,20,false,'insufficient-points'],[35,20,true,undefined]]) {
    const state={...funded(world,banked),runProduced};
    const {quote,actual}=compare(world,state,'boost');
    assert.equal(quote.accepted,accepted);assert.equal(quote.reason,reason);
    if(accepted) {
      assert.deepEqual(quote,{accepted:true,spent:35,rateGain:0,tapGain:0});
      assert.deepEqual(actual,{accepted:true,state:{...state,banked:0,upgrades:{boost:true}}});
    }
  }
});
test('production quotes use the difference of rounded incomes, not a separately rounded bonus',()=>{
  const world=fixture({amount:50});
  const cases=[[1,0,0],[1,3,1],[3,0,1],[3,1,2],[7,3,3]];
  for(const [owned,prestige,gain] of cases) {
    const state=funded(world);state.producers.pencil=owned;state.prestige=prestige;
    assert.equal(compare(world,state,'boost').quote.rateGain,gain);
  }
});
test('production gains respect full and partial native income saturation',()=>{
  for(const [rate,owned,prestige,gain] of [
    [MAX_POINTS,1,0,0],[MAX_POINTS,MAX_LEVEL,1000,0],
    [MAX_POINTS-1,1,0,1],[MAX_POINTS/2,1,0,MAX_POINTS/4],
    [MAX_POINTS/2,1,5,0]
  ]) {
    const world=fixture({rate}),state=funded(world);
    state.producers.pencil=owned;state.prestige=prestige;
    assert.equal(compare(world,state,'boost').quote.rateGain,gain);
  }
});
test('zero-producer production upgrades remain purchasable with zero output gain',()=>{
  for(const prestige of [0,1,1000]) {
    const world=fixture(),state=funded(world,1);state.prestige=prestige;
    assert.deepEqual(compare(world,state,'boost').quote,{accepted:true,spent:1,rateGain:0,tapGain:0});
  }
});
test('tap quotes preserve existing tap upgrades and prestige without changing production',()=>{
  for(const world of WORLDS)for(const upgrade of world.upgrades.filter(u=>u.effect==='tap'))for(const prestige of [0,1,1000]) {
    const state=funded(world);state.prestige=prestige;
    for(const p of world.producers)state.producers[p.id]=MAX_LEVEL;
    for(const u of world.upgrades)state.upgrades[u.id]=u.id!==upgrade.id;
    const before=tapYield(world,state),{quote,actual}=compare(world,state,upgrade.id);
    assert.deepEqual(quote,{accepted:true,spent:upgrade.cost,rateGain:0,tapGain:upgrade.amount});
    assert.equal(tapYield(world,actual.state),before+upgrade.amount);
  }
});
test('malformed or incompatible runs fail before upgrade lookup and remain untouched',()=>{
  const world=WORLDS[0],valid=funded(world);
  for(const state of [null,[],{},
    {...valid,worldId:'elsewhere'},{...valid,kind:'unsupported'},
    {...valid,lastMs:-1},{...valid,lastMs:Number.MAX_SAFE_INTEGER+1},
    {...valid,banked:NaN},{...valid,banked:MAX_POINTS+1},
    {...valid,allTime:0},{...valid,prestige:1001},{...valid,taps:0.5},
    {...valid,producers:{}},{...valid,producers:{...valid.producers,pencil:MAX_LEVEL+1}},
    {...valid,upgrades:[]},{...valid,upgrades:{...valid.upgrades,ink:1}},
    {...valid,upgrades:{...valid.upgrades,extra:false}}
  ]) {
    const before=structuredClone(state);
    if(state&&typeof state==='object')freeze(state);
    for(const id of [world.upgrades[0].id,'missing']) {
      assert.throws(()=>quoteUpgradePurchase(world,state,id));
      assert.throws(()=>buyUpgrade(world,state,id,now));
    }
    assert.deepEqual(state,before);
  }
});
test('quotes cannot award objectives, unlock prestige or alter objective save admission',()=>{
  const world=defineWorld({...WORLDS[0],id:'upgrade-quote-objectives',prestigeObjectives:[
    {id:'improve',label:'Install fresh ink',action:'buy-upgrade',targetId:'ink',count:1}
  ]});
  const state=freeze({...funded(world,35),runProduced:10000,allTime:10000}),before=structuredClone(state);
  const quote=quoteUpgradePurchase(world,state,'ink');
  assert.deepEqual(quote,{accepted:true,spent:35,rateGain:0,tapGain:4});
  assert.equal(availablePrestige(world,state),0);assert.deepEqual(state,before);
  const actual=buyUpgrade(world,state,'ink',now);
  assert.equal(actual.state.objectiveProgress.improve,1);assert.equal(availablePrestige(world,actual.state),2);
  assert.deepEqual(admitRun(world,JSON.parse(JSON.stringify(actual.state))),actual.state);
  assert.deepEqual(quoteUpgradePurchase(world,state,'ink'),quote);
  for(const bad of [
    {...state,objectiveProgress:{improve:1}},
    {...state,objectiveProgress:{}},{...state,objectiveContract:'changed'},
    {...state,runTaps:1}
  ])assert.throws(()=>quoteUpgradePurchase(world,bad,'ink'));
});
test('quotes do not settle time; delayed commands recompute eligibility and use the old income for elapsed ticks',()=>{
  const world=defineWorld({...fixture({cost:10,unlockAt:10,amount:100}),prestigeObjectives:[
    {id:'improve',label:'Install the boost',action:'buy-upgrade',targetId:'boost',count:1}
  ]}),state=newRun(world,now);
  state.producers.pencil=1;freeze(state);
  assert.equal(quoteUpgradePurchase(world,state,'boost').reason,'locked');
  const later=now+10000,settled=advance(world,state,later).state;
  assert.deepEqual(quoteUpgradePurchase(world,settled,'boost'),{accepted:true,spent:10,rateGain:1,tapGain:0});
  assert.equal(settled.objectiveProgress.improve,0);
  const actual=buyUpgrade(world,state,'boost',later);
  assert.equal(actual.accepted,true);assert.equal(actual.state.banked,0);
  assert.equal(actual.state.runProduced,10);assert.equal(actual.state.lastMs,later);
  assert.equal(actual.state.objectiveProgress.improve,1);
  assert.deepEqual(admitRun(world,actual.state),actual.state);
  assert.equal(advance(world,actual.state,later+1000).gained,2);
  assert.equal(state.lastMs,now);assert.equal(state.banked,0);assert.equal(state.upgrades.boost,false);
  assert.equal(state.objectiveProgress.improve,0);
});
test('explicit settlement composes across fractional, backward, capped and refused observations',()=>{
  for(const world of WORLDS)for(const elapsed of [-1000,0,1,999,1000,1999,world.offlineCapSeconds*1000+503])
    for(const id of [...world.upgrades.map(u=>u.id),'missing'])for(const owned of [false,true]) {
      const state=funded(world,0);state.producers[world.producers[0].id]=7;
      if(owned&&id!=='missing')state.upgrades[id]=true;
      const settled=advance(world,state,now+elapsed).state,quote=quoteUpgradePurchase(world,settled,id);
      const action=buyUpgrade(world,state,id,now+elapsed);
      assert.equal(quote.accepted,action.accepted);assert.equal(quote.reason,action.reason);
      assert.equal(quote.spent,settled.banked-action.state.banked);
      assert.equal(quote.rateGain,incomePerSecond(world,action.state)-incomePerSecond(world,settled));
      assert.equal(quote.tapGain,tapYield(world,action.state)-tapYield(world,settled));
      assert.equal(action.state.lastMs,settled.lastMs);
      if(!action.accepted)assert.deepEqual(action.state,settled);
    }
});
test('independent quotes neither reserve a shared balance nor authorize later commands',()=>{
  const world=defineWorld({...WORLDS[0],id:'upgrade-quote-alternatives',upgrades:[
    {id:'first',label:'First upgrade',effect:'tap',amount:4,cost:10,unlockAt:0},
    {id:'second',label:'Second upgrade',effect:'production',amount:50,cost:10,unlockAt:0}
  ]}),state=freeze(funded(world,10));
  const first=quoteUpgradePurchase(world,state,'first'),second=quoteUpgradePurchase(world,state,'second');
  assert.equal(first.accepted,true);assert.equal(second.accepted,true);
  first.spent=0;first.tapGain=MAX_POINTS;second.spent=0;
  const actual=buyUpgrade(world,state,'first',now);
  assert.equal(actual.state.banked,0);assert.equal(tapYield(world,actual.state),5);
  assert.equal(quoteUpgradePurchase(world,actual.state,'second').reason,'insufficient-points');
  assert.equal(buyUpgrade(world,actual.state,'second',now).reason,'insufficient-points');
  assert.deepEqual(quoteUpgradePurchase(world,state,'first'),{accepted:true,spent:10,rateGain:0,tapGain:4});
  assert.deepEqual(quoteUpgradePurchase(world,state,'second'),{accepted:true,spent:10,rateGain:0,tapGain:0});
});
