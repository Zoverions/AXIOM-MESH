# Discovery & Challenge Fabric v0 — Design

**Status:** approved architectural extension for an inert, zero-authority first slice

**Date:** 2026-08-31

**Scope:** a permanent, provenance-aware research and blindspot-discovery substrate that can describe external findings, map them to current AXIOM assumptions and components, and propose bounded architecture consequences without network ingestion, model invocation, credential use, issue/PR mutation, runtime activation, capability promotion, or authority widening

**Builds on:**

- `AGENTS.md`
- `docs/rebuild/REQUIREMENTS.md`
- `docs/PROJECT-STATUS-2026.md`
- `docs/architecture/AGENT-COMMONS.md`
- `docs/architecture/SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md`
- `docs/architecture/RUNTIME-AND-CONNECTOR-FABRIC.md`
- `docs/architecture/contracts/agent-feedback.v1.schema.json`
- `docs/architecture/contracts/agent-challenge.v1.schema.json`
- `mesh/config/capabilities.json`

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative for runnable capability state. Discovery & Challenge Fabric v0 is descriptive, comparative, and proposal-generating only. It does not ingest the network autonomously, authorize or execute tools, mutate Grid state, write memory, create issues or pull requests, change requirements, promote capabilities, assign trust, adjudicate truth, or grant any agent additional authority.

> **Discovery is not truth. Evidence is not authority. Novelty is not priority. A proposal is not a requirement.**

## 1. Problem

AXIOM-MESH is now broad enough that architectural blindspots can arise from many places outside the project's current ontology:

- newly published papers;
- security incidents and postmortems;
- standards revisions;
- provider or model-system changes;
- protocol composition failures;
- human-factors research;
- adjacent disciplines with mature solutions to analogous problems;
- expert technical conversations that surface a useful hypothesis before formal publication;
- open-source implementations exposing practical constraints;
- contradictory or negative evidence against current assumptions.

A normal research feed is insufficient. It tells an operator that something new exists, but does not answer the architectural question:

> **What, if anything, should this change in AXIOM-MESH?**

AXIOM therefore needs a permanent discovery-and-challenge substrate whose primary task is not to summarize the world, but to identify potential architecture deltas while preserving the project's existing evidence and authority boundaries.

The first slice must be intentionally inert. It establishes contracts and deterministic semantics before any future watcher, crawler, model, or connector can feed it automatically.

## 2. Core decision

Discovery & Challenge Fabric v0 consists of five separately versioned descriptive objects:

1. **Source Envelope** — what external source or observation is being presented, with provenance and source-class metadata.
2. **Insight Candidate** — the bounded claim, finding, hypothesis, or negative result extracted from one or more Source Envelopes.
3. **Blindspot Record** — the specific type of gap or challenged assumption the candidate may expose.
4. **Architecture Impact Record** — deterministic mapping from the candidate to named AXIOM components, invariants, requirements, tests, contracts, or UI surfaces.
5. **Review Disposition** — a human/reviewer-owned decision about what happens next: reject, archive, monitor, create test, draft RFC, update threat model, or open a separately authorized implementation task.

The first four objects may be generated or proposed by machines. The fifth is the explicit boundary that prevents discovery from silently rewriting project truth.

The normal lifecycle is:

```text
external source / observation
        |
        v
Source Envelope
        |
        v
Insight Candidate
        |
        v
Blindspot classification
        |
        v
Architecture Impact Record
        |
        v
review queue
        |
        v
Review Disposition
        |
        +--> no change / archive
        +--> monitor
        +--> challenge/test
        +--> RFC/design work
        +--> separately authorized implementation
```

No earlier stage can skip directly to execution or authority.

## 3. Design principles

### 3.1 Non-authoritative by construction

The fabric MUST NOT become a parallel requirement registry, capability registry, issue tracker, memory authority plane, or runtime policy system.

Every v0 object carries:

```text
authority_effect = none
runtime_effect = none
capability_promotion = false
canonical_truth_effect = none
mutation_effect = none
```

Unknown fields fail closed.

