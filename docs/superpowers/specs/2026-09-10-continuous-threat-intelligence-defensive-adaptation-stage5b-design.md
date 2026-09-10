# Continuous Threat Intelligence & Defensive Adaptation — Fresh Stage 5B Design Gate

**Status:** OWNER APPROVED architectural direction on 2026-09-10; documentation-only; implementation authority not granted by this document

**Date:** 2026-09-10

**Scope:** AXIOM-MESH architecture for continuously ingesting external and local security observations, converting them into provenance-preserving threat hypotheses, reproducing relevant attacks in bounded laboratories, and promoting confirmed findings into regression evidence or separately authorized defensive changes without allowing threat-intelligence inputs or defensive agents to become authority roots.

**Fresh-gate rule:** this Stage 5B does not inherit implementation, migration, authorization, deployment, or promotion authority from prior agent-containment, digital-immune-system, epistemic-fabric, runtime, connector, sovereign-host, social, privacy, or security work. Earlier artifacts, tests, evidence, reviews, and lessons are inputs/provenance only.

**Builds on:**

- `CONSTITUTION.md`
- `docs/security/CURRENT-BUILD-THREAT-MODEL.md`
- `docs/security/DENY-EGRESS-BOUNDARY.md`
- `docs/superpowers/specs/2026-09-10-agent-containment-information-flow-stage5b-design.md`
- `agent-commons/digital-immune-system-profile.v1.json`
- `docs/architecture/AGENT-COMMONS.md`
- `docs/architecture/SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md`
- `docs/rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md`
- `docs/rebuild/REQUIREMENTS.md`
- the existing `Gateway -> Hypervisor -> Sandbox -> Grid` authority path
- existing deny-dominant policy, exact-effect commitments, finite machine-principal ceilings, one-use approvals, signed evidence, private credential custody, recovery controls, and capability-registry truth

**External research input:** Anthropic, *Detecting and countering misuse of AI: September 2026*, https://www.anthropic.com/threat-intelligence-report-september-2026 . The report is treated as an external security observation source, not as an AXIOM trust root. Its claims require provenance, confidence, applicability analysis, and where feasible local reproduction before they alter AXIOM tests or policy.

**Authority boundary:** this design creates no executable capability, no feed activation, no external network access, no model-provider authority, no automatic blocklist, no credential revocation authority, no autonomous code deployment, no production promotion, no retaliation authority, and no authority-bearing change to `mesh/config/capabilities.json`.

---

## 1. Architectural decision

AXIOM-MESH should add a continuous, provenance-preserving **intelligence-to-regression pipeline** around the existing Digital Immune System and agent-containment architecture.

The adopted separation is:

```text
external/local observations
        |
        v
source admission + provenance capture
        |
        v
normalization / deduplication / confidence
        |
        v
non-authoritative threat hypotheses
        |
        +--> architecture applicability analysis
        +--> isolated reproduction candidate
        +--> behavioral detector candidate
        +--> regression-fixture candidate
        |
        v
bounded disposable lab / verifier
        |
        v
confirmed, rejected, unresolved, or obsolete finding
        |
        +--> regression evidence
        +--> advisory risk signal
        +--> separately gated policy/code/recovery proposal
```

The governing doctrines are:

> **Threat intelligence may change what AXIOM tests. It must not silently change what AXIOM is authorized to do.**

> **AI may accelerate defensive adaptation, but it may never autonomously widen its own authority in order to defend the system.**

> **External content is evidence about possible threats, never executable instruction merely because it describes a threat.**

The system should learn continuously at the evidence and testing layers while consequential defensive action remains bounded by deterministic authority and separately approved change paths.

---

## 2. Motivation and evidence

The September 2026 Anthropic threat-intelligence report provides several concrete observations that materially affect AXIOM's threat assumptions:

