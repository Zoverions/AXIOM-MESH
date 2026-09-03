# Sovereign Health Evidence Graph — Convergence Design

**Status:** design approved in conversation; repository review pending; no runtime or capability promotion

**Date:** 2026-09-03

**Current capability boundary:** `domains.health` remains `adapter_required`.

**Builds on:**

- `docs/architecture/SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md`;
- `docs/rebuild/REQUIREMENTS.md`;
- PR #1064, `Health Mesh foundation architecture and safety contracts`;
- the current Gateway -> Hypervisor -> Sandbox -> Grid authority path;
- existing consent receipts, memory/portability primitives, machine principals and receipts, governance, causal state, and evidence-chain semantics.

## 1. Objective

Create the first coherent current-main Health domain foundation around a **patient-sovereign longitudinal evidence graph**, rather than around one privileged medical model or an "AI doctor" abstraction.

The Health domain must allow clinicians, models, sensors, laboratories, devices, researchers, institutions, future neural interfaces, and the patient-owner's local companion to contribute or consume bounded health evidence without silently turning:

- data into authority;
- model output into diagnosis;
- a clinical assertion into external-world truth;
- consent into unlimited reuse;
- a decoded neural signal into intention, identity, legal consent, or execution authority;
- regulatory research into regulatory authorization;
- a connected device into a trusted clinical actor merely because it is registered.

The durable doctrine is:

> **The patient is the persistent centre. Evidence, inference, clinical judgment, consent, and execution authority remain separately represented and separately governed.**

This design does not make Health runnable, production-promoted, clinically compliant, or medically useful by declaration. It defines the exact inert contracts and negative tests that later Health adapters and products must satisfy.

## 2. Convergence decision

### 2.1 Existing Health lineage

PR #1064 already established the strongest existing Health-specific foundation. Its accepted architectural ideas include:

- Health Mesh as the trust/authority/provenance layer, not the clinician or medical AI;
- mandatory Gateway -> Hypervisor -> Sandbox -> Grid authority flow;
- explicit H0-H5 clinical autonomy levels;
- clinical capability envelopes;
- fail-closed regulatory-eligibility evidence;
- patient/encounter/device/model/policy/result provenance;
- independent physical safety controls;
- explicit uncertainty for physical effects;
- bounded break-glass semantics;
- remote-supervision semantics;
- domain-specific promotion gates;
- planning-only clinical workflow and endpoint contracts.

Those semantics remain valuable. The branch is now materially behind current `main` and is not cleanly mergeable, so it should not be revived wholesale as a second active foundation.

### 2.2 Approaches considered

#### Approach A — continue PR #1064 directly

Advantages:

- preserves its exact history;
- smallest conceptual delta from the original Health programme.

Rejected because:

- it is based on an older repository generation;
- mergeability has drifted;
- current main now contains stronger general-purpose authority, evidence, vault, provider, machine-principal, governance, and portability primitives;
- blindly continuing the old branch risks restoring stale assumptions and duplicate contracts.

#### Approach B — build a new Health Evidence subsystem independently

Advantages:

- clean greenfield design;
- easy to optimize around the latest evidence-graph concept.

Rejected because:

- it would duplicate Health #1064 semantics;
- it risks creating a second consent, provenance, autonomy, or regulatory model;
- it would violate the repository's convergence rule: compose and forward-port accepted semantics rather than fork them for convenience.

#### Approach C — current-main successor convergence

**Accepted.**

Create a successor slice from current `main` that:

1. forward-ports the still-valid Health #1064 semantics;
2. reconciles them against current generic primitives rather than duplicating those primitives;
3. adds the missing sovereign evidence-graph, clinical-inference, research-participation, and neural-data contracts;
4. keeps every new Health object inert and non-authoritative;
5. leaves `domains.health` at `adapter_required`;
6. records #1064 as lineage/superseded-by-convergence only after the successor contains every accepted unique Health semantic.

## 3. Architecture position

The Health layer sits above the trusted Mesh substrate and below concrete medical applications and provider integrations.

