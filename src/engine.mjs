/**
 * A finite, deterministic incremental-game rules engine. The world declares
 * its producers and upgrades; the caller supplies a clock and persistence.
 * No platform APIs, currencies, ads, wallets, provenance claims or rewards.
 */
import { boundedNatural, elapsedTicks } from '@red-cup-engineering/computer-data-engineering-services-section/simulation/discrete-clock';

export const STATE_KIND = '561.incremental-idle-state/v1';
export const OBJECTIVE_STATE_KIND = '561.incremental-idle-state/v2';
export const WORLD_KIND = '561.incremental-idle-world/v1';
export const MAX_POINTS = 1_000_000_000_000_000;
export const MAX_LEVEL = 1000;
const MAX_PRESTIGE = 1000;
const ID = /^[a-z][a-z0-9-]{0,47}$/u;
const minText = (text, name) => {
  if (typeof text !== 'string' || !text.trim() || text.length > 160) throw new TypeError(`${name} must be meaningful short text`);
  return text.trim();
};
const bounded = (value,name,max=MAX_POINTS) => boundedNatural(value,name,max);
const pointSum = (a,b) => Math.min(MAX_POINTS, a+b);

function records(input, field, ids, check) {
  if (!Array.isArray(input) || !input.length || input.length > 16) throw new TypeError(`${field} must have 1..16 entries`);
  return Object.freeze(input.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !ID.test(row.id) || ids.has(row.id)) {
      throw new TypeError(`${field} requires unique named records`);
    }
    ids.add(row.id);
    minText(row.label, `${row.id}.label`);
    check(row);
    return Object.freeze({...row});
  }));
}

// Objective progress is local play data, never evidence of real-world completion.
function objectiveContract(world) {
  return JSON.stringify(world.prestigeObjectives.slice().sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(({id,action,targetId,count}) =>
    [id,action,targetId ?? null,count]));
}
function recordAction(world, state, action, targetId, count) {
  if (!world.prestigeObjectives) return state;
  const progress = {...state.objectiveProgress};
  for (const objective of world.prestigeObjectives) {
    if (objective.action === action && objective.targetId === targetId)
      progress[objective.id] = Math.min(objective.count, progress[objective.id] + count);
  }
  return {...state, objectiveProgress:progress,
    runTaps:action === 'tap' ? pointSum(state.runTaps,1) : state.runTaps};
}
export function objectivesComplete(world, state) {
  return !world.prestigeObjectives || world.prestigeObjectives.every(o => state.objectiveProgress[o.id] === o.count);
}

