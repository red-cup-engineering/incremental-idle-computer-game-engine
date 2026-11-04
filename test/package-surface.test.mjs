import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as engine from '@red-cup-engineering/incremental-idle-game/engine';
import * as transactions from '@red-cup-engineering/incremental-idle-game/transactions';
import { WORLDS } from '@red-cup-engineering/incremental-idle-game/worlds';
import * as legacyEngine from '@red-cup-engineering/incremental-idle-game/src/engine.mjs';
import * as legacyTransactions from '@red-cup-engineering/incremental-idle-game/src/transactions.mjs';

test('package entrances are aliases to the original modules, not duplicate state or implementations', () => {
  assert.equal(engine, legacyEngine);
  assert.equal(transactions, legacyTransactions);
  assert.equal(engine.defineWorld, legacyEngine.defineWorld);
  assert.equal(typeof transactions.spendPoints, 'function');
  assert.deepEqual(WORLDS.map(world => world.id), ['trace-garden', 'pocket-observatory']);
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
  const supplier = '@red-cup-engineering/jsnode-package-services-section';
  assert.equal(manifest.devDependencies[supplier], '0.5.1-dev.5');
  assert.equal(manifest.peerDependencies[supplier], manifest.devDependencies[supplier]);
  assert.deepEqual(manifest.peerDependenciesMeta[supplier], {optional: true});
  assert.equal(Object.hasOwn(manifest.dependencies, supplier), false);
  assert.equal(Object.hasOwn(manifest.optionalDependencies ?? {}, supplier), false);
  assert.equal(manifest.exports['./scripts/*'], './scripts/*');
  assert.equal(manifest.scripts.generate, 'node scripts/generate-worlds.mjs');
  assert.equal(manifest.scripts['check:generated'], 'node scripts/generate-worlds.mjs --check');
});

test('browser custody selects a tiny optional supplier without adding an engine runtime dependency', async () => {
  const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
  const supplier='@red-cup-engineering/computer-game-systems-engineering-services-section';
  assert.equal(manifest.peerDependencies[supplier],'0.1.1');
  assert.deepEqual(manifest.peerDependenciesMeta[supplier],{optional:true});
  assert.equal(manifest.devDependencies[supplier],'file:artifacts/gamehouse-verified-save-3e548251.tgz');
  assert.equal(Object.hasOwn(manifest.dependencies,supplier),false);
  const entry=new URL(import.meta.resolve(`${supplier}/verified-save-write`));
  const owner=JSON.parse(await readFile(new URL('../package.json',entry)));
  assert.equal(owner.name,supplier);
  assert.deepEqual(owner.dependencies??{},{});
  assert.deepEqual(owner.peerDependencies??{},{});
  const helper=await readFile(entry,'utf8');
  assert.equal(createHash('sha256').update(helper).digest('hex'),'fe0bfb8a06e7864a1302abc3a0bac5a5de62a344a12c3011f0f1fc9df1ba09f7');
  assert.doesNotMatch(helper,/\bimport\b/);
  for(const name of ['engine.mjs','worlds.mjs','transactions.mjs']) {
    const source=await readFile(new URL(`../src/${name}`,import.meta.url),'utf8');
    assert.equal(source.includes(supplier),false);
  }
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
