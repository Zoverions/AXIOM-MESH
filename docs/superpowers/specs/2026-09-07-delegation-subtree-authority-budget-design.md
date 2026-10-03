# Delegation Subtree Authority Budget and Effective-Reach Design

Status: design only; no production authority promotion
Date: 2026-09-07
Target: Agent Commons / RT-AUTH-001 adjacent hardening
Stage relationship: input to a fresh Stage 5B design gate only. This document does not inherit implementation or authorization authority from Stage 5A.

## Problem

AXIOM-MESH already treats capability, identity, provenance, participation, consensus, and signature validity as non-authoritative unless a current bounded local grant exists at the consequential effect boundary. Existing delegation controls primarily reason about individual principals, grants, and effects.

That is insufficient for two classes of compositional failure:

1. **Sibling aggregation:** every child delegation may be locally attenuated and individually valid while the delegation subtree collectively exceeds the parent/root consequence budget.
2. **Provider-mediated reach:** an agent denied direct egress may still cause a network or external effect through an authorized deputy such as an inference provider, retrieval system, browser/search service, MCP server, remote tool host, or other service acting on its behalf.

The core requirement is therefore:

> Per-edge attenuation is necessary but not sufficient. Consequential and cumulative effects must remain bounded across the complete delegation subtree and across authorized deputies that perform effects on behalf of that subtree.

## Goals

- Preserve current deny-dominant, fail-closed authority semantics.
- Prevent sibling or multi-level delegation from multiplying the total effect budget.
- Preserve compartmentalization: one root must not consume another root's budget.
- Attribute provider-mediated effects to the originating authority root without treating the provider's identity, authentication, or service relationship as new authority.
- Keep evidence/provenance separate from authorization.
- Make the first slice portable and falsifiable through Agent Commons fixtures.
- Avoid production authority promotion in this slice.

## Non-goals

- No global accounting engine across unrelated authority roots.
- No billing, economic settlement, quota marketplace, or reputation system.
- No policy that converts identity, delegation lineage, provider authentication, or provenance into effect authority.
- No attempt to model every physical-resource dimension in the first slice.
- No replacement of existing effect-time currentness checks.
- No assumption that the provider is trusted to self-report authority decisions.

## Approaches Considered

### A. Per-child budgets only

Each child gets an attenuated local budget.

**Rejected as insufficient.** Ten children with ten-percent ceilings can collectively consume 100%, and an eleventh child can consume another ten percent if the parent/root budget is not enforced separately. Correct local attenuation does not prevent aggregate overreach.

### B. One global budget

All delegated effects consume a single global budget.

**Rejected.** This prevents sibling aggregation but destroys tenant/root isolation, creates unnecessary contention, and broadens the blast radius of accounting failures.

### C. Root-scoped shared budget with per-edge attenuation

Every delegated principal carries an immutable authority-root identity. Existing per-edge attenuation remains mandatory, while cumulative/irreversible effects also consume from a ledger keyed by that root.

**Selected.** This preserves local attenuation and compartmentalization while preventing subtree-wide budget multiplication.

## Architecture

### 1. Authority root

Every delegation subtree has one immutable `authority_root_id` established by the original bounded local grant. Descendants inherit the same root identifier.

Rules:

- child delegation MUST NOT replace, reset, or fork the root identifier;
- protocol transitions MUST NOT replace or reset the root identifier;
- provider/deputy transitions MUST preserve attribution to the same root;
- a new root requires a new independently authorized local grant;
- a root identifier is an attribution/accounting key, not authority by itself.

### 2. Per-edge attenuation

Existing delegation attenuation remains in force. A child MUST NOT receive broader scope, duration, effect classes, destinations, or budgets than its parent permits.

Per-edge validation answers:

> Is this child individually within the parent delegation?

It does not answer:

> Has the delegation subtree collectively consumed more than the root is allowed to cause?

### 3. Root-scoped consequence ledger

A minimal ledger tracks cumulative consumption for an authority root and a bounded budget dimension.

Conceptual interface:

```text
admitAndConsume({
  authority_root_id,
  budget_key,
  requested_amount,
  effect_binding,
  current_authority_evidence
}) -> PERMIT | DENY
```

Required properties:

- admission and consumption are atomic;
- duplicate/replayed consumption cannot increase spend twice;
- concurrent siblings cannot both spend the same remaining capacity;
- consumption cannot be reset by re-delegation, protocol switching, provider switching, retry, restart, or descendant creation;
- consumption is scoped to the exact authority root and budget key;
- static root ceilings cannot be widened by dynamic policy;
- current authority must still be valid at the final effect boundary;
- failure to establish the current root state is denial.

