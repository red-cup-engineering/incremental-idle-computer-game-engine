# Little Worlds — Incremental Idle Game

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

Red Cup Engineering's reusable **typed, declarative incremental-game engine** and a genuinely playable, zero-custody browser consumer. It builds two independent, original local-only worlds: **Trace Garden** and **Pocket Observatory**. Neither is a mining service, advertisement, money-like reward, blockchain game or public account system.

## Proposed package consumer contract

The engine exposes three named ESM entrances: `@red-cup-engineering/incremental-idle-game/engine`, `/worlds`, and `/transactions`. They alias the existing source modules without a second implementation. `spendPoints` in `/transactions` is a clock-free bounded integer-point debit; call the engine's `advance` explicitly when time should pass. Spending does not complete action objectives or create production.

Existing `/src/*`, `/scripts/*`, `/design/*` and `/package.json` paths remain accessible for known consumers. These are compatibility paths, not a promise that every internal file is a stable API. There is no root entrance. The package carrier includes source, authored designs, generation/build tools and native tests. Generated browser output, dependency trees, workflow files, historical qualification records and local artifacts are not package inputs. README and LICENSE remain included by npm.

This remains private version 0.1.0. Adding an import surface does not publish it or choose a release version. A title must receive an owner-issued exact artifact and its normal frozen dependency closure before treating it as the released dependency required by Mutualist Mission. The original Engineering publication owner retains version, channel, integrity and release gates.

The `/engine`, `/worlds`, and `/transactions` runtime entrances require the declared Computer Data supplier and do not require JSNode. Generation and static build are separate tooling entrances: a consumer selecting them must install the exact JSNode version declared in `peerDependencies`. This peer is optional for core-only consumers and retained in `devDependencies` for this package's own development. Selecting a tooling entrance without that supplier fails; optional does not mean generation works without it. A title using the generator should declare the same exact JSNode development dependency and receive its actual installed producer identity. The static build remains the two-world Little Worlds app, not a Mutualist title or a browser adapter for resource transactions.

The Little Worlds browser and its static build also select gamehouse's existing
`/verified-save-write` entry. This is a separate optional peer for those entries,
not an engine, worlds or transactions dependency. The source checkout pins the
six-file, zero-dependency supplier as an exact development artifact. The build
copies only its resolved save helper into the browser graph and records its hash.
It does not load a house aggregator or any other game engine. Core-only consumers
need neither browser supplier. See [browser recovery](design/browser-recovery.md)
for its exact provenance, player contract and non-atomic limits.

## Bounded active-time settlement

Automatic production floors the exact aggregate producer income and percentage
bonus before applying the point cap. Even admitted safe-integer rates can have
unsafe intermediate products; these cannot add or lose a point or reach the cap
early. Existing saves retain their recorded balances and inventory. Future
production, readiness and purchase previews use the corrected shared rule. See
[exact production](design/exact-production.md) for the arithmetic and receiving
contract. The two shipped world designs and save formats are unchanged.

Producer prices use exact per-level integer ceiling, including late-game quotes
whose basis-point multiplication exceeds Number precision. Existing saved
balances and inventory are preserved; only future quotes/debits are corrected.
See [exact producer prices](design/exact-producer-prices.md) for saved-play and
custom-objective compatibility, regression cases and consumer qualification.

`advance(world, run, nowMs)` remains the ordinary offline-clock operation: it caps
unobserved time, discards excess history and tolerates backward observations
without minting points. Its save contract and behavior are unchanged.

`advanceActive(world, run, fromMs, toMs)`, from the same `/engine` entrance, settles
an explicitly selected active logical interval. This is useful when a title pauses
production between rounds but retains the fractional tick already observed before
the pause. For example, 500 ms retained plus 60,000 ms of new active time produces
60 whole seconds and keeps the 500 ms phase. Passing that combined 60,500 ms to an
ordinary 60-second capped offline advance would instead discard the fraction.

Contract:
- Both times are nonnegative safe integer milliseconds. `fromMs` is the previous
  active observation and must satisfy `0 <= fromMs - run.lastMs < 1000`.
- `toMs >= fromMs`, and the new interval `toMs - fromMs` must be no longer than
  `world.offlineCapSeconds * 1000`. Invalid, stale, backward and oversized active
  intervals throw before returning a changed state. Use ordinary `advance` when
  truncating an arbitrary offline gap is intended.
- The result has the ordinary `{state, gained, seconds, discardedSeconds}` shape.
  Whole ticks use the existing Computer Data quantizer and native production
  credit. The result preserves the subsecond phase and has `discardedSeconds: 0`.
  Zero intervals award nothing. Inventories/objective progress are detached;
  state kinds, point saturation, action objectives and native prestige are unchanged.
- The caller owns which time is active, its wall/logical mapping, observation
  storage and pause/resume policy. This function neither reads a clock nor invents
  a deadline, pause, round, reward or save field. Keep passing the returned state
  and actual previous active observation; this is arithmetic, not authenticated
  evidence of time spent playing. Sparse/dense equivalence assumes no intervening
  change in production rate, as with the original discrete-tick engine.

