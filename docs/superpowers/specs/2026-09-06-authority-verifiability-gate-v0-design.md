# Authority–Verifiability Gate v0 — Design

**Status:** approved architecture; additive foundation; no capability promotion

**Date:** 2026-09-06

**Scope:** deterministic, effect-inert evaluation of whether a requested authority class is sufficiently verifiable to remain eligible for later authorization.

**Builds on:**

- `CONSTITUTION.md`
- `docs/rebuild/REQUIREMENTS.md`
- `mesh/src/lib/policy.mjs`
- `mesh/src/lib/agent-trust-authority-manifest.mjs`
- `mesh/src/lib/agent-trust-currentness-checkpoint.mjs`
- existing deny-dominant policy, currentness, evidence-binding, independent-approval, and append-only audit foundations

**Authority boundary:** this design does not grant execution authority, mint or consume a capability, authorize delegation, create credentials, alter policy, modify currentness, access the network, execute tools, perform self-modification, or claim that an eligible decision is authorization. Existing policy and runtime authorization remain authoritative.

---

## 1. Core invariant

> **Capability must never outrun verifiability.**

As effective capability, autonomy, novelty, or consequence increases, the minimum evidence and monitoring burden must increase. If that burden is not met, authority contracts to `hold` or `deny`; the gate never widens authority.

The v0 gate is a pure decision layer:

```text
requested authority + bounded evidence
        |
        v
strict normalization
        |
        +--> currentness / evidence-binding hard gates
        +--> consequence baseline
        +--> novelty escalation
        +--> independent-monitor requirement
        +--> RSI/self-modification hard gates
        +--> maximum lease ceiling
        |
        v
eligible | hold | deny
        |
        v
non-authorizing, digest-bound decision evidence
```

`eligible` means only that the supplied evidence meets this gate's minimum verifiability requirements. It does not mean that policy permits the action or that any capability exists.

---

## 2. Requested authority model

The gate consumes an exact object with these fields:

- `request_id`: stable identifier for this evaluation.
- `principal_id`: requesting principal.
- `action`: requested action identifier.
- `risk`: one of `low`, `medium`, `high`, `critical`.
- `effect_destination`: bounded destination label.
- `authority_level`: integer `0..4`, where larger values represent greater effective authority.
- `autonomy_level`: integer `0..4`, where larger values represent less immediate human control.
- `novelty_signals`: sorted, unique subset of `environment`, `tool`, `counterparty`, `objective`, `model`, `policy-context`.
- `external_agent_interaction`: boolean.
- `self_modification`: boolean.

The gate does not infer novelty from prose or model reasoning. Callers must provide explicit machine-readable signals; unknown or malformed fields fail closed.

---

## 3. Evidence model

The gate consumes exact evidence containing:

- `policy_binding_digest`: 64-character lowercase SHA-256 hex digest.
- `identity_current`: boolean.
- `delegation_current`: boolean.
- `evidence_bound`: boolean indicating the supplied evidence is cryptographically or structurally bound by the caller's established evidence path.
- `monitorability_level`: integer `0..4`.
- `independent_monitor`: boolean.
- `independent_evaluator`: boolean.
- `human_authorization_present`: boolean.
- `rollback_available`: boolean.
- `rollback_tested`: boolean.

The gate does not itself verify signatures, currentness proofs, or policy digests. It evaluates normalized facts supplied by already-established verification paths. This preserves separation between evidence verification and policy/authority evaluation.

---

## 4. Required verifiability

Baseline monitorability requirement by consequence:

| Risk | Baseline | Max lease ceiling |
| --- | ---: | ---: |
| `low` | 1 | 900000 ms |
| `medium` | 2 | 300000 ms |
| `high` | 3 | 60000 ms |
| `critical` | 4 | 15000 ms |

Escalation rules:

1. Any novelty signal increases the required monitorability level by one, capped at 4.
2. Three or more novelty signals increase it by two from baseline, capped at 4.
3. `external_agent_interaction=true` requires an independent monitor and contributes the `counterparty` novelty signal semantically; callers must explicitly include that signal or the request is denied as inconsistent.
4. `self_modification=true` forces required monitorability to 4 and requires an independent monitor, an independent evaluator, explicit human authorization, available rollback, and tested rollback.
5. `authority_level=4` or `autonomy_level=4` requires an independent monitor.
6. `critical` risk requires an independent evaluator and explicit human authorization.

The gate deliberately uses small ordinal classes rather than opaque floating-point scores. The result must be reproducible and reviewable.

---

## 5. Decision semantics

### `deny`

The gate returns `deny` for hard-boundary failures, including:

- identity not current;
- delegation not current;
- evidence not bound;
- malformed or inconsistent novelty declarations;
- missing mandatory independent evaluation or human authorization for critical/self-modifying authority;
- self-modification without available and tested rollback.

### `hold`

The gate returns `hold` where the request is structurally admissible but the supplied monitoring burden is insufficient, including:

- monitorability level below the calculated requirement;
- required independent monitor absent.

`hold` means authority must not be exercised until stronger evidence is supplied.

### `eligible`

The gate returns `eligible` only after all hard gates and monitorability requirements pass.

Every result carries fixed semantics:

```text
grants_execution_authority = false
mints_capability = false
consumes_capability = false
grants_delegation = false
changes_policy = false
changes_currentness = false
authority_effect = none
network_effect = none
state_effect = none
requires_downstream_authorization = true
```

---

## 6. Output contract

The evaluator returns canonical decision evidence containing:

- schema and notice;
- normalized request projection;
- normalized evidence projection;
- calculated requirements;
- `decision`;
- sorted unique `reasons`;
- fixed non-authorizing semantics;
- `decision_digest = SHA-256(canonical JSON of the decision body)`.

The result is immutable in-process and reproducible from the same inputs.

---

## 7. Failure model

Validation failures throw `ValidationError` and do not produce an eligibility decision. Known insufficiency produces `deny` or `hold` evidence instead of throwing.

No fallback may convert malformed, unknown, or ambiguous input into eligibility.

---

## 8. Threat model

The v0 implementation must explicitly cover:

- authority laundering by presenting `eligible` as authorization;
- novelty omission to reduce monitoring requirements;
- external-agent interaction without counterparty declaration;
- self-modification without independent evaluation;
- rollback claims that are available but untested;
- stale identity/delegation presented as sufficient evidence;
- monitor self-attestation where independence is required;
- digest tampering or unsupported fields;
- lease ceilings widened by caller input.

---

## 9. Deliberately deferred

The following are separate reviewable slices and are not implemented by v0:

1. capability lease issuance/revocation;
2. direct integration into the production effect path;
3. monitor/evaluator identity verification;
4. chain-of-thought or activation-monitor implementations;
5. generalization-risk inference from runtime telemetry;
6. RSI proposal/sandbox/promotion workflow;
7. agent-to-agent protocol enforcement;
8. external regulator/auditor policy profiles.

The v0 gate exists so those later systems can depend on one strict, non-authorizing invariant instead of inventing incompatible local thresholds.
