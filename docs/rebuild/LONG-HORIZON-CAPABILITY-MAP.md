# AXIOM-MESH Long-Horizon Capability Map

**Status:** planning and traceability map; not the runnable capability registry

**Adopted:** 2026-08-03

**Updated:** 2026-08-09

**Current registry authority:** `mesh/config/capabilities.json`

**Current build:** `0.12.0-dev.3`

## Purpose

This document preserves the complete strategic direction of AXIOM-MESH while keeping current claims exact.

The machine-readable capability registry remains the sole authority for whether a capability is implemented, experimental, specified, disabled, or adapter-required in the current build. This map does not add runnable capabilities and does not change the registry digest. It connects the existing product and kernel surface to future assurance, Circle, institutional, jurisdictional, sovereign, treaty, agent-interoperability, and collective-finality work.

## Claim rule

For every capability or product concept:

```text
advertised_scope <= production_promoted_scope <= evidenced_scope <= implemented_scope
```

Roadmap, research, demonstrations, historical documents, architecture drafts, and national interest cannot promote a capability.

## Current authoritative surface

The current registry contains 49 tracked capabilities, including 31 marked implemented. The exact live count, build identity, and status must always be recomputed from `mesh/config/capabilities.json` before publication.

Existing families include:

- authenticated intent, policy, approval, grant, bounded execution, and evidence;
- human-sponsored constrained machine principals with action/purpose ceilings, no delegation, and authority-bound evidence;
- append-only evidence and provenance-preserving portability;
- local governance records and consent receipts;
- memory graph and selective disclosure foundations;
- node identity, discovery, scheduling reservations, and causal exchange;
- encrypted backup, restore, rotation, recovery, observability, and service isolation;
- provider, pilot-dossier, and independent-review intake;
- Gateway client, CLI, and experimental AXIOM One human shell;
- specified, disabled, experimental, or adapter-required AI, messaging, identity, scientific tools, domains, markets, economics, settlement, embodied systems, agent protocols, and proof verification.

Nothing in this document weakens the detailed summaries or evidence paths in the registry.

## Capability-state vocabulary

| State | Meaning in this map |
|---|---|
| **current-registry** | Refer to the registry for exact current status and evidence |
| **planned** | Architecture and roadmap intent exist; requirements are incomplete |
| **specified-next** | Candidate for normative specification and schema work |
| **laboratory-only** | May be researched or built with synthetic/test data and no production authority |
| **blocked** | Must not be enabled until named dependencies and reviews pass |
| **not-claimed** | Explicitly absent from the current product claim |

These labels are planning labels only. They are not valid substitutes for registry statuses.

## Layer 1 — Personal authority and local execution

| Capability | Planning state | Existing foundation | Remaining work |
|---|---|---|---|
| Authenticated intent-to-evidence loop | current-registry | Core kernel | Capability-specific evidence binding and authentic pilot promotion |
| Constrained machine principal | current-registry | Principal registry + Hypervisor + plan/grant/evidence binding | Dedicated machine revocation, remaining machine-specific limits, invocation envelope and adapter parity |
| Deny-dominant layered policy | current-registry | Core kernel | Broader policy explanation, conflict and delegation semantics |
| Scoped grants and bounded execution | current-registry | Core kernel | Adapter-specific conformance and remote-execution provenance |
| Personal memory and provenance | current-registry | Memory graph and AXIOM One preview | Full lifecycle, restore, edge deletion, hard-delete policy, bulk ingestion |
| Personal approvals and receipts | current-registry / planned product | Kernel approvals and evidence | Complete human interface, accessibility, uncertainty and revocation handling |
| Independent local verification | planned | Signed evidence and export verification foundations | AXIOM Verify product, static packages, human explanation |
| Adaptive assurance profiles | specified-next | Risk policy, approvals, evidence, provenance | Exact schema, policy composition, downgrade resistance, tests |
| Retrospective reassessment | specified-next | Append-only corrections and provenance links | Review records, challenge states, export/import and causal-sync semantics |
| Assurance-aware retention | planned | Encrypted state, retention and export | Profile-based minimization, legal holds, privacy review |

## Layer 2 — Circles and voluntary collective governance