The first slice may support a single abstract cumulative unit so the security property is testable without prematurely designing a general resource-accounting system.

### 4. Effective-reach attribution

Direct egress policy remains distinct from deputy-mediated effects.

A deputy is any authorized component that can create an externally consequential action on behalf of the originating agent, including:

- inference provider with retrieval or browsing,
- search/retrieval service,
- MCP server,
- browser service,
- remote tool host,
- external workflow runner,
- other network-capable service acting from an authorized request.

The required chain is:

```text
originating authority root
  -> bounded local grant
  -> delegated request
  -> deputy/service identity + authenticated transport
  -> exact requested action/destination binding
  -> current local authorization
  -> root-scoped budget admission
  -> effect
```

The deputy's service identity and transport authentication are evidence only. They MUST NOT mint a new root or widen the originator's authority.

### 5. Protocol transitions

A transition such as:

```text
agent -> A2A -> MCP -> shell -> provider
```

MUST preserve the original authority root unless an independently authorized new root is explicitly introduced by local policy.

Protocol translation may narrow effect scope but MUST NOT:

- reset cumulative consumption;
- replace the authority root with a service/provider identity;
- convert discovery or authentication into effect authority;
- erase the originator for audit purposes;
- create a new budget namespace merely because the transport or protocol changed.

## Data Flow

For a consequential effect:

1. Resolve the caller's bounded local grant and immutable `authority_root_id`.
2. Validate current delegation ancestry and per-edge attenuation.
3. Resolve exact action, destination, effect class, and requested cumulative amount.
4. If a deputy will perform the action, bind the deputy/service identity and exact delegated request while preserving the same root.
5. Revalidate current local authority immediately before the consequential effect.
6. Atomically admit and consume from the root-scoped ledger.
7. Invoke the effect only after successful admission.
8. Bind the terminal evidence record to root id, budget key, requested amount, resulting consumption state, deputy identity if any, and effect outcome/non-occurrence.

## Failure Semantics

All uncertain or inconsistent states fail closed.

Deny when:

- authority root is missing or changes unexpectedly;
- descendant attempts to introduce a different root without an independent local grant;
- root budget state cannot be loaded or verified;
- requested consumption exceeds remaining root capacity;
- concurrent admission loses the atomic race;
- current authority is stale, revoked, narrowed, or otherwise invalid;
- deputy-mediated action lacks exact destination/action binding;
- deputy or protocol transition attempts to widen scope;
- replay would double-consume or cause a repeated irreversible effect;
- evidence exists but effect authority does not.

A denial record MUST distinguish at least:

- `PER_EDGE_ATTENUATION_DENY`
- `ROOT_BUDGET_EXHAUSTED`
- `ROOT_STATE_UNAVAILABLE`
- `CURRENT_AUTHORITY_INVALID`
- `DEPUTY_BINDING_INVALID`
- `PROTOCOL_AUTHORITY_WIDENING`
- `REPLAY_OR_DUPLICATE_CONSUMPTION`

## Agent Commons First Slice

The first slice is experimental and portable. It makes no production-conformance claim and grants no authority.

Fixtures should include:

1. **ten-siblings-within-root-ceiling** — ten children, each valid for 10%, collectively consume exactly 100%; all permitted.
2. **eleventh-sibling-exceeds-root-ceiling** — an eleventh individually valid 10% child is denied because the root is exhausted.
3. **concurrent-last-unit** — two siblings race for one remaining unit; exactly one is permitted and one denied.
4. **multi-level-delegation-same-root** — grandchild remains bound to the original root ceiling.
5. **protocol-switch-does-not-reset-budget** — A2A -> MCP -> shell translation preserves root consumption.
6. **provider-switch-does-not-reset-budget** — changing deputy/provider preserves root consumption.
7. **direct-egress-denied-provider-fetch** — direct destination access is denied; the same destination attempted through an authorized provider is still checked against origin authority and destination bounds.
8. **valid-provider-auth-no-origin-authority** — provider identity/transport is valid but origin lacks effect authority; deny.
9. **replay-does-not-double-consume** — duplicate request cannot consume twice or repeat the effect.
10. **independent-root-isolation** — one root exhausting its budget does not consume another root's allowance.

Expected negative cases MUST show `effect_invoked: false`.

## Minimal Verifier/Ledger Contract

The first implementation contract should remain deliberately small:

