import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as source from '../src/engine.mjs';
import { WORLD_DEFINITIONS } from '../src/generated/world-definitions.mjs';
import { build } from '../scripts/build.mjs';
import { generateWorlds } from '../scripts/generate-worlds.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const definition = () => structuredClone(WORLD_DEFINITIONS[0]);
const invalidIds = [undefined, null, true, false, 12, new String('pencil'), ['pencil'], {toString: () => 'pencil'}];
const locations = [
  ['world', world => world],
  ['producer', world => world.producers[0]],
  ['upgrade', world => world.upgrades[0]],
  ['objective', world => {
    world.prestigeObjectives = [{id: 'first-tap', label: 'Tap once', action: 'tap', count: 1}];
    return world.prestigeObjectives[0];
  }],
];

function identityCases(engine) {
  for (const [name, select] of locations) for (const value of invalidIds) {
    const world = definition();
    select(world).id = value;
    assert.throws(() => engine.defineWorld(world), TypeError, `${name} must reject ${String(value)} (${typeof value})`);
  }
}

function sparseCases(engine) {
  for (const field of ['producers', 'upgrades', 'prestigeObjectives']) {
    const world = definition();
    if (field === 'prestigeObjectives') world[field] = [{id: 'first-tap', label: 'Tap once', action: 'tap', count: 1}];
    const original = [...world[field]];
    const inherited = [];
    inherited.length = original.length;
    Object.setPrototypeOf(inherited, original);
    world[field] = inherited;
    assert.throws(() => engine.defineWorld(world), TypeError, `${field} must reject inherited-only records`);
    for (const hole of [0, original.length]) {
      world[field] = [...original];
      if (hole === original.length) world[field].length++;
      else delete world[field][hole];
      assert.throws(() => engine.defineWorld(world), TypeError, `${field} must reject empty index ${hole}`);
    }
  }
}

for (const [name, verify] of [['string identities', identityCases], ['dense records', sparseCases]]) {
  test(`runtime world admission requires ${name}`, () => verify(source));
}

test('world admission does not invoke identity coercion', () => {
  let calls = 0;
  const world = definition();
  world.id = {toString() { calls++; return 'coerced-world'; }};
  assert.throws(() => source.defineWorld(world), TypeError);
  assert.equal(calls, 0);
});

test('runtime world definitions must be non-array objects', () => {
  for (const container of [[], function world() {}]) {
    Object.assign(container, definition());
    assert.throws(() => source.defineWorld(container), TypeError);
  }
});

test('valid string identities retain exact inventory and save round trips', () => {
  for (const id of ['undefined', 'null', 'false', 'constructor', 'a', 'a'.repeat(48)]) {
    const input = definition();
    input.id = id;
    input.producers[0].id = id;
    const world = source.defineWorld(input);
    let run = source.newRun(world, 0);
    for (let n = 0; n < world.producers[0].baseCost; n++) run = source.tap(world, run, 0).state;
    const bought = source.buyProducer(world, run, id, 1, 0);
    assert.equal(bought.accepted, true);
    assert.equal(bought.state.producers[id], 1);
    assert.deepEqual(source.admitRun(world, JSON.parse(JSON.stringify(bought.state))), bought.state);
  }
});

test('published browser engine preserves world admission and existing worlds', async t => {
  const out = await mkdtemp(join(tmpdir(), 'idle-world-admission-build-'));
  t.after(() => rm(out, {recursive: true, force: true}));
  await build(out);
  const engine = await import(pathToFileURL(join(out, 'assets/engine.mjs')).href);
  identityCases(engine);
  sparseCases(engine);
  for (const input of WORLD_DEFINITIONS) {
    const world = engine.defineWorld(input);
    const saved = engine.tap(world, engine.newRun(world, 0), 1000).state;
    assert.equal(saved.worldId, input.id);
    assert.equal(saved.banked, 1);
    assert.deepEqual(engine.admitRun(world, JSON.parse(JSON.stringify(saved))), saved);
  }
});

test('authored schema and runtime both reject malformed identities without changing generated source', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'idle-world-admission-design-'));
  t.after(() => rm(fixture, {recursive: true, force: true}));
  for (const directory of ['design', 'src']) await cp(join(root, directory), join(fixture, directory), {recursive: true});
  const generated = join(fixture, 'src/generated/world-definitions.mjs');
  const previous = await readFile(generated);
  for (const [, select] of locations.slice(0, 3)) for (const value of [undefined, null, true]) {
    const world = definition();
    select(world).id = value;
    assert.throws(() => source.defineWorld(world), TypeError);
    await writeFile(join(fixture, 'design/world-catalog.json'), JSON.stringify([world]));
    await assert.rejects(generateWorlds({root: fixture}));
    assert.deepEqual(await readFile(generated), previous);
  }
});
