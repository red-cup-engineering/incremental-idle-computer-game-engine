import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from '../scripts/build.mjs';
import { WORLDS } from '../src/worlds.mjs';
import { withBrowser, storageKey } from './helpers/browser-harness.mjs';

const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
async function filesBelow(root, prefix = '') {
  const paths = [];
  for (const entry of await readdir(join(root, prefix), {withFileTypes: true})) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) paths.push(...await filesBelow(root, path));
    else paths.push(path);
  }
  return paths.sort();
}

test('publisher emits a complete offline artifact with verifiable input and output receipts', async t => {
  const out = await mkdtemp(join(tmpdir(), 'little-worlds-'));
  t.after(() => rm(out, {recursive: true, force: true}));
  const result = await build(out);
  const html = await readFile(join(out, 'index.html'), 'utf8');
  const receipt = JSON.parse(await readFile(join(out, 'fabrication-receipt.json'), 'utf8'));
  assert.deepEqual(result.files.toSorted(), await filesBelow(out));
  assert.equal(new Set(result.files).size, result.files.length, 'every artifact is listed once');
  assert.equal(receipt.kind, '561.incremental-idle-fabrication-receipt/v1');
  assert.deepEqual(receipt, result.receipt);
  assert.deepEqual(receipt.artifacts.map(row => row.path).toSorted(),
    result.files.filter(path => path !== 'fabrication-receipt.json').toSorted());
  for (const artifact of receipt.artifacts) {
    assert.equal(artifact.digest, digest(await readFile(join(out, artifact.path))), artifact.path);
  }
  for (const source of [...receipt.design, ...receipt.generated]) {
    assert.equal(source.digest, digest(await readFile(new URL(`../${source.path}`, import.meta.url))), source.path);
  }
  for (const [key, path] of [['supplier', 'discrete-clock.mjs'], ['browserSupplier', 'verified-save-write.mjs']]) {
    const bytes = await readFile(new URL(import.meta.resolve(receipt[key].specifier)));
    assert.deepEqual(await readFile(join(out, 'assets', path)), bytes);
    assert.equal(receipt[key].digest, digest(bytes));
  }
  assert.match(await readFile(join(out, '_headers'), 'utf8'), /connect-src 'none'/);

  // Import from a temporary directory with no node_modules. An omitted module
  // or a remaining package import fails resolution instead of passing a regex.
  const runtime = await import(pathToFileURL(join(out, 'assets/engine.mjs')).href);
  const {WORLDS: builtWorlds} = await import(pathToFileURL(join(out, 'assets/worlds.mjs')).href);
  assert.deepEqual(builtWorlds, WORLDS);
  for (const world of builtWorlds) {
    await t.test(`${world.id}: emitted clock retains partial ticks and active limits`, () => {
      const activeWorld = runtime.defineWorld({...world, offlineCapSeconds: 60});
      const producer = activeWorld.producers[0];
      const start = runtime.newRun(activeWorld, 137);
      const earning = {...start, producers: {...start.producers, [producer.id]: 1}};
      const active = runtime.advanceActive(activeWorld, earning, 637, 60637);
      assert.equal(active.gained, 60 * producer.ratePerSecond);
      assert.equal(active.seconds, 60);
      assert.equal(active.discardedSeconds, 0);
      assert.equal(active.state.lastMs, 60137);
      assert.equal(runtime.advanceActive(activeWorld, active.state, 60637, 61137).gained, producer.ratePerSecond);
      assert.throws(() => runtime.advanceActive(activeWorld, start, 137, 60138), /time cap/);
      const forecast = runtime.forecastProduction(activeWorld, earning, 2 * producer.ratePerSecond, 637, 2637);
      assert.equal(forecast.reachable, true);
      assert.equal(forecast.waitMs, 1500);
      assert.equal(forecast.readyAtMs, 2137);
      assert.equal(runtime.advanceActive(activeWorld, earning, 637, forecast.readyAtMs).state.banked, 2 * producer.ratePerSecond);
    });
    await t.test(`${world.id}: built controls play, save, reload and refuse invalid imports`, async () => {
      const entry = join(out, 'assets/browser.mjs');
      const options = {now: 137, search: `?world=${world.id}`};
      let saved;
      await withBrowser(entry, html, options, app => {
        assert.equal(app.text('world-name'), world.label);
        app.tap(3);
        saved = app.export();
        assert.equal(JSON.parse(saved).banked, 3);
        assert.deepEqual(app.saved(world.id), JSON.parse(saved));
        app.import('{invalid JSON');
        assert.equal(app.export(), saved);
        assert.deepEqual(app.saved(world.id), JSON.parse(saved));
      });
      await withBrowser(entry, html, {...options, entries: [[storageKey(world.id), saved]]}, app => {
        assert.equal(JSON.parse(app.export()).banked, 3);
        app.tap();
        assert.equal(app.saved(world.id).banked, 4);
      });
    });
  }
});