### 3.2 Evidence class is separate from claim confidence

The system MUST distinguish at least these source classes:

- `formal` — peer-reviewed paper, formal standard, specification, qualified government/technical report;
- `empirical` — incident report, postmortem, benchmark, reproduction, red-team result;
- `frontier` — preprint, research blog, system card, experimental repository;
- `expert-hypothesis` — interview, conference talk, technical conversation, expert thread;
- `practitioner` — implementation notes, issue reports, operator experience, developer discussion;
- `community` — forum, social discussion, community observation;
- `adjacent-domain` — evidence imported from a non-AI discipline because of a structural analogy.

Source class affects how evidence is interpreted. It does not automatically determine truth.

A `formal` source can still be wrong. A `community` source can still expose a real blindspot.

### 3.3 Provenance is separate from truth

The fabric MUST preserve the distinction:

```text
known source != true claim
unknown source != false claim
foreign source != false claim
domestic source != true claim
platform-hosted != platform-authored
```

Architecture Impact Records therefore refer to provenance and evidence quality separately from confidence in the extracted claim.

### 3.4 Corroboration must be lineage-aware

Five webpages repeating the same upstream report MUST NOT count as five independent confirmations.

A Source Envelope may name zero or more `upstream_refs`. Deterministic review tooling SHOULD be able to group sources by shared lineage and expose an `independent_lineage_count` separately from raw source count.

V0 does not crawl or infer lineages automatically. It defines the contract needed for later reviewed tooling.

### 3.5 Negative evidence is first-class

A credible `NOT_REPRODUCED`, failed replication, contradictory result, or null result is valid evidence.

The fabric MUST NOT optimize for positive novelty only.

### 3.6 New information cannot manufacture authority

A paper, standard, provider announcement, expert statement, agent output, benchmark, or incident report can justify review, a test, or an RFC. It cannot by itself change production policy or runnable status.

This extends the repository's existing invariant:

> capability is not authority; discovery is not permission.

## 4. Source Envelope v0

Schema identifier:

`axiom-discovery-source-envelope.v0`

Required fields:

- `source_id` — stable local identifier;
- `captured_at` — timestamp of local intake;
- `source_class` — closed vocabulary from section 3.2;
- `title` — bounded human-readable source title;
- `locator` — URL, DOI, repository ref, issue ref, document ref, or other non-secret locator;
- `publisher_or_origin` — named origin when known;
- `published_at` — nullable source publication timestamp;
- `content_digest` — canonical digest of the exact reviewed content or normalized source artifact when available;
- `upstream_refs` — bounded list of known shared-source ancestors;
- `evidence_status` — one of `observed`, `fetched`, `reproduced`, `independently-verified`, `unverified`;
- `sensitivity` — one of `public`, `restricted`, `private-security`;
- `notes` — bounded non-authoritative reviewer notes;
- hard-boundary fields from section 3.1.

Rules:

1. `content_digest` may be null only when the source has not been materialized or a stable artifact cannot be obtained.
2. `independently-verified` MUST NOT be set merely because multiple derivative sources repeat the same claim.
3. `private-security` records MUST NOT expose sensitive locator/content through public outputs.
4. The envelope contains no executable content and grants no access to the source.

## 5. Insight Candidate v0

Schema identifier:

`axiom-discovery-insight-candidate.v0`

An Insight Candidate is a bounded proposition worthy of comparison against AXIOM. It is not accepted truth.

Required fields:

- `candidate_id`;
- `summary` — one bounded proposition or finding;
- `candidate_type` — one of:
  - `finding`
  - `hypothesis`
  - `contradiction`
  - `negative-result`
  - `standard-change`
  - `incident-pattern`
  - `architecture-analogy`
  - `ui-human-factors`
  - `open-question`;
