# AXIOM-MESH Master TODO — Health Mesh

**Status:** execution queue for Health Mesh foundation work

**Date:** 2026-08-13

**Authority note:** this queue does not change runnable capability status. `mesh/config/capabilities.json` remains authoritative.

## Tier 0 — Preconditions before consequential clinical authority

- [ ] Close or explicitly bound persistent replay protection for health-domain actions.
- [ ] Strengthen evidence binding so request, grant, patient/encounter, device/model identity, input artifact, and result cannot be silently recombined.
- [ ] Define durable credential-status and revocation semantics for clinical humans, devices, models, and organizations.
- [ ] Define single-use and maximum-attempt semantics for physical/invasive actions.
- [ ] Define emergency break-glass issuance, attenuation, expiry, destination pinning, closure, and after-action review.
- [ ] Define safe behavior for uncertain external clinical effects; prohibit blind retry where duplication can harm a patient.
- [ ] Complete independent security review of the underlying AXIOM production candidate before live clinical authority.
- [ ] Establish externally retained continuity requirements for high-consequence clinical event records.
- [ ] Define patient-visible access/audit semantics without exposing unrelated operational secrets.
- [ ] Establish a formal rule that required supervision loss never silently upgrades an H3 workflow into H4 autonomy.

## Tier 1 — Foundation contracts

- [x] Publish Health Mesh foundation architecture draft.
- [x] Publish clinical autonomy ladder H0-H5.
- [x] Publish draft clinical capability envelope schema.
- [x] Publish healthcare-specific threat model.
- [x] Publish Health Mesh roadmap extension.
- [ ] Define patient/encounter identity-binding schema.
- [ ] Define professional credential-claim schema with jurisdiction/scope/expiry/status.
- [ ] Define device status schema: identity, software, calibration, maintenance, recall/authorization state.
- [ ] Define model status schema: digest, intended use, population constraints, validation, approval, review tier.
- [ ] Define consent object: purpose, data class, recipient, duration, representative, revocation, legal conflict.
- [ ] Define specimen identity/custody event schema.
- [ ] Define clinical provenance edge vocabulary.
- [ ] Define emergency-event evidence schema.

## Tier 2 — Synthetic conformance harness

- [ ] Add schema validation tests for all Health Mesh documentation contracts.
- [ ] Build a health-domain policy fixture outside production policy.
- [ ] Prove H0-H5 autonomy cannot be escalated without explicit authority.
- [ ] Negative test H1 assistant attempting H4 procedure.
- [ ] Negative test ordinary machine principal attempting to mint H5 emergency authority.
- [ ] Negative test expired clinician credential.
- [ ] Negative test revoked device.
- [ ] Negative test stale calibration.
- [ ] Negative test wrong model digest.
- [ ] Negative test model outside intended population/task.
- [ ] Negative test consent for one purpose reused for another.
- [ ] Negative test cross-patient cache/session leakage.
- [ ] Negative test replayed specimen/procedure grant.
- [ ] Negative test remote-supervisor loss mid-workflow.
- [ ] Negative test unknown emergency destination.
- [ ] Negative test duplicate/uncertain emergency request.
- [ ] Negative test imported-note prompt/tool injection.
- [ ] Negative test camera-visible malicious text/QR attempting tool escalation.

## Tier 3 — Privacy and data-minimization testbed

- [ ] Define initial clinical data-class vocabulary.
- [ ] Implement synthetic minimum-necessary record projections.
- [ ] Demonstrate encounter-scoped pseudonymous processing.
- [ ] Separate operational video from clinical imagery in the reference data model.
- [ ] Add configurable raw-media TTL fixture.
- [ ] Prove raw video can be processed locally without routine upstream retention.
- [ ] Prove temporary live-video access is separately authorized for remote supervision.
- [ ] Prove research/analytics export requires a distinct capability and data view.
- [ ] Test no-secret/no-broad-credential leakage into model-visible context.

## Tier 4 — Provenance reference implementation

- [ ] Implement synthetic imaging provenance chain: scanner -> protocol -> reconstruction -> series digest -> model -> review -> report.
- [ ] Implement synthetic specimen provenance chain: patient -> collection -> container -> custody -> preprocessing -> analyzer -> result -> review.
- [ ] Bind device/model software digests into evidence.
- [ ] Bind calibration/QC references where required.
- [ ] Represent signed assertion separately from external-world truth claim.
- [ ] Add tamper tests for swapped specimen/result and swapped image/model output.
- [ ] Add selective patient-facing provenance projection.

## Tier 5 — Non-invasive booth simulation

- [ ] Define booth component principals rather than one monolithic booth principal.
- [ ] Implement synthetic encounter coordinator.
- [ ] Implement structured interview fixture.
- [ ] Add synthetic vitals/sensor capture.
- [ ] Add synthetic calibrated visual/audio capture metadata.
- [ ] Add H1 bounded analysis result.
- [ ] Route threshold-crossing results to a human-review queue.
- [ ] Produce end-to-end signed encounter/provenance bundle.
- [ ] Demonstrate follow-up/referral request without autonomous treatment.
- [ ] Add patient stop/help and accessibility states to workflow model.

