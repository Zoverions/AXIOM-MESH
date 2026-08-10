# AXIOM-MESH Audit Hardening — G-5 through G-9

**Date:** 2026-08-10  
**Build:** `0.12.0-dev.3`  
**Status:** implementation branch; not a production-promotion claim

This append-only note records the follow-up to the independent post-`#929`
audit. It does not change the capability registry and does not promote a new
runnable capability.

## Findings in scope

- **G-5:** prototype-inherited map entries must never be treated as policy,
  incident, education, or machine-action authority.
- **G-6:** constrained-machine scope syntax must match the exact-match scope
  evaluator; unsupported glob syntax must fail validation rather than silently
  matching nothing.
- **G-7:** deny-egress evidence must bind the network-namespace and Compose
  `network_mode: none` facts to measured/derived provenance rather than literal
  booleans outside the required-check inventory.
- **G-8:** an explicit policy deny must be evaluated before missing-scope
  diagnostics so audit evidence records the governing denial and does not leak
  irrelevant scope names.
- **G-9:** deny-dominant policy composition must run the complete policy
  validator on the merged result, and constraint maps must use own-property
  semantics.

## Documentation and maintenance clarifications

The pass also records that `_network-boundary-core.mjs` and
`grid/_store-core.mjs` are retained lower layers whose superseded top-level
entry points must not be audited in isolation, clarifies that the current
Sandbox is a deterministic capability executor rather than an arbitrary-code
isolation product, and adds a maintenance requirement to backfill a security
fix across every equivalent pattern in the supported tree.

## Promotion rule

No item in this note is complete merely because source exists. The branch must
contain executable negative-path tests and the exact final head must pass the
pinned Clean Kernel verifier, container/security job, and the separate signed
50,000-event chain-verification benchmark before merge.