- `source_refs` — at least one Source Envelope;
- `evidence_strength` — one of `weak`, `moderate`, `strong`, `mixed`, `unknown`;
- `claim_confidence` — one of `low`, `medium`, `high`, `unknown`;
- `independent_lineage_count` — non-negative integer explicitly separate from source count;
- `novelty_status` — one of `already-covered`, `stronger-evidence`, `partially-new`, `materially-new`, `unknown`;
- `counterevidence_refs` — bounded list of conflicting Source Envelopes or candidates;
- `uncertainties` — bounded list of explicit unresolved uncertainties;
- hard-boundary fields.

Rules:

1. `evidence_strength` and `claim_confidence` MUST remain separate.
2. Machine-generated candidates MUST preserve source refs and uncertainties.
3. A candidate MUST NOT silently upgrade from hypothesis to finding because another model repeats it.
4. Unknown or conflicting evidence is represented explicitly rather than rounded into false certainty.

## 6. Blindspot Record v0

Schema identifier:

`axiom-blindspot-record.v0`

Closed v0 blindspot classes:

- `unknown`
- `assumption`
- `contradiction`
- `unowned-boundary`
- `unmodelled-threat`
- `unmodelled-user`
- `unmodelled-environment`
- `missing-standard`
- `missing-test`
- `missing-ui`
- `unknown-unknown-candidate`

Required fields:

- `blindspot_id`;
- `candidate_ref`;
- `blindspot_class`;
- `description`;
- `affected_domain` — bounded vocabulary initially including `authority`, `identity`, `memory`, `context`, `tooling`, `protocol`, `runtime`, `network`, `evidence`, `ui`, `recovery`, `privacy`, `supply-chain`, `physical`, `governance`, `economics`, `other`;
- `current_assumption_or_gap` — explicit description of what AXIOM currently appears to assume or omit;
- `known_owner` — nullable component or document owner; null is allowed and significant;
- `urgency` — one of `watch`, `normal`, `high`, `critical`;
- `review_state` — one of `unreviewed`, `triaged`, `rejected`, `accepted-for-test`, `accepted-for-rfc`, `accepted-for-monitoring`, `resolved`;
- hard-boundary fields.

`unowned-boundary` is especially important. It exists for cross-layer failures where each local component appears compliant but no component owns the composed security property.

Examples:

```text
MCP auth is locally valid
+
A2A delegation is locally valid
+
provider credential forwarding is locally valid
=
combined flow may still widen authority
```

The record does not fix the problem. It makes the absence of ownership explicit.

## 7. Architecture Impact Record v0

Schema identifier:

`axiom-architecture-impact-record.v0`

The Architecture Impact Record answers:

> If this candidate is true or sufficiently plausible, where would AXIOM have to change or prove that it is already safe?

Required fields:

- `impact_id`;
- `candidate_ref`;
- `blindspot_refs` — zero or more Blindspot Records;
- `affected_paths` — bounded repository paths or component identifiers;
- `affected_requirements` — zero or more exact requirement IDs;
- `affected_invariants` — zero or more exact named invariants or explicit prose if no identifier exists;
- `impact_class` — one or more of:
  - `no-change`
  - `documentation`
  - `threat-model`
  - `test`
  - `contract`
  - `runtime-design`
  - `ui`
  - `recovery`
  - `policy`
  - `capability-candidate`
  - `research-needed`;
- `proposed_actions` — bounded, non-executable proposals;
- `required_falsification` — bounded list of tests/observations that could disprove or narrow the proposed impact;
- `risk_if_ignored` — one of `low`, `medium`, `high`, `critical`, `unknown`;
- `implementation_status` — fixed to `not-authorized` in v0;
- hard-boundary fields.

Rules:

1. `affected_paths` are locators, not write permissions.
2. `capability-candidate` means a candidate for normal AXIOM capability governance, never promotion.
3. Every non-trivial impact SHOULD include at least one falsification path before implementation.
4. A candidate may correctly produce `no-change` when existing invariants already cover the finding.

## 8. Review Disposition v0

Schema identifier:

`axiom-discovery-review-disposition.v0`

This object marks the boundary between automated discovery and project governance.

Required fields:

