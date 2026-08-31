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

AXIOM-MESH is now broad enough that architectural blindspots can arise from places outside the project's current ontology: new papers, security incidents, standards revisions, provider changes, protocol-composition failures, human-factors research, adjacent disciplines, expert technical conversations, open-source implementations, and contradictory or negative evidence.

A normal research feed is insufficient. It tells an operator that something new exists, but does not answer the architectural question:

> **What, if anything, should this change in AXIOM-MESH?**

AXIOM therefore needs a permanent discovery-and-challenge substrate whose primary task is to identify potential architecture deltas while preserving the project's existing evidence and authority boundaries.

The first slice is intentionally inert. It establishes contracts and deterministic semantics before any future watcher, crawler, model, or connector can feed it automatically.

## 2. Core decision

Discovery & Challenge Fabric v0 consists of five separately versioned descriptive objects:

1. **Source Envelope** — what external source or observation is being presented, with provenance and source-class metadata.
2. **Insight Candidate** — the bounded claim, finding, hypothesis, or negative result extracted from one or more Source Envelopes.
3. **Blindspot Record** — the specific type of gap or challenged assumption the candidate may expose.
4. **Architecture Impact Record** — deterministic mapping from the candidate to named AXIOM components, invariants, requirements, tests, contracts, or UI surfaces.
5. **Review Disposition** — a reviewer-owned decision about what happens next: reject, archive, monitor, create a test proposal, draft an RFC proposal, update a threat-model proposal, create a UI-design proposal, or create a separately authorized implementation proposal.

The first four objects may be generated or proposed by machines. The fifth records a governance decision but still has no repository or runtime effect.

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
        +--> challenge/test proposal
        +--> RFC/design proposal
        +--> separately authorized implementation