/** Admit a named game world, including bounded rules and complete purchase data. */
export function defineWorld(candidate) {
  if (!candidate || candidate.kind !== WORLD_KIND || !ID.test(candidate.id)) throw new TypeError('invalid world identity');
  minText(candidate.label, 'world.label');
  minText(candidate.description, 'world.description');
  minText(candidate.unit, 'world.unit');
  minText(candidate.verb, 'world.verb');
  bounded(candidate.offlineCapSeconds, 'offlineCapSeconds', 86400);
  if (candidate.offlineCapSeconds < 1) throw new RangeError('offlineCapSeconds must be positive');
  bounded(candidate.prestigeThreshold, 'prestigeThreshold');
  if (candidate.prestigeThreshold < 100) throw new RangeError('prestigeThreshold must be at least 100');
  const ids = new Set();
  const producers = records(candidate.producers, 'producers', ids, p => {
    bounded(p.baseCost, `${p.id}.baseCost`);
    bounded(p.ratePerSecond, `${p.id}.ratePerSecond`);
    bounded(p.growthBasisPoints, `${p.id}.growthBasisPoints`, 30000);
    bounded(p.unlockAt, `${p.id}.unlockAt`);
    if (p.baseCost < 1 || p.ratePerSecond < 1 || p.growthBasisPoints < 10000)
      throw new RangeError('producer prices and rates must be positive; costs cannot decrease');
  });
  const upgrades = records(candidate.upgrades, 'upgrades', ids, u => {
    bounded(u.cost, `${u.id}.cost`);
    bounded(u.unlockAt, `${u.id}.unlockAt`);
    bounded(u.amount, `${u.id}.amount`, 10000);
    if (u.cost < 1 || u.amount < 1 || !['tap', 'production'].includes(u.effect))
      throw new RangeError('invalid upgrade contract');
  });
  if (!producers.some(p => p.unlockAt === 0)) throw new TypeError('world needs an initially unlocked producer');
  let prestigeObjectives;
  if (candidate.prestigeObjectives !== undefined) {
    prestigeObjectives = records(candidate.prestigeObjectives, 'prestigeObjectives', ids, o => {
      const allowed = ['id','label','action','targetId','count'];
      if (Object.keys(o).some(key => !allowed.includes(key))) throw new TypeError('unknown objective field');
      if (!['tap','buy-producer','buy-upgrade'].includes(o.action)) throw new TypeError('unknown objective action');
      bounded(o.count, 'objective.count', o.action === 'tap' ? 1000000 : o.action === 'buy-producer' ? MAX_LEVEL : 1);
      if (o.count < 1) throw new RangeError('objective.count must be positive');
      if (o.action === 'tap') {
        if (Object.hasOwn(o, 'targetId')) throw new TypeError('tap objective has no target');
      } else if (!(o.action === 'buy-producer' ? producers : upgrades).some(row => row.id === o.targetId)) {
        throw new TypeError('unknown objective target');
      }
      if (o.action === 'buy-producer' && producerPrice(producers.find(p=>p.id===o.targetId), o.count-1) > MAX_POINTS)
        throw new RangeError('objective requires an unreachable producer purchase');
    });
  }
  return Object.freeze({kind:WORLD_KIND,id:candidate.id,label:candidate.label,description:candidate.description,
    unit:candidate.unit,verb:candidate.verb,offlineCapSeconds:candidate.offlineCapSeconds,
    prestigeThreshold:candidate.prestigeThreshold,producers,upgrades,
    ...(prestigeObjectives ? {prestigeObjectives} : {})});
}

/** Seed a particular world; no clock reads or implicit save access. */
export function newRun(world, nowMs) {
  boundedNatural(nowMs, 'nowMs');
  return {kind:world.prestigeObjectives ? OBJECTIVE_STATE_KIND : STATE_KIND,worldId:world.id,lastMs:nowMs,banked:0,runProduced:0,
    allTime:0,prestige:0,taps:0,producers:Object.fromEntries(world.producers.map(p=>[p.id,0])),
    upgrades:Object.fromEntries(world.upgrades.map(u=>[u.id,false])),
    ...(world.prestigeObjectives ? {runTaps:0,objectiveContract:objectiveContract(world),
      objectiveProgress:Object.fromEntries(world.prestigeObjectives.map(o=>[o.id,0]))} : {})};
}

