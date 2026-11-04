import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLDS} from '../src/worlds.mjs';
import {MAX_POINTS,defineWorld,newRun,advanceActive,forecastProduction,
  tap,buyProducer,buyUpgrade,prestige,incomePerSecond} from '@red-cup-engineering/incremental-idle-game/engine';

const world=defineWorld({...WORLDS[0],id:'forecast-fixture',offlineCapSeconds:60});
const origin=137;
const producing=(w=world,start=origin)=>({...newRun(w,start),producers:Object.fromEntries(w.producers.map((p,i)=>[p.id,i===0?5:0]))});
const freeze=value=>{for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);};

function assertNative(w,input,target,from,to) {
  const result=forecastProduction(w,input,target,from,to);
  assert.equal(result.rate,incomePerSecond(w,input));
  assert.equal(result.missing,Math.max(0,target-input.banked));
  const end=advanceActive(w,input,from,to).state;
  assert.equal(result.reachable,end.banked>=target);
  if(result.reachable) {
    assert.ok(Number.isSafeInteger(result.readyAtMs));
    assert.ok(result.readyAtMs>=from && result.readyAtMs<=to);
    assert.equal(result.waitMs,result.readyAtMs-from);
    assert.ok(advanceActive(w,input,from,result.readyAtMs).state.banked>=target);
    if(result.readyAtMs>from) assert.ok(advanceActive(w,input,from,result.readyAtMs-1).state.banked<target);
  } else assert.equal(result.readyAtMs,null);
  return result;
}

test('forecast retains native phase and identifies the first funded tick',()=>{
  const input=producing();
  assert.deepEqual(forecastProduction(world,input,30,637,60137),
    {missing:30,rate:5,waitMs:5500,reachable:true,readyAtMs:6137});
  assert.equal(assertNative(world,input,30,637,6136).reachable,false);
  assert.equal(assertNative(world,input,30,637,6137).reachable,true);
});

test('all 1000 phases agree with bounded native accrual and one-ms minimality',()=>{
  const input=producing();
  for(let phase=0;phase<1000;phase++)for(const [target,duration] of [[0,0],[1,0],[1,1],[5,999],[6,1000],[30,5999],[300,60000],[301,60000]])
    assertNative(world,input,target,origin+phase,origin+phase+duration);
});

test('already funded readiness is now, even without income or an active duration',()=>{
  const input={...newRun(world,origin),banked:30,runProduced:30,allTime:30};
  for(const target of [0,1,30])assert.deepEqual(forecastProduction(world,input,target,origin+999,origin+999),
    {missing:0,rate:0,waitMs:0,reachable:true,readyAtMs:origin+999});
  assert.deepEqual(forecastProduction(world,input,31,origin+999,origin+60999),
    {missing:1,rate:0,waitMs:null,reachable:false,readyAtMs:null});
});

test('long waits are estimates only, not out-of-cap readiness or production',()=>{
  const input=producing(),before=structuredClone(input);
  assert.deepEqual(forecastProduction(world,input,1000,637,60637),
    {missing:1000,rate:5,waitMs:199500,reachable:false,readyAtMs:null});
  assert.deepEqual(input,before);
  assert.equal(advanceActive(world,input,637,60637).state.banked,300);
});

test('bank-target semantics account for spending, not lifetime or run production',()=>{
  const input={...producing(),banked:7,runProduced:1000,allTime:10000};
  assert.deepEqual(assertNative(world,input,30,637,60637),
    {missing:23,rate:5,waitMs:4500,reachable:true,readyAtMs:5137});
});

test('saturation and impossible targets never promise an unavailable balance',()=>{
  const input={...producing(),banked:MAX_POINTS-1,runProduced:MAX_POINTS-1,allTime:MAX_POINTS-1};
  assert.equal(assertNative(world,input,MAX_POINTS,origin+999,origin+1000).waitMs,1);
  for(const target of [MAX_POINTS+1,MAX_POINTS+31,Number.MAX_SAFE_INTEGER])
    assert.deepEqual(assertNative(world,input,target,origin+999,origin+60999),
      {missing:target-input.banked,rate:5,waitMs:null,reachable:false,readyAtMs:null});
});

