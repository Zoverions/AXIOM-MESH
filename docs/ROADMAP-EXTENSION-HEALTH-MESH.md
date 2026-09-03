# AXIOM-MESH Roadmap Extension — Health

**Status:** current-main Health roadmap; no capability promotion

**Date:** 2026-09-03

**Authoritative runnable-state rule:** `mesh/config/capabilities.json` remains authoritative. `domains.health` is `adapter_required` and this roadmap does not change that status.

## Objective

Build a patient-sovereign Health domain in layers: first exact evidence and policy contracts, then synthetic conformance, then bounded interoperability and human-facing workflows, and only later any separately authorized clinical execution. The programme deliberately avoids an “AI doctor” monolith. The durable centre is a person's longitudinal evidence, consent, policy, correction, and portability state.

## Immediate doctrine

- Health data is evidence, not authority.
- Integrity evidence is not clinical truth.
- Model inference is not clinical authority.
- Consent is purpose/recipient-bound and cannot establish competence or safety.
- External disclosure reuses Sovereign Vaults, the Local Context Broker, the Disclosure Compiler, and the generic Context Capsule.
- H0–H5 is the explicit future Health autonomy vocabulary.
- Loss of required supervision cannot raise autonomy.
- Uncertain physical effects are never blindly retried.
- Emergency authority is separate, event-specific, destination-pinned, short-lived, and auditable.
- Neural decoder output never automatically establishes consent, identity, intention, diagnosis, or authorization.
- Protocol/regulatory compatibility is evidence, not local permission.
- Every future consequential Health effect remains on `Gateway -> Hypervisor -> Sandbox -> Grid`.

## Phase H0 — Current-main convergence

Forward-port the still-valid Health-specific safety semantics from the historical Health Mesh branch onto current `main` while rejecting duplicate generic subsystems.

Deliverables:

- current Health foundation and threat model;
- current roadmap and TODO;
- H0–H5 planning vocabulary;
- clinical capability envelope;
- planning-only workflow, regulatory-eligibility, and endpoint profiles;
- explicit mapping to current consent, Vault, Context Capsule, machine-principal, provider, evidence, governance, portability, and recovery primitives;
- no runtime Health route and no capability-registry promotion.

Exit criterion: one current authoritative Health architecture, with PR #1064 retained only as lineage once all accepted unique semantics are mapped.

## Phase H1 — Health Evidence Graph v0

Implement strict synthetic-only contracts for:

- `axiom-health-evidence-node.v0`;
- `axiom-health-provenance-edge.v0`;
- deterministic digests;
- subject/encounter consistency;
- immutable epistemic classes;
- explicit contradiction/correction/supersession without erasure;
- derivation-cycle rejection.

This is an inert semantic graph. It does not ingest patient records or authorize care.

## Phase H2 — Clinical Inference Receipt v0

Bind model inference to:

- exact model/runtime identity;
- intended-use evidence;
- exact input-evidence digests;
- output digest;
- uncertainty/calibration evidence;
- population constraints;
- review floor.

The model receipt may emit only `model-hypothesis` or `derived-feature` classes in v0 and grants no clinical authority.

## Phase H3 — Research Participation v0

Implement a policy/evidence contract binding:

- exact recipient;
- study/protocol and digest;
- purpose;
- allowed/forbidden data classes;
- transformations;
- explicit model-training permission;
- onward disclosure;
- retention/expiry;
- revocation/withdrawal;
- result return.

Actual disclosure remains a later Context Capsule/effect workflow. V0 has no research egress.

## Phase H4 — Neural Data Profile v0

Add high-sensitivity policy/provenance for EEG, intracranial, neuroimaging-derived, neural-interface, and decoder outputs. V0 does not standardize raw signal formats or ingest neural data.

Required invariant:

> A neural signal is evidence about neural activity. A decoder output is an inference about that evidence. Neither automatically establishes intention, consent, identity, preference, diagnosis, or authorization.

## Phase H5 — Health Action Boundary v0

Implement pure semantic checks that reject:

- evidence/inference as execution grant;
- model output directly authorizing diagnosis finalization, prescribing, treatment, invasive action, or emergency dispatch;
- H0/H1/H2 evidence claiming H3/H4/H5 execution;
- supervision loss interpreted as autonomy;
- blind retry after uncertain physical effect;
- regulatory research treated as authorization;
- consent treated as competence or device-safety evidence.

