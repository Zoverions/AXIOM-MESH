# AXIOM Health Mesh — Current Foundation

**Status:** convergence architecture; inert domain foundation; no clinical runtime authority

**Date:** 2026-09-03

**Capability boundary:** `domains.health` remains `adapter_required` in `mesh/config/capabilities.json`.

## Purpose

AXIOM Health Mesh defines how a person can accumulate, inspect, correct, selectively disclose, and authorize use of health-related evidence without turning any clinician, model, device, hospital, research environment, or protocol into an alternate root of authority.

The patient or subject is the persistent centre. Health data is evidence, not authority. Integrity evidence is not truth evidence. Model inference is not clinical authority. Clinical judgment remains attributable and reviewable. Consent is purpose-bound and cannot substitute for competence, device safety, regulatory eligibility, or execution authority.

All future consequential Health effects remain on the ordinary AXIOM path:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

A health adapter, medical model, EHR connector, booth controller, laboratory interface, BCI decoder, or clinical application is a client of that path. Connection, registration, installation, discovery, credential presentation, or model usefulness never grants ambient clinical capability.

## Relationship to current Mesh primitives

This foundation forward-ports the still-valid safety semantics from the earlier Health Mesh programme while consuming stronger current-main primitives rather than rebuilding them.

Health uses:

- canonical consent receipts for purpose-, scope-, controller-, destination-, expiry-, and revocation-bound consent;
- Sovereign Vaults for compartmentalized owner data;
- the Local Context Broker for authorized local synthesis;
- the generic Context Capsule for minimized external disclosure;
- constrained machine principals and provider/runtime contracts for software actors;
- the Grid evidence chain for integrity and chronology;
- current portability, backup, recovery, governance, and policy primitives.

There is no separate Health consent root and no `HealthContextCapsule`. Health-specific rules may tighten those generic contracts, but they may not weaken them.

## Sovereign Health Vault

Health information should live in independently governed Sovereign Vault compartments. A useful default hierarchy is:

```text
health
  / clinical-records
  / medication-and-treatment
  / fitness-and-wellbeing
  / accommodation-context
  / research-participation
  / neural-data
```

These names organize data; they are not permissions. Parent-vault membership does not imply ambient access to child vaults.

The owner's local companion may request broader Health context through short-lived local leases. External systems receive the minimum permitted Context Capsule needed for an approved purpose rather than a vault mount. For example, an accommodation workflow may receive `requires step-free access` without receiving the underlying diagnosis when the diagnosis is unnecessary.

## Health Evidence Graph

The current convergence programme adds a patient-sovereign longitudinal Health Evidence Graph. Its records preserve what was observed, asserted, derived, inferred, reviewed, corrected, contradicted, or separately authorized without collapsing those categories into one mutable truth slot.

Initial epistemic classes are:

- `observation`;
- `clinical-record`;
- `derived-feature`;
- `model-hypothesis`;
- `clinical-assessment`;
- `diagnosis-assertion`;
- `recommendation`;
- `authorized-care-action-record`.

A model hypothesis cannot become a clinical assessment by relabeling it. A later clinician assessment is a new attributable node with explicit provenance. Correction and supersession create new records and relationships without erasing the source history. Contradictory evidence remains visible.

The graph is a governed evidence model, not an authorization service. An `authorized-care-action-record` may record evidence that a separate authority path authorized or performed an action; the record itself grants nothing.

## Clinical Inference Receipt

A future model inference must be bound to the exact model artifact, runtime, intended-use evidence, bounded input-evidence digests, output digest, uncertainty representation, population constraints, calibration evidence where applicable, and human-review requirement.

The first Clinical Inference Receipt is inert. Its output may be classified only as a `model-hypothesis` or `derived-feature`. It cannot self-declare `clinical-assessment` or `diagnosis-assertion`, self-certify intended use, lower its own review floor, or create clinical authority.

Receipt validity proves that the declared inference contract is internally bound. It does not prove the medical conclusion is correct.

## Clinical autonomy ladder

