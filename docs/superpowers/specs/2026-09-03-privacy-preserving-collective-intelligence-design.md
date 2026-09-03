# Privacy-Preserving Collective Intelligence — Design

Status: proposed architecture, design-only

Programme: #1482

Related foundations: #1001, #997, #999, current telemetry privacy rules, sovereign-vault/context architecture, plural-authority work, and current privacy/correlation threat-model surfaces.

## 1. Decision

AXIOM should support population, institutional, research, governance, education, health, and other collective analytics without creating a reusable row-level population database from private domain state.

The baseline architecture is:

> **local bounded computation + unlinkable contribution + secure aggregation/joint computation + statistical release control + cumulative privacy accounting**.

The design rejects two weaker defaults:

1. ordinary anonymization/pseudonymization as the principal privacy guarantee; and
2. a central raw-record analytics warehouse protected only at its output boundary.

De-identification, bucketing, suppression, pseudonyms, and redaction remain useful defenses in depth. They do not replace a formal release boundary designed against linkage and repeated-release attacks.

Three constitutional invariants guide the subsystem:

> **Individual data may inform collective knowledge without creating a collective database from which the individual can be reconstructed.**

> **Cross-domain knowledge is allowed. Cross-domain dossiers are not.**

> **Privacy must hold against correlation, not merely disclosure.**

This subsystem is domain-neutral. Health, Education, Governance, Circles, institutions, research applications, and future domains should consume the same privacy primitives rather than each inventing their own anonymization rules.

## 2. Why this is a shared Mesh concern

AXIOM already has useful privacy foundations:

- encrypted local-first durable state;
- exact-purpose consent and scoped authority;
- minimum disclosure and selective projection;
- deny-egress/service-isolation boundaries;
- privacy-minimized operational telemetry;
- pseudonymous/selectively attributable public identities;
- correlation-aware identity and social threat modeling;
- sovereign-vault/context rules that separate access from authority;
- #1001's explicit requirement for privacy-preserving contribution.

Those controls protect private state and individual disclosures. They do not by themselves solve cumulative population analytics.

A societal analytics plane introduces a different risk: individually reasonable releases can become identifying when combined across time, domains, geography, cohorts, external public records, commercial datasets, or an adversary's auxiliary knowledge.

The architectural mistake to avoid is therefore:

```text
private domain records
  -> remove obvious identifiers
  -> store a giant anonymized population table
  -> run arbitrary analysis later
```

That structure creates a long-lived correlation asset. Even if every row is name-free, stable quasi-identifiers, rare combinations, longitudinal sequences, and cross-domain overlap can make individuals reconstructable.

AXIOM should instead make the statistical question—not the row—the normal unit that crosses from private domains into collective knowledge.

## 3. Threat model

Assume a capable adversary may possess:

- years of AXIOM aggregate outputs;
- public records;
- commercial datasets;
- leaked or purchased auxiliary datasets;
- knowledge about one or more target individuals;
- the ability to issue or influence repeated queries where policy permits;
- substantial compute;
- some compromised or adversarial participant nodes;
- timing/network metadata;
- access to published receipts/audit evidence.

The privacy target is not merely protection against an honest dashboard user. It is resistance to correlation and reconstruction by an adversary who combines many individually lawful observations.

Required attack classes include:

### 3.1 Direct and quasi-identifier linkage

- names removed but age/geography/date/rare condition identify a subject;
- hashed identifiers reused as stable join keys;
- purpose-local pseudonyms reused outside their intended context.

### 3.2 Differencing and reconstruction

- query cohort A;
- query nearly identical cohort B;
- subtract results to infer the excluded subject/small group.

### 3.3 Longitudinal fingerprinting

A unique pattern of appointments, attendance, events, locations, or participation becomes a durable fingerprint even when no release contains a name.

### 3.4 Sparse and rare-condition leakage