1. **AI compresses attacker operating cost across the cyber kill chain.** Anthropic reports multi-agent workflows performing reconnaissance, exploitation, collection, persistence, and data exfiltration with minimal human supervision, including campaigns running for hours or days.
2. **Static detection is increasingly brittle.** One espionage operation used AI to monitor detection results and repeatedly rebuild tooling until it evaded known security products.
3. **AI credentials and integration surfaces are direct targets.** Anthropic describes theft of AI API keys and session material, including malicious prompt injection against an automated AI evaluation sandbox that caused it to disclose production provider credentials.
4. **Model-routing intermediaries can become confidentiality and provenance failures.** Anthropic reports proxy services silently substituting model providers, collecting exchanges without users' knowledge, and selling or using those exchanges for model distillation.
5. **Recovery media can preserve compromise.** Anthropic describes poisoned backups intended to re-infect a restored environment.
6. **Data fusion can turn ordinary records into surveillance infrastructure.** The report describes AI-assisted systems that cross-reference large datasets to identify, track, or target people.
7. **Influence operations increasingly automate provenance laundering.** Actors used AI to create fake personas, remove attribution, fabricate institutional appearances, and deliberately remove uncertainty from claims.
8. **Persistent AI workflow state can itself encode adversarial doctrine.** The report notes reusable files, instructions, source lists, and operational rules embedded into agent workflows rather than one-off prompts.

These observations do not establish that AXIOM is currently vulnerable to each technique. They establish that the architecture should assume attackers can repeatedly probe exposed surfaces, adapt quickly, and exploit ordinary integration mistakes at machine speed.

The resulting security premise is:

> **Every exposed or future-exposed AXIOM surface must be expected to face continuous, adaptive, machine-speed adversarial exploration.**

---

## 3. Existing AXIOM substrate

This programme must extend current controls rather than create a second security system.

### 3.1 Digital Immune System

`agent-commons/digital-immune-system-profile.v1.json` already defines non-authoritative defensive roles such as `sentinel`, `cross_examiner`, `provenance_checker`, `behavior_monitor`, `canary`, and `memory_curator`. It already distinguishes advisory, corroborated, and confirmed decision lanes and states that attack intelligence may propagate while authority does not.

This Stage 5B gives that profile a controlled external-observation and regression-promotion lifecycle.

### 3.2 Agent containment

The 2026-09-10 agent-containment Stage 5B already requires that powerful runtimes remain proposal engines inside deterministic authority and information-flow boundaries. This programme consumes its eventual flow-sensitive observations and credential-broker evidence but does not inherit implementation authority from it.

### 3.3 Current clean-room kernel

The supported kernel already has explicit authenticated ingress, deny-dominant authorization, finite machine-principal constraints, deterministic supported operations, signed evidence, deny-egress deployment expectations, constrained credentials, and fail-closed semantics.

Continuous threat intelligence is therefore an **evidence and verification layer around the authority path**, not an alternate authority path.

---

## 4. Considered approaches

### 4.1 Periodic human security review only

Security reports and incidents are reviewed manually and converted into fixes when maintainers notice relevance.

**Advantages:** smallest attack surface; easy authority story.

**Rejected as sufficient:** machine-speed attacker adaptation makes periodic review too slow and inconsistent. Relevant observations can be missed, duplicated, forgotten, or fail to become permanent regression evidence.

### 4.2 Autonomous defensive agent with self-updating policy

A privileged AI continuously reads threat feeds, modifies detections and policy, and deploys defensive changes automatically.

**Advantages:** fastest possible reaction; simple operational loop.

**Rejected:** threat feeds are attacker-influenceable inputs. A privileged self-modifying defender creates a policy-poisoning and authority-escalation path. False positives, compromised models, poisoned research, or malicious instructions could become system policy without an independent authority chain.

### 4.3 Provenance-preserving intelligence-to-regression pipeline — adopted

Continuously collect bounded observations, normalize them into non-authoritative hypotheses, reproduce relevant threats in disposable laboratories, and promote only verified properties into deterministic regression tests or separately authorized defensive proposals.

**Advantages:** fast learning without ambient authority; compatible with existing evidence discipline; preserves uncertainty and falsification history; converts transient reports into durable tests.

**Trade-off:** slower than unrestricted self-modification and requires explicit data contracts, source provenance, lab isolation, deduplication, expiry, and review semantics.

---

## 5. Non-negotiable invariants

