# AXIOM-MESH Institutional and Community Outreach

**Updated:** 2026-08-20

This document complements [LAUNCH-PACK.md](LAUNCH-PACK.md). The launch pack is aimed at broad developer and social communities. This page is for organizations, working groups, foundations, security communities, and support programmes where a concrete collaboration request is more useful than a general project announcement.

The objective is not endorsement. The useful outcomes are:

- independent operators for [Community Testnet v0](COMMUNITY-TESTNET-V0.md);
- independent security reproductions and bounded `NOT_REPRODUCED` results;
- protocol/authority criticism from agent interoperability builders;
- unusual hardware and platform coverage;
- maintainership/security mentorship;
- infrastructure, credits, or grant support where appropriate;
- eventual independent review when the project is mature enough to justify it.

## Message discipline

Every outreach should preserve these boundaries:

- supported build: `0.12.0-dev.3` unless the repository has moved to a later verified build;
- production candidate, **not production-promoted**;
- GitHub remains the canonical repository collaboration surface;
- Community Testnet v0 is a distributed evidence network, **not** live AXIOM federation or consensus;
- capability, discovery, identity, participation, and reputation are not authority;
- a community relationship is not certification;
- a green external run is evidence for a scoped claim, not proof that the system is secure;
- sensitive security findings go through `SECURITY.md`.

Before sending any dated outreach, re-check the target organization's current participation instructions rather than relying on this file as a live directory.

---

## 1. Agentic AI Foundation (AAIF)

Current relevance: AAIF is a Linux Foundation home for open agent infrastructure and standards, including MCP, AGENTS.md, and related agentic ecosystem work.

Official starting points:

- https://aaif.io/
- https://github.com/aaif
- https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation

### Collaboration ask

Do not present AXIOM-MESH as a competing orchestration framework. Present it as a falsifiable authority/evidence layer question underneath interoperability:

> As agent discovery and interoperability become standardized, where should caller-specific authority live so that discovering or connecting to a capability does not itself become permission to invoke it?

Useful asks:

- one or more Testnet v0 operators from different runtimes/platforms;
- review of the discovery-vs-authority boundary;
- examples where MCP/A2A-style capability discovery creates hard authorization composition problems;
- feedback on a future read-only interoperability laboratory that preserves native AXIOM authority semantics.

### Short outreach packet

**Subject / opener:** Testing the boundary between agent discovery and authority

AXIOM-MESH is an open-source local-first authority and evidence substrate for human and machine agents. Its central invariant is that capability, discovery, identity, and connectivity do not by themselves create permission for a consequential effect.

I am looking for builders willing to attack that distinction rather than endorse the project. We have a public Community Testnet v0 for running exact revisions on independent machines and returning reproducible evidence, plus a focused authority-boundary red-team challenge.

The current build does not claim a production MCP/A2A endpoint, federation, remote execution, or consensus. I am especially interested in cases where interoperability metadata or multi-agent composition makes caller-specific authority difficult to preserve.

Repository: https://github.com/Zoverions/AXIOM-MESH

---

## 2. OWASP Agentic Security Initiative

Current relevance: OWASP's Agentic Security Initiative focuses specifically on autonomous agents, multi-step workflows, MCP security, and the OWASP Top 10 for Agentic Applications.

Official starting point:

- https://genai.owasp.org/initiatives/agentic-security-initiative/

### Collaboration ask

The strongest offer is a **live reference target**, not a request for generic advice.

Useful asks:

- map one OWASP agentic risk to an AXIOM falsification target;
- have independent participants attempt the target on exact commits;
- compare AXIOM's authority model to role-confusion, tool-misuse, memory/provenance, delegation, and chained-action risks;
- identify important risk classes the current red-team catalog misses;
- eventually invite an independent review only after the repository-native evidence intake has demonstrated that outside results can be handled correctly.

### Short outreach packet

**Opener:** Open reference target for agent authority-boundary testing

AXIOM-MESH is trying to make one security claim executable: an agent should not be able to convert capability, discovery, identity, credentials, or protocol reachability into authority that was never explicitly granted.

Rather than asking for an endorsement, I am offering the repository as a bounded red-team target. The project has a public threat model, negative-path tests, a contribution-result format, and a Community Testnet v0 for independent environments.

A useful result can be a reproduced failure or a carefully bounded `NOT_REPRODUCED` result. Sensitive findings have a separate private reporting path.

Repository: https://github.com/Zoverions/AXIOM-MESH

---

## 3. OpenSSF and Alpha-Omega

Current relevance: OpenSSF working groups are open to individual participation, including AI/ML Security, supply-chain integrity, repository security, security tooling, and related projects. Alpha-Omega is an OpenSSF-associated project focused on improving the security of important open-source software.

Official starting points:

- https://openssf.org/getinvolved/
- https://openssf.org/community/openssf-working-groups/
- https://openssf.org/community/alpha-omega/

### Collaboration ask

AXIOM-MESH should first enter this ecosystem as an open-source security project seeking technical criticism and maintainership discipline, not by assuming it qualifies for funding or formal review.

Useful asks:

