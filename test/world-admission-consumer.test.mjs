import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as source from '../src/engine.mjs';
import { WORLD_DEFINITIONS } from '../src/generated/world-definitions.mjs';
import { build } from '../scripts/build.mjs';
import { generateWorlds } from '../scripts/generate-worlds.mjs';

import {definition, locations, identityCases, sparseCases} from './fixtures/world-admission-cases.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('published browser engine preserves world admission and existing worlds', async t => {
  const out = await mkdtemp(join(tmpdir(), 'idle-world-admission-build-'));
  t.after(() => rm(out, {recursive: true, force: true}));
  await build(out);
  const engine = await import(pathToFileURL(join(out, 'assets/engine.mjs')).href);
  identityCases(engine);
  sparseCases(engine);
  for (const input of WORLD_DEFINITIONS) {
    const world = engine.defineWorld(input);
    const saved = engine.tap(world, engine.newRun(world, 0), 1000).state;
    assert.equal(saved.worldId, input.id);
    assert.equal(saved.banked, 1);
    assert.deepEqual(engine.admitRun(world, JSON.parse(JSON.stringify(saved))), saved);
  }
});

test('authored schema and runtime both reject malformed identities without changing generated source', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'idle-world-admission-design-'));
  t.after(() => rm(fixture, {recursive: true, force: true}));
  for (const directory of ['design', 'src']) await cp(join(root, directory), join(fixture, directory), {recursive: true});
  const generated = join(fixture, 'src/generated/world-definitions.mjs');
  const previous = await readFile(generated);
  for (const [, select] of locations.slice(0, 3)) for (const value of [undefined, null, true]) {
    const world = definition();
    select(world).id = value;
    assert.throws(() => source.defineWorld(world), TypeError);
    await writeFile(join(fixture, 'design/world-catalog.json'), JSON.stringify([world]));
    await assert.rejects(generateWorlds({root: fixture}));
    assert.deepEqual(await readFile(generated), previous);
  }
});
