# Exact-effect authorization and degraded-mode red-team slice

## Scope

This slice converts issues #1491 and #1492 into bounded public falsification targets before deeper runtime implementation.

## Deliverables

1. Add a catalog target for exact-effect authorization interoperability.
2. Add a catalog target for failure-domain diversity and sovereign degraded mode.
3. Add both targets to the structured public finding form.
4. Preserve the claim boundary that catalog entries are challenge surfaces, not findings or certifications.

## Exact-effect target

The target asks whether a valid identity/token/delegation artifact can be transformed into broader authority by mutating action arguments, destination/audience, purpose, budget, serialization, protocol path, or currentness after the decision that authorized an effect.

A conforming path must deny mismatched or stale effects at the protected effect boundary even when upstream authentication, delegation, discovery, or protocol metadata remains valid.

## Resilience target

The target asks whether correlated model/provider loss can disable or widen governance and safety controls, revive stale queued work, or cause the system to claim redundancy that its actual failure domains do not support.

A conforming degraded mode keeps local policy/currentness, shutdown/revocation, credential custody, evidence verification, audit/recovery access, and operator control available even when frontier-cloud inference is unavailable.

## Nonclaims

- No external OAuth/WIMSE draft is adopted as AXIOM's authority root.
- Provider diversity is not assumed to imply infrastructure independence.
- A catalog target is not evidence that a vulnerability exists.
- Public testing remains repository-owned/local/disposable only.
