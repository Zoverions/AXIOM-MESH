# Pilot External Evidence Checklist

Build: 0.12.0-dev.3
Maps to PROJECT-STATUS promotion blockers and docs/operations/PILOT-DEPLOYMENT-DOSSIER.md
Verifiers: mesh/src/pilot-dossier.mjs, mesh/src/pilot-evidence-package.mjs, mesh/src/independent-security-review.mjs
Scripts: pilot:dossier:verify, pilot:package:verify, security-review:verify (drills exist; drills are not live evidence)

Status: Executable checklist for authentic evidence only.

## 1. Dedicated pilot hardware

- Owner: ____________________
- Evidence artifact: evidence/deployment_manifest.json (axiom-pilot-deployment-manifest.v2). Declares isolated-non-public-pilot, independent-service-units (Gateway, Grid, Hypervisor, Sandbox), no public ingress, deny-egress, CPU/memory limits, platform/region labels, deploy time before observation.
- Verifier mapping: dossier type deployment_manifest; package detail contract binds topology and boundary fields to the dossier. Preflight pilot:dossier:verify; final pilot:package:verify.
- PROJECT-STATUS blocker: dedicated pilot hardware (item 1).

## 2. Thirty-day (720-hour) observation

- Owner: ____________________
- Evidence: evidence/availability_observation.json (axiom-pilot-availability-evidence.v2) and evidence/capacity_measurement.json (axiom-pilot-capacity-evidence.v2). Policy mins: >=720h; availability and intent success >=99.5%; >=1000 low-risk intents; p95 <=2000ms; evidence loss after acknowledged mutation = 0.
- Verifier mapping: types availability_observation and capacity_measurement under axiom-pilot-review-policy.v1; package detail contracts bind timestamps, duration, counts, enforcement. Scripts: pilot:dossier:verify, pilot:package:verify.
- PROJECT-STATUS blocker: 30-day availability/capacity observation (item 1).

## 3. Custody (secrets, provider, workload identity, backup media)

- Owner: ____________________
- Evidence: evidence/custody_assessment.json (axiom-pilot-custody-assessment.v2); also provider_assessment.json, credential_rotation.json, data_key_rotation.json, scheduled_restore.json as applicable.
- Required custody controls (dossier): data-protection key, transport CA, service identities, secret-provider signer, policy-provider signer. Each: backend, custodian, workload identity, rotation observed, unique receipt digest; exportable=false.
- Trust-root digests (four distinct): Grid, transport CA, secret-provider signer, policy-provider signer.
- Verifier mapping: types custody_assessment, provider_assessment, credential_rotation, data_key_rotation, scheduled_restore; security_reviewer signs provider/custody; data_recovery_reviewer signs restore/rotations. pilot:package:verify.
- PROJECT-STATUS blockers: items 2–3.

## 4. Continuity anchors (external Grid continuity)

- Owner: ____________________
- Evidence: operational retention of axiom-grid-continuity-anchor.v1 records outside AXIOM_DATA_DIR, with cadence and independent custody path documented in deployment_manifest / custody receipts and summarized in dossier narrative fields as required by promotion body.
- Verifier mapping: not a separate thirteenth evidence type; reviewers validate continuity practice against Grid evidence boundary in PROJECT-STATUS and custody_assessment / availability continuity fields. Package verifier still requires zero acknowledged evidence loss in availability_observation.
- PROJECT-STATUS blocker: item 4 (cadence and independent custody path for external Grid continuity anchors).
- Non-claim: anchors are not BFT finality.

## 5. Telemetry acknowledgement

- Owner: ____________________
- Evidence: evidence/external_telemetry.json (axiom-pilot-telemetry-evidence.v2). Pilot-owned collection and retention; authenticated metrics and alert transport; fixed vocabulary; secret omission; dossier-bound acknowledgement time; delivery receipts. Critical alert acknowledgement <= 30 minutes per policy.
- Verifier mapping: type external_telemetry; producer role platform_operator. pilot:dossier:verify / pilot:package:verify.
- PROJECT-STATUS blockers: items 2 and 7 (telemetry/alert receivers, retention decision, measured named-person acknowledgement).

## 6. Thirty-two credential-history dispositions

- Owner: ____________________
- Evidence: evidence/credential_history_attestations.json (axiom-pilot-credential-history-attestations.v2). Exactly 32 deprecated-history candidates: each provider/custodian receipt or independently reviewed not-applicable; none pending or reintroduced; external disposition ledger complete.
- Verifier mapping: type credential_history_attestations; signed by security_reviewer; policy pins exactly 32 entries. pilot:package:verify.
- PROJECT-STATUS blocker: item 5. Tracker: PILOT-009.

## 7. Incident tabletop

- Owner: ____________________
- Evidence: evidence/incident_tabletop.json (axiom-pilot-incident-tabletop-evidence.v2). Facilitated exercise; at least two unique named responders; policy-pinned independent reviewer; notification decisions; containment, recovery, communications, closure; zero unresolved critical/high findings.
- Verifier mapping: type incident_tabletop; producer role independent_reviewer. pilot:package:verify.
- PROJECT-STATUS blocker: item 6.

## 8. Independent security review

- Owner: ____________________
- Evidence: evidence/independent_security_review.json (axiom-pilot-independent-security-review.v2) plus external findings ledger. Policy-pinned reviewer and organization; exact review scope; report digest; finding counts; zero unresolved critical/high; remediation ownership; residual risk documented. For current-build authentic evidence, report_sha256 equals ledger_sha256 after successful verification of the canonical signed findings ledger.
- Verifier mapping: type independent_security_review; also mesh/src/independent-security-review.mjs via security-review:verify. See docs/security/INDEPENDENT-SECURITY-REVIEW.md.
- PROJECT-STATUS blocker: item 8.

## 9. Exact pilot evidence package and separate promotion decision

- Owner: ____________________
- Package layout (exact; no extras): policy.json, dossier.json, and the 13 evidence/*.json files including image_provenance.json per PILOT-DEPLOYMENT-DOSSIER.
- Preflight script: pilot:dossier:verify
- Final script: pilot:package:verify
- Successful result schema: axiom-pilot-evidence-package-verification.v2 with production_promoted false and intake accepted-for-promotion-review only.
- Separate artifact: written promotion-body decision (verifier does not emit promotion).
- PROJECT-STATUS blocker: item 9.

## Reviewer roles (policy-pinned, distinct keys)

1. release_manager
2. platform_operator
3. security_reviewer
4. data_recovery_reviewer
5. independent_reviewer

## Non-claims for this checklist

- Completing a row does not deploy Mesh or change capabilities.json.
- Drill outputs (pilot:dossier:drill, pilot:package:drill, security-review:drill) are not live evidence.
- accepted-for-promotion-review is not production promotion.
