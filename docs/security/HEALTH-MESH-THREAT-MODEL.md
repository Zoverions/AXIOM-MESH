# AXIOM Health Mesh — Threat Model

**Status:** `0.1.0-draft.1`; planning/security specification only

**Date:** 2026-08-13

**Runtime effect:** none. No healthcare capability is enabled or exposed by this document.

## 1. Security objective

Health Mesh must protect patients from both **information harm** and **clinical/physical harm** while preserving the existing AXIOM authority model.

The protected system is larger than ordinary health-record security. It may eventually contain:

- identity and consent;
- intimate video/images/audio;
- medical history and physiological data;
- diagnostic models;
- laboratory specimens and results;
- imaging systems;
- robots and other embodied devices;
- remote clinicians;
- emergency escalation;
- public/private healthcare infrastructure.

The primary security question is therefore not merely "can an attacker read the record?" but also:

> **Can any actor cause an unauthorized clinical action, suppress a necessary action, forge provenance, alter a patient-specific decision, defeat safety escalation, or make an unsafe machine appear authorized?**

## 2. Trust assumptions

This draft inherits the current AXIOM trust boundaries and non-claims.

We do not assume:

- the host/root environment is incorruptible;
- a machine principal's runtime ID proves hardware attestation;
- a vendor signature proves clinical correctness;
- a medical-device identifier proves calibration;
- a model digest proves safety or absence of bias;
- a remote endpoint tells the truth merely because transport is authenticated;
- a patient, clinician, operator, vendor, regulator, or government system is infallible;
- network connectivity is continuous;
- a signed Grid record proves an external-world event absent supporting evidence.

## 3. Protected assets

### 3.1 Patient safety

Highest priority. Includes preventing unauthorized invasive actions, dangerous recommendations, missed emergencies caused by system suppression, unsafe device actuation, contraindicated procedures, and inappropriate autonomous escalation.

### 3.2 Clinical integrity

Orders, measurements, images, specimen identities, results, reports, referrals, medication information, clinical state, model outputs, and review status.

### 3.3 Authority integrity

Capabilities, grants, credentials, consent, supervision state, emergency permissions, revocations, destination allowlists, and autonomy-level restrictions.

### 3.4 Provenance integrity

Binding among patient/encounter, device, model, input, collection event, analyzer, result, reviewer, and downstream action.

### 3.5 Confidentiality

Health records, raw images, video, audio, biometrics, intimate imagery, genetic information, identifiers, and derived clinical data.

### 3.6 Availability and continuity

Safe operation during service loss, local/network outage, sensor failure, remote-supervisor loss, partial record unavailability, and emergency conditions.

## 4. Adversaries and failure sources

Health Mesh must consider both malicious and non-malicious failures:

- external attacker;
- malicious or compromised vendor;
- compromised clinic/hospital account;
- compromised booth or robot;
- malicious insider;
- overprivileged clinician/operator;
- compromised diagnostic model or runtime;
- supply-chain compromise;
- stolen or cloned device identity;
- model/data poisoning;
- prompt/tool injection through patient input or external records;
- fraudulent patient or identity mismatch;
- accidental patient mix-up;
- stale credential or revoked license;
- stale calibration/maintenance state;
- sensor malfunction;
- network partition;
- emergency-service endpoint failure;
- configuration drift;
- benign model error;
- human supervision overload or inattention.

## 5. Major threat classes

### T1 — Patient/encounter misbinding

A legitimate result is bound to the wrong person or encounter.

Examples:

- two patients swap booth sessions;
- specimen label and encounter diverge;
- cached session survives logout;
- scanner receives the previous patient's context.

Required controls:

- explicit encounter lifecycle;
- repeated high-risk identity checkpoints;
- device-generated specimen/encounter binding;
- session teardown;
- mismatch alarms;
- negative tests for cross-principal leakage.

### T2 — Consent confusion or overreach

A valid consent for one purpose is reused for another.

Controls:

- purpose/data/recipient/time-bounded consent;
- policy conflict resolution;
- revocation handling;
- no interpretation of "connected to public healthcare" as blanket consent;
- patient-visible access history.

### T3 — Clinical privilege escalation

A machine or human obtains greater clinical authority than authorized.

Examples:

