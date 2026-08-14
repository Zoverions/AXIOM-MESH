# AXIOM Health Mesh — Foundation Architecture

**Status:** `0.1.0-draft.1`; documentation architecture only

**Date:** 2026-08-13

**Runtime effect:** none. This document does not add, enable, expose, or promote a runnable capability.

**Authority:** `mesh/config/capabilities.json` remains authoritative for runnable capability status. Every healthcare capability described here is future work until code, policy, registry state, tests, deployment evidence, clinical validation, regulatory authorization, and promotion decisions agree.

## 1. Purpose

AXIOM Health Mesh defines how healthcare agents, devices, robots, clinicians, laboratories, imaging systems, emergency services, and patients may coordinate through AXIOM-MESH without creating a parallel authority system.

The Health Mesh is **not** the clinician, diagnostic model, laboratory analyzer, imaging device, electronic health record, ambulance dispatch service, or regulator. It is the trust, authority, provenance, consent, evidence, and coordination substrate beneath those systems.

The governing principle is:

> **Clinical intelligence may recommend or act only through explicit, bounded, attributable authority. Evidence must remain distinguishable from claims, and automation must fail safely when authority, identity, provenance, or clinical state is uncertain.**

All privileged Health Mesh effects must preserve the existing AXIOM authority sequence:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Healthcare adapters, booth controllers, robots, model runtimes, FHIR gateways, laboratory interfaces, and emergency connectors are clients of that substrate. They do not become alternate authority roots by being installed, connected, certified, or clinically useful.

## 2. Initial target systems

The first Health Mesh architecture is intended to support future bounded workflows involving:

- autonomous or semi-autonomous health-assessment booths;
- non-invasive vital-sign and sensor capture;
- calibrated visual, retinal, dermoscopic, otoscopic, oral, gait, respiratory, audio, and similar assessments;
- point-of-care testing;
- specimen collection and chain-of-custody;
- remotely supervised or future autonomous venipuncture;
- diagnostic imaging orchestration;
- AI-assisted triage, interpretation, measurement, and report drafting;
- remote human exception handling;
- emergency escalation;
- laboratory, pharmacy, specialist, hospital, public-health, and electronic-record integration;
- longitudinal patient-controlled consent and data-access policy.

The architecture is deliberately broader than the first implementation. The implementation must start with low-risk, read-only or observational paths.

## 3. Non-goals

This draft does not claim:

- autonomous diagnosis is presently authorized;
- autonomous prescribing or treatment is authorized;
- robotic venipuncture is production-ready in AXIOM;
- a healthcare booth may operate without jurisdiction-specific licensing;
- medical-device certification is inherited from AXIOM;
- a model is clinically safe because it is cryptographically identified;
- a signed receipt proves that a clinical conclusion is correct;
- emergency services may be contacted without an explicitly authorized adapter and policy;
- Health Mesh satisfies PHIPA, HIPAA, GDPR, PIPEDA, provincial health law, medical-device law, laboratory law, professional standards, or any other jurisdiction merely by implementing this architecture.

Regulatory and clinical validation remain separate promotion gates.

## 4. Core actors

### 4.1 Patient principal

Represents a person receiving care. A patient principal may express consent, restrictions, preferences, revocations, emergency directives, data-sharing policy, authorized representatives, and jurisdictional identity bindings.

The patient principal is not reduced to a database identifier. Identity assurance, legal identity, health-card identity, device identity, and local AXIOM identity are separate claims and must be explicitly bound when needed.

### 4.2 Clinical human principal

A licensed or otherwise authorized person such as a physician, nurse, phlebotomist, paramedic, laboratory professional, imaging technologist, pharmacist, or other regulated worker.

Clinical credentials must include issuer, jurisdiction, scope, expiry, status, and verification evidence. A role label such as `doctor` is insufficient authority.

### 4.3 Machine principal

A bounded machine actor: booth controller, imaging workflow agent, robotic device, diagnostic model, scheduling agent, laboratory interface, remote-monitoring agent, or other software/hardware system.

Machine principals inherit existing AXIOM requirements for finite scope, explicit purpose, destination ceilings, runtime identity, expiry, revocation, non-delegation by default, resource limits, and evidence generation.

### 4.4 Device principal

A medical or supporting device whose identity, software version, calibration status, maintenance state, safety classification, and regulatory status may affect whether its output is admissible for a clinical workflow.

Device identity is not proof of calibration or regulatory authorization. Those are separately signed/verifiable claims.

### 4.5 Model principal / model artifact

A diagnostic, predictive, triage, reconstruction, segmentation, language, vision, or decision-support model.

The Mesh must bind a clinical inference to at least:

- model identifier;
- exact version or digest;
- runtime identity;
- intended-use claim;
- input data class;
- output type;
- jurisdictional authorization status where applicable;
- applicable population/validation constraints where known;
- confidence or uncertainty representation when supported;
- required human-review tier.