Health preserves the earlier explicit H0–H5 vocabulary for future execution scope:

| Level | Name | Meaning |
|---|---|---|
| H0 | Observe | Capture or transport data; no clinical interpretation or consequential action. |
| H1 | Assist | Produce measurements, summaries, alerts, or candidate interpretations for review. |
| H2 | Recommend | Recommend a bounded next step; consequential execution still requires separate authority. |
| H3 | Supervised execute | Perform a clinical digital or physical action under required qualified-human supervision. |
| H4 | Autonomous routine execute | Perform a separately validated routine action within exact eligibility and exception rules. |
| H5 | Emergency constrained authority | Exercise a narrowly predefined emergency action under stronger, event-specific governance. |

The v0 Health Evidence Graph grants **none** of these runtime levels. Evidence may describe an H0/H1/H2 context without authorizing it.

No workflow may silently increase autonomy when required supervision disappears. Loss of supervision narrows or halts capability; it never converts H3 into H4. An uncertain physical effect is not blindly retried because duplication may harm the patient.

## Clinical capability envelope

Any future clinical effect must be narrower than an ordinary action label. A clinical envelope should bind at minimum:

- exact actor principal;
- patient/subject and encounter scope;
- action and purpose;
- readable and writable data classes;
- destination/device/service;
- H0–H5 autonomy ceiling;
- jurisdiction;
- required credential and current-status evidence;
- exact device and model identities where relevant;
- eligible population/workflow criteria and exclusions;
- duration and attempt ceilings;
- physical/logical effect ceiling;
- supervision and human-review requirements;
- retention and evidence obligations;
- emergency eligibility and escalation destination;
- revocation behavior.

The documentation schema at `contracts/health-mesh-clinical-envelope.v0.1.schema.json` is a planning contract only. It is not loaded as runtime clinical authority.

## Health Action Firewall

The Health Action Firewall is a semantic boundary, not a new privileged service:

> **Inference may propose. Only a separately authorized clinical workflow may effect.**

A Health evidence node, model receipt, consent record, regulatory research record, or planning workflow cannot be supplied as though it were a capability grant. H0/H1/H2 evidence cannot be used to claim H3/H4/H5 execution authority. Model output cannot directly authorize diagnosis finalization, prescribing, treatment, invasive action, emergency dispatch, or other consequential effects.

Any future effect that survives Health-specific checks still re-enters the ordinary AXIOM policy/grant path.

## Consent and disclosure

Health consent composes canonical consent receipts. Health may require stronger recipient, purpose, retention, study/protocol, representative, or withdrawal bindings, but a Health application does not get a parallel permission system.

Consent is necessary where applicable, but it does not establish:

- professional competence;
- device safety or calibration;
- model correctness;
- regulatory authorization;
- emergency eligibility;
- clinical authority.

External disclosure is minimum-necessary by default. The Local Context Broker may reason across authorized local vaults, but the Disclosure Compiler produces the generic Context Capsule for the exact recipient and purpose. An external model, institution, researcher, or agent receives no ambient Health Vault access.

## Research participation

Research participation is separately purpose-, recipient-, study/protocol-, data-class-, transformation-, model-training-, onward-disclosure-, retention-, expiry-, revocation-, withdrawal-, and result-return-bound.

A participation contract is policy/evidence input, not data transfer authority. Actual release still requires normal consent/currentness checks, context minimization, destination validation, and a separately authorized effect. Withdrawal stops future permitted use according to the applicable contract without falsely claiming AXIOM can erase legally retained or already external copies.

Model training on Health data is opt-in and false by default.

## Neural data

EEG, intracranial recordings, neural-interface streams, neuroimaging-derived signals, and decoder outputs require a high-sensitivity Neural Data profile.

The non-bypassable rule is:

> **A neural signal is evidence about neural activity. A decoder output is an inference about that evidence. Neither automatically establishes intention, consent, identity, preference, diagnosis, or authorization.**

Decoded communication may become an attributable communication assertion under an appropriate workflow. It does not become legal consent, identity proof, or execution authority merely because a decoder produced it.

