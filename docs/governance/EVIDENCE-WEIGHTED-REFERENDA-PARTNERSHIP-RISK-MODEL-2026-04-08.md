# Evidence-Weighted Referenda & Partnership-Risk Controls (M20.8)

**Date:** 2026-04-08  
**Status:** Draft governance model  
**Owner Track:** Governance + Security + Partnerships

---

## 1) Objective

Define governance-closure modeling tasks that ensure major partnership and cross-network decisions cannot close without:
1. Sufficient verifiable evidence quality.
2. Explicit risk controls for partner dependencies.
3. Transparent post-vote accountability artifacts.

---

## 2) Problem Statement

Standard token-weighted voting can under-account for:
- Quality and freshness of evidence.
- Concentrated dependency risk from external partners.
- Cross-network operational externalities.

This model adds evidence weighting and partnership-risk gates to referendum closure.

---

## 3) Referendum Types Covered

| Type | Example | Must use evidence weighting? | Must use partner risk controls? |
|---|---|---|---|
| R1: Technical parameter | Fee corridor update | Yes | Optional |
| R2: External integration | Render/Polkadot activation gate | Yes | Yes |
| R3: Treasury commitment | Pilot funding | Yes | Yes |
| R4: Emergency override | Incident containment | Yes (expedited) | Yes |

---

## 4) Evidence Weighting Model

## 4.1 Evidence classes
- **E1:** Cryptographic/attestation proofs.
- **E2:** Operational telemetry + reliability traces.
- **E3:** Security review and threat analysis.
- **E4:** Economic simulations and stress tests.
- **E5:** Legal/compliance and jurisdictional constraints.

## 4.2 Evidence score
For referendum `R`:

`Score_evidence(R) = Σ (class_weight_i * quality_i * freshness_i * coverage_i)`

Where each component is normalized [0,1].

Suggested class weights:
- E1: 0.30
- E2: 0.20
- E3: 0.20
- E4: 0.20
- E5: 0.10

## 4.3 Closure threshold
A referendum cannot enter final closure unless:
- `Score_evidence(R) >= 0.72` for R1.
- `Score_evidence(R) >= 0.80` for R2/R3.
- `Score_evidence(R) >= 0.65` for R4 (emergency expedited path).

If below threshold, status becomes `EVIDENCE_INSUFFICIENT` and returns to revision stage.

---

## 5) Partnership-Risk Control Model

## 5.1 Risk dimensions
Each partner/integration proposal must score:
1. **Concentration risk** (single-vendor dependency).
2. **Technical lock-in risk** (exit complexity).
3. **Security posture risk** (external attack surface delta).
4. **Economic counterparty risk** (settlement solvency/exposure).
5. **Governance misalignment risk** (policy/control incompatibility).

## 5.2 Composite risk score

`Risk_partner = Σ (dimension_weight_j * severity_j)`

Severity scale: 0 (none) to 5 (critical).

Risk bands:
- 0.0–1.5: Low.
- >1.5–3.0: Moderate.
- >3.0–4.0: High.
- >4.0: Critical.

## 5.3 Mandatory controls by risk band
| Band | Mandatory controls |
|---|---|
| Low | Standard monitoring + quarterly review |
| Moderate | Exit runbook + dual-provider fallback plan |
| High | Stage-gated activation + kill-switch rehearsal + monthly review |
| Critical | Block closure unless governance supermajority + explicit mitigation acceptance |

---

## 6) Governance Closure State Machine (Proposed)

`DRAFT -> EVIDENCE_REVIEW -> RISK_REVIEW -> VOTING -> CONDITIONAL_PASS -> CLOSURE_READY -> CLOSED`

Failure routes:
- Evidence below threshold: `EVIDENCE_INSUFFICIENT`.
- Unmitigated high/critical partner risk: `RISK_UNRESOLVED`.
- Missing incident/exit runbooks for R2/R3: `OPERATIONS_INCOMPLETE`.

`CLOSURE_READY` requires all of:
1. Evidence threshold met.
2. Risk controls satisfied for current band.
3. Required vote quorum and majority met.
4. Post-vote accountability packet generated.

---

## 7) Accountability Packet Requirements

Each closed referendum must publish a packet with:
1. Evidence index with hashes and freshness timestamps.
2. Partner-risk register snapshot with accepted residual risk.
3. Mitigation owner map + due dates.
4. Rollback and emergency halt conditions.
5. KPI and failure trigger schedule for post-launch review.

---

## 8) Modeling Tasks Backlog (M20.8 Deliverable)

1. Define on-chain/off-chain schema fields for evidence score and risk band.
2. Build deterministic scorer library for evidence and partner risk dimensions.
3. Add pre-vote linter to reject proposals lacking minimum evidence classes.
4. Add closure gate check script for CI/governance workflow automation.
5. Create dashboard view for referendum lifecycle and gating reasons.
6. Implement exception pathway for emergency decisions with automatic retrospective review.
7. Add quarterly audit that recomputes evidence/risk scores from source artifacts.

---

## 9) Initial KPI Targets

- >=95% of R2/R3 referenda close with complete accountability packet.
- 0 closures for high-risk proposals without exit plan evidence.
- <5 business days median time from `CONDITIONAL_PASS` to `CLOSURE_READY`.
- 100% of emergency closures include retrospective review within 14 days.

---

## 10) Acceptance Criteria (M20.8)

- Evidence-weighted referendum scoring formula and thresholds are documented.
- Partnership-risk dimensions, bands, and mandatory controls are defined.
- Closure state machine includes explicit block/failure states.
- Concrete implementation tasks exist for engineering and governance automation.