- feedback from AI/ML Security participants on agent-specific threat modeling;
- reproducibility operators for Windows, macOS, Linux/ARM, and constrained hosts;
- advice on security-baseline adoption and project security metadata;
- vulnerability-disclosure and maintainer-process review;
- later exploration of Alpha-Omega or other support only if the project reaches the relevance/maturity criteria those programmes actually use.

### Short outreach packet

**Opener:** Seeking open-source security review of an agent authority/evidence kernel

AXIOM-MESH is a dependency-minimal Node.js kernel exploring deny-dominant authority and evidence for AI agents. It separates technical capability from permission and keeps its production claims narrower than its roadmap.

I am looking for maintainers/security engineers willing to run exact revisions on independent systems or try to falsify named authority invariants. Results are recorded with exact commits, environment, method, evidence, and limitations; participation grants no repository or runtime authority.

I would also value criticism of the project's security process itself: disclosure, reproducibility, supply-chain posture, and claim discipline.

Repository: https://github.com/Zoverions/AXIOM-MESH

---

## 4. TODO Group — Agentic AI to Empower OSPOs

Current relevance: the TODO Group working group explores practical, safe, and responsible use of AI agents in Open Source Program Office workflows, including governance, licensing, contribution, and policy implications.

Official starting point:

- https://todogroup.org/working-groups/agentic-ai/

The working group currently publishes its repository, a `#wg-ai-agents` Slack channel, and a bi-weekly community call through the TODO Group community calendar.

### Collaboration ask

This group is a strong place to test whether AXIOM's authority vocabulary is useful to organizations rather than only security researchers.

Useful asks:

- critique the distinction between contribution capability and repository authority;
- test how an OSPO would express approved agent actions, prohibited actions, purpose, evidence, and revocation;
- use the docs-only repository operator and Agent Contributor roadmap as concrete governance examples without presenting them as autonomous maintainer authority;
- recruit organizational Testnet operators for ordinary enterprise platforms.

### Short outreach packet

**Opener:** How should OSPOs separate agent capability from repository authority?

AXIOM-MESH is an open-source experiment in making agent authority explicit rather than inferring it from tool access or credentials. GitHub remains the repository authority surface; agent participation, successful tests, or reputation do not automatically grant merge or deployment rights.

I am interested in whether this model maps cleanly onto real OSPO workflows: contribution triage, security review, repository automation, policy checks, and evidence retention.

We also have a Community Testnet v0 that lets organizations contribute reproducibility evidence without granting their test machines any AXIOM authority.

Repository: https://github.com/Zoverions/AXIOM-MESH

---

## 5. DNS-AID and adjacent agent-discovery infrastructure

Current relevance: the Linux Foundation announced DNS-AID in 2026 as an open approach to decentralized discovery and verification of agents and MCP servers.

Official background:

- https://www.linuxfoundation.org/press/linux-foundation-announces-dns-aid-project-to-advance-decentralized-ai-agent-discovery

### Collaboration ask

This is an **adjacent research conversation**, not an integration claim.

AXIOM's useful question is:

> Once an agent or MCP server can be discovered and authenticated, what evidence turns that discovery into a caller-specific permission decision for a particular purpose and effect?

A future laboratory could test discovery projections against AXIOM's non-authorizing machine-discovery doctrine. Do not add DNS-AID, MCP, or any other discovery mechanism to the production authority path merely because it is standardized.

---

## 6. NLnet and other support programmes

NLnet is relevant because its funding programmes support open, resilient, user-empowering internet technology. As of **2026-08-20**, NLnet's application page states that regular calls are temporarily closed and will reopen **2026-09-03**, with the next stated deadline **2026-11-03 at 12:00 CEST**.

Official application page:

- https://nlnet.nl/propose/

### Preparation before the call

Prepare a proposal around a concrete public-good deliverable rather than "fund AXIOM-MESH" in general. Strong candidate scopes include:

- Community Testnet tooling and reproducibility automation;
- independent security review and remediation support;
- sovereign/local-first agent authority infrastructure;
- portable evidence/conformance tooling;
- cross-platform operator support, especially Apple Silicon and small ARM hardware;
- open interoperability research that preserves non-authorizing discovery.

The proposal must be updated against the actual call terms when they reopen. Do not state that funding is available or awarded before NLnet confirms it.

---

## 7. Hardware and infrastructure support

Not every useful supporter needs to write code. The Community Testnet gives us concrete asks for:

- an Apple Silicon machine/operator;
- Windows hosts across different editions/configurations;
- Linux ARM and Raspberry Pi-class hardware;
- home-server/NAS environments;
- low-memory or low-power systems;
- disposable cloud VM credits;
- long-running soak hosts;
- unusual filesystem/container/runtime environments.

A donated machine should **not** automatically become part of a production AXIOM network. Hardware custody, remote access, secrets, and deployment authority require separate explicit decisions. The safest first contribution is often for the owner to run the test lane themselves and submit evidence.

## Outreach funnel

Use one canonical funnel rather than creating a different intake process for every community:

```text
community conversation
  -> Community Testnet / Red-Team target
  -> exact commit + bounded method
  -> GitHub issue / contribution-result package
  -> independent reproduction where useful
  -> evidence triage
  -> patch / docs / no-change decision
  -> protected CI
  -> separate merge/promotion decision
```

This keeps community attention valuable without allowing attention, reputation, or organizational prestige to become an authority system.
