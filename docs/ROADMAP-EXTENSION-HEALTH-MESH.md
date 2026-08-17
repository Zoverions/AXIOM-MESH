# AXIOM-MESH Roadmap Extension — Health Mesh

**Status:** canonical strategic extension candidate to `docs/ROADMAP.md`; documentation only

**Adopted for branch review:** 2026-08-13

**Planning horizon:** foundation architecture through bounded non-invasive pilots, supervised specimen workflows, clinical interoperability, and later embodied healthcare automation

**Authority:** `mesh/config/capabilities.json` remains authoritative for runnable capability status. This roadmap extension does not promote any healthcare capability.

## Why this extension exists

Healthcare automation combines unusually sensitive data with decisions and physical effects that can directly affect human health. AXIOM-MESH already provides the right underlying direction—explicit authority, deny-dominant policy, bounded machine principals, cryptographic evidence, local-first data handling, and fail-closed execution—but healthcare needs additional domain constraints before any clinical authority is exposed.

The Health Mesh programme treats AXIOM as the **trust and coordination plane**, not the diagnostic or treatment system itself.

Core documents:

- `docs/architecture/HEALTH-MESH-FOUNDATION.md`;
- `docs/security/HEALTH-MESH-THREAT-MODEL.md`;
- `docs/architecture/contracts/health-mesh-clinical-envelope.v0.1.schema.json`;
- `docs/MASTER-TODO-HEALTH-MESH.md`.

## Roadmap doctrine

> **Automate clinical production without creating ambient clinical authority. Bind every consequential action to patient, purpose, credential, device/model identity, autonomy level, evidence, and a safe exception path.**

The ordinary AXIOM lifecycle remains unchanged:

1. built;
2. enabled;
3. exposed;
4. production-promoted;
5. marketed.

Healthcare additionally requires domain-specific gates H-G0 through H-G9 defined in the foundation architecture.

## Workstream A — Protect the current production candidate

**Horizon:** immediate

- do not add healthcare actions to the production policy or executor registry;
- do not change the current capability count solely for documentation work;
- keep all Health Mesh contracts documentation-only until a future explicit implementation decision;
- close existing AXIOM Tier-0 trust gaps before clinical consequence is considered;
- preserve `Gateway -> Hypervisor -> Sandbox -> Grid` as the only authority path;
- prohibit healthcare demos from implying production readiness, regulatory compliance, or medical-device authorization.

## Workstream B — Clinical identity, credential, and consent substrate

**Outcome:** the Mesh can represent who is acting, on whose behalf, for which patient/encounter, with what professional or machine authority, and under what consent.

Milestones:

- patient/encounter binding contract;
- clinical-human credential claim contract;
- organization/facility relationship contract;
- device identity + calibration/maintenance status contract;
- model artifact/intended-use binding;
- purpose/data/recipient/time-bounded consent objects;
- representative/substitute decision-maker relation;
- revocation semantics;
- patient-visible access/audit projection;
- jurisdiction field and policy hook without hard-coding one jurisdiction into the kernel.

Promotion target: contract and synthetic conformance only; no clinical action.

## Workstream C — Clinical autonomy policy

**Outcome:** every healthcare action is explicitly classified H0-H5 and policy prevents implicit escalation.

Milestones:

- encode H0-H5 autonomy taxonomy;
- require autonomy level in health-domain capability requests/grants;
- require H3+ actions to declare supervision and physical safety state;
- prohibit machine self-upgrade of autonomy;
- create separate H5 emergency issuer/policy path;
- negative tests for H1->H4 and ordinary->H5 escalation;
- formalize human-review and second-review requirements.

Promotion target: isolated synthetic policy harness.

## Workstream D — Health data minimization and privacy plane

**Outcome:** agents receive only the data needed for an authorized clinical purpose.

Milestones:

