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

## Trust-split implementation

The Rust programme is intentionally split into three independently reviewable layers:

1. **Semantic core** — `labs/personal-agent-kernel-rust`
   - zero third-party dependencies;
   - `#![forbid(unsafe_code)]`;
   - plan, budget, autonomy, delegation, offline-envelope, witness, continuity, and exact proof-binding semantics;
   - no cryptographic implementation and no component runtime.

2. **Crypto adapter** — `labs/personal-agent-kernel-rust-crypto`
   - fixed dependency lock;
   - Ed25519 verification through `ed25519-dalek`;
   - SHA-256 and base64url compatibility with the existing AXIOM verifier;
   - verifies signed canonical bytes first, requires canonical JSON byte equality, denies unknown proof fields, and constructs the core `MeshProofInput` directly;
   - verified cryptographic evidence still grants no effect authority.

3. **Component host** — `labs/personal-agent-kernel-wasmtime-host`
   - fixed dependency lock;
   - real Wasmtime Component Model compilation, import introspection, linking, and instantiation;
   - only explicit AXIOM host imports are admissible;
   - no WASI context is added, so ambient filesystem/network/environment authority is absent rather than filtered after exposure.

4. **Offline single-spend journal** — `labs/personal-agent-kernel-offline-journal`
   - append-only hash-chained consumption records;
   - durable flush before a consumption is exposed to the caller;
   - exact monotonic global and per-envelope sequences;
   - fail-closed torn-tail and historical-tamper detection;
   - atomic create-only single-writer lease preventing concurrent local consumers;
   - uncleared crash leases require explicit recovery rather than automatic takeover;
   - stores only consumption/control metadata and never executes an effect or mints authority.

Dependency-bearing sidecars may constrain or verify inputs to the semantic core. They may not mutate the core constitution, create a parallel Gateway, mint capability grants, or turn a runtime import or journal record into execution authority.

## Implemented laboratory evidence

The current stacked laboratory now contains executable evidence for:

- exact Node v0 versus Rust blocker semantics over a shared policy corpus;
- deny-by-default component-host assessment with no ambient network, filesystem, environment, process, clock, or credential authority;
- exact inert Mesh adapter requests bound to kernel, principal, owner, plan, node, capability, budgets, and revocation epoch;
- partition-safe offline envelopes imported only through a trusted Mesh-adapter seam;
- in-process replay rejection for duplicate offline-envelope references;
- device, runtime-surface, revocation-epoch, expiry, effect-count, currency, and budget binding for offline effects;
- monotonic offline consumption before host execution, so crash/receipt failure cannot restore spent allowance;
- reconciliation reports that expose missing offline receipts without issuing replacement authority;
- attestation-aware placement filters that constrain **where** an operation may run while explicitly granting no execution authority.

### Offline-envelope persistence boundary

The semantic-core replay registry remains intentionally in-memory. Restart-safe local consumption is instead delegated to the separate durable offline-journal laboratory.

That journal now targets **single-local-writer restart safety**:
- clean reopen recovers exact envelope consumption sequence;
- duplicate registration or sequence reuse/gaps fail closed;
- torn tails and historical hash-chain corruption block reopen;
- a live writer lease prevents two local processes from consuming the same journal concurrently;
- an uncleared crash lease blocks automatic takeover and requires explicit recovery.

This still does **not** claim cross-device global single-spend. Production-grade authority uniqueness across phone, desktop, home node, and remote node requires Mesh-side issuance/consumption coordination or an independently reviewed distributed monotonic mechanism. Local journal state must never be merged as if conflicting consumptions were ordinary sync data.

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

## State-lane control plane — local tool coordination

Receipt-gated memory answers whether a candidate may become durable memory. It does not, by itself, solve the coordination failure where several tools mutate one logical state surface or validate against a stale view.

The Personal Agent Kernel laboratory therefore adds a separate state-lane control-plane invariant:

1. **One mutation lane per tool.** A registered tool owns exactly one lane in a registry. It cannot write another tool's lane, and duplicate ownership fails closed.
2. **Append-only mutations.** Every accepted mutation advances the lane revision, retains the prior operation, binds a content digest, and carries explicit provenance.
3. **Optimistic concurrency is explicit.** Every mutation names the exact lane revision it observed. A stale expected revision is rejected rather than silently overwriting newer state.
4. **Cross-tool reads require an explicit merge.** A merge names the exact revision of every lane it consumes. Any revision drift rejects the merge.
5. **Conflicts remain visible.** If two lanes expose the same state key with different value digests, the merge returns an unresolved conflict. There is no implicit last-writer-wins rule.
6. **Agreement does not erase provenance.** Identical values may coalesce in the merge view, but every contributing lane, operation, revision, and provenance reference remains attached.
7. **Merge views can expire.** A previously materialized view can be revalidated against current lane revisions; if any lane advanced, the old view is stale.
8. **State is not authority or truth.** Lane registration, mutation, merge consistency, and provenance create neither AXIOM effect authority nor a truth certificate.

This is deliberately a laboratory coordination semantic only. It adds no network path, persistence adapter, credential access, Gateway route, Grid mutation, capability registration, production activation, merge authority, or deployment authority.

The intended composition is:

tool-owned append-only lanes
  -> exact-revision explicit merge
  -> visible agreement/conflict + provenance
  -> ordinary memory/evidence assessment where applicable
  -> Knowledge -> Operation -> Authority

The operator surface should render the merge view and its unresolved conflicts, not silently flatten collisions in the underlying lanes.

Tool identity references in this laboratory are typed coordination inputs; a production adapter must bind them to the trusted component/host identity rather than accepting a model-supplied string as proof of tool identity.

### Snapshot-bound validation receipts

State-lane isolation prevents tools from silently overwriting each other, but validation itself must also be bound to current state.

The laboratory therefore treats a validation result as a sealed receipt over one exact conflict-free merge snapshot:

- the merge consumer and validator identity must match;
- the receipt binds the exact merge ID, source lane revisions, merged state-key/value digests, and the complete lane/provenance origins carried by the merge;
- the validator supplies an external result digest plus bounded supporting evidence references;
- unresolved merge conflicts cannot be laundered into a validation receipt;
- duplicate validation IDs fail closed;
- any later mutation to any source lane makes the receipt stale;
- a stale receipt remains historical evidence but is unusable as current validation;
- conformance, non-conformance, or inconclusive status grants no AXIOM authority and certifies no underlying truth.

This closes the specific race where a tool validates a fix against revision N of a specification while another tool has already advanced the specification to revision N+1. Consumers must call the currentness check before treating the validation as applicable.

The first laboratory deliberately invalidates the whole receipt on any source-lane revision change, even when the changed key may appear unrelated. Finer dependency-scoped validation can be added later only if it preserves an explicit dependency graph and cannot create a stale-state bypass.
