# AXIOM-MESH Documentation

**Status:** canonical current-build index

**Updated:** 2026-08-12

**Active build:** `0.12.0-dev.3`

**Supported runtime:** [`mesh/`](../mesh/README.md)

This index defines the supported documentation boundary for the active
development build. Documents on `main` describe the current kernel, product
programme, operations, security/evidence boundary, promotion state,
future-compatible architecture, historical review evidence, or source
provenance.

Superseded pre-current-build documentation remains on locked branch
`deprecated/pre-0.12-documentation-corpus`. Historical audits/reviews retained
on `main` keep their original dates when the date is part of the evidence; they
are not rewritten to appear current.

## Current project state

AXIOM-MESH is simultaneously:

1. a production-candidate single-node authority/evidence kernel awaiting
   authentic pilot and independent-review evidence;
2. a constrained machine-principal substrate with finite human-sponsored
   authority, policy-filtered discovery, and Grid-attested terminal receipts;
3. a human-product programme beginning with AXIOM One, AXIOM Verify, and
   invitation-based Circles;
4. a replaceable-runtime programme with a byte-pinned Agent Runtime Adapter v1
   contract but no certified/exposed third-party runtime;
5. a built evidence-first repository-document effect prototype that can reach a
   deterministic **open draft pull request** in tests but remains deliberately
   **production-unreachable**; and
6. an isolated frontier programme for distributed authority, settlement,
   autonomy, regulated domains, embodied systems, arbitrary code, zk,
   post-quantum migration, plural governance, and protocol-neutral agent
   interoperability.

Only [`mesh/config/capabilities.json`](../mesh/config/capabilities.json)
establishes what is currently runnable. The registry tracks 49 capabilities,
of which 31 are marked implemented.

The lifecycle is explicit: **built -> enabled -> exposed -> production-promoted
-> marketed**. Those states must not be conflated.

## Documentation ownership and consolidation

The corpus is intentionally split by decision type. Do not copy current-build
counts, capability claims, promotion decisions, or non-claims into research,
roadmap, review, or migration documents. Link to the owner instead.

| Question | Owning document | What belongs there | What does not belong there |
|---|---|---|---|
| What can run now? | [`mesh/config/capabilities.json`](../mesh/config/capabilities.json) and generated [`rebuild/STATUS.md`](rebuild/STATUS.md) | Registry state, digest, implementation classification | Roadmap promises or test-only features |
| What is true about this build? | [`PROJECT-STATUS-2026.md`](PROJECT-STATUS-2026.md) | Current scope, evidence boundary, blockers, and non-claims | Detailed future sequencing |
| Can it be promoted? | [`PRODUCTION-READINESS-TRACKER.md`](PRODUCTION-READINESS-TRACKER.md) | Gate status, evidence, owner, and remaining action | Aspirational milestones |
| How is the system designed? | [`whitepapers_and_research/WHITEPAPER.md`](whitepapers_and_research/WHITEPAPER.md) | Integrated architecture, principles, trust boundaries, and design rationale | Independent current status or release decisions |
| What should be built next? | [`ROADMAP.md`](ROADMAP.md) and [`MASTER-TODO.md`](MASTER-TODO.md) | Sequenced outcomes, acceptance criteria, and executable queue | New capability claims |
| How should future domains evolve? | [`ROADMAP-EXTENSION-AGENT-INTEROPERABILITY.md`](ROADMAP-EXTENSION-AGENT-INTEROPERABILITY.md), [`ROADMAP-EXTENSION-PLURAL-AUTHORITY.md`](ROADMAP-EXTENSION-PLURAL-AUTHORITY.md), and their `rebuild/` specifications | Future-compatible architecture, laboratories, and promotion gates | Current implementation status |
| Why does a document or branch exist? | [`REPOSITORY-MIGRATION.md`](REPOSITORY-MIGRATION.md), dated audits, and dated reviews | Provenance, historical findings, and archive boundaries | Current-build authority |

### Reading paths

Use **status -> registry -> readiness -> white paper -> roadmap -> requirements**
for a current technical decision. Use **white paper -> the relevant `rebuild/`
specification -> roadmap extension -> master todo -> review** for agent
interoperability or plural-authority design work. Use **migration -> dated audit
or review** when the question is provenance or why a boundary exists.

When two documents appear to disagree, resolve the conflict in this order:

1. executable code, machine-readable policy, and the capability registry;
2. normative requirements and generated status;
3. project status and readiness tracker;
4. white paper and architecture specifications;
5. roadmaps, master todos, reviews, audits, and historical migration records.

The lower item may explain or challenge the higher item, but it must not silently
override it. A change to the current build must update the owning document and
then its navigation links; it does not require rewriting historical reviews.

## Current evidence/authority semantics