/** Fail closed for malformed, incompatible or truncated stored runs. */
export function admitRun(world, state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || state.kind !== (world.prestigeObjectives ? OBJECTIVE_STATE_KIND : STATE_KIND) || state.worldId !== world.id)
    throw new TypeError('saved game belongs to another world or version');
  for (const k of ['lastMs','banked','runProduced','allTime','prestige','taps'])
    boundedNatural(state[k], `state.${k}`, k === 'prestige' ? MAX_PRESTIGE : k === 'lastMs' ? Number.MAX_SAFE_INTEGER : MAX_POINTS);
  if (state.runProduced > state.allTime || state.banked > state.allTime) throw new TypeError('saved game has inconsistent totals');
  if (!state.producers || !state.upgrades || Array.isArray(state.producers) || Array.isArray(state.upgrades))
    throw new TypeError('saved game inventory malformed');
  const producerIds = world.producers.map(p=>p.id), upgradeIds = world.upgrades.map(u=>u.id);
  if (Object.keys(state.producers).sort().join('|') !== producerIds.slice().sort().join('|') ||
    Object.keys(state.upgrades).sort().join('|') !== upgradeIds.slice().sort().join('|'))
    throw new TypeError('saved inventory no longer matches the world');
  for (const id of producerIds) boundedNatural(state.producers[id], `producers.${id}`, MAX_LEVEL);
  for (const id of upgradeIds) if (typeof state.upgrades[id] !== 'boolean') throw new TypeError(`upgrades.${id} must be a boolean`);
  if (world.prestigeObjectives) {
    if (state.objectiveContract !== objectiveContract(world)) throw new TypeError('saved objective contract changed');
    boundedNatural(state.runTaps, 'state.runTaps', MAX_POINTS);
    if (state.runTaps > state.taps) throw new TypeError('saved run taps exceed lifetime taps');
    const progress = state.objectiveProgress;
    if (!progress || typeof progress !== 'object' || Array.isArray(progress) ||
        Object.keys(progress).sort().join('|') !== world.prestigeObjectives.map(o=>o.id).sort().join('|'))
      throw new TypeError('saved objective progress malformed');
    for (const o of world.prestigeObjectives) {
      boundedNatural(progress[o.id], 'objectiveProgress.' + o.id, o.count);
      if (o.action === 'tap' && progress[o.id] !== Math.min(o.count,state.runTaps) ||
          o.action === 'buy-producer' && progress[o.id] !== Math.min(o.count,state.producers[o.targetId]) ||
          o.action === 'buy-upgrade' && progress[o.id] !== Number(state.upgrades[o.targetId]))
        throw new TypeError('saved objective progress inconsistent');
    }
  }
  return {...state,...(world.prestigeObjectives ? {objectiveProgress:{...state.objectiveProgress}} : {}),producers:{...state.producers},upgrades:{...state.upgrades}};
}

function nextProducerPrice(price, growth) {
  return (price * growth + 9999n) / 10000n;
}

export function producerPrice(producer, owned) {
  boundedNatural(owned, 'owned', MAX_LEVEL);
  // Admitted prices are safe integers, but the basis-point product can exceed
  // Number's exact range. Round the integer recurrence before converting back.
  let price = BigInt(producer.baseCost);
  const growth = BigInt(producer.growthBasisPoints), cap = BigInt(MAX_POINTS);
  for (let n=0; n<owned; n++) {
    price = nextProducerPrice(price, growth);
    if (price > cap) return MAX_POINTS + 1;
  }
  return Number(price);
}

export function incomePerSecond(world, state) {
  const base = world.producers.reduce((sum,p)=>sum+p.ratePerSecond*state.producers[p.id],0);
  const bonusPercent = world.upgrades.reduce((sum,u)=>sum+(state.upgrades[u.id] && u.effect==='production' ? u.amount : 0), 0);
  return Math.min(MAX_POINTS, Math.floor(base * (100+bonusPercent+state.prestige*20) / 100));
}

export function tapYield(world, state) {
  return 1 + world.upgrades.reduce((sum,u)=>sum+(state.upgrades[u.id] && u.effect==='tap' ? u.amount : 0),0) + state.prestige;
}

function credit(state, amount) {
  return {...state, banked:pointSum(state.banked,amount),runProduced:pointSum(state.runProduced,amount),
    allTime:pointSum(state.allTime,amount)};
}

function accrueTime(world, state, time) {
  const rate = incomePerSecond(world,state);
  const gained = Math.min(MAX_POINTS, rate*time.ticks);
  return {state:{...credit(state,gained),lastMs:time.nextMs}, gained,
    seconds:time.ticks, discardedSeconds:Math.floor(time.discardedMs/1000)};
}

export function advance(world, candidate, nowMs) {
  const state = admitRun(world,candidate);
  return accrueTime(world,state,elapsedTicks(state.lastMs,nowMs,{maxElapsedMs:world.offlineCapSeconds*1000}));
}

