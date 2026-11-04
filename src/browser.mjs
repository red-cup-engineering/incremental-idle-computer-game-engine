import { WORLDS, worldById } from './worlds.mjs';
import { newRun, admitRun, project, tap, buyProducer, buyUpgrade, prestige, quotePrestige, quoteProducerPurchase, quoteUpgradePurchase, forecastProduction, MAX_LEVEL, MAX_POINTS } from './engine.mjs';
import { writeVerifiedSave } from '@red-cup-engineering/computer-game-systems-engineering-services-section/verified-save-write';

const $ = id => document.getElementById(id);
const format = new Intl.NumberFormat('en-US', { maximumFractionDigits:0, notation:'compact' });
const exact = new Intl.NumberFormat('en-US', { maximumFractionDigits:0 });
const storageKey = id => `561-incremental-idle:${id}:v1`;
const pick = new URLSearchParams(location.search).get('world');
let world=worldById(pick) ?? WORLDS[0], state, slot, blocked=false, resetArmed=false;
// At most the declared worlds. These page-local runs are not durable backups.
// Keeping them prevents a failed save followed by a world switch losing play.
const runs=new Map();
const btns={producers:new Map(),upgrades:new Map(),readiness:new Map(),previews:new Map(),upgradePreviews:new Map()};
const status = text => { $('status').textContent=text; };

