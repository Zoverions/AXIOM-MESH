# Sovereign Information, Evidence, Privacy, and Authority — Design

**Status:** approved architecture; documentation-only; no capability promotion

**Date:** 2026-09-03

**Scope:** AXIOM-MESH cross-domain substrate for Health, Education, Justice, Work/Payroll, Governance, Circles, professional credentialing, reputation, risk assessment, collective analytics, and future institutional domains.

**Builds on:**

- `CONSTITUTION.md`
- `docs/rebuild/REQUIREMENTS.md`
- `docs/superpowers/specs/2026-08-31-selective-interposition-native-reference-agent-design.md`
- `docs/architecture/SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md`
- `docs/architecture/PERSONAL-COMPUTE-FABRIC-AND-LOCAL-TRUST.md`
- `docs/architecture/SCALING-DISTRIBUTED-AUTHORITY-AND-CONSENSUS.md`
- Axiom Education's governed collaboration/privacy contract and exact-purpose access model
- the existing consent, encrypted Grid, evidence, portability, machine-principal, governance, and selective-disclosure foundations

**Authority boundary:** this design does not grant any new runtime authority, expose regulated data, enable real institutional deployment, activate machine delegation, create a public reputation system, or claim production-grade differential privacy, MPC, secure aggregation, healthcare compliance, justice-system compliance, employment compliance, or government deployment. Runtime truth remains subordinate to `mesh/config/capabilities.json`, the signed policy stack, current code, and reproducible evidence.

---

## 1. Core decision

AXIOM-MESH will treat privacy, institutional information rights, evidence quality, delegated authority, reputation, risk, and collective intelligence as one coordinated constitutional substrate rather than allowing each domain to invent incompatible local rules.

The governing model is:

```text
private/domain state
    |
    +--> information-rights envelope
    +--> evidence/provenance graph
    +--> contextual disclosure projection
    +--> delegated authority / assurance gates
    +--> privacy-preserving collective projection
    |
    v
bounded authorized effect / disclosure / statistic / decision input
```

The substrate must support different legitimate institutional structures without collapsing them into one global identity database, one global reputation score, one universal disclosure rule, or one political legitimacy model.

The fundamental objective is:

> **Increase individual and collective capability while minimizing unnecessary concentration of information, authority, and irreversible institutional power.**

The substrate therefore standardizes the grammar of identity, relationship, purpose, authority, evidence, disclosure, contestability, consequence, assurance, retention, and recovery while leaving domain-specific law, policy, professional rules, and institutional legitimacy to versioned domain policies and independently reviewed adapters.

---

## 2. Constitutional doctrines

The following doctrines are normative architectural direction.

### 2.1 Information about an agent is not automatically owned by that agent

Being the subject of information does not by itself determine every right over the information.

An information object may have distinct:

- subject(s);
- originator(s);
- custodian(s);
- controller(s);
- affected parties;
- beneficiaries;
- permitted recipients;
- reviewers/auditors;
- decision users;
- challengers;
- disclosure authorities;
- retention authorities.

These relationships must not be collapsed into a single `owner` field.

A patient may be the subject of a clinician's note without automatically controlling every disclosure decision concerning that note. A clinician may author a note without gaining unlimited authority over it. A hospital may custody bytes without receiving unrestricted secondary-use rights. A police service may hold investigative evidence without thereby establishing the truth of the proposition it supports. An employer may retain a payroll record under a lawful retention obligation without gaining authority to reuse it for unrelated profiling.

### 2.2 Provenance is not truth

Cryptographic integrity can establish that a principal asserted, signed, received, transformed, or preserved an object. It cannot by itself establish that the assertion corresponds to reality.

Required distinction:

```text
integrity evidence != truth
attestation != fact
consensus != truth
confidence != authority
institutional status != correctness
```

Every consequential domain must preserve this distinction in both machine and human surfaces.

### 2.3 Risk is not prohibition

Consequence/risk classification determines the minimum assurance burden. It does not itself grant or deny authority.

Required distinction:

```text
risk/consequence -> required scrutiny
policy/authority -> whether action may occur
```

A high-consequence action may be legitimate and executable if stronger assurance requirements are satisfied.

Higher consequence may increase:

- identity assurance;
- credential freshness;
- evidence quality;
- independent verification;
- disclosure minimization;
- execution isolation;
- resource ceilings;
- monitoring;
- checkpointing;
- reversibility preparation;
- rollback capability;
- approval threshold;
- number/diversity of approvers where policy requires;
- post-action reconciliation;
- audit evidence.

The security objective is **safe completion of authorized actions**, not denial for its own sake.

### 2.4 Security gates and human interruptions are independent

A workflow may cross many internal gates without repeatedly interrupting the end user.