A positive result means only “eligible to enter ordinary authorization,” never “execution authorized.”

## Phase H6 — Synthetic conformance and provenance laboratory

Using synthetic data only:

- exercise cross-patient and cross-encounter contamination defenses;
- bind device/model digests;
- test correction, contradiction, and model replacement;
- implement synthetic imaging/specimen provenance chains;
- produce patient-facing provenance projections without exposing unrelated operational detail;
- test prompt/tool injection from imported notes/media metadata;
- prove Context Capsule minimization for selected Health tasks.

No live clinical system is connected in this phase.

## Phase H7 — Read-only healthcare interoperability laboratory

Select one exact healthcare profile/standard and one exact read-only integration target. Requirements include:

- named endpoint and trust anchors;
- exact identity/data mapping;
- minimum-necessary scope;
- imported-content injection defenses;
- provenance of transformations;
- deny-by-default egress;
- no role-to-authority shortcut;
- no write operation until read-only conformance and security review are complete.

FHIR/DICOM or another protocol may eventually be selected, but this roadmap does not claim conformance in advance.

## Phase H8 — Patient Health experience in AXIOM One

After the underlying contracts and privacy boundaries are verified, expose a local-first Health surface for:

- longitudinal evidence timeline;
- source/provenance inspection;
- hypotheses versus clinical assessments;
- corrections and disagreements;
- consent and disclosure history;
- research-participation policy;
- receipt inspection;
- export/recovery;
- accessibility and plain-language explanations.

The UI remains outside the trusted kernel and uses versioned Gateway contracts. No UI state may turn evidence into authority.

## Phase H9 — R1 non-invasive synthetic/controlled workflow

Target H1/H2 only:

```text
consent
 -> identity/encounter binding
 -> interview/vitals/sensor evidence
 -> bounded model inference
 -> review threshold
 -> signed evidence/provenance
 -> separately authorized follow-up/referral request
```

A controlled real-world pilot requires separate privacy, security, human-factors, clinical, regulatory, operational, support, and promotion evidence.

## Phase H10 — R2 supervised specimen laboratory

Target H3 planning/simulation first. Required contracts include:

- exact patient/encounter/order binding;
- device/consumable preflight;
- active qualified supervisor;
- maximum attempts;
- local independent safety controls;
- post-procedure observation;
- specimen custody;
- uncertainty handling;
- safe stop on supervision/network loss.

H4 autonomous invasive execution remains out of scope until separately validated and promoted.

## Phase H11 — R3 emergency escalation laboratory

Target H1/H2 detection/escalation. H5 remains separate and laboratory-only.

Requirements include:

- multimodal anomaly evidence;
- repeat-check/patient-prompt path;
- remote qualified-human escalation;
- exact emergency trigger and destination;
- short-lived event-specific scope;
- duplicate/uncertain request reconciliation;
- capability closure;
- after-action review.

No current endpoint may directly dispatch emergency resources.

## Phase H12 — Clinical/regulatory deployment dossiers

For every proposed live workflow document:

- jurisdiction;
- intended use;
- patient population/exclusions;
- professional roles and credential status;
- device/model classification and evidence;
- controller/processor responsibilities;
- consent/access/correction/retention/deletion obligations;
- incident/breach/recall procedures;
- accessibility/human factors;
- clinical validation metrics/stopping rules;
- operations/SLO/continuity/rollback;
- exact claims permitted after review.

Technical conformance never substitutes for qualified legal, clinical, regulatory, or medical-device review.

## Promotion gates

A Health capability may progress only through evidence-bound gates:

1. H-G0 architecture;
2. H-G1 bench/synthetic conformance;
3. H-G2 device/model evidence;
4. H-G3 clinical-safety evidence;
5. H-G4 jurisdictional regulatory/legal evidence;
6. H-G5 human factors/accessibility;
7. H-G6 independent security/privacy review;
8. H-G7 controlled pilot;
9. H-G8 operations/incident/rollback/recall;
10. H-G9 independent promotion review.

Passing an early gate does not imply later gates.

## Current non-claims

The roadmap does not enable or claim autonomous diagnosis, medical advice, prescribing, treatment, EHR connectivity, standards conformance, device control, research export, model training on patient data, live EEG/BCI ingestion, emergency dispatch, H3/H4/H5 runtime authority, or jurisdictional compliance. `domains.health` remains `adapter_required` until separate implementation and promotion evidence says otherwise.