```text
patient / owner
    |
    v
AXIOM One / local companion / domain UI
    |
    +--------------------+
    |                    |
    v                    v
Sovereign Health Vault   Local Trust Plane
    |                    |
    |             deterministic authority
    |                    |
    +--------+-----------+
             |
             v
   Health Evidence Graph
             |
      +------+------+----------------+
      |             |                |
      v             v                v
 clinical       model/AI         research / neural
 sources        inference        specialized evidence
      |             |                |
      +------+------+----------------+
             |
             v
  context minimization / disclosure
             |
             v
 generic Context Capsule / approved adapter
             |
             v
 institution / model / clinician / research environment

Consequential effect request
             |
             v
Gateway -> Hypervisor -> Sandbox -> Grid
```

The Health Evidence Graph is **not** a new authority service. It is a governed data/provenance model whose records remain subject to ordinary identity, policy, consent, approval, grant, evidence, retention, portability, and revocation rules.

## 4. Reuse before invention

The successor implementation must consume existing contracts where they already answer the problem.

### 4.1 Sovereign Vaults

Health records belong in one or more Sovereign Vault compartments, not in a global Health database. The current Health hierarchy remains a useful default:

```text
health
  / clinical-records
  / medication-and-treatment
  / fitness-and-wellbeing
  / accommodation-context
  / research-participation
  / neural-data
```

These labels are organization aids, not permissions. Parenthood does not grant ambient child-vault access.

### 4.2 Context Broker and Context Capsule

Do **not** create a parallel `HealthContextCapsule`.

Health disclosure uses the existing context-request / disclosure-compiler / Context Capsule architecture. Health-specific policy may require stronger minimization, fresher consent, stricter recipients, shorter expiry, no onward disclosure, or stronger provenance, but the generic capsule remains the external disclosure container.

### 4.3 Consent

Do **not** create a second generic consent system.

Health-specific consent profiles compose the canonical consent receipt semantics and add only domain constraints that the generic receipt cannot express safely, such as study/protocol binding, representative authority evidence, or special withdrawal semantics.

### 4.4 Machine principals and model providers

Models, booth controllers, research agents, device software, and other software actors remain bounded machine principals or provider artifacts under existing machine/provider rules. A Health label never widens their authority.

### 4.5 Evidence chain

The Grid evidence chain remains the integrity/audit substrate. Health provenance edges refer to evidence, data, device, model, and clinical-source artifacts; they do not replace Grid receipts.

## 5. Health Evidence Graph v0

The first executable Health slice is an **inert, content-addressed semantic graph** over synthetic or separately governed test data.

It requires two caller-authored contracts plus deterministic validation/digest helpers.

### 5.1 HealthEvidenceNode v0

Schema identifier:

`axiom-health-evidence-node.v0`

Purpose: represent one bounded health-related assertion, observation, derived artifact, recommendation, or action record while preserving its epistemic class and provenance.

Required fields:

- `schema`;
- `version`;
- `status`: `inert-health-evidence`;
- `evidence_id`;
- `subject_ref`;
- optional `encounter_ref`;
- `epistemic_class`;
- `source`;
- `artifact`;
- `recorded_at`;
- optional `observed_at`;
- `sensitivity`;
- `provenance_refs`;
- `consent_refs`;
- `limitations`;
- `contains_raw_health_data`: false for v0 fixtures/contracts;
- `contains_secret_material`: false;
- `authority_effect`: `none`;
- `network_effect`: `none`;
- `runtime_activation`: false.

Initial `epistemic_class` values:

- `observation` — directly measured or reported data;
- `clinical-record` — an attributable record/assertion entered by a clinical source;
- `derived-feature` — deterministic or algorithmic derivation from upstream evidence;
- `model-hypothesis` — model-generated possibility or interpretation;
- `clinical-assessment` — attributable qualified-human assessment;
- `diagnosis-assertion` — attributable diagnostic assertion with its own status/limits; not automatic external-world truth;
- `recommendation` — proposed next step;
- `authorized-care-action-record` — evidence that an action was separately authorized/performed; the node itself does not authorize it.

The class is immutable. A `model-hypothesis` does not become a `clinical-assessment` by editing its label. A new node with explicit provenance must represent the later assessment.

`source` binds:

- source kind: patient, clinician, organization, device, model, laboratory, imported record, or derived process;
- source principal/artifact reference;
- source digest where available;
- credential/status evidence references when relevant.

`artifact` contains only bounded metadata plus a content digest/reference. v0 synthetic fixtures must not embed raw health content.

### 5.2 HealthProvenanceEdge v0

Schema identifier:

`axiom-health-provenance-edge.v0`

Purpose: make derivation and evidentiary relationships explicit without rewriting source history.

