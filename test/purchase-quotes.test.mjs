import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '@red-cup-engineering/incremental-idle-computer-game-engine/engine';
import { WORLDS } from './fixtures/worlds.mjs';

const {MAX_POINTS,MAX_LEVEL,newRun,defineWorld,buyProducer,incomePerSecond,advance,admitRun,quoteProducerPurchase}=engine;
const now=1_793_797_200_000;
const funded=(world,banked=MAX_POINTS)=>({...newRun(world,now),banked,runProduced:MAX_POINTS,allTime:MAX_POINTS});
const freeze=state=>{for(const value of Object.values(state))if(value&&typeof value==='object')Object.freeze(value);return Object.freeze(state);};
function compare(world,state,id,requested) {
  const before=JSON.stringify(state),quote=quoteProducerPurchase(world,freeze(state),id,requested);
  const actual=buyProducer(world,state,id,requested,state.lastMs);
  assert.equal(quote.accepted,actual.accepted);assert.equal(quote.reason,actual.reason);
  assert.equal(quote.count,actual.count??0);assert.equal(quote.spent,actual.spent??0);
  assert.equal(quote.rateGain,incomePerSecond(world,actual.state)-incomePerSecond(world,state));
  assert.equal(Object.hasOwn(quote,'state'),false);assert.equal(JSON.stringify(state),before);
  assert.deepEqual(admitRun(world,actual.state),actual.state);
  return {quote,actual};
}
// Independent integer decomposition, not the engine's BigInt recurrence.
function nextCost(price,growth) {
  return Math.min(MAX_POINTS+1,Math.floor(price/10000)*growth+Math.ceil((price%10000)*growth/10000));
}
function oracle(producer,owned,balance,limit) {
  let price=producer.baseCost;
  for(let n=0;n<owned&&price<=MAX_POINTS;n++)price=nextCost(price,producer.growthBasisPoints);
  let count=0,spent=0;
  while(count<limit&&owned+count<MAX_LEVEL&&price<=balance-spent) {
    spent+=price;count++;price=nextCost(price,producer.growthBasisPoints);
  }
  return {count,spent};
}

