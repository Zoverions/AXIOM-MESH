# AXIOM-MESH Master TODO — Health

**Status:** execution queue for current-main Health convergence

**Date:** 2026-09-03

**Authority note:** no checkbox changes runnable capability status. `mesh/config/capabilities.json` remains authoritative and `domains.health` remains `adapter_required`.

## State labels

This queue distinguishes four kinds of progress:

- **SUBSTRATE SATISFIED** — a generic current-Mesh primitive exists and Health should reuse it;
- **INERT HEALTH CONTRACT** — a Health-specific semantic/conformance contract exists but grants no runtime authority;
- **ADAPTER REQUIRED** — concrete provider/protocol/device integration is still absent;
- **PROMOTION EVIDENCE REQUIRED** — clinical, jurisdictional, security, accessibility, operational, and independent evidence is still required before exposure.

## Priority 0 — Protect current truth

- [x] **SUBSTRATE SATISFIED:** ordinary privileged effects follow Gateway -> Hypervisor -> Sandbox -> Grid.
- [x] **SUBSTRATE SATISFIED:** purpose/scope/subject/controller/expiry/revocation-bound consent receipts exist.
- [x] **SUBSTRATE SATISFIED:** constrained machine principals cannot self-expand authority.
- [x] **SUBSTRATE SATISFIED:** Grid evidence, encrypted memory, portability, backup/recovery, and local governance foundations exist.
- [x] **SUBSTRATE SATISFIED:** Sovereign Vault and Context Capsule architecture exists for compartmentalized context/minimum-necessary disclosure.
- [ ] **PROMOTION EVIDENCE REQUIRED:** clinical credential/status verification profile.
- [ ] **PROMOTION EVIDENCE REQUIRED:** independently reviewed patient-visible clinical audit/access semantics.
- [ ] **PROMOTION EVIDENCE REQUIRED:** jurisdiction-specific clinical/regulatory deployment evidence.
- [ ] **PROMOTION EVIDENCE REQUIRED:** externally suitable currentness/continuity for high-consequence clinical events.

## Priority 1 — Converge historical Health lineage

- [x] Forward-port the H0-H5 autonomy vocabulary.
- [x] Preserve the rule that supervision loss cannot raise autonomy.
- [x] Preserve the rule that uncertain physical effects cannot be blindly retried.
- [x] Preserve separate event-specific emergency authority semantics.
- [x] Preserve independent physical-safety requirements.
- [x] Preserve fail-closed external regulatory-eligibility semantics.
- [x] Reconcile Health privacy with Sovereign Vaults and the generic Context Capsule rather than duplicating them.
- [ ] Map every remaining unique PR #1064 semantic to the current successor before closing #1064 as superseded.

## Priority 2 — Health Evidence Graph v0

- [ ] **INERT HEALTH CONTRACT:** implement `axiom-health-evidence-node.v0`.
- [ ] **INERT HEALTH CONTRACT:** implement `axiom-health-provenance-edge.v0`.
- [ ] Implement deterministic canonical digests.
- [ ] Enforce immutable epistemic classes.
- [ ] Reject self-edges, cross-subject contamination, and encounter mismatch.
- [ ] Reject derivation cycles for `derived-from` / `result-of`.
- [ ] Preserve `supports` / `contradicts` disagreement without forced consensus.
- [ ] Preserve correction/supersession without source erasure.
- [ ] Prove evidence records cannot masquerade as execution grants.

## Priority 3 — Clinical Inference Receipt

- [ ] **INERT HEALTH CONTRACT:** implement `axiom-clinical-inference-receipt.v0`.
- [ ] Bind exact model and runtime identity.
- [ ] Bind intended-use evidence.
- [ ] Bind input evidence IDs and digests.
- [ ] Bind output digest and uncertainty representation.
- [ ] Require calibration evidence when calibrated-probability semantics are claimed.
- [ ] Preserve population constraints and a human-review floor.
- [ ] Prove a model receipt cannot output `clinical-assessment` or `diagnosis-assertion`.
- [ ] Prove receipt validity does not claim medical correctness or clinical authority.

## Priority 4 — Research Participation

- [ ] **INERT HEALTH CONTRACT:** implement `axiom-health-research-participation.v0`.
- [ ] Bind exact recipient and study/protocol digest.
- [ ] Bind purpose and allowed/forbidden data classes.
- [ ] Bind named transformations.
- [ ] Make model training explicit and false by default.
- [ ] Bind onward disclosure, retention, expiry, revocation, withdrawal, and result return.
- [ ] Add deterministic local compatibility evaluation that grants no external access.
- [ ] Prove one study/purpose cannot be silently reused for another.
- [ ] Prove participation does not create ambient Health Vault access.

## Priority 5 — Neural Data Profile

- [ ] **INERT HEALTH CONTRACT:** implement `axiom-neural-data-profile.v0`.
- [ ] Treat EEG, intracranial, neural-interface, and neuroimaging-derived signals as high/critical sensitivity.
- [ ] Bind acquisition device identity and source evidence.
- [ ] Bind optional decoder ref+digest as a pair.
- [ ] Fix `decoded_intent_is_authority = false`.
- [ ] Fix `decoded_signal_is_legal_consent = false`.
- [ ] Fix `decoded_signal_is_identity_proof = false`.
- [ ] Reject raw neural content/secrets in v0 fixtures.
- [ ] Preserve the invariant that decoder output is inference, not consent/identity/authority.

## Priority 6 — Health Action Boundary

