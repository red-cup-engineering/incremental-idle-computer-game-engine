# World design and fabrication contract

The authored input is `world-catalog.json`, admitted by the JSON Schema in
`world-catalog.schema.json` and the engine's `defineWorld` semantic operation.
The generated output is `src/generated/world-definitions.mjs`. Change the input
and run `npm run generate`; `npm run check:generated` checks without writing.
The static build refuses stale source before creating its output.

This is deterministic fabrication of declared data into ESM. The original
JSNode module producer owns that transformation. No inference, source prompt,
new code generator service, package publication or production deployment is
part of this operation. The same producer can fabricate other schema-admitted
content catalogs without introducing a game-specific emitter.

## Requirements and receiving

| Requirement | Machine guarantee | Receiving evidence |
| --- | --- | --- |
| GAME-DESIGN-001: rules are authored as data | A closed structural schema admits the complete catalog before projection. Unknown fields, missing data and out-of-range numbers refuse. | Independent schema/refusal cases in `test/design-fabrication.test.mjs`; upstream data-module assays. |
| GAME-DESIGN-002: valid rules form a playable world | `defineWorld` checks unique producer/upgrade IDs, an initially available producer and progression invariants; catalog world IDs are unique. | A newly authored third world reaches the real progression engine without engine or UI changes. |
| GAME-DESIGN-003: preserve earned play | The original two worlds retain all IDs, prices, yields, unlocks, caps and prestige thresholds; the state format remains v1. | Original engine tests plus catalog equivalence and save/return/prestige scenarios. |
| GAME-DESIGN-004: source follows design | One captured schema/catalog snapshot deterministically projects source; `--check` refuses missing or different bytes and never rewrites them. | Fresh generation, no-change regeneration, changed design and stale source cases. |
| GAME-DESIGN-005: generation is bounded data processing | The shared producer validates strict JSON, confines output paths, emits frozen standalone ESM and preserves data without evaluating it as source. | Original producer's independent data-module tests, including hostile strings and keys. |
| GAME-DESIGN-006: a build retains its basis | The build records raw schema/catalog digests, generated-source digest and the actual static artifact digests. Its game source and supplier files are read once for the output. | Build tests import the emitted browser modules and compare receipt hashes with bytes. |

The schema covers representation. JSON Schema cannot express uniqueness by a
selected `id` property or the game's progression relationships, so those stay
with the existing semantic owner. Both admissions run before a generated file
is replaced. Write failure preserves the old generated file through a sibling
temporary file and rename. Invalid input never authorizes deleting or replacing
a player's saved state.

## Refinement and preserved source

The initial catalog was migrated from `src/worlds.mjs` at game commit
`d833f6525c55e15ab74fd992dae8bef7803a30e2`. It contains Trace Garden and Pocket
Observatory with their existing numerical rules. This work supplies a reusable
fabrication consumer; it does not replace Stoke, Flickering or You Are Conscious,
change their replay semantics, or establish a public route for Little Worlds.

The shared module producer is pinned to an immutable Git revision in this
package's development dependencies. Computer Data remains the exact declared
runtime clock supplier. Build-time dependencies are not shipped to the browser.
The browser receives only generated data and the established progression engine.

Future rule changes must assess existing saves explicitly. Keeping an ID while
changing numerical rules changes the interpretation of an existing run; this
catalog mechanism alone is not a migration or versioning policy.

## Optional action objectives for prestige

A world may opt into `prestigeObjectives`, a nonempty list of at most 16
records. Each record has a globally unique `id`, short `label`, `action`
and positive integer `count`. Supported actions are:
- `tap`: no target; count at most 1,000,000 discrete manual actions.
- `buy-producer`: `targetId` names an existing producer; count at most
  1,000 units actually purchased during this run, including bulk purchases.
  The final required unit must also cost no more than the engine's point cap;
  objectives requiring an unreachable purchase are refused.
- `buy-upgrade`: `targetId` names an existing upgrade; count must be 1.

Every objective must complete in the current run before the existing
production-based prestige award becomes available. Objectives gate the award;
they do not mint points, increase the award, replace the earnings threshold or
remove the prestige cap. Progress saturates at the declared count. Failed
actions do not advance it. Offline production and projection never count as
manual actions. Prestige resets all objective progress, run taps, producers
and upgrades; lifetime totals retain their existing meaning. Several objectives
can observe the same action; all must be met.

Example (test fixture, not a Mission: Mutualist design):
```json
{
  "prestigeObjectives": [
    {"id":"practice","label":"Make two manual actions","action":"tap","count":2},
    {"id":"equip","label":"Buy two pencils","action":"buy-producer","targetId":"pencil","count":2}
  ]
}
```

Only opted-in worlds use `561.incremental-idle-state/v2`. They store
`runTaps`, `objectiveProgress` and `objectiveContract`, the canonical JSON
serialization of [id, action, target-or-null, count] tuples sorted by objective ID.
Admission requires an exact contract, exact progress keys, bounded integers,
and consistency with run taps/current inventory. Labels and display order can change without
invalidating saves. Changing objective identity, target, count or action
requires an explicit future migration or a distinct world identity. Adding
objectives to a v1 world refuses its old saves rather than inventing completion.
No automatic v1-to-v2 migration is offered. Use a new world ID for new objective
content to preserve the original saved world. The existing browser storage-key
namespace stays unchanged, and refused imports never overwrite stored data.

Worlds without objectives retain the same catalog, generated world data, v1
save shape, projections, prestige formula and reset behavior. The original
catalog remains unchanged. New optional schema data passes through the same
JSNode generator, runtime admission and static publisher; no parallel emitter
or clock exists. Source generation cannot admit arbitrary callbacks.

These are local game objectives, not organizational missions certified as
complete. Saves can be edited by their owner; structural admission is not an
anti-cheat mechanism or proof of real-world work. This supplies an engine
primitive for later title-specific design. It does not invent Mission:
Mutualist's mission taxonomy, economic balance, narrative, completion authority,
external-system bridge or finished title. UI progress is surfaced using literal
text. Automated tests receive the static module graph; no visual/browser-user
acceptance or public deployment is claimed.