A human or other sovereign principal may grant a bounded mandate to a personal/digital agent that authorizes that agent to satisfy, approve, negotiate, or decline classes of gates on the principal's behalf.

Therefore:

> **More gates must not imply more prompts.**

> **Delegation may reduce ceremony without reducing protection.**

A gate requires end-user interruption only where the applicable mandate, domain policy, law, unresolved uncertainty, or non-waivable protection requires it.

### 2.5 Intelligence is not permission

A personalized agent may predict what its principal would probably approve. That prediction does not enlarge the agent's authority.

Required distinction:

```text
preference inference != delegated authority
capability != permission
credential != authority
reputation != authority
risk result != identity
institutional role != universal access
```

An agent may propose expansion of its mandate. It may not silently promote learned preference into authority.

### 2.6 Personalization must not become entitlement to disclosure

A personal agent may know much more about its principal than any external party is entitled to know.

The existence of rich personalization should improve the agent's ability to protect and represent its principal; it must not create a standing external profile API.

> **Personalization may increase what an agent knows about itself or its principal without increasing what others are entitled to know.**

### 2.7 Privacy must hold against correlation, not merely direct disclosure

Removing names, hashing identifiers, redaction, or pseudonymization alone are insufficient where repeated, longitudinal, cross-domain, geospatial, temporal, credential, reputation, or metadata signals can reconstruct identity.

AXIOM must design against an adversary that can combine:

- multiple AXIOM releases;
- public records;
- commercial datasets;
- credential presentations;
- reputation history;
- access receipts;
- timing and network metadata;
- years of observations;
- substantial compute.

### 2.8 Cross-domain knowledge is permitted; cross-domain dossiers are not the default mechanism

Health, Education, Governance, Justice, Work, Finance, and other domains must not create a universal analytics `person_id` merely because cross-domain statistics are useful.

Where cross-domain knowledge is legitimate, prefer governed joint computation and bounded projections over unrestricted record-level joins.

### 2.9 Correction does not always mean deletion

Where integrity, legal retention, clinical continuity, investigative provenance, or auditability requires preserving a historical assertion, correction may require an append-only relationship:

```text
original assertion
    +--> challenge
    +--> correction
    +--> supersession
    +--> later evidence
    +--> adjudication
```

The original assertion remains historically attributable while current surfaces show the applicable challenge/supersession state.

### 2.10 Institutional power does not create ambient information authority

A senior role, organizational hierarchy, public office, professional title, investigator status, administrator account, or machine operator identity does not create universal browse authority.

Every privileged read or effect must resolve to a purpose-bound authority path.

---

## 3. Agent model

In this architecture, **agent** is the generic term for a principal capable of participating in governed interactions. It may be:

- a human;
- a persistent digital entity;
- a constrained machine principal;
- an institution represented by authorized principals;
- a service acting under a bounded mandate.

The same high-level authority grammar should apply across human and digital agents, while assurance evidence may differ.

A human may prove identity using a particular authenticator/credential profile. A digital entity may prove signed runtime identity, sponsor/delegator, software digest, currentness, execution environment, and finite mandate. Neither receives authority merely by proving identity.

---

## 4. Information Rights Envelope

AXIOM should introduce a domain-neutral **Information Rights Envelope** attached to or referenced by consequential information objects.

The envelope is policy metadata. It is not itself a capability grant.

### 4.1 Required semantic fields

A first schema should support:

```text
schema/version
object_ref / digest
information_class
sensitivity_class
subjects[]
originators[]
custodians[]
controllers[]
affected_parties[]
beneficiaries[]
authority_basis[]
allowed_purposes[]
forbidden_purposes[]
access_policy_refs[]
disclosure_policy_refs[]
retention_policy_refs[]
retention_state
legal_or_policy_hold_refs[]
challenge_policy_refs[]
correction_policy_refs[]
export_policy_refs[]
deletion_policy_refs[]
provenance_refs[]
evidence_refs[]
redaction/projection profiles[]
jurisdiction/policy context[]
created_at
reviewed_at / freshness where applicable
supersession/challenge state
```

No single relationship implies all others.

### 4.2 Rights are capability-specific

Possible rights include:

- know that an object exists;
- inspect metadata;
- inspect full content;
- receive a redacted/projection view;
- use for a named decision purpose;
- correct factual metadata;
- challenge interpretation;
- append contrary evidence;
- export;
- disclose onward;
- delete;
- request deletion;
- retain under obligation;
- seal;
- unseal;
- use in aggregate analytics;
- use as model/training input;
- cite as evidence;
- rely upon for a consequential decision.

These must not be conflated.

A principal may, for example, have authority to know that a record exists and challenge it while lacking authority to inspect a protected third-party segment.

### 4.3 Domain policy remains authoritative for domain-specific access

The substrate must not encode a universal rule such as "the subject may always read the record" or "the author may always withhold it."

