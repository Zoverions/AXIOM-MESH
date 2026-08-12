# AXIOM-MESH Audit Hardening — G-5 through G-9

**Date:** 2026-08-10  
**Build:** `0.12.0-dev.3`  
**Status:** historical implementation audit retained on `main`; not a production-promotion claim

This append-only note records the follow-up to the independent post-`#929`
audit. It does not change the capability registry and does not promote a new
runnable capability.

## Findings in scope

- **G-5:** prototype-inherited map entries must never be treated as policy,
  incident, education, or machine-action authority.
- **G-6:** constrained-machine scope syntax must match the exact-match scope
  evaluator; unsupported glob syntax must fail validation rather than silently
  matching nothing.
- **G-7:** deny-egress runtime evidence must replace literal namespace claims
  with measured provenance, while static Compose topology remains verified by
  the release/deployment gate that has access to the actual Compose source.
- **G-8:** an explicit policy deny must be evaluated before missing-scope
  diagnostics so audit evidence records the governing denial and does not leak
  irrelevant scope names.
- **G-9:** deny-dominant policy composition must run the complete policy
  validator on the merged result, and constraint maps must use own-property
  semantics.

## Backfill findings

Applying G-5 as a repository-wide pattern rather than a single-line repair
found a second inherited-property case in policy validation itself:
`rule.risk in RISK_ORDER` accepted names inherited from `Object.prototype`.
The validator now uses an own-property check for risk names as well as action
maps, and a regression proves `risk: "constructor"` is rejected.

The incident-response regression was also strengthened to load the canonical
incident policy and satisfy its complete SEV-1 requirements before adding the
inherited `constructor` action. This prevents the test from passing because of
an unrelated incomplete fixture. The Education regression similarly uses the
pinned domain contract and proves inherited action names remain unknown.

## G-7 resolution boundary

Review of the candidate image found that `compose.production.yml` is not
present inside the runtime container. The first hardening draft would therefore
have turned a source-policy fact into an impossible runtime read. That draft was
rejected before final verification.

The final design measures `/proc/self/ns/net` in runtime evidence, binds the
observed namespace identity by digest, and removes
`compose_network_mode_none_required` from runtime evidence entirely. The actual
Compose requirement remains enforced by the release/deployment verifier, which
has access to the checked-out Compose source, requires `network_mode: "none"`,
and binds the Compose digest. Tests reject both a forged namespace binding and
reintroduction of the old static Compose boolean into runtime evidence.

## Documentation and maintenance clarifications

The pass also records that `_network-boundary-core.mjs` and
`grid/_store-core.mjs` are retained lower layers whose superseded top-level
entry points must not be audited in isolation, clarifies that the current
Sandbox is a deterministic capability executor rather than an arbitrary-code
isolation product, and adds a maintenance requirement to backfill a security
fix across every equivalent pattern in the supported tree.

## Verification provenance

The verification history is preserved rather than collapsed into the final
green state:

- Diagnostic Clean Kernel run `31383155359` reached the documentation gate with
  the container/security job green but failed because the new canonical phrase
  `regression coverage for the class` crossed a Markdown line break. The
  canonical sentence was rewrapped; the checker was not weakened. Its separate
  50,000-event benchmark run `31383155379` passed.
- Exact-head Clean Kernel run `31384181300` on
  `b47373098b0025eb30c65d659c6308b0e397dd28` had a fully green
  container/security job and passed every substantive G-5 through G-9 test,
  but the reviewability regression itself expected a literal space after
  `class,` where canonical Markdown used a newline. The regex was corrected to
  accept whitespace at the real wrap point. The corresponding benchmark run
  `31384181407` passed.
- Repaired head `1edaa8229a3038feb7bc88b3aaaf0ed78453f364` passed the complete
  Clean Kernel `verify` and `container` jobs in run `31384408767` and the
  independent signed 50,000-event benchmark in run `31384408757`.

Because this provenance-only append changes the source revision, the commit
containing this section must itself pass the same three exact-head gates before
merge; the prior green runs are evidence for their respective heads, not a
substitute for final-head verification.

## Promotion rule

No item in this note is complete merely because source exists. The branch must
contain executable negative-path tests and the exact final head must pass the
pinned Clean Kernel verifier, container/security job, and the separate signed
50,000-event chain-verification benchmark before merge.