1. **No intelligence source is an authority root.** Vendor reports, social posts, CVE feeds, government advisories, model outputs, user submissions, remote nodes, and internal detectors provide observations only.
2. **No defensive model is an authority root.** A model may classify, correlate, hypothesize, summarize, or propose. It may not mint capability, widen scopes, reveal credentials, authorize egress, or deploy consequential changes.
3. **Defence cannot self-widen.** A defensive component cannot expand its own data access, network access, resource budget, credential access, execution scope, or persistence merely because it reports an emergency.
4. **Threat content is data, not instruction.** Embedded commands, prompts, code, links, tool descriptions, workflow text, or model-control language in threat sources are never interpreted as trusted operating instructions.
5. **Unknown applicability is not confirmation.** A report about another product or environment remains an unresolved hypothesis until AXIOM-specific applicability is established.
6. **Reproduction is isolated.** Potentially malicious artifacts or exploit procedures run only inside explicitly disposable, deny-by-default laboratories with no production credentials or implicit access to protected user state.
7. **Regression promotion requires evidence.** A new permanent regression fixture must bind to a reproducible property, exact expected failure/success semantics, provenance, and review state.
8. **Policy/code change remains separately authorized.** A confirmed threat may justify a proposal but does not itself authorize production mutation.
9. **External observations cannot lower existing protections.** Missing confidence, stale source state, feed outage, parser failure, or conflicting reports never widen capability or weaken policy.
10. **Source diversity cannot manufacture authority.** Ten agreeing feeds remain evidence, not permission.
11. **Sensitive findings remain minimized.** Threat records and receipts must avoid copying raw secrets, exploit payloads, personal dossiers, or unnecessary private data into durable logs.
12. **Behavioral signals are not guilt.** An anomaly may increase scrutiny or trigger bounded verification; it must not automatically become identity attribution, permanent reputation, or punishment.
13. **Recovery evidence is independently verified.** Restored state is not assumed clean merely because its backup signature is valid; executable persistence and recovery manifests require policy and integrity checks appropriate to the recovery path.
14. **Provider provenance is explicit.** Model/provider routing, intermediaries, data-retention expectations, and requested-versus-actual provider identity must be representable in evidence for protected workflows.
15. **Capability registry truth remains authoritative.** No design document, detector, lab result, or threat report changes current implemented/production capability state by assertion.

---

## 6. Core data model

The first implementation should use small, language-neutral contracts. Exact schemas belong to a later implementation plan, but the semantic fields are locked here.

### 6.1 `ThreatObservation`

Represents one bounded claim or signal from a source.

```text
observation_id
source_class
source_identity_or_locator
source_version_or_published_at
retrieved_at
content_digest
claim_class
summary
indicators[]
affected_technology_or_boundary[]
reported_preconditions[]
reported_effects[]
source_confidence
collector_confidence
sensitivity_class
raw_content_reference
provenance_chain[]
expiry_or_review_at
```

`raw_content_reference` is a reference to separately governed storage where needed. The ordinary observation object should not duplicate dangerous payloads or sensitive source material.

### 6.2 `ThreatHypothesis`

Represents AXIOM's interpretation of one or more observations.

```text
hypothesis_id
observation_ids[]
axiom_boundary_or_component[]
precondition_mapping[]
expected_failure_mode
applicability_state
confidence
contradicting_evidence[]
required_reproduction[]
created_by_principal_or_process
created_at
review_at
hypothesis_digest
```

Allowed `applicability_state` values for the first slice:

- `unassessed`
- `plausible`
- `not_applicable`
- `lab_confirmed`
- `current_build_blocked`
- `current_build_vulnerable`
- `obsolete`

A model may propose this state. A deterministic verifier or authorized review controls promotion into the confirmed states.

### 6.3 `ReproductionCase`

Defines a bounded lab experiment.

```text
reproduction_id
hypothesis_id
base_source_revision
lab_profile_digest
fixtures[]
forbidden_resources[]
allowed_resources[]
expected_observations[]
pass_fail_predicate
max_runtime
max_storage
max_processes
network_profile
secret_profile
cleanup_contract
```

The first accepted laboratory profile must contain no production credentials, no unrestricted external network, no production Grid data, and no implicit access to the host user's personal environment.

### 6.4 `RegressionCandidate`

Represents a proposed durable protection.

```text
candidate_id
hypothesis_id
reproduction_id
property_to_preserve
negative_fixture_digest
positive_control_digest
expected_failure_semantics
scope
owner_or_reviewer_state
evidence_bindings[]
expiry_or_reassessment
```

A regression candidate is not a capability or policy mutation.

### 6.5 `ThreatAdaptationReceipt`

Records the evidence lifecycle without recording unnecessary raw threat content.

```text
receipt_schema
observation_digests[]
hypothesis_digest
source_revision
lab_profile_digest
reproduction_result_digest
regression_candidate_digest
review_state
policy_or_code_change_ref if separately created
timestamps
signer
```

---

## 7. Source-admission architecture