Health, Justice, Employment, Education, Finance, and other domains require distinct lawful/policy rules, including exceptions, appeals, review, and time-bounded restrictions.

The substrate carries the exact authority basis, policy version, and resulting decision.

---

## 5. Evidence and assertion graph

AXIOM should represent consequential knowledge as a typed graph rather than flattening every claim into an unqualified fact.

### 5.1 Core node types

First-class semantic types should include:

- `observation` — what a principal/sensor directly reports observing;
- `assertion` — a proposition claimed by a source;
- `inference` — a conclusion derived from other information;
- `hypothesis` — a proposition under active investigation/evaluation;
- `evidence-item` — an artifact, testimony, record, measurement, or other support object;
- `counterevidence` — evidence inconsistent with or weakening a proposition;
- `source` — provenance and source identity/context;
- `alternative-explanation` — another explanation consistent with some evidence;
- `unknown` — explicitly unresolved information;
- `missing-evidence` — known/expected evidence not currently available;
- `challenge` — an authorized contest of an assertion, interpretation, process, or decision;
- `correction` — a supported change to factual or contextual information;
- `supersession` — a later record replacing a previous current interpretation without erasing history;
- `review` — a human/machine/institutional review event;
- `adjudication` — a decision by a principal/domain with authority to decide a defined question;
- `decision-use` — evidence that a particular assertion/evidence set was relied upon for a consequential decision.

### 5.2 Core edge types

At minimum:

```text
supports
contradicts
weakens
corroborates
derived-from
observed-by
asserted-by
reviewed-by
relied-upon-by
challenged-by
corrected-by
superseded-by
alternative-to
missing-from
produced-by
disclosed-to
sealed-under
adjudicated-by
```

### 5.3 Epistemic state

A claim may carry a bounded state such as:

```text
asserted
corroborated
disputed
superseded
adjudicated-for-defined-purpose
indeterminate
withdrawn
```

These states are not universal metaphysical truth labels.

An adjudication is authoritative only for the scope in which that decision-maker has authority. A court finding, clinical diagnosis, scientific consensus, employer determination, and user preference statement have different semantics and appeal/revision pathways.

### 5.4 Preserve disconfirming evidence

Any consequential hypothesis workflow must make it possible to represent and retrieve:

- supporting evidence;
- contradictory evidence;
- ambiguous evidence;
- missing evidence;
- alternative hypotheses;
- unresolved source conflicts;
- assumptions;
- known collection gaps;
- evidence not incorporated into the current narrative.

The system must not permit a "case theory," diagnosis, institutional hypothesis, model-generated narrative, or briefing document to become the only retrievable structure simply because it is currently dominant.

### 5.5 Review-state semantics

For large evidence collections, these states must remain distinct:

```text
known
available
acquired
integrity-verified
indexed
machine-reviewed
human-reviewed
relied-upon
disclosed
challenged
adjudicated
```

In particular:

> `available != reviewed`

> `disclosed != understood`

> `recorded != true`

> `briefed != independently verified`

A UI or API must not silently imply a stronger review state than evidence establishes.

---

## 6. Contextual trust and disclosure projection

The default external interaction should not be "send profile." It should be "prove the minimum sufficient proposition for the current purpose."

### 6.1 Projection model

```text
private agent/domain state
    |
    v
request + purpose + verifier policy
    |
    v
local authority/disclosure evaluation
    |
    v
minimum sufficient projection/proof
    |
    v
verifier decision
```

Examples:

- prove current professional licensure without exposing unrelated employment history;
- prove age threshold without exposing date of birth;
- prove institutional membership without exposing unrelated memberships;
- prove security clearance threshold without exposing the complete background file;
- prove that a domain-specific reputation criterion is met without exposing every underlying interaction;
- prove that a digital entity is running an approved signed artifact under a finite delegation without exposing its owner's unrelated personal data.

### 6.2 Requested data does not become justified data

A requester may state what it wants. The sovereign agent and applicable policy determine what is justified.

A delegated personal agent may negotiate a narrower proof:

```text
requester asks for broad data
    -> agent determines purpose only requires claim X
    -> agent offers proof/projection of X
    -> broad disclosure remains denied or escalated
```

### 6.3 Credential, reputation, risk, and authority remain separate

A valid credential may be evidence used by an authorization policy. It is not itself execution authority.

A reputation result may affect routing, assurance, or eligibility. It is not itself execution authority.

A risk result may increase safeguards. It is not itself identity or authority.

---

## 7. Reputation architecture

AXIOM must not create a universal reputation number for humans or digital entities.

### 7.1 Reputation is contextual evidence

Reputation should be represented as domain-specific evidence and queries over that evidence.

Examples:

```text
software-security
clinical-review
teaching
contract-performance
financial-execution
moderation
scientific-review
```

