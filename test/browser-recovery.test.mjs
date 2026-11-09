import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from '../scripts/build.mjs';
import { WORLDS, worldById } from '../src/worlds.mjs';
import { admitRun, newRun, tap, buyProducer, buyUpgrade } from '../src/engine.mjs';
import { withBrowser, storageKey } from './helpers/browser-harness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const now = 1_793_797_200_000;
const out = await mkdtemp(join(tmpdir(), 'idle-browser-recovery-'));
after(() => rm(out, { recursive: true, force: true }));
const built = await build(out);
const html = await readFile(join(out, 'index.html'), 'utf8');
const targets = [
  ['source browser', join(root, 'src/browser.mjs')],
  ['built browser', join(out, 'assets/browser.mjs')]
];
const gardenKey = storageKey('trace-garden');
const observatoryKey = storageKey('pocket-observatory');
const throwQuota = () => { throw new Error('Injected quota write failure'); };
const throwRead = () => { throw new Error('Injected storage read failure'); };
const writes = app => app.storage.calls.filter(call => call.operation === 'set');
const rawRun = (count, id = 'trace-garden') => {
  const world = worldById(id);
  let state = newRun(world, now);
  for (let i = 0; i < count; i++) state = tap(world, state, now).state;
  return JSON.stringify(state);
};
const warning = app => {
  assert.notEqual(app.text('save-status'), '', 'save warning remains visible');
  return app.text('save-status');
};
const checkBlockedDisplay = app => {
  for (const id of ['banked', 'rate', 'tap-yield', 'run-produced', 'all-time', 'prestige-points']) {
    assert.equal(app.text(id), 'Unavailable', `blocked #${id} cannot show another world's progress`);
  }
  assert.equal(app.get('tap').disabled, true);
  assert.equal(app.get('prestige').disabled, true);
  assert.equal(app.text('prestige'), 'Load a valid save to replant');
};
const checkRun = (app, count, id = 'trace-garden') => {
  const state = app.assertExportedBank(count);
  assert.equal(state.worldId, id);
  assert.deepEqual(admitRun(worldById(id), state), state);
  return state;
};

