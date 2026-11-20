import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLDS } from './fixtures/worlds.mjs';
import { MAX_POINTS, STATE_KIND, WORLD_KIND, defineWorld, newRun, admitRun,
  advance, tap, buyProducer, buyUpgrade, prestige, project, producerPrice } from '../src/engine.mjs';
const [garden, observatory] = WORLDS;
const T = 1_700_000_000_000;
const seconds = (n) => T+n*1000;
function withMarks(points,world=garden) {
  return {...newRun(world,T),banked:points,runProduced:points,allTime:points};
}

test('two different declarative worlds produce independent playable starts', () => {
  assert.notEqual(garden.id,observatory.id);
  for (const world of WORLDS) {
    const start=newRun(world,T);
    assert.equal(start.banked,0);
    assert.equal(project(world,start,T).rate,0);
    const after=tap(world,start,T);
    assert.equal(after.state.banked,1);
    assert.equal(after.state.runProduced,1);
    assert.deepEqual(admitRun(world,JSON.parse(JSON.stringify(after.state))),after.state);
    assert.throws(()=>admitRun(world===garden?observatory:garden,after.state),/another world/);
  }
});
test('players can tap, buy multiple producers and earn offline income without a running timer', () => {
  let s=newRun(garden,T);
  for (let i=0;i<10;i++) s=tap(garden,s,T).state;
  assert.equal(s.banked,10);
  let buy=buyProducer(garden,s,'pencil',1,T);
  assert.equal(buy.accepted,true);
  assert.equal(buy.state.banked,0);
  const grown=advance(garden,buy.state,seconds(90));
  assert.equal(grown.gained,90);
  assert.equal(grown.state.banked,90);
  const more=buyProducer(garden,grown.state,'pencil',10,seconds(90));
  assert.equal(more.accepted,true);
  assert.ok(more.count>1);
  assert.equal(project(garden,more.state,seconds(90)).rate,more.state.producers.pencil);
});
test('a later unlocked producer and a purchased upgrade change subsequent production', () => {
  let s=withMarks(1000);
  const press=buyProducer(garden,s,'press',1,T);
  assert.equal(press.accepted,true);
  assert.equal(press.state.producers.press,1);
  const upgraded=buyUpgrade(garden,press.state,'binding',T);
  assert.equal(upgraded.accepted,true);
  assert.equal(project(garden,upgraded.state,T).rate,10); // floor(7*150%)
  assert.equal(advance(garden,upgraded.state,seconds(10)).gained,100);
  assert.equal(buyUpgrade(garden,upgraded.state,'binding',T).reason,'already-owned');
});
test('6-hour cap is consumed once; fractional seconds are preserved below cap', () => {
  const s={...newRun(garden,T),producers:{...newRun(garden,T).producers,pencil:1}};
  const partial=advance(garden,s,T+1999);
  assert.equal(partial.gained,1);
  assert.equal(partial.state.lastMs,T+1000);
  assert.equal(advance(garden,partial.state,T+2100).gained,1);
  const day=advance(garden,s,T+24*60*60*1000);
  assert.equal(day.seconds,21600);
  assert.equal(day.gained,21600);
  assert.equal(day.discardedSeconds,64800);
  assert.equal(day.state.lastMs,T+24*60*60*1000);
  assert.equal(advance(garden,day.state,day.state.lastMs).gained,0);
});
test('backward clocks and invalid inputs never mint points', () => {
  const s=withMarks(100);
  assert.equal(advance(garden,s,T-1000).state.lastMs,T);
  assert.throws(()=>advance(garden,s,Infinity),/toMs/);
  assert.throws(()=>admitRun(garden,{...s,banked:-1}),RangeError);
  assert.throws(()=>admitRun(garden,{...s,producers:{pencil:0}}),/inventory/);
  assert.throws(()=>admitRun(garden,{...s,runProduced:1000}),/inconsistent/);
  assert.throws(()=>defineWorld({...garden,producers:[{...garden.producers[0],ratePerSecond:-10}]}),RangeError);
});
test('refused purchases preserve progress and never grant a producer or upgrade', () => {
  const fresh=newRun(garden,T);
  assert.equal(buyProducer(garden,fresh,'press',1,T).reason,'locked');
  assert.equal(buyProducer(garden,fresh,'pencil',1,T).reason,'insufficient-points');
  assert.equal(buyProducer(garden,fresh,'unknown',1,T).reason,'unknown-producer');
  assert.equal(buyUpgrade(garden,fresh,'binding',T).reason,'locked');
  assert.equal(buyUpgrade(garden,fresh,'unknown',T).reason,'unknown-upgrade');
  assert.equal(buyProducer(garden,fresh,'pencil',0,T).reason,'zero-quantity');
  assert.deepEqual(fresh,newRun(garden,T));
});
test('prestige resets the run but permanently accelerates taps and production', () => {
  const s={...withMarks(5000),producers:{...newRun(garden,T).producers,pencil:5}};
  const result=prestige(garden,s,T);
  assert.equal(result.accepted,true);
  assert.equal(result.awarded,1);
  assert.equal(result.state.banked,0);
  assert.equal(result.state.runProduced,0);
  assert.equal(result.state.allTime,5000);
  assert.equal(result.state.prestige,1);
  assert.equal(result.state.producers.pencil,0);
  assert.equal(project(garden,result.state,T).tapYield,2);
  assert.equal(prestige(garden,result.state,T).reason,'threshold-not-met');
  const newProducer=buyProducer(garden,{...result.state,banked:100,runProduced:100,allTime:5100},'pencil',1,T);
  assert.equal(project(garden,newProducer.state,T).rate,1); // floor(1*120%)
  assert.equal(tap(garden,result.state,T).gained,2);
});
test('price ladder rises deterministically, bulk buy is bounded, balances never go negative', () => {
  const p=garden.producers[0];
  assert.equal(producerPrice(p,0),10);
  assert.equal(producerPrice(p,1),12);
  assert.ok(producerPrice(p,2)>producerPrice(p,1));
  const s=withMarks(MAX_POINTS);
  const result=buyProducer(garden,s,'pencil','max',T);
  assert.equal(result.accepted,true);
  assert.ok(result.count>0 && result.count<=100);
  assert.ok(result.state.banked>=0);
  assert.ok(result.state.producers.pencil<=100);
});
test('every serialized game state is local nonfinancial data', () => {
  const state=prestige(garden,withMarks(3000),T).state;
  const data=JSON.stringify(state);
  assert.match(data,/561.incremental-idle-state/);
  for (const forbidden of ['bitcoin','sats','wallet','payment','adReward','userId','account']) {
    assert.equal(forbidden in state,false);
  }
  assert.equal(typeof JSON.parse(data).prestige,'number');
});