A principal may have strong evidence in one domain and no demonstrated record in another.

### 7.2 Derived reputation claims

A verifier may request a bounded derived proposition such as:

```text
meets experienced-clinical-reviewer criterion v3
has >= N independently verified security findings under policy P
no current authority-violation event in domain D during window W
```

Where feasible, the response should expose the minimum required evidence/proof rather than the entire history.

### 7.3 Privacy constraints

Reputation systems must defend against:

- cross-domain correlation;
- client/task disclosure;
- relationship graph reconstruction;
- identity laundering;
- Sybil manufacturing;
- collusive vouching;
- wash challenges;
- stale history;
- permanent punishment from old/contextually irrelevant events;
- transfer of another principal's reputation through delegation.

Reputation must have explicit scope, evidence provenance, freshness, challenge, correction, expiry/decay where appropriate, and non-transfer semantics.

---

## 8. Risk and assurance architecture

AXIOM should use an **assurance profile** derived from explicit consequence dimensions rather than a universal opaque risk score.

### 8.1 Consequence dimensions

A deterministic evaluator may consider:

- data sensitivity;
- disclosure breadth;
- third-party impact;
- monetary/value exposure;
- physical safety impact;
- legal/regulatory consequence;
- clinical consequence;
- employment/eligibility consequence;
- governance/public-authority consequence;
- credential/trust-root impact;
- reversibility;
- recovery readiness;
- scope of affected population;
- destination trust/currentness;
- identity assurance;
- evidence freshness;
- model/runtime uncertainty;
- conflict/contestability status.

### 8.2 Assurance outcomes

The evaluator returns requirements and reason codes, not permission.

A subsequent authority evaluation may produce:

1. `execute` — authority exists and assurance requirements are already satisfied;
2. `execute-with-safeguards` — authority exists and the action proceeds under stronger containment, monitoring, staging, disclosure minimization, or recovery controls;
3. `escalate` — additional evidence, credential freshness, delegated approval, human approval, independent review, or another policy requirement is necessary;
4. `deny` — authority is absent, a non-waivable rule prohibits the operation, or a required safety condition cannot be satisfied.

### 8.3 Higher risk must not imply mandatory human approval

A high-assurance effect may be approved by an appropriately authorized delegated agent, institutional principal, threshold set, independent reviewer, or end user according to policy.

The architecture must not hard-code "high risk = ask the end user every time."

Human confirmation remains required where the user's mandate, applicable policy/law, or a non-waivable rule requires it.

### 8.4 Unknowns increase scrutiny

Unknown or contradictory consequence declarations should move the operation toward a stricter assurance profile.

This does not automatically mean denial. The system should first attempt to obtain the missing evidence or apply stronger safe constraints where policy permits.

---

## 9. Delegated gate authority

AXIOM should introduce a first-class **Delegated Gate Mandate** for human and digital principals.

### 9.1 Mandate semantics

A mandate may bind:

```text
grantor
agent/delegate
scope/domain
actions
purposes
data classes
destinations
resource/value ceilings
assurance ceilings
allowed gate decisions
required escalation conditions
credential-use rules
retention/disclosure constraints
start/expiry
revocation
non-delegation or attenuation-only delegation
freshness requirements
receipt requirements
```

### 9.2 Mandate examples

A user may configure different authority levels by domain:

- Health: agent may handle routine minimum-disclosure credential exchanges; escalate novel clinical disclosure;
- Shopping: agent may transact under a bounded amount with approved merchants;
- Education: agent may handle routine scheduling/submission logistics;
- Public posting: always require user confirmation;
- Local files: broad local organization authority, no external disclosure;
- Finance: handle recurring obligations, escalate unusual/new-payee transfers;
- Governance: research and prepare recommendations automatically, require explicit authority for binding participation where configured.

These are examples only. The substrate must not impose one preferred autonomy profile.

### 9.3 Protective discretion

Delegation includes the authority to decline unnecessary disclosure or demand a narrower proof.

The delegate is not merely an automatic "approve" button.

### 9.4 Adaptive personalization boundary

An agent may learn likely preferences and interruption tolerance. That learning may tune recommendations or propose policy changes.

It may not silently enlarge its mandate.

---

## 10. Privacy-Preserving Collective Intelligence

AXIOM should establish a shared cross-domain privacy projection layer for societal analytics.

### 10.1 Baseline architecture

Preferred direction:

```text
Health / Education / Governance / Justice / Work / other private state
    |
    v
local contribution computation
    |
    v
contribution bounds + purpose enforcement
    |
    v
unlinkability boundary
    |
    v
secure aggregation / reviewed joint-computation mechanism
    |
    v
differential-privacy / statistical disclosure control
    |
    v
privacy-budget ledger
    |
    v
release-risk checks
    |
    v
societal statistic / model update / research result
```