Small populations, rare diagnoses, unusual interventions, small schools, narrow age bands, or fine geographic/time slices make otherwise aggregate results effectively identifying.

### 3.5 Membership and attribute inference

Determine whether a person is represented in an underlying dataset or infer a sensitive attribute from aggregate releases plus external knowledge.

### 3.6 Query composition

Many individually acceptable releases collectively disclose too much. Privacy accounting must therefore be cumulative and query-family aware.

### 3.7 Sybil/isolation attacks

An adversary contributes or controls enough participants to isolate a target's secure-aggregation contribution or manipulate cohort structure.

### 3.8 Timing and metadata correlation

Contribution timing, node identity, packet size, retry behavior, or receipt creation can identify participation even if the contribution payload is cryptographically protected.

### 3.9 Audit/receipt correlation

An evidentiary system can accidentally become a secondary identifying database if receipts enumerate people, stable contribution IDs, or fine-grained subject-linked events.

### 3.10 Federated/model leakage

Raw data staying local is not by itself a privacy guarantee. Gradients, model updates, embeddings, representations, evaluation traces, or repeated model outputs can leak participant information.

## 4. Architectural choices considered

### Option A — conventional de-identification as the primary boundary

Techniques:

- remove names;
- hash identifiers;
- generalize age/location;
- suppress rare cells;
- apply minimum cohort sizes.

Advantages:

- simple;
- inexpensive;
- easy to operate;
- useful as defense in depth.

Disadvantages:

- weak against auxiliary information;
- poor longitudinal resistance;
- encourages durable row-level datasets;
- stable pseudonyms become correlation keys;
- offers no principled repeated-release accounting.

Decision: **not acceptable as the principal AXIOM societal-analytics privacy boundary**.

### Option B — central raw-data service with differential privacy only at release

Advantages:

- central privacy budget is easier to account for;
- mathematically bounded release mechanisms can be applied consistently;
- operationally simpler than distributed secure computation.

Disadvantages:

- centralizes exactly the sensitive cross-domain records AXIOM otherwise tries to keep local/sovereign;
- creates a high-value breach/insider target;
- expands the trusted computing base;
- makes cross-domain joins technically easy even when policy says they should be rare.

Decision: useful for limited deployments only when a domain explicitly accepts that trust model; **not the architectural default**.

### Option C — local computation + unlinkability + secure aggregation/joint compute + differential privacy

Advantages:

- raw personal records remain in sovereign domains;
- no ordinary central row-level corpus is required;
- secure aggregation protects individual contributions from the collector;
- differential privacy protects what can be inferred from released aggregates;
- the privacy ledger can account for repeated releases;
- stronger joint-compute methods can be selected only where consequence warrants them.

Costs:

- more complex protocols;
- distributed failure modes;
- Sybil/availability concerns;
- privacy accounting remains nontrivial across related queries/datasets;
- cryptographic protocol choice must be consequence-sensitive.

Decision: **recommended baseline**.

## 5. System boundary

The subsystem is called **Privacy-Preserving Collective Intelligence** as a programme name. Durable protocol identifiers should remain neutral and versioned.

Conceptual flow:

```text
Health / Education / Governance / other private domain state
  |
  v
local contribution computation
  |
  v
purpose + authority + consent evaluation
  |
  v
contribution bounds / clipping / sensitivity
  |
  v
unlinkability boundary
  |
  v
secure aggregation or reviewed joint computation
  |
  v
statistical release gateway
  |
  +--> suppression / generalization
  +--> differential-privacy mechanism where applicable
  +--> query canonicalization / reconstruction defense
  |
  v
privacy ledger / cumulative budget accounting
  |
  v
release-risk decision
  |
  v
societal statistic + privacy receipt
```

There is deliberately no normal intermediate state containing a persistent row for each participating individual.

## 6. Core primitive P0 — Privacy Contribution Contract

The contribution contract defines the maximum information a private node/domain may provide toward a collective computation.

