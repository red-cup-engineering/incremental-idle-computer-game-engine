#!/usr/bin/env node
/** Static publisher for the actual browser game, not a second HTTP host. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { generateWorlds } from './generate-worlds.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const supplier='@red-cup-engineering/computer-data-engineering-services-section/simulation/discrete-clock';
const saveSupplier='@red-cup-engineering/computer-game-systems-engineering-services-section/verified-save-write';
const src=path=>join(root,'src',path);

export async function build(out = join(root,'dist')) {
  const dest=resolve(out);
  // Capture and check the authored design before producing any build output.
  const fabrication=await generateWorlds({check:true,root});
  const engine=await readFile(src('engine.mjs'),'utf8');
  if (!engine.includes(`'${supplier}'`)) throw new Error('game engine must import canonical data clock');
  const assets=await Promise.all(['worlds.mjs','style.css'].map(async name=>[name,await readFile(src(name))]));
  const browser=await readFile(src('browser.mjs'),'utf8');
  if (!browser.includes(`'${saveSupplier}'`)) throw new Error('browser custody must use its declared save supplier');
  const saveWriter=await readFile(fileURLToPath(import.meta.resolve(saveSupplier)));
  const clock=await readFile(fileURLToPath(import.meta.resolve(supplier)));
  await mkdir(join(dest,'assets','generated'),{recursive:true});
  await writeFile(join(dest,'assets','engine.mjs'),engine.replace(`'${supplier}'`,`'./discrete-clock.mjs'`));
  for (const [name,bytes] of assets) await writeFile(join(dest,'assets',name),bytes);
  await writeFile(join(dest,'assets','browser.mjs'),browser.replace(`'${saveSupplier}'`,`'./verified-save-write.mjs'`));
  await writeFile(join(dest,'assets','verified-save-write.mjs'),saveWriter);
  await writeFile(join(dest,'assets','generated','world-definitions.mjs'),fabrication.files[0].text);
  await writeFile(join(dest,'assets','discrete-clock.mjs'),clock);
  await writeFile(join(dest,'index.html'),`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Two genuine browser idle games with deterministic progression, offline production and no financial rewards.">
<title>Little Worlds — Incremental Idle Games</title><link rel="stylesheet" href="./assets/style.css"></head>
<body><main><div class="eyebrow">561 Group · Little Worlds · Free local games</div>
<header class="hero"><div><h1 id="world-name">Little Worlds</h1><p class="lead" id="world-description">Two original incremental idle games.</p></div><aside>No paywalls. No wallets. Just little things growing.</aside></header>
<nav id="worlds" class="worlds" aria-label="Choose an idle game"></nav>
<div class="layout">
<section class="panel"><div class="eyebrow">Your progress</div><h2><span id="currency">Points</span> on hand</h2>
<div class="stats"><div class="stat"><strong id="banked">0</strong><span>Available</span></div><div class="stat"><strong id="rate">0 / sec</strong><span>Automatic production</span></div><div class="stat"><strong id="tap-yield">+1</strong><span>Manual yield</span></div><div class="stat"><strong id="run-produced">0</strong><span>Produced this run</span></div><div class="stat"><strong id="all-time">0</strong><span>All-time production</span></div><div class="stat"><strong id="prestige-points">0</strong><span>Permanent sparks</span></div></div>
<button type="button" id="tap" class="tap">Collect</button><p id="status" class="feedback" role="status" aria-live="polite"></p>
<div class="note"><strong>Replant / Prestige</strong><p>Trade this run for permanent sparks. Each spark makes later tapping and idle production stronger. Choose when to reset.</p><button type="button" class="secondary" id="prestige" aria-describedby="prestige-preview" disabled>Replant</button><p id="prestige-preview" class="purchase-preview"></p></div>
<section id="objectives-section" hidden><h2>Objectives this run</h2><p>Complete every objective as well as the production threshold to replant. Objectives reset each run.</p><ul id="objectives"></ul></section>
<p id="offline-rule" class="muted"></p></section>
<section class="panel"><div class="eyebrow">Build your world</div><h2>Producers</h2><p class="muted">Next-unit estimates assume the current automatic rate, with no further spending or manual actions. Buy 10 and Buy max purchase as many as affordable, up to 10 and 100 respectively. Batch previews show the quantity, exact total price and added automatic production available now. Each preview is a separate alternative; buying one changes the others.</p><div id="producers"></div><h2>Upgrades</h2><p class="muted">Affordable upgrade previews show the exact price and immediate gain per action or per second. Automatic gains use your current producers, bonuses and output limit, not just the listed percentage. Buying an upgrade changes the other previews.</p><div id="upgrades"></div></section>
<section class="panel wide"><div class="eyebrow">Own your local progress</div><h2>Save, move, or start fresh</h2><p>Your worlds save separately on this device. Export a copy if you want to keep them. Live runs stay available while switching worlds in this page, even if saving fails, but closing or reloading can lose unsaved changes. Use one tab per world. Import and confirmed reset replace this world's saved progress. You can cancel a pending reset, and choosing to play or import cancels it automatically. Exporting a backup and automatic production leave the confirmation open. Nothing here is cryptocurrency, a cash reward, or transferable value.</p><p id="save-status" class="feedback" role="status" aria-live="polite"></p>
<div class="tools"><button type="button" class="secondary" id="export">Export this world</button><button type="button" class="secondary" id="import">Import pasted save</button><button type="button" class="secondary" id="reset" aria-controls="cancel-reset" aria-expanded="false">Reset this world</button><button type="button" class="secondary" id="cancel-reset" hidden disabled>Cancel reset</button></div>
<label for="save-data">Save text (JSON)</label><textarea id="save-data" spellcheck="false" aria-label="Saved game JSON"></textarea></section>
</div><footer>Local-only play · No ads, accounts, analytics, financial transactions, or artificial players. Offline progress uses your device clock and can be changed by your device. Accessible by keyboard; reduced motion is respected.</footer>
</main><script type="module" src="./assets/browser.mjs"></script></body></html>\n`);
  await writeFile(join(dest,'_headers'),`/*\n  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`);
  const files=['index.html','assets/engine.mjs','assets/discrete-clock.mjs','assets/worlds.mjs','assets/generated/world-definitions.mjs','assets/browser.mjs','assets/verified-save-write.mjs','assets/style.css','_headers'];
  const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
  const manifest=await Promise.all(files.map(async path=>({path,digest:digest(await readFile(join(dest,path)))})));
  const receipt={kind:'561.incremental-idle-fabrication-receipt/v1',
    design:fabrication.design,generated:fabrication.generated,
    producer:fabrication.producer,
    supplier:{specifier:supplier,digest:digest(clock)},
    browserSupplier:{specifier:saveSupplier,digest:digest(saveWriter)},artifacts:manifest,
    receiving:'Deterministic design admission and static build; public deployment and player receiving are separate.'};
  await writeFile(join(dest,'fabrication-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  return {dest,files:[...files,'fabrication-receipt.json'],receipt};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const index=process.argv.indexOf('--out');
  build(index<0?undefined:process.argv[index+1]).then(({dest})=>console.log(`Built playable idle games: ${dest}`)).catch(error=>{console.error(error);process.exitCode=1;});
}
