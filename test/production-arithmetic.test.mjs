import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLDS } from '../src/worlds.mjs';
import { MAX_POINTS, MAX_LEVEL, defineWorld, newRun, admitRun, incomePerSecond,
  advance, advanceActive, forecastProduction, project, quoteProducerPurchase,
  buyProducer, quoteUpgradePurchase, buyUpgrade, prestige } from '../src/engine.mjs';

// Independent bounded-Number oracle. A product/sum below MAX_POINTS is exact.
// Once the base reaches the cap, positive multipliers cannot bring it back below.
// Quotient/remainder splitting keeps the percentage product exact until capped.
function expectedIncome(world, state) {
  let base = 0;
  for (const producer of world.producers) {
    const product = producer.ratePerSecond * state.producers[producer.id];
    if (product >= MAX_POINTS || base + product >= MAX_POINTS) return MAX_POINTS;
    base += product;
  }
  const factor = 100 + 20 * state.prestige + world.upgrades.reduce((sum, upgrade) =>
    sum + (upgrade.effect === 'production' && state.upgrades[upgrade.id] ? upgrade.amount : 0), 0);
  const whole = Math.floor(base / 100) * factor;
  if (whole >= MAX_POINTS) return MAX_POINTS;
  return Math.min(MAX_POINTS, whole + Math.floor((base % 100) * factor / 100));
}
function highWorld(rate = 100000000000099, amount = 1) {
  return defineWorld({...WORLDS[0], id: 'exact-production',
    producers: [{...WORLDS[0].producers[0], baseCost: 1, growthBasisPoints: 10000, ratePerSecond: rate}],
    upgrades: [{id: 'boost', label: 'Boost', cost: 1, unlockAt: 0, effect: 'production', amount}]
  });
}
function boostedRun(world, options = {}) {
  return {...newRun(world, 137), producers: {[world.producers[0].id]: 1}, upgrades: {boost: true}, ...options};
}

test('admitted high-rate worlds floor exact percentage production, not a rounded intermediate', () => {
  for (const [rate, bonus, expected] of [
    [100000000000099, 1, 101000000000099],
    [100000000000100, 261, 361000000000361],
    [847457627118644, 18, MAX_POINTS - 1]
  ]) {
    const world = highWorld(rate, bonus), state = boostedRun(world);
    assert.equal(incomePerSecond(world, state), expected);
    assert.equal(expectedIncome(world, state), expected);
    assert.deepEqual(admitRun(world, JSON.parse(JSON.stringify(state))), state);
  }
});

test('every permitted single production bonus matches independent bounded arithmetic', () => {
  for (let amount = 1; amount <= 10000; amount++) {
    for (const rate of [1, 99, 900719925473, 100000000000099, 333333333333333, MAX_POINTS - 1, MAX_POINTS]) {
      const world = highWorld(rate, amount), state = boostedRun(world);
      assert.equal(incomePerSecond(world, state), expectedIncome(world, state), `${rate}/${amount}`);
    }
  }
});

test('all prestige multipliers and combined bonuses floor the aggregate once', () => {
  for (let prestige = 0; prestige <= 1000; prestige++) {
    const world = defineWorld({...highWorld(), producers: [
      {...highWorld().producers[0], ratePerSecond: 999999999, id: 'one'},
      {...highWorld().producers[0], ratePerSecond: 1000000001, id: 'two'}
    ], upgrades: [
      {id: 'first', label: 'First', cost: 1, unlockAt: 0, effect: 'production', amount: 17},
      {id: 'second', label: 'Second', cost: 1, unlockAt: 0, effect: 'production', amount: 10000},
      {id: 'tap-only', label: 'Tap only', cost: 1, unlockAt: 0, effect: 'tap', amount: 10000}
    ]});
    const state = {...newRun(world, 0), prestige, producers: {one: 3, two: 7},
      upgrades: {first: true, second: prestige % 2 === 0, 'tap-only': true}};
    assert.equal(incomePerSecond(world, state), expectedIncome(world, state));
  }
  const world = defineWorld({...highWorld(1, 50), producers: [
    {...highWorld(1, 50).producers[0], id: 'one'}, {...highWorld(1, 50).producers[0], id: 'two'}
  ]});
  const state = {...newRun(world, 0), producers: {one: 1, two: 1}, upgrades: {boost: true}};
  assert.equal(incomePerSecond(world, state), 3, 'floor after summing producer income');
});

