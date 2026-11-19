# One producer purchase planner

## Requirement and existing receiver

Little Worlds already displays exact batch count, total cost and rate gain in
both shipped worlds. Its browser obtained each preview by executing the full
pure purchase transition, discarding a simulated run and objective updates.
The engine also re-walked the whole integer price ladder for each purchased
unit. Other titles should not copy this presentation-time transition pattern.

Provide an additive clock-free quote at the existing engine entrance and keep
one canonical planner for quote and command. The actual browser is the first
receiver. No new package, dependency, workflow or engine implementation is
introduced. A consumer of an older pinned package keeps its older API until it
explicitly receives a new qualified artifact.

## Contract and compatibility

The caller supplies an admitted run and chooses whether to settle time before
quoting. The quote returns accepted/count/spent/rateGain or an explicit reason
with zero metrics. It returns no resulting run and does not call the clock,
credit production, debit balance, grant objectives or save. Metrics use the
existing native income rate, including rounding and saturation.

The actual command advances at its caller-provided time, plans from that
settled state, and then applies the debit, inventory and objective changes.
It retains the exact original result shape and refusal precedence. Quotes are
independent alternatives against one balance; none reserves funds or binds a
later command. The price calculation uses the existing exact integer ceiling
recurrence, starting once at the owned level and continuing once per unit.

Preserve partial batches, requested integers 0..100, max=100, MAX_LEVEL,
MAX_POINTS, locked producers, saved-run formats, fractional/offline/backward
clock behavior, objective progress, upgrade/prestige rounding and rate caps.
No game world definition or economy balance changes.

## Receiving

Run the repository's check:generated, full native test suite and static build.
The purchase-quotes tests check the public package entrance, independent
integer-decomposition oracle, all shipped producer ladders, partial/level/point
limits, malformed inputs, objective non-mutation, delayed execution, quote
isolation, and explicit clock composition. Existing batch-preview tests drive
actual source and built browser module graphs in both worlds, including
storage faults and delayed clicks. DOM/storage doubles are not a claim of
real-browser rendering, accessibility, storage concurrency or human play.

Receive a packed engine with its original runtime closure and optional browser
and generation peers absent. Verify quote/command equivalence in that actual
installed consumer, with no working-tree supplier link. Keep generated static
artifacts and package installation distinct from public release/deployment.