## Device and physical-safety boundary

Cryptographic authorization does not replace physical safety engineering. Any future embodied/invasive Health workflow requires independent local controls appropriate to the device, such as hardware stop, motion/force/pressure ceilings, patient release, consumable validation, sterile/single-use boundaries, unsafe-position detection, watchdogs, calibration/maintenance checks, safe state on network loss, and incident quarantine.

A model or remote network service cannot be the sole guard against a physically unsafe action.

## Remote supervision and emergency authority

Remote supervision must bind current qualified-human eligibility, exact patient/encounter assignment, device identity, bounded live-data capability, response-latency expectations, maximum concurrency, handoff, local fail-safe behavior, and intervention/non-response evidence.

Emergency authority is a separate, narrower capability class. It must be trigger-bound, evidence-bound, destination-pinned, short-lived, event-specific, auditable, closable, and subject to after-action review. Ordinary agents cannot mint H5 authority for themselves.

The planning profile may describe a bounded emergency **request**. It does not currently authorize emergency-service dispatch.

## Regulatory and interoperability boundary

AXIOM does not decide what healthcare law permits. Jurisdiction, licence, professional scope, facility eligibility, device authorization, intended use, and similar regulatory/clinical states are externally sourced evidence with freshness and provenance requirements.

Missing required eligibility fails consequential planning closed. A research interpretation is not authorization. AXIOM cannot widen externally attested scope.

Future adapters may use FHIR, DICOM, laboratory, pharmacy, scheduling, public-health, neural, or other standards. Protocol compatibility never grants local permission, and remote role names never become local authority automatically. Imported records, images, transcripts, metadata, and QR/text content remain untrusted data capable of carrying prompt/tool injection.

## Failure semantics

Consequential Health workflows must distinguish at least:

- authorized;
- denied;
- confirmation required;
- qualified-human review required;
- unavailable;
- uncertain external outcome;
- invalid provenance;
- stale credential;
- stale calibration/maintenance;
- model outside intended use;
- subject outside eligibility;
- consent conflict;
- emergency escalation required;
- safe local shutdown.

Unknown state is never synthetic success.

## Promotion gates

Health remains subject to ordinary build/enable/expose/promote/market separation plus domain gates:

1. architecture and authority/data boundaries;
2. deterministic contract and negative-path conformance;
3. exact device/model evidence;
4. clinical-safety/validation evidence;
5. jurisdiction-specific legal/regulatory evidence;
6. human factors, accessibility, consent and exception handling;
7. independent security/privacy review;
8. controlled supervised pilot with stopping rules;
9. operations, incident, rollback, recall and continuity evidence;
10. independent promotion review matching the exact exposed claim.

A technically implemented Health contract can remain non-exposable indefinitely if those gates are open.

## Initial workflow targets

The original three reference shapes remain useful for later synthetic work:

- **R1 non-invasive assessment:** H1/H2 analysis and referral/next-step request only;
- **R2 supervised specimen collection:** H3 planning/simulation with mandatory supervision; H4 invasive autonomy remains out of scope;
- **R3 post-procedure escalation:** H1/H2 detection/escalation; H5 remains laboratory-only until independently promoted.

The first current-main implementation is lower consequence than all three: synthetic inert contracts and conformance tests only.

## Current non-claims

This foundation does not enable or claim:

- autonomous diagnosis;
- prescribing or treatment;
- medical advice to patients;
- EHR/FHIR/DICOM connectivity or conformance;
- medical-device or robot control;
- live patient-data ingestion;
- research egress or patient-data model training;
- live EEG/BCI ingestion;
- emergency dispatch;
- H3/H4/H5 runtime authority;
- PHIPA, HIPAA, GDPR, PIPEDA, Health Canada, provincial, professional, laboratory, medical-device, or other regulatory compliance;
- proof that a model or clinician conclusion is true;
- production promotion of `domains.health`.

The durable centre is the person's sovereign evidence and policy state, not any particular doctor, model, hospital, protocol, or vendor.