`test/active-interval.test.mjs` checks every millisecond phase, bounded composition,
sparse/dense observations, native purchase/reset composition, isolation, objectives,
saturation, invalid intervals and safe-integer endpoints. The first consumer is
Mission: Mutualist's title-owned logical production clock; it can replace its two
manual `advance` calls without moving season rules into the engine.

## Bounded production readiness

`forecastProduction(world, run, target, fromMs, toMs)` is a pure bank-target quote
from `/engine`. It uses the same admitted run and selected active interval as
`advanceActive`, including retained fractional tick phase and the world time cap.
It does not advance the run, spend points, record an action or choose a deadline.

The result is `{missing, rate, waitMs, reachable, readyAtMs}`:
- `target` is the desired absolute bank balance, a nonnegative safe integer.
  `missing` is its current shortfall; `rate` is the existing native income rate.
- `waitMs` estimates the active duration required at that unchanged rate. It may
  exceed the selected interval. It is `null` for zero-income deficits, targets
  above `MAX_POINTS`, or durations that cannot be represented as safe integers.
  This estimate does not authorize credit beyond a cap or title-owned window.
- `reachable` says whether that target can be reached inside the inclusive
  interval `[fromMs, toMs]`. Only then is `readyAtMs` the earliest safe native
  logical timestamp that reaches it; otherwise `readyAtMs` is `null`.
  An already-funded target is ready at `fromMs`, even with no income or duration.
- No purchase, rate change, manual input, spending, pause or reward is forecast.
  Recompute after any of those changes. The caller still owns wall/logical time
  mapping, effort, scheduling, strict deadlines and eligibility. In particular,
  a title requiring readiness *before* its deadline must reject equality itself.
  An aggregate bank target is not a proof that a sequence of purchases is possible.

The first consumer is Mutualist's funded delivery scheduler and budget previews,
which otherwise repeat tick-phase and income arithmetic. Tests compare earliest
readiness with actual `advanceActive` at the quoted time and one millisecond
before it, including all 1,000 phases, saturation, safe-time boundaries, native
purchases/resets and both shipped worlds. Existing transition and save behavior
is unchanged; this is an additional read-only capability.

## Clock-free producer purchase quotes

`quoteProducerPurchase(world, run, producerId, requested)` from `/engine` returns
`{accepted, count, spent, rateGain}` for a possible purchase against the supplied
admitted balance. Refusals add `reason` and return zero for all three metrics.
The result contains no speculative state, clock timestamp, objective progress,
reservation or reusable purchase authority. `rateGain` uses the same current
upgrade/prestige rounding and income cap as the actual engine.

- `requested` is an integer from 0 through 100 or `'max'` (at most 100 units).
  Batches remain partial: buy as many as the balance and level cap permit.
  Zero, unknown, locked, capped and unaffordable requests retain the command's
  existing refusal reasons and validation order.
- The quote never settles time. Call `advance`, `advanceActive` or `project`
  explicitly first if a current observation should affect the balance. This
  keeps wall clocks and active-time policy with the caller.
- `buyProducer` still settles its supplied clock and recomputes the plan at the
  actual action. Never adopt a quote as a save or combine independent quotes as
  though they reserve a shared balance.
- Quote and command use one private planner and exact integer price recurrence.
  The planner walks to the current price once, then extends it per purchased
  unit instead of recomputing every preceding level for every unit.

Trace Garden and Pocket Observatory use this engine quote for both batch
previews after their normal projection. Rendering no longer simulates purchase
or objective transitions. Clicks still use the original command, and all saved
run kinds, progression rules, point arithmetic and package dependencies remain
unchanged. This additive API does not publish a package or update an external
title's pinned artifact. See `design/purchase-quotes.md` for the boundary and
native/consumer receiving obligations.

## Exact upgrade alternatives

`quoteUpgradePurchase(world, run, id)` from `/engine` reports the exact affordable
upgrade price and immediate production/tap gains without advancing time or
changing the run. It returns `{accepted:true, spent, rateGain, tapGain}`, or the
existing command refusal reason with zero metrics. It uses the same planner as
`buyUpgrade`, which still settles time and recomputes at the actual action.

Both Little Worlds show these quotes alongside purchase readiness. Production
gains include current inventory, additive bonuses, rounding and the output cap;
a listed percentage is not necessarily that percentage of current output.
Buying one choice changes the others. Quotes do not reserve funds, grant
objectives, simulate future purchases or replace saved runs. Old pinned title
artifacts remain unchanged. See `design/upgrade-quotes.md` for the full contract.

## Plan the next replant

`quotePrestige(world, run)` from `/engine` shows the current permanent spark
award, the exact production needed for the next higher award, incomplete action
objectives, and what the actual reset would clear and preserve. It is clock-free:
settle time explicitly first and always use `prestige` for the real action.

Both Little Worlds show this decision before replanting: points and inventory
lost, new permanent total and manual yield, and automatic production restarting
at zero. A full spark cap or unreachable higher target is stated explicitly.
Quotes do not reset or save runs, reserve sparks or complete objectives. The
shared award calculation uses bounded exact integer thresholds; save formats,
world balance and external titles' pinned artifacts remain unchanged. See
[replant planning](design/prestige-planning.md) for the public result contract.