### 4.6 Organization principal

Represents a hospital, clinic, laboratory, public-health authority, imaging centre, emergency service, government agency, insurer, research institution, or vendor. Organizational membership alone does not grant clinical capability.

## 5. Clinical autonomy ladder

Every consequential Health Mesh capability must declare an autonomy level. Higher levels may not silently inherit lower-level permission without policy saying so.

| Level | Name | Meaning |
|---|---|---|
| H0 | Observe | Capture or transport data; no clinical interpretation or consequential action. |
| H1 | Assist | Produce measurements, summaries, alerts, or candidate interpretations for human review. |
| H2 | Recommend | Recommend a bounded clinical or operational next step; human authorization is required before consequential execution. |
| H3 | Supervised execute | Perform a physical or digital clinical action under active or immediately available qualified human supervision. |
| H4 | Autonomous routine execute | Perform a validated routine action within exact eligibility criteria and mandatory exception rules. |
| H5 | Emergency constrained authority | Exercise narrowly predefined emergency actions when verified trigger conditions are met; always high-assurance, strongly audited, and separately governed. |

No roadmap item may describe a workflow as autonomous without identifying its autonomy level and promotion evidence.

## 6. Clinical capability envelope

A future clinical grant must bind more than an ordinary action name. At minimum it should constrain:

- actor principal;
- patient or pseudonymous subject scope;
- action;
- purpose;
- data classes readable;
- data classes writable;
- target device/service;
- clinical autonomy level;
- jurisdiction;
- credential requirements;
- model/device identities where relevant;
- eligible patient/workflow criteria;
- contraindications and exclusion criteria;
- maximum duration;
- maximum attempts;
- maximum physical or logical effect;
- escalation target;
- required human review;
- retention rule;
- evidence obligations;
- emergency override eligibility;
- revocation semantics.

The draft machine-readable envelope lives at `docs/architecture/contracts/health-mesh-clinical-envelope.v0.1.schema.json`.

## 7. Consent and patient authority

Consent must be represented as a first-class policy/evidence object, not merely a UI checkbox.

Health Mesh should eventually support:

1. **purpose-bound consent** — e.g. use this retinal image for current clinical assessment;
2. **data-class consent** — allow skin images but not unrelated records;
3. **recipient-bound consent** — family physician may access full result, research system receives de-identified aggregate only;
4. **time-bound consent** — temporary access for an encounter;
5. **revocable consent** — future access can be withdrawn subject to legal retention obligations;
6. **representative consent** — authorized guardian, substitute decision-maker, caregiver, or proxy;
7. **emergency break-glass policy** — narrowly scoped access during incapacity/emergency;
8. **patient-visible audit** — the patient can inspect material accesses and consequential actions.

Consent does not override mandatory safety, reporting, retention, or legal obligations. Policy must represent conflicts explicitly rather than pretending one universal consent flag resolves them.

## 8. Data minimization and compartmentalization

Health Mesh should default to the minimum information needed for the task.

Example: a dermatology model may need lesion imagery, age band, relevant medications, selected history, and imaging context. It should not receive unrelated psychiatric notes, tax information, full identity, or the patient's complete record merely because those fields exist.

Required design properties:

- local processing where practical;
- purpose-specific data views;
- pseudonymous or encounter-scoped identifiers when full identity is unnecessary;
- separation of operational video from clinical imagery;
- separate retention policies for raw media, derived measurements, and clinical records;
- encryption in transit and at rest;
- no broad credential injection into model context;
- no raw secrets in logs, prompts, telemetry, or evidence bundles;
- explicit export destinations;
- deny-egress for unapproved destinations.

## 9. Clinical evidence and provenance chain

A health record should be able to prove not only **what** was recorded, but how the result was produced.

A specimen-derived result may require a chain such as:

```text
patient identity binding
 -> order / authorized screening pathway
 -> collection authorization
 -> collection device identity
 -> collector or robot identity
 -> timestamp + location / encounter
 -> specimen container identity
 -> collection conditions
 -> custody transfers
 -> preprocessing / centrifugation / storage
 -> analyzer identity + calibration/QC state
 -> assay lot / method where required
 -> result
 -> interpretation model or clinician
 -> finalization / acknowledgement
```

An imaging inference may require:

```text
patient / encounter
 -> scanner identity
 -> acquisition protocol
 -> acquisition timestamp
 -> reconstruction software/model digest
 -> image-series digest
 -> interpretation model digest
 -> output/measurement digest
 -> clinician review state
 -> report/result anchor
```

Grid receipts prove AXIOM-recorded facts and signatures. They do not prove external-world truth unless supported by the relevant attested source and validation chain.

## 10. Health booth reference architecture