There should be no required intermediate "giant anonymized citizen database."

### 10.2 Required invariants

- Raw personal records do not enter the collective analytics plane by default.
- Stable cross-domain analytics identifiers are prohibited by default.
- `hash(person_id)` is not treated as anonymity.
- Domain/purpose-separated identifiers or unlinkable contribution credentials are used where identity continuity is unnecessary.
- Every metric binds purpose, population definition, sensitivity, contribution bounds, retention, and release policy.
- Individual contributions are bounded/clipped.
- Sparse/small cohorts are suppressed or otherwise protected.
- Fine-grained quasi-identifiers are generalized or protected where necessary.
- Repeated releases consume a compositional privacy budget where differential privacy is used.
- Equivalent/rephrased queries cannot reset privacy accounting merely by changing a label.
- Public outputs do not expose persistent row-level pseudonymous records by default.
- Audit/receipt systems must not become a secondary participant-correlation database.

### 10.3 Cross-domain computation

Ordinary record-level joins across sovereign domains should not be the default mechanism for societal analytics.

Where a legitimate cross-domain question requires joint information, use an explicitly authorized joint-computation protocol. Depending on the case and maturity, this may include:

- secure aggregation;
- MPC;
- private-set techniques;
- trusted execution under separately reviewed assumptions;
- differential privacy;
- federated computation with additional leakage protections;
- future reviewed cryptographic techniques.

The exact mechanism is domain- and threat-model-dependent. No cryptographic technique is treated as magic or automatically production-ready.

### 10.4 Privacy receipt

A released statistic/result should be able to carry a machine-verifiable privacy receipt describing, without identifying participants:

```text
metric/query definition digest
purpose
population bounds
participating domain classes
contribution bounds
minimum cohort/release rule
privacy mechanism/version
privacy parameters where applicable
privacy budget consumed
cumulative budget state
aggregation/joint-computation protocol
release timestamp
retention class
policy version
required approvals/reviews
known limitations/non-claims
```

### 10.5 Consent and release safety are separate gates

A participant's authority/consent to contribute does not itself prove that a release is statistically safe.

A release must satisfy both:

```text
contribution authority / lawful basis / consent where applicable
AND
statistical/privacy release policy
```

---

## 11. Adversarial privacy requirements

The programme must include explicit attacks/tests for:

- direct identifier leakage;
- quasi-identifier linkage;
- differencing attacks;
- longitudinal fingerprinting;
- rare-condition inference;
- membership inference;
- attribute inference;
- repeated-query composition;
- cross-domain correlation;
- credential/reputation correlation;
- timing/network metadata correlation;
- audit-log correlation;
- Sybil isolation of secure-aggregation participants;
- colluding aggregators;
- federated/model-update leakage;
- malicious query canonicalization bypass;
- privacy-budget reset/replay;
- small-cohort reconstruction;
- side-channel leakage from suppression decisions.

Production promotion requires an explicit threat model and attack evidence tied to the exact implementation.

---

## 12. Domain composition patterns

The substrate must support different institutional rules without pretending they are identical.

### 12.1 Health

Health records may include observations, diagnoses, clinician notes, third-party information, test results, care plans, safety restrictions, and legally/policy-restricted material.

The system must be able to distinguish:

- subject access rights;
- clinician authorship;
- custodian/controller duties;
- care-purpose access;
- restricted/segmented material;
- third-party confidentiality;
- temporary/legal restrictions;
- challenge/correction rights;
- emergency/break-glass authority;
- retention obligations;
- research/analytics contribution authority.

A clinician's note is an attributed clinical assertion/observation, not an immutable property of the patient.

Break-glass access must be a separately authorized, purpose-bound, time-bounded, evidenced path. Senior role alone is insufficient.

### 12.2 Justice and law enforcement

Justice systems require especially strict separation among:

- investigator;
- police service;
- prosecutor;
- defence;
- court;
- witness;
- complainant;
- accused;
- expert;
- records custodian;
- disclosure reviewer;
- adjudicator.

An investigative theory must not erase contrary evidence.

A future Justice domain should represent:

```text
observation
claim
hypothesis
supporting evidence
contradictory evidence
alternative explanation
missing evidence
investigative action
result
source/provenance
review state
disclosure state
challenge/correction
judicial ruling
```

A case brief is a derived narrative. It is not the evidence corpus itself.

#### Disclosure manifest

A disclosure package should be capable of producing a machine-verifiable manifest stating facts such as:

- known evidence object count;
- acquired/transferred object count;
- objects withheld/sealed and authority category, without exposing protected content;
- objects pending forensic processing;
- known-but-not-obtained objects;
- integrity verification state;
- indexing state;
- human review state;
- machine review state;
- proposition links;
- known contradictory/alternative links;
- disclosure timestamps;
- later/supplemental disclosure;
- unresolved gaps.

