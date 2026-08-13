# AXIOM-MESH Source Traceability

**Current build:** `0.12.0-dev.3`

**Status:** current requirements-to-implementation trace

**Updated:** 2026-08-12

## Purpose

This record maps current claims to source, policy, tests, and operator evidence.
The machine-readable capability registry is authoritative when prose and
runnable status differ.

The same source tree can legitimately contain:

1. a registry-backed runnable capability;
2. a built and tested primitive that is deliberately production-unreachable;
3. a specified or laboratory boundary that is not implemented or promoted.

That distinction is critical for machine principals, Grid continuity, the
repository-effect resolver/outbox/operator chain, and Agent Runtime Adapter v1.

## Traceability rules

1. `implemented` requires executable production-path code plus negative-path
   evidence and a matching capability-registry claim.
2. Documentation cannot promote a capability beyond
   `mesh/config/capabilities.json`.
3. Policy, registry, package, runtime, operator surfaces, and evidence semantics
   must agree.
4. External deployment, custody, provider, audit, and human-operator facts remain
   unclaimed until authentic evidence exists.
5. Built code that production policy/registry/routes cannot reach must be
   described as **production-unreachable**, even when its tests are complete.
6. Evidence claims must identify their limit. Local Grid verification detects
   modification; retained-history truncation assurance additionally requires an
   externally retained continuity anchor through the anchored sequence.
7. A draft-PR operator is not merge authority, and a verified operator receipt
   is not proof of arbitrary external-world truth.

## Current implementation trace

| Concern | Governing source | Executable evidence | Current boundary |
|---|---|---|---|
| Product/capability claims | `docs/rebuild/PRODUCT-DEFINITION.md`, `mesh/config/capabilities.json` | registry/status/check-registry | 49 capabilities: 31 implemented; other states remain explicit |
| Source runtime | `mesh/config/setup.json`, package/lock files, Dockerfile/workflows | setup checks, protected CI | Node `>=24.14.0 <25`; CI/.node-version 24.18.0; production image 24.19.0; npm 11.x; zero third-party npm dependencies |
| Intent-to-evidence | Gateway, Hypervisor, Sandbox, Grid | kernel/e2e tests | Supported privileged effects require authenticated authority, deny-dominant policy, bounded execution, and signed evidence |
| Machine principals | machine principal normalization, principal registry, Gateway/Hypervisor/Sandbox enforcement | machine principal/e2e/concurrency/response/destination tests | Human-sponsored finite scopes/actions/purposes/destinations, runtime/expiry/non-delegation, execution-time/request-size/rate/concurrency/response-size ceilings; runtime digest is metadata, not attestation |
| Machine discovery | Gateway `/v1/machine-discovery`, policy evaluator | discovery unit/e2e/client/network tests | Caller-specific requestability only; explicitly not authorization |
| Machine receipts | Grid terminal-receipt builder + verifier | receipt unit/e2e/client/network tests | Owner-scoped digest-only Grid attestation; not arbitrary external-world truth |
| Gateway client | client contract/schema/library | route parity/compatibility/error/cancel/timeout/response-bound/real-stack tests | All 29 authenticated Gateway routes are versioned; no direct internal-service target |
| AXIOM One | `apps/axiom-one/`, explanation contract/presenter, proxy | policy/static/explanation/approval/uncertainty/real-stack tests | Experimental bounded owner-memory/provenance shell; not supported product |
| Policy | `mesh/config/policy.json`, layered policy | policy/IAM tests | Deny-dominant; high-risk effects require independent approval where configured |
| Grid durability | Grid store/migrations/evidence/protection | restart/migration/tamper/wrong-key/backup/rotation tests | Encrypted single-Grid state, signed hash-linked evidence; no replicated consensus |
| Grid continuity | continuity-anchor implementation + Grid verifier/operator flow | anchor creation/verification/negative tests | `axiom-grid-continuity-anchor.v1` retained outside `AXIOM_DATA_DIR` proves current history equals/extends retained head through that sequence only |
| Transport | transport runtime/provisioning | mTLS/rotation drills | TLS 1.3, Ed25519 leaves, identity checks, active-leaf pinning, signed caller binding, rollback |
| Service network policy | network policy/request authorizer/unit Compose | policy and required/forbidden-edge tests | Default deny, 42 exact routes, derived mTLS peers, four internal segments |
| Deployment topology | supervisor/production Compose/unit Compose | host/container/service-unit drills | Hardened single host; no multi-host/failover claim |
| Providers | provider runtime/supervisor/reference adapter | provider tests/drill | Signed exact inventories/private startup generation; no vendor custody/live-refresh claim |
| Agent Runtime Adapter v1 | `docs/architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md`, v1 schema | contract verifier, negative tests, 28-case synthetic drill | Replaceable-runtime contract only; no external runtime loaded or certified |
| Repository planning | repository docs planning/destination/planner modules | planner/destination/tamper/staleness tests | Signed read-only exact-base/exact-path plan; no authority from model prose or arbitrary JSON |
| Resolver input/admission | intent executor resolution + resolver admission/review/package/application modules | eligibility/admission/package/application/substitution tests | Exact current-state binding and independently reviewed mapping candidate; production executor registry remains empty |
| Resolved target authorization | resolved-target authorization + prepared-effect binding | target-gate/prepared-effect tests | Ordinary target policy, confirmation and independent approval preserved after dynamic resolution |
| Prepared-effect durability | Hypervisor/Grid preparation coordinator | approval race/replay/preparation tests | Authenticated approval read; one transaction records `approval.consumed` then `external.effect.prepared`; one durable winner under concurrency |
| External-effect outbox | `mesh/src/hypervisor/external-effect-outbox.mjs`, `mesh/src/lib/external-effect-outbox.mjs` | outbox/restart/uncertainty/completion-failure tests | Operator invoked only after durable prepare; uncertainty remains prepared; verified signed receipt required before `external.effect.completed` |
| GitHub docs operator | repository-operator service/client + `github-docs-operator.mjs` | durable-proof-before-request, path/content/identity/stale-main/idempotency/transport-loss/service tests | Fixed repo + exact planned docs content + deterministic effect branch + **open draft PR**; `merge_performed:false`; no direct-main mutation; production-unreachable |
| Backup/recovery | backup/retention/recovery/rotation modules | signed lifecycle/interruption drills | Candidate-host lifecycle implemented; pilot media/custody repetition pending |
| Observability/resilience | operations/telemetry/SLO/resilience | signed drills | Bounded vocabulary and candidate pressure/recovery evidence; pilot endpoints/human acknowledgement pending |
| Incident response | incident policy/tabletop | signed composition drill | Automated candidate evidence; named pilot roster/human review pending |
| Pilot intake | dossier/package policies/verifiers | semantic negatives + synthetic drills | Exact build/720-hour/custody/13-envelope contracts; no live-pilot claim |
| Security-review intake | threat model/review policy/findings verifier | semantic negatives + synthetic drill | Exact build/scope/artifact/reviewer binding; authentic external review pending |
| Node scheduling | node registry/scheduler | scheduling tests/drill | Signed admission + deterministic reservations; no remote dispatch |
| Causal exchange | online causal sync | two-real-stack partition/rejoin drill | Approved encrypted causal record transport; no federation/consensus |
| Portability/consent | consent/export/import/encryption | kernel/e2e tests | Scoped signed export/staged foreign-provenance import |
| Release/documentation | release verifier/check-docs/current-state doc tests/workflows | `npm run setup`, `npm run release:verify`, protected CI | Canonical docs/links, 29 Gateway routes, 42 network routes, capability counts, runtime-adapter lock, current narrative invariants |

