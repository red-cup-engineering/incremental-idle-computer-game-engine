import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLDS} from '../src/worlds.mjs';
import {MAX_POINTS,defineWorld,newRun,admitRun,advance,advanceActive,tap,buyProducer,
  buyUpgrade,prestige} from '@red-cup-engineering/incremental-idle-game/engine';

const world=defineWorld({...WORLDS[0],id:'active-interval-fixture',offlineCapSeconds:60});
const origin=137;
const run=(w=world,start=origin)=>({...newRun(w,start),producers:Object.fromEntries(w.producers.map((p,i)=>[p.id,i===0?5:0]))});
const freeze=value=>{for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);};

test('full active cap preserves previously observed phase instead of truncating it',()=>{
  const input=run(),before=structuredClone(input);
  const result=advanceActive(world,input,origin+500,origin+60500);
  assert.equal(result.gained,300);assert.equal(result.seconds,60);assert.equal(result.discardedSeconds,0);
  assert.equal(result.state.lastMs,origin+60000);
  assert.equal(result.state.banked,300);assert.equal(result.state.runProduced,300);assert.equal(result.state.allTime,300);
  assert.deepEqual(input,before);
  assert.equal(advance(world,input,origin+60500).state.lastMs,origin+60500);
  assert.equal(advanceActive(world,result.state,origin+60500,origin+60999).gained,0);
  assert.equal(advanceActive(world,result.state,origin+60500,origin+61000).gained,5);
});

test('all 1000 phases and cap-edge intervals obey the integer time model',()=>{
  const input=run();
  for(let phase=0;phase<1000;phase++)for(const duration of [0,1,499,500,999,1000,59999,60000]){
    const result=advanceActive(world,input,origin+phase,origin+phase+duration);
    const seconds=Math.floor((phase+duration)/1000);
    assert.equal(result.seconds,seconds);assert.equal(result.gained,seconds*5);
    assert.equal(result.state.lastMs,origin+seconds*1000);assert.equal(result.discardedSeconds,0);
    assert.ok(origin+phase+duration-result.state.lastMs<1000);
  }
});

test('sparse and dense observations agree across repeated bounded windows',()=>{
  for(const phase of [0,1,137,499,500,999]){
    let sparse=run(),dense=run(),observed=origin+phase;
    for(let window=0;window<4;window++){
      const end=observed+60000;
      sparse=advanceActive(world,sparse,observed,end).state;
      while(observed<end){const next=Math.min(end,observed+137);dense=advanceActive(world,dense,observed,next).state;observed=next;}
      assert.deepEqual(sparse,dense);
      assert.equal(observed-sparse.lastMs,phase);
    }
  }
});

test('active settlement matches the existing bounded native-call composition',()=>{
  for(const phase of [0,1,137,499,500,999])for(const duration of [0,1,500,999,1000,59999,60000]){
    const input=run(),end=origin+phase+duration;
    let expected=advance(world,input,Math.min(end,origin+60000));
    if(end>origin+60000){const rest=advance(world,expected.state,end);expected={...rest,gained:expected.gained+rest.gained,seconds:expected.seconds+rest.seconds,discardedSeconds:expected.discardedSeconds+rest.discardedSeconds};}
    assert.deepEqual(advanceActive(world,input,origin+phase,end),expected);
  }
});

test('zero intervals retain phase, detach inventories and do not award actions',()=>{
  const objective=defineWorld({...world,prestigeObjectives:[{id:'practice',label:'Tap once',action:'tap',count:1}]});
  const input=freeze(run(objective));
  const result=advanceActive(objective,input,origin+999,origin+999);
  assert.deepEqual(result,{state:input,gained:0,seconds:0,discardedSeconds:0});
  assert.notEqual(result.state,input);assert.notEqual(result.state.producers,input.producers);
  assert.notEqual(result.state.upgrades,input.upgrades);assert.notEqual(result.state.objectiveProgress,input.objectiveProgress);
  result.state.producers.pencil=0;result.state.objectiveProgress.practice=1;
  assert.equal(input.producers.pencil,5);assert.equal(input.objectiveProgress.practice,0);
});

