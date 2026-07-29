<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.12.0-dev.0; digest=69788e11d0291bea931eff290765ceee95e4c5ce98099c03f8374fa70ce9b804 -->
# AXIOM-MESH Product Definition

**Status:** Canonical rebuild definition
**Current build:** `0.12.0-dev.0`
**Archived inputs:** locked branch `deprecated/pre-0.12-documentation-corpus`
and immutable tag `archive/legacy-main-pre-clean-room-2026-05-21`
**Reconciled:** 2026-07-29

## One-sentence definition

AXIOM-MESH is a local-first capability network that turns a human or agent
intent into a policy-authorized plan, executes each approved effect inside a
bounded runtime, and emits portable, cryptographically linked evidence for
audit, governance, recovery, and optional economic settlement.

## What is being built

The product has four runtime responsibilities:

1. **Gateway** — the only public ingress; authenticates principals, validates
   requests, applies abuse controls, and exposes the operator/user interface.
2. **Hypervisor** — converts an intent into an explicit plan; evaluates layered
   policy and consent; issues short-lived, single-use capability grants.
3. **Sandbox** — executes only the action and resources named by a valid grant;
   untrusted workloads are isolated and have no ambient network, filesystem,
   secret, or host authority.
4. **Grid** — owns durable state, the append-only evidence chain, node and
   capsule registries, governance records, export/import, and settlement
   adapters.

The mandatory effect path is:

```text
Intent
  -> authenticate and normalize
  -> evaluate policy, consent, and risk
  -> produce a deterministic plan
  -> issue a scoped capability grant
  -> execute in the Sandbox
  -> create a decision/evidence graph
  -> commit an attested result to the Grid
  -> optionally settle through an audited adapter
```

No component may bypass this path for a privileged or externally visible
effect.

## Product promises

### Sovereignty

- Local-first operation and explicit degraded modes.
- The user can inspect, revoke, and export their identity, consent, memory,
  intent, entitlement, governance, and asset history.
- Institution or guild policies may tighten a user's safety floor but cannot
  silently weaken a higher-level denial or expand consent.
- Blockchain settlement is optional. Core identity and user access do not
  depend on ownership of AXM or another token.

### Verifiability

- Every mutation has an actor, policy decision, input digest, result digest,
  timestamp, and previous-event hash.
- Decision provenance records inputs, rules, tool calls, approvals, and
  outcomes. It does not claim to expose or prove a model's private chain of
  thought.
- Cryptographic and zk proofs are accepted only against an identified circuit,
  verification key, public-input schema, and verifier implementation.
- A missing verifier, provider, credential, or settlement adapter is an
  unavailable capability, never a synthetic success.

### Capability safety

- Installing a capsule does not grant authority.
- A capsule is immutable, content-addressed, signed, versioned, and described by
  a machine-readable manifest and software bill of materials.
- Runtime grants are short lived, audience bound, intent bound, resource bound,
  revocable, and single use.
- External source code and MCP tools are quarantined until their provenance,
  permissions, and behavior pass policy.

### Governance

- Policy changes follow proposal, review, delay, activation, verification, and
  rollback stages.
- Automated systems may tighten or pause unsafe behavior; they cannot
  unilaterally expand their own authority.
- Emergency powers are scoped, time limited, logged, and subject to
  retrospective review.
- Human and agent input can be represented separately, but neither chamber is
  treated as proof that a proposal is true.

### Portability

- Export is a P0 trust primitive, not a future add-on.
- Export bundles use stable versioned schemas, canonical JSONL, a signed
  manifest, content digests, selective scopes, and deterministic dry-run
  re-import.
- The evidence chain remains verifiable after export without leaking unrelated
  private records.

## Capability families

The platform must support these families through the same capsule and policy
model rather than bespoke privileged paths:

- AI inference and multi-step orchestration
- research, web retrieval, code analysis, math, physics, cryptography, and data
  analysis
- communications/channel adapters
- identity, consent, reputation, credentials, and selective disclosure
- storage, backup, recovery, and distributed synchronization
- education, health, government/public-service, business, and finance capsules
- task markets, automated workforce, payroll, and embodied-device control
- node discovery, scheduling, capability-aware routing, and offline/approved
  online causal operation
- governance proposals, voting/delegation, emergency controls, and policy
  inheritance
- auditable accounting, staking/bonds, rewards, treasury routing, and optional
  cross-chain settlement

