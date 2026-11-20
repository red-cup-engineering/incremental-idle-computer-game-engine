import assert from 'node:assert/strict';

export async function check({ evaluate, wait, click, reload }) {
  await wait(() => document.querySelector('#tap')?.textContent !== 'Collect' && document.querySelector('[aria-label^="Buy 1:"]'));
  const setup = await evaluate(async () => {
    const { worldById } = await import('/assets/worlds.mjs');
    const world = worldById(new URLSearchParams(location.search).get('world'));
    const producer = world.producers[0];
    for (let i = 0; i < producer.baseCost; i++) document.querySelector('#tap').click();
    document.querySelector('[aria-label="Buy 1: ' + producer.label + '"]').click();
    return { id: world.id, title: world.label, producer: producer.id, rate: producer.ratePerSecond, cap: world.offlineCapSeconds };
  });
  await reload();
  await wait(() => document.querySelector('#rate')?.textContent !== '0 / sec');
  await click('#export');
  const backup = JSON.parse(await evaluate(() => document.querySelector('#save-data').value));
  assert.equal(backup.producers[setup.producer], 1);
  // Offline time is supplied in the ordinary checkpoint. Backdate a valid
  // exported run and exercise the actual import, timer, prestige and reload UI.
  await evaluate(({ state, cap }) => {
    state.lastMs = Date.now() - (cap + 60) * 1000;
    document.querySelector('#save-data').value = JSON.stringify(state);
  }, { state: backup, cap: setup.cap });
  await click('#import');
  await click('#export');
  const accrued = JSON.parse(await evaluate(() => document.querySelector('#save-data').value));
  assert.equal(accrued.banked, backup.banked + setup.rate * setup.cap);
  await click('#prestige');
  await click('#confirm-prestige');
  await reload();
  await click('#export');
  const fresh = JSON.parse(await evaluate(() => document.querySelector('#save-data').value));
  assert.ok(fresh.prestige > 0);
  assert.equal(fresh.banked, 0);
  assert.equal(fresh.producers[setup.producer], 0);
  const excess = {...fresh, banked: fresh.runProduced + 1};
  assert.ok(excess.banked <= excess.allTime);
  await evaluate(raw => { document.querySelector('#save-data').value = raw; }, JSON.stringify(excess));
  await click('#import');
  await wait(() => document.querySelector('#status').textContent.includes('Import refused'));
  await click('#export');
  const retained = JSON.parse(await evaluate(() => document.querySelector('#save-data').value));
  assert.equal(retained.banked, fresh.banked);
  assert.equal(retained.allTime, fresh.allTime);
  assert.equal(retained.prestige, fresh.prestige);
  // Import a bounded late-game fixture, then buy its last possible producer through the HUD.
  const limit = await evaluate(async ({run, id}) => {
    const {worldById} = await import('/assets/worlds.mjs');
    const {producerPrice, MAX_POINTS} = await import('/assets/engine.mjs');
    const p = worldById(run.worldId).producers.find(p => p.id === id);
    let owned = 0;
    while (producerPrice(p, owned + 1) <= MAX_POINTS) owned++;
    run.banked = run.runProduced = run.allTime = MAX_POINTS;
    run.producers[id] = owned;
    run.lastMs = Date.now();
    document.querySelector('#save-data').value = JSON.stringify(run);
    return {label: p.label, owned: owned + 1};
  }, {run: fresh, id: setup.producer});
  await click('#import');
  await click('[aria-label="Buy max: ' + limit.label + '"]');
  await reload();
  await wait(id => document.getElementById('preview-' + id + '-max')?.textContent.includes('price exceeds the balance limit'), setup.producer);
  assert.ok(await evaluate(label => [1, 10, 'max'].every(n =>
    document.querySelector('[aria-label="Buy ' + n + ': ' + label + '"]').disabled), limit.label));
  await click('#export');
  const capped = JSON.parse(await evaluate(() => document.querySelector('#save-data').value));
  assert.equal(capped.producers[setup.producer], limit.owned);
  assert.equal(capped.prestige, fresh.prestige);
  return { priceCeilingAt: limit.owned, title: setup.title, offlineSeconds: setup.cap, restoredPrestige: fresh.prestige, excessBalanceRefused: true };
}
