import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = '@red-cup-engineering/incremental-idle-game';
const dataName = '@red-cup-engineering/computer-data-engineering-services-section';
const manifest = JSON.parse(await readFile(join(root, 'package.json')));
const dataRoot = dirname(fileURLToPath(import.meta.resolve(`${dataName}/package.json`)));
const dataManifest = JSON.parse(await readFile(join(dataRoot, 'package.json')));
const environment = {...process.env, NODE_PATH: ''};
delete environment.NODE_TEST_CONTEXT;
// Reporter flags are repeatable: preserve an inherited choice rather than add
// a second reporter without its matching destination (the native gate sets TAP).
const reporter = /(?:^|\s)--test-reporter(?:=|\s)/u.test(environment.NODE_OPTIONS ?? '')
  ? [] : ['--test-reporter=tap'];

async function temporary(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(directory, {recursive: true, force: true}));
  return directory;
}

async function receiveClock(directory) {
  assert.equal(dataManifest.name, dataName);
  assert.equal(dataManifest.version, manifest.dependencies[dataName]);
  // Copy the real, already installed supplier. No registry, installer, substitute
  // module or ambient symlink participates. This qualifies the selected entrance,
  // not a fresh installation of every entrance in Computer Data's package.
  await mkdir(join(directory, 'node_modules/@red-cup-engineering'), {recursive: true});
  await cp(dataRoot, join(directory, 'node_modules', dataName), {recursive: true});
}

function run(args, cwd) {
  const result = spawnSync(process.execPath, args, {
    cwd, env: environment, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  return result;
}

test('the original engine proofs execute with no title catalog, generator, browser or optional suppliers', async t => {
  const isolated = await temporary(t, 'idle-engine-only-');
  assert.match(manifest.scripts['test:engine'], /^node --test(?: test\/[a-z-]+\.test\.mjs)+$/u);
  const tests = manifest.scripts['test:engine'].split(' ').slice(2);
  const files = ['package.json', 'src/engine.mjs', 'src/transactions.mjs', ...tests,
    'test/fixtures/worlds.mjs', 'test/fixtures/world-definitions.json',
    'test/fixtures/objective-run.mjs', 'test/fixtures/world-admission-cases.mjs'];
  for (const file of files) {
    await mkdir(dirname(join(isolated, file)), {recursive: true});
    await cp(join(root, file), join(isolated, file));
  }
  await receiveClock(isolated);
  const result = run(['--test', ...reporter, ...tests], isolated);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const counts = [...result.stdout.matchAll(/^# tests (\d+)$/gmu)];
  assert.equal(counts.length, 1, result.stdout);
  assert.ok(Number(counts[0][1]) > 0, 'native source proofs must execute actual tests');
  assert.match(result.stdout, /^# fail 0$/mu);
  assert.match(result.stdout, /^# skipped 0$/mu);
  assert.match(result.stdout, /^# cancelled 0$/mu);

  // Negative control: a renewed dependency on the removed title world entrance
  // must break the same isolated proofs, rather than resolve from this checkout.
  await writeFile(join(isolated, 'test/fixtures/worlds.mjs'),
    "export {WORLDS, WORLD_DEFINITIONS} from '../../src/worlds.mjs';\n");
  const refused = run(['--test', ...reporter, tests[0]], isolated);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stdout + refused.stderr, /ERR_MODULE_NOT_FOUND/);
  assert.match(refused.stdout + refused.stderr, /src\/worlds\.mjs/);
});

test('the actual packed engine entrances receive caller-authored rules without title or tooling peers', async t => {
  const isolated = await temporary(t, 'idle-engine-packed-');
  const archive = await temporary(t, 'idle-engine-pack-');
  const packed = spawnSync('npm', ['pack', '--ignore-scripts', '--offline', '--json', '--pack-destination', archive, '--cache', join(archive, 'cache')], {
    cwd: root, env: environment, encoding: 'utf8', timeout: 120_000,
  });
  assert.ifError(packed.error);
  assert.equal(packed.status, 0, packed.stdout + packed.stderr);
  const [receipt] = JSON.parse(packed.stdout);
  assert.equal(receipt.name, name);
  assert.equal(receipt.version, manifest.version);
  assert.equal(receipt.filename, receipt.filename.split('/').at(-1));
  const packageRoot = join(isolated, 'node_modules', name);
  await mkdir(packageRoot, {recursive: true});
  const extracted = spawnSync('tar', ['-xzf', join(archive, receipt.filename), '--strip-components=1', '-C', packageRoot], {
    encoding: 'utf8', timeout: 30_000,
  });
  assert.ifError(extracted.error);
  assert.equal(extracted.status, 0, extracted.stdout + extracted.stderr);
  await receiveClock(isolated);
  await writeFile(join(isolated, 'consumer.mjs'), `
    import assert from 'node:assert/strict';
    import {defineWorld, newRun, tap, buyProducer, advanceActive, quoteProducerPurchase,
      forecastProduction, prestige, admitRun} from '${name}/engine';
    import {spendPoints} from '${name}/transactions';
    for (const optional of [
      '@red-cup-engineering/jsnode-package-services-section',
      '@red-cup-engineering/computer-game-systems-engineering-services-section',
    ]) assert.throws(() => import.meta.resolve(optional), {code: 'ERR_MODULE_NOT_FOUND'});
    const world = defineWorld({
      kind: '561.incremental-idle-world/v1', id: 'caller-rules', label: 'Caller rules',
      description: 'An independent engine consumer', unit: 'Marks', verb: 'Make a mark',
      offlineCapSeconds: 60, prestigeThreshold: 100,
      producers: [{id: 'worker', label: 'Worker', baseCost: 1, growthBasisPoints: 10000,
        ratePerSecond: 10, unlockAt: 0}],
      upgrades: [{id: 'practice', label: 'Practice', cost: 1, unlockAt: 0, effect: 'tap', amount: 1}],
    });
    let state = tap(world, newRun(world, 0), 0).state;
    const quote = quoteProducerPurchase(world, state, 'worker', 1);
    assert.equal(quote.accepted, true);
    state = buyProducer(world, state, 'worker', 1, 0).state;
    const forecast = forecastProduction(world, state, 100, 0, 10000);
    assert.equal(forecast.readyAtMs, 10000);
    state = advanceActive(world, state, 0, 10000).state;
    assert.equal(state.banked, 100);
    const debit = spendPoints(world, state, 3);
    assert.equal(debit.state.banked, 97);
    assert.equal(debit.state.runProduced, state.runProduced);
    assert.deepEqual(admitRun(world, JSON.parse(JSON.stringify(debit.state))), debit.state);
    const reset = prestige(world, debit.state, 10000);
    assert.equal(reset.accepted, true);
    assert.equal(reset.state.producers.worker, 0);
    assert.equal(reset.state.banked, 0);
    assert.equal(reset.state.prestige, 1);
  `);
  const received = run([join(isolated, 'consumer.mjs')], isolated);
  assert.equal(received.status, 0, received.stdout + received.stderr);
});