- `disposition_id`;
- `impact_ref`;
- `reviewer_identity` — descriptive reviewer reference only;
- `reviewed_at`;
- `decision` — one of:
  - `reject`
  - `archive`
  - `monitor`
  - `request-more-evidence`
  - `create-test-proposal`
  - `create-rfc-proposal`
  - `threat-model-proposal`
  - `ui-design-proposal`
  - `implementation-proposal`;
- `rationale`;
- `next_locator` — nullable issue/spec/test/RFC locator created through a separate repository-authorized process;
- `authority_effect = none`.

A Review Disposition records a governance decision. It does not itself perform the next action.

If a future implementation creates an issue, branch, test, or PR, that effect MUST pass ordinary repository authority and evidence controls separately.

## 9. Deterministic Architecture Delta Engine

A later implementation slice may provide a pure deterministic function:

`evaluateArchitectureImpact(candidate, repositoryIndex)`

The first implementation MUST NOT use a generative model inside the allow/deny calculation. Any model-assisted extraction or mapping is advisory input that must be normalized into the contracts above.

The deterministic engine may:

- validate object schemas;
- resolve exact requirement IDs;
- resolve exact repository paths from a prebuilt read-only index;
- compare declared affected components against existing requirement/invariant metadata;
- identify whether a required owner field is absent;
- calculate source-lineage counts from explicit refs;
- classify malformed or unresolved records;
- generate a frozen comparison summary.

It may not:

- browse the network;
- fetch sources;
- execute tools;
- open issues;
- write memory;
- update requirements;
- change `capabilities.json`;
- alter policy;
- grant execution authority.

## 10. Composition Authority as a derived review role

Protocol composition is a distinct blindspot class rather than a new runtime authority plane in v0.

The DCF SHOULD support a `composition-owner` review tag for findings where security depends on two or more layers such as:

- MCP + A2A;
- OAuth/OIDC + provider adapters;
- browser + model + executable download;
- agent runtime + Grid capability;
- device adapter + physical actuator;
- memory + summarization + tool echo.

A future Composition Authority implementation, if ever created, MUST itself remain inside the existing Gateway -> Hypervisor -> Sandbox -> Grid authority path for consequential effects. DCF v0 merely exposes when composition ownership is missing.

## 11. Memory-authority consequence

DCF v0 records a near-term architecture consequence from current research and incident patterns:

> a trusted agent rewriting, summarizing, quoting, or re-emitting untrusted information MUST NOT automatically raise the authority of that information.

The design therefore reserves a future invariant:

```text
Authority(transform(x)) <= Authority(x)
```

unless an independent, explicitly authorized review process raises it.

This design does not modify Grid memory semantics yet. It requires the DCF to classify memory-authority laundering as an `unmodelled-threat` or `assumption` candidate when encountered and map it to `GRID-05`, AI context/memory requirements, and the Sovereign Vault/Context Broker architecture.

The actual Memory Authority Kernel is a separate implementation project because changing live memory semantics is broader than this first DCF slice.

## 12. Native UI consequence: Trust Center Radar

DCF's eventual human surface belongs outside the zero-dependency kernel under existing UX requirements.

The native Axiom One concept is a **Trust Center** with a `Radar` view. Radar MUST show architecture consequences rather than a generic news feed.

Example:

```text
NEW FINDING
Memory authority can be laundered through summarization.

Evidence
1 formal source
2 empirical reproductions
2 independent lineages

AXIOM impact
High

Affected
Sovereign Vault
Context Broker
GRID-05

Current protection
Partial / unresolved

Recommended next step
Create falsification tests

Status
Unreviewed
```

The default UI SHOULD expose consequences rather than opaque aggregate scores.

The UI MUST distinguish:

- source provenance;
- evidence strength;
- claim confidence;
- architecture impact;
- review state;
- current capability/promotion state.

It MUST NOT imply that a newly discovered paper or incident has already changed AXIOM.

## 13. Wildcard discovery lane

A future automated discovery system SHOULD deliberately reserve a bounded fraction of research capacity for adjacent-domain material that current AXIOM ontology would not naturally request.

The initial target is approximately 15-20%, configurable and non-normative.