```text
resolveAuthorityRoot(principal_or_grant) -> authority_root_id
validateDelegationEdge(parent, child) -> allow | deny
admitAndConsume(root, budget_key, amount, effect_binding) -> permit | deny
bindDeputyRequest(root, deputy, action, destination) -> bound_request | deny
```

This contract is sufficient to test the security property without committing AXIOM to a general accounting subsystem.

## Security Invariants

1. `capability != authority`
2. `identity != authority`
3. `delegation ancestry != authority`
4. `provider authentication != authority`
5. `provenance != authority`
6. `per-edge attenuation != aggregate budget compliance`
7. `participation != authority`
8. `consensus != authority`
9. `protocol transition != new authority`
10. `deputy execution != new authority`
11. dynamic policy may narrow but MUST NOT widen the static root ceiling
12. a consequential effect requires current authority and successful atomic root-budget admission at the final effect boundary
13. evidence of an attempted or signed action does not imply the action occurred
14. denial or failed admission MUST preserve proof of non-occurrence where the executor can establish it

## Threat Model

Threats explicitly covered:

- sibling collusion or accidental aggregate over-consumption;
- nested delegation used to multiply budget;
- protocol hopping to obtain a fresh accounting namespace;
- provider switching to reset accounting;
- confused-deputy reach through remote services;
- authenticated provider treated incorrectly as execution authority;
- race conditions at the remaining-budget boundary;
- replay/double-spend of a previously admitted request;
- stale authority that remains cryptographically valid after revocation/narrowing;
- root-state outage or partition used to bypass accounting.

Out of scope for the first slice:

- Byzantine replicated ledgers across mutually distrustful administrative domains;
- cross-root economic settlement;
- privacy-preserving global consumption proofs;
- generalized physical-unit normalization.

## Stage 5B Gate Requirements

Before any production runtime promotion, Stage 5B MUST independently re-establish:

- scope of root-budget enforcement;
- which effects are cumulative/irreversible and therefore ledger-bound;
- authority-root creation and termination rules;
- atomicity and persistence requirements;
- crash/recovery semantics;
- partition behavior;
- replay/idempotency rules;
- deputy/provider trust boundaries;
- privacy and correlation implications of persistent root identifiers;
- evidence retention requirements;
- failure/rollback semantics;
- migration contract for existing grants that do not carry a root identifier;
- explicit approval for production use.

Stage 5A artifacts, tests, and lessons may be used as provenance/input only.

## Migration Contract

The first Agent Commons slice is additive and non-authoritative.

For eventual production migration:

- existing grants lacking `authority_root_id` MUST NOT be silently upgraded;
- migration must define whether such grants are rejected, grandfathered under an explicit compatibility boundary, or reissued under fresh authorization;
- no migration may infer a root from identity, service relationship, provenance, protocol endpoint, or provider identity;
- rollback must restore the previous code path without falsely asserting that subtree-wide aggregate enforcement remained active;
- evidence must clearly state whether root-budget enforcement was active for each effect.

## Rollback and Recovery

For the experimental slice, rollback is deletion/reversion of the additive fixtures and verifier prototype; no production authority semantics change.

For any future production implementation:

- ledger write and effect invocation ordering must prevent a crash from silently producing an unaccounted effect;
- recovery must distinguish `consumed-no-effect`, `effect-occurred`, and `outcome-unknown` states;
- an unknown state must not automatically refund budget or retry an irreversible effect;
- rollback must not reset already-accounted cumulative consumption unless an independently authorized recovery procedure proves non-occurrence.

## Testing Strategy

TDD is required.

1. Add portable Agent Commons fixtures.
2. Add focused conformance tests and verify RED for the intended missing behavior.
3. Implement the minimal verifier/ledger interface.
4. Verify focused GREEN.
5. Add concurrency/race coverage for exactly-one-winner behavior.
6. Add provider-mediated reach fixtures.
7. Run repository-wide compatibility checks before any merge.
8. Keep production conformance claims false until a separate Stage 5B-approved runtime promotion exists.

## Success Criteria

The design is satisfied when the experimental implementation can independently demonstrate:

- individually valid sibling delegations cannot collectively exceed the root ceiling;
- multi-level delegation cannot reset the ceiling;
- protocol or provider switching cannot reset the ceiling;
- concurrent siblings cannot double-spend remaining capacity;
- deputy-mediated effects remain attributable to and bounded by the originating authority root;
- provider authentication alone never creates effect authority;
- denied effects are not invoked;
- unrelated authority roots remain isolated;
- no production authority promotion is claimed.