The manifest must not claim that material was substantively reviewed merely because it was available or transferred.

Machine review may assist completeness, contradiction discovery, chronology, provenance, and retrieval. It must not become an unreviewable guilt/innocence oracle.

### 12.3 Education

Education should preserve the existing exact-purpose, need-to-know model and class/context-local pseudonymity while adding:

- rights envelopes for learner records;
- explicit distinction among instructional observation, assessment evidence, official record, safeguarding material, social transcript, and derived analytics;
- contextual credential/reputation proofs;
- protected aggregate learning/resource statistics;
- challenge/correction pathways;
- prohibition on converting raw conversation/activity logs into universal learner scoring.

### 12.4 Work, employment, and payroll

The substrate should distinguish:

- employment identity;
- role/authority;
- payroll data;
- performance evidence;
- disciplinary claims;
- benefits/eligibility;
- professional credentials;
- tax/statutory records;
- workplace safety information;
- scheduling/attendance;
- compensation decisions.

Payroll authority does not imply performance-profile authority. Management authority does not imply universal access to health or unrelated personal records. A performance assertion should preserve source, evidence, challenge, review, and current/superseded state.

### 12.5 Governance and public institutions

Governance should compose plural authority structures while preserving:

- standing;
- representation;
- role;
- competence evidence;
- conflicts of interest;
- deliberation;
- dissent;
- decision authority;
- appeal;
- public transparency requirements;
- legitimate confidentiality/sealing;
- affected-party protections.

A governance result does not directly mint Sandbox authority. The affected execution domain evaluates the result under its own authority policy.

Transparency must be purpose-appropriate: public accountability does not imply publishing private personal records.

---

## 13. Human and machine surfaces

Every durable capability in this programme should follow the existing dual-surface doctrine.

### 13.1 Human surface

Plain-language concepts should include:

- Why can they see this?
- Why can't I see this?
- Who said this?
- What supports it?
- What contradicts it?
- Has anyone actually reviewed it?
- Was it used in a decision?
- Can I challenge or correct it?
- What did my agent approve for me?
- Why did this action require more scrutiny?
- What information was disclosed?
- What was deliberately withheld?
- What privacy protection was applied to this statistic?

### 13.2 Machine surface

Candidate neutral capability families:

```text
information.rights
information.access
information.disclosure
information.retention
information.challenge

evidence.assertion
evidence.observation
evidence.link
evidence.review
evidence.challenge
evidence.correction
evidence.adjudication

authority.mandate
authority.assurance
authority.escalation

disclosure.projection
disclosure.proof

reputation.evidence
reputation.query
reputation.presentation

privacy.contribution
privacy.aggregate
privacy.release
privacy.budget
privacy.receipt

institution.disclosure-manifest
```

These names are semantic placeholders for design review. Existing durable protocol identifiers must not be cosmetically renamed.

---

## 14. Proposed contracts

Initial versioned contracts should be considered in implementation planning:

```text
axiom-information-rights-envelope.v1
axiom-evidence-assertion.v1
axiom-evidence-link.v1
axiom-evidence-review-state.v1
axiom-evidence-challenge.v1
axiom-delegated-gate-mandate.v1
axiom-assurance-profile.v1
axiom-contextual-disclosure-request.v1
axiom-contextual-disclosure-result.v1
axiom-reputation-query.v1
axiom-privacy-contribution.v1
axiom-privacy-release.v1
axiom-privacy-receipt.v1
axiom-disclosure-manifest.v1
```

Contract names remain provisional until implementation planning verifies existing naming conventions and avoids duplicate concepts.

---

## 15. Architecture components

The programme should decompose into independently testable components.

### A. Information Rights Core

Pure schemas/validators for relationships, access classes, retention, challenge, and disclosure semantics.

No database-wide owner shortcut.

### B. Evidence Graph Core

Typed assertions, evidence links, contradictory evidence, alternative explanations, missing evidence, review states, challenge/correction/supersession, and decision-use relationships.

### C. Assurance and Delegation Core

Deterministic consequence-to-assurance evaluation plus bounded delegated gate mandates.

The evaluator never grants authority itself.

### D. Contextual Trust Projection

Minimum-sufficient disclosure/proof negotiation and domain-specific credential/reputation queries.

Initial implementation may use ordinary signed derived claims; advanced zero-knowledge/selective-disclosure mechanisms remain separately promoted.

### E. Privacy-Preserving Collective Intelligence

Privacy contribution contracts, release policy, compositional privacy ledger, and laboratory implementations of secure aggregation/differential privacy or other reviewed mechanisms.

This should begin in Lab with synthetic data and adversarial reconstruction tests.

### F. Institutional Adapters

Health, Education, Justice, Work/Payroll, Governance, and future domains map their legal/policy semantics to the common substrate without bypassing it.