- H1 diagnostic assistant invokes H4 procedure;
- scheduling agent gains record-write authority;
- remote supervisor credential is reused by another endpoint;
- ordinary workflow mints an H5 emergency grant.

Controls:

- attenuation-only delegation;
- autonomy level as mandatory grant field;
- separate emergency issuer/policy;
- action/destination ceilings;
- exact credential requirements;
- no ambient downstream credentials.

### T4 — Model substitution or silent upgrade

An approved model is replaced with a different artifact or endpoint.

Controls:

- digest binding;
- signed deployment metadata;
- exact runtime/model identity in grant/evidence;
- model-change promotion gate;
- deny on unknown digest.

### T5 — Model used outside intended population/task

A technically functioning model is asked to perform a task or patient population for which it is not validated.

Controls:

- eligibility and intended-use constraints;
- required population metadata;
- policy-deny on unresolved eligibility;
- escalation to human review.

### T6 — Sensor/device spoofing

Fake or stale sensor data causes a clinical action.

Controls:

- device identity;
- freshness bounds;
- calibrated measurement provenance;
- cross-sensor consistency where appropriate;
- impossible-value detection;
- no single weak camera inference as sole trigger for high-consequence action unless specifically validated.

### T7 — Calibration/maintenance bypass

A device operates after calibration expiry, safety recall, maintenance failure, or consumable mismatch.

Controls:

- fresh calibration/maintenance references;
- recall/revocation registry;
- local preflight checks;
- deny on stale/unknown status;
- quarantine path.

### T8 — Prompt/tool injection through clinical content

Patient speech, imported notes, external records, images, QR codes, or vendor metadata attempt to manipulate an AI agent into invoking tools or disclosing data.

Controls:

- clinical content treated as untrusted data;
- tool authority never derived from natural-language instructions in records;
- schema validation;
- isolation between model context and credentials;
- deny-egress;
- bounded destinations;
- adversarial conformance corpus.

### T9 — Specimen chain-of-custody corruption

Specimen identity, collection condition, storage, transfer, or analyzer binding is altered or lost.

Controls:

- unique specimen identifiers;
- signed custody transitions;
- timing/temperature/processing evidence where required;
- analyzer/result binding;
- reject ambiguous or broken chain.

### T10 — Physical robot unsafe actuation

An invasive/embodied device moves, punctures, grips, injects, or otherwise acts outside safe bounds.

Controls:

- hardware safety envelope independent of AI;
- force/motion/depth ceilings;
- emergency stop;
- movement detection;
- validated local control loop;
- consumable/sterility checks;
- safe state on authority/network loss;
- maximum-attempt policy;
- H3 before H4 for invasive workflows.

### T11 — Remote-supervision illusion

A workflow claims active supervision when the clinician is unavailable, overloaded, disconnected, or watching another patient.

Controls:

- explicit assignment/heartbeat;
- concurrency ceiling;
- response-latency SLO;
- handoff state;
- safe local halt on supervisor loss where supervision is required;
- audit non-response.

### T12 — Emergency escalation abuse

An attacker or faulty model triggers false emergency dispatch or obtains emergency data access.

Controls:

- separate H5 policy;
- multimodal/qualified trigger rules where possible;
- rate limits;
- destination pinning;
- event-specific grant;
- short expiry;
- mandatory post-event review.

### T13 — Emergency suppression

A compromised component prevents a legitimate emergency escalation.

Controls:

- local independent safety monitor;
- redundant trigger path for high-risk procedures;
- watchdog/health checks;
- patient-accessible emergency control where feasible;
- alert on disabled monitoring.

### T14 — Raw-media overcollection

Continuous video/audio or intimate images are retained beyond clinical need.

Controls:

- local ephemeral processing by default;
- separate clinical image capture from surveillance buffer;
- short raw-media TTL;
- explicit retention trigger;
- auditable access;
- encrypted storage and deletion workflow.

### T15 — Cross-domain data leakage

A vendor, insurer, research system, analytics service, or unrelated clinical model receives data not necessary for its purpose.

Controls:

- minimum-necessary views;
- pseudonymous identifiers;
- destination allowlists;
- purpose constraints;
- deny-egress;
- export receipts.

### T16 — Replay and duplicate clinical action

