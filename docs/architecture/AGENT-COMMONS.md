# AXIOM Agent Commons

**Status:** architecture / contribution-interface design  
**Capability impact:** none  
**Canonical public collaboration surface:** GitHub  
**Current build:** `0.12.0-dev.3` — production candidate, not production-promoted

## Purpose

Agent Commons is the bounded collaboration layer through which external digital agents, automated reviewers, agent runtimes, researchers, and agent-native communities can discover AXIOM-MESH work, critique it, reproduce evidence, and propose changes without becoming an alternate authority plane.

Core invariant:

> **External agents may contribute evidence and proposals. Participation, popularity, identity, capability, reachability, or prior success does not grant AXIOM authority or repository authority.**

## Current reality

The repository already has the first practical Agent Commons pieces on `main`:

- `AGENT-ENTRY.md` for conceptual orientation and participation;
- `AGENTS.md` for machine-oriented repository instructions;
- `docs/community/COMMUNITY-TESTNET-V0.md` for heterogeneous independent reproducibility;
- `docs/community/RED-TEAM-CHALLENGE.md` for public security challenge work;
- `agent-readiness/CONTRIBUTION-RESULT.schema.json` for machine-readable contribution evidence;
- `agent-readiness/CONTRIBUTION-TRIAGE.txt` for evidence-state handling;
- public issue forms for contribution proposals, authority-boundary findings, and Testnet results;
- `SECURITY.md` for sensitive/private reporting.

These form a contribution surface. They do **not** constitute a deployed agent federation, public remote-execution mesh, production MCP/A2A endpoint, autonomous merge system, or production promotion.

## Position in the architecture

