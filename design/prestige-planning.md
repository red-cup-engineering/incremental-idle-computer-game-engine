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
save have explicit text rather than stale eligible previews. Confirmed replanting
calls `prestige` with the current state and clock, not the displayed quote.

### Deliberate replant decision

Players must be able to inspect an available replant without destroying the
current run. The original one-click browser handler immediately removed all
banked points, producers, upgrades and objectives. The engine's reset remains
correct; this is a browser decision boundary for both shipped worlds.

- **Review:** activating Replant opens separate Confirm and Cancel controls.
  It must not advance time, write storage or call the reset command. Repeating
  the original button remains review-only, so a double click or held Enter on
  it cannot commit the reset. Focus stays on that original control; Confirm is
  the next button in document order, not the newly focused repeat target.
- **Confirm:** the distinct confirmation applies the original native `prestige`
  command once against current state and time. It closes the decision and
  returns focus to manual play. Repeated or stale confirmation handlers outside
  an open review do nothing. The existing guarded save owns persistence and
  continues to retain unsaved live progress when storage fails.
- **Cancel:** Cancel or Escape from Replant or either confirmation control closes the
  decision without changing run or storage and returns focus to Replant.
- **Invalidate:** manual play, producer/upgrade decisions, an import attempt
  (including refusal or failed writes), selecting either world and beginning a
  full reset cancel old replant consent. Opening replant review cancels any
  pending full erase. The two decisions can never both be armed.
- **Keep reviewing:** timer production and backup export retain the decision.
  The existing exact preview and confirmation award refresh with production;
  they are not a frozen quote or reserved award. Damaged saves cannot arm it.

State model: closed → review on an eligible original activation; review → closed
on confirmation, cancellation or invalidating action; review → review on timer,
export or repeated original activation. Only the confirmed transition invokes
the existing reset. World definitions, progression, save format and engine API
remain unchanged.

`test/replant-confirmation.test.mjs` exercises these transitions through the
complete source and built browser module graphs for both worlds, using ordinary
Node tests and the existing browser-platform adapter. Adjacent objective,
readiness, reset and prestige consumers now use the separate confirmation when
they intentionally request a reset. The adapter preserves built HTML attributes
so visibility, disabled state and accessible-control references can be asserted.
It is not a browser, layout renderer or native keyboard automation.

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
