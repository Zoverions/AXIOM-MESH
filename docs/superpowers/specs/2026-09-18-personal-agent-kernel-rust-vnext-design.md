# Personal Agent Kernel Rust vNext — Design

**Date:** 2026-09-18  
**Status:** stacked laboratory design; depends on Personal Agent Kernel v0 PR #1669; no production promotion claim

## Goal

Build a complete Rust-first personal-agent kernel lifecycle while preserving AXIOM-MESH's current security boundary:

**Knowledge -> Operation -> Authority**

The kernel may compile plans, rehearse them, request authority, verify exact imported Mesh bindings, invoke a typed host port after authority is proven, evaluate receipts, and derive continuity evidence. It may not create authority from identity, memory, model output, successful history, continuity, or its own policy state.

## Core novelty

### 1. Proof-carrying plan DAG

The unit of autonomy is not "the agent." It is a bounded plan node.

Every effectful node carries an exact capability reference, autonomy ceiling, effect class, reversibility class, exact budget requests, explicit parent dependencies, immutable plan digest, revocation epoch, shadow/rehearsal status, and eventual receipt.

Authority attaches to a plan node, not to an AI identity.

### 2. Causal Authority Membrane

Knowledge may influence proposals but cannot cross directly into authority.

Only explicit constitution state plus independently verified Mesh authority evidence can cross the membrane into an effect port.

Receipts may become evidence for memory or earned-autonomy review, but neither memory nor successful history can mint authority.

### 3. Authority conservation

Delegation is treated as a conserved multidimensional resource.

A child proposal must be a strict subset of its parent grant. A sibling ledger reserves from one shared parent pool so authority cannot be widened by splitting a grant among several delegates and recombining it later.

Delegation remains a proposal until Mesh re-authorizes it.

### 4. Shadow-before-effect

Effectful plans are rehearsed before a Mesh request is produced.

Reversible and compensatable operations carry rollback semantics. Irreversible operations require an explicit owner-confirmation reference and are never silently upgraded from ordinary autonomy.

Counterfactual execution therefore becomes authorization evidence rather than merely a user-interface preview.

### 5. Autonomy decay on surface drift

Earned autonomy is bound to an exact runtime surface:

- model digest;
- runtime digest;
- capability-surface digest;
- attestation epoch.

Any drift collapses the effective autonomy level to `observe` until reviewed again. Model replacement cannot inherit operational trust merely because it inherited memory or identity.

### 6. Receipt-gated memory

Agent-derived durable memory must be causally linked to observed receipts plus independent evidence.

This prevents a model from repeatedly asserting its own inference until the inference becomes trusted memory.

### 7. Authority-free continuity

Continuity export carries identity bindings, pack bindings, memory references, receipt references, and historical evidence only.

It never carries active capability grants, secrets, live leases, or a right to resume effects. Restored state must reacquire current authority.

## Rust architecture

The trusted design is split into narrow modules even while the first laboratory keeps them in one crate:

1. **identity** — owner, persistent entity, pack, replaceable runtime/model bindings;
2. **constitution** — invariant rights and prohibited authority sources;
3. **planner** — bounded DAG and exact node compilation;
4. **budget** — multidimensional aggregate accounting;
5. **autonomy** — capability-specific level plus runtime-surface binding;
6. **shadow** — reversibility/owner-confirmation gate;
7. **mesh** — exact request/proof adapter seam;
8. **effects** — typed host port receiving only verified authority;
9. **receipts** — result binding and causal evidence;
10. **memory** — quarantine/admission without truth or authority claims;
11. **delegation** — conserved attenuation ledger;
12. **continuity** — export/restore with authority stripped.

The laboratory is standard-library-only and forbids unsafe Rust.

## Mesh integration

Production promotion keeps the existing authority chain canonical:

**Personal Kernel -> Gateway -> Hypervisor -> Sandbox -> Grid -> effect**

Rust does not create a second policy authority.

A future production adapter maps the Rust `AuthorityRequest` into the existing Mesh intent/capability/consent/budget contracts and returns an exact proof only after the current supported Mesh verifier succeeds.

Every imported proof is bound to owner subject, plan digest, node id, capability, revocation epoch, expiry, and delegation-hop ceiling. Mismatch is deny.

## Mesh-native differentiators

### Single-spend authority mobility

A persistent personal agent must be able to follow the owner from phone to desktop to home node to remote confidential-compute node without copying live authority.

The executable lab therefore models authority movement as a **handoff proposal**, never as grant cloning. A handoff names the source and target Mesh node and proposes the next revocation epoch. The current grant remains the only grant until Mesh atomically revokes/reissues under the newer epoch.

The Rust kernel cannot commit the handoff by itself.

### Witnessed effect receipts

High-consequence effects can be observed by multiple independent Mesh nodes. Witnesses bind to the exact receipt reference and effect digest, must be fresh, and are deduplicated by witness node.

A witness quorum strengthens causal evidence for memory, audit, insurance, dispute resolution, and later autonomy review. It never creates action authority.