A previously valid order/grant is replayed, causing duplicate blood draw, referral, medication action, or other effect.

Controls:

- persistent replay protection;
- atomic approval consumption;
- idempotency binding;
- single-use procedure grants where appropriate;
- terminal evidence anchors.

Persistent replay protection is Tier-0 before consequential Health Mesh deployment.

### T17 — Uncertain external outcome

The Mesh loses confirmation after requesting an external action such as referral, lab order, record write, or emergency dispatch.

Controls:

- evidence-first prepared state;
- deterministic idempotency key;
- same-operation recovery;
- no blind retry for non-idempotent effects;
- explicit `uncertain` state and human/operator recovery.

### T18 — Audit truncation or evidence tampering

A malicious host removes the record of an unsafe or unauthorized event.

Controls:

- signed hash-linked evidence;
- externally retained continuity anchors;
- independent retention for high-consequence events;
- full-chain verification;
- explicit limits of local-chain assurance.

### T19 — Bias/performance drift hidden by authorization

A model remains authorized while its real-world performance degrades for a subgroup or environment.

Controls:

- monitored performance metrics;
- subgroup analysis where clinically relevant;
- drift thresholds;
- rollback/review;
- authorization and performance represented separately.

### T20 — Human factors failure

The technical workflow is correct but a patient cannot understand instructions, consent meaningfully, remain safely positioned, use accessibility features, or recognize an error.

Controls:

- accessibility testing;
- multilingual/plain-language paths;
- confirmation for consequential steps;
- alternate human path;
- visible stop/help controls;
- usability evidence as promotion gate.

## 6. Privacy zones

A health booth should be divided into logical privacy zones:

1. **Operational zone** — navigation, device health, occupancy; minimal identity.
2. **Clinical sensing zone** — raw physiological/image/audio data.
3. **Reasoning zone** — minimum data needed for model/agent task.
4. **Record zone** — finalized clinical data and provenance.
5. **Emergency zone** — temporarily expanded data/action scope under break-glass policy.
6. **Research/analytics zone** — separately authorized, preferably de-identified data products.

Movement between zones must be explicit and evidenced.

## 7. Required fail-safe properties

Before any clinical authority promotion, the system must prove:

- no authority on missing/invalid grant;
- no authority on stale or revoked credential;
- no autonomous increase in autonomy level;
- no use of unknown model/device identity for consequential action;
- safe state on required supervisor loss;
- safe state on network loss for embodied procedure;
- no blind repeat of uncertain physical/external effect;
- no H5 emergency grant minted by ordinary task agent;
- patient/encounter separation under concurrent use;
- no raw credential leakage into model-visible context;
- no unbounded clinical-data egress.

## 8. Security test corpus required

Health Mesh should build a domain-specific adversarial suite covering at least:

- swapped patients;
- swapped specimens;
- expired clinician license;
- revoked device;
- stale calibration;
- model digest mismatch;
- model outside intended population;
- prompt injection in imported clinical note;
- malicious QR/text visible to camera;
- patient requests agent to bypass policy;
- remote-supervisor disconnect mid-procedure;
- patient moves during robotic procedure;
- repeated grant/replayed order;
- duplicate emergency trigger;
- emergency endpoint timeout after request;
- video buffer retention failure;
- cross-patient cache leak;
- consent revoked during encounter;
- legal-retention conflict with deletion request;
- corrupted evidence chain;
- external continuity-anchor mismatch.

## 9. Promotion blockers

The following are explicit blockers for production-reachable consequential Health Mesh authority:

1. persistent replay protection is not demonstrated;
2. evidence is not strongly bound to model/device/request/result;
3. emergency break-glass semantics are not independently reviewed;
4. invasive physical control lacks independent hardware safety envelope;
5. remote-supervision loss can degrade silently into autonomy;
6. jurisdiction-specific legal/regulatory obligations are unresolved;
7. clinical validation is absent for the exact workflow;
8. raw-media/data-minimization design is not verified;
9. incident response and recall/rollback are not operational;
10. independent security review has not occurred.

## 10. Security doctrine

> **In healthcare, deny-by-default is necessary but insufficient. The system must also fail toward a clinically safe state, preserve evidence of what happened, and make uncertainty visible before another consequential action is attempted.**
