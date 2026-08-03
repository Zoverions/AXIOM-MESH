# Plural Authority Architecture Review — 2026-08-03

**Review type:** architecture, security boundary, claims, roadmap, and future-compatibility review

**Scope:** adaptive assurance, retrospective reassessment, Circles, institutions, jurisdictions, sovereign domains, treaty interoperability, governance-pattern exchange, comparative evidence, and collective finality

**Reviewed against:** current `0.12.0-dev.3` product definition, roadmap, capability registry, mandatory authority path, current non-claims, and known capability-evidence binding gap

## Executive finding

The proposed direction is compatible with the current AXIOM-MESH architecture if it is introduced as a set of future policy, evidence, identity, governance, and interoperability layers rather than as a bypass around the kernel.

The design is strongest when it preserves four separations:

1. authority is not assurance;
2. assurance is not truth;
3. finality is not irreversibility;
4. technical authorization is not legal or political legitimacy.

The architecture should be accepted as a long-horizon design constraint and roadmap extension. It should not yet be added to the runnable capability registry because no exact schema, tests, threat model, or implementation evidence exists for these new capabilities.

## Decision

**Accepted for planning and compatibility. Not promoted as implemented, experimental runtime, or supported product.**

The following documents are added by this review package:

- `docs/rebuild/ADAPTIVE-ASSURANCE-AND-PLURAL-AUTHORITY.md`;
- `docs/ROADMAP-EXTENSION-PLURAL-AUTHORITY.md`;
- `docs/rebuild/LONG-HORIZON-CAPABILITY-MAP.md`;
- `docs/MASTER-TODO-PLURAL-AUTHORITY.md`;
- this review.

The current machine-readable registry remains unchanged and authoritative.

## Compatibility with current foundations

### Compatible foundations

The future architecture can build on existing or already planned foundations:

- authenticated intent, policy, grant, execution, and evidence path;
- deny-dominant layered policy;
- independent approval for high-risk effects;
- append-only evidence and correction-without-replacement;
- consent receipts;
- local governance records, timelocks, emergency expiry, rollback metadata, and appeals;
- portable signed exports and provenance-preserving imports;
- admitted-node records and causal exchange;
- independent verification and evidence-package direction;
- product-state separation between built, enabled, exposed, promoted, and marketed;
- AXIOM Circles as invitation-based governed collaboration among independently owned nodes.

### Required future extensions

The current runtime does not yet represent:

- explicit required and achieved assurance levels;
- provisional versus collectively finalized results;
- retrospective verification as a dedicated linked record;
- Circle charters or multi-node governance;
- portable delegation chains;
- institutional offices, terms, succession, and duties;
- jurisdictional or constitutional authority graphs;
- sovereign trust roots or treaty recognition;
- governance-pattern simulation and adoption;
- public-law rights, due process, remedies, or coercive authority;
- distributed consensus or shared finality.

## Load-bearing architectural decision

Adaptive assurance must vary **evidence obligations**, not **authorization obligations**.

An unsafe interpretation would introduce a fast lane that skips policy, consent, grants, or evidence commitment. The accepted interpretation retains the mandatory authority path and permits lower-cost receipts, provisional status, asynchronous verification, batching, sampling, or reversible execution where policy permits.

## Review of the assurance ladder

The proposed A0–A4 ladder is suitable as a planning model, subject to later renaming and formalization.

### Strengths

- makes cost proportional to consequence;
- avoids forcing consensus or independent verification onto trivial actions;
- gives high-consequence domains a clear escalation path;
- creates a place for provisional and challengeable results;
- can reduce evidence volume through batching and retention policy;
- supports human-readable certainty and limitation explanations.

### Risks

- silent downgrade when an adapter cannot satisfy the requested level;
- operators labelling consequential activity as low risk;
- users mistaking authentication for correctness;
- later reviewers treating corroboration as proof of original execution;
- storage minimization deleting evidence needed for remedy;
- different nodes using incompatible assurance semantics;
- an assurance label becoming a reputation or social-credit score.

### Required controls

- the achieved level must never exceed the actual evidence;
- failed or partial assurance must be explicit;
- the kernel and domain floors must be deny-dominant;
- adapters must declare supported assurance profiles;
- evidence retention must be policy-derived and visible;
- assurance is attached to an event or claim, not globally to a person;
- exports and imports must preserve original assurance and limitations;
- retrospective review must create a new record.

## Review of Circles

Circles remain an appropriate product concept for primarily voluntary or contractual groups.

They should support:

- invitation and membership;
- explicit roles and terms;
- versioned charters;
- shared proposals, tasks, commitments, approvals, and evidence;
- member-owned nodes and records;
- selective disclosure;
- revocation, withdrawal, export, appeal, and continuity;
- Circle policy that may raise but not lower non-waivable requirements.

A Circle should not be used as the only model for institutions or states because it would blur voluntary association, organizational duty, territorial jurisdiction, public law, and coercive authority.

## Review of institutional domains

A distinct institutional layer is justified.

Institutions require concepts that ordinary Circles may not:

- offices rather than only roles;
- term, vacancy, acting appointment, and succession;
- fiduciary, employment, professional, or statutory duty;
- regulated records and retention;
- separation of duties and independent oversight;
- legal hold and disclosure;
- institutional continuity despite member departure;
- emergency and incident authority.