Required fields:

- `schema`;
- `version`;
- `status`: `inert-health-provenance-edge`;
- `edge_id`;
- `subject_ref`;
- optional `encounter_ref`;
- `from_evidence_id`;
- `to_evidence_id`;
- `relationship`;
- `created_at`;
- `created_by`;
- `evidence_refs`;
- `authority_effect`: `none`;
- `network_effect`: `none`;
- `runtime_activation`: false.

Initial relationships:

- `derived-from`;
- `supports`;
- `contradicts`;
- `supersedes-without-erasure`;
- `corrects-without-erasure`;
- `interprets`;
- `reviews`;
- `result-of`;
- `authorized-by-record`;
- `collected-from`;
- `custody-successor`.

Rules:

- self-edges are invalid;
- cross-subject edges are invalid unless a separately specified multi-subject contract explicitly permits them;
- an edge never changes the epistemic class of either node;
- contradiction remains visible;
- correction/supersession does not delete or rewrite the source;
- derivation cycles are invalid for `derived-from`/`result-of` relationships;
- an `authorized-by-record` edge refers to evidence of a separate authority decision; it is not itself a grant.

## 6. Clinical Inference Receipt v0

Schema identifier:

`axiom-clinical-inference-receipt.v0`

Purpose: bind an AI/model inference to the exact model, intended-use evidence, bounded inputs, output digest, uncertainty representation, and review requirements without allowing the inference to self-promote into clinical authority.

Required fields:

- `schema`;
- `version`;
- `status`: `inert-clinical-inference`;
- `inference_id`;
- `subject_ref`;
- optional `encounter_ref`;
- `model_ref`;
- `model_digest`;
- `runtime_ref`;
- `intended_use_ref`;
- `input_evidence` as exact ID+digest bindings;
- `output_digest`;
- `output_epistemic_class`: fixed to `model-hypothesis` or `derived-feature` in v0;
- `uncertainty`;
- `calibration_evidence_refs`;
- `population_constraints`;
- `human_review_requirement`;
- `created_at`;
- `evidence_refs`;
- `clinical_authority_granted`: false;
- `authority_effect`: `none`;
- `network_effect`: `none`;
- `runtime_activation`: false.

Negative invariants:

- output cannot be labeled `clinical-assessment` or `diagnosis-assertion` by the model receipt;
- a model cannot self-assert that it is within intended use;
- model/version/digest mismatch fails closed;
- missing or unbound input provenance fails validation;
- an unsupported uncertainty field cannot be fabricated as calibrated probability;
- `human_review_requirement` cannot be weakened by the model itself;
- receipt validity proves contract integrity, not medical correctness.

## 7. Health Action Firewall

The Health Action Firewall is a semantic/policy boundary, not a new privileged service.

Its invariant is:

> **Inference may propose. Only a separately authorized clinical workflow may effect.**

For the first implementation slice, the firewall is expressed as pure validation/evaluation rules and regression tests. It does not execute care.

It must reject any attempted transition in which:

- an evidence node is supplied as though it were a capability grant;
- a model inference directly authorizes prescribing, treatment, diagnosis finalization, invasive action, emergency dispatch, clinical record mutation, or other consequential effect;
- H0/H1/H2 evidence is used to claim H3/H4/H5 execution authority;
- loss of required supervision is interpreted as permission to continue autonomously;
- uncertain physical outcome triggers blind retry;
- a regulatory research fixture is treated as authorization;
- a consent receipt is treated as clinical competence or device safety evidence.

The firewall must reuse ordinary policy/grant machinery for any future actual effect. It never becomes a second authorization engine.

## 8. Research Participation Contract v0

Schema identifier:

`axiom-health-research-participation.v0`

Purpose: let a patient/owner express a bounded, reviewable research participation policy without granting a research environment ambient access to the Health Vault.

Required fields:

- `schema`;
- `version`;
- `status`: `inert-research-participation`;
- `participation_id`;
- `subject_ref`;
- `controller_ref`;
- `research_recipient_ref`;
- `study_or_protocol_ref`;
- `study_or_protocol_digest`;
- `purpose`;
- `allowed_data_classes`;
- `forbidden_data_classes`;
- `required_transformations`;
- `model_training_allowed`;
- `onward_disclosure`;
- `retention`;
- `start_at`;
- `expires_at`;
- `revocation_handle`;
- `withdrawal_semantics`;
- `result_return_policy`;
- `consent_receipt_refs`;
- `evidence_refs`;
- `external_access_granted`: false;
- `authority_effect`: `none`;
- `network_effect`: `none`;
- `runtime_activation`: false.

