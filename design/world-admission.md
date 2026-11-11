# Runtime world admission

## Receiving scenario

A game author uses the exported `defineWorld` API directly or writes a catalog
for the existing JSNode design generator. Both paths must reject identities
that are not strings before producing a world, inventory or saved run. An
accepted world must not hide missing producer, upgrade or objective records
until play starts.

## Component contract

- A world definition is a non-array object with the existing kind and ID syntax.
- World, producer, upgrade and objective IDs must be primitive strings. A
  missing field, null, boolean, boxed string, array or coercible object is not an
  identity. Validation never uses an identity's coercion method.
- Each collection has its existing 1..16 record bound and an own record at every
  integer index. Sparse and inherited-index records are refused.
- Existing ID syntax, uniqueness across record categories, prices, progression,
  objective rules and defensive record copies remain unchanged.

The engine owns admission and gameplay. The generator still owns JSON Schema
admission and deterministic source projection; it does not generate this
algorithm. The browser build copies the same engine, not a second validator.
No supplier versions, save format, catalog or generated source change.

## Refinement and verification

Check the primitive ID type before the regular expression to prevent JavaScript
coercion. Check dense own indices before map-based row validation so omitted
rows cannot escape validation. Reject array/function world containers before
reading game fields.

`test/world-admission.test.mjs` and `test/world-admission-consumer.test.mjs`
derive direct-runtime and built-engine negative cases from these clauses, keeps valid string IDs such as `undefined` and
`constructor`, and exercises purchase and JSON save round trips. The same
malformed JSON identities are refused by the existing authored-design generator
without replacing generated source. Native tests retain both existing browser
worlds, source/built play, storage recovery and design fabrication scenarios.

This intentionally refuses malformed custom world definitions previously
accepted through JavaScript coercion or sparse arrays. Existing well-formed
worlds and saves retain their behavior. It does not establish browser visual
accessibility, live deployment or package-registry receiving.
