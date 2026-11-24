# Exact producer prices and saved play

## Requirement and original owner

The shared engine owns producer quotes and purchases. Prices follow the authored
base cost and basis-point growth: start at the base cost and, after each owned
unit, round the scaled integer price upward. This is a per-level recurrence,
not a single exponential rounded at the end. The two Little Worlds titles use
that same engine for their displayed quote, readiness and accepted debit.

Both admitted input values and returned prices fit in exact JavaScript Numbers,
but multiplying a high price by its basis-point factor does not. The previous
floating intermediate misquoted 20 reachable catalog prices, sometimes by five
points: Trace Garden's pencil at levels 189–193 and loom at 112–120, and Pocket
Observatory's antenna at 157–162. Quotes could be too high or too low. For example,
pencil level 189 must cost 478468290980832, not 478468290980831; loom level 120
must cost 832334085125218, not 832334085125223.

The repair computes the recurrence with native integer arithmetic and converts
only the bounded result back to Number. No supplier, cache, alternate engine,
price table or browser rule is introduced. The original MAX_POINTS + 1 sentinel,
level cap, monotone prices and per-purchase rounding remain in place. The five
other catalog ladders and all eight first-unreachable levels are unchanged.

## Saved-run compatibility

Existing v1/v2 state fields and admission shapes are unchanged. A saved balance,
inventory, earnings, clock, upgrades, prestige or objective progress is not
recomputed. No historical refund, redebit, new save field or migration occurs.
An admitted saved run receives corrected quotes only for future purchases. A
one-point shortfall now refuses where a floating underquote wrongly admitted it;
exact funding now succeeds where a floating overquote wrongly refused it.

For the two shipped worlds every previously valid save remains admissible. This
is not a blanket compatibility claim for custom world definitions: objective
admission checks whether the final required producer is affordable within the
point cap. A custom base cost of 999300489657240 with growth 10007 was incorrectly
rounded to the cap for the second unit; its exact next price exceeds the cap.
That count-two objective is now correctly refused as unreachable. An author must
repair/version such a custom design before loading it. This does not silently
rewrite either its design or saved progress. Existing separately pinned consumer
artifacts retain their own source until their owner receives a new artifact.

## Qualification

- Native engine tests compare all eight catalog ladders through level 1000 with
  an independent bounded-number quotient/remainder oracle, plus every admitted
  basis-point factor at representative integer and cap boundaries.
- Literal regressions, exact cap and cap-plus-one cases, gradual per-level
  rounding, invalid inventory levels, objective reachability and v2 progress are
  checked independently of browser formatting.
- Old-shaped saved runs are admitted unchanged; single and bulk purchases agree
  with independently quoted sequential debits. Forecasts and purchases agree on
  the first real production tick; failed purchases leave state intact.
- The actual source and emitted Little Worlds browser modules receive high-level
  saves in both titles, refuse a one-point deficit, accept exact funding, persist
  zero remaining balance, switch worlds, export and reload without further debit.
  Native DOM/storage doubles are used. These are not real-browser rendering,
  accessibility, storage concurrency, human playtest or deployment evidence.

Run the existing `npm run check:generated`, `npm test`, and `npm run build` gates.
The focused new suites are `test/producer-prices.test.mjs` and
`test/price-receiving.test.mjs`. The catalog, generated worlds, build protocol,
browser source, save policy and dependency closure are unchanged.