These features should remain outside the trusted zero-dependency kernel where possible, but their authority must be enforced through the kernel path.

## Review of sovereign domains

Supporting nation-state adoption is architecturally plausible but carries qualitatively different risks.

### Valid objective

A sovereign deployment may need to map its existing constitution, institutions, offices, laws, courts, agencies, and procedures while retaining national operational and cryptographic control.

AXIOM-MESH should enable constitutional mapping, not constitutional replacement.

### Critical non-claim

The mesh cannot infer legitimacy from a syntactically valid authority graph. A technically valid order may be unlawful, unconstitutional, fraudulent, authoritarian, or rights-violating.

### Required design separation

The system must distinguish:

- asserted authority;
- procedurally verified authority;
- legal validity as determined by an appropriate institution;
- factual truth;
- moral or democratic legitimacy.

### High-risk surfaces

- population surveillance;
- national identity correlation;
- automated benefits or service denial;
- political scoring;
- predictive policing;
- emergency-power abuse;
- selective public-record erasure;
- state capture of personal nodes;
- cross-border data coercion;
- central operator control over trust anchors and software updates.

These surfaces require separate programmes, independent review, and public governance. They are not ordinary product features.

## Review of treaty interoperability

The sovereignty-preserving model is sound if recognition is explicit, purpose-bound, non-transitive, revocable, and independently verifiable.

Treaty profiles should define:

- parties and trust anchors;
- recognized credential or evidence types;
- exact purpose and scope;
- data location and disclosure restrictions;
- assurance requirements;
- amendment, reservation, expiry, and withdrawal;
- disputes and remedies;
- migration and termination behavior.

The system should not require a universal global root, token, ledger, or governance body.

## Review of governance-pattern exchange

The ability to observe and adapt governance mechanisms is strategically valuable and can begin safely as inert documentation and simulation.

The critical rule is:

> **A governance pattern may be portable; its authority is not.**

A receiving domain must authorize an adapted pattern through its own charter, constitutional, legal, or organizational procedure.

Comparative tools must expose methodology, missingness, uncertainty, incentives, and value choices. A single composite governance score would be vulnerable to gaming and ideological capture.

## Review of collective finality

Collective finality and consensus should remain separate from causal synchronization.

The current system correctly avoids claiming BFT consensus. Future consensus research should begin by identifying which records require a common final state. Many personal, Circle, and institutional records can remain causally ordered with visible conflict.

Consensus must not become an automatic justification for:

- tokens;
- staking;
- public settlement;
- irreversible decisions;
- removal of human appeal;
- replacement of constitutional authority.

## Documentation consistency finding

The existing current-build documents already contain the necessary protective concepts:

- mandatory authority path;
- narrow claims;
- Circles as independently owned collaboration;
- frontier isolation;
- capability lifecycle separation;
- explicit non-claims for consensus, settlement, national infrastructure, and public federation.

The new package extends rather than contradicts those concepts.

The registry is deliberately unchanged because adding future capability records without exact schemas, acceptance tests, and evidence would weaken the registry's meaning. When any item moves from planning into specification, the registry and every digest-bearing document must change together.

## Known open gap carried into this programme

The current capability registry validation checks evidence-array presence more strongly than capability-specific assertion binding. The plural-authority programme must not multiply capability claims before that gap is closed.

Before any new implemented governance or assurance capability is added:

- each capability ID must bind to named executable assertions;
- evidence paths must exist and be executable where applicable;
- tests must prove both positive and negative behavior for that capability;
- shared test files must identify which assertions support which capability;
- release verification must reject missing or stale bindings.

## Required threat-model additions when implementation begins

The current threat model must be extended for:

- assurance downgrade and mislabelling;
- provisional-result laundering;
- retrospective evidence forgery;
- charter or constitution substitution;
- delegation-chain forgery and privilege inheritance;
- office succession capture;
- quorum manipulation and Sybil membership;
- coercive consent and involuntary membership;
- discriminatory policy automation;
- metric gaming and governance-pattern supply-chain attacks;
- trust-anchor capture;
- treaty confusion and unintended transitive trust;
- censorship, equivocation, and finality capture;
- state-scale correlation and surveillance;
- operator collusion across identity, policy, execution, and evidence layers.

## Promotion order recommendation

1. close capability-evidence binding;
2. complete authentic current-kernel pilot and security review;
3. finish human plans, approvals, receipts, memory lifecycle, and AXIOM Verify;
4. specify assurance and retrospective reassessment;
5. implement bounded Circle membership, charter, delegation, appeal, and sharing;
6. pilot one low-risk Circle;
7. add institutional offices, oversight, succession, and records in laboratories;
8. mature multi-host authority and independent verification;
9. begin jurisdictional and sovereign simulations with synthetic or historical data;
10. research treaty recognition and collective finality only after the underlying authority model is stable.

## Final assessment

The proposed direction strengthens rather than dilutes AXIOM-MESH's central thesis: authority should be explicit, execution bounded, evidence portable, uncertainty visible, and claims truthful.

The long-range vision is acceptable provided development continues in small, evidence-gated pieces and sovereign ambition never becomes an excuse to weaken personal control, due process, independent verification, or current claim discipline.