test('exact ceiling remains minimal at large integer rates and targets',()=>{
  for(const rate of [1,3,7,9999991,333333333333333,MAX_POINTS]) {
    const w=defineWorld({...world,producers:[{...world.producers[0],ratePerSecond:rate}]});
    const input={...newRun(w,0),producers:{pencil:1}};
    for(const target of [1,rate,Math.min(MAX_POINTS,rate+1),MAX_POINTS-1,MAX_POINTS])
      assertNative(w,input,target,999,60999);
  }
});

test('unsafe duration estimates return null while safe bounded endpoints stay exact',()=>{
  const slow={...newRun(world,0),producers:{...newRun(world,0).producers,pencil:1}};
  assert.deepEqual(forecastProduction(world,slow,MAX_POINTS,999,60999),
    {missing:MAX_POINTS,rate:1,waitMs:null,reachable:false,readyAtMs:null});
  const max=Number.MAX_SAFE_INTEGER,start=max-60999;
  const input={...producing(world,start),banked:MAX_POINTS-1,runProduced:MAX_POINTS-1,allTime:MAX_POINTS-1};
  assert.equal(assertNative(world,input,MAX_POINTS,start+999,max).readyAtMs,start+1000);
  const last=producing(world,max-999);
  const quote=assertNative(world,last,5,max,max);
  assert.equal(quote.waitMs,1);assert.equal(quote.readyAtMs,null);
});

test('forecast is isolated and does not complete action objectives',()=>{
  const w=defineWorld({...world,prestigeObjectives:[{id:'practice',label:'Tap once',action:'tap',count:1}]});
  const input=freeze(producing(w)),before=structuredClone(input);
  const quote=forecastProduction(w,input,30,637,60637);
  quote.missing=0;quote.rate=100;
  assert.deepEqual(input,before);assert.equal(input.objectiveProgress.practice,0);
});

test('recompute after native purchases, upgrades, taps and earned resets',()=>{
  let input={...producing(),banked:10000,runProduced:10000,allTime:10000};
  const at=637;
  for(const action of [s=>buyProducer(world,s,'pencil',1,at),s=>buyUpgrade(world,s,'binding',at),s=>tap(world,s,at),s=>prestige(world,s,at)]) {
    const result=action(input);assert.equal(result.accepted,true);input=result.state;
    assertNative(world,input,Math.min(MAX_POINTS,input.banked+1),at,at+60000);
  }
});

test('shipped worlds and all admitted caps preserve forecast/native correspondence',()=>{
  for(const base of WORLDS)for(const cap of [1,60,21600,86400]) {
    const w=defineWorld({...base,offlineCapSeconds:cap}),input=producing(w);
    for(const phase of [0,1,137,500,999])for(const target of [0,1,5,30,cap*5,cap*5+1])
      assertNative(w,input,target,origin+phase,origin+phase+cap*1000);
  }
});

test('forecast shares exact active-interval refusal and rejects malformed targets',()=>{
  const input=freeze(producing()),before=structuredClone(input);
  for(const target of [-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'30',null,undefined])
    assert.throws(()=>forecastProduction(world,input,target,origin,origin+60000),/target/);
  for(const [from,to] of [[origin-1,origin],[origin+1000,origin+1000],[origin+1,origin],[origin,origin+60001],[-1,origin],[origin,Infinity]]) {
    let expected;try{advanceActive(world,input,from,to);}catch(error){expected=error;}
    assert.ok(expected);
    assert.throws(()=>forecastProduction(world,input,30,from,to),error=>error.constructor===expected.constructor && error.message===expected.message);
  }
  assert.throws(()=>forecastProduction(world,{...input,banked:-1},30,origin,origin),/state.banked/);
  assert.deepEqual(input,before);
});
