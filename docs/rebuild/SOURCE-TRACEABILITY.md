# AXIOM-MESH Source Traceability

**Current build:** `0.12.0-dev.3`

**Status:** current requirements-to-implementation trace

**Updated:** 2026-08-12

## Purpose

This record maps supported product claims to current source, policy, tests, and
operator evidence. It does not use archived documents as alternate
specifications. The machine-readable capability registry is authoritative when
prose and executable status differ.

The trace intentionally separates three things that can coexist in the same
source tree:

1. a registry-backed runnable capability;
2. a built but deliberately production-unreachable primitive; and
3. a specified or laboratory boundary that has not been implemented or
   promoted.

That distinction is especially important for machine principals, resolver-backed
intent work, repository-effect preparation, and external agent runtimes.

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
6. Built primitives that are absent from production policy, registries, or
   runtime routes must be described as production-unreachable even when their
   unit and conformance tests are complete.
7. Evidence semantics must state what the evidence proves. A local hash-linked
   Grid history proves modification detection under the local trust assumptions;
   retained-history truncation detection additionally requires an externally
   retained continuity anchor through the anchored sequence.

## Current implementation trace

| Current concern | Governing source | Executable evidence | Current boundary |
|---|---|---|---|
| Product scope and claims | `docs/rebuild/PRODUCT-DEFINITION.md`, `mesh/config/capabilities.json` | `mesh/src/check-registry.mjs`, generated status | 49 capabilities: 31 implemented; all others explicitly experimental, specified, adapter-required, or disabled |
| Current-build source setup | `mesh/config/setup.json`, root and kernel package/lock files | setup negative tests, `npm run setup`, protected workflow | Exact Node.js/npm and CI/container pins, two zero-dependency locks, no install lifecycle scripts, unchanged-lock proof, no production credential creation |
| Intent-to-evidence path | Gateway, Hypervisor, Sandbox, and Grid source under `mesh/src/` | kernel and end-to-end tests | Every privileged production effect follows authenticated intent, deny-dominant authorization, bounded grant/execution, and signed evidence; no alternate application or runtime authority path is permitted |
| Constrained machine principals | machine-principal normalization, principal registry, Gateway and Hypervisor enforcement | machine-principal, registry, end-to-end, concurrency, response-size, destination and negative-path tests | Human-sponsored machine principals have finite scopes, action/purpose/destination ceilings, runtime binding, expiry, non-delegation, execution-time, request-size, request-rate, concurrency and response-size ceilings; runtime/software digests are attribution metadata, not TPM/TEE attestation |
| Machine discovery | Gateway `/v1/machine-discovery`, active policy evaluator and principal intersection | discovery unit, end-to-end, client and network tests | Exposes only the authenticated machine principal's requestable policy intersection and explicitly grants no execution authority |
| Machine receipts | Grid-attested terminal receipt construction and independent verifier | receipt unit, end-to-end, client and network tests | Owner-scoped digest-only receipts bind canonical request, machine-authority digest, accepted/terminal Grid anchors and terminal outcome digests; they attest the Grid record, not arbitrary external-world truth |
| Gateway client contract | `mesh/config/gateway-client-contract.json`, its JSON Schema, and the same-origin client module | exact route-parity, compatibility, error, cancellation, timeout, response-bound, and real-stack tests | All 29 authenticated Gateway routes are versioned; clients have no direct internal-service target; AXIOM One browser/session boundary remains experimental |
| AXIOM One local preview | `apps/axiom-one/app-policy.json`, human explanation contract/presenter, static PWA, and loopback proxy | exact policy/static/explanation checker, bounded-action/all-outcome/all-event fixtures, approval/uncertainty tests, real-stack owner and cross-principal memory lifecycle tests, proxy tests, and visual inspection | Experimental contract-only shell; governed owner memory and bounded provenance are demonstrated without claiming a supported product, general consequential plan/execute path, hard deletion, restore, bulk ingestion, or completed accessibility/usability/security packaging gates |
| Runtime policy | `mesh/config/policy.json`, layered policy loader | policy and IAM property tests | Lower layers can only restrict; high-risk work requires independent approval |
| Durable state and evidence | Grid store, migrations, identity, evidence and protection libraries | restart, migration, tamper, wrong-key, backup, rotation and continuity-anchor tests | Encrypted single-Grid state and signed hash-linked evidence; local verification detects modification, while truncation assurance through a retained sequence additionally requires a valid `axiom-grid-continuity-anchor.v1` retained outside `AXIOM_DATA_DIR`; no replicated consensus claim |
| Grid continuity anchors | `mesh/src/grid/continuity-anchor.mjs`, Grid-chain verifier and operator flow | continuity-anchor unit/operator tests and full-chain verification | A retained external anchor proves the current history equals or extends the anchored head through that sequence; it does not prove preservation after the newest anchor or defend against malicious host/root or active signing-key compromise |
| Service transport | transport runtime and provisioning | mutual-TLS and rotation drill | TLS 1.3, separate Ed25519 leaves, exact active-leaf pinning, signed caller binding, offline rotation |
| Service network policy | exact network-policy config, request authorizer, segmented unit Compose | policy negative tests and protected required/forbidden-edge container checks | Default deny, 40 exact routes, policy-derived mTLS peers, four internal segments; pilot-orchestrator enforcement pending |
| Deployment topology | production supervisor, compact and unit Compose policies | host drill, independent-service drill, container job | One hardened host or four independently restartable single-host units; no multi-host production claim |
| Secrets and policy custody | provider runtime, provider supervisor, reference adapter | provider runtime tests and signed conformance drill | Separate pinned signers, exact request-bound inventories, private immutable startup generation; no vendor custody or live refresh claim |
| Agent runtime adapter candidate | `docs/architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md` and byte-pinned v1 JSON Schema | exact contract verifier, signed-grant negative tests, 28-case synthetic drill, and commit-bound `verify` artifact | Replaceable runtimes may plan or coordinate only through AXIOM authority; no external runtime is loaded, no live runtime adapter route or external effect exists, and no capability or external-runtime conformance is promoted |
| Resolver-backed executor input | `intent-executor-input-resolution`, resolver admission/review/promotion/application modules and repository-plan verifier | resolver eligibility, admission, package, application-receipt and substitution/tamper tests | Built core can bind a signed repository plan to fresh eligibility and preserve all target gates, but production executor registry remains empty and production policy has no `repository.docs.pull-request.create`; therefore it is not production-reachable |
| Resolved repository-effect preparation | resolved-target authorization, prepared-effect binding and Hypervisor/Grid preparation coordinator | resolver prepared-effect and Grid-approval preparation tests | Hypervisor can source one approval over the authenticated Grid channel and atomically commit `approval.consumed` plus `external.effect.prepared`; concurrency proves only one preparation survives. No public route invokes this path, no repository operator executes the effect, and no merge occurs |
| Backup and recovery | backup, retention, recovery, credential and data-key rotation modules | signed lifecycle drills and interruption tests | Candidate-host lifecycle implemented; pilot-owned custody and media repetition pending |
| Observability and resilience | operations, telemetry relay, SLO and resilience policies | operations, telemetry, SLO, dependency-loss, and deny-egress drills | Bounded privacy vocabulary, authenticated collection, exact HTTPS relay routes, candidate pressure and recovery evidence |
| Incident response | incident policy and tabletop drill | signed tabletop bound to eleven control artifacts | Automated candidate exercise implemented; facilitated pilot roster and independent review pending |
| Pilot evidence intake | pilot dossier, v2 detail-contract, and exact-package verifiers with authority-pinned review policy | per-type semantic negative tests and two signed synthetic conformance drills | Exact build, 720-hour/SLO/custody metadata, canonical 13-envelope inventory, type-specific details, raw-byte hashes, assigned-role signatures, and five distinct dossier approvals verify; no live-pilot or production-promotion claim |
| Independent security review intake | canonical current-build threat model, authority-pinned review policy, exact signed findings ledger | semantic negative tests and signed synthetic non-review conformance drill | Exact build/scope/artifact/reviewer binding, recomputed findings, independent critical/high remediation verification, separate bounded lesser-risk exception approval, and explicit non-promotion verify; authentic external review pending |
| Node admission and scheduling | Grid node registry and scheduler | node scheduling tests and signed drill | Authenticated admission and deterministic encrypted leases; no remote workload dispatch |
| Causal exchange | online causal-sync modules and policy | two-real-stack partition/rejoin drill | Encrypted, ordered, independently approved exchange with visible conflicts; no federation or consensus |
| Portability and consent | Grid consent, export, import, and recipient encryption | end-to-end and kernel tests | Scoped signed export and staged import implemented; external identity adapters not implemented |
| Release and documentation | release verifier, documentation checker, protected workflow | `npm run setup`, `npm run release:verify`, GitHub required checks and hosted Windows compatibility | Exact source setup and current documentation allowlists, computed 29-route/40-route/capability claims, zero-dependency package boundary, deployment digests, migrations, generated status, and cross-platform path/clock verification |