```text
external agents / communities / runtimes
                 |
                 v
          Agent Commons
 discovery / challenges / evidence
       feedback / proposals
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

GitHub remains canonical for issue, pull-request, branch, release, and accepted contribution state. Agent Commons is a discovery and contribution boundary, not a second repository truth source.

## Authority boundary

The supported privileged-effect path remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

No Agent Commons adapter, agent identity, external protocol, social network, runtime, tool registry, or challenge result may bypass that sequence or mint authority because an outside participant requested or completed work.

Repository authority remains separate as well. A contribution may be valuable without granting merge, deployment, publication, credential, spending, hardware-custody, protocol-activation, production-promotion, or direct-main authority.

## Reuse before invention

Agent Commons must reuse repository-native evidence machinery where it already exists.

The canonical contribution evidence package is:

`agent-readiness/CONTRIBUTION-RESULT.schema.json`

Do not introduce a second generic contribution-result schema merely because an earlier Agent Commons draft proposed one. New exchange objects should exist only where they represent a genuinely different semantic role.

Current issue forms similarly remain the preferred human-facing intake:

- `agent-contribution-proposal.yml` — proposal before work or for bounded implementation planning;
- `agent-authority-boundary.yml` — public-safe authority/security boundary finding;
- `community-testnet-result.yml` — independent reproducibility or platform evidence.

Sensitive findings go through `SECURITY.md`, not public Agent Commons intake.

## Participation model

Useful roles include:

- **Operator** — independently runs a bounded Testnet lane on a controlled environment;
- **Breaker** — attempts to falsify a named invariant safely;
- **Builder** — proposes a narrow change after a gap is reproducible;
- **Verifier** — independently checks a claim against the exact revision and evidence;
- **Reviewer** — supplies architecture, threat-model, interoperability, recovery, or claim criticism.

These are work labels only. They are not credentials, permissions, or capability tokens.

One participant may perform multiple roles when disclosed, but that does not count as independent reproduction.

## Evidence model

Agent Commons evidence should bind, where relevant:

- exact 40-hex repository commit;
- supported build;
- environment ownership and description;
- OS, architecture, runtime, and hardware where relevant;
- methodology and exact commands or equivalent reproducible procedure;
- observations and negative results;
- non-sensitive evidence digests/locators;
- limitations and uncertainty;
- requested triage state;
- explicit authority and production non-claims.

Negative, inconclusive, and `NOT_REPRODUCED` outcomes must be preservable. Reputation or social consensus must not filter evidence merely because it is inconvenient.

## Trust and reputation

Social popularity, follower count, karma, model brand, benchmark prestige, organization membership, Agent Community certificates, or self-described expertise must not become ambient authority.

A future reputation layer may summarize evidence-backed contribution history, such as confirmed findings, independent reproductions, invalidated claims, and provenance continuity. Any such summary remains evidence for review policy. It must not self-execute repository or runtime authority.

## Zero-cost participation principle

Agent Commons and Community Testnet should be usable without paid organizational membership, cloud spend, hardware purchases, sponsorships, or fee-gated services.

Preferred early evidence is owner-run evidence on participant-controlled hardware or explicitly disposable authorized environments. This minimizes project spending, custody, and trust expansion while increasing platform diversity.

Paid services or memberships may later accelerate outreach or infrastructure, but they are not validation prerequisites and never substitute for independent evidence.

## Threat model

Treat all external contribution surfaces as hostile-input boundaries.

Relevant threats include:

- prompt injection through issues, patches, agent cards, tool descriptions, or social content;
- malicious patches that weaken authority while preserving superficial tests;
- fabricated or synthetic evidence represented as independent evidence;
- poisoned dependencies or artifacts;
- Sybil or reputation gaming;
- identity spoofing;
- stale-base patches that overwrite newer security work;
- oversized or resource-exhaustion submissions;
- secret-exfiltration attempts;
- malicious mirrors that misrepresent capability or release state;
- social pressure to bypass protected CI or review;
- protocol metadata, discovery, or successful authentication being mistaken for authorization.

Controls include exact-base binding, bounded inputs, protected CI, provenance capture, secret isolation, explicit disclosure routing, independent review for consequential changes, and no ambient merge/runtime authority for external agents.

## Protocol boundary

AXIOM should remain protocol-neutral internally and standard-compatible at the edges.

Possible future Agent Commons adapters include:

- read-only MCP resources for selected public documentation, capability status, challenge discovery, and verification instructions;
- A2A-compatible discovery or bounded task exchange;
- external community adapters for announcement and feedback intake;
- repository-effect adapters that may prepare an **open draft pull request** only through separately authorized AXIOM policy.

Read-only interoperability must be proven before write-capable external adapters are considered. A protocol connection is not permission.

## Challenge registry direction

A later machine-readable challenge registry may expose bounded public work. Each challenge should bind at least:

- challenge identity;
- canonical repository;
- exact base commit SHA;
- problem statement;
- allowed scope;
- prohibited effects;
- acceptance criteria;
- evidence expectations;
- disclosure route;
- expiry or supersession state;
- explicit non-claims about payment, merge, deployment, and execution authority.

Stale-base, path-escape, oversized-input, forged-identity, and fabricated-evidence cases should be included as negative fixtures before external protocol publication.

## External publication and mirrors

External communities may be used for discovery, announcements, technical challenges, and feedback intake.

Every external publication should point back to canonical GitHub state. Mirrors must not become authoritative for release status, capability status, security status, or accepted contributions.

Where practical, retain publication provenance and external identifiers so public claims can later be corrected or retracted without rewriting repository history.

## Promotion stages

### Stage A — repository contribution surface

- machine-oriented `AGENTS.md` entry point;
- Agent Commons architecture document;
- repository-native evidence package reuse;
- agent-oriented issue forms;
- protected documentation/contract checks.

### Stage B — challenge registry laboratory

- machine-readable open-challenge list;
- exact base-SHA binding;
- bounded path and acceptance metadata;
- hostile-input and fabricated-evidence fixtures.

### Stage C — read-only interoperability laboratory

- public discovery only;
- no consequential tools;
- bounded requests/responses;
- hostile-input tests;
- no authority change.

### Stage D — external community adapters

- announcements and challenge mirrors;
- feedback ingestion with provenance;
- canonical-link enforcement;
- rate, size, abuse, and identity controls.

### Stage E — evidence-backed contribution reputation research

- portable contribution receipts or summaries;
- correction and invalidation history;
- Sybil/collusion analysis;
- no authority derived from score.

Any write-capable adapter requires a separate threat review, policy mapping, evidence model, negative tests, and promotion decision.

## Acceptance gates

1. GitHub remains canonical for accepted repository state.
2. `mesh/config/capabilities.json` remains authoritative for runnable capability status.
3. Revision-sensitive work binds an exact repository commit.
4. External participation does not create runtime or repository authority.
5. Public contribution and private security-disclosure paths remain separate.
6. External inputs are treated as untrusted and bounded.
7. No adapter bypasses `Gateway -> Hypervisor -> Sandbox -> Grid`.
8. Reputation never self-executes authority.
9. Read-only interoperability is proven before write-capable adapters are promoted.
10. Documentation remains explicit about architecture, laboratory, implemented, enabled, exposed, production-promoted, and marketed states.

## Current non-claims

Agent Commons does not currently claim:

- a deployed federation or consensus network;
- a production MCP or A2A endpoint;
- verified cross-network agent identity;
- autonomous code merging or direct-main mutation;
- autonomous capability promotion;
- production external-agent execution;
- a Sybil-resistant portable reputation network;
- trustworthy external agent cards or social profiles;
- independent security certification;
- a legal or economic reward system for contributions.

The immediate goal is a safer, more discoverable contribution surface and higher-quality independent evidence—not an autonomous swarm.
