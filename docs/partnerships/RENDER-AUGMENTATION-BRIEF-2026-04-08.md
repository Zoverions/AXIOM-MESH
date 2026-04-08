# AXIOM × Render Multi-Chain Partnership Brief (AXIOM Augmentation)

**Date:** 2026-04-08  
**Status:** Finalized narrative (M20.1)  
**Audience:** Ecosystem BD, protocol engineering, governance, and operator teams

---

## 1. Executive Summary

Render can be integrated as an **external accelerated-compute lane** while AXIOM remains the source of truth for policy, verification, and release gating. The partnership message is not “Render replaces AXIOM execution,” but “Render extends AXIOM capacity for GPU-heavy workloads under AXIOM controls.”

Core positioning:
- **AXIOM policy orchestration first:** all external jobs are admitted, scoped, and approved through AXIOM governance and scheduler policy.
- **ZKML verification by default for high-trust outputs:** third-party compute outputs are accepted only when bound to attestations and verifier criteria.
- **Fail-closed evidence paths:** if callback payloads, signatures, proofs, or policy traces are missing/invalid, outcomes are rejected and cannot silently pass into production paths.

---

## 2. Partnership Thesis

### 2.1 Why this is additive

Render contributes elastic GPU throughput and partner ecosystem distribution. AXIOM contributes:
- deterministic policy enforcement,
- attestable orchestration,
- cross-service provenance,
- auditable governance controls,
- and acceptance/rejection logic bound to evidence.

Together, this creates a multi-chain AI execution model where **speed scales outward but trust remains anchored**.

### 2.2 Problem addressed

Enterprise and public-sector operators need to burst into external compute during demand spikes, but cannot accept opaque results. The combined architecture solves this by separating responsibilities:
- Render handles **job execution capacity**,
- AXIOM handles **admission control, trust proofs, and release decisions**.

---

## 3. Reference Integration Narrative

### 3.1 Control-plane / data-plane split

1. AXIOM Hypervisor receives a workload requiring GPU acceleration.
2. AXIOM policy engine evaluates route eligibility (`risk_class`, approvals, fleet scope, geofence/tool constraints).
3. If eligible, AXIOM submits a job to Render through an adapter boundary.
4. Render executes and returns output + execution metadata.
5. AXIOM validates callback authenticity and verifies evidence envelope (including ZKML artifacts when required).
6. AXIOM Grid verifier applies acceptance criteria.
7. Only accepted outcomes progress to downstream automation or settlement.

### 3.2 Trust boundary statement

- Render is treated as a **high-value external executor**.
- AXIOM never treats external output as inherently trusted.
- Trust is earned through **policy conformity + cryptographic evidence + verifier pass**.

---

## 4. ZKML Verification Narrative

### 4.1 What is verified

For critical workflows (regulated, financial, high-autonomy, safety-relevant), AXIOM requires output bundles to include:
- deterministic job identity and nonce,
- model/input hash commitments,
- output commitment,
- operator/workload policy context,
- and proof artifacts sufficient for configured verifier rules.

### 4.2 Acceptance contract

An output is accepted only when:
- job metadata matches submission intent,
- signer identity maps to approved partner trust roots,
- proof checks satisfy policy-required verifier profile,
- and no governance or safety hold is active.

Otherwise AXIOM rejects the result and records an immutable audit event.

---

## 5. Policy Orchestration Narrative

AXIOM remains the orchestration authority before, during, and after Render execution.

### 5.1 Pre-execution controls

- route allowlisting for external compute lanes,
- workload classification and mandatory approval thresholds,
- data residency / geofence constraints,
- tool and time-window constraints,
- budget/quota checks.

### 5.2 In-flight controls

- timeout ceilings,
- replay/duplicate callback protection,
- callback signature and nonce validation,
- incident triggers and emergency halt propagation.

### 5.3 Post-execution controls

- evidence completeness gate,
- verifier decision persistence,
- operator-facing audit packet generation,
- settlement enablement only after acceptance.

---

## 6. Fail-Closed Evidence Paths (Non-Negotiable)

The integration must fail closed at every trust boundary.

Reject conditions include:
- missing callback signatures,
- stale or mismatched nonce/job IDs,
- absent or malformed attestations,
- proof verification failure,
- policy drift between submission and callback,
- missing required approvals for risk class.

On rejection:
- no downstream automation executes,
- no payout/settlement is released,
- governance/security log entries are emitted,
- operator action is required for retry/escalation.

---

## 7. Value Message for Render + AXIOM Stakeholders

### 7.1 For Render ecosystem

- unlocks enterprise workloads needing hard assurance,
- increases suitability for regulated and mission-critical AI routes,
- creates a reusable trust wrapper for third-party compute usage.

### 7.2 For AXIOM ecosystem

- scales GPU access without diluting policy integrity,
- preserves verifiability under multi-chain expansion,
- strengthens governance posture with explicit acceptance boundaries.

---

## 8. Pilot Framing (Narrative-Level)

Initial pilot should focus on one high-signal use case:
- external GPU inference burst for a bounded workload class,
- strict evidence gating enabled from day one,
- measurable outcomes: acceptance rate, rejection causes, latency impact, and audit completeness.

This supports iterative hardening before broadening to more workload types.

---

## 9. Messaging Guardrails (What We Will and Won’t Claim)

### We will claim
- AXIOM augments Render usage with policy, verification, and evidence enforcement.
- External compute results are accepted only through explicit verifier and governance criteria.
- The architecture is designed to fail closed on missing trust artifacts.

### We will not claim
- “Trustless by default” for all workloads without configured proofs.
- Unbounded autonomy for external compute callbacks.
- Guaranteed acceptance of third-party outputs absent evidence.

---

## 10. Dependencies for Next Execution Items

This brief unlocks downstream items:
- **M20.2** Hypervisor Render adapter spike (job submit/callback/signed evidence hooks).
- **M20.3** ZKML attestation envelope specification + Grid verifier criteria.
- **M20.4/M20.5** broader multi-chain strategy synchronization (including Polkadot track).