Candidate adjacent domains include:

- aviation automation and incident reporting;
- medical safety and informed consent;
- financial transaction authorization and reconciliation;
- nuclear/process safety;
- industrial control;
- capability-security systems;
- distributed systems and Byzantine fault models;
- insurance and operational-risk underwriting;
- ecological resilience;
- supply-chain provenance;
- cognitive psychology and human factors.

V0 records this requirement for future discovery policy only. No autonomous source acquisition is introduced.

## 14. Research prioritization

Future scheduling SHOULD prioritize material using explicit factors rather than relevance alone.

A useful conceptual form is:

```text
ResearchPriority ~ Novelty x ArchitecturalImpact x EvidenceStrength x Uncertainty
```

Disagreement among independent reasoning paths is a signal to spend more verification effort, not a voting mechanism for truth.

The system SHOULD also increase scrutiny where consequence is high even if novelty is modest.

No numeric formula becomes canonical in v0.

## 15. Incident backpropagation

A future Incident Backpropagator SHOULD convert external incidents into regression questions:

```text
incident
  -> failure mechanism
  -> relevant AXIOM invariant
  -> existing protection?
  -> missing test?
  -> bounded regression proposal
```

Examples:

- unexpected agent communication -> Communication Surface Accounting candidate;
- trusted-domain malvertising -> non-transitive resource trust candidate;
- protocol-composition failure -> unowned-boundary candidate;
- corrupted memory lineage -> memory-authority candidate;
- blind confirmation UI -> missing-ui candidate.

Again, the backpropagator proposes tests. It never changes policy automatically.

## 16. First implementation slice

After this design is accepted for implementation, the first code slice should remain repository-local and zero-authority:

1. Add four JSON Schemas under `docs/architecture/contracts/`:
   - `discovery-source-envelope.v0.schema.json`
   - `discovery-insight-candidate.v0.schema.json`
   - `blindspot-record.v0.schema.json`
   - `architecture-impact-record.v0.schema.json`
2. Add `discovery-review-disposition.v0.schema.json` only if the implementation can keep it clearly separate from repository effect authority; otherwise defer it.
3. Add a small dependency-free contract validator module following current repository conventions.
4. Add deterministic fixtures for:
   - duplicate derivative sources not increasing independent-lineage count;
   - hypothesis not upgrading itself to finding;
   - unowned protocol-composition boundary;
   - negative evidence preserved;
   - affected path/requirement refs remaining descriptive;
   - hard boundary fields rejecting any authority/runtime/mutation effect.
5. Add a repository-local sample Blindspot Register containing only reviewed examples derived from public evidence already discussed, clearly labeled non-canonical and non-authoritative.
6. Add requirement text defining the DCF's non-authority boundary and acceptance evidence.
7. Do not change `mesh/config/capabilities.json` runnable status in the first slice.
8. Do not add a watcher, network source connector, model call, scheduled job, browser UI, or automatic GitHub mutation in the first slice.

## 17. Testing strategy

The first implementation MUST be test-first.

Minimum negative tests:

- unknown top-level fields rejected;
- missing source provenance rejected;
- `authority_effect != none` rejected;
- `runtime_effect != none` rejected;
- `capability_promotion = true` rejected;
- invalid review-state transition rejected by the validator when transition checking is added;
- source count cannot be substituted for independent lineage count;
- one candidate cannot cite itself as corroboration;
- `implementation_status` cannot differ from `not-authorized` in v0;
- sensitive/private-security source cannot be rendered into a public fixture output;
- malformed requirement/path references are reported as unresolved rather than treated as authority or success.

Minimum positive tests:

- one formal source + one independent empirical reproduction produce two lineages;
- contradictory evidence survives into the candidate object;
- `NOT_REPRODUCED` evidence validates;
- a finding maps to an existing requirement without changing it;
- an unowned composition boundary validates;
- a `no-change` impact is representable when existing architecture already covers the finding.

The tests prove contract semantics only. They do not claim a live research feed, autonomous blindspot discovery, or validated external-source coverage.

