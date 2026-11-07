import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as e from '../src/engine.mjs';
import {WORLDS} from '../src/worlds.mjs';
import {generateWorlds} from '../scripts/generate-worlds.mjs';
import {withBrowser,storageKey} from './helpers/browser-harness.mjs';
const T=1700000000000;
const base=WORLDS[0];
const rules=[
  {id:'manual-practice',label:'Make two manual actions',action:'tap',count:2},
  {id:'build-tools',label:'Buy two pencils',action:'buy-producer',targetId:'pencil',count:2},
  {id:'improve-tools',label:'Install fresh ink',action:'buy-upgrade',targetId:'ink',count:1},
];
const world=e.defineWorld({...base,id:'objective-fixture',prestigeObjectives:rules});
const funded=(w=world)=>({...e.newRun(w,T),banked:10000,runProduced:10000,allTime:10000});
function complete(s=funded(),w=world) {
  s=e.tap(w,s,T).state;s=e.tap(w,s,T).state;
  s=e.buyProducer(w,s,'pencil',2,T).state;
  return e.buyUpgrade(w,s,'ink',T).state;
}
test('equal earnings but different objective progress produce different prestige eligibility',()=>{
  const completed=complete();
  const incomplete={...funded(),banked:completed.banked,runProduced:completed.runProduced,allTime:completed.allTime};
  assert.equal(e.availablePrestige(world,incomplete),0);
  assert.equal(e.prestige(world,incomplete,T).reason,'objectives-not-met');
  assert.equal(e.availablePrestige(world,completed),2);
  assert.equal(e.prestige(world,completed,T).awarded,2);
});
test('manual progress counts discrete actions, not their point yield',()=>{
  let s=e.buyUpgrade(world,funded(),'ink',T).state;
  s=e.tap(world,s,T).state;
  assert.equal(s.objectiveProgress['manual-practice'],1);
  assert.equal(s.runProduced,10005);
  s=e.tap(world,s,T).state;s=e.tap(world,s,T).state;
  assert.equal(s.objectiveProgress['manual-practice'],2);
});
test('bulk producer progress counts actual units and saturates without mutating inputs',()=>{
  const input=funded(), copy=structuredClone(input);
  const result=e.buyProducer(world,input,'pencil',10,T);
  assert.equal(result.count,10);
  assert.equal(result.state.objectiveProgress['build-tools'],2);
  assert.deepEqual(input,copy);
  assert.equal(e.admitRun(world,result.state).objectiveProgress['build-tools'],2);
  const poor={...funded(),banked:10};
  const partial=e.buyProducer(world,poor,'pencil',10,T);
  assert.equal(partial.count,1);assert.equal(partial.state.objectiveProgress['build-tools'],1);
});
test('refused, repeated and unrelated purchases cannot complete objectives',()=>{
  let s=e.newRun(world,T);
  for(const id of ['pencil','missing','press']) {
    const result=e.buyProducer(world,s,id,1,T);
    assert.equal(result.accepted,false);assert.deepEqual(result.state.objectiveProgress,s.objectiveProgress);
  }
  s=e.buyProducer(world,funded(),'press',1,T).state;
  assert.equal(s.objectiveProgress['build-tools'],0);
  s=e.buyUpgrade(world,s,'ink',T).state;
  const again=e.buyUpgrade(world,s,'ink',T);
  assert.equal(again.accepted,false);assert.deepEqual(again.state.objectiveProgress,s.objectiveProgress);
});
test('offline ticks and repeated projections never earn action objectives',()=>{
  const s=e.buyProducer(world,funded(),'pencil',1,T).state;
  const result=e.advance(world,s,T+100000);
  assert.equal(result.gained,100);
  assert.deepEqual(result.state.objectiveProgress,s.objectiveProgress);
  assert.deepEqual(e.project(world,result.state,T+100000).state.objectiveProgress,s.objectiveProgress);
});
test('every prestige resets objectives; lifetime taps cannot satisfy a later run',()=>{
  const first=e.prestige(world,complete(),T);
  assert.equal(first.accepted,true);
  assert.deepEqual(first.state.objectiveProgress,e.newRun(world,T).objectiveProgress);
  assert.equal(first.state.taps,2);
  assert.equal(first.state.runTaps,0);
  assert.equal(e.prestige(world,first.state,T).accepted,false);
  const fundedAgain={...first.state,banked:10000,runProduced:10000,allTime:first.state.allTime+10000};
  assert.equal(e.availablePrestige(world,fundedAgain),0);
  const second=e.prestige(world,complete(fundedAgain),T);
  assert.equal(second.accepted,true);assert.equal(second.state.prestige,4);
  assert.equal(second.state.taps,4);
});
test('objectives do not replace production threshold or lift prestige cap',()=>{
  const done=complete();
  const low={...done,runProduced:99};
  assert.equal(e.prestige(world,low,T).reason,'threshold-not-met');
  assert.equal(e.availablePrestige(world,{...done,prestige:999}),1);
  assert.equal(e.availablePrestige(world,{...done,prestige:1000}),0);
});
test('objective saves round-trip deeply isolated and fail closed on incompatible imports',()=>{
  const s=complete(),raw=JSON.stringify(s);
  const imported=e.admitRun(world,JSON.parse(raw));
  assert.equal(JSON.stringify(imported),raw);
  imported.objectiveProgress['manual-practice']=0;
  assert.equal(s.objectiveProgress['manual-practice'],2);
  for(const mutation of [
    s=>delete s.runTaps,
    s=>s.runTaps=-1,
    s=>s.runTaps=s.taps+1,
    s=>s.runTaps=0,
    s=>delete s.objectiveProgress,
    s=>s.objectiveProgress=[],
    s=>s.objectiveProgress.extra=0,
    s=>s.objectiveProgress['manual-practice']=3,
    s=>s.objectiveProgress['manual-practice']=0.5,
    s=>s.objectiveProgress['build-tools']=0,
    s=>s.objectiveProgress['improve-tools']=0,
    s=>s.objectiveContract='changed',
    s=>s.kind=e.STATE_KIND,
    s=>s.worldId=base.id,
  ]) {const bad=JSON.parse(raw);mutation(bad);assert.throws(()=>e.admitRun(world,bad));}
  assert.throws(()=>e.admitRun(world,{...e.newRun(base,T),worldId:world.id}));
  const changed=e.defineWorld({...world,prestigeObjectives:rules.map(o=>o.action==='tap'?{...o,count:3}:o)});
  assert.throws(()=>e.admitRun(changed,s),/contract/);
  const reordered=e.defineWorld({...world,prestigeObjectives:rules.toReversed()});
  assert.deepEqual(e.admitRun(reordered,s),s);
  const renamed=e.defineWorld({...world,prestigeObjectives:rules.map(o=>({...o,label:'New descriptive wording'}))});
  assert.deepEqual(e.admitRun(renamed,s),s);
});
test('bounded data admission refuses invalid, unknown and executable objective rules',()=>{
  for(const objectives of [
    [],Array.from({length:17},(_,i)=>({...rules[0],id:'objective-'+i})),
    [rules[0],rules[0]],
    [{...rules[0],id:'pencil'}],
    [{...rules[0],count:0}],[{...rules[0],count:1000001}],
    [{...rules[0],count:NaN}],[{...rules[0],count:1.5}],
    [{...rules[0],targetId:'pencil'}],
    [{...rules[1],targetId:'absent'}],[{...rules[1],count:1001}],[{...rules[1],count:1000}],
    [{...rules[2],count:2}],[{...rules[2],targetId:'pencil'}],
    [{...rules[0],action:'external-mission'}],
    [{...rules[0],callback:()=>true}],
  ]) assert.throws(()=>e.defineWorld({...base,prestigeObjectives:objectives}));
  assert.ok(Object.isFrozen(world.prestigeObjectives));
  assert.ok(Object.isFrozen(world.prestigeObjectives[0]));
});
test('legacy worlds, new-run bytes and prestige remain unchanged',()=>{
  for(const w of WORLDS) {
    assert.equal(Object.hasOwn(w,'prestigeObjectives'),false);
    const s=e.newRun(w,T);
    assert.equal(s.kind,e.STATE_KIND);
    assert.equal(Object.hasOwn(s,'objectiveProgress'),false);
    assert.equal(JSON.stringify(e.admitRun(w,JSON.parse(JSON.stringify(s)))),JSON.stringify(s));
    const rich={...s,banked:w.prestigeThreshold*4,runProduced:w.prestigeThreshold*4,allTime:w.prestigeThreshold*4};
    assert.equal(e.prestige(w,rich,T).awarded,2);
    assert.equal(Object.hasOwn(e.project(w,s,T),'objectives'),false);
  }
});
test('optional objectives pass original schema→producer→runtime→static build chain',async t=>{
  const root=await mkdtemp(join(tmpdir(),'objective-receiving-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const source=fileURLToPath(new URL('../',import.meta.url));
  for(const dir of ['design','src','scripts']) await cp(join(source,dir),join(root,dir),{recursive:true});
  await cp(join(source,'package.json'),join(root,'package.json'));
  await symlink(join(source,'node_modules'),join(root,'node_modules'),'dir');
  await writeFile(join(root,'design/world-catalog.json'),JSON.stringify([world]));
  await generateWorlds({root});
  await generateWorlds({root,check:true});
  const {build}=await import(pathToFileURL(join(root,'scripts/build.mjs')));
  await build(join(root,'received'));
  const built=await import(pathToFileURL(join(root,'received/assets/engine.mjs')));
  const {WORLDS:worlds}=await import(pathToFileURL(join(root,'received/assets/worlds.mjs')));
  assert.deepEqual(worlds,[world]);
  assert.equal(built.prestige(worlds[0],complete(),T).awarded,2);
  const html=await readFile(join(root,'received/index.html'),'utf8');
  await withBrowser(join(root,'received/assets/browser.mjs'),html,
    {now:T,entries:[[storageKey(world.id),JSON.stringify(complete())]]},app=>{
      assert.equal(app.get('objectives-section').hidden,false);
      assert.equal(app.get('objectives').children.length,rules.length);
      for(const rule of rules) assert.ok(app.get('objectives').children.some(row=>row.textContent.includes(rule.label)));
      assert.equal(app.get('prestige').disabled,false);
      app.click('prestige');app.click('confirm-prestige');
      const reset=JSON.parse(app.export());
      assert.equal(reset.prestige,2);
      assert.ok(Object.values(reset.objectiveProgress).every(count=>count===0));
      assert.equal(app.get('prestige').disabled,true);
    });
  const before=await readFile(join(root,'src/generated/world-definitions.mjs'),'utf8');
  await writeFile(join(root,'design/world-catalog.json'),JSON.stringify([{...world,prestigeObjectives:[{...rules[1],targetId:'missing'}]}]));
  await assert.rejects(generateWorlds({root}));
  assert.equal(await readFile(join(root,'src/generated/world-definitions.mjs'),'utf8'),before);
});

test('producer objective admission respects the actual finite price ceiling',()=>{
  const p=base.producers[0];
  let reachable=0;
  while(reachable<e.MAX_LEVEL && e.producerPrice(p,reachable)<=e.MAX_POINTS) reachable++;
  assert.ok(reachable<e.MAX_LEVEL);
  assert.doesNotThrow(()=>e.defineWorld({...base,prestigeObjectives:[{...rules[1],count:reachable}]}));
  assert.throws(()=>e.defineWorld({...base,prestigeObjectives:[{...rules[1],count:reachable+1}]}),/unreachable/);
});
