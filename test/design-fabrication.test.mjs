/** Contract tests for authored catalogs, generation and playable artifacts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateWorlds } from '../scripts/generate-worlds.mjs';
import { admitRun, advance, buyProducer, newRun, prestige, project, tap } from '../src/engine.mjs';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CATALOG = 'design/world-catalog.json';
const SCHEMA = 'design/world-catalog.schema.json';
const GENERATED = 'src/generated/world-definitions.mjs';
const T = 1_700_000_000_000;

const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const putJSON = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
// Authored data is the input contract, not a frozen copy of an earlier release.
const CATALOG_WORLDS = await readJSON(join(ROOT, CATALOG));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'idle-design-receiving-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['design', 'scripts', 'src']) {
    await cp(join(ROOT, directory), join(root, directory), { recursive: true });
  }
  await cp(join(ROOT, 'package.json'), join(root, 'package.json'));
  await symlink(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

async function snapshot(root, prefix = '') {
  const result = {};
  for (const entry of (await readdir(join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'node_modules') continue;
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) {
      result[`${path}/`] = 'directory';
      Object.assign(result, await snapshot(root, path));
    } else if (entry.isFile()) {
      const bytes = await readFile(join(root, path));
      const info = await stat(join(root, path), { bigint: true });
      result[path] = { sha256: createHash('sha256').update(bytes).digest('hex'), mtimeNs: String(info.mtimeNs) };
    } else {
      result[path] = 'other';
    }
  }
  return result;
}

async function assertRefusesWithoutWriting(root) {
  const before = await snapshot(root);
  await assert.rejects(generateWorlds({ root }));
  assert.deepEqual(await snapshot(root), before, 'invalid source must not alter, remove, or create files');
}

async function buyFirstProducer(world) {
  const first = world.producers[0];
  let state = newRun(world, T);
  for (let n = 0; n < first.baseCost; n++) state = tap(world, state, T).state;
  const purchase = buyProducer(world, state, first.id, 1, T);
  assert.equal(purchase.accepted, true);
  assert.equal(purchase.state.banked, 0);
  assert.equal(purchase.state.producers[first.id], 1);
  return purchase.state;
}

test('generated modules receive the complete authored catalog without loss or reordering', async () => {
  const schema = await readJSON(join(ROOT, SCHEMA));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  const { WORLD_DEFINITIONS } = await import('../src/generated/world-definitions.mjs');
  const { WORLDS, worldById } = await import('../src/worlds.mjs');
  assert.deepEqual(WORLD_DEFINITIONS, CATALOG_WORLDS);
  assert.deepEqual(WORLDS, CATALOG_WORLDS);
  for (const world of WORLDS) assert.equal(worldById(world.id), world);
});

test('generation is deterministic across roots and no-op on unchanged admitted design', async t => {
  const root = await fixture(t);
  const other = await fixture(t);
  for (const location of [root, other]) await rm(join(location, GENERATED), { force: true });
  assert.equal((await generateWorlds({ root })).changed, true);
  assert.equal((await generateWorlds({ root: other })).changed, true);
  assert.equal(await readFile(join(root, GENERATED), 'utf8'), await readFile(join(other, GENERATED), 'utf8'));
  const before = await snapshot(root);
  assert.equal((await generateWorlds({ root })).changed, false);
  assert.deepEqual(await snapshot(root), before, 'idempotent regeneration must preserve unchanged files');
  assert.equal((await generateWorlds({ root, check: true })).changed, false);
  assert.deepEqual(await snapshot(root), before, 'check mode must not write');
});

for (const [name, mutate] of [
  ['empty catalog', () => []],
  ['non-array catalog', () => ({ worlds: CATALOG_WORLDS })],
  ['duplicate world identity', worlds => { worlds[1].id = worlds[0].id; }],
  ['duplicate producer identity', worlds => { worlds[0].producers[1].id = worlds[0].producers[0].id; }],
  ['producer and upgrade identity collision', worlds => { worlds[0].upgrades[0].id = worlds[0].producers[0].id; }],
  ['negative price', worlds => { worlds[0].producers[0].baseCost = -1; }],
  ['fractional production', worlds => { worlds[0].producers[0].ratePerSecond = 0.5; }],
  ['oversized unsafe integer', worlds => { worlds[0].producers[0].baseCost = 9007199254740992; }],
  ['zero offline cap', worlds => { worlds[0].offlineCapSeconds = 0; }],
  ['excessive offline cap', worlds => { worlds[0].offlineCapSeconds = 86401; }],
  ['missing required field', worlds => { delete worlds[0].unit; }],
  ['unknown world field', worlds => { worlds[0].outputPath = '../../unowned.mjs'; }],
  ['unknown producer field', worlds => { worlds[0].producers[0].price = 1; }],
  ['unknown upgrade effect', worlds => { worlds[0].upgrades[0].effect = 'currency'; }],
  ['empty label', worlds => { worlds[0].producers[0].label = '   '; }],
  ['traversing world identity', worlds => { worlds[0].id = '../escape'; }],
  ['no unlocked starting producer', worlds => { for (const row of worlds[0].producers) row.unlockAt = 1; }],
  ['too many producers', worlds => { worlds[0].producers = Array.from({ length: 17 }, (_, n) => ({ ...worlds[0].producers[0], id: `producer-${n}` })); }],
]) {
  test(`design admission refuses ${name} before any output write`, async t => {
    const root = await fixture(t);
    const worlds = structuredClone(CATALOG_WORLDS);
    const replacement = mutate(worlds);
    await putJSON(join(root, CATALOG), replacement === undefined ? worlds : replacement);
    await assertRefusesWithoutWriting(root);
  });
}

for (const [name, path, bytes] of [
  ['malformed catalog JSON', CATALOG, '[{"id":'],
  ['malformed schema JSON', SCHEMA, '{"type":'],
  ['invalid JSON Schema vocabulary', SCHEMA, JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'not-a-json-schema-type' })],
]) {
  test(`generation refuses ${name} without replacing the last valid artifact`, async t => {
    const root = await fixture(t);
    await writeFile(join(root, path), bytes);
    await assertRefusesWithoutWriting(root);
  });
}

for (const rate of [2, 7, 41, 101]) test(`authored production rate ${rate} changes income without changing other worlds`, async t => {
  const root = await fixture(t);
  const worlds = structuredClone(CATALOG_WORLDS);
  worlds[0].producers[0].ratePerSecond = rate;
  await putJSON(join(root, CATALOG), worlds);
  assert.equal((await generateWorlds({ root })).changed, true);
  const { WORLDS } = await import(pathToFileURL(join(root, 'src/worlds.mjs')).href);
  assert.equal(WORLDS[0].producers[0].ratePerSecond, rate);
  assert.deepEqual(WORLDS.slice(1), CATALOG_WORLDS.slice(1));
  const state = await buyFirstProducer(WORLDS[0]);
  assert.equal(advance(WORLDS[0], state, T + 10_000).gained, 10 * rate);
});

test('an additional admitted world becomes playable without editing runtime source', async t => {
  const root = await fixture(t);
  const worlds = structuredClone(CATALOG_WORLDS);
  worlds.push({ ...structuredClone(worlds[0]), id: 'tidal-workshop', label: 'Tidal Workshop', unit: 'patterns', verb: 'Trace a pattern' });
  await putJSON(join(root, CATALOG), worlds);
  const consumerBefore = await readFile(join(root, 'src/worlds.mjs'), 'utf8');
  await generateWorlds({ root });
  const { WORLDS, worldById } = await import(pathToFileURL(join(root, 'src/worlds.mjs')).href);
  assert.equal(WORLDS.length, worlds.length);
  const world = worldById('tidal-workshop');
  assert.deepEqual(world, worlds.at(-1));
  assert.equal(advance(world, await buyFirstProducer(world), T + 20_000).gained, 20 * world.producers[0].ratePerSecond);
  assert.equal(await readFile(join(root, 'src/worlds.mjs'), 'utf8'), consumerBefore);
});

test('authored text is received as literal data through generated JavaScript', async t => {
  const root = await fixture(t);
  const worlds = structuredClone(CATALOG_WORLDS);
  const literal = "Quotes '\" and slash \\; `template ${notAnExpression}`; line\u2028separator";
  worlds[0].label = literal;
  await putJSON(join(root, CATALOG), worlds);
  await generateWorlds({ root });
  const { WORLD_DEFINITIONS } = await import(pathToFileURL(join(root, GENERATED)).href);
  assert.equal(WORLD_DEFINITIONS[0].label, literal);
});

for (const stale of ['missing', 'edited-source', 'edited-design']) {
  test(`check and CLI refuse ${stale} projection without modifying any file`, async t => {
    const root = await fixture(t);
    if (stale === 'missing') await rm(join(root, GENERATED), { force: true });
    if (stale === 'edited-source') await writeFile(join(root, GENERATED), 'export const WORLD_DEFINITIONS = [];\n');
    if (stale === 'edited-design') {
      const worlds = structuredClone(CATALOG_WORLDS);
      worlds[0].prestigeThreshold += 1;
      await putJSON(join(root, CATALOG), worlds);
    }
    const before = await snapshot(root);
    await assert.rejects(generateWorlds({ root, check: true }));
    await assert.rejects(exec(process.execPath, ['scripts/generate-worlds.mjs', '--check'], { cwd: root, timeout: 30_000 }), error => {
      assert.equal(typeof error.code, 'number');
      assert.notEqual(error.code, 0);
      return true;
    });
    assert.deepEqual(await snapshot(root), before);
  });
}

test('a stale generated module blocks the actual static publisher before output effects', async t => {
  const root = await fixture(t);
  await writeFile(join(root, GENERATED), 'export const WORLD_DEFINITIONS = [];\n');
  const { build } = await import(pathToFileURL(join(root, 'scripts/build.mjs')).href);
  const out = join(root, 'must-not-exist');
  const before = await snapshot(root);
  await assert.rejects(build(out));
  assert.deepEqual(await snapshot(root), before, 'refused build must leave all input and output paths unchanged');
  await assert.rejects(stat(out), { code: 'ENOENT' });
});

test('regenerated game survives the real static build and browser ESM module graph', async t => {
  const root = await fixture(t);
  await generateWorlds({ root });
  const { build } = await import(pathToFileURL(join(root, 'scripts/build.mjs')).href);
  const out = join(root, 'received-site');
  await build(out);
  const { WORLDS } = await import(pathToFileURL(join(out, 'assets/worlds.mjs')).href);
  const builtEngine = await import(pathToFileURL(join(out, 'assets/engine.mjs')).href);
  assert.deepEqual(WORLDS, CATALOG_WORLDS);
  for (const world of WORLDS) {
    const outcome = builtEngine.tap(world, builtEngine.newRun(world, T), T);
    assert.equal(outcome.accepted, true);
    assert.equal(outcome.state.banked, 1);
  }
});

for (const [index, authored] of CATALOG_WORLDS.entries()) {
  test(`generated ${CATALOG_WORLDS[index].id} completes purchase, capped offline return, save and prestige`, async () => {
    const { WORLDS } = await import('../src/worlds.mjs');
    const world = WORLDS[index];
    const purchaseState = await buyFirstProducer(world);
    const returned = advance(world, purchaseState, T + (world.offlineCapSeconds + 123) * 1000);
    assert.equal(returned.gained, world.offlineCapSeconds * authored.producers[0].ratePerSecond);
    assert.equal(returned.seconds, world.offlineCapSeconds);
    assert.equal(returned.discardedSeconds, 123);
    const raw = JSON.stringify(returned.state);
    const saved = admitRun(world, JSON.parse(raw));
    assert.deepEqual(saved, returned.state, 'save admission preserves earned progress');
    assert.equal(advance(world, saved, saved.lastMs).gained, 0, 'return cannot pay capped history twice');
    for (const other of WORLDS.filter(candidate => candidate.id !== world.id)) {
      assert.throws(() => admitRun(other, JSON.parse(raw)), /another world/);
    }
    const expectedSparks = Math.floor(Math.sqrt(saved.runProduced / authored.prestigeThreshold));
    const result = prestige(world, saved, saved.lastMs);
    assert.equal(result.accepted, true);
    assert.equal(result.awarded, expectedSparks);
    assert.equal(result.state.banked, 0);
    assert.equal(result.state.runProduced, 0);
    assert.equal(result.state.allTime, saved.allTime);
    assert.equal(result.state.taps, saved.taps);
    assert.deepEqual(result.state.producers, Object.fromEntries(authored.producers.map(({id}) => [id, 0])));
    assert.deepEqual(result.state.upgrades, Object.fromEntries(authored.upgrades.map(({id}) => [id, false])));
    assert.equal(project(world, result.state, result.state.lastMs).tapYield, 1 + expectedSparks);
  });
}
