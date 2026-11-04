# Replant planning from the original progression engine

## Requirement and receiver

Trace Garden and Pocket Observatory already use the same production and reset
rules, but the Replant button only names the current award or first threshold.
Players cannot see the next award milestone or the inventory and income they
will lose. Add one clock-free engine quote and receive it in both existing
browser worlds. Do not add a second progression model, alter world balance,
change saved runs or publish a new dependency artifact for external titles.

## Engine contract

`quotePrestige(world, candidate)` from the existing `/engine` entrance admits the
run and returns detached decision data, never a saved run:

- `accepted` and `awarded` match `prestige` at the admitted state's `lastMs`.
  Refusals have the command's unchanged `reason` and award zero sparks.
- `productionAward` is the award supported by current run production, ignoring
  incomplete action objectives but respecting the remaining permanent cap.
  `remainingCapacity` is the number of sparks available before that cap.
- `missingObjectives` contains only unfinished objectives, each as
  `{id, label, progress, count}`. Quoting never advances these actions.
- `next` is `{awarded, runProduced, missingProduced}` for the next higher
  production award. The award is the total for this replant, not lifetime sparks
  or additional sparks beyond the current quote. The threshold is the exact
  integer product `prestigeThreshold * awarded * awarded`. This target does not
  waive objectives. It is null when the permanent cap limits the current award,
  or the next target exceeds the admitted point cap. A missing target is not a
  promise that more earning is possible.
- `reset` is null on refusal. On acceptance it summarizes the actual reset:
  new permanent `prestige`, new `tapYield` and `rate`, `bankedLost`, total
  `producerUnitsLost` and count of `upgradesLost`. Automatic rate starts at zero
  because the reset clears every producer. Permanent sparks, lifetime production
  and lifetime tap totals are preserved by the native command. Per-run production,
  inventory, upgrades and optional action objectives are cleared.

The quote never reads or advances a clock, earns production, spends points,
resets state, reserves an award or writes a save. A later command settles its
actual supplied time and recomputes. Spending can change the reset losses
without changing this run's production; objectives and later production can
change eligibility or the award. Recompute after all changes.

The quote, `availablePrestige` and `prestige` use one bounded integer threshold
calculation. Binary search over at most 1,000 sparks compares BigInt products,
so neither a large squared threshold nor a floating-point square root is taken
as proof of eligibility. The quote and command summarize/apply one reset helper.
The ordinary command result, refusal precedence, state kinds, clocks and world
parameters are unchanged. This is a planning improvement, not a balance change.

## Browser receiving

The normal projection settles time once. Rendering then asks for the quote,
shows exact production/award/next-target values and explains the losses and new
manual/automatic yields. The button references the status and preview for
assistive technology, with no continuously announced progress stream. Missing
objectives, a full permanent cap, an unreachable higher threshold and a damaged
save have explicit text rather than stale eligible previews. Clicks still call
`prestige` with the current state and clock, not the displayed quote.

## Qualification

Use the repository's frozen dependencies, Node 24, original check:generated,
full npm test and static build. Native quote tests cover reset parity, all
reachable shipped-world spark thresholds and their integer neighbors, large
custom worlds, production and objective caps, malformed saves, no-clock purity,
spending, objective isolation and delayed commands. Source and built consumer
tests cover both shipped worlds and a temporary objective-bearing world,
imports, reset, switches, blocked saves, storage failures and repeated handlers.
A packed core-only consumer must import this exact source without optional build
or browser peers. Compare old/new commands on admitted states to catch accidental
progression changes. Inspect the full diff and verify remote source bytes.

DOM/storage doubles and native HTTP checks do not establish actual browser
rendering, accessibility, cross-tab safety or human play. Existing externally
pinned artifacts remain unchanged; package publication, live deployment and
runtime installation are separate, unperformed actions.