| Capability | Planning state | Existing foundation | Remaining work |
|---|---|---|---|
| Invitation and membership | planned | Identity, consent, node records | Circle identities, device membership, expiry, revocation |
| Versioned Circle charters | specified-next | Local governance records and policy overlays | Charter schema, amendment, activation, rollback, comprehension |
| Scoped roles and delegation | specified-next | Capability grants and governance records | Portable delegation chain, term, succession, separation of duties |
| Shared proposals and commitments | planned | Local proposals and causal exchange | Multi-node proposal lifecycle and conflict semantics |
| Circle assurance policy | specified-next | Layered deny-dominant policy | Maximum-floor composition across member and Circle policy |
| Circle appeals and remedies | planned | Appeal records | Multi-party appeal, stay, review, correction and exit |
| Selective sharing | planned | Memory disclosure, export and causal sync | Human sharing product, recipient policy, revocation limits |
| Circle evidence timeline | planned | Grid evidence chain | Cross-node verified timeline and missing-evidence explanation |
| Circle exit and continuity | planned | Export/import, revocation, backup | Data ownership, withdrawal, successor roles and continuity |
| Circle pilot | blocked | Human shell and sharing roadmap | Bounded real participants, consent, usability, security review |

## Layer 3 — Institutional governance

| Capability | Planning state | Dependencies | Promotion requirements |
|---|---|---|---|
| Institution identity and charter | planned | Circle identity, versioned charters | Legal and organizational review |
| Offices and appointments | specified-next | Roles, credentials, delegation | Term, vacancy, acting authority, removal, succession tests |
| Separation of duties | planned | Multi-party approval | Negative tests for collusion and privilege concentration |
| Regulated records | laboratory-only | Retention, encryption, export, legal hold | Domain-specific legal and privacy review |
| Institutional policy hierarchy | planned | Layered policy | Conflict, jurisdiction and amendment semantics |
| External audit and oversight | planned | AXIOM Verify, evidence packages | Independent verifier identity and exact scope binding |
| Emergency institutional authority | laboratory-only | Expiring local emergencies | Containment, expiry, after-action review, appeal |
| Institutional succession and recovery | planned | Backup, restore, credential rotation | Authentic continuity drills |
| Governance-pattern import | laboratory-only | Capsule and import foundations | Inert install, simulation, provenance and no-authority tests |

## Layer 4 — Jurisdictional and sovereign domains

| Capability | Planning state | Dependencies | Current claim |
|---|---|---|---|
| Jurisdiction taxonomy | specified-next | Authority-domain model | not-claimed |
| Constitutional authority graph | laboratory-only | Versioned charters, offices, delegation, review | not-claimed |
| Legislative lifecycle | laboratory-only | Proposals, chambers, quorum, publication, amendment | not-claimed |
| Administrative decisions and appeals | laboratory-only | Notice, reasons, evidence, remedy | not-claimed |
| Judicial review and orders | laboratory-only | Independent authority and evidentiary profiles | not-claimed |
| Public office credentials | laboratory-only | Identity, office, term, succession | not-claimed |
| Emergency public authority | blocked | Rights, independent review, expiry, audit | not-claimed |
| Privacy-preserving national identity | blocked | SSI profile, selective disclosure, anti-correlation | not-claimed |
| Public records transparency | laboratory-only | Verification, secrecy classes, disclosure law | not-claimed |
| Essential-service eligibility | blocked | Due process, appeal, anti-exclusion evidence | not-claimed |
| Voting and election administration | blocked | Jurisdiction-specific democratic and security review | not-claimed |
| Taxation, policing, benefits and enforcement | blocked | Full legal, rights, security and public governance programme | not-claimed |
| Sovereign deployment profile | laboratory-only | Multi-host, independent trust anchors, operations | not-claimed |

A technically represented constitution or government action is not thereby legitimate, lawful, democratic, or rights-respecting.

## Layer 5 — Treaty and cross-sovereign interoperability

| Capability | Planning state | Dependencies | Current claim |
|---|---|---|---|
| Independent trust-anchor sets | planned | Mature transport and identity rotation | not-claimed |
| Bilateral recognition profiles | laboratory-only | Credential and evidence profiles | not-claimed |
| Multilateral or regional profiles | laboratory-only | Bilateral experience and dispute handling | not-claimed |
| Cross-domain assurance negotiation | specified-next | Adaptive assurance schema | not-claimed |
| Data residency and transfer policy | planned | Domain policy, encryption, selective disclosure | not-claimed |
| Treaty amendment and withdrawal | laboratory-only | Versioned agreement and authority semantics | not-claimed |
| Cross-border dispute records | laboratory-only | Independent reviewers and appeal | not-claimed |
| Education credential recognition | possible early laboratory | Education capsule and SSI | not-claimed |
| Scientific/environmental measurement recognition | possible early laboratory | Signed data and verifier adapters | not-claimed |
| Financial, immigration or criminal enforcement interoperation | blocked | Separate domain programmes and public review | not-claimed |

No treaty profile should create automatic transitive trust.

## Layer 6 — Governance-pattern learning