This gives the personal agent a distributed answer to a subtle problem: the executor should not be the sole source of truth about what the executor claims it did.

### Partition-safe offline envelopes

A future Mesh adapter may issue a short-lived offline effect envelope for disconnected operation. Such an envelope must be pre-authorized by Mesh and bind exact capability, effect count, resource budgets, expiry, target device, runtime surface, and a no-delegation rule.

Offline consumption is monotonic and cannot replenish itself. Reconnection must reconcile receipts before another envelope is issued. Conflicts fail closed rather than merging authority.

### Attestation-aware execution placement

The Mesh scheduler may select among eligible local, peer, cloud, or confidential-compute nodes using current attestation, resource availability, latency, privacy class, energy, and cost.

Placement is deliberately downstream of policy eligibility and upstream of a final exact Mesh grant. A scheduler may choose **where** an authorized operation could run; it cannot decide **whether** the operation is authorized.

### Recovery quorum without authority inheritance

Recovery material can be distributed across owner-controlled Mesh nodes and optional trustees. A recovery quorum may reconstruct continuity material, but restoration still starts with zero live effect authority.

Recovery therefore restores the personal entity without silently turning backup holders into operators.

## Standards-backed adapter seams

These are adapter targets, not new authority roots.

### Runtime components

Use WASI 0.3 and the WebAssembly Component Model for replaceable skills and effect adapters. WIT host imports expose only explicit Mesh-authority and effect capabilities. Components receive no ambient filesystem, network, environment, credential, or clock authority unless the host grants it.

### Human presence

Use WebAuthn Level 3 as a strong owner-presence or reauthentication signal where a product surface supports it. A passkey is evidence for an owner ceremony, not the personal agent's identity root.

### Workload identity

Support SPIFFE/SVIDs for short-lived process/workload identity between heterogeneous Mesh nodes. SVID identity authenticates a workload; it does not authorize an AXIOM capability.

### Runtime/device attestation

Normalize hardware/runtime attestation through the IETF RATS model, EAT, and the RATS conceptual-message wrapper. Attestation may reduce or deny authority; it cannot enlarge the owner's grant.

### Portable credentials

Accept W3C Verifiable Credentials 2.0 plus OpenID4VP/OpenID4VCI through selective-disclosure adapters. Credentials supply evidence to policy; they never bypass capability evaluation.

### Private multi-party coordination

Use MLS/RFC 9420, with a Rust implementation such as OpenMLS, for Circle/treaty channels that need forward secrecy and post-compromise security. Message confidentiality does not imply action authority.

### Updates

Use TUF-style signed metadata, rollback protection, thresholds, expiry, and root rotation for kernel/component update metadata. A successful update invalidates runtime-surface-bound autonomy until the new surface is reviewed.

## Transport

Keep AXIOM's authenticated transport boundary as the authority boundary.

Rust libp2p/QUIC can be evaluated for peer discovery, NAT traversal, relays, and heterogeneous-device transport, but transport identity and reachability must not become authorization.

Unreleased hybrid post-quantum handshake work remains research-only until released, audited, and separately approved.

## Confidential execution

TEE-backed execution may be used for sensitive remote tasks only when attestation is verified and bound into the request. The kernel consumes normalized attestation results rather than cloud-vendor-specific trust claims.

TEE evidence constrains where an operation may run; it is never a reason to grant the operation.

## End-to-end state machine

1. Owner intent becomes a bounded plan DAG.
2. Kernel validates owner, dependency order, autonomy, budgets, memory state, and current runtime surface.
3. Kernel produces a compiled plan with no authority.
4. Kernel produces a shadow report.
5. Incomplete rollback or confirmation coverage stops the flow.
6. Kernel creates exact Mesh authority requests.
7. Current Mesh path verifies identity, capability, consent, policy, budgets, freshness, revocation, and runtime constraints.
8. Rust imports the Mesh proof and verifies exact binding and freshness.
9. Only then may a typed effect host be called.
10. Returned receipt must bind to the same grant, plan, node, and capability.
11. Receipt becomes evidence; it is not authority.
12. Derived memory may be considered using receipt/provenance rules.
13. Delegation proposals reserve from the parent's conserved budget and require Mesh re-authorization.
14. Continuity export strips all live authority.
15. Restore starts effect-authority-empty.

## Promotion gates

This laboratory may move toward production only after all of the following are true:

- semantic differential tests against the Node v0 oracle;
- adversarial corpus and property tests for attenuation/conservation;
- exact cross-platform Rust CI on Linux, Windows, macOS ARM, and macOS Intel;
- dependency and license review for every non-std adapter;
- cryptographic test vectors for every signer/verifier;
- replay, stale-revocation, clock, rollback, crash, and partial-effect tests;
- WASI host capability-denial tests;
- restore-with-zero-authority tests;
- compromised-sibling delegation tests;
- model/runtime/capability-surface drift tests;
- independent security review;
- documented rollback to the supported Node authority path.

Until those gates pass, Node remains authoritative and this Rust lane is evidence rather than production authority.