Candidate semantic fields:

- `contract_id` / schema version;
- exact `purpose` and purpose category;
- metric/query-family digest;
- population definition;
- domain/source class;
- authorized contribution type;
- contribution frequency/window;
- contribution clipping/bounds;
- sensitivity classification;
- minimum cohort rule;
- retention/expiry;
- contribution currentness requirements;
- allowed aggregation/joint-compute profiles;
- allowed release profiles;
- authority/consent evidence references;
- revocation/correction behavior;
- explicit `authority_effect: none`.

Properties:

1. a broad `share analytics` permission is insufficient;
2. a contract may authorize contribution but not publication;
3. unknown/unsupported contribution classes fail closed;
4. contribution limits are machine-enforced, not advisory prose;
5. one participant cannot arbitrarily increase sensitivity by sending an unbounded value;
6. contract digests bind the exact privacy semantics used in downstream receipts.

## 7. Core primitive P1 — Unlinkable Contribution Layer

The system should not create one analytics identity for a human and then rely on secrecy around that identifier.

Required properties:

- no reusable population-wide analytics `person_id`;
- domain-separated cryptographic namespaces;
- purpose-separated contribution identifiers;
- short-lived/ephemeral contribution tokens where possible;
- context-local pseudonyms cannot be promoted into general analytics join keys;
- cross-domain linkage cannot occur merely by comparing pseudonym values;
- raw principal IDs stay outside societal outputs and normal aggregation state;
- contribution authentication proves only what is needed to admit a bounded contribution.

A class-local Education pseudonym may remain useful for classroom interaction. It must not become the learner's longitudinal cross-domain analytics identity.

Unlinkability is not absolute anonymity. Timing, network, content, rare values, or external behavior can still correlate a contributor. That is why unlinkability must compose with aggregation and statistical release control.

## 8. Core primitive P2 — Secure Aggregation / Joint Compute Fabric

The normal collector should learn an aggregate, not each participant's contribution.

The exact cryptographic mechanism is profile-dependent.

Candidate families include:

- secure aggregation;
- multi-party computation;
- private-set / private intersection techniques;
- zero-knowledge predicates where mature profiles genuinely fit;
- confidential-compute/TEE-assisted protocols where separately trusted;
- homomorphic techniques for selected workloads where cost is justified.

Rules:

1. protocol choice does not grant new data authority;
2. stronger cryptography is selected by privacy/consequence need, not marketing preference;
3. an MPC/FHE/TEE result is evidence about a computation, not automatic truth about its inputs;
4. secure aggregation does not eliminate output inference risk; release control still applies;
5. protocol metadata and participant membership must be minimized;
6. Sybil/threshold/participant-dropout behavior must be explicit and tested;
7. no cryptographic mechanism may silently create a stable cross-domain subject handle.

The first implementation should not attempt a universal MPC framework. Start with inert contracts and a narrow secure-aggregation laboratory after the privacy accounting model is stable.

## 9. Core primitive P3 — Statistical Release Gateway

Release safety is a separate decision from contribution authority.

The release gateway evaluates whether a proposed statistic can leave the collective analytics plane.

Candidate controls:

- differential privacy mechanism/version where applicable;
- contribution sensitivity bounds;
- minimum cohort threshold;
- rare-cell suppression;
- age/time/geography generalization;
- query canonicalization;
- related-query/differencing detection;
- cumulative privacy budget checks;
- release cadence limits;
- high-sensitivity domain profiles;
- uncertainty/error disclosure;
- explicit denial when the safe release conditions cannot be met.

### 9.1 Differential privacy

Differential privacy should be treated as a formal privacy mechanism with explicit parameters and composition semantics, not a label.

A release that claims DP must identify:

- mechanism/profile;
- parameterization (for example epsilon/delta where applicable);
- sensitivity/contribution bounds;
- composition/accounting method;
- implementation version;
- randomness requirements;
- query/population family to which the guarantee applies.

