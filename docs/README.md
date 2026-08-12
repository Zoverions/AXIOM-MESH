# AXIOM-MESH Documentation

**Status:** canonical current-build index

**Updated:** 2026-08-12

**Active build:** `0.12.0-dev.3`

**Supported runtime:** [`mesh/`](../mesh/README.md)

This index defines the complete supported documentation boundary for the active
development build. Documents on `main` describe the current kernel, product
programme, operations, security boundary, evidence semantics, promotion state,
future-compatible architecture, historical audit/review evidence, or source
provenance.

Superseded pre-current-build documentation remains only on the locked
`deprecated/pre-0.12-documentation-corpus` branch. Historical documents kept on
`main` retain their original date when the date is part of the evidence (for
example a July 30 scalability audit or an August 3 architecture review); they
are not silently rewritten to look current.

## Current project state

AXIOM-MESH is simultaneously:

1. a production-candidate, single-node authority/evidence kernel awaiting
   authentic pilot and independent-review evidence;
2. a constrained machine-principal substrate with finite sponsored authority,
   policy-filtered discovery, and Grid-attested terminal receipts;
3. a human-product programme beginning with AXIOM One, AXIOM Verify, and
   invitation-based AXIOM Circles;
4. a replaceable-runtime programme with a byte-pinned Agent Runtime Adapter v1
   contract but no certified or exposed third-party runtime; and
5. an isolated frontier programme for distributed authority, settlement,
   autonomy, regulated domains, embodied systems, arbitrary code, zk
   verification, post-quantum migration, plural governance, and protocol-neutral
   digital-agent interoperability.

The tree also contains a signed resolver-backed repository-effect preparation
chain. It is built and adversarially tested but deliberately production-
unreachable: the production executor registry is empty, production policy has
no repository pull-request action, no public route invokes it, and no external
repository effect or merge is performed.

Only [`mesh/config/capabilities.json`](../mesh/config/capabilities.json)
establishes what is currently runnable. The current registry tracks 49
capabilities, of which 31 are marked implemented.

The development lifecycle distinguishes:

- **built**;
- **enabled**;
- **exposed**;
- **production-promoted**; and
- **marketed**.

These states must not be conflated.

## Evidence semantics that current documents must preserve

Current documentation uses several deliberately narrow distinctions:

- machine runtime/software identifiers are attribution metadata, not
  TPM/TEE/remote-attestation proof;
- machine discovery describes requestability, not permission;
- a Grid-attested receipt proves the signed Grid statement, not arbitrary
  external-world truth;
- local Grid hash-chain verification detects modification but does not by
  itself prove that no suffix was consistently deleted with matching local
  metadata rewrite;
- truncation assurance through a retained sequence additionally requires a
  valid externally retained `axiom-grid-continuity-anchor.v1` and full-chain
  verification;
- the runtime-adapter reference drill proves the candidate contract boundary,
  not conformance of OpenClaw, Hermes, Agent Zero, MCP, A2A, or another external
  runtime;
- resolver admission/preparation tests prove safe non-circular authority
  composition, not production repository mutation;
- synthetic pilot and independent-review fixtures prove verifier behavior, not
  authentic deployment or independent-review facts.

## Canonical documents

### Direction, status, and release truth

- [Root README](../README.md) — current project entry point and supported build.
- [Project status](PROJECT-STATUS-2026.md) — current implementation, built-but-
  unreachable work, blockers, and non-claims.
- [Roadmap](ROADMAP.md) — strategic phases and promotion gates.
- [Master execution queue](MASTER-TODO.md) — active work ordering.
- [Production-grade definition](PRODUCTION-GRADE.md) — what production grade
  means for this project.
- [Production-readiness tracker](PRODUCTION-READINESS-TRACKER.md) — evidence
  status and authentic promotion blockers.
- [0.12.0-dev.3 build notes](releases/0.12.0-dev.3.md) — current development-line
  build narrative.
- [Technical white paper](whitepapers_and_research/WHITEPAPER.md) — integrated
  architecture, trust, product, network, runtime, and non-claim model.

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
- [Repository source provenance](rebuild/SOURCE-TRACEABILITY.md)

### Roadmap extensions

- [Plural-authority roadmap extension](ROADMAP-EXTENSION-PLURAL-AUTHORITY.md)
- [Plural-authority execution queue](MASTER-TODO-PLURAL-AUTHORITY.md)
- [Agent-interoperability roadmap extension](ROADMAP-EXTENSION-AGENT-INTEROPERABILITY.md)
- [Agent-interoperability execution queue](MASTER-TODO-AGENT-INTEROPERABILITY.md)

`ROADMAP-EXTENSION-PLURAL-AUTHORITY.md` and
`ROADMAP-EXTENSION-AGENT-INTEROPERABILITY.md` are future-compatible extensions;
they do not override the current capability registry or production-readiness
decision.

### Architecture

- [Scaling, distributed authority, and consensus](architecture/SCALING-DISTRIBUTED-AUTHORITY-AND-CONSENSUS.md)
- [Agent Runtime Adapter conformance](architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md)
- [`agent-runtime-adapter.v1` schema](architecture/contracts/agent-runtime-adapter.v1.schema.json)

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

### Reviews and audits retained as dated evidence

- [Scalability audit — 2026-07-30](audits/SCALABILITY-AUDIT-2026-07-30.md)
- [Audit hardening G5-G9 — 2026-08-10](audits/AUDIT-HARDENING-G5-G9-2026-08-10.md)
- [Plural-authority architecture review — 2026-08-03](reviews/PLURAL-AUTHORITY-ARCHITECTURE-REVIEW-2026-08-03.md)
- [Agent-interoperability architecture review — 2026-08-09](reviews/AGENT-INTEROPERABILITY-ARCHITECTURE-REVIEW-2026-08-09.md)

### Repository and contributor governance

- [Repository migration](REPOSITORY-MIGRATION.md)
- [Production documentation](../mesh/PRODUCTION.md)
- [Kernel README](../mesh/README.md)
- [Root constitution](../CONSTITUTION.md)
- [Root contribution guide](../CONTRIBUTING.md)
- [Root security policy](../SECURITY.md)

## Supported documentation boundary

`mesh/src/check-docs.mjs` defines the canonical documentation allowlist. The
verification path fails when:

- a canonical document disappears;
- an unsupported Markdown file is added to the supported tree;
- a local documentation link is broken or escapes the repository;
- root and `.github` security policies drift;
- required sections disappear;
- the Agent Runtime Adapter contract drifts from its byte-pinned schema;
- computed capability counts drift from `capabilities.json`;
- the Gateway client route count drifts from the active client contract; or
- the internal service route count drifts from the active network policy.

The documentation checker verifies structural and computed-claim consistency;
reviewers must still update narrative current-state documents when new source
changes alter the meaning of those claims.

## Reading order

For a current technical assessment, read in this order:

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