## Tier 6 — Remote exception-handling simulation

- [ ] Define supervisor assignment/heartbeat contract.
- [ ] Define maximum concurrent supervised endpoints.
- [ ] Define response-latency SLO and non-response state.
- [ ] Issue bounded temporary live-data/video capability.
- [ ] Add supervisor handoff.
- [ ] Prove workflow halts safely when required supervision disappears.
- [ ] Log intervention, non-response, and handoff evidence.

## Tier 7 — Healthcare interoperability laboratory

- [ ] Select one exact read-only healthcare standard/profile.
- [ ] Build adapter outside the zero-dependency kernel where practical.
- [ ] Preserve AXIOM principal identity and native authority semantics.
- [ ] Map remote identity/data claims explicitly rather than trusting protocol role names.
- [ ] Demonstrate read-only patient/encounter data retrieval with minimum necessary scope.
- [ ] Red-team parser/schema and imported-content injection.
- [ ] Select one bounded write operation only after read path passes review.
- [ ] Use evidence-first prepared/outbox semantics for write.
- [ ] Define same-idempotency recovery for uncertain outcome.
- [ ] Prove adapter cannot bypass Hypervisor/Sandbox policy.

## Tier 8 — Supervised specimen laboratory

- [ ] Define invasive workflow H3 policy fixture.
- [ ] Bind procedure to exact patient/encounter/order.
- [ ] Verify device and consumable preflight.
- [ ] Bind active supervisor.
- [ ] Enforce maximum attempts.
- [ ] Add movement/unsafe-position detection input.
- [ ] Add local physical safety-controller contract.
- [ ] Add post-procedure observation state.
- [ ] Add specimen custody events.
- [ ] Add lab handoff/result ingestion.
- [ ] Test abort on supervisor/network loss.
- [ ] Test uncertain physical outcome without automatic repeat.
- [ ] Keep H4 autonomous invasive action out of scope.

## Tier 9 — Post-procedure safety and emergency laboratory

- [ ] Define multimodal anomaly evidence object.
- [ ] Implement patient prompt/recheck state.
- [ ] Add remote clinician escalation request.
- [ ] Define H5 break-glass request separately from ordinary escalation.
- [ ] Pin exact emergency destination/service identity.
- [ ] Add short expiry and event-specific scope.
- [ ] Add duplicate/uncertain dispatch recovery.
- [ ] Close emergency grant when event ends.
- [ ] Generate after-action evidence bundle.
- [ ] Add false-positive and missed-event evaluation framework.
- [ ] Keep live H5 dispatch disabled until independent review and jurisdiction-specific authorization.

## Tier 10 — Ontario/Canada regulatory foundation

- [ ] Map Ontario privacy obligations relevant to automated booths and connected health records.
- [ ] Map Health Canada medical-device/software classification triggers for each planned component.
- [ ] Map Ontario laboratory/specimen collection requirements.
- [ ] Map professional-scope and remote-supervision requirements for candidate procedures.
- [ ] Map emergency-dispatch and duty-of-care implications.
- [ ] Map data-retention, breach notification, access/correction, and consent-directive requirements.
- [ ] Identify which architecture requirements are jurisdiction-neutral versus Ontario-specific.
- [ ] Build a workflow-specific regulatory dossier template.
- [ ] Require legal/regulatory source citations and last-verified dates in every dossier.

## Tier 11 — Controlled deployment evidence

- [ ] Define exact intended use and autonomy level.
- [ ] Define eligible/excluded patient population.
- [ ] Define clinical validation metrics and stopping rules.
- [ ] Define privacy/security acceptance criteria.
- [ ] Define human-factors/accessibility acceptance criteria.
- [ ] Define incident response and device/model rollback.
- [ ] Define recall/quarantine procedure.
- [ ] Define named clinical and technical owners.
- [ ] Run supervised synthetic/bench pilot first.
- [ ] Run controlled human pilot only after applicable authorization and independent review.
- [ ] Publish only evidence-bounded claims.

## Tier 12 — Great Activation planning interface

- [ ] Define privacy-preserving aggregate throughput metrics.
- [ ] Track booth utilization and downtime.
- [ ] Track human supervision minutes per encounter.
- [ ] Track exception rate and cause.
- [ ] Track specimen failure/retry rate.
- [ ] Track downstream referral and diagnostic queue pressure.
- [ ] Track imaging/lab capacity constraints.
- [ ] Define a one-way boundary preventing planning analytics from issuing patient-specific clinical authority.
- [ ] Export resource-allocation evidence without unnecessary patient identifiers.

## Definition of foundation complete

The Health Mesh foundation phase is complete when:

1. all Tier-1 contracts have schemas and ownership;
2. the synthetic conformance harness proves autonomy, consent, identity, replay, revocation, and emergency-negative cases;
3. non-invasive R1, supervised specimen R2, and emergency-escalation R3 reference workflows can be replayed end to end with evidence;
4. the threat model has corresponding tests or explicit unresolved blockers;
5. no Health Mesh capability is production-reachable merely because the foundation exists;
6. every future live workflow has a jurisdiction-specific clinical/regulatory deployment dossier.