Domain capsules do not receive special trust merely because their domain is
socially important. Health, education, government, finance, and embodied
systems receive stricter consent, evidence, review, and data-minimization
requirements.

## Deliberate non-claims

Until independently demonstrated, AXIOM-MESH does not claim:

- that a model's reasoning or truth is proven by hashing a trace;
- that useful-compute scoring is a secure consensus protocol;
- production-grade BFT finality from an in-memory or single-node ledger;
- end-to-end post-quantum security;
- legal/regulatory compliance merely from selective-disclosure architecture;
- live mainnet/testnet deployment from mock evidence;
- secure arbitrary code execution from Docker configuration alone;
- financial-grade tokenomics or bridge safety without external audit and
  deployment evidence.

## Rebuild acceptance rule

A feature is `implemented` only when all five are present:

1. production-path code with no synthetic-success fallback;
2. fail-closed authorization and negative-path tests;
3. durable evidence produced by an executable verification command;
4. operator documentation matching the actual behavior;
5. a current status record tied to a commit.

Anything else is explicitly `adapter-required`, `experimental`, `specified`, or
`disabled`.

The operator API and command-line client are separate implemented capability
claims. A browser dashboard is not implied by those claims and remains
specified until it independently satisfies this acceptance rule.

Backup creation follows the normal privileged effect path. Restore is a
stopped-Grid recovery operation: it must verify the signed encrypted snapshot,
exact expected database digest, schema, and evidence head before atomically
replacing state, and it must preserve the replaced database and emit recovery
evidence at the next trusted startup.

The candidate production package supports two single-host topologies. The
compact topology keeps all four services as independent supervised processes
inside one container. The isolated topology runs four independently
restartable containers on an internal network. Only Gateway crosses the
permission-restricted Unix-domain host ingress in either topology. Every
internal edge uses mutually authenticated TLS 1.3,
distinct Ed25519 leaves, DNS and SPIFFE-style URI identities, exact active
certificate pinning, and the signed/replay-protected request envelope. The package
must use a digest-pinned base, non-root identity, read-only root filesystem,
dropped Linux capabilities, explicit secrets and resource ceilings,
permission-restricted local ingress, bounded logs, and readiness-based health
checks. The Compose candidate must attach no network, fail startup when an
active non-loopback or IPv4/IPv6 default route exists, preserve only explicit
Unix-domain Gateway ingress, and emit protected negative-path evidence.
Other orchestrators must reproduce and independently verify this policy.

The isolated topology receives an atomically projected credential tree:
exactly one application private identity and one transport private leaf per
unit, public trust records, Grid-only durable state/data key, and Gateway-only
API registry. Protected CI must prove Sandbox-only loss, three unchanged
survivors, `503` dependency readiness, Sandbox-only restart, state
preservation, and blocked public TCP connectivity. No replicated Grid,
automatic failover, or zero-downtime upgrade is implied.

Operational telemetry is bounded-cardinality and excludes user-controlled
labels. Liveness is process-local; readiness follows the service dependency
graph and Grid integrity state. Detailed operations and OpenMetrics output are
authenticated and require `operations:read` or a dedicated
`telemetry:collect` principal that Gateway confines to those two routes. A
separate host-side relay preserves kernel deny-egress, requires the exact four
services, emits a fixed 68-point OTLP/HTTP JSON set, and routes only the fixed
Alertmanager v2 vocabulary. Exact HTTPS origins, private receiver credentials,
no redirects, bounded persistent queue and retry, alert-reserved capacity,
idempotency, redaction, receipts, and dead-letter audit are release-gated.
Pilot-owned destinations and live acknowledgement measurements remain
promotion evidence.

The protected Linux resilience profile applies bounded body and concurrent
request pressure, suspends and kills the actual Sandbox child process, and
requires dependency-aware degradation, fail-closed supervisor exit, clean
restart, and Grid-state preservation. Signed evidence excludes request bodies,
intent identifiers, process identifiers, host paths, and secrets. Cgroup,
disk, pilot-traffic, and orchestrator replacement behavior remain separate
deployment evidence.

Host evidence generation is safe under the concurrent test runner. Every
real-stack drill owns one aligned four-port lease across startup, runtime,
stopped maintenance, and restart. Atomic cross-process ownership prevents
partial or complete overlap, while an independent bind probe rejects external
occupancy. This test coordination does not grant production network authority.