The architecture must not define one global epsilon as universally safe. Appropriate privacy/utility trade-offs are domain-, population-, consequence-, and legal-context dependent.

### 9.2 Suppression/generalization

Suppression and generalization remain necessary even when DP exists, especially for operational UX, extremely sparse populations, non-DP releases, and metadata minimization.

They are supporting controls, not substitutes for cumulative privacy accounting.

### 9.3 Release safety cannot be waived by consent alone

Even if all contributors authorize participation, a release can still create risks to contributors, third parties, or future subjects. Therefore contribution authorization and release safety are independent gates.

## 10. Core primitive P4 — Privacy Ledger & Receipt

AXIOM should be able to prove how a statistic was produced without proving who contributed.

### 10.1 Ledger goals

The privacy ledger tracks information expenditure and related-query history needed to enforce release policy.

It must support:

- query-family canonicalization;
- budget/accounting state;
- cumulative release history;
- mechanism/version history;
- policy/currentness state;
- denial reasons;
- correction/supersession;
- domain/profile scoping.

The ledger must not become a subject-membership ledger.

### 10.2 Privacy receipt

Candidate receipt fields:

- receipt/schema version;
- metric/query definition digest;
- purpose;
- bounded population description;
- domains involved;
- contribution-contract digest(s);
- contribution-bound summary;
- minimum cohort/suppression policy;
- statistical mechanism/version;
- formal privacy parameters or named guarantee where applicable;
- privacy budget consumed;
- cumulative budget/accounting state digest;
- aggregation/joint-compute protocol profile;
- result digest;
- release timestamp/window;
- retention class;
- policy version/currentness;
- independent review/approval evidence when required;
- explicit `participant_identifiers_included: false`;
- explicit `authority_effect: none`.

The receipt proves process/evidence claims only. It does not prove that a statistic is socially meaningful, causally correct, legally sufficient, or authorized for a different purpose.

## 11. Cross-domain analytics wall

Cross-domain private data is where the strongest correlation risk appears.

Example:

Health may know age band, area, condition, and appointment date.
Education may know school, grade, and attendance.
Governance may know district and programme participation.

Each domain could be individually well minimized. Their row-level intersection may identify people easily.

Therefore:

> **ordinary row-level cross-domain joins are prohibited in the societal analytics plane.**

No generic shared analytics identifier should exist for this purpose.

A question such as:

> Is a health condition associated with school absence?

should compile to a bounded joint statistical computation under a declared privacy profile—not a reusable joined table.

Possible implementation profiles include:

- secure aggregation over locally computed cohort contributions;
- MPC;
- private-set techniques;
- other specifically reviewed computation.

Only the privacy-protected statistical result and non-identifying evidence should emerge.

If a legitimate workflow truly requires subject-level cross-domain linkage—for example an individually authorized care coordination case—that is a different product/authority path and must not be represented as societal analytics.

## 12. Consent, authority, legality, and release safety

These are separate facts:

- legal/policy authority may require or permit a contribution;
- an individual may consent/assent to a purpose;
- a node/domain may have authority to compute a bounded contribution;
- the release may still be statistically unsafe;
- the release may be statistically safe but legally/policy prohibited for another reason.

A release occurs only when all applicable gates pass.

Lower layers may tighten privacy; they may not silently widen the authority or purpose declared above them.

## 13. Evidence and currentness

Privacy-sensitive decisions require exact current evidence.

At minimum, a release decision should bind:

- current contribution contracts;
- current population/query definition;
- current statistical release policy;
- current privacy-ledger state;
- current aggregation protocol profile;
- mechanism implementation/version;
- exact result/query digest;
- any required independent review.

Stale or mismatched privacy/accounting evidence fails closed.

A historical receipt remains evidence of a prior release. It does not authorize repeating the release under a fresh policy or reset the cumulative budget.