Continuous ingestion does not mean arbitrary internet content flows directly into a privileged agent context.

The first source-admission boundary should classify sources into explicit classes such as:

- vendor security reports;
- CVE/NVD or equivalent vulnerability advisories;
- upstream dependency/project advisories;
- CERT/government advisories;
- peer-reviewed security research;
- trusted partner disclosures;
- AXIOM local incident evidence;
- AXIOM lab findings;
- community/user submissions;
- untrusted open-web observations.

Each source class gets separate parsing, retention, confidence, and review policy.

A feed adapter must:

1. fetch or receive content through an explicitly authorized external boundary;
2. record retrieval/source metadata before model processing;
3. hash the received representation;
4. strip active execution semantics;
5. separate source content from system/operator instructions;
6. apply size, recursion, archive, media, and decompression limits;
7. classify sensitive or dangerous payload material;
8. store raw material separately when retention is justified;
9. produce a normalized observation object;
10. create no automatic production effect.

A source parser failure creates an unavailable observation, not an instruction to bypass validation.

---

## 8. Poisoning and instruction-boundary defence

Threat intelligence is adversary-adjacent content by definition. The ingestion plane must assume an attacker may deliberately publish material crafted to compromise an AI analyst.

Required controls include:

- immutable separation between source text and trusted system/policy instructions;
- no secrets or authority-bearing credentials in analyst model context;
- no direct tool authority from the ingestion model;
- content-length, nesting, attachment, archive, and expansion limits;
- canonical source digests preserved before summarization;
- extraction of code/payloads into inert, quarantined objects;
- cross-examiner review for instructions masquerading as evidence;
- model diversity or deterministic checks where independent disagreement is useful;
- explicit provenance for model-generated summaries;
- retention of contradictions and uncertainty rather than forced synthesis;
- no durable memory promotion solely from one model's interpretation.

The pipeline should be designed so a perfect prompt injection can at worst corrupt a disposable analysis result, not obtain a credential or production capability.

---

## 9. Applicability analysis

The system should map observations against explicit AXIOM architecture facts rather than keyword similarity alone.

Example questions:

```text
Does AXIOM expose the affected protocol or dependency?
Is the claimed vulnerable version present?
Does the current authority path permit the reported precondition?
Can the attacker reach the relevant interface?
Would deny-egress, exact destination binding, FlowContext, brokered credentials,
or one-use approval already block the path?
Does the attack rely on a capability AXIOM does not implement?
Does recovery/import preserve the reported persistence mechanism?
Could the attack instead apply to Axiom One, a relay, connector, provider, browser,
host, CI environment, or operator workflow outside the clean-room kernel?
```

Applicability output must name the boundary under evaluation. A threat blocked by the kernel may remain relevant to a host-side relay or future connector.

---

## 10. Reproduction and canary laboratory

The existing `canary` defensive role becomes the conceptual owner of reproduction proposals, but not a privileged executor.

A valid reproduction environment should be disposable, reproducible, resource-bounded, isolated from production identity and credentials, and able to emit deterministic evidence about expected effects.

Initial laboratory classes may include:

- parser/input attacks;
- prompt/tool-description injection;
- authority-laundering attempts;
- credential-surrogate disclosure attempts;
- destination/egress bypass;
- restore/import persistence;
- provider-routing substitution;
- cross-principal coordination;
- social/provenance laundering;
- data-fusion/privacy reconstruction;
- static-detection evasion against non-production fixtures.

The lab must never be used to attack third-party systems. External target testing requires an independently authorized legal/security workflow outside this Stage 5B.

---

## 11. From confirmed threat to durable regression

The preferred defensive output is not a prose recommendation. It is a permanent property with executable evidence.

For each confirmed relevant threat, the programme should attempt to produce:

1. a minimal negative fixture that demonstrates the unsafe path;
2. a positive control proving the intended legitimate path still works;
3. exact fail-closed semantics;
4. a test bound to the relevant capability or security invariant;
5. provenance back to the observation/hypothesis/reproduction result;
6. reassessment metadata if the fixture is version- or dependency-specific.

Examples:

- evaluation-sandbox prompt injection must not expose real provider credentials;
- model routing must fail or warn when requested and actual provider identities conflict;
- recovered executable state must not be trusted solely because the backup container is signed;
- a defensive-agent anomaly signal must not mint authority or widen a machine principal;
- threat-feed text containing policy-like instructions must remain source data;
- a known detection signature changing must not disable behavioral invariants;
- social provenance claims must distinguish signed origin from truth or biological identity.

