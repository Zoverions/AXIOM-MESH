# Adaptive Assurance and Stochastic Audit

**Status:** experimental coordination/security primitive; non-authorizing

## Purpose

AXIOM-MESH should not spend identical verification effort on every task. Assurance
effort should scale with consequence and uncertainty while preserving a mandatory
security floor. Trust and reputation may reduce expected friction, but they must
never create immunity from scrutiny.

The implementation in `mesh/src/lib/adaptive-assurance.mjs` is intentionally a
decision-support primitive. It does not grant authority, delegate authority, bypass
policy, issue capabilities, or promote autonomous execution.

## Invariants

1. **Mandatory assurance floors cannot be reduced by reputation or stochastic logic.**
2. **Predictable trust must never become predictable exemption.**
3. **Reputation can alter expected verification effort but can never make audit
   probability zero.**
4. **Stochastic review may increase scrutiny but never reduce it.**
5. **Independent verification means meaningful independence of context, evidence,
   method, or runtime; another identical vote is not automatically independent.**
6. **Correlation risk is itself an assurance input.**
7. **Context-integrity and provenance weakness are assurance inputs even when all
   candidate actions remain within valid authority.**
8. **The allocator is non-authorizing. Its output cannot mint, widen, pool, or
   transfer permission.**
9. **Exact stochastic thresholds and samples are not exposed in pre-execution UI.**
10. **Completed supplemental review may be disclosed after execution without
    disclosing the sampling rule.**

## Inputs

The first implementation scores eight observable dimensions from 0–100:

- consequence;
- uncertainty;
- irreversibility;
- authority exposure;
- anomaly;
- provenance weakness;
- correlation risk;
- context-integrity risk.

The risk class supplies the mandatory floor:

| Risk class | Minimum current tier |
| --- | --- |
| low | A1 |
| medium | A2 |
| high | A3 |
| critical | A3 plus explicit human or policy-designated independent approval |

The current kernel maximum remains A3. A4 is not inferred or promoted by this
module.

## Reputation

Reputation is deliberately bounded. High-confidence positive reputation can reduce
the computed risk score only within a small fixed range. Low reputation can increase
it. Neither path can override the policy floor.

This follows the principle that reputation should reduce friction, not create
immunity.

Reputation evidence should ultimately be sourced through reviewed entity-assurance
and reputation mechanisms rather than accepted directly from an acting model.

## Stochastic challenge

The evaluator uses a cryptographically secure runtime random source by default.
A supplemental challenge probability is derived from risk class and gaming-sensitive
signals such as anomaly, provenance weakness, correlation risk, and context-integrity
risk.

Positive reputation can reduce this probability only within a bounded amount, and
every risk class retains a non-zero minimum sampling rate.

A triggered challenge can only escalate the assurance tier or add supplemental
verification. It cannot downgrade scrutiny.

The exact probability and random sample are internal audit data. They are excluded
from the pre-execution UI projection to avoid publishing a simple gaming threshold.

## Parallel verification

Assurance tiers recommend different review shapes:

- **A1:** normal policy and authority path;
- **A2:** add independent-context verification;
- **A3:** add adversarial review, provenance review, and correlation-aware
  cross-checking;
- **Critical:** retain A3 and require explicit human or policy-designated
  independent approval.

These are obligations/recommendations, not proof that independent sub-agents or
runtimes have actually executed them. Runtime integration must bind completed
checks to evidence before making stronger claims.

## Native UI consequence

The native UI should expose a simple assurance level:

- Routine;
- Elevated;
- High;
- Critical.

It should explain the observable reasons for the level without exposing the
stochastic sampling threshold. Before execution, the UI may say that additional
verification is required. After completion, it may disclose that supplemental audit
occurred.

Users should not normally have to choose a raw number of agents.

## Next integration gates

Before this primitive can affect live orchestration:

1. bind its input signals to reviewed, attributable sources;
2. connect its output to an orchestration contract that can prove requested checks
   were actually performed;
3. define independence/correlation evidence for parallel verifier lines;
4. bind assurance decisions and completed-check evidence into plan provenance and
   Grid receipts;
5. add aggregate compute, inference-cost, API-cost, storage, bandwidth, effect-count,
   and device-time budgets;
6. add cancellation and recursion limits so assurance cannot expand indefinitely;
7. test strategic reputation gaming, Sybil splitting, correlated-model agreement,
   memory poisoning, provenance poisoning, and verifier targeting;
8. separately review any UI that reveals risk signals or audit outcomes for
   information leakage.

Until those gates are satisfied, adaptive assurance remains an experimental,
non-authorizing primitive.
