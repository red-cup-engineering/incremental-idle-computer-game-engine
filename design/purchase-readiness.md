# Purchase readiness in the original Little Worlds browser

The player should be able to decide whether to keep tapping, wait for automatic
production, or choose another purchase without guessing from a disabled button.
This is a presentation change to the existing two-world browser consumer. It
retains the engine, world catalog, save formats, dependencies and purchase rules.

## Contract

- Each producer explains the next **single** unit, not a promised batch. Existing
  Buy 10 and Buy max retain their partial-purchase behavior. Successful purchase
  feedback states the actual number bought and amount spent.
- Each unowned upgrade explains its own price. A locked item shows remaining
  production this run, not a balance forecast that implies it is buyable. Owned
  upgrades and capped producers do not invite another purchase.
- An unlocked unaffordable item shows its balance shortfall. With no automatic
  income it tells the player to use the world's manual action. Otherwise use the
  original engine's pure `forecastProduction`, after the normal render projection,
  to estimate the wait at unchanged income. Do not duplicate tick arithmetic.
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

## Qualification

Test the actual source browser and static-built browser with the existing native
DOM/storage harness. Include both worlds, zero income, current income, retained
fractional time, locked/owned/capped states, above-cap prices, clock reversal,
spending/rate changes, partial batches, reset/import/world switching and blocked
saves. Compare the resulting run to the unchanged native transitions. Existing
aggregate tests, generation freshness and build remain the owner gates. Native
DOM tests are not evidence of real-browser rendering or human usability.
