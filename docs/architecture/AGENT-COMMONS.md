# AXIOM Agent Commons

**Status:** architecture / contribution-interface draft  
**Capability impact:** none  
**Canonical public collaboration surface:** GitHub

## Purpose

Agent Commons is the proposed public collaboration layer between AXIOM-MESH and external digital agents, agent runtimes, automated reviewers, research systems, and agent-native communities.

Its purpose is to let outside systems discover bounded work, critique architecture, reproduce evidence, propose patches, and return verifiable results without becoming an alternate authority plane.

Core invariant:

> **External agents may contribute evidence and proposals. They do not acquire AXIOM authority from participation, popularity, runtime identity, or successful prior work.**

## Position in the architecture

```text
external agents / communities / runtimes
                 |
                 v
          Agent Commons
  discovery / challenges / feedback
       contribution envelopes
                 |
                 v
       GitHub issues / draft PRs
                 |
       protected CI + review
                 |
                 v
             AXIOM-MESH
       authority + evidence
```

Agent Commons is not a replacement for GitHub and not a second source of repository truth. Mirrors and external communities may advertise or index work, but canonical issue, pull-request, branch, release, and capability state remains on the declared repository surface.

## Protocol boundary

AXIOM should remain protocol-neutral internally and standard-compatible at the edges.

Candidate interoperability roles:

- **A2A-compatible discovery/task exchange** for agent-to-agent discovery and bounded task negotiation;
- **MCP-compatible read-only resources/tools** for public documentation, capability status, verification helpers, and challenge discovery;
- external community adapters for announcements, mirrors, and feedback intake;
- GitHub for canonical issues, pull requests, protected checks, and review state.

No protocol adapter may bypass the normal AXIOM authority sequence or mint capabilities merely because an external peer requested work.

## Machine-readable object set

The first draft object family is deliberately small:

1. `axiom-agent-challenge.v1` — a bounded public work request;
2. `axiom-agent-contribution.v1` — a returned implementation/reproduction package;
3. `axiom-agent-feedback.v1` — criticism, review, risk, or research feedback that may not contain a patch.

Schemas live under `docs/architecture/contracts/`.

These are exchange contracts, not proof that an external agent, runtime, identity, or network is trustworthy.

## Challenge model

A challenge should bind at least:

- challenge/task identity;
- canonical repository;
- exact base commit SHA;
- problem statement;
- allowed or relevant scope;
- prohibited effects;
- acceptance criteria;
- evidence expectations;
- security/disclosure route;
- claim boundary.

A challenge may invite analysis or patches. It must not imply that completing the challenge grants authority, payment, production access, merge rights, or reputation weight beyond what a separate policy explicitly defines.

## Contribution model

A contribution should preserve enough information to review and reproduce the work:

- contributor/agent identity as asserted or externally verifiable;
- runtime/model/tool metadata where known and relevant;
- source challenge if any;
- repository and exact base SHA;
- changed paths or inspected scope;
- commands/tests actually executed;
- observations and artifacts;
- assumptions, uncertainty, and unresolved cases;
- explicit statement that repository merge authority is not requested by the envelope.

A contribution can be useful even when it fails. Reproduced failures and negative findings are evidence.

## Feedback model

Feedback is first-class because high-value work is often not a patch.

Examples:

- threat-model criticism;
- architecture counterexample;
- benchmark reproduction;
- unsupported-claim finding;
- interoperability mismatch;
- recovery failure mode;
- privacy leakage hypothesis;
- scalability bottleneck;
- test-gap proposal.

Feedback must distinguish observation, inference, proposal, and unverified hypothesis.

## Reputation and trust

Social popularity, follower count, karma, model brand, benchmark prestige, or self-described expertise must not become ambient authority.

A future reputation layer may summarize evidence-backed contribution history, for example:

- accepted or rejected findings;
- reproduced results;
- tests that continue to pass;
- security findings confirmed independently;
- reversions or invalidated claims;
- provenance continuity.

Even a strong contribution history does not itself grant execution or merge authority. Reputation is evidence for review policy, not a capability token.

## Threat model

Treat all remote contribution surfaces as hostile-input boundaries.

Relevant threats include:

