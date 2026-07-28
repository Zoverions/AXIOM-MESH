<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.11.0; digest=9e444ef8312f142fd5233d3ef26df315411628a0eb1cea33b7d49a1f1e4f49cb -->
# AXIOM-MESH Product Definition

**Status:** Canonical rebuild definition
**Source baseline:** `e65041c` plus the full tracked documentation history
**Reconciled:** 2026-07-25

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
- node discovery, scheduling, capability-aware routing, and offline operation
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

The candidate production package keeps all four services as independent
supervised processes inside one container. This is a deliberate interim trust
boundary: only Gateway binds externally, while Hypervisor, Sandbox, and Grid
remain on loopback until an audited mTLS transport adapter exists. The package
must use a digest-pinned base, non-root identity, read-only root filesystem,
dropped Linux capabilities, explicit secrets and resource ceilings, no-egress
networking, bounded logs, and readiness-based health checks.

Operational telemetry is bounded-cardinality and excludes user-controlled
labels. Liveness is process-local; readiness follows the service dependency
graph and Grid integrity state. Detailed operations and OpenMetrics output are
authenticated and require `operations:read`.

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
