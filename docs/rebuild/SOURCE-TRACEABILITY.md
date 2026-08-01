# AXIOM-MESH Source Traceability

**Current build:** `0.12.0-dev.0`

**Status:** current requirements-to-implementation trace

**Updated:** 2026-07-29

## Purpose

This record maps supported product claims to current source, policy, tests, and
operator evidence. It does not use archived documents as alternate
specifications. The machine-readable capability registry is authoritative when
prose and executable status differ.

## Traceability rules

1. An `implemented` claim requires executable production-path code and
   negative-path evidence.
2. A document cannot promote a capability beyond
   `mesh/config/capabilities.json`.
3. Runtime, policy, registry, package, operator-surface, and evidence versions
   must agree.
4. External adapters, custody, deployment, and audit results remain unclaimed
   until evidence from those external systems exists.
5. A prior release or archived document cannot redefine the current build.

## Current implementation trace

| Current concern | Governing source | Executable evidence | Current boundary |
|---|---|---|---|
| Product scope and claims | `docs/rebuild/PRODUCT-DEFINITION.md`, `mesh/config/capabilities.json` | `mesh/src/check-registry.mjs`, generated status | 46 capabilities: 28 implemented; all others explicitly experimental, specified, adapter-required, or disabled |
| Current-build source setup | `mesh/config/setup.json`, root and kernel package/lock files | setup negative tests, `npm run setup`, protected workflow | Exact Node.js/npm and CI/container pins, two zero-dependency locks, no install lifecycle scripts, unchanged-lock proof, no production credential creation |
| Intent-to-evidence path | Gateway, Hypervisor, Sandbox, and Grid source under `mesh/src/` | kernel and end-to-end tests | Every privileged effect follows authenticated intent, deny-dominant authorization, a bounded grant, deterministic execution, and signed evidence |
| Gateway client contract | `mesh/config/gateway-client-contract.json`, its JSON Schema, and the same-origin client module | exact route-parity, compatibility, error, cancellation, timeout, response-bound, and real-stack tests | All 27 authenticated Gateway routes are versioned; clients have no direct internal-service target; AXIOM One browser/session boundary remains pending |
| AXIOM One local preview | `apps/axiom-one/app-policy.json`, static PWA, and loopback proxy | exact policy/static checker, proxy negative tests, desktop and 375-pixel visual inspection | Experimental contract-only shell; memory-only token, no API cache/remote assets, Share/Circles/AI disabled; full browser-security, accessibility, usability, packaging, and support gates pending |
| Runtime policy | `mesh/config/policy.json`, layered policy loader | policy and IAM property tests | Lower layers can only restrict; high-risk work requires independent approval |
| Durable state and evidence | Grid store, migrations, identity and protection libraries | restart, migration, tamper, wrong-key, backup, and rotation tests | Encrypted single-Grid state and signed hash-linked evidence; no replicated consensus claim |
| Service transport | transport runtime and provisioning | mutual-TLS and rotation drill | TLS 1.3, separate Ed25519 leaves, exact active-leaf pinning, signed caller binding, offline rotation |
| Service network policy | exact network-policy config, request authorizer, segmented unit Compose | policy negative tests and protected required/forbidden-edge container checks | Default deny, 38 exact routes, policy-derived mTLS peers, four internal segments; pilot-orchestrator enforcement pending |
| Deployment topology | production supervisor, compact and unit Compose policies | host drill, independent-service drill, container job | One hardened host or four independently restartable single-host units; no multi-host production claim |
| Secrets and policy custody | provider runtime, provider supervisor, reference adapter | provider runtime tests and signed conformance drill | Separate pinned signers, exact request-bound inventories, private immutable startup generation; no vendor custody or live refresh claim |
| Backup and recovery | backup, retention, recovery, credential and data-key rotation modules | signed lifecycle drills and interruption tests | Candidate-host lifecycle implemented; pilot-owned custody and media repetition pending |
| Observability and resilience | operations, telemetry relay, SLO and resilience policies | operations, telemetry, SLO, dependency-loss, and deny-egress drills | Bounded privacy vocabulary, authenticated collection, exact HTTPS relay routes, candidate pressure and recovery evidence |
| Incident response | incident policy and tabletop drill | signed tabletop bound to eleven control artifacts | Automated candidate exercise implemented; facilitated pilot roster and independent review pending |
| Pilot evidence intake | pilot dossier, v2 detail-contract, and exact-package verifiers with authority-pinned review policy | per-type semantic negative tests and two signed synthetic conformance drills | Exact build, 720-hour/SLO/custody metadata, canonical 13-envelope inventory, type-specific details, raw-byte hashes, assigned-role signatures, and five distinct dossier approvals verify; no live-pilot or production-promotion claim |
| Independent security review intake | canonical current-build threat model, authority-pinned review policy, exact signed findings ledger | semantic negative tests and signed synthetic non-review conformance drill | Exact build/scope/artifact/reviewer binding, recomputed findings, independent critical/high remediation verification, separate bounded lesser-risk exception approval, and explicit non-promotion verify; authentic external review pending |
| Node admission and scheduling | Grid node registry and scheduler | node scheduling tests and signed drill | Authenticated admission and deterministic encrypted leases; no remote workload dispatch |
| Causal exchange | online causal-sync modules and policy | two-real-stack partition/rejoin drill | Encrypted, ordered, independently approved exchange with visible conflicts; no federation or consensus |
| Portability and consent | Grid consent, export, import, and recipient encryption | end-to-end and kernel tests | Scoped signed export and staged import implemented; external identity adapters not implemented |
| Release and documentation | release verifier, documentation checker, protected workflow | `npm run setup`, GitHub required checks | Exact source setup and current documentation allowlists, dependency-free package boundary, deployment digests, migrations, and generated status |

## Claim precedence

For the current build, precedence is:

1. protected executable evidence;
2. capability registry status;
3. normative requirements and production/security policies;
4. current operator runbooks;
5. roadmap and active work queue.

A passed test is necessary but not always sufficient for production promotion.
Pilot-owned infrastructure, independent review, external custody, or measured
operations remain separate gates where the readiness tracker says so.

## Archived source boundary

The complete documentation tree that existed before current-build curation is
preserved on locked branch `deprecated/pre-0.12-documentation-corpus`. The
divergent pre-clean-room implementation is preserved by immutable tag
`archive/legacy-main-pre-clean-room-2026-05-21`.

Those archives explain provenance but do not govern `0.12.0-dev.0`. Generated
API sites, installers, contracts, token and bridge plans, domain proposals,
research drafts, old audits, dashboards, and superseded operational material
were deliberately removed from `main` because they do not describe the
supported runtime.

Security evidence that refers to archived Git objects remains current only
when it proves a present boundary—for example, the credential revocation
ledger and supported-tip reuse check.

## Coverage result

Current traceability covers the complete supported four-service kernel,
production-candidate packaging, service transport, backup and recovery,
telemetry, resilience, admitted-node scheduling, causal exchange, signed
provider startup, incident evidence, pilot dossier and exact-package
verification, portability, security, and release governance.

Capabilities without current implementation evidence remain explicitly
non-runnable. No archive, roadmap statement, release note, or white-paper
description can change that status.