function readSaved(current) {
  if (runs.has(current.id)) return runs.get(current.id);
  const entry={state:newRun(current,Date.now()),expected:null,raw:null,blocked:false,conflicted:false,error:''};
  try {
    entry.raw=localStorage.getItem(storageKey(current.id));
    entry.expected=entry.raw;
    if (entry.raw!==null) entry.state=admitRun(current,JSON.parse(entry.raw));
  } catch {
    entry.blocked=true;
    entry.error='The saved run could not be read. It has not been replaced.';
  }
  runs.set(current.id,entry);
  return entry;
}
function showSaveStatus() {
  $('save-status').textContent=[...runs].filter(([,entry])=>entry.error).map(([id,entry])=>
    `${worldById(id).label}: ${entry.error}${entry.blocked?' Export the original text if available, or explicitly replace it.':' Live progress remains in this page. Select this world and export before closing.'}`).join(' ');
}
function writeSave(raw) {
  return writeVerifiedSave({text:raw,write:text=>localStorage.setItem(storageKey(world.id),text),read:()=>localStorage.getItem(storageKey(world.id))});
}
function failedWrite(result) {
  if (result.kind==='mismatch') slot.conflicted=true;
  slot.error=result.kind==='mismatch'
    ? 'Storage changed during saving; automatic writes are paused.'
    : 'Saving could not be verified. Storage may have changed.';
  showSaveStatus();
}
function save() {
  slot.state=state;
  if (blocked) {showSaveStatus();return false;}
  try {
    // This detects observations, not atomic compare-and-swap or cross-tab locks.
    if (slot.conflicted || localStorage.getItem(storageKey(world.id))!==slot.expected) {
      slot.conflicted=true;
      slot.error='Another saved version was observed; automatic writes are paused.';
      showSaveStatus();return false;
    }
    const raw=JSON.stringify(state),result=writeSave(raw);
    if (!result.ok) {failedWrite(result);return false;}
    slot.expected=raw;slot.error='';showSaveStatus();return true;
  } catch {
    slot.error='Browser storage is unavailable.';
    showSaveStatus();return false;
  }
}
function adoptSaved(next,raw) {
  state=next;blocked=false;resetArmed=false;
  Object.assign(slot,{state,expected:raw,raw,blocked:false,conflicted:false,error:''});
  $('reset').textContent='Reset this world';
}
function el(tag,cls,text) {
  const node=document.createElement(tag);
  if (cls) node.className=cls;
  if (text!==undefined) node.textContent=text;
  return node;
}
function lineRow(name,description) {
  const row=el('article','purchase');
  const content=el('div','purchase-copy');
  content.append(el('h3','',name),el('p','',description));
  row.append(content);
  return {row,content};
}
function waitLabel(milliseconds) {
  const seconds=Math.ceil(milliseconds/1000);
  const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
  return [hours?`${hours}h`:'',minutes?`${minutes}m`:'',rest?`${rest}s`:''].filter(Boolean).join(' ') || '0s';
}
function purchaseReadiness(cost,now) {
  if(cost>MAX_POINTS) return 'Price exceeds the balance limit; no further purchase is possible.';
  if(cost<=state.banked) return 'Ready now.';
  const shortfall=`${format.format(cost-state.banked)} ${world.unit} short.`;
  if(now<state.lastMs) return `${shortfall} Idle estimate paused until the device clock catches up.`;
  const quote=forecastProduction(world,state,cost,now,Math.min(Number.MAX_SAFE_INTEGER,now+world.offlineCapSeconds*1000));
  if(quote.rate===0) return `${shortfall} Use “${world.verb}” to earn more.`;
  if(quote.waitMs===null) return `${shortfall} No safe idle-time estimate is available.`;
  return `${shortfall} About ${waitLabel(quote.waitMs)} at this rate${quote.waitMs>world.offlineCapSeconds*1000?' (beyond one offline collection cap)':''}.`;
}
function readinessNode(id,content) {
  const node=el('p','purchase-readiness');
  node.setAttribute('id',`readiness-${id}`);
  content.append(node);btns.readiness.set(id,node);
  return `readiness-${id}`;
}
function renderPrestige() {
  // render has already settled time. The same planner is used by the click.
  const quote=quotePrestige(world,state),button=$('prestige');
  button.disabled=!quote.accepted;
  button.setAttribute('aria-describedby','prestige-preview');
  button.textContent=quote.accepted
    ? `Replant for +${quote.awarded} permanent spark${quote.awarded===1?'':'s'}`
    : quote.remainingCapacity===0 ? 'Permanent spark limit reached'
    : quote.missingObjectives.length ? 'Complete all objectives to replant'
    : quote.next ? `Replant after ${exact.format(quote.next.runProduced)} ${world.unit} this run` : 'Production limit prevents replanting';
  const summary=[`Produced ${exact.format(state.runProduced)} ${world.unit} this run.`];
  if(quote.accepted) summary.push(`Replant now: +${exact.format(quote.awarded)} permanent sparks.`);
  else if(quote.remainingCapacity===0) summary.push('Permanent spark limit reached; replanting is unavailable.');
  else summary.push(`Replant now: unavailable. Production qualifies for ${exact.format(quote.productionAward)} sparks.`);
  if(quote.missingObjectives.length) summary.push(`Still needed: ${quote.missingObjectives.map(o=>`${o.label} (${exact.format(o.progress)}/${exact.format(o.count)})`).join('; ')}.`);
  if(quote.next) summary.push(`Next award: +${exact.format(quote.next.awarded)} sparks at ${exact.format(quote.next.runProduced)} ${world.unit} produced this run (${exact.format(quote.next.missingProduced)} more).${quote.missingObjectives.length?' All objectives must also be complete.':''}`);
  else if(quote.remainingCapacity>0) summary.push(quote.productionAward===quote.remainingCapacity
    ? 'This replant reaches the permanent spark limit; further production cannot increase its award.'
    : 'No higher award is reachable within the production limit.');
  if(quote.reset) summary.push(`Replant resets: lose ${exact.format(quote.reset.bankedLost)} banked ${world.unit}, ${exact.format(quote.reset.producerUnitsLost)} producer units and ${exact.format(quote.reset.upgradesLost)} upgrades. New run: ${exact.format(quote.reset.prestige)} permanent sparks, +${exact.format(quote.reset.tapYield)} per action and ${exact.format(quote.reset.rate)} / sec.${world.prestigeObjectives?' Objectives start over.':''}`);
  $('prestige-preview').textContent=summary.join(' ');
}
function installWorld(next) {
  world=next;
  slot=readSaved(world);state=slot.state;blocked=slot.blocked;
  resetArmed=false;
  if (blocked) {
    status(`This ${world.label} save cannot be read. It has NOT been replaced. Export it or explicitly clear it to start again.`);
  }
  $('objectives-section').hidden=!world.prestigeObjectives;
  $('objectives').replaceChildren();
  $('world-name').textContent=world.label;
  $('world-description').textContent=world.description;
  $('tap').textContent=world.verb;
  $('currency').textContent=world.unit;
  $('reset').textContent=blocked?'Clear damaged save':'Reset this world';
  $('reset').disabled=false;
  const menu=$('worlds');menu.replaceChildren();
  for(const entry of WORLDS) {
    const b=el('button',entry.id===world.id?'selected':'secondary',entry.label);
    b.type='button';b.setAttribute('aria-pressed',String(entry.id===world.id));
    b.addEventListener('click',()=>{ if(entry.id!==world.id){save();installWorld(entry); history.replaceState(null,'',`?world=${encodeURIComponent(entry.id)}`);} });
    menu.append(b);
  }
  btns.producers.clear();btns.upgrades.clear();btns.readiness.clear();btns.previews.clear();btns.upgradePreviews.clear();
  const producers=$('producers');producers.replaceChildren();
  for(const p of world.producers) {
    const {row,content}=lineRow(p.label,`${format.format(p.ratePerSecond)} ${world.unit} per second each`);
    const description=readinessNode(p.id,content);
    const controls=el('div','purchase-controls');
    const owned=el('span','amount');
    for(const [label,count] of [['Buy 1',1],['Buy 10',10],['Buy max','max']]) {
      const b=el('button','secondary',label);b.type='button';
      let describedBy=description;
      if(count!==1) {
        const preview=el('p','purchase-preview');
        const previewId=`preview-${p.id}-${count}`;
        preview.setAttribute('id',previewId);
        content.append(preview);btns.previews.set(`${p.id}:${count}`,preview);
        describedBy+=` ${previewId}`;
      }
      b.setAttribute('aria-describedby',describedBy);
      b.addEventListener('click',()=>{
        const result=buyProducer(world,state,p.id,count,Date.now());
        act(result,`Purchased ${result.count} × ${p.label} for ${exact.format(result.spent)} ${world.unit}.`);
      });
      controls.append(b);
      btns.producers.set(`${p.id}:${count}`,b);
    }
    const cost=el('span','price');controls.prepend(owned,cost);row.append(controls);producers.append(row);
    btns.producers.set(`${p.id}:owned`,owned);btns.producers.set(`${p.id}:cost`,cost);
  }
  const upgrades=$('upgrades');upgrades.replaceChildren();
  for(const u of world.upgrades) {
    const {row,content}=lineRow(u.label,`${u.effect==='tap'?'Manual': 'Automatic'} improvement`);
    const description=readinessNode(u.id,content);
    const preview=el('p','purchase-preview');
    preview.setAttribute('id',`preview-upgrade-${u.id}`);
    content.append(preview);btns.upgradePreviews.set(u.id,preview);
    const button=el('button','secondary','');button.type='button';
    button.setAttribute('aria-describedby',`${description} preview-upgrade-${u.id}`);
    button.addEventListener('click',()=>act(buyUpgrade(world,state,u.id,Date.now()),`Installed ${u.label} for ${exact.format(u.cost)} ${world.unit}.`));
    row.append(button);upgrades.append(row);btns.upgrades.set(u.id,button);
  }
  render();
}
function act(result,acceptedText) {
  state=result.state;
  status(result.accepted ? acceptedText : `Not available: ${result.reason.replaceAll('-',' ')}.`);
  save();render();
}
function render() {
  if (blocked) {
    $('tap').disabled=true;$('prestige').disabled=true;
    for (const id of ['banked','rate','tap-yield','run-produced','all-time','prestige-points']) $(id).textContent='Unavailable';
    $('prestige').textContent='Load a valid save to replant';
    $('prestige').setAttribute('aria-describedby','prestige-preview');
    $('prestige-preview').textContent='Load a valid save to preview replanting.';
    for(const b of btns.producers.values()) if(b.tagName==='BUTTON') b.disabled=true;
    for(const b of btns.upgrades.values()) b.disabled=true;
    for(const node of btns.readiness.values()) node.textContent='Load a valid save to see purchase readiness.';
    for(const node of btns.previews.values()) node.textContent='Load a valid save to preview this batch.';
    for(const node of btns.upgradePreviews.values()) node.textContent='Load a valid save to preview this upgrade.';
    showSaveStatus();return;
  }
  const now=Date.now(),view=project(world,state,now);
  state=view.state;
  $('banked').textContent=format.format(state.banked);
  $('rate').textContent=`${format.format(view.rate)} / sec`;
  $('tap-yield').textContent=`+${format.format(view.tapYield)} per action`;
  $('run-produced').textContent=format.format(state.runProduced);
  $('all-time').textContent=format.format(state.allTime);
  $('prestige-points').textContent=String(state.prestige);
  $('tap').disabled=false;
  renderPrestige();
  if (view.objectives) {
    $('objectives').replaceChildren(...view.objectives.map(o=>el('li','',
      `${o.label}: ${o.progress}/${o.count}${o.complete?' (complete)':''}`)));
  }
  $('offline-rule').textContent=`Offline collection: up to ${world.offlineCapSeconds/3600} hours per return. Progress stays on this device.`;
  for(const p of view.producers) {
    const visible=p.owned>=MAX_LEVEL ? 'Level limit reached' : p.locked ? `Unlocks at ${format.format(p.unlockAt)} produced` : `${format.format(p.nextCost)} ${world.unit} next`;
    btns.producers.get(`${p.id}:owned`).textContent=`Owned ${p.owned}`;
    btns.producers.get(`${p.id}:cost`).textContent=visible;
    btns.readiness.get(p.id).textContent=p.owned>=MAX_LEVEL ? `Maximum owned (${MAX_LEVEL}).`
      : p.locked ? `Produce ${format.format(p.unlockAt-state.runProduced)} more ${world.unit} this run to unlock.`
      : `Next unit: ${purchaseReadiness(p.nextCost,now)}`;
    for(const n of [1,10,'max']) btns.producers.get(`${p.id}:${n}`).disabled=p.locked || p.owned>=MAX_LEVEL || state.banked<p.nextCost;
    for(const n of [10,'max']) {
      // project has already settled this observation. Quotes cannot advance
      // time or award actions; the actual click settles and plans afresh.
      const quote=quoteProducerPurchase(world,state,p.id,n);
      const label=n==='max'?'Buy max':'Buy 10';
      btns.previews.get(`${p.id}:${n}`).textContent=quote.accepted
        ? `${label}: ${quote.count} for ${exact.format(quote.spent)} ${world.unit}; +${exact.format(quote.rateGain)} / sec.`
        : `${label}: ${p.locked?'locked':p.owned>=MAX_LEVEL?'level limit reached':'no affordable units yet'}.`;
    }
  }
  for(const u of view.upgrades) {
    const b=btns.upgrades.get(u.id);
    b.textContent=u.owned?'Installed':u.locked?`Unlocks at ${format.format(u.unlockAt)}`:`Buy for ${format.format(u.cost)} ${world.unit}`;
    b.disabled=u.owned || u.locked || state.banked<u.cost;
    btns.readiness.get(u.id).textContent=u.owned ? 'Already installed.'
      : u.locked ? `Produce ${format.format(u.unlockAt-state.runProduced)} more ${world.unit} this run to unlock.`
      : purchaseReadiness(u.cost,now);
    const quote=quoteUpgradePurchase(world,state,u.id);
    const gain=u.effect==='tap' ? `+${exact.format(quote.tapGain)} per action`
      : `+${exact.format(quote.rateGain)} / sec at current inventory`;
    btns.upgradePreviews.get(u.id).textContent=quote.accepted
      ? `Upgrade: ${exact.format(quote.spent)} ${world.unit}; ${gain}.${u.effect==='production'&&quote.rateGain===0?' No immediate increase at the current inventory and output limit.':''}`
      : `Upgrade: ${u.owned?'already installed':u.locked?'locked':'not affordable yet'}.`;
  }
  if(view.discardedSeconds>0) status(`Welcome back! Collected ${format.format(view.gained)} ${world.unit} for ${view.seconds} seconds; time beyond the offline cap was discarded.`);
  save();
}
$('tap').addEventListener('click',()=>{ if(!blocked) {const outcome=tap(world,state,Date.now());act(outcome,`+${format.format(outcome.gained)} ${world.unit} collected.`);} });
$('prestige').addEventListener('click',()=>{ if(!blocked) { const outcome=prestige(world,state,Date.now()); act(outcome,outcome.accepted?`Replanted. +${outcome.awarded} permanent sparks; next run is faster.`:''); }});
$('reset').addEventListener('click',()=>{
  if(!resetArmed){resetArmed=true;$('reset').textContent='Confirm: erase this world';status('Press Confirm to erase this world’s local progress. Other worlds are unaffected.');return;}
  const fresh=newRun(world,Date.now()),raw=JSON.stringify(fresh),result=writeSave(raw);
  if(!result.ok){failedWrite(result);status('Reset could not be verified. No replacement was adopted; storage may have changed.');return;}
  adoptSaved(fresh,raw);
  installWorld(world);status('This world was reset on this device.');
});
$('export').addEventListener('click',()=>{
  try {
    // Never export stale persisted bytes in place of an admitted live run.
    // A blocked placeholder is not progress and must never be exported as such.
    const raw=blocked ? slot.raw ?? localStorage.getItem(storageKey(world.id)) : JSON.stringify(state);
    if(raw===null) throw new Error('No original save text is available');
    $('save-data').value=raw;$('save-data').focus();$('save-data').select();
    status(blocked?'Original unreadable save text is in the field; copy it before replacing it.':'Current live run is in the field; copy it somewhere safe. This does not save it automatically.');
  } catch {status('Original save text is unavailable. No replacement or empty run was exported.');}
});
$('import').addEventListener('click',()=>{
  let parsed;
  try {parsed=admitRun(world,JSON.parse($('save-data').value));}
  catch {status('Import refused. No save was written and the current run is unchanged.');return;}
  const raw=JSON.stringify(parsed),result=writeSave(raw);
  if(!result.ok){failedWrite(result);status('Import could not be verified. No replacement was adopted; storage may have changed.');return;}
  // The candidate is already admitted; do not reload storage and replace it
  // with a blocked placeholder if a later read fails.
  adoptSaved(parsed,raw);render();status('Save imported for this world.');
});
installWorld(world);
setInterval(()=>{if(!blocked)render();},1000);