Current documentation must preserve these distinctions:

- machine runtime/software identifiers are attribution metadata, not TPM/TEE or
  remote-attestation proof;
- `/v1/machine-discovery` describes requestability, not permission;
- a Grid-attested receipt proves the signed Grid statement, not arbitrary
  external-world truth;
- local Grid hash-chain verification detects modification but does not by
  itself prove absence of a consistently deleted suffix with matching local
  head/checkpoint rewrite;
- truncation assurance through a retained sequence additionally requires
  externally retained `axiom-grid-continuity-anchor.v1` plus full-chain
  verification, and ends at the newest retained anchor;
- Agent Runtime Adapter v1 synthetic conformance proves the contract boundary,
  not OpenClaw/Hermes/Agent Zero/MCP/A2A/other-runtime certification;
- the repository resolver/outbox/operator prototype proves a bounded
  evidence-first effect path, not current production reachability;
- its GitHub operator independently verifies durable Grid preparation before
  any GitHub request, permits only exact planned docs changes on a deterministic
  effect branch, and creates/recovers an **open draft pull request**;
- that operator has **no merge/direct-main authority** and explicitly records
  `merge_performed: false` and `base_branch_content_changed: false`;
- production activation remains closed because the executor registry has zero
  mappings, production policy lacks `repository.docs.pull-request.create`, and
  no supported public/runtime route invokes the chain; and
- synthetic pilot/security-review fixtures prove verifier behavior, not
  authentic deployment or independent-review facts.

## Canonical documents

### Direction, status, and release truth

- [Root README](../README.md) — project entry point and current supported build.
- [Project status](PROJECT-STATUS-2026.md) — current implementation,
  production-unreachable work, blockers, and non-claims.
- [Roadmap](ROADMAP.md) — strategic phases and promotion gates.
- [Master execution queue](MASTER-TODO.md) — active executable work ordering.
- [Production-grade definition](PRODUCTION-GRADE.md) — production-grade meaning.
- [Production-readiness tracker](PRODUCTION-READINESS-TRACKER.md) — gate evidence
  and authentic promotion blockers.
- [0.12.0-dev.3 build notes](releases/0.12.0-dev.3.md) — current development-line
  implementation narrative.
- [Technical white paper](whitepapers_and_research/WHITEPAPER.md) — integrated
  architecture, authority, evidence, product, runtime, and non-claim model.

### Normative rebuild and traceability

- [Product definition](rebuild/PRODUCT-DEFINITION.md)
- [Normative requirements](rebuild/REQUIREMENTS.md)
- [Source traceability](rebuild/SOURCE-TRACEABILITY.md)
- [Generated capability status](rebuild/STATUS.md)
- [Rollback requirements](rebuild/ROLLBACK.md)
- [Long-horizon capability map](rebuild/LONG-HORIZON-CAPABILITY-MAP.md)
- [Adaptive assurance and plural authority](rebuild/ADAPTIVE-ASSURANCE-AND-PLURAL-AUTHORITY.md)
- [Agent interoperability and capability substrate](rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md)
- [Agent interoperability capability map](rebuild/AGENT-INTEROPERABILITY-CAPABILITY-MAP.md)

### Roadmap extensions

- [Plural-authority roadmap extension](ROADMAP-EXTENSION-PLURAL-AUTHORITY.md)
- [Plural-authority execution queue](MASTER-TODO-PLURAL-AUTHORITY.md)
- [Agent-interoperability roadmap extension](ROADMAP-EXTENSION-AGENT-INTEROPERABILITY.md)
- [Agent-interoperability execution queue](MASTER-TODO-AGENT-INTEROPERABILITY.md)

Roadmap extensions are future-compatible planning inputs; they do not override
the capability registry or current production-readiness decision.

### Architecture

- [Scaling, distributed authority, and consensus](architecture/SCALING-DISTRIBUTED-AUTHORITY-AND-CONSENSUS.md)
- [Agent worktree storage plane](architecture/AGENT-WORKTREE-STORAGE-PLANE.md) —
  laboratory architecture for logically isolated agent workspaces over
  replaceable storage-efficient backing profiles; includes an explicit
  non-production benchmark and promotion programme.
- [Agent Runtime Adapter conformance](architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md)
- [`agent-runtime-adapter.v1` schema](architecture/contracts/agent-runtime-adapter.v1.schema.json)
- [Personal Compute Fabric and Local Trust Plane](architecture/PERSONAL-COMPUTE-FABRIC-AND-LOCAL-TRUST.md)
  — contract-first wearable, portable-agent, interchangeable orchestration,
  compute-routing, local verification, identity-presentation, and
  payment-mandate architecture with a phased MVP and explicit non-claims.

#### Draft architecture contracts