Incident response is an executable candidate gate. A machine-readable policy
selects the highest matching severity, requires independent command roles,
permits only authority-reducing, preservation, recovery, communication, or
review actions, and fails closure without verified containment, recovery,
evidence, communications, retrospective scheduling, and independent review.
The protected automated tabletop binds eleven independently signed operational
control artifacts from the same revision. A facilitated pilot exercise and
live roster remain external promotion requirements.

The pilot evidence package is now an implemented verification surface, not a
deployment claim. A separately anchored authority-signed policy pins one
kernel version, source revision, image digest, the current 30-day and SLO/
recovery thresholds, and five distinct reviewer keys. One exact dossier binds
measurements, non-exportable custody receipts, four trust roots, and 13
evidence hashes to that build. Authentic intake requires canonical policy and
dossier files plus exactly 13 canonical local evidence envelopes. Each
v2 envelope is secret-free, raw-byte hash-bound, checked against an exact
type-specific semantic contract, and signed by its assigned policy-pinned
reviewer role; unknown fields, contradictory measurements, extra files, and
symlinks fail closed. Every role also signs the common dossier digest. Success
admits the package to a separate promotion review and cannot set production
status. Synthetic verifier conformance cannot replace authentic pilot
evidence.

Independent security review is also an implemented intake surface, not an
audit claim. The current-build threat model and an authority-signed policy pin
one exact build, eight-part scope, eight reviewed artifact digests, an external
reviewer, and a distinct exception approver. The exact signed ledger assigns
every finding an owner and disposition, recomputes all counts, requires
reviewer-verified closure of critical/high findings, and accepts only
separately approved, contained, expiring medium/low exceptions. Protected
synthetic conformance explicitly states that it performed no independent
review and cannot promote production.

Admitted-node discovery and placement reservation are implemented inside the
single authoritative Grid. Signed v2 admissions bind the node identity,
authenticated owner, HTTPS origin, failure domain, roles, resource ceilings,
capabilities, security profile, software digest, and expiry. Grid signs
filtered discovery results. A policy-controlled schedule intent selects only a
complete deterministic capacity-aware placement, encrypts the requirements
and result, and degrades it after quarantine, expiry, or loss of the original
eligibility contract. This feature does not contact the node, enforce remote
resources, authorize a workload, authenticate a result, prove globally unique
owners, or provide multi-host federation.

The container source policy and supervisor are verified, and the real
four-process stack passes a host-mode production drill. Image-build and
container-runtime evidence remain mandatory before the container package
becomes an implemented capability or a live-deployment claim.

Portability export is implemented for the kernel-owned data registry. Exports
support time and record-family scope, strict owned object/capsule selectors,
canonical JSONL, signed continuity metadata, and optional recipient encryption
using ephemeral X25519, HKDF-SHA-256, and AES-256-GCM. Unowned selectors fail
closed instead of returning a partial or over-broad bundle.

Offline causal sync is implemented as an admitted-node package protocol, not as
a federation or consensus claim. Each node and bundle uses Ed25519 signatures;
each update binds the owner, namespace, record, operation, content digest,
version vector, timestamp, nonce, and any explicit conflict heads it resolves.
Grid rejects unadmitted, expired, quarantined, wrong-owner, wrong-key, replayed,
or equivocating sources. Concurrent non-commutative heads remain visible until
a later update causally dominates and explicitly names every current head.

Online causal exchange is implemented as a separate host relay between two
exact Gateway origins for one matching owner. It verifies each source event
against a pinned Grid key, re-verifies every node bundle, and stores ordered
pending data in bounded authenticated-encrypted state. Polling cannot apply
data: the destination still requires an exact one-use approval from an
independent principal. Owner-scoped preflight absorbs duplicates before
approval, and partition rejoin preserves visible concurrent heads until an
explicit all-head resolution reaches both Grids. This is transport and
convergence of signed causal records, not replicated Grid consensus,
federation, or automatic authority.

Production startup may also be populated by separate deployment-independent
secret and policy providers. Their IDs and pinned Ed25519 keys are independent;
their absolute commands and supporting artifacts are digest-pinned. Each
one-shot response is short-lived and bound to a random request nonce,
deployment, exact resource IDs, aliases, classifications, media types, byte
limits, and content digests. The broker validates the complete data-key,
principal, transport, ordered-policy, and capability generation before
starting the unchanged supervisor, and removes the private per-start
generation on shutdown. The reference file adapter is protocol evidence, not
a live vault, cloud custody, workload-identity, or live-refresh claim.
