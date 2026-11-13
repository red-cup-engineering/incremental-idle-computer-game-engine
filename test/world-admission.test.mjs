import test from 'node:test';
import assert from 'node:assert/strict';
import * as source from '../src/engine.mjs';
import {definition, identityCases, sparseCases} from './fixtures/world-admission-cases.mjs';

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
