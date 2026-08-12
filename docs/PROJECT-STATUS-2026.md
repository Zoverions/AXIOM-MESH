# AXIOM-MESH Project Status

**Status date:** 2026-08-12

**Supported build:** `0.12.0-dev.3`

**Development branch:** `main`

**Deployment status:** production candidate; no live deployment claim

## Current build

AXIOM-MESH `0.12.0-dev.3` is a clean-room, dependency-free Node.js coordination
and authority kernel organized as four responsibilities: Gateway, Hypervisor,
Sandbox, and Grid. It can run as supervised processes in one hardened container
or as independently restartable single-host units with isolated private
credentials. It is the supported development line, not a published release or
production promotion. The last immutable published production-candidate release
is `v0.11.0`.

The executable source of truth is
[`mesh/config/capabilities.json`](../mesh/config/capabilities.json). The
generated [capability status](rebuild/STATUS.md) records 31 implemented, 3
experimental, 2 specified, 9 adapter-required, and 4 disabled capabilities.
Code that is built but absent from production policy, registries, or runtime
routes does not become an implemented capability merely because tests exist.

The current architecture can be summarized as:

```text
human or machine principal
        |
        v
     Gateway
        |
        v
   Hypervisor
        |
        v
     Sandbox
        |
        v
       Grid
```

Intelligence, planners, browser applications, external runtimes, providers,
repository operators, remote nodes, and administrators do not inherit authority
from being connected. Consequential authority still has to pass the normal
identity, policy, consent/confirmation, approval, grant/execution, and evidence
boundaries.

## Implemented kernel scope

The current registry-backed production-candidate surface includes:

- authenticated intent, deny-dominant policy, explicit plan, independent
  approval where required, short-lived single-use grant, bounded deterministic
  execution, and signed evidence;
- human-sponsored constrained `agent` principals with finite scopes, actions,
  purposes, destinations, runtime identity, lifetime/expiry, non-delegation,
  execution-time ceilings, authenticated request-size and request-rate limits,
  concurrency ceilings, and response-size ceilings;
- AXIOM-computed effect destinations for current built-in tools, canonically
  resolving `builtin.*` to `local` and failing closed when the destination is
  outside the machine principal's finite destination ceiling;
- authenticated machine discovery at `/v1/machine-discovery`, returning only
  the caller's digest-bound intersection of active deny-dominant policy and its
  own finite authority while explicitly stating that discovery is not
  authorization;
- owner-scoped Grid-attested terminal machine receipts binding the canonical
  request digest, machine-authority digest, exactly one accepted and one
  terminal event anchor, current chain-assurance metadata, and a terminal
  result/error digest without exposing raw result/error content;
- backward-compatible least-privilege infrastructure `service` principals;
- encrypted transactional Grid state with signed SHA-256 hash-linked evidence;
- consent receipts, capsule manifests, encrypted memory objects/edges, local
  balanced accounting, admitted-node/storage registries, governance records,
  import/export, backup/restore, credential and data-key rotation;
- local evidence-chain verification plus externally retainable
  `axiom-grid-continuity-anchor.v1` records. Local Grid state detects alteration;
  detecting a consistently deleted suffix after matching local head/checkpoint
  rewrite additionally depends on an anchor retained outside
  `AXIOM_DATA_DIR`, and that assurance extends only through the newest retained
  anchor;
- authenticated operator API and CLI;
- one-command current-build setup with exact Node.js/npm policy, two
  zero-dependency locks, disabled/prohibited install lifecycle scripts,
  unchanged-lock proof, and full kernel/release gates;
- a versioned Gateway client contract implemented for all 29 authenticated routes,
  with relative-only application targets, explicit errors, timeout/cancellation,
  bounded request/response behavior, stable idempotent replay, and no direct
  Grid/Hypervisor/Sandbox target;
- bounded-cardinality telemetry, dependency readiness, operations reports,
  OpenMetrics output, and a host-side least-privilege OTLP/Alertmanager relay;
- explicit production credential provisioning and fail-closed four-process
  supervision;
- per-unit private identity/TLS projection, Grid-only durable state, four exact
  internal segments, a default-deny 40-route application policy, derived mTLS
  peers, and signed failure/recovery evidence;