A regression test that merely checks for a string or documentation phrase is not sufficient evidence for a runtime security property.

---

## 12. Behavioral defensive layer

The report's adaptive-malware examples justify treating behavior as a first-class signal in addition to static signatures.

Candidate behavioral observations include:

- unusual credential redemption or credential-surrogate failures;
- unexpected egress attempts;
- sudden destination changes;
- authority or scope expansion requests;
- repeated denied actions across multiple machine principals;
- high-rate reconnaissance-like discovery patterns;
- unusual data-volume or export-volume changes;
- persistence creation attempts;
- repeated provider/model substitution;
- recovery/import objects that reintroduce previously removed executable state;
- correlated cross-principal attempts to distribute one denied objective;
- repeated attempts to move authority-bearing content into cognitive runtimes;
- abrupt divergence between declared purpose and requested effects.

These are **signals**, not automatic guilt determinations. The default response lane should be advisory or corroborated, with deterministic containment only where separately preapproved and bounded.

Static signatures remain useful for cheap known-bad detection. They are not the sole defensive boundary.

---

## 13. Secret and credential implications

AI credentials must be treated as production credentials.

The programme should explicitly verify that future agent/provider integrations preserve these properties:

- long-lived provider secrets remain outside cognitive runtime context;
- production secrets are unavailable to evaluation or reproduction sandboxes;
- short-lived surrogates are exact-action, exact-destination, finite, and replay-bound;
- logs and threat receipts contain digests or identifiers rather than secret values;
- credential rotation is independently triggered and does not expose replacement credentials to the model;
- a threat report claiming credential theft can trigger a review/revocation proposal but cannot itself revoke credentials;
- exposed secret detections use minimized evidence and avoid copying the discovered secret into general telemetry.

The September 2026 report's evaluation-sandbox compromise is a mandatory future regression scenario for any AXIOM evaluation harness that can access model providers.

---

## 14. Model/provider routing provenance

For protected model calls, AXIOM should eventually be able to represent:

```text
requested_provider
requested_model
actual_provider
actual_model where verifiable
intermediary_or_router_chain[]
provider_endpoint_identity
jurisdiction_or_trust_domain where policy-relevant
retention/training policy commitment
data_classes_transmitted
flow_context_digest
request_digest
response_digest
provider_evidence_strength
```

This evidence does not prove a provider's private internal behavior. It makes routing assumptions explicit and testable.

Unknown or unverifiable provider substitution must not be silently represented as requested-provider execution.

The first implementation should prefer direct, pinned provider relationships or explicitly declared routers over opaque discount/resale paths.

---

## 15. Recovery and backup adaptation

A valid backup signature proves origin/integrity of the backup object, not that the captured state was uncompromised.

Recovery policy should therefore distinguish:

- data restoration;
- configuration restoration;
- executable/artifact restoration;
- credential restoration;
- trust-anchor restoration;
- policy restoration;
- persistence/service restoration.

A future recovery verifier should be able to identify executable persistence, compare recovered state against known-good manifests, require stronger review for authority-bearing material, and restore into quarantine/staging before activation when risk is elevated.

The threat-intelligence pipeline may provide indicators or regression fixtures used by recovery validation. It may not automatically mark a backup malicious or permanently block restoration without the applicable recovery authority path.

---

## 16. Social, identity, and influence implications

AI-assisted influence operations reinforce the need to separate:

- cryptographic origin;
- account continuity;
- organizational affiliation;
- biological/legal identity;
- authorship;
- automation state;
- factual truth;
- confidence/uncertainty.

No one signal proves all others.

Future Social/Circles threat intelligence may detect coordinated provenance laundering, mass persona creation, forged institutional claims, or uncertainty stripping. Those detections should create evidence or review signals, not universal reputation penalties.

Pseudonymity remains legitimate. The architecture should verify asserted claims when necessary rather than requiring universal real-name identity.

---

## 17. Privacy and surveillance implications

Threat intelligence may itself become a surveillance system if observations are joined into durable person-level dossiers.

This programme therefore inherits the privacy direction that collective knowledge must not require reconstructable individual records.

Threat records should be about attacks, infrastructure, techniques, affected boundaries, and system behavior. Person-level attribution should be retained only when necessary, legally appropriate, sourced, and access-controlled.

