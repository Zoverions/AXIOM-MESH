# AXIOM Health Mesh — Threat Model

**Status:** current Health convergence threat model; inert architecture only

**Date:** 2026-09-03

**Capability boundary:** `domains.health` remains `adapter_required`. This document does not authorize clinical use.

## Scope

This threat model covers the first current-main Health foundation: patient-sovereign evidence/provenance, model inference records, research participation policy, neural-data policy, and planning-only H0–H5 workflow semantics. It also carries forward the earlier Health Mesh risks around devices, remote supervision, uncertain physical effects, emergency authority, interoperability, and regulatory evidence.

The protected assets include:

- patient/subject identity bindings;
- encounter bindings;
- raw and derived Health records in Sovereign Vaults;
- consent and disclosure policy;
- provenance and correction history;
- device/model identity and status evidence;
- clinical judgments and model hypotheses;
- research participation boundaries;
- neural signals and decoder outputs;
- future clinical-effect authority;
- evidence continuity and auditability.

## Trust boundary

Health applications, model runtimes, clinical systems, devices, imported records, research environments, and neural interfaces are outside the trusted authority core. Consequential effects still require:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

The Local Context Broker may reason over authorized private context but cannot mint access, widen consent, create execution authority, or export arbitrary vault material.

## Threats

### Epistemic laundering

A model, imported record, UI, or agent attempts to convert a low-authority epistemic object into a stronger one: a hypothesis becomes a diagnosis, a recommendation becomes an order, or a signed assertion is presented as externally verified truth.

Controls:

- immutable epistemic classes;
- new attributable nodes for later assessments/corrections;
- typed provenance edges;
- model receipts restricted to `model-hypothesis` or `derived-feature` output;
- Health Action Boundary tests preventing evidence-as-grant behavior;
- explicit integrity-versus-truth non-claims.

### Cross-patient contamination

Caching, reused references, imported records, graph edges, model context, or session state mixes evidence from different subjects or encounters.

Controls:

- subject binding on every Health evidence node, provenance edge, model receipt, research contract, and neural profile;
- encounter consistency where encounter scope exists;
- negative cross-subject/cross-encounter tests;
- no ambient broad patient cache in v0.

### Provenance recombination and substitution

Valid pieces from different encounters, devices, models, specimens, or runs are recombined into a plausible but false chain.

Controls:

- content digests and exact references;
- subject/encounter bindings;
- model/runtime/artifact bindings;
- explicit source kind and credential/status evidence references;
- graph-level consistency checks;
- later device/specimen/image provenance chains must preserve exact acquisition/custody lineage.

### Model substitution

A different model, version, or runtime consumes evidence while reusing the evidence/validation claims of an earlier model.

Controls:

- exact model digest and runtime reference in Clinical Inference Receipt;
- intended-use evidence reference;
- input-evidence ID+digest bindings;
- silent model upgrades prohibited for consequential workflows;
- model replacement creates a new inference/promotion boundary.

### Prompt and tool injection through Health content

Clinical notes, records, images, captions, transcripts, QR codes, neural metadata, or imported protocol content may contain malicious instructions intended to trigger tools, disclose records, or widen authority.

Controls:

- Health content is data, not authority;
- provider/model output remains data until a later authorized effect consumes it;
- no imported role or protocol field grants local authority;
- no raw Health content in the initial synthetic contracts;
- future adapters require parser/schema red-team coverage.

### Consent laundering

Consent for care, one recipient, one study, or one purpose is reused for unrelated research, training, advertising, insurance, employment, onward disclosure, or different retention.

Controls:

- canonical consent receipts;
- Health research participation binds recipient, study/protocol digest, purpose, data classes, transformations, training, onward disclosure, retention, expiry, revocation, withdrawal, and result return;
- external access remains false until a separately authorized Context Capsule/effect path executes;
- model training is explicit and false by default.

### Regulatory laundering

A planning object, research memo, credential label, protocol role, or stale eligibility result is presented as legal/regulatory authorization.

Controls:

- regulatory eligibility remains external evidence;
- missing evidence means `DENY_CONSEQUENTIAL` for relevant planning;
- `axiom_may_expand_scope = false`;
- `runtime_authority_granted = false`;
- `regulatory_truth_claimed_by_axiom = false`;
- jurisdictional deployment requires separate qualified review.

### Neural inference overreach

A decoder output is treated as direct intention, legal consent, identity proof, diagnosis, preference, or execution authority.

Controls:

