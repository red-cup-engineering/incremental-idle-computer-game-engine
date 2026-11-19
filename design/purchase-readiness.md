# Purchase readiness in the original Little Worlds browser

The player should be able to decide whether to keep tapping, wait for automatic
production, or choose another purchase without guessing from a disabled button.
The original presentation used bank-target forecasts only after an item unlocked.
Combined purchase forecasts now add an engine-owned planning capability for
locked items in the same two-world browser. The world catalog, save formats,
dependencies, purchase rules and player control remain unchanged.

## Contract

- Each producer explains the next **single** unit, not a promised batch. Existing
  Buy 10 and Buy max retain their partial-purchase behavior. Successful purchase
  feedback states the actual number bought and amount spent.
- Each unowned upgrade explains its own price. A locked item shows remaining
  production this run and any balance shortfall separately. Its wait estimate
  covers both requirements, explicitly saying "until unlocked and affordable".
  Controls remain disabled until the native purchase is actually available.
  Owned upgrades and capped producers do not invite another purchase.
- An unaffordable item shows its balance shortfall. With no automatic
  income it tells the player to use the world's manual action. Otherwise use the
  engine's pure `forecastProducerPurchase` or `forecastUpgradePurchase`, after
  the normal render projection, to estimate the wait at unchanged income.
  Do not duplicate tick arithmetic.
- Round displayed wait upward to a whole second. Clearly label it an estimate at
  the current rate, excluding future spending and manual actions. A wait beyond
  one offline collection cap is disclosed rather than promised as a single
  away-time result. Unreachable prices above the balance cap get no countdown.
- A backward clock pauses idle estimates until it catches up with saved time.
  Already-funded purchases still read ready. Invalid saved runs remain blocked;
  no placeholder should display a readiness estimate.
- Recompute after purchases, upgrades, manual actions, prestige, imports, resets,
  world changes and the original render interval. Readiness never advances time,
  changes inventory, grants unlocks, writes storage or executes a purchase itself.
- Keep descriptions visible beside controls, with programmatic associations to
  each relevant button. Avoid a live region that announces every countdown.

## Shared planning API

Both functions are exported from the existing `/engine` entrance:

- `forecastProducerPurchase(world, run, producerId, fromMs, toMs)` forecasts
  only the next single unit at its current exact geometric price.
- `forecastUpgradePurchase(world, run, upgradeId, fromMs, toMs)` forecasts
  one unowned upgrade at its declared cost.

Both admit the run and the same active interval as `advanceActive`. They return
`cost`, `missingBanked`, `missingProduced`, `rate`, `waitMs`, `reachable`
and `readyAtMs`. No state or speculative purchase is returned. The cost and
deficits are null for an unknown item or capped producer. Structural refusals
add `reason`: unknown-producer, unknown-upgrade, level-cap, price-cap, or
already-owned. All have null wait/arrival and false reachability.
For price-cap, cost is the existing `producerPrice` sentinel `MAX_POINTS + 1`,
not an exact arbitrary-large price. Its displayed deficit is not a reachable
funding target. A capped producer instead has null cost and both null deficits.

Banked stock and production this run each grow by the same native income but
saturate independently. Required new production is the larger of the two
deficits, not their sum. In particular, adding a production deficit to an
already-full bank would incorrectly make a reachable unlock exceed the balance
cap. The common exact integer wait calculation preserves the native fractional
tick and never uses a floating-point division for large durations.

`waitMs` estimates active duration at the unchanged rate. It may exceed the
selected interval or one offline cap. Only `reachable` and `readyAtMs` attest
that the selected interval suffices, including its endpoint. Zero income yields
a null wait unless both requirements already hold. An unsafe duration has no
estimate; an unrepresentable future timestamp is never returned. A title with
an exclusive deadline must reject equality itself. Backward clocks, stale
phases and oversized active intervals are refused, just as by `advanceActive`.

These are separate alternatives, not a shopping plan. Spending, tapping,
changing income, resetting or another purchase can invalidate an old forecast.
Actual purchase commands always settle and check afresh. Forecasting does not
grant objective progress, reserve stock or automatically buy anything. Buy 10
and Buy max retain their original partial-purchase semantics.

## Qualification

Test the actual source browser and static-built browser with the existing native
DOM/storage harness. Include both worlds, zero income, current income, retained
fractional time, locked/owned/capped states, above-cap prices, clock reversal,
spending/rate changes, partial batches, reset/import/world switching and blocked
saves. Compare the resulting run to the unchanged native transitions. Existing
aggregate tests, generation freshness and build remain the owner gates. Native
DOM tests are not evidence of real-browser rendering or human usability.

`test/purchase-forecast.test.mjs` checks independent stock/unlock constraints,
both caps, all 1,000 fractional phases, exact acceptance and refusal one
millisecond before readiness, safe-time boundaries and continued active play
versus one capped offline return. `test/purchase-forecast-consumer.test.mjs`
plays both shipped worlds through source and built controls and sends an
unlock-above-price design through the actual generator and publisher. The
synthetic design leaves the shipped catalog and generated worlds untouched.