Important semantics:

- the contract is a policy/evidence input, not a data transfer;
- actual disclosure still requires a normal context request, disclosure compilation, destination check, and effect authorization;
- withdrawal stops future permitted use according to the applicable contract but does not falsely promise deletion of copies that are legally retained or no longer under AXIOM control;
- `model_training_allowed` is explicit and false by default;
- one study/purpose cannot be silently reused for another;
- de-identification/pseudonymization claims must name the transformation/evidence used; they are not assumed from a boolean label.

## 9. Neural Data Profile v0

Schema identifier:

`axiom-neural-data-profile.v0`

Purpose: establish a high-sensitivity policy and provenance profile for EEG, intracranial recordings, neural-interface streams, neuroimaging-derived signals, and decoder outputs before any BCI or neural-intent workflow is considered.

This profile does not attempt to standardize raw neurophysiology formats. Raw signals remain in separately governed Health/Neural vault objects or external clinical systems.

Required fields:

- `schema`;
- `version`;
- `status`: `inert-neural-data-profile`;
- `profile_id`;
- `subject_ref`;
- `signal_class`;
- `acquisition_device_ref`;
- `acquisition_device_digest`;
- `source_evidence_refs`;
- optional `decoder_ref`;
- optional `decoder_digest`;
- `derived_output_type`;
- `sensitivity`: fixed high/critical profile;
- `retention`;
- `consent_refs`;
- `limitations`;
- `decoded_intent_is_authority`: false;
- `decoded_signal_is_legal_consent`: false;
- `decoded_signal_is_identity_proof`: false;
- `authority_effect`: `none`;
- `network_effect`: `none`;
- `runtime_activation`: false.

The non-bypassable neural invariant is:

> **A neural signal is evidence about neural activity. A decoder output is an inference about that evidence. Neither automatically establishes intention, consent, identity, preference, diagnosis, or authorization.**

Any future communication interface may represent a decoder-assisted communication assertion, but consequential actions must enter ordinary authentication/confirmation/authority policy with task-appropriate safeguards.

## 10. Disagreement, correction, and longitudinal truth

Health systems routinely contain disagreement. v0 must preserve it rather than force one canonical answer.

Examples:

- two clinicians disagree about interpretation;
- a later laboratory result contradicts an earlier model hypothesis;
- a model version changes the predicted risk;
- a patient corrects an imported demographic or history record;
- a report is amended without erasing the original;
- a device is later found to have been outside calibration.

The graph therefore uses new nodes and explicit provenance edges instead of mutable truth slots.

A future materialized "current view" may rank or select evidence for display, but that view must be derived, explainable, reversible, and unable to erase the underlying record.

## 11. Patient Context Broker integration

The owner's local companion may request broader Health context than any external provider, subject to authorized local vault leases.

The context broker may:

- join health records with accessibility, scheduling, travel, medication, education, or other authorized context locally;
- produce candidate derived constraints;
- request persistence of a derived Health evidence node;
- compile a minimum-necessary external representation.

It may not:

- mount the entire Health Vault into every model by default;
- grant itself permanent Health access;
- disclose raw records merely because a provider asks;
- convert a derived hypothesis into a diagnosis;
- expose unrelated health categories through inference or source identifiers;
- turn broad local context access into broad external disclosure authority.

External Health disclosure uses the generic Context Capsule architecture. A capsule may disclose, for example, "requires step-free lodging" without exposing the underlying diagnosis when the task does not require it.

## 12. Interoperability boundary

v0 does not select or claim conformance to a particular clinical interoperability standard.

Future adapters may use FHIR, DICOM, laboratory, pharmacy, scheduling, public-health, or other protocols, but:

- protocol compatibility does not grant authority;
- remote role names do not become local permissions;
- imported content is data and may be hostile;
- source identifiers, schema versions, endpoint identity, transformation, and provenance must remain bound;
- writes require separately authorized, idempotent, uncertainty-aware effects;
- exact profiles and jurisdictional deployment evidence must be selected before any compliance claim.

## 13. Threat model additions

The successor Health threat model must cover at least:

### 13.1 Epistemic laundering