/** Settle a caller-selected, bounded active interval without discarding a
 * previously observed fractional tick. The caller owns pauses and wall/logical
 * time mapping. fromMs is the last active observation, not a new clock origin.
 * Unlike advance, an oversized or backward active interval is refused.
 */
function admitActiveInterval(world, candidate, fromMs, toMs) {
  const state = admitRun(world,candidate);
  boundedNatural(fromMs,'fromMs');
  boundedNatural(toMs,'toMs');
  const carriedMs = fromMs-state.lastMs;
  if (carriedMs<0 || carriedMs>=1000) throw new RangeError('fromMs must retain less than one uncredited second');
  if (toMs<fromMs) throw new RangeError('active interval must be monotone');
  const capMs = world.offlineCapSeconds*1000;
  if (toMs-fromMs>capMs) throw new RangeError('active interval exceeds the world time cap');
  return {state,carriedMs,capMs};
}

export function advanceActive(world, candidate, fromMs, toMs) {
  const {state,carriedMs,capMs}=admitActiveInterval(world,candidate,fromMs,toMs);
  return accrueTime(world,state,elapsedTicks(state.lastMs,toMs,{maxElapsedMs:capMs+carriedMs}));
}

/** Read-only bank-target readiness at the current production rate. The active
 * interval has exactly advanceActive's admission contract. waitMs estimates the
 * required active duration, even beyond that interval; only reachable/readyAtMs
 * attest that the selected interval suffices. No clock, credit, purchase, pause
 * policy or deadline is chosen here. Targets above the balance cap cannot be
 * reached. Unsafe duration estimates are null, never rounded timestamps.
 */
export function forecastProduction(world,candidate,target,fromMs,toMs) {
  const {state,carriedMs}=admitActiveInterval(world,candidate,fromMs,toMs);
  boundedNatural(target,'target');
  const missing=Math.max(0,target-state.banked),rate=incomePerSecond(world,state);
  let waitMs=null;
  if(missing===0) waitMs=0;
  else if(target<=MAX_POINTS && rate>0) {
    // Exact quotient and duration avoid rounded-up division at integer limits.
    // Credit itself continues to use the existing native rate and saturation.
    const ticks=(BigInt(missing)+BigInt(rate)-1n)/BigInt(rate);
    const duration=ticks*1000n-BigInt(carriedMs);
    if(duration<=BigInt(Number.MAX_SAFE_INTEGER)) waitMs=Number(duration);
  }
  const reachable=waitMs!==null && waitMs<=toMs-fromMs;
  return {missing,rate,waitMs,reachable,readyAtMs:reachable?fromMs+waitMs:null};
}

export function tap(world,candidate,nowMs) {
  const previous=advance(world,candidate,nowMs);
  const amount=tapYield(world,previous.state);
  return {accepted:true,state:recordAction(world,{...credit(previous.state,amount),taps:pointSum(previous.state.taps,1)},'tap',undefined,1),gained:amount};
}

// One planner serves both a clock-free quote and the clock-settling command.
// Walk to the current level once, then extend the exact recurrence per unit.
function planProducerPurchase(world,state,id,requested) {
  const p=world.producers.find(x=>x.id===id);
  if (!p) return {accepted:false,reason:'unknown-producer'};
  if (state.runProduced<p.unlockAt) return {accepted:false,reason:'locked'};
  const quantity=requested==='max' ? 100 : boundedNatural(requested,'requested',100);
  if (quantity===0) return {accepted:false,reason:'zero-quantity'};
  let owned=state.producers[id], balance=state.banked, spent=0, bought=0;
  let price=BigInt(producerPrice(p,owned));
  const growth=BigInt(p.growthBasisPoints);
  while (bought<quantity && owned<MAX_LEVEL) {
    if (price>BigInt(balance)) break;
    const cost=Number(price);
    balance-=cost; spent+=cost; bought++; owned++;
    price=nextProducerPrice(price,growth);
  }
  if (bought===0) return {accepted:false,reason:owned===MAX_LEVEL?'level-cap':'insufficient-points'};
  return {accepted:true,count:bought,spent,balance,owned};
}