- [Personal Agent Pack v1](architecture/contracts/personal-agent-pack.v1.schema.json)
- [Agent Runtime Capsule v1](architecture/contracts/agent-runtime-capsule.v1.schema.json)
- [Agent Runtime Adapter v1](architecture/contracts/agent-runtime-adapter.v1.schema.json)
- [Compute Node Profile v1](architecture/contracts/compute-node-profile.v1.schema.json)
- [Local Trust Envelope v1](architecture/contracts/local-trust-envelope.v1.schema.json)

These JSON Schemas are documentation contracts. The current runtime loads only
the separately byte-pinned Agent Runtime Adapter contract; it does not load the
other four drafts or promote any capability or external compatibility claim.

### Security

- [Current-build threat model](security/CURRENT-BUILD-THREAT-MODEL.md)
- [Independent security review](security/INDEPENDENT-SECURITY-REVIEW.md)
- [Credential-history revocation](security/CREDENTIAL-HISTORY-REVOCATION.md)
- [Deny-egress boundary](security/DENY-EGRESS-BOUNDARY.md)
- [Incident response and tabletop](security/INCIDENT-RESPONSE-AND-TABLETOP.md)

### Operations

- [Automated source setup](operations/AUTOMATED-SOURCE-SETUP.md)
- [Explicit service network policy](operations/EXPLICIT-SERVICE-NETWORK-POLICY.md)
- [Gateway client contract](operations/GATEWAY-CLIENT-CONTRACT.md)
- [AXIOM One local preview](operations/AXIOM-ONE-LOCAL-PREVIEW.md)
- [External telemetry and alerting](operations/EXTERNAL-TELEMETRY-AND-ALERTING.md)
- [Request pressure and dependency loss](operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md)
- [Mutually authenticated transport](operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md)
- [Independent service units](operations/INDEPENDENT-SERVICE-UNITS.md)
- [Admitted-node discovery and scheduling](operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md)
- [Online causal exchange](operations/ONLINE-CAUSAL-EXCHANGE.md)
- [Deployment-independent providers](operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md)
- [Pilot deployment dossier](operations/PILOT-DEPLOYMENT-DOSSIER.md)

### Dated reviews/audits retained as evidence

- [Scalability audit — 2026-07-30](audits/SCALABILITY-AUDIT-2026-07-30.md)
- [Audit hardening G5-G9 — 2026-08-10](audits/AUDIT-HARDENING-G5-G9-2026-08-10.md)
- [Plural-authority architecture review — 2026-08-03](reviews/PLURAL-AUTHORITY-ARCHITECTURE-REVIEW-2026-08-03.md)
- [Agent-interoperability architecture review — 2026-08-09](reviews/AGENT-INTEROPERABILITY-ARCHITECTURE-REVIEW-2026-08-09.md)

### Repository/contributor governance

- [Repository migration](REPOSITORY-MIGRATION.md)
- [Production runbook](../mesh/PRODUCTION.md)
- [Kernel README](../mesh/README.md)
- [Constitution](../CONSTITUTION.md)
- [Contribution guide](../CONTRIBUTING.md)
- [Security policy](../SECURITY.md)

## Runtime pin authority

Do not collapse CI and production pins into one value. The current setup policy
requires Node.js `>=24.14.0 <25`, pins protected CI and `.node-version` to
**24.18.0**, and pins the candidate production image to **24.19.0**.

## Supported documentation boundary

`mesh/src/check-docs.mjs` defines the canonical documentation allowlist and
fails on missing/unexpected current documents, broken local links, security-
policy drift, missing required sections, Agent Runtime Adapter contract drift,
capability-count drift, Gateway-route drift, or internal-network-route drift.

A dedicated current-state documentation regression suite additionally locks the
machine-principal, Grid continuity, repository-effect production-reachability,
draft-PR/no-merge, and external-runtime non-certification semantics.

Structural verification does not make historical documents current; dated audit
and review records remain dated evidence.

## Reading order

For a current technical assessment:

1. [Project status](PROJECT-STATUS-2026.md)
2. [Capability registry](../mesh/config/capabilities.json)
3. [Product definition](rebuild/PRODUCT-DEFINITION.md)
4. [Requirements](rebuild/REQUIREMENTS.md)
5. [Current threat model](security/CURRENT-BUILD-THREAT-MODEL.md)
6. [Production-readiness tracker](PRODUCTION-READINESS-TRACKER.md)
7. [Source traceability](rebuild/SOURCE-TRACEABILITY.md)
8. [Technical white paper](whitepapers_and_research/WHITEPAPER.md)
9. [Roadmap](ROADMAP.md) and [execution queue](MASTER-TODO.md)

For future agent-runtime or plural-governance work, add the corresponding
roadmap extension only after the current-state material above.