// The built entry must consume the actual supplier, not a test-only substitute.
test('browser publisher carries the canonical verified-save helper and persistent warning', async () => {
  const supplier = '@red-cup-engineering/computer-game-systems-engineering-services-section/verified-save-write';
  const supplierBytes = await readFile(fileURLToPath(import.meta.resolve(supplier)));
  assert.deepEqual(await readFile(join(out, 'assets/verified-save-write.mjs')), supplierBytes);
  assert.equal(built.receipt.browserSupplier.specifier, supplier);
  assert.equal(built.receipt.browserSupplier.digest, 'sha256:' + createHash('sha256').update(supplierBytes).digest('hex'));
  const browser = await readFile(join(root, 'src/browser.mjs'), 'utf8');
  assert.equal(await readFile(join(out, 'assets/browser.mjs'), 'utf8'), browser.replace(`'${supplier}'`, "'./verified-save-write.mjs'"));
  assert.match(html, /id="save-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /closing or reloading can lose unsaved changes/i);
  assert.ok(built.receipt.artifacts.some(artifact => artifact.path === 'assets/verified-save-write.mjs'));
});

for (const [name, entry] of targets) {
  test(`${name}: player custody and recovery`, async t => {
    const run = (options, callback) => withBrowser(entry, html, { now, ...options }, callback);

    await t.test('exports admitted live progress with failed reads/writes and retains a separate warning', () => run({}, app => {
      app.tap();
      app.storage.faults.beforeSet = throwQuota;
      app.tap(4);
      assert.equal(app.text('banked'), '5');
      assert.equal(app.saved().banked, 1);
      const beforeWarning = warning(app);
      const readsBeforeExport = app.storage.calls.filter(call => call.operation === 'get').length;
      app.storage.faults.beforeGet = throwRead;
      checkRun(app, 5);
      assert.equal(app.storage.calls.filter(call => call.operation === 'get').length, readsBeforeExport, 'healthy export never reads storage');
      assert.equal(app.text('save-status'), beforeWarning, 'ordinary export status cannot erase save warning');
      assert.equal(app.get('save-data').focused, true);
      assert.equal(app.get('save-data').selected, true);
      app.tap();
      checkRun(app, 6);
      warning(app);
    }));

    await t.test('keeps both worlds through repeated switches and retries a quota failure against unchanged bytes', () => run({}, app => {
      app.tap();
      app.storage.faults.beforeSet = throwQuota;
      app.tap(4);
      app.choose('Pocket Observatory');
      app.tap(3);
      checkRun(app, 3, 'pocket-observatory');
      app.choose('Trace Garden');
      checkRun(app, 5);
      app.choose('Pocket Observatory');
      checkRun(app, 3, 'pocket-observatory');
      app.choose('Trace Garden');
      checkRun(app, 5);
      assert.match(warning(app), /Trace Garden/);
      assert.match(warning(app), /Pocket Observatory/);
      delete app.storage.faults.beforeSet;
      app.tick(0);
      assert.equal(app.saved().banked, 5);
      app.choose('Pocket Observatory');
      assert.equal(app.saved('pocket-observatory').banked, 3);
      assert.equal(app.text('save-status'), '');
      app.choose('Trace Garden');
      checkRun(app, 5);
      assert.equal(app.saved().taps, 5, 'switches do not mint duplicate manual actions');
    }));

    await t.test('fresh app receives a successfully retried save with full native inventory', async () => {
      let received;
      await run({}, app => {
        app.tap(60);
        const world = WORLDS[0];
        let state = JSON.parse(app.export());
        state = buyProducer(world, state, world.producers[0].id, 1, now).state;
        state = buyUpgrade(world, state, world.upgrades[0].id, now).state;
        app.import(JSON.stringify(state));
        app.storage.faults.beforeSet = throwQuota;
        app.tap();
        const live = JSON.parse(app.export());
        assert.equal(live.producers.pencil, 1);
        assert.equal(live.upgrades.ink, true);
        delete app.storage.faults.beforeSet;
        app.tick(0);
        assert.deepEqual(app.saved(), live);
        received = app.storage.data.get(gardenKey);
      });
      await run({ entries: [[gardenKey, received]] }, app => {
        assert.deepEqual(JSON.parse(app.export()), JSON.parse(received));
        assert.equal(app.get('tap').disabled, false);
        assert.equal(app.text('save-status'), '');
      });
    });

    await t.test('protects externally changed bytes before auto-write while keeping a local export', () => run({}, app => {
      app.tap(5);
      const external = rawRun(9);
      app.storage.data.set(gardenKey, external);
      const before = writes(app).length;
      app.tap();
      checkRun(app, 6);
      assert.equal(app.storage.data.get(gardenKey), external);
      assert.equal(writes(app).length, before, 'preflight conflict prevents an attempted write');
      assert.match(warning(app), /paused/);
      app.choose('Pocket Observatory');
      app.choose('Trace Garden');
      checkRun(app, 6);
      assert.equal(app.storage.data.get(gardenKey), external);
      // Explicit verified import, unlike autosave, authorizes replacing storage.
      app.import(rawRun(4));
      checkRun(app, 4);
      assert.equal(app.saved().banked, 4);
      assert.equal(app.text('save-status'), '');
    }));

    await t.test('latches readback mismatch without overwriting the observed external version', () => run({}, app => {
      app.tap();
      const external = rawRun(9);
      app.storage.faults.afterSet = (operation, data) => data.set(operation.key, external);
      const before = writes(app).length;
      app.tap();
      assert.equal(writes(app).length, before + 1, 'render does not repeat a mismatched write');
      checkRun(app, 2);
      assert.equal(app.storage.data.get(gardenKey), external);
      assert.match(warning(app), /paused/);
      delete app.storage.faults.afterSet;
      app.tap();
      checkRun(app, 3);
      assert.equal(writes(app).length, before + 1, 'mismatch remains paused after the injected fault is removed');
      assert.equal(app.storage.data.get(gardenKey), external);
    }));

    await t.test('read error after write retains live play and later detects changed expected bytes', () => run({}, app => {
      app.tap();
      app.storage.faults.afterSet = () => { app.storage.faults.beforeGet = throwRead; };
      app.tap();
      checkRun(app, 2);
      assert.equal(app.saved().banked, 2, 'write occurred even though readback failed');
      warning(app);
      delete app.storage.faults.afterSet;
      delete app.storage.faults.beforeGet;
      const before = writes(app).length;
      app.tap();
      checkRun(app, 3);
      assert.equal(writes(app).length, before, 'changed bytes after an uncertain write require explicit replacement');
      assert.equal(app.saved().banked, 2);
      assert.match(warning(app), /paused/);
    }));

    await t.test('write-then-throw is treated as uncertain, not proof that the previous save survived', () => run({}, app => {
      app.tap();
      app.storage.faults.afterSet = () => { throw new Error('Adversarial post-mutation exception'); };
      app.tap();
      checkRun(app, 2);
      assert.equal(app.saved().banked, 2);
      warning(app);
      delete app.storage.faults.afterSet;
      const before = writes(app).length;
      app.tap();
      assert.equal(writes(app).length, before);
      checkRun(app, 3);
      assert.equal(app.saved().banked, 2);
      assert.match(warning(app), /paused/);
    }));

    await t.test('blocked corrupt bytes remain exact and exportable through read failure and world switches', () => {
      const corrupt = ' \n{ malformed ORIGINAL save bytes \t';
      return run({ entries: [[gardenKey, corrupt]] }, app => {
        checkBlockedDisplay(app);
        assert.equal(writes(app).length, 0);
        app.storage.faults.beforeGet = throwRead;
        assert.equal(app.export(), corrupt);
        assert.match(app.text('status'), /original|unreadable/i);
        delete app.storage.faults.beforeGet;
        app.choose('Pocket Observatory');
        app.tap(3);
        app.choose('Trace Garden');
        assert.equal(app.export(), corrupt);
        checkBlockedDisplay(app);
        app.import('{invalid too');
        assert.equal(app.storage.data.get(gardenKey), corrupt);
        assert.equal(app.export(), corrupt);
        app.import(rawRun(4));
        assert.equal(app.get('tap').disabled, false);
        checkRun(app, 4);
        app.choose('Pocket Observatory');
        checkRun(app, 3, 'pocket-observatory');
        app.choose('Trace Garden');
        checkRun(app, 4);
      });
    });

    await t.test('blocked unknown storage never exports an invented empty run', () => run({ faults: { beforeGet: throwRead } }, app => {
      checkBlockedDisplay(app);
      app.get('save-data').value = 'keep my recovery text';
      assert.equal(app.export(), 'keep my recovery text');
      delete app.storage.faults.beforeGet;
      assert.equal(app.export(), 'keep my recovery text', 'missing raw bytes are not a valid run');
      assert.match(app.text('status'), /unavailable|no replacement|no.*export/i);
      assert.equal(writes(app).length, 0);
      checkBlockedDisplay(app);
    }));

    await t.test('invalid and wrong-world imports do not write or replace live progress', () => run({}, app => {
      app.tap(5);
      const original = app.storage.data.get(gardenKey);
      for (const candidate of ['{bad', rawRun(3, 'pocket-observatory'), JSON.stringify({ ...JSON.parse(original), kind: 'unrecognized' }), JSON.stringify({ ...JSON.parse(original), banked: -1 })]) {
        const before = writes(app).length;
        app.import(candidate);
        assert.match(app.text('status'), /refused/i);
        assert.equal(writes(app).length, before);
        assert.equal(app.storage.data.get(gardenKey), original);
        checkRun(app, 5);
      }
    }));

    for (const failure of ['before-write', 'after-write-read', 'readback-mismatch', 'write-then-throw']) {
      await t.test(`failed import (${failure}) retains prior live run without false unchanged claim`, () => run({}, app => {
        app.tap(5);
        const external = rawRun(9);
        if (failure === 'before-write') app.storage.faults.beforeSet = throwQuota;
        if (failure === 'after-write-read') app.storage.faults.beforeGet = throwRead;
        if (failure === 'readback-mismatch') app.storage.faults.afterSet = (operation, data) => data.set(operation.key, external);
        if (failure === 'write-then-throw') app.storage.faults.afterSet = () => { throw new Error('Adversarial post-mutation exception'); };
        app.import(rawRun(3));
        assert.match(app.text('status'), /could not be verified/i);
        assert.match(app.text('status'), /storage may have changed/i);
        assert.doesNotMatch(app.text('status'), /original save has not been changed/i);
        assert.equal(app.get('tap').disabled, false);
        checkRun(app, 5);
        warning(app);
        assert.equal(app.saved().banked, failure === 'before-write' ? 5 : failure === 'readback-mismatch' ? 9 : 3);
        for (const key of Object.keys(app.storage.faults)) delete app.storage.faults[key];
        app.choose('Pocket Observatory');
        app.choose('Trace Garden');
        checkRun(app, 5);
        app.import(rawRun(4));
        checkRun(app, 4);
        assert.equal(app.saved().banked, 4);
        assert.equal(app.text('save-status'), '');
      }));
    }

    await t.test('verified import remains installed when a later render read fails', () => run({}, app => {
      app.tap(5);
      let reads = 0;
      app.storage.faults.beforeGet = () => { if (++reads > 1) throwRead(); };
      app.import(rawRun(3));
      assert.equal(app.get('tap').disabled, false);
      assert.equal(app.text('banked'), '3');
      assert.match(app.text('status'), /imported/i);
      checkRun(app, 3);
      assert.equal(app.saved().banked, 3);
      warning(app);
      delete app.storage.faults.beforeGet;
      app.tick(0);
      assert.equal(app.text('save-status'), '');
    }));

    await t.test('reset is confirmed, verified, isolated, and cannot resurrect the old draft', () => run({}, app => {
      app.tap(5);
      app.choose('Pocket Observatory');
      app.tap(3);
      app.choose('Trace Garden');
      const before = writes(app).length;
      app.click('reset');
      assert.equal(writes(app).length, before);
      checkRun(app, 5);
      app.storage.faults.beforeSet = throwQuota;
      app.click('confirm-reset');
      assert.match(app.text('status'), /reset could not be verified/i);
      checkRun(app, 5);
      assert.equal(app.saved().banked, 5);
      delete app.storage.faults.beforeSet;
      app.click('confirm-reset');
      checkRun(app, 0);
      assert.equal(app.saved().banked, 0);
      assert.equal(app.text('save-status'), '');
      app.choose('Pocket Observatory');
      checkRun(app, 3, 'pocket-observatory');
      app.choose('Trace Garden');
      checkRun(app, 0);
      assert.equal(app.storage.calls.some(call => call.operation === 'remove'), false, 'reset is a verified replacement, not remove-and-reload');
      assert.equal(app.storage.data.has(observatoryKey), true);
    }));

    for (const failure of ['after-write-read', 'readback-mismatch', 'write-then-throw']) {
      await t.test(`failed confirmed reset (${failure}) keeps prior live run`, () => run({}, app => {
        app.tap(5);
        app.click('reset');
        if (failure === 'after-write-read') app.storage.faults.beforeGet = throwRead;
        if (failure === 'readback-mismatch') app.storage.faults.afterSet = (operation, data) => data.set(operation.key, rawRun(9));
        if (failure === 'write-then-throw') app.storage.faults.afterSet = () => { throw new Error('Adversarial post-mutation exception'); };
        app.click('confirm-reset');
        assert.match(app.text('status'), /reset could not be verified/i);
        assert.match(app.text('status'), /storage may have changed/i);
        checkRun(app, 5);
        assert.equal(app.get('tap').disabled, false);
        warning(app);
        assert.equal(app.saved().banked, failure === 'readback-mismatch' ? 9 : 0);
        for (const key of Object.keys(app.storage.faults)) delete app.storage.faults[key];
        app.choose('Pocket Observatory');
        app.choose('Trace Garden');
        checkRun(app, 5);
        app.click('reset');
        app.click('confirm-reset');
        checkRun(app, 0);
        assert.equal(app.saved().banked, 0);
      }));
    }

    await t.test('failed corrupt-save clear retains exact raw text, then verified clear permits play', () => {
      const corrupt = '{ original damaged save';
      return run({ entries: [[gardenKey, corrupt]] }, app => {
        app.click('reset');
        assert.equal(app.storage.data.get(gardenKey), corrupt);
        app.storage.faults.beforeSet = throwQuota;
        app.click('confirm-reset');
        checkBlockedDisplay(app);
        assert.equal(app.export(), corrupt);
        assert.equal(app.storage.data.get(gardenKey), corrupt);
        delete app.storage.faults.beforeSet;
        app.click('confirm-reset');
        checkRun(app, 0);
        assert.equal(app.get('tap').disabled, false);
        app.tap();
        checkRun(app, 1);
      });
    });

    await t.test('switch/return settles existing native capped production without replaying manual actions', () => {
      const world = WORLDS[0];
      let state = JSON.parse(rawRun(20));
      state = buyProducer(world, state, world.producers[0].id, 1, now).state;
      return run({ entries: [[gardenKey, JSON.stringify(state)]] }, app => {
        app.storage.faults.beforeSet = throwQuota;
        app.choose('Pocket Observatory');
        app.tick((world.offlineCapSeconds + 5) * 1000);
        app.choose('Trace Garden');
        const returned = JSON.parse(app.export());
        assert.equal(returned.banked, state.banked + world.offlineCapSeconds);
        assert.equal(returned.taps, state.taps);
        assert.deepEqual(returned.producers, state.producers);
        const bytes = app.export();
        app.choose('Pocket Observatory');
        app.choose('Trace Garden');
        assert.equal(app.export(), bytes, 'returning again at the same clock does not repeat production');
        warning(app);
      });
    });
  });
}