A future autonomous health booth should be decomposed into bounded components rather than one omnipotent agent.

```text
Patient
  |
  v
Identity / consent surface
  |
  v
Encounter coordinator
  |----> interview agent
  |----> non-invasive sensors
  |----> imaging / vision subsystem
  |----> point-of-care testing
  |----> specimen collection subsystem
  |----> safety-monitoring subsystem
  |
  v
AXIOM authorization + evidence path
  |
  +----> remote clinical exception queue
  +----> lab / imaging / record gateway
  +----> referral / follow-up
  +----> emergency escalation gateway
```

The encounter coordinator must not inherit unrestricted access to every downstream component. Each subsystem receives a narrower capability.

## 11. Post-procedure safety and exception handling

Automation is clinically meaningful only when the system can detect and manage failure.

For a future automated blood-draw workflow, the Mesh should separate:

- procedure capability;
- observation capability;
- physiological sensor capability;
- anomaly-classification capability;
- patient-interaction capability;
- remote-clinician connection capability;
- local safety-device capability;
- emergency-dispatch request capability.

A reference response ladder is:

```text
normal observation
 -> suspected anomaly
 -> automated check / repeat measurement
 -> patient verbal interaction
 -> remote qualified-human escalation
 -> local physical safety action if authorized
 -> emergency dispatch if policy trigger is satisfied
```

A camera alert alone should not automatically imply a medical emergency unless policy explicitly permits that trigger. Multimodal evidence and conservative escalation are preferred.

## 12. Emergency break-glass semantics

Emergency authority is not a blanket bypass. It is a separately governed capability class.

A break-glass action must bind:

- triggering condition;
- source evidence;
- patient state / incapacity basis where relevant;
- exact additional data/action scope;
- maximum duration;
- receiving emergency principal/service;
- reason code;
- mandatory after-the-fact audit;
- patient notification when legally/clinically appropriate;
- revocation/closure on event termination.

H5 emergency capabilities should require stronger assurance than routine capabilities and must be impossible for ordinary workflow agents to mint for themselves.

## 13. Remote supervision model

Health Mesh should support one qualified human supervising multiple automated endpoints only when the workflow, jurisdiction, staffing ratio, response latency, and clinical risk permit it.

Remote supervision requires:

- verified supervisor credential and current eligibility;
- explicit patient/encounter assignment;
- known device/booth identity;
- bounded live data/video capability;
- escalation latency target;
- safe local fallback if connectivity fails;
- maximum concurrent cases;
- handoff semantics;
- audit of interventions and non-response;
- no assumption that a remote supervisor can physically rescue a patient.

Loss of remote connectivity must not silently convert supervised execution into autonomous execution.

## 14. Physical-device safety boundary

Cryptographic authorization cannot substitute for physical safety engineering.

Embodied and invasive systems require independent safety controls such as:

- hardware emergency stop;
- force / motion / pressure ceilings;
- physical exclusion zones;
- patient-release mechanism;
- consumable validation;
- sterile/single-use boundaries where applicable;
- detection of movement or unsafe posture;
- safe state on network loss;
- local watchdog independent from the planning model;
- maintenance and calibration checks;
- tamper evidence;
- incident quarantine.

A model or network service may not be the sole guard against a physically unsafe action.

## 15. Model governance

Health Mesh must distinguish **model authorization** from **model correctness**.

Future model governance should require:

- exact artifact digest/version;
- intended use;
- clinical task;
- approved input modality;
- eligible population;
- known exclusions;
- validation evidence reference;
- drift/performance monitoring plan;
- threshold policy;
- human-review policy;
- rollback path;
- jurisdictional approval state where required;
- auditability of model replacement.

Silent model upgrades are prohibited for consequential clinical workflows. A model change that alters clinical behavior must create a new evidence/promotion boundary.

## 16. Interoperability boundary

Health Mesh should prefer standards-based adapters while preserving AXIOM authority semantics.

Likely future integration surfaces include healthcare-record APIs, laboratory information systems, imaging/PACS systems, pharmacy systems, scheduling systems, public-health systems, and emergency services. FHIR or any other protocol may carry data, but protocol compatibility must never imply authorization.

An adapter must not be allowed to convert a broad remote credential into broad local capability.

## 17. Failure semantics

Health Mesh consequential operations must explicitly represent at least:

- authorized;
- denied;
- confirmation required;
- human review required;
- unavailable;
- uncertain external outcome;
- invalid provenance;
- stale credential;
- stale calibration/maintenance;
- model outside intended use;
- patient outside eligibility criteria;
- consent conflict;
- emergency escalation required;
- safe local shutdown.

Unknown state must not be treated as success.

## 18. Healthcare-specific promotion gates

The ordinary AXIOM lifecycle remains:

1. built;
2. enabled;
3. exposed;
4. production-promoted;
5. marketed.

