import test from'node:test';import assert from'node:assert/strict';
import{spendPoints}from'../src/transactions.mjs';import{WORLDS}from'../src/worlds.mjs';
import{newRun,admitRun,advance,MAX_POINTS}from'../src/engine.mjs';
const world=WORLDS[0],funded=n=>({...newRun(world,1000),banked:n,runProduced:n,allTime:n});
test('exact affordable debit changes only balance, preserving input and detachable inventory',()=>{
 const s=funded(25),before=structuredClone(s),r=spendPoints(world,s,5);assert.deepEqual(s,before);assert.deepEqual(r,{accepted:true,spent:5,state:{...s,banked:20}});assert.notEqual(r.state.producers,s.producers);assert.notEqual(r.state.upgrades,s.upgrades);assert.deepEqual(admitRun(world,JSON.parse(JSON.stringify(r.state))),r.state);
});
test('zero no-op and insufficient rejection do not advance time, income or any state field',()=>{
 const s={...funded(5),producers:{...funded(5).producers,pencil:1}},before=structuredClone(s);
 assert.deepEqual(spendPoints(world,s,0),{accepted:true,spent:0,state:s});assert.deepEqual(spendPoints(world,s,6),{accepted:false,reason:'insufficient-points',spent:0,state:s});assert.deepEqual(s,before);
});
test('invalid point units and malformed runs fail before any mutation',()=>{
 const s=funded(5),before=structuredClone(s);for(const amount of[-1,.5,NaN,Infinity,-Infinity,MAX_POINTS+1,'5',null,undefined,1n,{}])assert.throws(()=>spendPoints(world,s,amount),RangeError);
 assert.deepEqual(s,before);assert.throws(()=>spendPoints(world,{...s,banked:.5},0));assert.throws(()=>spendPoints(world,{...s,worldId:'foreign'},0));assert.equal(spendPoints(world,funded(MAX_POINTS),MAX_POINTS).state.banked,0);
});
test('repeated debits cannot overdraw and replayable saved balance remains exact',()=>{
 const initial=funded(7),a=spendPoints(world,initial,4),saved=JSON.parse(JSON.stringify(a.state));const b=spendPoints(world,saved,4);assert.equal(b.accepted,false);assert.deepEqual(b.state,a.state);const c=spendPoints(world,b.state,3);assert.equal(c.state.banked,0);assert.equal(spendPoints(world,c.state,1).spent,0);assert.deepEqual(spendPoints(world,JSON.parse(JSON.stringify(initial)),4),a);
});
test('elapsed production is explicit and keeps original fractional/capped clock semantics',()=>{
 const s={...funded(0),producers:{...funded(0).producers,pencil:1}};assert.equal(spendPoints(world,s,1).accepted,false);
 const partial=advance(world,s,2500).state;assert.equal(partial.lastMs,2000);const paid=spendPoints(world,partial,1);assert.equal(paid.state.lastMs,2000);assert.equal(advance(world,paid.state,3000).state.banked,1);
 const capped=advance(world,s,999999999).state;const rejected=spendPoints(world,capped,capped.banked+1);assert.deepEqual(rejected.state,capped);assert.equal(advance(world,rejected.state,999999999).gained,0);
});