```

No stage can skip directly to execution or authority.

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

The closed v0 source classes are:

- `formal` — peer-reviewed paper, formal standard, specification, qualified government/technical report;
- `empirical` — incident report, postmortem, benchmark, reproduction, red-team result;
- `frontier` — preprint, research blog, system card, experimental repository;
- `expert-hypothesis` — interview, conference talk, technical conversation, expert thread;
- `practitioner` — implementation notes, issue reports, operator experience, developer discussion;
- `community` — forum, social discussion, community observation;
- `adjacent-domain` — evidence imported from a non-AI discipline because of a structural analogy.

Source class affects interpretation. It does not determine truth.

### 3.3 Provenance is separate from truth

The fabric preserves these distinctions:

```text
known source != true claim
unknown source != false claim
foreign source != false claim
domestic source != true claim
platform-hosted != platform-authored
```

### 3.4 Corroboration is lineage-aware

Five webpages repeating one upstream report MUST NOT count as five independent confirmations.

A Source Envelope may name `upstream_refs`. Deterministic tooling can group explicitly linked sources and expose `independent_lineage_count` separately from raw source count.

V0 does not crawl or infer lineages automatically.

### 3.5 Negative evidence is first-class

A credible `NOT_REPRODUCED`, failed replication, contradictory result, or null result is valid evidence. The fabric MUST NOT optimize for positive novelty only.

### 3.6 New information cannot manufacture authority

A paper, standard, provider announcement, expert statement, agent output, benchmark, or incident report can justify review, a test, or an RFC. It cannot by itself change production policy or runnable status.

## 4. Source Envelope v0

Schema identifier: `axiom-discovery-source-envelope.v0`

Required fields:

- `source_id`;
- `captured_at`;
- `source_class`;
- `title`;
- `locator` — URL, DOI, repository ref, issue ref, document ref, or other non-secret locator;
- `publisher_or_origin`;
- `published_at` — nullable;
- `content_digest` — nullable only when the exact artifact cannot yet be materialized;
- `upstream_refs`;
- `evidence_status` — `observed`, `fetched`, `reproduced`, `independently-verified`, or `unverified`;
- `sensitivity` — `public`, `restricted`, or `private-security`;
- `notes`;
- all hard-boundary fields from section 3.1.

Rules:

1. `independently-verified` cannot be inferred from derivative reporting alone.
2. `private-security` records cannot expose sensitive locator/content through public outputs.
3. The envelope contains no executable content and grants no access to the source.

## 5. Insight Candidate v0

Schema identifier: `axiom-discovery-insight-candidate.v0`

Required fields:

- `candidate_id`;
- `summary` — one bounded proposition or finding;
- `candidate_type` — `finding`, `hypothesis`, `contradiction`, `negative-result`, `standard-change`, `incident-pattern`, `architecture-analogy`, `ui-human-factors`, or `open-question`;
- `source_refs` — at least one Source Envelope;
- `evidence_strength` — `weak`, `moderate`, `strong`, `mixed`, or `unknown`;
- `claim_confidence` — `low`, `medium`, `high`, or `unknown`;
- `independent_lineage_count` — non-negative integer distinct from source count;
- `novelty_status` — `already-covered`, `stronger-evidence`, `partially-new`, `materially-new`, or `unknown`;
- `counterevidence_refs`;
- `uncertainties`;
- all hard-boundary fields.

Rules:

1. Evidence strength and claim confidence remain separate.
2. Machine-generated candidates preserve source refs and uncertainties.
3. A hypothesis cannot upgrade itself to a finding because another model repeats it.
4. Unknown or conflicting evidence remains explicit.

## 6. Blindspot Record v0

Schema identifier: `axiom-blindspot-record.v0`

Closed blindspot classes:

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
- `affected_domain` — one of `authority`, `identity`, `memory`, `context`, `tooling`, `protocol`, `runtime`, `network`, `evidence`, `ui`, `recovery`, `privacy`, `supply-chain`, `physical`, `governance`, `economics`, `other`;
- `current_assumption_or_gap`;
- `known_owner` — nullable component/document owner;
- `urgency` — `watch`, `normal`, `high`, or `critical`;
- `review_state` — `unreviewed`, `triaged`, `rejected`, `accepted-for-test`, `accepted-for-rfc`, `accepted-for-monitoring`, or `resolved`;
- all hard-boundary fields.

`unowned-boundary` exists for cross-layer failures where each local component appears compliant but no component owns the composed security property.

```text
MCP auth locally valid
+
A2A delegation locally valid
+
provider credential forwarding locally valid
=
combined flow may still widen authority
```

The record exposes the missing ownership; it does not fix or authorize anything.

## 7. Architecture Impact Record v0

Schema identifier: `axiom-architecture-impact-record.v0`

Required fields:

- `impact_id`;
- `candidate_ref`;
- `blindspot_refs`;
- `affected_paths` — bounded repository paths or component identifiers;
- `affected_requirements` — exact requirement IDs where applicable;
- `affected_invariants` — exact named invariants or explicit prose where no identifier exists;
- `impact_class` — one or more of `no-change`, `documentation`, `threat-model`, `test`, `contract`, `runtime-design`, `ui`, `recovery`, `policy`, `capability-candidate`, `research-needed`;
- `proposed_actions` — bounded and non-executable;
- `required_falsification` — tests/observations that could disprove or narrow the impact;
- `risk_if_ignored` — `low`, `medium`, `high`, `critical`, or `unknown`;
- `implementation_status` — exactly `not-authorized` in v0;
- all hard-boundary fields.

Rules:

1. `affected_paths` are locators, not write permissions.
2. `capability-candidate` never means promotion.
3. Every non-trivial impact SHOULD include at least one falsification path before implementation.
4. `no-change` is valid when existing invariants already cover a finding.

## 8. Review Disposition v0

Schema identifier: `axiom-discovery-review-disposition.v0`

This object is included in the first implementation slice because the automated-discovery-to-governance boundary must be explicit from the beginning.

Required fields:

- `disposition_id`;
- `impact_ref`;
- `reviewer_identity` — descriptive reviewer reference only;
- `reviewed_at`;
- `decision` — `reject`, `archive`, `monitor`, `request-more-evidence`, `create-test-proposal`, `create-rfc-proposal`, `threat-model-proposal`, `ui-design-proposal`, or `implementation-proposal`;
- `rationale`;
- `next_locator` — nullable issue/spec/test/RFC locator created through a separate repository-authorized process;
- all hard-boundary fields.

A Review Disposition records a governance decision. It does not perform the next action. Any future repository effect still passes ordinary repository authority and evidence controls separately.

## 9. Deterministic Architecture Delta Engine

A later implementation slice may expose a pure function such as:

`evaluateArchitectureImpact(candidate, repositoryIndex)`

The first executable implementation cannot use a generative model inside any allow/deny calculation. Model-assisted extraction or mapping remains advisory input normalized into the contracts above.

The deterministic engine may:

- validate object schemas;
- resolve exact requirement IDs;
- resolve exact repository paths from a prebuilt read-only index;
- compare declared affected components against existing requirement/invariant metadata;
- identify absent ownership;
- calculate explicit source-lineage counts;
- classify malformed or unresolved records;
- generate a frozen comparison summary.

It may not browse, fetch sources, execute tools, open issues, write memory, update requirements, change `capabilities.json`, alter policy, or grant execution authority.

## 10. Composition ownership

Protocol composition is represented first as a blindspot/review property, not a new runtime authority plane.

DCF supports a `composition-owner` review tag for findings involving multiple layers such as:

- MCP + A2A;
- OAuth/OIDC + provider adapters;
- browser + model + executable download;
- agent runtime + Grid capability;
- device adapter + physical actuator;
- memory + summarization + tool echo.

Any future Composition Authority that performs consequential effects must remain inside Gateway -> Hypervisor -> Sandbox -> Grid. DCF v0 only exposes missing composition ownership.

## 11. Memory-authority consequence

DCF records this candidate invariant for a separate Memory Authority project:

```text
Authority(transform(x)) <= Authority(x)
```

A trusted agent rewriting, summarizing, quoting, or re-emitting untrusted information must not automatically raise that information's authority.

DCF v0 does not change Grid memory semantics. It can classify memory-authority laundering as an `unmodelled-threat` or `assumption` and map it to `GRID-05`, relevant AI/context requirements, and the Sovereign Vault/Context Broker architecture.

## 12. Native UI consequence: Trust Center Radar

DCF's eventual human surface remains outside the zero-dependency kernel under existing UX requirements.

The native Axiom One concept is a **Trust Center** with a `Radar` view. Radar shows architecture consequences rather than a generic news feed.

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

The UI distinguishes source provenance, evidence strength, claim confidence, architecture impact, review state, and current capability/promotion state. It never implies that a newly discovered source has already changed AXIOM.

## 13. Wildcard discovery lane

A future automated discovery system SHOULD reserve a bounded fraction of research capacity for adjacent-domain material the current ontology would not naturally request. The initial non-normative target is approximately 15-20%.

Candidate domains include aviation automation, medical safety, financial authorization/reconciliation, nuclear/process safety, industrial control, capability security, distributed systems, insurance/operational risk, ecological resilience, supply-chain provenance, and cognitive psychology/human factors.

No autonomous source acquisition is introduced in v0.

## 14. Research prioritization

Future scheduling should use explicit factors rather than relevance alone. A useful conceptual model is:

```text
ResearchPriority ~ Novelty x ArchitecturalImpact x EvidenceStrength x Uncertainty
```

Disagreement among independent reasoning paths is a signal to spend more verification effort, not a voting mechanism for truth. High consequence can raise priority even when novelty is modest.

No numeric formula becomes canonical in v0.

## 15. Incident backpropagation

A future Incident Backpropagator can convert reviewed external incidents into regression questions:

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

It proposes tests; it does not change policy.

## 16. First implementation slice

After written-spec review, the first implementation remains repository-local and zero-authority:

1. Add five JSON Schemas under `docs/architecture/contracts/`:
   - `discovery-source-envelope.v0.schema.json`
   - `discovery-insight-candidate.v0.schema.json`
   - `blindspot-record.v0.schema.json`
   - `architecture-impact-record.v0.schema.json`
   - `discovery-review-disposition.v0.schema.json`
2. Add a dependency-free contract validator module following current repository conventions.
3. Add deterministic fixtures for derivative lineage, hypothesis preservation, unowned composition boundaries, negative evidence, descriptive architecture refs, and hard non-authority boundaries.
4. Add a repository-local sample Blindspot Register containing reviewed examples, clearly labeled non-canonical and non-authoritative.
5. Add normative requirement text defining DCF's non-authority boundary and acceptance evidence.
6. Do not change `mesh/config/capabilities.json` runnable status.
7. Do not add a watcher, source connector, model call, scheduled runtime job, browser UI, or automatic GitHub mutation.

## 17. Testing strategy

The first implementation is test-first and must cover malformed fields, boundary widening, derivative source lineage, contradictions, negative evidence, unresolved architecture refs, unowned protocol boundaries, and inert review disposition. Tests prove contract semantics only; they do not claim a live research feed or autonomous discovery.

## 18. Error handling

V0 validators use explicit stable validation failures consistent with repository conventions. Missing evidence remains `unknown` or unresolved; validators cannot invent defaults that imply verification.

## 19. Relationship to existing project truth

DCF replaces no existing source of truth. Capability registry remains authoritative for runnable capability state; normative requirements remain authoritative for intended behavior; status/readiness documents remain authoritative for evidenced implementation state; DCF records remain proposals and observations.

## 20. Explicit non-goals for v0

DCF v0 does not crawl the web, subscribe to feeds, use a model to determine project truth, replace GitHub issues, create autonomous pull requests, merge code, promote capabilities, run privileged tools, assign production trust, create a live Composition Authority, change Grid memory semantics, build the Trust Center UI, or create a network service.

## 21. Acceptance criteria

The implementation remains dependency-free, introduces no network listener, provider call, credential path, capability promotion, or automatic repository mutation, and can be removed without affecting Gateway -> Hypervisor -> Sandbox -> Grid execution.

## 22. Future phases

Future separately approved phases may add a repository-local architecture index, read-only source ingestion, advisory model extraction, incident/test backpropagation, Trust Center Radar, Composition Lab, and continuous attestation integration.

## 23. Final invariant

Discovery & Challenge Fabric exists so AXIOM can become easier to correct without becoming easier to hijack.

> **Observation may propose change. Evidence may strengthen a proposal. Review may authorize work. Only the existing authority system may authorize consequential effects.**