test('quote is available from the existing engine entrance',()=>assert.equal(typeof quoteProducerPurchase,'function'));
test('all shipped ladders and batch sizes match an independent exact oracle',()=>{
  let cases=0;
  for(const world of WORLDS)for(const producer of world.producers)
    for(const owned of [0,1,7,49,99,112,140,157,189,500,899,950,999,1000])
      for(const balance of [0,1,23,10000,MAX_POINTS-1,MAX_POINTS])for(const request of [0,1,10,100,'max']) {
        const state=funded(world,balance);state.producers[producer.id]=owned;
        const {quote}=compare(world,state,producer.id,request);
        const expected=oracle(producer,owned,balance,request==='max'?100:request);
        assert.equal(quote.count,expected.count,`${world.id}/${producer.id}/${owned}/${balance}/${request}`);
        assert.equal(quote.spent,expected.spent);cases++;
      }
  assert.equal(cases,3360);
});
test('partial batches, max limit and final level retain their distinct boundaries',()=>{
  const world=defineWorld({...WORLDS[0],id:'quote-flat',producers:[{...WORLDS[0].producers[0],baseCost:3,growthBasisPoints:10000}]});
  const id=world.producers[0].id;
  for(const [balance,owned,request,count,spent] of [[8,0,10,2,6],[MAX_POINTS,0,'max',100,300],[1000,995,'max',5,15],[1000,1000,1,0,0]]) {
    const state=funded(world,balance);state.producers[id]=owned;
    const {quote}=compare(world,state,id,request);assert.equal(quote.count,count);assert.equal(quote.spent,spent);
  }
});
test('exact cap sentinel preserves one-point affordability and cannot become a price',()=>{
  for(const [baseCost,growth] of [[999900009999000,10001],[333333333333333,30000],[MAX_POINTS,10000],[MAX_POINTS,30000],[1,10001]]) {
    const world=defineWorld({...WORLDS[0],id:'quote-cap',producers:[{...WORLDS[0].producers[0],baseCost,growthBasisPoints:growth}]});
    const p=world.producers[0];
    for(const owned of [0,1,2,999])for(const balance of [MAX_POINTS-1,MAX_POINTS]) {
      const state=funded(world,balance);state.producers[p.id]=owned;
      const {quote}=compare(world,state,p.id,'max'),expected=oracle(p,owned,balance,100);
      assert.equal(quote.count,expected.count);assert.equal(quote.spent,expected.spent);
    }
  }
});
test('unknown, locked, zero, capped and insufficient orders expose zero-metric refusals',()=>{
  const world=WORLDS[0],first=world.producers[0],locked=world.producers.find(p=>p.unlockAt>0);
  for(const [state,id,quantity,reason] of [
    [newRun(world,now),'unknown',1,'unknown-producer'],[newRun(world,now),locked.id,1,'locked'],
    [funded(world),first.id,0,'zero-quantity'],[newRun(world,now),first.id,1,'insufficient-points'],
    [{...funded(world),producers:{...newRun(world,now).producers,[first.id]:MAX_LEVEL}},first.id,1,'level-cap']
  ])assert.deepEqual(compare(world,state,id,quantity).quote,{accepted:false,reason,count:0,spent:0,rateGain:0});
});
test('invalid requests and malformed runs refuse without mutation and retain validation order',()=>{
  const world=WORLDS[0],id=world.producers[0].id;
  for(const requested of [-1,0.5,101,NaN,Infinity,'10',null,undefined,{},[]]) {
    const state=freeze(funded(world)),before=JSON.stringify(state);
    assert.throws(()=>quoteProducerPurchase(world,state,id,requested));
    assert.throws(()=>buyProducer(world,state,id,requested,now));assert.equal(JSON.stringify(state),before);
  }
  for(const state of [null,{},{...funded(world),banked:MAX_POINTS+1},{...funded(world),worldId:'elsewhere'},{...funded(world),producers:{}}])
    assert.throws(()=>quoteProducerPurchase(world,state,id,1));
  assert.equal(quoteProducerPurchase(world,newRun(world,now),'unknown',NaN).reason,'unknown-producer');
  assert.equal(quoteProducerPurchase(world,newRun(world,now),world.producers[1].id,NaN).reason,'locked');
});
test('quotes neither settle time nor grant objectives; commands do each at the actual action',()=>{
  const world=defineWorld({...WORLDS[0],id:'quote-objective',prestigeObjectives:[{id:'equip',label:'Own three pencils',action:'buy-producer',targetId:'pencil',count:3}]});
  let state=funded(world,23);
  const quote=quoteProducerPurchase(world,freeze(state),'pencil',10);
  assert.equal(quote.count,2);assert.equal(state.objectiveProgress.equip,0);assert.equal(Object.hasOwn(quote,'state'),false);
  state=buyProducer(world,state,'pencil',10,now).state;assert.equal(state.objectiveProgress.equip,2);
  const before=JSON.stringify(state),waiting=quoteProducerPurchase(world,state,'pencil',10);
  assert.equal(waiting.accepted,false);assert.equal(JSON.stringify(state),before);
  const later=now+10000,settled=advance(world,state,later).state;
  const ready=quoteProducerPurchase(world,settled,'pencil',10),actual=buyProducer(world,state,'pencil',10,later);
  assert.equal(ready.count,actual.count);assert.equal(ready.spent,actual.spent);
  assert.equal(actual.state.objectiveProgress.equip,3);assert.equal(actual.state.lastMs,later);
  assert.deepEqual(admitRun(world,JSON.parse(JSON.stringify(actual.state))),actual.state);
});
test('rate gain uses the existing upgrade/prestige rounding and income saturation',()=>{
  for(const world of WORLDS)for(const prestige of [0,1,13,1000])for(const enabled of [false,true]) {
    const state=funded(world);state.prestige=prestige;
    for(const u of world.upgrades)state.upgrades[u.id]=enabled;
    for(const p of world.producers)compare(world,structuredClone(state),p.id,10);
  }
  const world=defineWorld({...WORLDS[0],id:'quote-saturated',producers:[{...WORLDS[0].producers[0],baseCost:1,growthBasisPoints:10000,ratePerSecond:MAX_POINTS}]});
  const state=funded(world);state.producers.pencil=1;
  assert.equal(compare(world,state,'pencil','max').quote.rateGain,0);
});
test('quotes are independent alternatives and cannot authorize or reserve a later purchase',()=>{
  for(const world of WORLDS) {
    const id=world.producers[0].id,state=funded(world,23);
    const first=quoteProducerPurchase(world,state,id,10),second=quoteProducerPurchase(world,state,id,'max');
    assert.deepEqual(first,second);first.count=1000;first.spent=0;first.rateGain=MAX_POINTS;
    const action=buyProducer(world,state,id,10,now);assert.equal(action.count,second.count);assert.equal(action.spent,second.spent);
    assert.equal(quoteProducerPurchase(world,action.state,id,10).accepted,false);
    assert.deepEqual(quoteProducerPurchase(world,state,id,10),second);
  }
});
test('explicit settlement composes at fractional, backward and capped observations',()=>{
  for(const world of WORLDS)for(const elapsed of [-1000,0,1,999,1000,1999,world.offlineCapSeconds*1000+503]) {
    const state=funded(world,0);state.producers[world.producers[0].id]=7;
    const settled=advance(world,state,now+elapsed).state;
    const quote=quoteProducerPurchase(world,settled,world.producers[0].id,10);
    const action=buyProducer(world,state,world.producers[0].id,10,now+elapsed);
    assert.equal(quote.count,action.count??0);assert.equal(quote.spent,action.spent??0);
  }
});