## Current non-capability development slices

The following merged work is real source and test coverage but must not be
mistaken for a registry promotion:

- the Agent Runtime Adapter v1 contract and synthetic reference adapter;
- resolver-backed dynamic repository-plan input resolution;
- independently reviewed resolver admission and exact-one-addition promotion
  packaging;
- signed observation of resolver mapping application;
- resolved target-policy confirmation and independent-approval binding;
- atomic Grid consumption of the exact approval with durable prepared-effect
  evidence.

These slices reduce uncertainty before future exposure. They do not make a
repository effect, external runtime, MCP/A2A endpoint, autonomous loop, remote
execution path, or repository mutation available on the supported production
surface.

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

Those archives explain provenance but do not govern `0.12.0-dev.3`. Generated
API sites, installers, contracts, token and bridge plans, domain proposals,
research drafts, old audits, dashboards, and superseded operational material
were deliberately removed from `main` because they do not describe the
supported runtime.

Security evidence that refers to archived Git objects remains current only
when it proves a present boundary—for example, the credential revocation
ledger and supported-tip reuse check.

## Coverage result

Current traceability covers the complete supported four-service kernel,
constrained machine-principal surface, production-candidate packaging, service
transport, Grid continuity anchors, backup and recovery, telemetry, resilience,
admitted-node scheduling, causal exchange, signed provider startup, incident
evidence, pilot dossier and exact-package verification, portability, security,
release governance, the runtime-adapter contract boundary, and the current
production-unreachable resolver preparation chain.

Capabilities without current implementation evidence remain explicitly
non-runnable. Built but unexposed primitives remain non-runnable from production
until their exact registry, policy, runtime, operator and review gates pass. No
archive, roadmap statement, release note, white-paper description, synthetic
fixture, or source presence can change that status.