- clinical data-class vocabulary;
- purpose-specific record views;
- encounter-scoped pseudonyms;
- separate operational video from clinical imagery;
- raw-media TTL and retention triggers;
- local-inference preference policy;
- no-secret/no-broad-credential model context tests;
- patient-accessible record of material data access/export;
- research/analytics export as separate capability class.

Promotion target: read-only local demonstration with synthetic data.

## Workstream E — Clinical provenance and evidence graph

**Outcome:** measurements, images, specimens, model outputs, and human reviews are attributable and reconstructable.

Milestones:

- device/model/input/result binding;
- specimen chain-of-custody object;
- imaging acquisition/reconstruction/interpretation chain;
- calibration and QC references;
- result finalization/review state;
- external continuity anchor policy for high-consequence records;
- provenance query that does not disclose unrelated patient data;
- explicit distinction between signed assertion and external-world truth.

Promotion target: synthetic reference workflows with tamper-negative tests.

## Workstream F — Non-invasive health booth laboratory

**Outcome:** demonstrate the lowest-risk useful Health Mesh workflow without invasive procedures or autonomous diagnosis.

Reference scope:

- identity/encounter start;
- consent;
- structured interview;
- vitals and non-invasive sensor capture;
- calibrated visual/audio data capture with synthetic or approved test data;
- H1 AI measurement/triage output;
- human-review queue;
- provenance receipt;
- follow-up recommendation/request without autonomous treatment.

Initial autonomy ceiling: H1/H2.

No live patient deployment until H-G0 through applicable H-G9 gates are met.

## Workstream G — Remote clinical exception handling

**Outcome:** automated endpoints can route exceptions to an authorized human without transferring ambient authority.

Milestones:

- supervisor identity/credential verification;
- active assignment and heartbeat;
- concurrency ceiling;
- response-latency target;
- bounded temporary video/data grant;
- handoff;
- non-response state;
- safe halt when required supervision disappears;
- complete intervention evidence.

Promotion target: synthetic multi-booth simulation before any real clinical pilot.

## Workstream H — Supervised specimen collection laboratory

**Outcome:** represent and test a specimen workflow end to end before considering autonomous invasive action.

Milestones:

- authorized order/screening pathway;
- patient and specimen identity binding;
- device/consumable preflight;
- remote/onsite supervisor state;
- maximum attempts;
- movement/unsafe-state detection;
- post-procedure monitoring;
- custody handoffs;
- lab analyzer/result ingestion;
- adverse-event and uncertain-outcome recovery.

Initial autonomy ceiling: H3.

H4 autonomous invasive execution is a later, separately promoted programme and must not be inferred from H3 success.

## Workstream I — Post-procedure monitoring and emergency laboratory

**Outcome:** prove that automation can detect exceptions and escalate safely without granting ordinary agents unrestricted emergency powers.

Milestones:

- local multimodal safety monitor;
- anomaly evidence object;
- automated patient prompt/recheck;
- remote-clinician escalation;
- event-specific break-glass request;
- pinned emergency destination;
- idempotent/uncertain dispatch semantics;
- patient-visible/post-event audit;
- capability closure after event;
- false-positive and missed-event evaluation.

Initial autonomy ceiling: H1/H2. H5 remains lab-only until explicit independent review and jurisdiction-specific authorization.

## Workstream J — Healthcare interoperability gateway

**Outcome:** connect health records, labs, imaging, scheduling, and downstream care through standards-based adapters while keeping AXIOM authority semantically dominant.

Milestones:

- select one read-only healthcare standard/profile first;
- adapter maps remote identity/data semantics into explicit AXIOM claims;
- protocol discovery never grants permission;
- outbound writes use evidence-first prepared/outbox semantics;
- destination allowlists;
- no broad provider credential exposure to agents;
- same-idempotency recovery for uncertain writes where possible;
- conformance tests for authorization parity;
- map jurisdictional audit and retention obligations.

No adapter may directly bypass Hypervisor/Sandbox authority because the remote standard already has its own access-control model.

## Workstream K — Imaging and diagnostic-capacity orchestration