Cross-domain analytics should not create a stable global analytics identity merely to improve threat correlation.

Where broad telemetry is used to detect attacks, aggregation, minimization, purpose limitation, retention bounds, and privacy-preserving collective-intelligence techniques should be considered before centralizing raw user behavior.

---

## 18. Feed freshness, contradiction, and expiry

Continuous intelligence must not become permanent accumulation of stale fear.

Every durable observation or derived detector needs freshness/review metadata.

Required states include:

- current;
- superseded;
- contradicted;
- source withdrawn;
- fixed upstream;
- no longer applicable to current AXIOM build;
- retained as historical regression;
- expired pending reassessment.

A withdrawn or corrected report must not be silently deleted if it influenced a past decision. The correction becomes new provenance linked to the earlier record.

Detectors and signatures should expire or be reassessed when their assumptions are version-specific. Foundational invariants may remain permanent when the threat revealed a generally valid property.

---

## 19. Failure semantics

The pipeline must fail closed with respect to authority but fail transparently with respect to knowledge.

Examples:

- feed unavailable -> record staleness; do not weaken policy;
- parser failure -> quarantine/unavailable observation; do not execute source content;
- model unavailable -> preserve raw admitted observation for later analysis; do not invent a classification;
- contradictory sources -> preserve contradiction; do not average into false certainty;
- lab unavailable -> hypothesis remains unresolved; do not claim confirmation;
- verifier mismatch -> no regression promotion;
- threat database unavailable -> current authorization path continues under existing deterministic policy unless a separately established safety dependency requires a fail-closed stop;
- emergency signal -> may trigger already authorized bounded containment, never new ambient authority;
- ingestion overload -> shed low-confidence/low-priority analysis work before dropping authority/evidence invariants.

---

## 20. Security properties to test first

The first implementation plan should prioritize evidence-only tests before any live feed or new runtime behavior.

### T0 — contract and parser safety

- threat-source content cannot override parser/system instructions;
- active payloads remain inert;
- unknown schema fields fail closed or are ignored only under explicit version rules;
- oversized/nested/archive inputs are bounded;
- content digests survive normalization;
- source provenance is retained.

### T1 — authority non-amplification

- observation cannot create capability;
- hypothesis cannot widen scope/destination/budget;
- detector cannot reveal credentials;
- corroborated signal cannot bypass one-use approval;
- defensive agent cannot modify its own principal;
- emergency classification cannot create egress.

### T2 — reproduction isolation

- no production credentials in lab;
- no production Grid state mount;
- no unrestricted network;
- bounded runtime/process/storage;
- complete cleanup or disposable environment destruction;
- lab output cannot directly mutate production policy.

### T3 — report-derived regression scenarios

- malicious instructions in an evaluation fixture cannot exfiltrate provider secrets;
- requested-versus-actual model/provider mismatch is detectable where evidence is available;
- restore workflow does not equate signed backup with uncompromised executable state;
- behavioral invariant remains effective when static signatures change;
- multi-agent coordination cannot pool authority;
- provenance laundering does not upgrade source confidence automatically.

### T4 — evidence and lifecycle

- observation -> hypothesis -> reproduction -> regression lineage is verifiable;
- contradiction and falsification history are retained;
- stale detectors can expire without erasing historical evidence;
- threat receipts contain no raw secrets or unnecessary private content;
- rejected hypotheses remain distinguishable from confirmed mitigations.

---

## 21. Implementation sequence

This design intentionally decomposes implementation into independently gated slices.

### Slice A — evidence-only threat contracts

Language-neutral schemas, validators, fixtures, and documentation for `ThreatObservation`, `ThreatHypothesis`, `ReproductionCase`, `RegressionCandidate`, and `ThreatAdaptationReceipt`.

No network. No model provider. No policy effect.

### Slice B — offline corpus and deterministic normalization

A local, test-fixture-backed ingestion path for checked-in/sample advisories and AXIOM incident artifacts. Deduplication, source digests, contradiction links, freshness, and applicability scaffolding.

Still no live feeds and no production effect.

### Slice C — disposable reproduction harness

A bounded local laboratory capable of exercising approved synthetic fixtures against exact source revisions. No production secrets, no third-party targets, no unrestricted egress.

### Slice D — regression-promotion workflow

Verified lab findings can produce a proposed regression fixture and evidence bundle. Promotion into protected tests requires the normal repository review/merge path.