- TLS 1.3 internal service transport with Ed25519 identities, DNS and
  SPIFFE-style URI identity, active-leaf fingerprint pinning, offline rotation,
  retired-leaf rejection, and rollback;
- signed admitted-node v2 discovery metadata and deterministic encrypted
  placement leases with capability, resource, concurrency, security,
  owner/domain, expiry, and quarantine controls;
- operator-approved two-Grid causal exchange with pinned Grid evidence,
  node-signed bundles, encrypted ordered queues, duplicate preflight, one-use
  destination approval, visible concurrent heads, and explicit convergence;
- deployment-independent secret and policy provider startup with separately
  pinned signers, exact short-lived inventories, private per-start
  materialization, semantic validation, cleanup, and fail-closed signer/input
  rejection;
- fail-closed pilot evidence intake with exact source/image, 30-day/SLO/custody
  requirements, five distinct roles, 13 canonical role-signed v2 envelopes,
  exact semantic contracts, and explicit non-promotion result;
- independent-security-review intake with exact build/scope/artifact policy,
  distinct reviewer/exception authority, signed findings, verified
  critical/high closure, and bounded lesser-risk exceptions;
- hosted Windows compatibility hardening for documentation/source verification,
  evidence-path normalization, and timing/expiry tests.

Machine-principal runtime IDs and software digests remain attribution and
binding metadata. They are not TPM/TEE, measured-boot, process-isolation, or
remote-attestation proof.

## Built, verified, but production-unreachable work

Several merged August 11-12 slices deliberately reduce future integration risk
without adding a runnable production capability.

### Dynamic repository-plan input resolution

The resolver-backed AXIOM Intent work can bind a signed repository plan to fresh
current execution eligibility, preserve the exact remediation, mapping,
registry, policy, capability, build, requester, scope, destination, and target
policy gates, and produce signed content-addressed resolution/handoff artifacts.

The admission path can derive strict resolver facts, require independent
implementation-conformance and security-authority review, package exactly one
mapping addition, and independently observe exact application bytes without
turning observation into authority.

Resolved target authorization then re-evaluates ordinary target policy,
confirmation, and independent approval. The preparation coordinator sources the
named approval over the authenticated Hypervisor -> Grid channel and commits one
transaction containing, in order, `approval.consumed` and
`external.effect.prepared`. Concurrent attempts prove exactly one durable
preparation can survive one-use approval consumption.

This path is still production-unreachable: `mesh/config/intent-remediation-executors.json`
remains empty, production policy has no
`repository.docs.pull-request.create` action, no public/runtime route invokes
the coordinator, the repository operator is not called, no external effect is
executed, and no pull request or merge is created.

### Agent Runtime Adapter v1

The repository now defines a byte-pinned Agent Runtime Adapter v1 contract and a
28-case synthetic reference conformance drill. The contract fixes authority,
capability translation, credential references, lifecycle, idempotency,
cancellation, revocation, receipt, fallback, uncertain-outcome, and rollback
semantics for a future replaceable external runtime.

The architectural rule is that an external runtime may plan or coordinate work
but cannot become an alternate authority system. Installing or approving a
runtime, or declaring its tool allowlist, never bypasses Gateway -> Hypervisor
-> Sandbox -> Grid.

The reference adapter loads no external runtime, uses no production trust
anchor, opens no external network connection, reads no user file, performs no
external effect, and does not certify OpenClaw, Hermes, Agent Zero, MCP, A2A, or
any other runtime.

## Human product state

The implemented Gateway client contract supports the experimental AXIOM One
loopback browser/PWA foundation. The current bounded preview provides node
status, reversible review for five bounded actions, stable outcome/event
explanations, one-use approval states, same-idempotency-key uncertainty
recovery, and an owner-scoped Vault that can create/list private notes, add one
of three directional provenance links (`derived-from`, `supports`, `corrects`),
tombstone an exact record after confirmation, create a selective local export,
and reveal its bundle only after a separate action.

Corrections are new linked records; they do not silently replace their target.
Cross-principal read/link/export/tombstone paths are denied in real-stack tests.
The preview is not a supported product and does not claim general consequential
plan/execute, direct provenance-edge deletion, hard deletion, restore, bulk
ingestion, completed browser-session security, accessibility/usability evidence,
or signed end-user packaging.