/** Quote an admitted balance without advancing time, awarding objectives or
 * returning a speculative state. Partial batches and max's 100-unit limit are
 * identical to buyProducer. Settle time explicitly before quoting when needed;
 * an actual command always recomputes and never accepts a quote as authority.
 */
export function quoteProducerPurchase(world,candidate,id,requested) {
  const state=admitRun(world,candidate), plan=planProducerPurchase(world,state,id,requested);
  if (!plan.accepted) return {...plan,count:0,spent:0,rateGain:0};
  const after={...state,producers:{...state.producers,[id]:plan.owned}};
  return {accepted:true,count:plan.count,spent:plan.spent,
    rateGain:incomePerSecond(world,after)-incomePerSecond(world,state)};
}

export function buyProducer(world,candidate,id,requested,nowMs) {
  const previous=advance(world,candidate,nowMs), state=previous.state;
  const plan=planProducerPurchase(world,state,id,requested);
  if (!plan.accepted) return {...plan,state};
  return {accepted:true,count:plan.count,spent:plan.spent,
    state:recordAction(world,{...state,banked:plan.balance,producers:{...state.producers,[id]:plan.owned}},'buy-producer',id,plan.count)};
}

export function buyUpgrade(world,candidate,id,nowMs) {
  const previous=advance(world,candidate,nowMs), state=previous.state;
  const upgrade=world.upgrades.find(x=>x.id===id);
  if (!upgrade) return {accepted:false,reason:'unknown-upgrade',state};
  if (state.upgrades[id]) return {accepted:false,reason:'already-owned',state};
  if (state.runProduced<upgrade.unlockAt) return {accepted:false,reason:'locked',state};
  if (state.banked<upgrade.cost) return {accepted:false,reason:'insufficient-points',state};
  return {accepted:true,state:recordAction(world,{...state,banked:state.banked-upgrade.cost,
    upgrades:{...state.upgrades,[id]:true}},'buy-upgrade',id,1)};
}

export function availablePrestige(world, state) {
  if (state.prestige>=MAX_PRESTIGE || !objectivesComplete(world,state)) return 0;
  return Math.min(MAX_PRESTIGE-state.prestige,Math.floor(Math.sqrt(state.runProduced/world.prestigeThreshold)));
}

export function prestige(world,candidate,nowMs) {
  const previous=advance(world,candidate,nowMs), state=previous.state;
  const awarded=availablePrestige(world,state);
  if (!awarded) return {accepted:false,reason:objectivesComplete(world,state)?'threshold-not-met':'objectives-not-met',state};
  const reset=newRun(world,state.lastMs);
  return {accepted:true,awarded,state:{...reset,prestige:state.prestige+awarded,
    allTime:state.allTime,taps:state.taps}};
}

export function project(world,candidate,nowMs) {
  const {state,gained,seconds,discardedSeconds}=advance(world,candidate,nowMs);
  return {state,gained,seconds,discardedSeconds,rate:incomePerSecond(world,state),tapYield:tapYield(world,state),
    availablePrestige:availablePrestige(world,state),
    ...(world.prestigeObjectives ? {objectives:world.prestigeObjectives.map(o=>({...o,
      progress:state.objectiveProgress[o.id],complete:state.objectiveProgress[o.id]===o.count}))} : {}),
    producers:world.producers.map(p=>({...p,owned:state.producers[p.id],nextCost:producerPrice(p,state.producers[p.id]),
      locked:state.runProduced<p.unlockAt})),
    upgrades:world.upgrades.map(u=>({...u,owned:state.upgrades[u.id],locked:state.runProduced<u.unlockAt}))};
}