A model or imported document attempts to relabel a hypothesis as diagnosis, authority, or verified fact.

Mitigation: immutable epistemic class, source binding, typed provenance edges, and action-firewall tests.

### 13.2 Cross-patient contamination

Cached context, reused references, imported data, or graph edges mix evidence across subjects.

Mitigation: subject binding on every node/edge/receipt and negative cross-subject tests.

### 13.3 Model substitution

A different model/version/runtime consumes the same input while claiming the prior model's evidence.

Mitigation: exact digest and runtime binding in Clinical Inference Receipt.

### 13.4 Prompt/tool injection through health records

Imported notes, images, QR codes, transcripts, or metadata contain instructions intended to trigger tools or widen authority.

Mitigation: content is data, not authority; provider/model results remain data until a separately authorized effect consumes them.

### 13.5 Consent laundering

Consent for care, one study, or one recipient is treated as permission for unrelated research, training, advertising, insurance, or onward disclosure.

Mitigation: purpose/recipient/study/data-class/retention binding and normal disclosure authorization.

### 13.6 Neural inference overreach

A decoder result is treated as direct intention, consent, identity proof, or authorization.

Mitigation: fixed neural non-authority fields plus effect-boundary confirmation/authentication rules.

### 13.7 Regulatory laundering

Research notes or a planning eligibility object are presented as jurisdictional authorization.

Mitigation: preserve #1064 fail-closed external regulatory evidence semantics and explicit non-claims.

### 13.8 Provenance forgery or recombination

Valid pieces from different encounters, devices, patients, or model runs are recombined into a plausible false chain.

Mitigation: exact subject/encounter/artifact/digest bindings and graph-level consistency tests.

## 14. First implementation slice

The first successor PR after this design is approved should remain **inert contract/conformance work**.

It should:

1. forward-port the unique still-valid #1064 foundation documents/contracts onto current main, editing them to consume current generic primitives;
2. add strict semantic validators for the new v0 Health contracts;
3. add JSON Schema mirrors for caller-authored documents;
4. add deterministic canonical digests;
5. add synthetic examples only;
6. add regression tests proving the non-authority boundaries;
7. add the Health docs and contracts to canonical documentation checks;
8. update the Health master TODO against current main, marking an old blocker complete only when current executable evidence supports that claim;
9. leave `mesh/config/capabilities.json` unchanged for `domains.health`;
10. create no clinical ingress route, no live provider, no medical device control, no FHIR write, no external research egress, and no production Health UI.

### 14.1 Proposed implementation modules

Follow the repository's existing small-module pattern. The exact names may be adjusted during plan review, but the intended boundaries are:

- `mesh/src/lib/health-evidence-graph.mjs` — node/edge validation, digesting, set-level consistency checks;
- `mesh/src/lib/clinical-inference-receipt.mjs` — inference receipt validation/digesting;
- `mesh/src/lib/health-research-participation.mjs` — research contract validation/digesting;
- `mesh/src/lib/neural-data-profile.mjs` — neural profile validation/digesting;
- `mesh/src/lib/health-action-boundary.mjs` — pure non-authority transition checks;
- corresponding JSON Schemas under `docs/architecture/contracts/` or the repository's accepted current contract location;
- synthetic fixtures under the existing fixture/test convention;
- focused tests that do not require live clinical data or network access.

Do not create one large `health.mjs` module.

## 15. Required negative tests

The v0 slice is incomplete unless tests reject at least the following:

1. unknown/extra contract fields;
2. malformed or duplicate IDs;
3. self provenance edges;
4. cross-subject provenance edges;
5. mismatched encounter binding where encounter scope is present;
6. `model-hypothesis` rewritten in place as `clinical-assessment`;
7. model receipt output labeled as qualified-human assessment/diagnosis;
8. wrong model digest;
9. input evidence digest substitution;
10. missing intended-use reference;
11. model self-reduction of human-review requirement;
12. evidence node supplied as an execution grant;
13. H1/H2 evidence used to claim H3/H4/H5 execution;
14. blind retry after uncertain physical effect;
15. regulatory research object used as authority;
16. consent for one research purpose reused for another;
17. research recipient substitution;
18. training enabled when the participation contract forbids it;
19. onward disclosure widened beyond the participation contract;
20. neural decoder output claiming legal consent;
21. neural decoder output claiming identity proof;
22. neural decoder output claiming execution authority;
23. sensitive raw content appearing in v0 synthetic contract fixtures;
24. credential-like or secret material appearing in fixtures;
25. authority/network/runtime activation flags set to anything other than the inert values.