- prompt injection through issues, patches, agent cards, tool descriptions, or social content;
- malicious patches that weaken authority while preserving superficial tests;
- fabricated test/evidence claims;
- poisoned external artifacts or dependencies;
- Sybil/reputation gaming;
- identity spoofing;
- secret exfiltration attempts;
- oversized or resource-exhaustion submissions;
- stale-base patches that overwrite newer security work;
- social pressure to merge around protected review gates;
- malicious external mirrors misrepresenting capability status.

Required controls include exact-base binding, bounded inputs, protected CI, provenance capture, secret isolation, security-report routing, independent review for consequential changes, and no merge authority for external agents.

## GitHub integration

GitHub remains the front-facing source of collaboration truth.

Agent-oriented issue forms should support at least:

- implementation/contribution;
- architecture or security-adjacent feedback that is safe for public disclosure;
- reproduction/verification reports.

Security vulnerabilities that should not be public must follow `SECURITY.md` instead of public Agent Commons forms.

A future repository-effect adapter may prepare or create an open draft pull request only through separately authorized AXIOM policy. Draft creation is not merge authority.

## Initial read-only interoperability laboratory

The first external-facing runtime experiment should be read-only and expose only already-public state such as:

- project identity and claim boundary;
- selected public documentation;
- capability-registry status;
- open Agent Commons challenges;
- verification instructions;
- schema discovery.

It must not expose secrets, private Grid state, credentials, private memory, unpublished security findings, write tools, production execution routes, or implicit authority.

## External publication and mirrors

Agent-native communities may be used for discovery, announcements, technical challenges, and feedback intake.

Each external publication should be treated as a bounded projection or mirror. It should point back to the canonical GitHub repository and must not silently become the authority for release state, capability state, security status, or accepted contributions.

Where practical, retain publication provenance and external identifiers so announcements can later be audited or retracted without rewriting repository history.

## Promotion stages

### Stage A — repository contribution surface

- `AGENTS.md` machine entry point;
- Agent Commons architecture document;
- challenge/contribution/feedback schemas;
- agent-oriented GitHub issue forms;
- contract self-check in protected CI.

### Stage B — challenge registry laboratory

- machine-readable list of open challenges;
- exact base-SHA binding;
- bounded path and acceptance metadata;
- fixtures and negative tests.

### Stage C — read-only MCP/A2A laboratory

- public discovery only;
- no consequential tools;
- hostile-input tests;
- request and response bounds;
- no authority change.

### Stage D — external community adapters

- announcements and challenge mirrors;
- feedback ingestion with provenance;
- canonical-link enforcement;
- rate, size, abuse, and identity controls.

### Stage E — evidence-backed contribution reputation research

- portable contribution receipts;
- correction/invalidation history;
- Sybil/collusion analysis;
- no ambient authority derived from score.

Any write-capable external adapter requires a separate threat review, policy mapping, evidence model, negative tests, and promotion decision.

## Acceptance gates

1. External participation cannot change `mesh/config/capabilities.json` status without the normal reviewed repository process.
2. No Agent Commons contract grants merge, deployment, secret, or production execution authority.
3. Challenge and contribution objects bind an exact repository base SHA.
4. External social or agent-network state cannot override canonical GitHub state.
5. Public feedback and security-sensitive disclosure paths are clearly separated.
6. Protected CI checks the contract files and critical non-authority invariants.
7. A hostile external message or artifact cannot create a second authority path around `Gateway -> Hypervisor -> Sandbox -> Grid`.
8. Reputation, if later implemented, remains evidence and policy input rather than self-executing authority.
9. Read-only interoperability is proven before any write-capable adapter is considered.
10. Current documentation remains explicit about what is architecture, laboratory, implemented, enabled, exposed, production-promoted, and marketed.

## Current non-claims

This document does not claim:

- a deployed Agent Commons service;
- a production MCP or A2A endpoint;
- a verified cross-network agent identity system;
- autonomous code merging;
- autonomous capability promotion;
- production external-agent execution;
- a Sybil-resistant portable reputation network;
- trustworthy external agent cards or social profiles;
- a legal or economic reward system for contributions.

The first deliverable is a safer contribution surface, not an autonomous swarm.
