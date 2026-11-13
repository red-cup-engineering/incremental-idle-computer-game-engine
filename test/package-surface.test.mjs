import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as engine from '@red-cup-engineering/incremental-idle-computer-game-engine/engine';
import * as transactions from '@red-cup-engineering/incremental-idle-computer-game-engine/transactions';
import { WORLDS } from '@red-cup-engineering/incremental-idle-computer-game-engine/worlds';
import * as legacyEngine from '@red-cup-engineering/incremental-idle-computer-game-engine/src/engine.mjs';
import * as legacyTransactions from '@red-cup-engineering/incremental-idle-computer-game-engine/src/transactions.mjs';

test('package entrances are aliases to the original modules, not duplicate state or implementations', () => {
  assert.equal(engine, legacyEngine);
  assert.equal(transactions, legacyTransactions);
  assert.equal(engine.defineWorld, legacyEngine.defineWorld);
  assert.equal(typeof transactions.spendPoints, 'function');
  assert.ok(WORLDS.length > 0);
  for (const world of WORLDS) assert.equal(engine.tap(world, engine.newRun(world, 1000), 1000).accepted, true);
});

test('package contract carries authored runtime, design, tools and native receiving files', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(manifest.exports['./engine'], './src/engine.mjs');
  assert.equal(manifest.exports['./transactions'], './src/transactions.mjs');
  assert.equal(manifest.exports['./worlds'], './src/worlds.mjs');
  for (const path of ['src', 'scripts', 'design', 'test']) assert.ok(manifest.files.includes(path));
  for (const path of ['src/engine.mjs', 'src/transactions.mjs', 'src/worlds.mjs', 'src/generated/world-definitions.mjs', 'scripts/generate-worlds.mjs', 'scripts/build.mjs', 'design/world-catalog.json', 'design/world-catalog.schema.json', 'test/engine.test.mjs', 'test/objectives.test.mjs', 'test/transactions.test.mjs']) {
    assert.ok((await readFile(new URL(`../${path}`, import.meta.url))).length > 0);
  }
});

test('generation tooling declares its exact optional peer without expanding the core runtime contract', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  const supplier = '@red-cup-engineering/jsnode-package-engineering-services-section';
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url)));
  assert.equal(manifest.devDependencies[supplier], lock.packages[`node_modules/${supplier}`].version);
  assert.equal(manifest.peerDependencies[supplier], manifest.devDependencies[supplier]);
  assert.deepEqual(manifest.peerDependenciesMeta[supplier], {optional: true});
  assert.equal(Object.hasOwn(manifest.dependencies, supplier), false);
  assert.equal(Object.hasOwn(manifest.optionalDependencies ?? {}, supplier), false);
  assert.equal(manifest.exports['./scripts/*'], './scripts/*');
  assert.equal(manifest.scripts.generate, 'node scripts/generate-worlds.mjs');
  assert.equal(manifest.scripts['check:generated'], 'node scripts/generate-worlds.mjs --check');
});

test('browser save supplier is optional and runs standalone with write/readback failure semantics', async t => {
  const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
  const supplier='@red-cup-engineering/computer-game-systems-engineering-services-section';
  const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url)));
  assert.equal(manifest.peerDependencies[supplier],lock.packages[`node_modules/${supplier}`].version);
  assert.deepEqual(manifest.peerDependenciesMeta[supplier],{optional:true});
  assert.equal(manifest.devDependencies[supplier],lock.packages[''].devDependencies[supplier]);
  assert.equal(Object.hasOwn(manifest.dependencies,supplier),false);
  const entry=new URL(import.meta.resolve(`${supplier}/verified-save-write`));
  const owner=JSON.parse(await readFile(new URL('../package.json',entry)));
  assert.equal(owner.name,supplier);
  assert.deepEqual(owner.dependencies??{},{});
  assert.deepEqual(owner.peerDependencies??{},{});
  const isolated=await mkdtemp(join(tmpdir(),'idle-save-contract-'));
  t.after(()=>rm(isolated,{recursive:true,force:true}));
  await cp(entry,join(isolated,'save.mjs'));
  const {writeVerifiedSave}=await import(pathToFileURL(join(isolated,'save.mjs')).href);
  const text='{"world":"κόσμος","banked":7}';
  const calls=[];let stored;
  assert.deepEqual(writeVerifiedSave({text,write:value=>{calls.push('write');stored=value;},read:()=>{calls.push('read');return stored;}}),{ok:true});
  assert.deepEqual(calls,['write','read']);
  assert.equal(stored,text);
  for(const actual of [null,'',text+' ']) {
    let writes=0,reads=0;
    assert.deepEqual(writeVerifiedSave({text,write:()=>writes++,read:()=>{reads++;return actual;}}),{ok:false,kind:'mismatch',actual});
    assert.equal(writes,1);assert.equal(reads,1);
  }
  const failure=new Error('storage unavailable');
  let reads=0,writes=0;
  const writeError=writeVerifiedSave({text,write:()=>{writes++;throw failure;},read:()=>{reads++;return text;}});
  assert.deepEqual(writeError,{ok:false,kind:'write-error',error:failure});
  assert.equal(reads,0);assert.equal(writes,1);
  const readError=writeVerifiedSave({text,write:()=>writes++,read:()=>{reads++;throw failure;}});
  assert.deepEqual(readError,{ok:false,kind:'read-error',error:failure});
  assert.equal(reads,1);assert.equal(writes,2);
  for(const input of [undefined,{}, {text:7,read:()=>text,write:()=>{}}, {text,read:null,write:()=>{}}, {text,read:()=>text,write:null}]) {
    assert.throws(()=>writeVerifiedSave(input),TypeError);
  }
});