## 16. Non-goals for v0

Do not implement in this slice:

- autonomous diagnosis;
- prescribing or treatment recommendations exposed to patients as medical advice;
- clinical decision support promotion;
- real EHR connectivity;
- FHIR/DICOM conformance claims;
- medical-device control;
- live EEG/BCI ingestion;
- remote research export;
- model training on patient data;
- insurer/employer access;
- emergency-service dispatch;
- H3/H4/H5 runtime authority;
- Health-specific payment/settlement;
- broad public Health UI;
- jurisdictional compliance claims;
- production use of real patient data.

## 17. Promotion and autonomy policy

The #1064 H0-H5 autonomy ladder remains the Health-specific execution vocabulary.

For v0:

- the evidence graph itself is below H0 execution because it is an inert contract layer;
- an observation may describe H0 data collection but does not authorize collection;
- a model inference receipt may describe H1/H2-style output but grants no H1/H2 runtime authority;
- H3/H4/H5 remain outside the initial successor implementation;
- no Health capability changes registry status as part of this design or its first conformance slice.

Future clinical autonomy should be evidence- and consequence-proportional rather than permanently hard-coding "human always wins". A system may eventually receive greater autonomy only through separately evidenced clinical, security, human-factors, jurisdictional, operational, and promotion review.

No model obtains autonomy merely by claiming superior performance.

## 18. Documentation and lineage

The successor should preserve #1064 as provenance.

Once every unique accepted semantic from #1064 has either:

- been forward-ported;
- been replaced by a stronger current-main primitive with an explicit mapping; or
- been deliberately rejected with a recorded reason,

then #1064 may be marked superseded by the new convergence PR rather than merged wholesale.

The Health roadmap/TODO should distinguish:

- current generic Mesh prerequisites already satisfied;
- current generic prerequisites still open;
- Health-specific contracts implemented inertly;
- adapters required;
- jurisdictional/clinical promotion gates;
- live deployment work.

No old checkbox is advanced merely because an adjacent capability appears conceptually similar.

## 19. Success criteria

The first Health convergence slice succeeds when:

1. there is one authoritative current-main Health foundation, not parallel old/new architectures;
2. `domains.health` remains accurately `adapter_required`;
3. Health evidence has explicit immutable epistemic classes;
4. provenance preserves disagreement, correction, and derivation without rewriting history;
5. model inference is cryptographically/semantically bound to model and input evidence and remains non-authoritative;
6. clinical effect authority cannot be laundered through evidence, consent, regulatory research, or neural inference;
7. research participation is purpose-, recipient-, study-, data-, training-, retention-, and withdrawal-bound;
8. neural data is explicitly high-sensitivity and decoder outputs cannot become consent/identity/authority by declaration;
9. external disclosure reuses Sovereign Vaults + Context Capsule rather than creating a parallel Health disclosure system;
10. synthetic conformance tests cover the core adversarial cases;
11. the documentation checker and relevant repository verification gates recognize the new canonical artifacts;
12. no runnable clinical effect, network path, or production claim has been added.

## 20. Durable doctrine

The Health programme should preserve these rules across later adapters and products:

1. The patient/subject is not merely a record key; identity bindings remain explicit and scoped.
2. Health data is evidence, not authority.
3. Integrity evidence is not truth evidence.
4. Model inference is not clinical authority.
5. Clinical judgment is attributable and reviewable, not silently canonical.
6. Correction does not erase provenance.
7. Consent is purpose- and recipient-bound and cannot be laundered into unrelated use.
8. External systems receive the minimum permitted context, not ambient Health Vault access.
9. Neural signals and decoder outputs never automatically establish consent, identity, intention, diagnosis, or execution authority.
10. Physical and embodied safety remains locally enforceable and independent of model reasoning.
11. Regulatory compatibility and protocol compatibility never grant local authority.
12. Consequential execution remains on the ordinary AXIOM authority path.
13. Automation level is explicit, evidence-bounded, reversible where possible, and separately promoted.
14. The architecture must remain usable if doctors, models, devices, providers, or standards change.
15. The persistent centre is the person's sovereign evidence and policy state, not any particular model or institution.
