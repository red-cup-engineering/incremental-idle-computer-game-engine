# Exact bounded production

The engine's admitted worlds allow each producer's integer rate up to MAX_POINTS
(10^15), up to 1,000 owned units, and up to 16 producer records. Up to 16 production
upgrades contribute positive percentage bonuses, and prestige contributes 20%
per spark. These valid inputs can create intermediate products beyond JavaScript
Number's exact-integer range even when the final rate remains below MAX_POINTS.

The production contract is:

1. Sum every producer's rate times its owned quantity exactly.
2. Multiply that aggregate by 100 plus owned production-upgrade percentages plus
   20 times prestige. Tap-only and unowned upgrades contribute nothing.
3. Divide by 100 and floor once, after aggregation. Every admitted operand is
   nonnegative, so integer division implements the required floor.
4. Clamp to MAX_POINTS and return an ordinary Number.

`incomePerSecond` owns this calculation. BigInt is confined to its intermediate
arithmetic, like the existing exact producer-price and prestige calculations.
No BigInt enters a state, public result or JSON save. Settlement, production
forecasts, producer and upgrade purchase gains, projection and prestige reset
continue to select this one implementation. No additional clock, balance,
producer or browser-side arithmetic is introduced.

## Compatibility

Recorded balances, lifetime totals, inventory and objective progress are admitted
unchanged. There is no migration and no retroactive credit or debit. Only future
production and derived quotes are corrected for designs that hit the Number
precision boundary. Existing supplier pins, authored world catalog, generated
worlds, public signatures, save kinds and rejection rules remain unchanged.
The original two shipped worlds retain their production across their bounded
inventory/bonus ranges. This change does not publish an engine release or update
an external title's pinned engine artifact.

## Receiving evidence

`test/production-arithmetic.test.mjs` checks an independent bounded-Number
quotient/remainder oracle against every single-upgrade amount, all prestige
levels and both shipped worlds. It covers aggregate flooring, zero production,
production-only bonuses, maximum inventories and saturation. Concrete regression
cases include both a one-point overcredit and undercredit and an early cap:

- Base 100000000000099, bonus 1%: 101000000000099, not 101000000000100.
- Base 100000000000100, bonus 261%: 361000000000361, not 361000000000360.
- Base 847457627118644, bonus 18%: 999999999999999, not 1000000000000000.

Native transitions check exact accrual, retained fractional time, earliest target
readiness, old-rate settlement before an upgrade, purchase gains, reset, JSON
roundtrip and nonmutation. `test/production-receiving.test.mjs` sends the three
regression designs through the existing world generator and static publisher,
then runs the actual source and built browser modules through timer, upgrade,
world-switch, export, exact save readback and reload flows. Its DOM and storage
adapters do not establish actual browser layout, native storage concurrency,
accessibility or human play. Fixtures leave shipped designs and outputs intact.