### G. One / Verify / Studio surfaces

- **One:** personal controls, delegated authority, privacy/disclosure history, challenges, explanations.
- **Verify:** independent verification of receipts, evidence lineage, disclosure/projection claims, privacy receipts, and exact non-claims.
- **Studio/Lab:** compose and adversarially test institutional/privacy policies before promotion.

---

## 16. First executable slice

This programme is too broad to implement safely as one monolithic PR. The first executable slice should establish semantics without pretending the advanced cryptography or regulated-domain integrations are already solved.

### Slice 1 — semantic foundation

Implement only:

1. `InformationRightsEnvelope` pure schema + validator;
2. `EvidenceAssertion` + typed `EvidenceLink` pure schemas + validators;
3. `EvidenceReviewState` with explicit `available/indexed/machine-reviewed/human-reviewed/relied-upon/disclosed/challenged` distinctions;
4. `DelegatedGateMandate` pure schema + validator;
5. deterministic `AssuranceProfileEvaluator` that returns minimum safeguards/reasons but no authority;
6. pure contextual disclosure request/result schema with minimum-sufficient projection semantics;
7. negative tests proving identity, credential, reputation, role, risk, and review state do not automatically mint authority;
8. adversarial fixtures showing contradictory evidence and challenges cannot be silently dropped from a current evidence projection.

This slice should be zero-egress, zero-provider, zero-regulated-data, and zero-new-execution-authority.

### Slice 2 — governed Grid state

After Slice 1 semantics are independently reviewed:

- append-only storage for rights/evidence/challenge/mandate objects;
- transactional signed receipts;
- revocation/expiry;
- retrieval with exact authority checks;
- owner/institution views without metadata overexposure;
- export/import rules preserving relationship semantics.

### Slice 3 — contextual trust/reputation projection

- derived claims;
- exact-purpose verifier requests;
- contextual reputation evidence queries;
- privacy-minimized presentations;
- challenge/currentness semantics;
- no universal reputation score.

### Slice 4 — privacy collective-intelligence lab

- synthetic data only initially;
- privacy contribution contract;
- contribution clipping;
- minimum-cohort rules;
- privacy ledger;
- canonical query accounting;
- differential-privacy prototype(s);
- secure-aggregation or MPC prototype(s) as separate threat-modeled experiments;
- reconstruction and composition attacks;
- no production promotion.

### Slice 5 — domain pilots

Start with low-consequence/synthetic adapters before real regulated deployments.

Recommended order:

1. Education controlled synthetic/fixture integration, because an exact-purpose privacy boundary already exists;
2. Work/Payroll synthetic record semantics;
3. Health synthetic clinical-note/access fixtures;
4. Justice synthetic evidence/disclosure manifest;
5. Governance public/private deliberation fixtures.

Real deployments require separate legal, privacy, security, accessibility, operational, and independent-review gates.

---

## 17. Error and uncertainty handling

The substrate must represent uncertainty explicitly.

Examples:

- unknown authority basis;
- stale credential;
- contradictory evidence;
- unresolved subject identity;
- conflicting retention rules;
- incomplete disclosure manifest;
- unavailable evidence object;
- unverified source;
- privacy budget exhausted;
- insufficient cohort size;
- unable to determine whether a projection is minimum-sufficient;
- delegated mandate ambiguous or expired.

Unknown state should normally increase assurance requirements or return an explicit unresolved/escalation state. It must not be silently coerced into approval.

Where a non-waivable protection cannot be satisfied, denial is appropriate.

---

## 18. Adversarial and property-test programme

The implementation programme must test at least:

### Authority confusion

- credential presented -> no automatic authority;
- high reputation -> no automatic authority;
- institution admin role -> no unrelated record access;
- delegated agent -> no scope widening;
- inferred preference -> no mandate widening;
- governance decision -> no direct execution grant.

### Evidence/narrative integrity

- supporting evidence cannot delete contradictory evidence;
- case/clinical/workplace narrative cannot hide known incompatible evidence in an evidence-completeness query;
- original assertion remains traceable after correction;
- challenge cannot mutate original source bytes;
- `available` cannot be reported as `human-reviewed`;
- machine review cannot be reported as human review;
- signature cannot promote an assertion to truth.

### Privacy/correlation

- stable cross-domain IDs rejected in collective-analytics profiles;
- equivalent queries consume shared privacy accounting;
- sparse cohorts cannot be surfaced by differencing;
- receipts do not expose participant IDs;
- reputation presentations do not reveal unrelated domain history;
- timing/high-cardinality metadata minimization tests.

### Delegation and assurance

- high consequence can execute when authority and stronger assurance are satisfied;
- high consequence is not automatically denied;
- high consequence does not always require end-user interruption;
- required human confirmation cannot be bypassed by delegated agent;
- expired/revoked mandate fails closed;
- unknown consequence dimension selects stricter assurance;
- safeguards cannot widen underlying authority.