**Outcome:** use the Mesh to coordinate automated imaging workflows without treating the Mesh as the image reader.

Milestones:

- scanner/device identity;
- protocol selection authority;
- patient preparation state;
- acquisition provenance;
- reconstruction model binding;
- AI triage/measurement H1/H2 workflow;
- radiologist/clinician review state;
- report provenance;
- downstream referral;
- capacity/queue metrics exported to planning systems without unnecessary patient disclosure.

## Workstream L — Embodied clinical systems

**Outcome:** establish the additional safety boundary required for robots that can physically affect patients.

Milestones:

- independent local safety controller;
- force/motion/depth envelopes;
- hardware e-stop;
- patient escape/release path;
- consumable and sterile-boundary verification;
- watchdog independent of reasoning model;
- safe state on network/authority loss;
- physical simulator and fault-injection suite;
- no consequential physical actuation solely on unverifiable model output.

Promotion sequencing: H3 before H4; non-invasive before invasive; simulated before human pilot.

## Workstream M — Regulation, clinical evidence, and deployment dossiers

**Outcome:** make jurisdiction-specific promotion evidence explicit rather than claiming generic compliance.

For each deployable workflow, maintain a dossier covering:

- intended use;
- patient population;
- autonomy level;
- device/model regulatory classification;
- professional-scope requirements;
- facility/laboratory requirements;
- privacy and retention obligations;
- clinical validation evidence;
- human-factors/accessibility evidence;
- incident reporting/recall obligations;
- insurer/payment implications if relevant;
- named deployment owner;
- stopping criteria and rollback.

The initial jurisdiction research target should be Ontario/Canada because it provides a concrete public-health-system integration case, but the core architecture must remain jurisdiction-neutral.

## Workstream N — Patient sovereignty surface

**Outcome:** make Health Mesh authority understandable and inspectable by the patient.

Milestones:

- plain-language consent explanation;
- current encounter permissions;
- who accessed what and why;
- model/device identity in understandable form;
- result provenance summary;
- revocation controls where legally permitted;
- emergency access history;
- export/portability;
- accessibility and assisted-decision pathways.

## Workstream O — The Great Activation interface

**Outcome:** allow healthcare production/capacity modelling to inform infrastructure investment without turning planning analytics into clinical authority.

Expose aggregate, privacy-preserving metrics such as:

- booth utilization;
- scan throughput;
- no-show/turnaround rates;
- exception rate;
- human-supervision minutes per encounter;
- specimen failure/retry rate;
- downstream referral demand;
- diagnostic queue growth;
- equipment uptime;
- treatment-capacity constraints.

The planning layer may recommend where capital or automation should be directed. It does not issue patient-specific clinical actions.

## Promotion order

Recommended implementation order:

1. architecture/contracts/threat model;
2. synthetic identity/consent/autonomy conformance;
3. synthetic provenance/data-minimization testbed;
4. read-only non-invasive booth simulation;
5. remote human exception-routing simulation;
6. healthcare-standard read-only adapter;
7. evidence-first bounded write adapter;
8. supervised non-invasive operational pilot;
9. supervised specimen laboratory;
10. post-procedure safety laboratory;
11. jurisdiction-specific regulated pilot;
12. only then consider higher autonomous or embodied tiers.

## Explicit near-term blockers

The programme must not advance to live consequential clinical authority until AXIOM closes or appropriately bounds:

- persistent replay protection;
- evidence binding gaps;
- durable revocation/credential status;
- external-effect uncertainty semantics for each clinical adapter;
- emergency break-glass issuance/closure;
- independent security review;
- patient-facing audit/access-control usability;
- jurisdiction-specific clinical/regulatory requirements.

## Success criterion

Health Mesh succeeds when a patient-specific automated healthcare workflow can answer, with evidence:

> **Who or what acted, under whose authority, for which patient and purpose, using which device/model/data, within which autonomy and safety limits, what happened, who reviewed it, what was disclosed, and what happens when anything in that chain is uncertain or fails?**