## Native developer use

Node >=24, with the declared Computer Data and pinned JSNode fabrication supplier installed:

```sh
npm run check:generated
npm test
npm run build
python3 -m http.server --directory dist 8080
```

Open `http://127.0.0.1:8080/` and click, purchase a producer, let it grow, buy upgrades, reload, try the other world, and eventually Replant for permanent sparks. Every input action has a deterministic pure transition. `/assets/discrete-clock.mjs` is a **copied build artifact from the installed Computer Data supplier**, not another leaf implementation. The publisher reads the canonical package's exact resolved file and rewrites the engine's module specifier for static ESM browser loading; it does not ship a private package registry or start a second hosting system.

## Fabricate world rules from designs

Edit `design/world-catalog.json`, whose structural contract is
`design/world-catalog.schema.json`, then run `npm run generate`. The shared
JSNode module producer validates the declared data and fabricates the immutable
ESM catalog in `src/generated/world-definitions.mjs`; the game retains semantic
admission in `defineWorld`. No source editing is needed to add another world
within that contract. The original two worlds retain their game rules and saves.

`npm run check:generated` compares without writing. The build performs that same
check before creating output, so a changed design or hand-edited generated file
cannot silently reach the browser. `dist/fabrication-receipt.json` binds the
schema, catalog, generated source, clock supplier and static artifact bytes by
SHA-256. Read `design/README.md` for the requirement-to-receiving trace and save
compatibility boundary. These are deterministic data projections; algorithm
synthesis, isolated inference assays and production activation retain their
separate contracts.

## Purchase readiness

Each producer shows readiness for its next single unit; upgrades show their own
shortfall and estimated wait at the current automatic rate. Locked items instead
show the production still needed this run. Estimates pause for a backward device
clock, and disclose waits longer than one offline collection cap. Buy 10 and Buy
max retain their original partial-batch behavior (up to 10 and 100); the feedback
now reports the actual quantity and points spent. See the [presentation contract](design/purchase-readiness.md).

Before buying a batch, each producer also shows how many units Buy 10 or Buy max
would purchase now, the exact total cost, and the resulting increase in automatic
production. These are separate alternatives against the same balance, refreshed
after any purchase. Their previews and actual clicks use the original native
purchase transition. See [batch previews](design/batch-previews.md).

## Actual mechanics

- World rules are named typed records, not hardcoded browser conditionals; two different worlds exercise the same engine and save separately.
- Manual action gets play started immediately. Producer purchases use a geometric price ladder, with buy 1/10/max; purchases actually alter rate.
- Acquired upgrades increase manual or automatic output; later tiers unlock through **earned this run**, not current balance, so spending cannot relock things.
- Observed time is injected into pure source transitions; complete seconds accrue while the tab is closed, capped at each world's clearly disclosed offline maximum. A clock moving backwards cannot create output.
- Replanting spends accumulated run progress to award permanent sparks; production and manual actions improve afterward while per-run producers/upgrades reset.
- Invalid/incompatible saved state fails closed. A broken save is **not silently overwritten**; the player can export the raw bytes and explicitly clear it, or import an earlier saved JSON. No local browser save is authoritative value.
- Admitted live runs remain in this page while switching worlds, including when
  storage fails. Export uses that live run, not an older stored copy. Persistent
  warnings identify worlds needing export before closing; these drafts are not
  durable backups. Import/reset adopt replacement state only after an exact save
  readback. Observed conflicts pause automatic writes without discarding the live
  run. This is not atomic cross-tab synchronization; use one tab per world.
- Responsive, keyboard-operable, reduced-motion friendly; no external JS, CDN, client analytics, ad callbacks, social pressure, artificial playcounts or payment interfaces.

**Owners and boundaries.** Computer Data owns the generic safe-integer and discrete time quantization source. This package owns only game-specific state, progression and consumer UI. Metrologic/SignCell/SignChain/SignGraph/SignCraft are neither clocks nor pretend financial ledgers. `games-host` is the existing native HTTP game supervisor if a competent host operator later selects this static site; this package does not duplicate it.

**Receiving boundary.** `npm test` and `npm run build` exercise the source and static browser artifact. They do not prove the package version is published, a Cloudflare/Cold Red Gate host has selected these assets, or that a public user has played. No production route is declared here.

Runtime world admission requires string identities and dense record arrays in both direct engine and authored-design use. See [world admission](design/world-admission.md) for the boundary, intentional refusal of malformed custom definitions, and source/built consumer checks.


### Cancel a pending world reset

Little Worlds now provides **Cancel reset**. Resuming gameplay, selecting a world
or attempting an import also cancels pending erase confirmation, so a later reset
click cannot silently reuse an earlier decision. Exporting a backup and automatic
production leave an intentional confirmation open. The native source/built-player
check is `npm run test:reset-consumer`; see [browser recovery](design/browser-recovery.md).