test('core package imports and plays without optional generation or browser suppliers', async t => {
  const root=await mkdtemp(join(tmpdir(),'idle-core-consumer-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await cp(new URL('../src',import.meta.url),join(root,'src'),{recursive:true});
  await cp(new URL('../package.json',import.meta.url),join(root,'package.json'));
  const dataPackage='@red-cup-engineering/computer-data-engineering-services-section';
  const dataEntry=await realpath(new URL(import.meta.resolve(`${dataPackage}/package.json`)));
  await mkdir(join(root,'node_modules/@red-cup-engineering'),{recursive:true});
  await symlink(dirname(dataEntry),join(root,'node_modules',dataPackage),'dir');
  // A fresh process and fixture-local self references cannot reuse this test's
  // module cache or accidentally resolve the optional peers from this checkout.
  await writeFile(join(root,'consumer.mjs'),`
    import assert from 'node:assert/strict';
    import * as engine from '@red-cup-engineering/incremental-idle-computer-game-engine/engine';
    import {WORLDS} from '@red-cup-engineering/incremental-idle-computer-game-engine/worlds';
    import {spendPoints} from '@red-cup-engineering/incremental-idle-computer-game-engine/transactions';
    for(const world of WORLDS) {
      const played=engine.tap(world,engine.newRun(world,1000),1000);
      assert.equal(played.accepted,true);
      assert.equal(spendPoints(world,played.state,1).accepted,true);
    }
  `);
  const {execFileSync}=await import('node:child_process');
  execFileSync(process.execPath,[join(root,'consumer.mjs')],{cwd:root,env:{...process.env,NODE_PATH:''}});
});

test('resource spending preserves partial objective progress and cannot buy prestige eligibility', () => {
  const world = engine.defineWorld({...WORLDS[0], id: 'package-objective-fixture', prestigeObjectives: [{id:'practice', label:'Make two actions', action:'tap', count:2}]});
  let state = {...engine.newRun(world, 1000), banked:10000, runProduced:10000, allTime:10000};
  state = engine.tap(world, state, 1000).state;
  const before = structuredClone(state);
  const debit = transactions.spendPoints(world, state, 5);
  assert.equal(debit.accepted, true);
  assert.equal(debit.state.banked, state.banked - 5);
  assert.deepEqual(debit.state.objectiveProgress, state.objectiveProgress);
  assert.equal(debit.state.objectiveContract, state.objectiveContract);
  assert.equal(debit.state.runTaps, 1);
  assert.equal(engine.availablePrestige(world, debit.state), 0);
  assert.deepEqual(state, before);
  assert.deepEqual(engine.admitRun(world, JSON.parse(JSON.stringify(debit.state))), debit.state);
});

test('zero and refused spending preserve completed objectives; normal prestige still resets them', () => {
  const world = engine.defineWorld({...WORLDS[0], id: 'package-completed-fixture', prestigeObjectives: [{id:'practice', label:'Make one action', action:'tap', count:1}]});
  const state = engine.tap(world, {...engine.newRun(world, 1000), banked:10000, runProduced:10000, allTime:10000}, 1000).state;
  const available = engine.availablePrestige(world, state);
  assert.ok(available > 0);
  assert.deepEqual(transactions.spendPoints(world, state, 0).state, state);
  const refused = transactions.spendPoints(world, state, state.banked + 1);
  assert.equal(refused.accepted, false);
  assert.deepEqual(refused.state, state);
  assert.equal(engine.availablePrestige(world, refused.state), available);
  const reset = engine.prestige(world, refused.state, 1000);
  assert.equal(reset.awarded, available);
  assert.equal(reset.state.objectiveProgress.practice, 0);
});