test('active production retains objective and bounded point accounting',()=>{
  const objective=defineWorld({...world,prestigeObjectives:[{id:'practice',label:'Tap once',action:'tap',count:1}]});
  const input=freeze({...run(objective),banked:MAX_POINTS-1,runProduced:MAX_POINTS-1,allTime:MAX_POINTS-1});
  const result=advanceActive(objective,input,origin+500,origin+60500);
  assert.equal(result.gained,300);assert.equal(result.state.banked,MAX_POINTS);
  assert.equal(result.state.runProduced,MAX_POINTS);assert.equal(result.state.allTime,MAX_POINTS);
  assert.equal(result.state.runTaps,0);assert.deepEqual(result.state.objectiveProgress,{practice:0});
  assert.deepEqual(admitRun(objective,JSON.parse(JSON.stringify(result.state))),result.state);
});

test('active intervals support zero production and the maximal admitted rate',()=>{
  assert.equal(advanceActive(world,newRun(world,0),999,60999).gained,0);
  const fast=defineWorld({...world,producers:[{...world.producers[0],ratePerSecond:MAX_POINTS}]});
  const result=advanceActive(fast,run(fast,0),999,60999);
  assert.equal(result.gained,MAX_POINTS);assert.equal(result.state.banked,MAX_POINTS);
  assert.equal(result.seconds,60);assert.equal(result.state.lastMs,60000);
});

test('caller-supplied logical time composes with ordinary purchases, taps and prestige',()=>{
  let input={...run(),banked:10000,runProduced:10000,allTime:10000};
  input=advanceActive(world,input,origin+500,origin+60500).state;
  const at=origin+60500;
  const bought=buyProducer(world,input,'pencil',1,at);assert.equal(bought.accepted,true);
  const upgraded=buyUpgrade(world,bought.state,'binding',at);assert.equal(upgraded.accepted,true);
  const tapped=tap(world,upgraded.state,at);assert.equal(tapped.state.lastMs,origin+60000);
  const next=advanceActive(world,tapped.state,at,origin+61000);
  assert.equal(next.gained,9);assert.equal(next.seconds,1);
  const reset=prestige(world,next.state,origin+61333);assert.equal(reset.accepted,true);
  assert.equal(reset.state.lastMs,origin+61000);
  assert.equal(advanceActive(world,reset.state,origin+61333,origin+62000).seconds,1);
});

test('active settlement rejects invalid times, stale observations and oversized intervals',()=>{
  const input=freeze(run()),before=structuredClone(input);
  for(const invalid of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'137',null,undefined]){
    assert.throws(()=>advanceActive(world,input,invalid,origin),/fromMs/);
    assert.throws(()=>advanceActive(world,input,origin,invalid),/toMs/);
  }
  for(const from of [origin-1,origin+1000,origin+60000])assert.throws(()=>advanceActive(world,input,from,from),/less than one uncredited second/);
  assert.throws(()=>advanceActive(world,input,origin+500,origin+499),/monotone/);
  assert.throws(()=>advanceActive(world,input,origin+500,origin+60501),/time cap/);
  assert.deepEqual(input,before);
  const settled=advanceActive(world,input,origin,origin+60000).state;
  assert.throws(()=>advanceActive(world,settled,origin,origin+60000),/uncredited second/);
  assert.deepEqual(advanceActive(world,settled,origin+60000,origin+60000).state,settled);
});

test('safe integer time boundaries do not overflow while validating retained phase',()=>{
  const max=Number.MAX_SAFE_INTEGER,start=max-60999,input=run(world,start);
  const result=advanceActive(world,input,start+999,max);
  assert.equal(result.seconds,60);assert.equal(result.state.lastMs,max-999);
  assert.equal(advanceActive(world,result.state,max,max).gained,0);
  assert.throws(()=>advanceActive(world,input,start+999,max+1),/toMs/);
});

test('all defined world caps admit exactly their boundary and refuse one extra millisecond',()=>{
  for(const seconds of [1,60,21600,86400]){
    const w=defineWorld({...world,offlineCapSeconds:seconds}),input=run(w,0);
    assert.equal(advanceActive(w,input,999,seconds*1000+999).seconds,seconds);
    assert.throws(()=>advanceActive(w,input,999,seconds*1000+1000),/time cap/);
  }
});

test('existing offline advancement still truncates and tolerates backward observations',()=>{
  const input=run();
  const capped=advance(world,input,origin+120500);
  assert.equal(capped.seconds,60);assert.equal(capped.gained,300);
  assert.equal(capped.state.lastMs,origin+120500);assert.equal(capped.discardedSeconds,60);
  assert.deepEqual(advance(world,input,origin-1),{state:input,gained:0,seconds:0,discardedSeconds:0});
  assert.equal(advance(world,capped.state,origin+120500).gained,0);
});
