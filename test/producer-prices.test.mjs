import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLDS } from './fixtures/worlds.mjs';
import { MAX_POINTS, MAX_LEVEL, defineWorld, newRun, admitRun, producerPrice, buyProducer,
  project, prestige, forecastProduction } from '../src/engine.mjs';

// Independent bounded-number oracle: each product is below 3e15, hence exact.
// Dividing the remainder cannot round across an integer (its step is 1/10000).
function nextPrice(price, growth) {
  const whole = Math.floor(price / 10000), remainder = price % 10000;
  return Math.min(MAX_POINTS + 1, whole * growth + Math.ceil(remainder * growth / 10000));
}
function quote(producer, owned) {
  let price = producer.baseCost;
  for (let n = 0; n < owned && price <= MAX_POINTS; n++) price = nextPrice(price, producer.growthBasisPoints);
  return price;
}
const now = 1_793_797_200_000;
const cases = [
  [WORLDS[0], 'pencil', 189, 478468290980832],
  [WORLDS[0], 'loom', 112, 131018709961755],
  [WORLDS[1], 'antenna', 157, 363653538991968]
];
function savedRun(world, id, owned, banked) {
  const state = {...newRun(world, now), banked, runProduced: MAX_POINTS, allTime: MAX_POINTS};
  state.producers[id] = owned;
  return JSON.parse(JSON.stringify(state));
}

test('late-game producer quotes round the exact integer recurrence in both directions', () => {
  for (const [world, id, owned, expected] of cases) {
    const producer = world.producers.find(p => p.id === id);
    assert.equal(quote(producer, owned), expected);
    assert.equal(producerPrice(producer, owned), expected, `${world.id}/${id}/${owned}`);
  }
});

test('all eight shipped producer ladders match an independent oracle through the level cap', () => {
  for (const world of WORLDS) for (const producer of world.producers) {
    let expected = producer.baseCost;
    for (let owned = 0; owned <= MAX_LEVEL; owned++) {
      assert.equal(producerPrice(producer, owned), expected, `${world.id}/${producer.id}/${owned}`);
      expected = nextPrice(expected, producer.growthBasisPoints);
    }
  }
});

test('every admitted growth factor preserves exact and fractional near-cap one-step prices', () => {
  for (let growth = 10000; growth <= 30000; growth++) {
    for (const baseCost of [1, 3, 10000, 900719925473, 333333333333333, MAX_POINTS - 1, MAX_POINTS]) {
      const producer = {...WORLDS[0].producers[0], baseCost, growthBasisPoints: growth};
      assert.equal(producerPrice(producer, 0), baseCost);
      assert.equal(producerPrice(producer, 1), nextPrice(baseCost, growth), `${baseCost}/${growth}`);
    }
  }
});

test('constant prices, the exact balance cap and unreachable prices retain bounded semantics', () => {
  const producer = {...WORLDS[0].producers[0], baseCost: MAX_POINTS, growthBasisPoints: 10000};
  assert.equal(producerPrice(producer, MAX_LEVEL), MAX_POINTS);
  assert.equal(producerPrice({...producer, growthBasisPoints: 10001}, 1), MAX_POINTS + 1);
  assert.equal(producerPrice({...producer, growthBasisPoints: 30000}, MAX_LEVEL), MAX_POINTS + 1);
  for (const owned of [-1, 0.5, MAX_LEVEL + 1, Infinity, NaN]) assert.throws(() => producerPrice(producer, owned));
  assert.equal(producerPrice({...producer, baseCost: 1, growthBasisPoints: 10001}, MAX_LEVEL), 1001);
  assert.equal(producerPrice({...producer, baseCost: 999900009999000, growthBasisPoints: 10001}, 1), MAX_POINTS);
  assert.equal(producerPrice({...producer, baseCost: 999900009999000, growthBasisPoints: 10001}, 2), MAX_POINTS + 1);
  assert.equal(producerPrice({...producer, baseCost: 333333333333333, growthBasisPoints: 30000}, 1), MAX_POINTS - 1);
  assert.equal(producerPrice({...producer, baseCost: 333333333333334, growthBasisPoints: 30000}, 1), MAX_POINTS + 1);
});