Health Mesh adds domain evidence that must exist before consequential clinical promotion:

- **H-G0 Architecture** — exact authority/data/provenance boundaries specified;
- **H-G1 Bench conformance** — deterministic contract and negative tests;
- **H-G2 Device/model evidence** — identity, validation, maintenance/calibration, intended use;
- **H-G3 Clinical safety evidence** — relevant clinical/operational validation;
- **H-G4 Regulatory/legal evidence** — jurisdiction-specific authorization and operator obligations;
- **H-G5 Human factors** — accessibility, usability, informed consent, exception handling;
- **H-G6 Security/privacy review** — threat model, breach paths, data minimization, adversarial testing;
- **H-G7 Controlled pilot** — supervised deployment with predefined stopping rules;
- **H-G8 Operations** — incident response, monitoring, rollback, recall, continuity, staff coverage;
- **H-G9 Independent promotion review** — evidence agrees with exact marketed/autonomous scope.

A feature may be technically implemented and still remain non-exposable because one or more healthcare gates are open.

## 19. First reference workflows

The initial specification/test programme should cover three workflows.

### R1 — Non-invasive assessment

```text
patient consent
 -> identity binding
 -> structured interview
 -> vitals
 -> calibrated imagery/sensor capture
 -> bounded AI analysis
 -> human review if threshold crossed
 -> signed result/provenance record
 -> follow-up scheduling/referral request
```

Initial autonomy target: H1/H2 only.

### R2 — Supervised specimen collection

```text
order/eligibility
 -> consent
 -> device and consumable verification
 -> remote supervisor assignment
 -> venous/capillary collection
 -> post-procedure observation
 -> specimen custody chain
 -> lab handoff
 -> result ingestion
 -> exception handling
```

Initial autonomy target: H3; no autonomous invasive execution in the first implementation.

### R3 — Post-procedure emergency escalation

```text
observation
 -> multimodal anomaly
 -> repeat check / patient prompt
 -> remote clinical escalation
 -> exact break-glass capability if trigger satisfied
 -> emergency-service request
 -> event evidence bundle
 -> capability closure
 -> after-action review
```

Initial autonomy target: H1/H2 for detection and escalation; H5 remains laboratory-only until explicit future promotion evidence exists.

## 20. Tier-0 implementation prerequisites

Before any Health Mesh clinical prototype can become production-reachable, AXIOM must close or explicitly bound the following cross-cutting foundations:

1. persistent replay protection suitable for clinical consequence;
2. strong evidence binding between request, authority, device/model identity, input, and result;
3. durable revocation and credential-status semantics;
4. tamper-resistant/externally anchored continuity appropriate to the assurance claim;
5. precise emergency-capability issuance and closure semantics;
6. durable audit and patient-visible access history;
7. deterministic identity/credential verification;
8. safe uncertainty handling for external effects;
9. compartmentalized secrets/data egress;
10. independent security review before live clinical authority.

## 21. Architecture doctrine

Health Mesh adopts the following immediate design commitments:

1. No clinical agent or device receives ambient authority.
2. Consent is necessary where applicable but does not replace safety or law.
3. Protocol compatibility never grants permission.
4. Device/model identity never proves correctness by itself.
5. Clinical autonomy is explicit and graded.
6. Emergency authority is narrower and more strongly governed, not broader and implicit.
7. Local processing and minimum-necessary disclosure are preferred.
8. Raw video and intimate imagery require purpose-specific handling and retention.
9. Physical safety requires local hardware controls independent of a reasoning model.
10. Human exception handling is a first-class architecture path, not an admission of failure.
11. Unknown or unverifiable clinical state fails toward safety.
12. Every consequential transition must be reconstructable from evidence.
13. Patient-visible accountability is a product requirement, not merely an operator log.
14. Health Mesh does not weaken the existing AXIOM authority sequence.
15. No healthcare capability is marketed beyond its validated and promoted scope.

## 22. Relationship to The Great Activation

The Great Activation may model healthcare automation as a production/capacity system: scanners, laboratories, booths, robots, workers, AI models, capital, throughput, downstream treatment capacity, and health outcomes.

AXIOM Health Mesh addresses a different question:

> **How can that increasingly automated healthcare production system exercise authority safely, privately, accountably, and at scale?**

The two systems should exchange planning assumptions and measured bottlenecks, but neither should silently become the other's source of runtime authority or factual truth.

## 23. Next documents

This foundation is paired with:

- `docs/ROADMAP-EXTENSION-HEALTH-MESH.md`;
- `docs/MASTER-TODO-HEALTH-MESH.md`;
- `docs/security/HEALTH-MESH-THREAT-MODEL.md`;
- `docs/architecture/contracts/health-mesh-clinical-envelope.v0.1.schema.json`.

These documents remain planning/specification artifacts until separately implemented and promoted.