### Retention/access conflicts

- subject status alone does not grant unrestricted access;
- authorship alone does not grant unrestricted withholding;
- retention obligation does not create unrelated use authority;
- seal/unseal follows exact authority and leaves evidence;
- deletion request does not erase legally/policy-required retained history without an authorized transition.

---

## 19. Migration and compatibility

This design should extend existing primitives rather than fork them.

Reuse where possible:

- current identity/principal model;
- consent receipts;
- deny-dominant policy;
- machine constraints;
- Grid encrypted durable state;
- signed hash-linked evidence events;
- memory selective disclosure/export/deletion semantics;
- governance proposal/appeal patterns;
- causal sync;
- recovery/backup;
- capability registry and evidence binding;
- Axiom Education exact-purpose collaboration grants.

Do not create a second authority kernel for Health, Education, or Justice.

Existing `high-risk -> independent authenticated approval` language should be reviewed during implementation planning. The intended generalized doctrine is:

> **High-consequence actions require consequence-proportional assurance from appropriately authorized principals. Independent approval is one possible assurance requirement, not a universal substitute for domain policy or a mandatory end-user prompt.**

Any constitutional/requirements change must preserve current runnable guarantees until replacement semantics are implemented and verified. Documentation must not weaken executable protections ahead of code.

---

## 20. Research and standards direction

Implementation planning should evaluate, without prematurely committing the kernel to any one technology:

- W3C Verifiable Credentials / selective-disclosure profiles;
- privacy-preserving credential presentations;
- differential privacy accounting and release governance;
- secure aggregation;
- MPC/private-set mechanisms;
- confidential computing where appropriate;
- append-only/transparency evidence systems;
- provenance standards;
- domain-specific healthcare/education/justice records standards only through adapters;
- jurisdiction-specific legal requirements through reviewed policy packs rather than hard-coded universal rules.

Advanced cryptography must be threat-modeled and independently reviewed before production promotion.

---

## 21. Non-goals

This design does **not** establish:

- a global identity database;
- a global reputation score;
- a social-credit system;
- a universal risk score;
- automatic truth determination;
- AI adjudication of guilt, diagnosis, professional competence, or civic legitimacy;
- unrestricted institutional surveillance;
- a rule that subjects can always see every record about themselves;
- a rule that authors can always hide records from subjects;
- a universal legal policy across jurisdictions;
- production healthcare/justice/payroll/government compliance;
- production differential privacy or MPC merely by documenting them;
- mandatory human approval for every high-consequence effect;
- removal of all human oversight;
- central collection of all domain records.

---

## 22. Acceptance criteria for the architecture

The architecture is coherent only if the implementation programme can demonstrate all of the following:

1. The same agent can be subject, author, custodian, controller, reviewer, and challenger in different relationships without those relationships collapsing.
2. A principal can prove a relevant credential or reputation criterion without automatically receiving execution authority.
3. A high-consequence action can proceed under stronger safeguards when legitimately authorized.
4. A delegated personal agent can clear permitted gates without end-user interruption, while failing to clear gates outside its mandate.
5. Personalization data remains local/private unless a separately authorized projection is created.
6. A consequential claim preserves provenance, supporting evidence, contradictory evidence, uncertainty, challenges, and supersession.
7. An institution cannot report material as substantively reviewed merely because it possessed it.
8. Cross-domain aggregate knowledge can be computed without requiring a universal cross-domain person identifier.
9. Privacy receipts are auditable without exposing participant identities.
10. Reputation remains contextual and evidence-backed rather than becoming a universal scalar identity.
11. Domain adapters can impose stronger protections without weakening non-waivable substrate protections.
12. Every promoted capability binds to runnable tests and exact non-claims.

---

## 23. Governing summary

The resulting AXIOM architecture should preserve these distinctions:

```text
identity != authority
credential != authority
reputation != authority
risk != prohibition
risk != identity
provenance != truth
recorded != established
available != reviewed
disclosed != understood
subject != universal owner
author != universal controller
institutional power != ambient access
personalization != external entitlement
consent to contribute != safe statistical release
high assurance != mandatory human interruption
collective knowledge != collective dossier
```

And it should optimize for:

> **maximum practical agency and freedom compatible with the rights of other agents, legitimate institutional purposes, privacy against realistic correlation attacks, evidence-preserving truth-seeking, consequence-proportional assurance, contestability, reversibility, and sustainable use of shared resources.**

This is a substrate, not a claim that one software system can define the correct form of every society or institution. Its role is to make authority explicit, information use purpose-bound, privacy technically defensible, evidence inspectable, disagreement preservable, and institutional actions harder to make unaccountable.