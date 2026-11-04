# Recoverable local play in Little Worlds

This is a browser-adapter correction for the existing Trace Garden and Pocket
Observatory, not a new game rule, idle-engine API or accepted Mutualist mechanic.
The core engine, world catalog, native state kinds, storage keys, purchase rules,
offline caps and prestige remain unchanged.

## Reproduced obstruction

At original owner main `df09849d80f774593ba017a5e580555829c9328e`, the real browser
module was exercised with deterministic fake DOM/storage callbacks, both directly
and after the native static build. With one saved tap and four later taps whose
writes failed, the display showed five but Export returned one and claimed a
successful copy. Switching worlds and returning discarded the four unsaved taps.
When storage reads threw, even valid live progress could not be exported.

A successful import write followed by a read error could also leave a blocked
placeholder while claiming import success. A blocked initial read later returning
no saved value could export a fabricated empty run. Simulated write-then-throw
faults exposed incorrect unchanged-storage wording; this is adapter fault
hardening, not evidence that native Web Storage mutates on a failed write.

These obstruct the existing promise of keeping and exporting local progress and
the cultivation requirement's saved return. They do not justify new resources,
longer contracts or prestige rewards in Mutualist.

## Browser-owned custody

- Each of the two declared worlds retains its admitted live run for this page's
  lifetime. Switching worlds does not discard it when saving fails. Returning
  still uses the existing native capped offline advancement.
- Export of a playable run serializes live state without reading storage. Export
  of a blocked save instead preserves the original raw text when available; a
  placeholder is never presented as real progress.
- A separate persistent message names worlds with saving trouble. Ordinary
  action feedback cannot silently hide it. Unsaved drafts disappear on page
  closure/reload, so the player must copy them elsewhere first.
- Automatic writes first compare the observed stored text with the last verified
  value, then use the existing write/readback helper. A mismatch pauses automatic
  writes; it neither overwrites the conflicting observation nor discards local
  progress. A write/read failure can retry only if the next preflight still sees
  the expected value. No retry is performed inside a failed write operation.
- Explicit import and confirmed reset are replacement choices. Their admitted
  candidate becomes the live run only after an exact readback. Failure retains
  the prior live state and warns that storage may have changed. A successful
  import does not reread storage into a placeholder. Reset keeps the existing
  two-click confirmation and writes a verified fresh run.

Read/compare/write/read is **not atomic compare-and-swap, locking, rollback or a
durability guarantee**. Another writer may change bytes between observations or
after success. Use one tab per world. A failed post-write verification cannot undo
the storage side effect. The guarantee is preserving local progress and reporting
what was actually observed, not a transactional browser store.

## Supplier direction and exact receiving

Gamehouse owns the already-shared `writeVerifiedSave` operation. Its exact source
is commit `08904b638b3d474103188d7cb237a0b08e6ce1fb`, merged through
[PR25](https://github.com/red-cup-engineering/computer-game-systems-engineering-services-section/pull/25).
The source checkout installs the native six-member artifact with SHA-256
`3e54825181d9a1722933d4712dea32d7875e6df41cb76b31a9deba68d7353172`.
The resolved helper itself has SHA-256
`fe0bfb8a06e7864a1302abc3a0bac5a5de62a344a12c3011f0f1fc9df1ba09f7`.

That 6,207-byte archive has no dependencies or peers. Only the browser module
imports its narrow entry. It is an optional peer plus a development artifact in
this owner; the three core runtime entrances still require only Computer Data.
The static build emits only the helper and records `browserSupplier` alongside
all emitted file hashes. The exact artifact is not a registry publication and
the peer version alone does not establish these source bytes. A caller selecting
the browser/build entrance must provide this qualified supplier; a core-only
caller does not need it.

Native source and freshly built-module tests exercise both worlds, persisted and
failed saves, switching/return, live exports, blocked raw exports, replacement
failures, retries and observed conflicts. They establish deterministic module
behavior with simulated storage, not real-browser rendering, storage lifecycle,
cross-tab interleavings, human comprehension, durability, deployment or release.

The native suite passes 140 tests, including 45 source/built recovery checks. A
healthy-storage comparison matched 67 checkpoints across prior main, current
source and current built browser: exact exported state, both stored-world byte
strings and gameplay display. It exercises both worlds' producer modes and
upgrades, fractional/capped time, prestige, import/reset and world return.

A fresh locked development install receives 138 packages. All 137 pre-existing
non-root lock entries are unchanged; only this browser supplier is added. A
separate packed core-only consumer installs ten packages with both optional peers
omitted and executes the two worlds and the 38 runtime-only native tests. Tests
which import the generator are intentionally outside that core-only contract;
the full suite runs with its declared development suppliers. No Mutualist rule
or artifact update is required by this browser-only change: its selected engine,
transactions and generated-world modules are byte-identical to prior main.