## 14. Adversarial acceptance suite

Before any production promotion, tests must cover at least:

1. stable hashed principal ID rejected as a societal analytics join key;
2. Education pseudonym cannot be reused as Health/Governance analytics identity;
3. row-level export from a private domain cannot enter societal analytics via a generic contribution contract;
4. over-bound contribution is clipped/rejected as defined by policy;
5. rare/small cohort release denied or generalized;
6. differencing queries consume shared accounting and cannot bypass policy through cosmetic query changes;
7. privacy budget does not reset because a dashboard, metric alias, day, or service changes;
8. stale policy/accounting evidence fails closed;
9. Sybil/threshold manipulation is detected or produces a safe denial according to protocol profile;
10. contribution timing/receipt format does not unnecessarily expose participant identity;
11. privacy receipt contains no participant enumeration or stable contribution handle;
12. cross-domain joint statistic cannot materialize a reusable subject-level joined table;
13. a malicious aggregator cannot read individual contributions in the secure-aggregation profile being claimed;
14. a model/federated update is not classified as anonymous merely because raw training data stayed local;
15. consent/authority cannot bypass release-safety denial;
16. strong privacy evidence cannot mint ordinary execution/data authority;
17. correction/supersession preserves historical privacy-accounting lineage;
18. an estimated/simulated privacy claim cannot be represented as independently verified production evidence.

## 15. Relationship to existing AXIOM work

### #1001 — association contribution obligations

#1001 remains the authority/obligation layer describing why a contribution may be required or allowed. This design provides the shared privacy machinery that such obligations can reference.

### #997 — actor state

Actor-owned private state remains canonical. Collective analytics receives bounded contribution output, not ambient actor-state access.

### #999 — personas/pseudonyms

Public or context-local pseudonyms retain their intended use. They are explicitly not promoted into population analytics identifiers.

### Telemetry

Operational telemetry remains a separate observability system with its current minimization rules. The new privacy ledger must not absorb raw telemetry identifiers merely for convenience.

### Sovereign vaults/context broker

A context lease may allow a local private join for an authorized individual workflow. That does not imply permission to persist or export a cross-domain population dossier.

### Plural authority/governance

High-consequence release policies may require independent or plural review. Governance decisions remain inputs to local authorization and cannot directly mint data-plane capability.

### Deployment/capability engine

Privacy mechanisms may eventually appear as provider/capability requirements, but discovery/qualification does not grant data access or release authority.

## 16. Data retention and deletion

The system should minimize retained collective state.

Prefer retaining:

- aggregate/statistical result;
- privacy receipt;
- budget/accounting state;
- cryptographic/protocol evidence necessary to verify the claimed process;
- narrowly necessary operational state.

Avoid retaining:

- raw private source records;
- stable per-person contribution history;
- participant membership lists unless a protocol has a separately justified transient requirement;
- reusable cross-domain join artifacts.

Where transient protocol membership is technically necessary, retention and disclosure must be separately bounded and must not become the privacy receipt.

## 17. Failure behavior

The privacy path is fail closed.

Deny release when:

- contribution contract is missing/stale/mismatched;
- privacy-accounting state is unavailable;
- cohort rule is not satisfied;
- mechanism/profile is unsupported;
- query cannot be safely canonicalized/accounted;
- cross-domain computation would require an unauthorized row-level join;
- required aggregation evidence is incomplete;
- privacy receipt cannot be produced consistently;
- applicable independent review/currentness evidence is absent.

Availability pressure is not a reason to silently downgrade privacy.

A degraded mode may offer a coarser or delayed statistic only when that alternative is explicitly predeclared and itself passes privacy policy.

## 18. Initial implementation decomposition

Implementation should be deliberately staged.

### Slice A — inert contribution/release contracts

Define versioned, non-authorizing contracts and deterministic validators for:

- privacy contribution;
- privacy release policy;
- query/population family identity;
- privacy receipt.