## 18. Error handling

V0 validators use explicit, stable error classes/codes consistent with repository conventions.

At minimum:

- `invalid_discovery_contract`
- `unresolved_source_ref`
- `invalid_source_lineage`
- `invalid_authority_effect`
- `invalid_runtime_effect`
- `invalid_capability_promotion`
- `unresolved_architecture_ref`
- `invalid_review_state`

Missing evidence must remain `unknown` or unresolved. The validator MUST NOT invent defaults that imply verification.

## 19. Relationship to existing project truth

DCF does not replace any existing source of truth.

The precedence remains:

1. capability registry for runnable capability state;
2. normative requirements for intended behavior;
3. project status/readiness documentation for evidenced implementation state;
4. reviewed architecture/spec documents for approved design;
5. DCF records for non-authoritative external findings, blindspots, and proposals.

If a DCF record conflicts with current normative project truth, the correct state is `contradiction` or `proposal`, not silent overwrite.

## 20. Explicit non-goals for v0

DCF v0 does not attempt to:

- autonomously crawl the public web;
- subscribe to journals or standards feeds;
- use a frontier model to determine project truth;
- score researchers or institutions by reputation;
- create a universal truth engine;
- replace GitHub issues;
- replace the Opportunity Catalog;
- create autonomous pull requests;
- merge code;
- promote capabilities;
- run privileged tools;
- assign production trust;
- create a live Composition Authority;
- change Grid memory semantics;
- build the Trust Center UI;
- create a new network service.

Those are future projects, each requiring separate evidence and authority review.

## 21. Acceptance criteria for the first implementation plan

The implementation plan is acceptable only if it preserves all of these properties:

1. schemas and validators are dependency-free and repository-local;
2. no new network listener or egress path is introduced;
3. no model/provider call is introduced;
4. no credential path is introduced;
5. no new runtime capability is promoted;
6. no automatic GitHub mutation is introduced;
7. every object preserves provenance and uncertainty explicitly;
8. source lineage and source count remain separate;
9. blindspots can point at exact existing requirements/paths without becoming authority;
10. negative evidence and contradiction remain first-class;
11. unresolved references fail closed or remain explicitly unresolved;
12. the first slice can be removed without affecting Gateway -> Hypervisor -> Sandbox -> Grid execution;
13. documentation accurately states that DCF is a research/proposal substrate only.

## 22. Future phases

If the inert first slice proves useful, later separately approved phases may include:

### Phase 1 — Repository-local architecture index

Deterministic index of requirements, invariants, component paths, contracts, threat-model IDs, and UI requirements.

### Phase 2 — Read-only source ingestion

Reviewed connectors may create Source Envelopes from selected external sources under strict provenance, rate, privacy, and no-authority constraints.

### Phase 3 — Advisory extraction and comparison

Replaceable model providers may propose Insight Candidates and architecture mappings, with explicit model identity, purpose, source scope, retention, budget, and result receipts under normal AXIOM AI requirements.

### Phase 4 — Incident/test backpropagation

Generate bounded test proposals from reviewed incidents. Tests remain normal repository changes subject to ordinary review.

### Phase 5 — Trust Center Radar

Native human UI for source lineage, evidence, blindspot, and architecture-impact review.

### Phase 6 — Composition Lab

Explicit multi-protocol composition tests for MCP, A2A, OAuth/OIDC, provider adapters, device adapters, and agent-runtime combinations.

### Phase 7 — Continuous attestation integration

Research and separately promote runtime-attestation support where hardware/platform evidence justifies it.

## 23. Final invariant

Discovery & Challenge Fabric exists so that AXIOM can become easier to correct without becoming easier to hijack.

Its governing invariant is:

> **Observation may propose change. Evidence may strengthen a proposal. Review may authorize work. Only the existing authority system may authorize consequential effects.**

The objective is not a system that never encounters a surprise.

The objective is a system that converts surprises into structured evidence, falsifiable tests, reviewed architecture deltas, and controlled upgrades without allowing the discovery mechanism itself to become an unreviewed source of power.
