# Compositional Adaptive Assurance

**Status:** experimental architecture; no current capability promotion.

AXIOM already uses A0-A4 identifiers in current assurance code. Those identifiers are useful as a compact compatibility ladder, but one number cannot safely describe every trust property of a consequential action.

The stronger long-horizon model is a **compositional assurance vector**.

## Why a vector

An operation may have:

- excellent identity evidence;
- valid authority evidence;
- reproducible execution;
- strong audit evidence;
- no independent verifier;
- stale external currentness;
- excellent privacy protection.

Calling that simply "A3" hides the stale-currentness problem.

The native model therefore keeps dimensions separate:

```text
identity
authority
execution
evidence
independent_verification
currentness
privacy
recovery
```

## Required, attempted, achieved, failed, unknown

For every applicable dimension:

- **required** — policy says this evidence/verification obligation must be satisfied;
- **attempted** — the mechanism was actually invoked;
- **achieved** — sufficient current evidence satisfied the requirement;
- **failed** — the mechanism was attempted and failed its acceptance criteria;
- **unknown** — the state cannot currently be established.

Unknown is not the same as failed.

But for a required consequential assurance gate, both are insufficient unless local policy explicitly defines a safe non-effect outcome such as hold-pending or advisory-only.

## Floor composition

Required assurance comes from all applicable sources:

```text
kernel
owner / subject
Circle
institution
jurisdiction / domain
adapter / connector
action risk
data class
deployment topology
```

Composition is dimension-by-dimension and deny-dominant.

A domain can add a stronger requirement. It cannot remove a non-waivable kernel floor.

## No compensation by default

A strong verifier does not compensate for missing authorization evidence.

Perfect encryption does not compensate for stale revocation state.

Strong identity does not compensate for missing privacy constraints.

Substitution is permitted only if a specific policy defines the safe equivalence and produces evidence for it.

## Relationship to A0-A4

A0-A4 remain useful for current compatibility and human summaries.

But they become a **lossy rendering**, not the native semantics.

A1 roughly implies attributable identity/authority evidence.  
A2 adds auditable execution/evidence.  
A3 adds independent verification.  
A4 remains especially important to separate: collective finality is fundamentally a **finality** concept, not merely "more assurance."

Therefore no vector may be upgraded merely because somebody labels it A3 or A4.

## Degraded modes

If required assurance is missing, the safe outcomes are explicit:

- deny;
- hold pending;
- advisory only.

This initial profile does not permit degraded mode to authorize a consequential effect. Future optimistic-execution research must have its own reversibility, rollback, challenge-window, and risk proofs.

## Historical integrity

An action records assurance as it existed at execution.

Later review can append stronger evidence, corroboration, contradiction, or correction.

It cannot rewrite history to claim that higher assurance existed earlier.

## Governing rule

**Require assurance by consequence. Compose it by dimension. Let no strong signal hide a weak required one.**