No runtime route or external aggregation.

### Slice B — privacy accounting laboratory

Implement local deterministic accounting for:

- query-family canonicalization;
- cumulative budget state;
- repeated-release composition;
- denial reasons;
- append-only receipt lineage.

No claim of production DP correctness until independently reviewed against a named accounting model.

### Slice C — adversarial reconstruction corpus

Add fixtures for stable identifiers, differencing, sparse cohorts, query relabeling, longitudinal linkage, cross-domain joins, audit correlation, and budget reset attacks.

### Slice D — secure aggregation laboratory

Implement one narrow, isolated secure-aggregation profile using synthetic/private test data. Demonstrate that the collector cannot inspect individual admitted contributions under the claimed threat model.

No Gateway/runtime exposure.

### Slice E — statistical release mechanism laboratory

Add one explicit DP/suppression/generalization profile with named parameters and test-only/synthetic workloads. Keep mechanism/provider abstraction narrow.

### Slice F — first domain consumer

Prefer Education or a purely synthetic cross-domain simulation because both can exercise cohorts/pseudonyms without immediately making a production health-data claim.

Health and public-governance integrations remain separately reviewed later gates.

## 19. Promotion gates

No production collective-analytics claim until at minimum:

1. versioned contract/schema review;
2. deterministic validation and semantic digest tests;
3. reconstruction/adversarial suite green;
4. privacy-accounting composition independently reviewed;
5. mechanism implementation reviewed against its claimed guarantee;
6. secure-aggregation/joint-compute threat model and dropout/Sybil behavior tested where used;
7. no raw-record or reusable stable-ID path into societal analytics;
8. receipt/audit anti-correlation review;
9. backup/recovery/retention semantics proven not to reintroduce participant dossiers;
10. exact current policy/evidence binding;
11. domain-specific legal/ethical review where applicable;
12. truthful capability registry/non-claims update;
13. full required repository verification at exact head.

## 20. Non-claims

This design does not claim:

- that AXIOM currently implements differential privacy;
- that one privacy parameter is universally correct;
- production secure aggregation, MPC, PSI, FHE, or TEE privacy;
- anonymous national-scale analytics;
- immunity to all re-identification;
- safe production federated learning;
- legal sufficiency in any jurisdiction;
- that cryptographic privacy makes a statistic true, unbiased, causal, or fair;
- that consent alone makes a release safe;
- that a privacy receipt grants authority;
- that Health/Education/Governance data may be centralized.

## 21. External technical rationale

This architecture is consistent with modern privacy-engineering guidance that treats de-identification as vulnerable to re-identification and auxiliary-information attacks, treats differential privacy as a formal way to bound information leakage across repeated releases, and combines privacy-enhancing cryptography with statistical privacy where multiple private datasets participate.

Relevant background includes:

- NIST guidance on evaluating differential-privacy guarantees;
- NIST guidance on de-identifying government datasets and re-identification risk;
- NIST discussion of privacy-enhancing cryptography as complementary to differential privacy;
- secure-aggregation research for privacy-preserving distributed/federated computation;
- confidential federated-computation research emphasizing that federated placement alone is not a privacy guarantee.

These references inform the threat model and mechanism choices. AXIOM's eventual implementation must still prove its own exact guarantees rather than inheriting them by citation.

## 22. Decision summary

AXIOM should not build a better anonymized citizen warehouse.

It should build a boundary where private data can contribute to collective knowledge while the normal architecture makes persistent individual reconstruction difficult by construction:

```text
private records stay private
  -> bounded local contribution
  -> unlinkability
  -> aggregate/joint computation
  -> formal/statistical release protection
  -> cumulative privacy accounting
  -> non-identifying evidence receipt
```

The principal success criterion is not simply "no names in the output." It is that the system remains intentionally resistant to correlation across domains, releases, time, metadata, and auxiliary information.