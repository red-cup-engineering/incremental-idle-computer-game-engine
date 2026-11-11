import assert from 'node:assert/strict';
import {WORLD_DEFINITIONS} from './worlds.mjs';
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

export { definition, invalidIds, locations, identityCases, sparseCases };