AXIOM Verify, AXIOM Circles, AXIOM Studio, AXIOM Managed Node, bounded AI
providers, useful personal workflows, selective sharing, and later agent
runtime integrations remain separately gated product work.

## Production package state

The production candidate includes a digest-pinned non-root/read-only container,
mounted external secrets, resource ceilings, bounded logs, permission-restricted
local Gateway ingress, dependency-aware readiness, and both compact and
four-unit single-host topologies.

Protected evidence covers source setup, tests, release verification, network
policy, container build/readiness, recovery, backup lifecycle, SLO, resilience,
telemetry, transport, independent service units, node scheduling, online causal
exchange, provider startup, credential/data-key rotation, incident tabletop,
pilot dossier/package verification, independent-security-review verification,
runtime-adapter synthetic conformance, and applicable CodeQL/Windows gates.

These artifacts prove mechanisms and rejection behavior. They do not create the
external facts required for production promotion.

## Promotion blockers

Production promotion remains blocked by authentic external evidence, including:

1. dedicated pilot hardware plus 30-day availability/capacity observation;
2. pilot-owned secret/provider/workload-identity, backup-media, telemetry, and
   alert custody;
3. scheduled restore and rotation under that custody;
4. provider/custodian or independently reviewed not-applicable dispositions for
   all 32 deprecated-history credential candidates;
5. a facilitated incident exercise with a named pilot roster and notification
   decision tree;
6. operator-owned telemetry/alert receivers, receiver-side retention decision,
   and measured named-person acknowledgement;
7. an authentic independent security review for the exact source, image,
   deployment policy, and pilot configuration;
8. an authentic exact pilot evidence package and separate production-promotion
   decision.

The resolver/runtime-adapter laboratory work does not itself block the current
pilot because it is not part of the exposed production surface. Any future
activation of those paths creates new promotion gates.

## What is not claimed

The `0.12.0-dev.3` build does **not** claim:

- a live public, customer, testnet, mainnet, or production service;
- a completed authentic single-node pilot or independent security approval;
- a supported AXIOM One, Verify, Circles, Studio, or Managed Node release;
- a production AI, messaging, identity, storage-transfer, payment, repository,
  or regulated-domain adapter;
- certification or production conformance of an external agent runtime;
- MCP/A2A exposure, autonomous-agent delegation, remote workload execution, or
  hardware/runtime attestation;
- a production resolver mapping or public dynamic repository-effect route;
- pull-request creation, direct-main writes, or repository merge authority from
  the resolver preparation tests;
- federation, BFT consensus, replicated Grid finality, or global Sybil
  resistance;
- arbitrary-code sandbox security;
- operational token, bridge, liquidity, staking, treasury, payroll, or chain
  settlement;
- clinical, educational, governmental, legal, employment, or financial
  compliance;
- secure embodied autonomy or end-to-end post-quantum security;
- proof that a model's reasoning/output is true;
- proof that local Grid state alone detects a consistently deleted suffix when
  the local head/checkpoints are also rewritten.

Presence in the source tree, a passing synthetic drill, or a roadmap entry is
not production promotion.

## Current priorities

1. preserve the exact current authority/evidence boundary while completing the
   authentic controlled pilot;
2. finish the AXIOM One human/security/accessibility/package gates and one
   bounded useful provider/workflow path;
3. select and review one maintained external runtime for a deliberately bounded
   read-only adapter integration under Agent Runtime Adapter v1;
4. complete the remaining repository-effect completion/provenance chain in
   production-unreachable form before considering any mapping activation;
5. continue multi-host, Circles/plural-authority, and frontier work behind their
   own evidence and promotion gates.

See the [roadmap](ROADMAP.md), [execution queue](MASTER-TODO.md),
[production readiness tracker](PRODUCTION-READINESS-TRACKER.md),
[product definition](rebuild/PRODUCT-DEFINITION.md),
[normative requirements](rebuild/REQUIREMENTS.md),
[current threat model](security/CURRENT-BUILD-THREAT-MODEL.md), and
[technical white paper](whitepapers_and_research/WHITEPAPER.md) for the
corresponding boundaries.