test('zero inventory, near-cap results and the largest admitted aggregate remain bounded Numbers', () => {
  for (const rate of [MAX_POINTS - 1, MAX_POINTS]) {
    const world = highWorld(rate), state = boostedRun(world, {upgrades: {boost: false}});
    assert.equal(incomePerSecond(world, state), rate);
    assert.equal(incomePerSecond(world, {...state, upgrades: {boost: true}}), MAX_POINTS);
  }
  const world = defineWorld({...highWorld(),
    producers: Array.from({length: 16}, (_, i) => ({...highWorld(MAX_POINTS).producers[0], id: `p-${i}`})),
    upgrades: Array.from({length: 16}, (_, i) => ({...highWorld(1, 10000).upgrades[0], id: `u-${i}`}))
  });
  const state = {...newRun(world, 0), prestige: 1000,
    producers: Object.fromEntries(world.producers.map(p => [p.id, MAX_LEVEL])),
    upgrades: Object.fromEntries(world.upgrades.map(u => [u.id, true]))};
  assert.equal(incomePerSecond(world, state), MAX_POINTS);
  assert.equal(typeof incomePerSecond(world, state), 'number');
  assert.equal(incomePerSecond(world, {...state, producers: newRun(world, 0).producers}), 0);
});

test('native settlement and readiness never credit or promise the rounded extra point', () => {
  const world = highWorld(), state = boostedRun(world), original = structuredClone(state);
  const expected = 101000000000099;
  const at = advance(world, state, 1137);
  assert.equal(at.gained, expected);
  assert.equal(at.state.banked, expected);
  assert.equal(at.state.runProduced, expected);
  assert.equal(at.state.allTime, expected);
  assert.deepEqual(advanceActive(world, state, 637, 1137), at);
  assert.equal(project(world, state, 1137).rate, expected);
  assert.equal(forecastProduction(world, state, expected + 1, 637, 1137).reachable, false);
  const forecast = forecastProduction(world, state, expected + 1, 637, 2137);
  assert.deepEqual(forecast, {missing: expected + 1, rate: expected, waitMs: 1500, reachable: true, readyAtMs: 2137});
  assert.equal(advanceActive(world, state, 637, forecast.readyAtMs - 1).state.banked, expected);
  assert.equal(advanceActive(world, state, 637, forecast.readyAtMs).state.banked, 2 * expected);
  assert.equal(advance(world, state, 10137).state.banked, MAX_POINTS);
  assert.deepEqual(admitRun(world, JSON.parse(JSON.stringify(at.state))), at.state);
  assert.deepEqual(state, original, 'quotes and settlement do not rewrite the existing run');
});

test('native purchase quotes, upgrade application and prestige continue through exact production', () => {
  const world = highWorld(), state = boostedRun(world, {banked: 10, runProduced: 10, allTime: 10});
  const before = structuredClone(state);
  const purchase = buyProducer(world, state, 'pencil', 1, 137);
  assert.equal(purchase.accepted, true);
  assert.equal(quoteProducerPurchase(world, state, 'pencil', 1).rateGain,
    expectedIncome(world, purchase.state) - expectedIncome(world, state));
  const unboosted = {...state, upgrades: {boost: false}};
  const upgraded = buyUpgrade(world, unboosted, 'boost', 1137);
  assert.equal(upgraded.state.banked, 10 + world.producers[0].ratePerSecond - 1,
    'elapsed time uses the old production rate before buying the boost');
  assert.equal(quoteUpgradePurchase(world, unboosted, 'boost').rateGain, 1000000000000);
  assert.equal(advance(world, upgraded.state, 2137).gained, 101000000000099);
  const reset = prestige(world, {...state, runProduced: MAX_POINTS, allTime: MAX_POINTS}, 137);
  assert.equal(reset.accepted, true);
  assert.equal(incomePerSecond(world, reset.state), 0);
  assert.deepEqual(state, before);
});

test('shipped worlds and old save inventories retain their production at all sampled levels', () => {
  for (const world of WORLDS) for (const owned of [0, 1, 3, 17, 99, 189, 1000]) {
    for (const prestige of [0, 1, 9, 1000]) for (const enabled of [false, true]) {
      const state = {...newRun(world, 0), prestige,
        producers: Object.fromEntries(world.producers.map(p => [p.id, owned])),
        upgrades: Object.fromEntries(world.upgrades.map(u => [u.id, enabled]))};
      const base = world.producers.reduce((sum, p) => sum + p.ratePerSecond * owned, 0);
      const factor = 100 + 20 * prestige + world.upgrades.reduce((sum, u) => sum + (enabled && u.effect === 'production' ? u.amount : 0), 0);
      assert.equal(incomePerSecond(world, state), Math.min(MAX_POINTS, Math.floor(base * factor / 100)));
      assert.equal(incomePerSecond(world, state), expectedIncome(world, state));
      assert.deepEqual(admitRun(world, JSON.parse(JSON.stringify(state))), state);
    }
  }
});