| Capability | Planning state | Dependencies | Safeguard |
|---|---|---|---|
| Portable governance-pattern packages | laboratory-only | Capsule manifests and provenance | Install without authority |
| Local adaptation diffs | planned | Versioning and import | Show every change from source pattern |
| Synthetic governance simulation | laboratory-only | Scientific tools and bounded execution | No public authority or real-world effect |
| Comparative outcome envelopes | specified-next | Evidence, metrics and privacy | Methodology, uncertainty, coverage and incentives declared |
| Pattern adoption records | planned | Local constitutional/charter procedure | Receiving domain authorizes locally |
| Rollback and sunset | planned | Governance activation and recovery | No permanent silent adoption |
| Public challenge and correction | planned | Appeals and reassessment | Preserve original publication and corrections |

## Layer 7 — Collective finality and consensus

| Capability | Planning state | Dependencies | Current claim |
|---|---|---|---|
| Finality classification | specified-next | Assurance and authority schemas | not-claimed |
| Threshold or chamber finalization | laboratory-only | Membership, quorum, roles, appeal | not-claimed |
| BFT or alternative consensus | laboratory-only | Multi-host identity, fault model, recovery | not-claimed |
| Equivocation and censorship evidence | planned | Distributed logs and observers | not-claimed |
| Validator or chamber authority | laboratory-only | Constitutional and technical delegation | not-claimed |
| Consensus amendment and migration | laboratory-only | Governance and recovery | not-claimed |
| Shared treasury finality | blocked | Accounting, identity, dispute, settlement audit | not-claimed |
| Token, staking or public settlement coupling | disabled/blocked | Separate economic programme | not-claimed |

Consensus is reserved for shared state that genuinely requires common finality. It is not a default requirement for personal actions, ordinary Circle collaboration, or causal data exchange.

## Cross-cutting capability requirements

Every future capability above must map to the following before promotion:

| Concern | Required artifact |
|---|---|
| Authority | source, scope, delegation, expiry, revocation |
| Assurance | required and achieved assurance, verifier, limitations |
| Finality | provisional/final/challenge/appeal/supersession state |
| Retention | evidence class, duration, disclosure and deletion policy |
| Privacy | minimization, encryption, selective disclosure, correlation risk |
| Security | threat model, abuse cases, negative tests, rollback |
| Human control | explanation, consent where applicable, appeal and remedy |
| Accessibility | tested primary-path access and comprehension |
| Recovery | backup, restore, succession, credential and policy rotation |
| Portability | export, independent verification, provenance-preserving import |
| Interoperability | exact profile, trust anchors, no implicit transitive trust |
| Claims | current status, non-claims, exact evidence and promotion boundary |

## Dependency chain

```text
capability-specific evidence binding
  -> authentic single-node pilot and independent review
  -> complete human shell and AXIOM Verify
  -> bounded provider adapters and personal workflows
  -> sharing and Circle identity
  -> Circle charter, delegation, appeal, and assurance profiles
  -> institutional offices, duties, oversight, succession and records
  -> mature multi-host authority and independent verification
  -> jurisdictional and sovereign laboratory
  -> treaty recognition and assurance negotiation
  -> collective finality only where required
```

The agent-interoperability branch has its own subordinate sequence beginning with the now-implemented constrained machine principal, followed by the Invocation Envelope, machine discovery/Verify, MCP compatibility, bounded adapters/tasks, attenuation-only delegation, A2A, and remote execution. None of those later layers are implied by the current machine-principal claim.

Research may run ahead in isolated laboratories, but activation, exposure, promotion, and marketing may not.

## Documentation update rule

When any planning item becomes a real specification or implementation, the change must update all applicable authorities in the same pull request:

1. capability registry and digest-bearing documents;
2. normative requirements;
3. product definition;
4. primary roadmap and task queue;
5. threat model and security review scope;
6. schemas and conformance tests;
7. operations, recovery, revocation and migration runbooks;
8. current project status and readiness tracker;
9. release notes and public claims.

## Preserved long-horizon outcome

The complete intended system is a local-first capability network in which:

- people retain independently controlled nodes and portable evidence;
- agents and services can act only through explicit, attributable and bounded machine authority;
- actions receive assurance proportionate to consequence;
- low-assurance history can be reassessed without being rewritten;
- voluntary Circles coordinate through transparent charters;
- institutions represent formal roles, duties, review and continuity;
- jurisdictions and sovereign states can map their existing structures;
- sovereign deployments retain their own constitutional and cryptographic roots;
- treaty domains enable negotiated recognition without global ownership;
- governance patterns can be observed, simulated, adapted and adopted locally;
- consensus is used selectively rather than universally;
- all claims remain bounded by the capability registry and evidence.
