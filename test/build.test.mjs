import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from '../scripts/build.mjs';

test('native publisher produces a self-contained, offline-capable two-world browser app',async()=>{
  const out=await mkdtemp(join(tmpdir(),'little-worlds-'));
  try {
    const result=await build(out);
    assert.equal(result.files.length,9);
    const html=await readFile(join(out,'index.html'),'utf8');
    for(const id of ['tap','prestige','producers','upgrades','export','import','reset','status']) assert.match(html,new RegExp(`id="${id}"`));
    assert.match(html,/No ads, accounts, analytics/);
    const engine=await readFile(join(out,'assets','engine.mjs'),'utf8');
    assert.match(engine,/from '\.\/discrete-clock\.mjs'/);
    const js=await import(pathToFileURL(join(out,'assets','worlds.mjs')).href);
    assert.deepEqual(js.WORLDS.map(w=>w.id),['trace-garden','pocket-observatory']);
    const runtime=await import(pathToFileURL(join(out,'assets','engine.mjs')).href);
    const activeWorld=runtime.defineWorld({...js.WORLDS[0],offlineCapSeconds:60});
    const start=runtime.newRun(activeWorld,137);
    const active=runtime.advanceActive(activeWorld,{...start,producers:{...start.producers,pencil:1}},637,60637);
    assert.equal(active.gained,60);assert.equal(active.seconds,60);assert.equal(active.discardedSeconds,0);
    assert.equal(active.state.lastMs,60137);
    assert.equal(runtime.advanceActive(activeWorld,active.state,60637,61137).gained,1);
    assert.throws(()=>runtime.advanceActive(activeWorld,start,137,60138),/time cap/);
    const forecast=runtime.forecastProduction(activeWorld,{...start,producers:{...start.producers,pencil:1}},2,637,2637);
    assert.deepEqual(forecast,{missing:2,rate:1,waitMs:1500,reachable:true,readyAtMs:2137});
    assert.equal(runtime.advanceActive(activeWorld,{...start,producers:{...start.producers,pencil:1}},637,forecast.readyAtMs).state.banked,2);
    const headers=await readFile(join(out,'_headers'),'utf8');
    assert.match(headers,/connect-src 'none'/);
    const receipt=JSON.parse(await readFile(join(out,'fabrication-receipt.json'),'utf8'));
    assert.equal(receipt.kind,'561.incremental-idle-fabrication-receipt/v1');
    assert.equal(receipt.design.length,2);
    assert.equal(receipt.generated[0].path,'src/generated/world-definitions.mjs');
    for (const artifact of receipt.artifacts) {
      const bytes=await readFile(join(out,artifact.path));
      assert.equal(artifact.digest,'sha256:'+createHash('sha256').update(bytes).digest('hex'));
    }
  } finally {await rm(out,{recursive:true,force:true});}
});