- neural data receives high/critical sensitivity treatment;
- decoder outputs remain inference;
- `decoded_intent_is_authority = false`;
- `decoded_signal_is_legal_consent = false`;
- `decoded_signal_is_identity_proof = false`;
- future consequential actions require task-appropriate confirmation/authentication/authority independent of decoder confidence.

### Research boundary escape

A research environment receives more data than required, keeps it longer than permitted, trains a model when forbidden, forwards it to another recipient, or treats research participation as ambient vault access.

Controls:

- research contract itself grants no external access;
- disclosure uses the generic Context Capsule path;
- exact destination/purpose/data transformations;
- explicit training and onward-disclosure settings;
- bounded retention/withdrawal semantics;
- no live research egress in v0.

### Device identity and calibration confusion

A known device identifier is treated as proof of current calibration, maintenance, authorization, or safe physical state.

Controls:

- device identity, software digest, calibration/QC, maintenance, recall/authorization status, and clinical eligibility remain separate evidence;
- missing/stale required status fails toward safety;
- registration grants no authority.

### Supervision loss

A supervised H3 workflow loses required human supervision and continues as if it became H4.

Controls:

- `supervision_loss_cannot_raise_autonomy = true`;
- local fail-safe behavior;
- supervisor assignment/heartbeat and handoff for future runtime;
- no silent downgrade of review requirements.

### Blind retry after uncertain physical effect

A network timeout or missing acknowledgement causes a physical/invasive action to be repeated when the first attempt may already have occurred.

Controls:

- `uncertain_physical_effects_are_not_retried = true`;
- explicit uncertain outcome state;
- halt/reconcile before any later attempt;
- idempotency can help digital coordination but cannot prove a physical action did not occur.

### Emergency-authority escalation

An ordinary workflow or model attempts to self-mint H5 authority, change destination, extend expiry, or convert a warning into direct emergency dispatch.

Controls:

- emergency authority separate from ordinary workflow authority;
- trigger/evidence/destination/time/event binding;
- stronger review and after-action evidence;
- ordinary agents cannot mint their own emergency capability;
- initial endpoint contract may request help but may not directly dispatch resources.

### Physical-safety dependence on model reasoning

A clinical robot/device relies on a remote model as the sole safety control.

Controls:

- independent local stop/watchdog;
- physical fail-safe;
- force/motion/pressure/attempt limits where applicable;
- patient-release mechanism;
- safe state on network loss;
- device-specific safety evidence required before any physical promotion.

### Vault over-disclosure and inference leakage

An external provider gets the complete Health Vault or source identifiers reveal unrelated sensitive categories.

Controls:

- compartment-first Sovereign Vaults;
- local cross-vault synthesis by default;
- minimum-necessary Disclosure Compiler;
- generic Context Capsule instead of vault mounts;
- purpose/destination/retention binding;
- operational telemetry excludes raw private content.

### Correction erasure

A later correction silently rewrites the prior record, destroying accountability and making it impossible to understand which evidence influenced an earlier decision.

Controls:

- correction/supersession use new nodes and explicit edges;
- source records remain visible subject to lawful retention/deletion policy;
- materialized current views are derived, explainable, and reversible.

## Abuse and adversarial test requirements

The inert v0 conformance suite must reject at least:

- unknown contract fields;
- duplicate/malformed identifiers;
- self provenance edges;
- cross-subject/cross-encounter edges;
- model hypothesis relabeling as qualified-human assessment;
- model output labeled as diagnosis assertion;
- model-digest/input-digest substitution;
- missing intended-use evidence;
- review-floor weakening;
- evidence/consent/regulatory research supplied as execution authority;
- H0/H1/H2 evidence claiming H3/H4/H5 authority;
- blind retry after uncertain consequential effect;
- research purpose/recipient/study substitution;
- forbidden training or onward-disclosure widening;
- neural decoder claims of legal consent, identity, or authority;
- raw Health/neural fixture content or credential material;
- any inert authority/network/runtime flag changed to an active value.

## Residual risk and non-claims

The first Health contracts cannot establish clinical correctness, safety, real-world identity, professional scope, calibration, medical-device authorization, regulatory compliance, or emergency-service availability. They provide semantic and evidentiary boundaries that future adapters must satisfy.

No current Health code may be described as autonomous diagnosis, prescribing, treatment, medical-device control, EHR connectivity, live research export, live neural decoding, or H3/H4/H5 execution authority. Production Health remains blocked behind adapter, clinical, jurisdictional, security, privacy, accessibility, operational, and independent promotion evidence.
