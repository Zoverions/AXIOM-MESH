# AXIOM-MESH Documentation

**Status:** canonical index

**Updated:** 2026-07-29

**Active build:** `0.12.0-dev.0`

**Supported runtime:** [`mesh/`](../mesh/README.md)

This index is the complete documentation boundary for the supported
development build. Every document present under `docs/` on `main` supports the
current kernel, its operation, its security boundary, or its provenance.
Superseded and aspirational material is retained only on the locked
`deprecated/pre-0.12-documentation-corpus` branch.

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
- [Current-build threat model](security/CURRENT-BUILD-THREAT-MODEL.md)
- [Independent security review intake](security/INDEPENDENT-SECURITY-REVIEW.md)
- [Automated current-build source setup](operations/AUTOMATED-SOURCE-SETUP.md)
- [Explicit service network policy](operations/EXPLICIT-SERVICE-NETWORK-POLICY.md)
- [External telemetry and alert routing](operations/EXTERNAL-TELEMETRY-AND-ALERTING.md)
- [Request pressure and dependency loss](operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md)
- [Mutually authenticated service transport](operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md)
- [Independent service units and failure isolation](operations/INDEPENDENT-SERVICE-UNITS.md)
- [Admitted-node discovery and capability-aware scheduling](operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md)
- [Operator-approved online causal exchange](operations/ONLINE-CAUSAL-EXCHANGE.md)
- [Deployment-independent secret and policy providers](operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md)
- [Pilot deployment dossier verification](operations/PILOT-DEPLOYMENT-DOSSIER.md)
- [Incident response and automated tabletop](security/INCIDENT-RESPONSE-AND-TABLETOP.md)
- [0.12.0-dev.0 build notes](releases/0.12.0-dev.0.md)
- [Production deployment runbook](../mesh/PRODUCTION.md)
- [Rollback runbook](rebuild/ROLLBACK.md)
- [Current source traceability](rebuild/SOURCE-TRACEABILITY.md)
- [Generated capability status](rebuild/STATUS.md)
- [Security policy](../SECURITY.md)

## Supported documentation boundary

`mesh/src/check-docs.mjs` contains the exact allowlist for current
documentation. Protected CI fails when:

- a file exists under `docs/` but is not in that allowlist;
- a required current-build document is absent;
- a local link points to a removed or missing file;
- root and GitHub security policies differ;
- a required section or minimum content boundary is missing.

The published `v0.11.0` release remains immutable and is not redefined by the
current build. Its release page contains its original notes and artifacts. The
active `main` build is `0.12.0-dev.0`, and its version-specific state is recorded
in the current build notes.

The deprecated documentation branch is read-only, rejects force pushes, and
cannot be deleted. Material on that branch is provenance, not a supported API,
runbook, product promise, or release claim. The older pre-clean-room
implementation is separately preserved by the immutable
`archive/legacy-main-pre-clean-room-2026-05-21` tag.

## Contributor path

For a production-impacting change:

1. update code and negative-path tests;
2. update the capability registry if status or evidence changes;
3. update the affected canonical document and operator runbook;
4. run the kernel check and release verifier;
5. attach CI and runtime evidence before promoting a capability.

Claims that cannot be kept current must be removed from `main`, not merely
labeled historical beside supported material. If provenance must be preserved,
it belongs on the locked deprecated documentation branch. Security records
needed to prove the current trust boundary remain current documentation even
when they refer to archived objects.
