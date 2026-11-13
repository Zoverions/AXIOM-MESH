# Policy Conflict Resolution and Downgrade Resistance

**Status:** experimental coordination architecture. Existing production policy semantics remain in `mesh/src/lib/policy.mjs`.

AXIOM already has implemented deny-dominant policy merging, monotonic constraint operators, finite allowlist intersection, and fail-closed ambiguous conflict behavior.

The missing long-horizon piece is to make **cross-domain and cross-layer conflict** explicit when policy comes from many independent sources.

## Sources

A consequential action may be constrained by:

- kernel;
- owner/subject;
- Circle;
- institution;
- jurisdiction/domain;
- adapter/connector;
- action risk;
- data class;
- deployment topology;
- fallback candidate.

The correct result is not "pick the strongest actor."

It is to compose constraints monotonically and surface conflict.

## Downgrade resistance

The following are downgrade attempts unless explicitly permitted by a valid higher-level process:

- lowering minimum assurance;
- turning deny into allow;
- adding values to a finite allowlist;
- widening audience, purpose, resource, disclosure, residency, or retention;
- reducing required approval count;
- relaxing currentness/revocation;
- routing to a weaker fallback after a stronger path fails.

A lower layer may always narrow.

It may not silently broaden.

## Fallback

Fallback is a common authority-drift mechanism.

If a preferred verifier, provider, model, node, connector, or institution is unavailable, the replacement must independently satisfy the **entire composed policy**.

```text
preferred unavailable
  !=
weaker fallback allowed
```

No failure converts a forbidden destination into an eligible one.

## Conflict outcomes

Useful machine-readable outcomes are:

- compatible;
- narrowed;
- denied;
- unresolved conflict;
- appeal/exception required.

Unresolved conflict cannot silently become success.

## Exceptions

Some institutions legitimately need exception processes.

An exception must bind:

- exact authority;
- exact scope;
- expiry;
- review path;
- evidence.

The presence of an exception record is not itself authorization or success.

The action still passes through its ordinary authority path.

## Human explanation

Interfaces should be able to say:

- which layer required the stronger condition;
- what the attempted downgrade was;
- whether the system narrowed, denied, or left the issue unresolved;
- what appeal or exception path exists.

They should not conceal conflict behind "policy error."

## Governing rule

**Lower layers may narrow. No layer silently weakens a required protection. Fallback must earn eligibility from scratch.**
