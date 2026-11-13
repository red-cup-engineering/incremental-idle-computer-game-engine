import * as e from '../../src/engine.mjs';
import {WORLDS} from './worlds.mjs';
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
export { T, base, rules, world, funded, complete };