### Slice E — advisory behavioral monitoring

Integrate selected existing telemetry/evidence surfaces into non-authoritative anomaly signals with strict privacy minimization and no new containment authority.

### Slice F — live external feed adapters

Only after a fresh gate covering network topology, source authentication, parser isolation, retention, rate/resource limits, poisoning resistance, and operational ownership.

### Slice G — separately gated bounded automatic containment

Only for narrow, deterministic, reversible responses whose exact authority and failure semantics have been independently reviewed. This slice is explicitly **not authorized** by the present design.

---

## 22. Migration and compatibility contract

1. Existing authorization semantics remain unchanged unless a later separately approved implementation explicitly changes them.
2. Existing Digital Immune System roles remain non-authoritative.
3. Existing threat-model documents remain canonical for the current build until deliberately updated and verified.
4. Existing incident/review evidence may be imported as observations only through explicit provenance-preserving adapters.
5. Existing signatures/tests are not retroactively claimed to have been produced by this pipeline.
6. Threat-intelligence schema names and semantics must remain language-neutral so a future Rust trust-core migration does not make durable evidence Rust-specific.
7. A Node reference implementation may act as executable specification; a later Rust implementation must prove semantic parity for shared contracts before replacing trusted behavior.
8. Feed or detector replacement must not change authority semantics.
9. Capability registry promotion remains a separate evidence-bound act.
10. No future slice may cite this design as inherited authority to activate networking, autonomous containment, provider credentials, or production code changes.

---

## 23. Threat model delta

This programme adds or sharpens these threat classes:

- poisoned threat feed;
- prompt injection inside security research or advisories;
- malicious exploit artifact embedded in a report;
- parser/archive/decompression bomb;
- source impersonation or provenance substitution;
- compromised security vendor/feed account;
- false-positive cascade across correlated AI detectors;
- defensive-agent authority escalation;
- self-protective or self-preserving behavior by a defensive runtime;
- stale signature causing false confidence;
- attacker adaptation against deterministic signatures;
- model/provider routing substitution;
- credential theft from evaluation/reproduction systems;
- secret copied into threat telemetry;
- malicious recovery state or poisoned backup;
- threat-database compromise used to create denial of service;
- person-level surveillance emerging from overbroad telemetry correlation;
- influence/provenance laundering represented as verified truth;
- unreviewed third-party offensive testing accidentally escaping the lab;
- AI-generated false certainty suppressing contradictions.

The implementation plan must map each promoted component to at least one exact negative or failure test where the threat is practically testable.

---

## 24. Explicit nonclaims

This design does **not** claim:

- that Anthropic's reported attacks affect the current AXIOM build;
- that AI can autonomously secure AXIOM;
- that anomaly detection can determine malicious intent;
- that prompt injection can be perfectly detected;
- that a signed source is truthful;
- that multiple agreeing sources create authority;
- that model/provider identity can always be independently proven;
- that a signed backup is clean;
- that behavioral detection replaces patching, least privilege, or static signatures;
- that the lab may target systems the operator does not own or have permission to test;
- that current Digital Immune System laboratory concepts are production promoted;
- that any live feed, external egress, automatic response, credential rotation, policy mutation, or runtime action is authorized here.

---

## 25. Success criteria for the first implementation gate

A first implementation gate is ready only when it can show, on a branch and without live external feeds:

1. canonical language-neutral threat lifecycle contracts;
2. deterministic validation and serialization;
3. provenance-preserving sample observations;
4. explicit contradiction/falsification state;
5. zero-authority hypothesis creation;
6. a disposable reproduction-case contract and isolation tests;
7. at least three report-derived synthetic negative fixtures, including evaluation-secret exfiltration, provider-routing mismatch, and recovery-state persistence;
8. a regression-candidate object that cannot mutate policy or capabilities;
9. privacy-minimized adaptation receipts;
10. exact tests proving intelligence and defensive agents cannot widen authority;
11. documentation and current-build nonclaims checked by the repository's protected verification surface.

---

## 26. Stage 5B approval state

The owner has approved the **architectural direction** to proceed with Continuous Threat Intelligence & Defensive Adaptation.

This written Stage 5B specification remains documentation-only until reviewed as the concrete design artifact. After that review, the next permitted step is an implementation plan for the evidence-only first slices. No live feed, new egress, provider credential, capability promotion, autonomous containment, policy mutation, or production deployment is authorized by this document.