test('objective admission refuses a genuinely above-cap final purchase previously rounded down', () => {
  const producer = {...WORLDS[0].producers[0], baseCost: 999300489657240, growthBasisPoints: 10007};
  assert.equal(producerPrice(producer, 1), MAX_POINTS + 1);
  const candidate = {...WORLDS[0], id: 'cap-objective', producers: [producer], prestigeObjectives: [
    {id: 'equip', label: 'Equip pencils', action: 'buy-producer', targetId: 'pencil', count: 2}
  ]};
  assert.throws(() => defineWorld(candidate), /unreachable producer purchase/);
  assert.equal(defineWorld({...candidate, prestigeObjectives: [{...candidate.prestigeObjectives[0], count: 1}]}).id, 'cap-objective');
});

test('old saves keep their balances and inventory; only future quotes and debits are corrected', () => {
  for (const [world, id, owned, cost] of cases) {
    for (const banked of [cost - 1, cost, cost + 1, MAX_POINTS]) {
      const state = savedRun(world, id, owned, banked), before = structuredClone(state);
      assert.deepEqual(admitRun(world, state), state);
      assert.deepEqual(project(world, state, now).state, state);
      assert.equal(project(world, state, now).producers.find(p => p.id === id).nextCost, cost);
      const result = buyProducer(world, state, id, 1, now);
      assert.equal(result.accepted, banked >= cost);
      if (result.accepted) {
        assert.equal(result.spent, cost);
        assert.equal(result.count, 1);
        assert.equal(result.state.banked, banked - cost);
        assert.equal(result.state.producers[id], owned + 1);
        assert.equal(result.state.runProduced, state.runProduced);
        assert.equal(result.state.allTime, state.allTime);
      } else assert.deepEqual(result.state, state);
      assert.deepEqual(state, before);
      const roundTrip = JSON.parse(JSON.stringify(result.state));
      assert.deepEqual(admitRun(world, roundTrip), result.state);
      assert.equal(prestige(world, roundTrip, now).accepted, true);
    }
  }
});

test('bulk and repeated purchases agree with independently quoted saved-run continuation', () => {
  for (const world of WORLDS) for (const producer of world.producers) {
    for (const owned of [0, 70, 100, 110, 140, 155, 180, 190, MAX_LEVEL]) {
      const state = savedRun(world, producer.id, owned, MAX_POINTS);
      let count = 0, balance = MAX_POINTS, spent = 0;
      while (count < 100 && owned + count < MAX_LEVEL) {
        const price = quote(producer, owned + count);
        if (price > balance) break;
        balance -= price; spent += price; count++;
      }
      for (const requested of [100, 'max']) {
        const result = buyProducer(world, state, producer.id, requested, now);
        assert.equal(result.accepted, count > 0);
        assert.equal(result.count ?? 0, count);
        assert.equal(result.spent ?? 0, spent);
        assert.equal(result.state.banked, balance);
        assert.equal(result.state.producers[producer.id], owned + count);
        let singles = state;
        for (let n = 0; n < count; n++) singles = buyProducer(world, singles, producer.id, 1, now).state;
        assert.deepEqual(result.state, singles);
      }
    }
  }
});

test('a one-point deficit is quoted through the unchanged native production clock', () => {
  for (const [world, id, owned, cost] of cases) {
    const state = savedRun(world, id, owned, cost - 1);
    const before = structuredClone(state);
    assert.equal(forecastProduction(world, state, cost, now, now + 999).reachable, false);
    assert.equal(forecastProduction(world, state, cost, now, now + 1000).readyAtMs, now + 1000);
    assert.equal(buyProducer(world, state, id, 1, now + 999).accepted, false);
    assert.equal(buyProducer(world, state, id, 1, now + 1000).accepted, true);
    assert.deepEqual(state, before);
  }
});

test('v2 objective progress and old save shape survive an exact-price purchase', () => {
  const world = defineWorld({...WORLDS[0], id: 'exact-objective', prestigeObjectives: [
    {id: 'equip', label: 'Equip pencils', action: 'buy-producer', targetId: 'pencil', count: 190}
  ]});
  const cost = quote(world.producers[0], 189), state = savedRun(world, 'pencil', 189, cost);
  state.objectiveProgress.equip = 189;
  assert.deepEqual(admitRun(world, state), state);
  const result = buyProducer(world, state, 'pencil', 1, now);
  assert.equal(result.state.objectiveProgress.equip, 190);
  assert.equal(result.state.objectiveContract, state.objectiveContract);
  assert.equal(result.state.kind, state.kind);
  assert.deepEqual(Object.keys(result.state).sort(), Object.keys(state).sort());
  assert.deepEqual(admitRun(world, JSON.parse(JSON.stringify(result.state))), result.state);
});
