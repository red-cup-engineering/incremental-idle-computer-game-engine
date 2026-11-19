#!/usr/bin/env node
/** Generate the game catalog through the shared JSNode producer from authored design data. */
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { projectJsnodeModules } from '@red-cup-engineering/jsnode-package-engineering-services-section/project-jsnode-modules';
import { defineWorld } from '../src/engine.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOG_PATH = 'design/world-catalog.json';
export const SCHEMA_PATH = 'design/world-catalog.schema.json';
export const GENERATED_PATH = 'src/generated/world-definitions.mjs';
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const decode = bytes => new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);

async function producerIdentity() {
  const specifiers = [
    '@red-cup-engineering/jsnode-package-engineering-services-section/project-jsnode-modules',
    '@red-cup-engineering/jsnode-package-engineering-services-section/project-jsnode-data-modules',
  ];
  const sources = await Promise.all(specifiers.map(async specifier => ({
    specifier, digest: digest(await readFile(fileURLToPath(import.meta.resolve(specifier)))),
  })));
  return {package: '@red-cup-engineering/jsnode-package-engineering-services-section', sources};
}

/** Capture and admit one design snapshot, producing source without any writes. */
export async function projectWorlds({root = repositoryRoot} = {}) {
  const sourceRoot = resolve(root);
  const [catalogBytes, schemaBytes] = await Promise.all([
    readFile(join(sourceRoot, CATALOG_PATH)),
    readFile(join(sourceRoot, SCHEMA_PATH)),
  ]);
  const catalog = JSON.parse(decode(catalogBytes));
  const schema = JSON.parse(decode(schemaBytes));
  // The shared producer admits the structural schema before any game-specific reads.
  const files = projectJsnodeModules({
    operations: [],
    dataModules: [{path: GENERATED_PATH, exports: [{name: 'WORLD_DEFINITIONS', value: catalog, schema}]}],
  });
  const ids = new Set();
  for (const definition of catalog) {
    const world = defineWorld(definition);
    if (ids.has(world.id)) throw new TypeError(`duplicate world identity: ${world.id}`);
    ids.add(world.id);
  }
  return {
    files,
    producer: await producerIdentity(),
    design: [
      {path: CATALOG_PATH, digest: digest(catalogBytes)},
      {path: SCHEMA_PATH, digest: digest(schemaBytes)},
    ],
    generated: files.map(file => ({path: file.path, digest: digest(file.text)})),
  };
}

/** Check or materialize the single generated catalog after complete design admission. */
export async function generateWorlds({check = false, root = repositoryRoot} = {}) {
  const projected = await projectWorlds({root});
  const file = projected.files[0];
  if (projected.files.length !== 1 || file.path !== GENERATED_PATH) throw new Error('unexpected world projection paths');
  const destination = join(resolve(root), GENERATED_PATH);
  let current;
  try { current = await readFile(destination); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const changed = current === undefined || !current.equals(Buffer.from(file.text, 'utf8'));
  if (check && changed) throw new Error(`stale generated world source: ${GENERATED_PATH}; run npm run generate`);
  if (!check && changed) {
    await mkdir(dirname(destination), {recursive: true});
    const temporary = destination + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temporary, file.text, {encoding: 'utf8', flag: 'wx', mode: file.mode});
      await rename(temporary, destination);
    } finally { await rm(temporary, {force: true}); }
  }
  return {...projected, changed};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some(argument => argument !== '--check') || arguments_.length > 1) {
    console.error('Usage: node scripts/generate-worlds.mjs [--check]');
    process.exitCode = 1;
  } else {
    generateWorlds({check: arguments_.includes('--check')})
      .then(result => console.log(arguments_.includes('--check') ? 'World design and generated source agree.' : result.changed ? 'Generated world source from admitted design.' : 'World source already matches its design.'))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
