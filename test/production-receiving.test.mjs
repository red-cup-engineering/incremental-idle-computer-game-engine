import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateWorlds } from '../scripts/generate-worlds.mjs';
import { withBrowser, storageKey } from './helpers/browser-harness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const now = 1_793_797_200_000;
const exact = new Intl.NumberFormat('en', {maximumFractionDigits: 0});
const cases = [
  [100000000000099, 1, 101000000000099],
  [100000000000100, 261, 361000000000361],
  [847457627118644, 18, 999999999999999]
];

for (const [rate, bonus, expected] of cases) test(`authored ${rate}/${bonus} reaches source and built browser save/reload`, async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'idle-production-consumer-'));
  t.after(() => rm(fixture, {recursive: true, force: true}));
  // Exercise the supported authored-design generator, then the real publisher.
  // The shipped design and outputs remain untouched; only this fixture changes.
  for (const directory of ['src', 'scripts', 'design']) {
    await cp(join(root, directory), join(fixture, directory), {recursive: true});
  }
  await symlink(await realpath(join(root, 'node_modules')), join(fixture, 'node_modules'), 'dir');
  const catalogPath = join(fixture, 'design/world-catalog.json');
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  catalog[0].producers[0].ratePerSecond = rate;
  const upgrade = catalog[0].upgrades.find(u => u.effect === 'production');
  upgrade.amount = bonus;
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  await generateWorlds({root: fixture});
  const {build} = await import(pathToFileURL(join(fixture, 'scripts/build.mjs')).href);
  const out = join(fixture, 'dist');
  await build(out);
  const html = await readFile(join(out, 'index.html'), 'utf8');
  const {WORLDS} = await import(pathToFileURL(join(fixture, 'src/worlds.mjs')).href);
  const {newRun, MAX_POINTS} = await import(pathToFileURL(join(fixture, 'src/engine.mjs')).href);
  const world = WORLDS[0], initial = newRun(world, now);
  initial.producers[world.producers[0].id] = 1;
  initial.upgrades[upgrade.id] = true;
  for (const entry of [join(fixture, 'src/browser.mjs'), join(out, 'assets/browser.mjs')]) {
    let saved;
    await withBrowser(entry, html, {now, entries: [[storageKey(world.id), JSON.stringify(initial)]]}, app => {
      assert.deepEqual(JSON.parse(app.export()), initial, 'restoring preserves admitted existing progress');
      app.tick(1000);
      saved = {...initial, lastMs: now + 1000, banked: expected, runProduced: expected, allTime: expected};
      assert.deepEqual(JSON.parse(app.export()), saved, 'browser credits exact production');
      assert.deepEqual(app.saved(world.id), saved, 'exact amount reaches the real save path');
      app.choose(WORLDS[1].label); app.choose(world.label);
      assert.deepEqual(JSON.parse(app.export()), saved, 'world switch retains exact production');
    });
    await withBrowser(entry, html, {now: now + 1000, entries: [[storageKey(world.id), JSON.stringify(saved)]]}, app => {
      assert.deepEqual(JSON.parse(app.export()), saved, 'reload neither recredits nor revises prior totals');
      app.tick(999);
      assert.deepEqual(JSON.parse(app.export()), saved);
      app.tick(1);
      assert.equal(JSON.parse(app.export()).banked, Math.min(MAX_POINTS, expected * 2));
      const unboosted = {...initial, lastMs: now + 2000, banked: upgrade.cost, runProduced: MAX_POINTS, allTime: MAX_POINTS,
        upgrades: {...initial.upgrades, [upgrade.id]: false}};
      app.import(JSON.stringify(unboosted));
      const index = world.upgrades.findIndex(u => u.id === upgrade.id);
      const row = app.get('upgrades').children[index];
      const preview = row.children[0].children.find(n => n.className === 'purchase-preview').textContent;
      assert.match(preview, new RegExp(`${exact.format(expected - rate).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} / sec`),
        'native upgrade preview uses the exact rate difference');
      row.children[1].click();
      assert.equal(JSON.parse(app.export()).upgrades[upgrade.id], true);
      app.tick(1000);
      assert.equal(JSON.parse(app.export()).banked, expected, 'real upgrade click and timer share the exact rule');
    });
  }
});
