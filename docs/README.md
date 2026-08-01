# AXIOM-MESH Documentation

**Status:** canonical current-build index

**Updated:** 2026-07-30

**Active build:** `0.12.0-dev.2`

**Supported runtime:** [`mesh/`](../mesh/README.md)

This index defines the complete documentation boundary for the supported
development build. Every document under `docs/` on `main` supports the current
kernel, its product programme, operation, security boundary, evidence,
promotion state, or provenance.

Superseded material remains only on the locked
`deprecated/pre-0.12-documentation-corpus` branch. Historical material may
inform new work, but it is not a supported API, product promise, deployment
claim, or alternate roadmap.

## Current project state

AXIOM-MESH is simultaneously:

1. a production-candidate, single-node capability kernel awaiting authentic
   pilot and independent-review evidence;
2. a human-product programme beginning with AXIOM One, AXIOM Verify, and
   invitation-based AXIOM Circles;
3. an isolated frontier-incubation programme for distributed authority,
   settlement, autonomy, regulated domains, embodied systems, arbitrary code,
   zk verification, and post-quantum migration.

Only the capability registry establishes what is currently runnable.

The roadmap distinguishes five states:

- **built**;
- **enabled**;
- **exposed**;
- **production-promoted**;
- **marketed**.

These states must not be conflated.

## Canonical documents

When documents disagree, use this order:

1. [`mesh/config/capabilities.json`](../mesh/config/capabilities.json) for
   runnable capability status and evidence.
2. [`docs/rebuild/REQUIREMENTS.md`](rebuild/REQUIREMENTS.md) for normative
   technical, security, product, human-interface, and promotion requirements.
3. [`docs/rebuild/PRODUCT-DEFINITION.md`](rebuild/PRODUCT-DEFINITION.md) for
   supported product scope, product family, and deliberate non-claims.
4. [`docs/PROJECT-STATUS-2026.md`](PROJECT-STATUS-2026.md) for the current build,
   deployment decision, and immediate milestones.
5. [`docs/PRODUCTION-READINESS-TRACKER.md`](PRODUCTION-READINESS-TRACKER.md) for
   production-promotion gates and open external evidence.
6. [`docs/MASTER-TODO.md`](MASTER-TODO.md) for executable work order.
7. [`docs/ROADMAP.md`](ROADMAP.md) for strategic phases and frontier incubation.
8. [`docs/whitepapers_and_research/WHITEPAPER.md`](whitepapers_and_research/WHITEPAPER.md)
   for the implementation-grounded architectural explanation.

A lower-authority narrative cannot promote a capability, weaken a requirement,
or override a current non-claim.

## Document roles

### Product and programme

- [Technical white paper](whitepapers_and_research/WHITEPAPER.md) — explains the
  kernel, product layer, human-product family, development posture, and frontier
  isolation.
- [Product definition](rebuild/PRODUCT-DEFINITION.md) — defines AXIOM-MESH,
  AXIOM One, Verify, Circles, Studio, Managed Node, product promises, and
  acceptance rules.
- [Normative requirements](rebuild/REQUIREMENTS.md) — defines mandatory
  technical, browser, accessibility, AI, collaboration, network, economic,
  domain, frontier, and claims behavior.
- [Project status](PROJECT-STATUS-2026.md) — records what is implemented, what is
  not claimed, and the two immediate priorities.
- [Roadmap](ROADMAP.md) — coordinates trust/operations, human utility/network
  activation, and frontier incubation.
- [Production execution queue](MASTER-TODO.md) — assigns concrete IDs,
  priorities, and acceptance evidence.
- [0.12.0-dev.2 build notes](releases/0.12.0-dev.2.md) — describes the current
  development line and its documentation/product-programme state.

### Production and operations

- [Production-grade definition](PRODUCTION-GRADE.md)
- [Production readiness tracker](PRODUCTION-READINESS-TRACKER.md)
- [Production deployment runbook](../mesh/PRODUCTION.md)
- [Automated source setup](operations/AUTOMATED-SOURCE-SETUP.md)
- [External telemetry and alert routing](operations/EXTERNAL-TELEMETRY-AND-ALERTING.md)
- [Request pressure and dependency loss](operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md)
- [Mutually authenticated service transport](operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md)
- [Independent service units](operations/INDEPENDENT-SERVICE-UNITS.md)
- [Explicit service network policy](operations/EXPLICIT-SERVICE-NETWORK-POLICY.md)
- [Versioned Gateway client contract](operations/GATEWAY-CLIENT-CONTRACT.md)
- [AXIOM One experimental local preview](operations/AXIOM-ONE-LOCAL-PREVIEW.md)
- [Admitted-node discovery and scheduling](operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md)
- [Operator-approved online causal exchange](operations/ONLINE-CAUSAL-EXCHANGE.md)
- [Deployment-independent providers](operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md)
- [Pilot deployment dossier verification](operations/PILOT-DEPLOYMENT-DOSSIER.md)

### Security and evidence

- [Security policy](../SECURITY.md)
- [Current-build threat model](security/CURRENT-BUILD-THREAT-MODEL.md)
- [Independent security review intake](security/INDEPENDENT-SECURITY-REVIEW.md)
- [Candidate deny-egress boundary](security/DENY-EGRESS-BOUNDARY.md)
- [Incident response and tabletop](security/INCIDENT-RESPONSE-AND-TABLETOP.md)
- [Deprecated credential-history revocation](security/CREDENTIAL-HISTORY-REVOCATION.md)

### Provenance and recovery

- [Repository migration record](REPOSITORY-MIGRATION.md)
- [Rollback runbook](rebuild/ROLLBACK.md)
- [Current source traceability](rebuild/SOURCE-TRACEABILITY.md)
- [Generated capability status](rebuild/STATUS.md)

## Supported documentation boundary

`mesh/src/check-docs.mjs` contains the exact allowlist for current
documentation. Protected CI fails when:

- a Markdown file exists in the supported tree but is not allowlisted;
- a required current-build document is absent;
- a local link points to a missing or escaping target;
- root and GitHub security policies differ;
- a required section or minimum content boundary is missing.

The published `v0.11.0` release remains immutable and is not redefined by the
current development line. Its release page contains its original notes and
artifacts.

The active `main` build is `0.12.0-dev.2`. Current implementation and product
programme changes belong in the current build notes, status, product
definition, requirements, roadmap, execution queue, readiness tracker, and
white paper as applicable.

## Documentation update rule

A change must update every affected authority surface in the same pull request:

- runtime or evidence change — registry, generated status, requirements,
  status, release notes, operator runbook, and white paper where material;
- product or UX scope change — product definition, requirements, roadmap,
  execution queue, status, release notes, and white paper;
- promotion or deployment change — readiness tracker, production-grade
  definition, status, release notes, and immutable evidence;
- security-boundary change — threat model, requirements, affected runbook,
  readiness tracker, and review scope;
- claim-only change — verify that no lower-authority text exceeds the registry
  or deployment evidence.

Documentation-only roadmap work does not change capability status.

## Contributor path

For a production- or product-impacting change:

1. identify the affected capability, product, requirement, threat, and
   deployment boundary;
2. update code and negative-path tests where behavior changes;
3. update the capability registry only when executable acceptance evidence
   exists;
4. update every affected canonical document and runbook;
5. run `npm run check` and `npm run release:verify`;
6. attach protected CI and runtime evidence before promotion;
7. market only the exact promoted scope.

Claims that cannot be kept current must be removed from `main`, not merely
labeled historical beside supported material. Provenance belongs on the locked
deprecated branch unless it remains necessary to prove the current trust
boundary.
