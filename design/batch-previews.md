# Preview an affordable producer batch

Little Worlds already lets a player buy one, up to ten, or up to one hundred
producers. The next-unit price alone does not tell them what Buy 10 or Buy max
will actually purchase. This consumer change reveals the quantity, exact total
cost and added automatic production before the player spends their points.

## Contract and original owners

- The shared engine in this repository still owns all purchases. After the
  ordinary render settles the selected run, the browser calls the existing pure
  `buyProducer` transition for each batch at the same observed time. It reads
  that detached result without adopting it, recording objectives or saving it.
  This adds no alternative price ladder, quote API or game-state schema.
- A preview is an independent alternative against the current bank, inventory,
  unlocks and rate. It is not a reservation, a promise that multiple previews
  can all be purchased, or an offline forecast. Buying any item refreshes every
  alternative. The actual click invokes the ordinary transition again using
  the current state and time, never a stored speculative result.
- Cost and added production use full integer formatting, including large late-
  game costs. The gain is the difference between the engine's actual total
  rates, so upgrades, prestige, integer rounding and saturation are included.
  Purchase feedback uses that same exact integer cost instead of rounding it
  into a compact suffix. Main progress counters retain their current format.
- The existing limits and partial-batch rules remain: Buy 10 buys up to ten,
  Buy max up to one hundred, subject to current affordability and level caps.
  Unaffordable, locked and capped batches do not claim a purchasable quantity.
  An unreadable save never displays a preview based on its blocked placeholder.
- Each bulk control is associated with its visible preview as well as its
  next-unit readiness description. Preview paragraphs are not live regions.
  Existing responsive layout is retained; no pixels or assistive-technology
  behavior are claimed without actual browser qualification.

The world catalog, generation, core engine, save/recovery policy, suppliers and
lockfile are unchanged. Computer Data remains the clock owner and gamehouse the
verified-save helper owner. This change is in their original browser consumer,
not a separate game or replacement stack.

## Qualification

`test/batch-preview.test.mjs` executes the original source browser and emitted
static browser module graphs against the generated HTML with DOM/storage
doubles. It checks both worlds, partial and maximum batches, every producer,
exact large costs, upgrade/prestige rounding, alternatives sharing a balance,
delayed clicks, backward clocks, import/reset/world switches, corrupt saves,
storage failures, and descriptive associations. Preview-only renders preserve
the real run and saved inventory. Successful clicks must equal the original
native purchase result. Existing recovery and readiness tests remain in the
native aggregate, with the readiness association check allowing the additional
batch description.

These tests and the static build are source/consumer evidence, not browser
rendering, accessibility acceptance, public deployment or package publication.
