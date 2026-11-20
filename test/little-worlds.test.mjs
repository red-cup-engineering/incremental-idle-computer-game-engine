import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { WORLDS } from '@red-cup-engineering/incremental-idle-computer-game-engine/worlds';
import { admitRun, newRun } from '@red-cup-engineering/incremental-idle-computer-game-engine/engine';
import { build } from '../scripts/build.mjs';

let output, html;
before(async () => {
  output = await mkdtemp(join(tmpdir(), 'little-worlds-'));
  await build(output);
  html = await readFile(join(output, 'index.html'), 'utf8');
});
after(async () => { if (output) await rm(output, { recursive: true, force: true }); });

for (const world of WORLDS) {
  test(world.label + ' progresses, resumes and admits backups through its built page', async (t) => {
    const page = new JSDOM(html, { url: 'https://games.example/?world=' + world.id });
    t.after(() => page.window.close());
    const { document, localStorage, location, history } = page.window;
    const id = (name) => document.getElementById(name);
    const key = '561-incremental-idle:' + world.id + ':v1';
    const saved = () => JSON.parse(localStorage.getItem(key));
    const browserModule = document.querySelector('script[type="module"][src]').getAttribute('src');
    const entry = pathToFileURL(join(output, browserModule));
    let now = 1_000_000;
    t.mock.method(Date, 'now', () => now);
    t.mock.method(globalThis, 'setInterval', () => 0);
    for (const [name, value] of Object.entries({ document, localStorage, location, history })) {
      Object.defineProperty(globalThis, name, { configurable: true, value });
      t.after(() => { delete globalThis[name]; });
    }

    await import(entry.href + '?open=' + world.id);
    assert.equal(id('world-name').textContent, world.label);
    const producer = world.producers[0];
    for (let n = 0; n < producer.baseCost; n++) id('tap').click();
    document.querySelector('[aria-label="Buy 1: ' + producer.label + '"]').click();
    assert.equal(saved().producers[producer.id], 1);
    assert.equal(saved().banked, 0);

    // A fresh page module must restore the persisted inventory and settle the offline cap.
    now += (world.offlineCapSeconds + 120) * 1000;
    const resumed = new JSDOM(html, { url: location.href });
    t.after(() => resumed.window.close());
    // A new document discards the old page's in-memory listeners and world slots.
    Object.defineProperty(globalThis, 'document', { configurable: true, value: resumed.window.document });
    await import(entry.href + '?resume=' + world.id);
    const control = (name) => resumed.window.document.getElementById(name);
    const balance = world.offlineCapSeconds * producer.ratePerSecond;
    assert.equal(saved().banked, balance);
    control('export').click();
    const backup = control('save-data').value;
    assert.deepEqual(admitRun(world, JSON.parse(backup)), saved());

    control('prestige').click();
    control('confirm-prestige').click();
    const reset = saved();
    assert.ok(reset.prestige > 0);
    assert.equal(reset.banked, 0);
    assert.equal(reset.runProduced, 0);
    assert.ok(reset.allTime >= balance);

    for (const invalid of [
      { ...reset, banked: 1 },
      newRun(WORLDS.find((other) => other.id !== world.id), now),
    ]) {
      control('save-data').value = JSON.stringify(invalid);
      control('import').click();
      assert.deepEqual(saved(), reset);
      assert.match(control('status').textContent, /Import refused/);
    }
    control('save-data').value = backup;
    control('import').click();
    assert.deepEqual(saved(), JSON.parse(backup));
  });
}
