import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';
import { WORLDS } from '../src/worlds.mjs';
import { MAX_POINTS, newRun } from '../src/engine.mjs';
import { withBrowser, storageKey } from './helpers/browser-harness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const now = 1_793_797_200_000;
const out = await mkdtemp(join(tmpdir(), 'idle-exact-price-'));
after(() => rm(out, {recursive: true, force: true}));
await build(out);
const html = await readFile(join(out, 'index.html'), 'utf8');
const cases = [
  [WORLDS[0], 'pencil', 189, 478468290980832],
  [WORLDS[0], 'loom', 112, 131018709961755],
  [WORLDS[1], 'antenna', 157, 363653538991968],
  [WORLDS[0], 'loom', 120, 832334085125218],
  [WORLDS[1], 'antenna', 162, 982849388410165]
];
const targets = [['source', join(root, 'src/browser.mjs')], ['built', join(out, 'assets/browser.mjs')]];

for (const [target, entry] of targets) for (const [world, id, owned, cost] of cases) {
  test(`${target}: ${id}/${owned} old save receives exact affordability, debit and reload`, async () => {
    const state = {...newRun(world, now), banked: cost - 1, runProduced: MAX_POINTS, allTime: MAX_POINTS};
    state.producers[id] = owned;
    const raw = JSON.stringify(state), search = `?world=${world.id}`;
    const index = world.producers.findIndex(p => p.id === id);
    const row = app => app.get('producers').children[index];
    const button = app => row(app).children[1].children.find(n => n.textContent === 'Buy 1');
    const ready = app => row(app).children[0].children.find(n => n.className === 'purchase-readiness').textContent;
    let saved;
    await withBrowser(entry, html, {now, search, entries: [[storageKey(world.id), raw]]}, app => {
      assert.deepEqual(JSON.parse(app.export()), state, 'restoring does not reprice past play');
      assert.equal(button(app).disabled, true);
      assert.equal(ready(app), `Next unit: 1 ${world.unit} short. About 1s at this rate.`);
      button(app).click();
      assert.deepEqual(JSON.parse(app.export()), state, 'one-point deficit cannot purchase');
      app.import(JSON.stringify({...state, banked: cost}));
      assert.equal(button(app).disabled, false);
      assert.equal(ready(app), 'Next unit: Ready now.');
      button(app).click();
      saved = {...state, banked: 0, producers: {...state.producers, [id]: owned + 1}};
      assert.deepEqual(JSON.parse(app.export()), saved);
      assert.deepEqual(app.saved(world.id), saved);
      const other = WORLDS.find(w => w.id !== world.id);
      app.choose(other.label); app.choose(world.label);
      assert.deepEqual(JSON.parse(app.export()), saved, 'world switching retains corrected debit');
    });
    await withBrowser(entry, html, {now, search, entries: [[storageKey(world.id), JSON.stringify(saved)]]}, app => {
      assert.deepEqual(JSON.parse(app.export()), saved, 'fresh module reload does not refund or debit again');
      assert.deepEqual(app.saved(world.id), saved);
      app.tick(1000);
      assert.equal(JSON.parse(app.export()).banked, world.producers[index].ratePerSecond * (owned + 1));
    });
  });
}
