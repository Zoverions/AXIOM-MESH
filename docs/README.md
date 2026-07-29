# AXIOM-MESH Documentation

**Status:** canonical index

**Updated:** 2026-07-28

**Supported runtime:** [`mesh/`](../mesh/README.md)

AXIOM-MESH contains a clean-room kernel and a much larger historical design
corpus. This index separates documents that govern the supported runtime from
documents retained as research, traceability, or migration input.

## Canonical documents

When documents disagree, use this order:

1. [`mesh/config/capabilities.json`](../mesh/config/capabilities.json) for
   runnable capability claims.
2. [`docs/rebuild/REQUIREMENTS.md`](rebuild/REQUIREMENTS.md) for normative
   requirements and security boundaries.
3. [`docs/rebuild/PRODUCT-DEFINITION.md`](rebuild/PRODUCT-DEFINITION.md) for
   supported product scope.
4. [`docs/PROJECT-STATUS-2026.md`](PROJECT-STATUS-2026.md) for the current
   release and deployment state.
5. [`docs/MASTER-TODO.md`](MASTER-TODO.md) for active execution priority.
6. [`docs/ROADMAP.md`](ROADMAP.md) for phased outcomes and promotion gates.

The main technical and operational references are:

- [Technical white paper](whitepapers_and_research/WHITEPAPER.md)
- [Production-grade definition](PRODUCTION-GRADE.md)
- [Production readiness tracker](PRODUCTION-READINESS-TRACKER.md)
- [Repository migration record](REPOSITORY-MIGRATION.md)
- [Deprecated credential-history revocation](security/CREDENTIAL-HISTORY-REVOCATION.md)
- [Candidate container deny-egress boundary](security/DENY-EGRESS-BOUNDARY.md)
- [External telemetry and alert routing](operations/EXTERNAL-TELEMETRY-AND-ALERTING.md)
- [Request pressure and dependency loss](operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md)
- [Incident response and automated tabletop](security/INCIDENT-RESPONSE-AND-TABLETOP.md)
- [0.11 release notes](releases/0.11.0.md)
- [Runtime architecture](architecture/ARCHITECTURE.md)
- [Production deployment runbook](../mesh/PRODUCTION.md)
- [Rollback runbook](rebuild/ROLLBACK.md)
- [Generated capability status](rebuild/STATUS.md)
- [Security policy](../SECURITY.md)

## Documentation classes

| Class | Meaning | May support a release claim? |
|---|---|---|
| Canonical | Bound to current code, registry, and release gates | Yes |
| Operational | Executable runbook for the supported kernel | Yes, after verification |
| Specification | Required behavior not necessarily implemented | No |
| Research | Design exploration or hypothesis | No |
| Historical | Superseded implementation or narrative | No |

Files outside the canonical list must not override current code, the capability
registry, or generated release evidence.

## Contributor path

For a production-impacting change:

1. update code and negative-path tests;
2. update the capability registry if status or evidence changes;
3. update the affected canonical document and operator runbook;
4. run the kernel check and release verifier;
5. attach CI and runtime evidence before promoting a capability.

The documentation checker validates required canonical documents, minimum
content, security-policy parity, and local links. A link or claim that cannot
be kept current should be removed from canonical documents or moved into a
clearly labeled research/historical file.

## Historical documents

The legacy Gateway, Hypervisor, Sandbox, Grid, contracts, installers,
dashboards, and multi-domain plans remain useful for requirement extraction.
They are not supported deployment surfaces. In particular, historical
documents may describe tokens, bridges, BFT consensus, zkML, autonomous
research, universal installers, or domain systems that the current capability
registry marks disabled, specified, experimental, or adapter-required.

Historical Git ancestry may contain removed credentials. Any credential that
ever appeared there is revoked by policy and must never be reused. The
canonical keyed inventory, supported-tip gate, and external disposition
procedure are documented in
[`security/CREDENTIAL-HISTORY-REVOCATION.md`](security/CREDENTIAL-HISTORY-REVOCATION.md).