- [ ] Implement a pure inference-to-effect firewall.
- [ ] Reject evidence/inference as a capability grant.
- [ ] Reject model inference directly authorizing diagnosis finalization, prescribing, treatment, invasive action, or emergency dispatch.
- [ ] Reject H0/H1/H2 evidence claiming H3/H4/H5 execution authority.
- [ ] Reject continuation when required supervision is unavailable.
- [ ] Reject blind retry after an uncertain consequential physical effect.
- [ ] Reject regulatory research as execution authority.
- [ ] Reject consent as proof of competence or device safety.
- [ ] Positive evaluation may only mean “eligible to enter ordinary authorization”; `execution_authorized` remains false.

## Priority 7 — Synthetic Health conformance harness

- [ ] Add strict unknown-field and malformed-ID tests.
- [ ] Add cross-patient and cross-encounter contamination tests.
- [ ] Add model/version/input digest substitution tests.
- [ ] Add imported-record prompt/tool-injection fixtures.
- [ ] Add consent-purpose/recipient reuse tests.
- [ ] Add neural inference overreach tests.
- [ ] Add regulatory laundering tests.
- [ ] Add synthetic imaging provenance chain.
- [ ] Add synthetic specimen/custody provenance chain.
- [ ] Demonstrate minimum-necessary Context Capsule projection.
- [ ] Keep all first-stage data synthetic or separately governed.

## Priority 8 — Read-only interoperability laboratory

- [ ] **ADAPTER REQUIRED:** select one exact healthcare standard/profile.
- [ ] Select one exact read-only provider/system target.
- [ ] Bind endpoint/trust anchors and principal mappings.
- [ ] Preserve minimum-necessary data scope.
- [ ] Preserve imported content as untrusted data.
- [ ] Bind transformation/source provenance.
- [ ] Red-team parser/schema and prompt/tool injection.
- [ ] Prove protocol role labels never become local authority.
- [ ] Add no write path until read-only review passes.

## Priority 9 — AXIOM One Health surface

- [ ] Show a local longitudinal evidence timeline.
- [ ] Distinguish observation, model hypothesis, clinical assessment, diagnosis assertion, and recommendation visually and semantically.
- [ ] Show contradiction/correction history without erasure.
- [ ] Show provenance and inference receipts.
- [ ] Show consent, disclosure, and research-participation controls.
- [ ] Provide export/recovery and revocation guidance.
- [ ] Pass keyboard, screen-reader, contrast, phone, plain-language, and recoverable-error requirements.
- [ ] Do not expose clinical-action UI before separately promoted authority exists.

## Priority 10 — R1 non-invasive assessment

- [ ] **ADAPTER REQUIRED:** implement synthetic encounter coordinator and read-only sensor inputs.
- [ ] Keep first autonomy ceiling H1/H2.
- [ ] Bind model inference receipt and review thresholds.
- [ ] Produce signed evidence/provenance bundle.
- [ ] Route any follow-up/referral as a separate ordinary authorization request.
- [ ] **PROMOTION EVIDENCE REQUIRED:** clinical validation, privacy/security, human factors, jurisdiction, operations, support, and independent review before any controlled live pilot.

## Priority 11 — R2 supervised specimen laboratory

- [ ] **ADAPTER REQUIRED:** exact patient/encounter/order binding.
- [ ] Device/consumable identity and current status.
- [ ] Active qualified supervisor binding.
- [ ] Maximum-attempt semantics.
- [ ] Independent local physical safety controls.
- [ ] Post-procedure observation and specimen custody.
- [ ] Safe stop on supervision/network loss.
- [ ] Uncertain outcome reconciliation without blind retry.
- [ ] Keep H4 autonomous invasive execution out of scope until separately promoted.

## Priority 12 — R3 emergency escalation laboratory

- [ ] Multimodal anomaly evidence object.
- [ ] Repeat-check/patient-prompt state.
- [ ] Qualified-human escalation request.
- [ ] Separate H5 break-glass request semantics.
- [ ] Exact emergency destination identity.
- [ ] Short expiry/event-specific scope.
- [ ] Duplicate/uncertain request reconciliation.
- [ ] Capability closure and after-action evidence.
- [ ] Keep live emergency dispatch disabled until jurisdiction-specific authorization and independent review.

## Priority 13 — Clinical/regulatory deployment dossiers

- [ ] **PROMOTION EVIDENCE REQUIRED:** exact intended use.
- [ ] Eligible/excluded population.
- [ ] Jurisdiction/controller/processor roles.
- [ ] Professional credential and scope requirements.
- [ ] Device/model classification, validation, calibration, maintenance, authorization.
- [ ] Consent/access/correction/retention/deletion obligations.
- [ ] Incident/breach/recall/rollback/decommissioning.
- [ ] Accessibility/human-factors evidence.
- [ ] Clinical validation metrics and stopping rules.
- [ ] SLO/continuity/support staffing.
- [ ] Exact approved product/marketing claims.

## Completion rule for the inert v0 convergence slice

The first current-main Health convergence slice is complete only when:

1. the historical Health safety doctrine is represented on current main without duplicating generic primitives;
2. Health Evidence Graph, Clinical Inference Receipt, Research Participation, Neural Data Profile, and Health Action Boundary contracts have strict validators and negative tests;
3. synthetic fixtures contain no raw patient data, secrets, or credentials;
4. documentation and schema checks pass;
5. the complete kernel check passes or any unrelated baseline failure is explicitly isolated without calling the branch fully green;
6. `mesh/config/capabilities.json` still reports `domains.health` as `adapter_required`;
7. no clinical ingress, provider, device control, research egress, BCI ingestion, emergency dispatch, or H3/H4/H5 runtime authority has been added.