## Repository-effect activation boundary

The repository-effect chain is intentionally a **non-capability development
slice** despite having a functioning evidence-first outbox and draft-PR
operator.

Current source can demonstrate this sequence:

```text
signed read-only plan
  -> fresh resolver eligibility
  -> independent resolver admission/review
  -> exact mapping package/application observation
  -> resolved target policy + confirmation + independent approval
  -> atomic approval.consumed + external.effect.prepared
  -> durable outbox
  -> operator independently verifies Grid preparation
  -> deterministic docs-only effect branch
  -> exact planned file changes
  -> open draft pull request
  -> signed operator receipt
  -> external.effect.completed after receipt verification
```

Production reachability is nevertheless closed because:

- `mesh/config/intent-remediation-executors.json` contains zero mappings;
- production policy has no `repository.docs.pull-request.create` action;
- no supported public/runtime route activates the chain;
- operator credentials/egress are not part of the supported production
  deployment; and
- the operator has no merge/direct-main authority.

A future mapping activation must therefore be reviewed as a new exposed
capability, not inferred from the existence of operator code.

## Agent-runtime boundary

Agent Runtime Adapter v1 is also built source without a capability promotion.
Its synthetic reference verifies the contract itself: grant translation,
one-use authority, cancellation/revocation, idempotency, fallback, uncertain
outcomes, receipts, rollback, and secret exclusion. It does not prove
conformance of OpenClaw, Hermes, Agent Zero, MCP, A2A, or another external
runtime.

## Claim precedence

For the current build:

1. protected executable evidence;
2. capability-registry status;
3. normative requirements and production/security policy;
4. current operator runbooks;
5. current roadmap/execution queue.

Passing unit/synthetic tests is necessary but may be insufficient for
production promotion where authentic pilot custody, deployment, independent
review, or human evidence is required.

## Archived source boundary

Pre-current-build documentation remains on locked branch
`deprecated/pre-0.12-documentation-corpus`; the divergent pre-clean-room
implementation remains at immutable tag
`archive/legacy-main-pre-clean-room-2026-05-21`. Those archives explain
provenance but do not govern `0.12.0-dev.3`.

## Coverage result

Current traceability covers the four-service kernel, machine-principal surface,
Grid continuity, production packaging, transport/network policy, recovery,
telemetry/resilience, scheduling/causal exchange, provider startup, pilot and
security-review intake, runtime-adapter contract, and the complete current
**production-unreachable** repository planning/resolver/preparation/outbox/
draft-PR-operator chain.

No archive, roadmap statement, release note, synthetic fixture, draft PR, or
source presence can promote a capability beyond the registry and its explicit
activation/evidence gates.
