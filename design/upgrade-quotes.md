# One upgrade planner, visible player tradeoffs

## Requirement and original receiver

The shared engine already supplies exact producer batch quotes to Trace Garden
and Pocket Observatory. Upgrades still show a generic effect label and a price.
Their nominal percentage does not reveal the immediate output change: production
bonuses add to existing bonuses, and income rounds down and saturates. Players
need the actual effect before spending rather than a second browser economy.

Add a clock-free upgrade quote to the existing engine entrance. Use one private
planner for that quote and the actual purchase. Both existing browser worlds
receive it; no new engine, dependency, world definition, balance or save format.

## Public contract

`quoteUpgradePurchase(world, candidate, id)` admits and copies the same run as
other engine entries. It returns `{accepted:true, spent, rateGain, tapGain}` for
an affordable, unlocked, unowned upgrade. The deltas compare native income and
tap yield before and after installation, including existing inventory, bonuses,
rounding and output saturation. A production upgrade with no producers can have
zero immediate gain even though its bonus applies to future producers.

Refusals return `{accepted:false, reason, spent:0, rateGain:0, tapGain:0}` with the
command's existing precedence: unknown-upgrade, already-owned, locked, then
insufficient-points. Malformed saved runs throw during admission. No clock is
read, no time is settled, and no balance, inventory, objective or save is changed.
The quote contains no speculative resulting run.

The actual `buyUpgrade` first settles its supplied time, then recomputes through
the same planner and applies the existing debit, inventory and objective update.
Its result shape is unchanged. Quotes are independent alternatives, not reserved
funds, combined budgets, purchase authorization or future income forecasts.

## Browser receiving

After normal projection, each affordable upgrade displays exact cost and gain
per action or per second. Production previews say the gain is at current inventory
and explain zero immediate gain. Owned, locked, poor and damaged-save rows replace
their old preview explicitly. Buttons reference readiness and preview text, and
the click uses the original native command rather than a stored quote. Purchases
report the exact cost and refresh every other choice. Switching worlds, import,
reset and storage failures retain their original behavior.

## Qualification and boundaries

Run original check:generated, full npm test and build commands. Engine tests
cover all shipped upgrades, quote/command parity, independent alternatives,
negative admission, objective purity, delayed execution, zero production,
rounding and saturation. A separate browser test imports actual source and built
module graphs in both worlds with DOM/storage doubles. A packed core-only
consumer must receive the same public entrance without optional browser or build
peers. Do not claim these controls are actual browser rendering, accessibility,
cross-tab concurrency, human play, package publication or live deployment.
