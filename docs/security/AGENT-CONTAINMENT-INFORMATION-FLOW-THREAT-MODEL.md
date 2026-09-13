# Agent Containment and Information-Flow Threat Model — F0/F1

**Status:** F0/F1 candidate only; no live containment claim.

**Stage 5B design:** `docs/superpowers/specs/2026-09-10-agent-containment-information-flow-stage5b-design.md`

**Implementation plan:** `docs/superpowers/plans/2026-09-10-agent-containment-information-flow-f0-f1.md`

## Scope

F0/F1 defines four inert language-neutral contracts and a deterministic user-space evaluator for supplied information-flow state. It introduces no live process observer, credential broker, network interceptor, browser broker, host enforcement, payment/recovery effect, external runtime activation, or capability promotion.

The supported claim is narrow: given a valid supplied `FlowContext`, the F1 evaluator deterministically intersects its accumulated restrictions with an exact synthetic egress policy and can only deny or report eligibility. It cannot grant AXIOM authority or perform the effect.

## Trust boundary

**Trust:** evaluator trusts its supplied FlowContext because F0/F1 has no live observer.

A valid `FlowContext` is therefore evidence about the state presented to the evaluator, not proof that a real operating-system process, runtime, model, connector, browser, or subprocess has been exhaustively observed. F0/F1 validates structure, boundedness, lineage, canonical digest binding, monotonic restriction composition, and deterministic policy evaluation over that supplied state.

Passing F0/F1 proves deterministic contract/evaluator semantics over supplied synthetic state; it does not prove a real process cannot bypass information-flow controls.

## Threats covered in F0/F1

The F0/F1 tests and fixtures cover:

- label dropping in pure composition;
- least-restrictive-parent selection;
- unknown class handling;
- policy mismatch;
- authority-bearing material;
- wildcard widening;
- resource exhaustion through bounded contract, request, policy, parent, lineage, and collection sizes;
- digest substitution;
- runtime-identity reset attempts;
- receipt leakage through unknown/raw protected-content fields;
- surrogate or approval references being used to override independent action, provider, destination, purpose, or data-class denials; and
- deterministic denial precedence and repeated-evaluation output.

The evaluator is deny-dominant. A credential-surrogate digest or approval-challenge digest can satisfy only its own explicit synthetic eligibility gate. Neither can manufacture authority or cancel another denial.

## Threats not yet solved

F0/F1 does **not** solve:

- uninstrumented subprocess/native escape;
- actual secret extraction from a live process or host;
- live credential redemption or credential secrecy against a compromised host;
- network redirect/DNS substitution;
- browser prompt injection or hostile page behavior;
- OS/kernel observer bypass;
- covert channels;
- real-world credential/broker compromise;
- live propagation of flow state across remote agents, providers, connectors, or hosts; or
- enforcement against software that never submits truthful `FlowContext` state.

The existing AXIOM deny-egress boundary remains unchanged and is not replaced by F0/F1.

## Authority and non-claims

`FlowContext`, `CredentialSurrogate`, `TrustedApprovalChallenge`, `FlowReceipt`, evaluator requests, evaluator policies, conformance vectors, and evaluator results are not capability grants. They do not authorize Gateway, Hypervisor, Sandbox, Grid, provider, connector, repository, browser, network, credential, payment, recovery, or host effects.

No F0/F1 API provides declassification, label clearing, restriction reset, summarization-as-declassification, or runtime replacement as a way to reduce inherited restrictions. Any future declassification or trusted transformation semantics require a separately specified and independently approved Stage 5B-or-later gate.

## Future phases

**Future phases:** F2-F8 remain independently gated.

Later work may investigate live flow observation, credential brokering/redemption boundaries, trusted approval surfaces, browser mediation, causal egress receipts, host-assisted enforcement, confidential-compute profiles, and OS/kernel information-flow mechanisms. None of those capabilities is implied by this F0/F1 candidate, and no later phase inherits implementation or authorization authority merely because F0/F1 passes.
