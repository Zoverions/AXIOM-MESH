# AXIOM-MESH Technical White Paper

**Version:** `0.12.0-dev.3`

**Updated:** 2026-08-12

**Status:** implementation-grounded architecture and product-development paper

**Deployment status:** production candidate; no live production claim

## Abstract

AXIOM-MESH is a local-first coordination, authority, and evidence substrate. It
accepts authenticated human or machine intent, evaluates that intent against
explicit deny-dominant policy and consent/approval requirements, performs only
bounded authorized effects, and records cryptographically linked evidence.

Its purpose is not merely to run agents. Its purpose is to make authority,
consent, execution, data custody, recovery, and claims inspectable while
allowing human applications, machine principals, replaceable agent runtimes,
domain systems, and eventually multi-node governance to share one fail-closed
substrate.

The supported kernel separates ingress, policy/planning, bounded execution, and
durable evidence into four responsibilities: Gateway, Hypervisor, Sandbox, and
Grid. The current registry-backed surface implements constrained human-sponsored
machine principals, policy-filtered machine discovery, Grid-attested terminal
receipts, encrypted durable state, signed hash-linked evidence, externally
retainable continuity anchors, scoped portability, recovery, service isolation,
admitted-node reservations, operator-approved causal exchange, and signed
provider startup.

The same source tree also contains two substantial **built but production-
unreachable** integration boundaries:

1. an evidence-first repository-document chain spanning signed planning,
   resolver admission, target authorization, durable preparation, external-
   effect outbox, a credential-isolated docs-only GitHub operator, and signed
   completion; and
2. a byte-pinned Agent Runtime Adapter v1 contract with 28-case synthetic
   conformance evidence.

The repository operator can create or recover a deterministic **open draft pull
request** in tests, but production has zero resolver mappings, no matching
policy action, no supported route into that chain, and no merge/direct-main
authority. The runtime-adapter reference loads and certifies no external
runtime.

The governing rule is:

> **Intelligence is not authority. Connectivity is not authority. Installation is not authority. Evidence must state exactly what it proves.**

## 1. Problem and motivation

Agent and automation systems often combine prompts, models, tools, credentials,
storage, network access, side effects, and logs inside one application process.
That fusion makes basic questions difficult to answer precisely:

- who requested an effect;
- which identity and sponsor were responsible;
- which policy, consent, confirmation, and independent approval authorized it;
- which exact plan, tool, destination, data scope, and budget were bound;
- whether authority was widened, substituted, replayed, or silently delegated;
- whether the runtime executed the reviewed input rather than a later variant;
- whether external I/O happened only after durable authorization evidence;
- what durable state changed;
- whether an acknowledged outcome has corresponding evidence;
- whether uncertainty was hidden as success;
- whether a receipt proves integrity, provenance, an internal statement, or an
  external-world fact;
- how a user can inspect, revoke, export, delete, restore, dispute, or migrate
  the result; and
- which source-tree features are actually runnable versus deliberately gated.

AXIOM-MESH treats these questions as the product boundary. A model output is
data until an authenticated principal, valid authority profile, compatible
policy, explicit plan, bounded grant/effect path, and durable evidence agree.

This posture rejects two common shortcuts. A friendly user interface may
simplify terminology, but it may not hide consequential authority. And green
synthetic tests or source presence may not be marketed as production merely
because code exists.

## 2. Governing development posture

### 2.1 Capability lifecycle

AXIOM-MESH distinguishes five lifecycle states:

1. **Built** — code and tests exist.
2. **Enabled** — an operator deliberately activates the code under explicit
   policy and credential boundaries.
3. **Exposed** — a user, node, runtime, or external system can reach it.
4. **Production-promoted** — the exact build and deployment satisfy applicable
   security, recovery, governance, usability, legal, and operational gates.
5. **Marketed** — public claims describe only the promoted scope.

A technically complete subsystem may remain production-unreachable for a long
period while its activation path, custody, and external evidence are reviewed.

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**

### 2.2 Claims follow executable evidence

The machine-readable capability registry classifies tracked capabilities as
`implemented`, `experimental`, `specified`, `adapter_required`, or `disabled`.
The current registry tracks **49 capabilities, including 31 implemented**.
Only registry-backed `implemented` status is a current runnable capability
claim.

This is stricter than “the code is finished.” The repository-effect outbox and
GitHub docs operator are real source with adversarial tests, yet they are not a
production capability because current production policy, mapping registry, and
routes cannot reach them.

### 2.3 Human clarity is a security property

A user-facing product may use ordinary language, but it must preserve the
ability to answer:

- what will happen;
- who or what is acting;
- what data will leave the node;
- which provider/destination receives it;
- which purpose, cost, retention, timeout, cancellation, and retry rules apply;
- whether confirmation or independent approval is required;
- whether the system is degraded or uncertain;
- what the evidence proves and does not prove; and
- whether the action can be reversed.

Phone usability, keyboard/screen-reader access, reduced motion, contrast,
plain-language receipts, export, deletion, revocation, and recovery are release
gates for human products rather than optional polish.

## 3. Supported architecture

### 3.1 Four kernel responsibilities

| Service | Responsibility | Authority it does not have |
|---|---|---|
| Gateway | Authenticates principals, validates requests, applies abuse/idempotency controls, exposes versioned APIs | Cannot invent execution authority |
| Hypervisor | Normalizes intent, composes deny-dominant policy, revalidates machine authority, constructs plans, checks approvals, issues grants | Cannot silently widen authority or bypass Grid evidence |
| Sandbox | Verifies a grant and executes only its bounded operation | No ambient supported shell, package, host, secret, arbitrary-code, or open-network authority |
| Grid | Owns encrypted durable state, approvals, evidence, consent, governance, accounting, portability, recovery, node/conflict records | Cannot originate intent or silently authorize effects |

The ordinary supported privileged path is:

```text
principal
   |
   v
Gateway -> Hypervisor -> Sandbox -> Grid
   |           |            |         |
 auth      plan/policy     grant     state+evidence
```

A browser, model provider, machine runtime, repository operator, remote node,
administrator, settlement system, autonomous loop, or domain capsule does not
become an alternate authority merely by being connected.

### 3.2 External-effect extension

A future external side effect may require an adapter/operator outside Sandbox's
current deterministic built-ins. AXIOM therefore uses an evidence-first
extension rather than giving an operator ambient authority:

```text
normal intent/policy/approval evaluation
        |
        v
Grid-durable prepared effect
        |
        v
external-effect outbox
        |
        v
bounded operator / adapter
        |
        v
signed operator receipt
        |
        v
Grid completion evidence
```

The current repository prototype demonstrates this structure but is not exposed
from production. The outbox may invoke its operator only after durable
preparation. Uncertain operator or receipt outcomes remain durably prepared; a
verified receipt is required before completion evidence is committed.

### 3.3 Deployment boundary

The compact candidate runs Gateway, Hypervisor, Sandbox, and Grid as separate
supervised Node.js processes in one hardened container. An alternate single-host
topology runs four independently restartable containers across four exact
internal network segments.

Internal service edges use mutually authenticated TLS 1.3, distinct Ed25519
identities, DNS and SPIFFE-style URI identity checks, exact active-leaf
fingerprint pinning, and signed replay-protected application envelopes. The
machine-readable default-deny service policy permits **only 40 current internal**
caller/destination/method/route combinations and derives allowed mTLS peers from
that graph.

Grid alone receives durable state and the data-protection key. Gateway alone
receives the API principal registry. The compact candidate uses
`network_mode: none` with permission-restricted Unix-socket host ingress. The
four-unit topology permits only required internal adjacency and has no external
route.

This is single-host isolation, not replicated state or automatic failover. The
host kernel, container engine, process owner, mounted secret policy, host
administrator, clock assumptions, and data-protection key remain within the
trusted computing base.

### 3.4 Runtime/source policy

The supported engine range is Node.js `>=24.14.0 <25` with npm
`>=11.0.0 <12` and zero third-party npm dependency packages.

Current machine-readable setup policy intentionally distinguishes:

- protected CI and `.node-version`: **Node.js 24.18.0**;
- candidate production image: **Node.js 24.19.0**.

Both exact zero-dependency locks are installed with lifecycle scripts disabled
and must remain unchanged.

## 4. Intent-to-evidence lifecycle

The registry-backed production path is conceptually:

1. **Authenticate.** Gateway resolves the principal and authority profile.
2. **Validate.** Schema, action, size, origin, rate, concurrency, and
   idempotency rules apply.
3. **Normalize.** Hypervisor creates a canonical intent and authority binding.
4. **Evaluate.** Deny-dominant policy, consent, purpose, confirmation, and risk
   gates apply.
5. **Resolve destination/constraints.** Current built-in destinations are
   computed from the selected tool and must remain within machine/policy
   ceilings.
6. **Plan.** Effects, dependencies, data scope, destination, budget, timeout,
   cancellation, and evidence obligations are explicit.
7. **Approve.** Permitted high-risk effects require an exact expiring
   independent approval.
8. **Grant.** Hypervisor signs a short-lived audience-, intent-, plan-, policy-,
   tool-, resource-, authority-, and constraint-bound one-use grant.
9. **Execute.** Sandbox performs only the named bounded operation.
10. **Commit.** Grid records mutation and evidence transactionally.
11. **Explain/attest.** Gateway returns structured results; constrained-machine
    owners may retrieve digest-only Grid-attested terminal receipts.

Failure at one stage cannot be converted into synthetic downstream success.

For future external-effect paths, steps 8-10 may be extended by a separately
reviewed prepared-effect/outbox/operator boundary, but the original authority
facts remain the source of authorization.

## 5. Machine principals

### 5.1 Human-sponsored finite authority

Authenticated constrained `agent` principals require an existing human sponsor
and finite exact scopes, actions, purposes, destinations, runtime identity,
expiry, non-delegation, execution-time ceilings, request-size/rate ceilings,
concurrency limits, and response-size limits.

Wildcard scopes and administrator role are rejected. The machine-authority
digest is carried through request binding, plan provenance, capability claims,
result evidence, and receipts. Least-privilege infrastructure `service`
principals remain backward-compatible unless opting into the same constrained
profile.

### 5.2 Destination binding

For the current built-in operation set, Hypervisor derives the destination from
the policy-selected `builtin.*` tool and canonicalizes it to `local`. Requests
fail before grant issuance when the computed destination is outside the
principal's finite destination ceiling. Sandbox independently verifies the
signed destination again before execution.

Unknown provider, remote, or MCP destination semantics remain unresolved and
fail closed. A destination field is not an arbitrary external-execution claim.

### 5.3 Machine discovery

`/v1/machine-discovery` exposes a digest-bound snapshot of the authenticated
machine principal's own requestable intersection under active deny-dominant
policy: finite scopes, actions, purposes, destinations, and budgets.

Denied, unrelated, unresolved-destination, and out-of-scope actions are omitted.
The response explicitly states that discovery is **not authorization**. Actual
effects still pass the normal intent/policy path.

### 5.4 Grid-attested terminal receipts

Once a constrained-machine intent reaches terminal evidence state, its owner
may request a Grid-attested receipt binding:

- canonical request digest;
- exact machine-authority digest;
- exactly one accepted event anchor;
- exactly one terminal event anchor;
- current chain-assurance metadata; and
- terminal result/error digest.

Raw terminal output is omitted. Foreign-owned and nonexistent IDs share the
same not-found boundary. Independent verification checks the Grid signature
against a trusted Grid public key.

This proves what Grid attests about the recorded AXIOM intent. It does **not**
independently prove an arbitrary external-world event.

### 5.5 Runtime identity is not hardware attestation

Runtime identifiers and optional software digests are typed authority-bound
attribution metadata. The current build does not claim TPM/TEE, measured boot,
workload/process attestation, or remote hardware proof.

## 6. Identity, transport, replay, and key lifecycle

Production service identities use Ed25519 keys provisioned outside source
control. Signed service requests bind issuer, audience, validity window, nonce,
method, path, caller identity, and body digest. Unknown issuers, wrong
audiences, stale/replayed requests, altered bodies, and invalid signatures fail
closed.

Internal TLS uses a locally provisioned Ed25519 CA and distinct service leaves.
Offline rotation validates a full replacement generation before atomic swap and
retains the prior generation for exact rollback. Active-leaf pinning rejects a
retired but still CA-valid leaf without requiring an online revocation service.

The candidate separately supports coordinated service/API credential rotation
and data-protection-key re-encryption. Rotation evidence follows signed key
transitions. Data-key rotation rewraps live and supported recovery state,
rejects wrong keys, recovers interrupted cutover, and preserves later evidence
through rollback.

A secret-free keyed ledger covers 32 conservative credential candidates from
deprecated history and makes supported-tip reuse a protected-CI failure.
External provider/custodian disposition remains a pilot promotion gate.

## 7. Policy, approval, consent, and governance

Policy composition is deny-dominant:

- any denial wins;
- highest risk wins;
- required scopes accumulate;
- required confirmations cannot decrease;
- numeric/categorical constraints can only narrow authority.

Consent receipts bind subject, controller, purpose, data scope, expiry, and
revocation. Installing a capsule, discovering a node, connecting a provider,
installing an agent runtime, or registering an operator does not itself grant
execution authority.

Local governance supports proposals, human voting, finalization, timelocked
activation, independently approved authority-reducing overlays, verification,
rollback metadata, expiring emergency controls, retrospective review, and
appeal records. Automated systems may tighten/pause authority; they may not
expand their own authority.

Machine-principal v1 is explicitly non-delegating. Portable delegation remains
unpromoted.

## 8. Execution and adapter boundary

The supported Sandbox is not a general-purpose code runner. It executes a small
registry of validated deterministic built-in operations. Arbitrary code,
external AI, messaging, storage transfer, repository mutation, settlement, zk,
regulated-domain, and embodied effects require separately named adapter/operator
boundaries and evidence.

An exposed adapter/operator must define:

- exact credentials/trust anchors;
- ingress/egress/destinations;
- input/output schemas;
- purpose/data scope;
- budget, timeout, cancellation, retry, idempotency;
- retention/deletion;
- replay behavior;
- evidence/receipt semantics;
- uncertain-outcome behavior;
- failure/uninstall/rollback; and
- independent test environment/threat model.

A missing or invalid provider returns `capability_unavailable`; production paths
never substitute mock success.

## 9. Grid, evidence, privacy, and durability

Grid stores authenticated-encrypted state and a signed SHA-256 hash-linked
evidence sequence. Startup verification fails closed on signature, link,
migration, key, or integrity failure.

Grid-owned record families include principals, consent, capsule manifests,
encrypted memory objects/edges, governance, admitted nodes, placement leases,
storage offers, balanced local accounting, import/export, causal updates,
conflicts, approvals, machine terminal receipts, backup/recovery data, and
evidence anchors.

Memory is content-addressed, owner-bound, encrypted, selectively disclosable,
exportable, and tombstonable. Operational telemetry excludes raw user content
and user-controlled high-cardinality labels.

Local accounting uses balanced double-entry journals with safe integer units.
It does not authorize tokens, payroll, bridges, liquidity, or external
settlement.

### 9.1 Modification detection versus truncation assurance

A local signed hash chain detects altered events, invalid signatures, gaps,
broken links, and disagreement with the locally stored head. That is not the
same as proving no suffix was deleted if an attacker can also rewrite matching
local head/trailing-checkpoint state.

For the stronger retained-history claim, the current build supports
`axiom-grid-continuity-anchor.v1` retained outside `AXIOM_DATA_DIR`. The anchor
is derived from a Grid-signed export-manifest head and checked using full
history verification from genesis.

A valid anchor proves current history equals or extends the retained head
**through the newest retained anchor**. It does not prove preservation of later
unanchored events and does not remove malicious host/root or active Grid-signing
key compromise from the trust assumptions.

Grid remains one transparency log, not BFT consensus.

## 10. Portability, synchronization, and network foundations

### 10.1 Export/import

Canonical JSONL export supports time, record-family, owned-object, and capsule
scopes. Signed manifests and continuity metadata permit independent
verification; optional X25519 recipient encryption protects selected records.

Imports are cryptographically verified and staged. An operator receives a
deterministic diff, and independent approval is required before records enter
an isolated foreign-provenance store. Imported records cannot overwrite native
signed state or impersonate local evidence.

### 10.2 Causal exchange

Admitted nodes can produce signed bundles with version vectors. Replay,
equivocation, missing dependencies, noncontiguous counters, and incomplete
conflict resolution are rejected. Concurrent heads remain visible until an
explicit resolution causally dominates every current head.

The online relay binds exact Gateway origins, pinned source Grid evidence, one
matching owner, encrypted ordered queues, bounded retry, duplicate preflight,
and independent one-use destination approval. Protected tests exercise two real
supervisors with controlled partitions.

This proves causal transport/conflict semantics, not federation, replicated
consensus, or global finality.

### 10.3 Discovery/scheduling

Signed node admissions bind identity, owner, HTTPS origin, failure domain,
roles, software digest, security profile, resource ceilings, expiry, and
quarantine. Grid signs filtered discovery responses. Policy-controlled
scheduling creates deterministic all-or-nothing encrypted reservations subject
to capability, capacity, concurrency, owner/domain, security, expiry, and lease
constraints.

The current mechanism does not execute remote workloads, measure remote
resources, authenticate remote results, or solve global Sybil resistance.

## 11. Production-unreachable repository effect

AXIOM-MESH has begun extending intent beyond registry-fixed executor inputs
without allowing model prose or arbitrary caller JSON to become execution
authority. The first concrete target is deliberately narrow: documentation-only
repository remediation.

### 11.1 Signed read-only planning

A repository planner can construct a signed plan against an exact source
repository, base SHA, bounded documentation paths, exact replacement content,
and lifetime. The planning step is read-only and does not grant write authority.

### 11.2 Resolver admission and non-circular promotion

The dynamic input path follows a non-circular ordering:

1. fresh execution eligibility identifies unresolved resolver-backed input;
2. the signed repository plan is verified against exact resolver ceilings;
3. content-addressed resolution/handoff evidence is signed;
4. strict resolver admission facts are re-derived from current registry,
   policy, capability, build, requester, scope, destination, and target gates;
5. independent implementation-conformance and security-authority reviews bind
   the exact candidate;
6. an exact-one-mapping addition can be packaged without being applied;
7. separate application observation can verify exact before/after registry
   bytes without becoming authority;
8. the resolved target is re-evaluated under ordinary policy, confirmation, and
   independent approval; and
9. the exact resolved input and authorization facts become a prepared-effect
   binding.

### 11.3 Atomic approval consumption and durable preparation

The preparation coordinator reads the exact approval over authenticated
Hypervisor -> Grid transport and atomically commits:

```text
approval.consumed
external.effect.prepared
```

Tests force concurrent contenders to use the same one-use approval. Only one
transaction can consume it and leave durable preparation evidence; the loser
cannot leave a second prepared effect.

### 11.4 Evidence-first external-effect outbox

The current source already implements the next boundary. The outbox verifies
the prepared effect and requires Grid-durable preparation **before operator
invocation**.

If the operator call is uncertain, if its response is malformed, or if its
signed receipt cannot be verified, the effect remains durably prepared rather
than being reported as completed. A valid signed operator receipt is required
before Grid may record `external.effect.completed`. If the final completion
commit itself fails, retry/recovery must use the same durable preparation and
operator identity rather than synthesizing a new success.

This ordering separates authorization durability from external I/O and makes
uncertain outcomes recoverable rather than invisible.

### 11.5 Credential-isolated GitHub docs operator

The built GitHub operator independently verifies the Grid-durable prepared
effect **before any GitHub request**. It is intentionally narrow:

- repository fixed to `Zoverions/AXIOM-MESH`;
- exact expected base SHA;
- exact planned documentation paths and contents only;
- deterministic effect branch;
- no arbitrary shell or generic repository-write function;
- creates or recovers an **open draft pull request**;
- stale-main fails before mutation;
- extra/unplanned path or wrong content/identity/branch fails closed;
- forged Grid proof fails before GitHub I/O;
- repeated execution reconciles idempotently;
- simulated post-write transport loss is recovered by exact remote readback;
- signed operator receipt binds the exact proposal outcome.

The operator contains no merge operation. Its output states
`merge_performed: false` and `base_branch_content_changed: false`.

This proves a bounded evidence-first proposal mechanism. It does not authorize
autonomous repository administration.

### 11.6 Why the entire chain remains production-unreachable

Despite the working draft-PR prototype:

- `mesh/config/intent-remediation-executors.json` contains zero mappings;
- production policy has no `repository.docs.pull-request.create` action;
- no supported public/runtime route invokes the resolver/executor/operator
  chain;
- repository-operator credentials/egress are not part of the supported
  production deployment; and
- direct-main mutation and merge authority do not exist.

A first production mapping would therefore be a new activation and promotion
event requiring explicit capability/policy/registry/runtime changes, operator
credential/egress custody, rollback, negative-path evidence, independent review,
and protected-CI proof.

## 12. Agent Runtime Adapter v1

External agent frameworks evolve quickly. AXIOM-MESH therefore does not make
one framework its authority model; it defines a replaceable-runtime contract.

Agent Runtime Adapter v1 is byte-pinned and specifies:

- trust bootstrap;
- signed AXIOM grants;
- capability translation;
- credential references rather than raw-secret transfer;
- one-use authorization;
- cancellation/revocation;
- idempotency;
- bounded fallback;
- uncertain-outcome handling;
- signed receipts;
- lifecycle/rollback; and
- failure behavior preserving AXIOM as final authority.

A 28-case synthetic reference drill exercises positive/adversarial cases and
emits commit-bound evidence.

> A runtime may plan or coordinate work, but installation, runtime approval, or a tool allowlist cannot create an alternate authority path around Gateway -> Hypervisor -> Sandbox -> Grid.

The reference adapter opens no external runtime connection, resolves no real
runtime credential, reads no user file, performs no external effect, and does
not certify OpenClaw, Hermes, Agent Zero, MCP, A2A, or any maintained third-
party runtime.

A future integration must pin one exact upstream runtime and separately review
source, licence, dependencies, update behavior, host/sandbox behavior,
credential exposure, adapter implementation, and native authorization/
cancellation/idempotency/receipt parity.

## 13. Operations and production evidence

The production candidate includes:

- exact source runtime/npm/dependency policy;
- non-root, read-only, capability-dropped container policy;
- explicit external secrets and fail-closed provisioning;
- bounded bodies, rate limits, concurrency, logs, metrics, and queues;
- dependency-aware liveness/readiness;
- signed recovery, backup-retention, restore, SLO, resilience, transport,
  service-unit, scheduling, causal-sync, telemetry, credential/data-key
  rotation, provider, continuity-anchor, incident, pilot-verifier,
  security-review-verifier, and runtime-adapter evidence; and
- hosted Windows verification for source/documentation/path and timing-sensitive
  behavior.

Protected synthetic evidence proves mechanisms and rejection paths. It does
not create a live pilot, external custody, 30-day availability record, real
operator acknowledgement trail, independent audit, external-runtime
certification, production repository activation, or production promotion.

## 14. Human product family

### 14.1 AXIOM One

AXIOM One is the planned private personal agent, vault, approval centre, and
evidence record. Its concepts are Ask, Plan, Approvals, Vault, Receipts, Share,
and Circles.

The experimental loopback slice currently provides bounded reviewed intent,
owner-scoped private memory, three fixed directional provenance relations,
correction-without-replacement, confirmation-bound tombstoning, selective local
export, explicit bundle reveal, approval-state distinctions, same-idempotency-
key uncertainty recovery, raw evidence, and cross-principal negative tests.

It does not yet claim general consequential plan/execute, direct edge deletion,
hard deletion, restore, bulk ingestion, completed browser-session security,
human comprehension/accessibility/usability evidence, or supported packaging.

### 14.2 AXIOM Verify

AXIOM Verify is planned as a local/static verifier for signed receipts and
export packages. It should explain signer identity, integrity, continuity,
scope, package contents, alterations, and non-claims without requiring trust in
an AXIOM operator.

Machine receipts and repository-operator receipts are kernel primitives, not
the AXIOM Verify product.

### 14.3 AXIOM Circles

AXIOM Circles are planned invitation-based collaboration spaces for families,
teams, communities, researchers, creators, and organizations. Members should
retain independently owned nodes and records while shared objects, proposals,
tasks, commitments, approvals, and conflicts use selective disclosure and
approved causal exchange.

Circles do not imply public federation, autonomous payroll, or settlement.

### 14.4 AXIOM Studio and Managed Node

AXIOM Studio is intended to generate/test capsule manifests, schemas,
permissions, threat models, policy fixtures, adapter conformance evidence, and
rollback plans.

AXIOM Managed Node is intended to offer hosting, backup, updates, and support
without converting hosting into platform ownership or a general plaintext
inspection right.

## 15. Frontier incubation

Isolated laboratories may implement:

- BFT/distributed authority;
- replicated evidence and threshold authorization;
- tokens, treasury, staking, escrow, bridges, liquidity, settlement;
- bounded autonomous/research loops and task markets;
- education, health, government, finance, legal, employment, and other domain
  harnesses;
- embodied-system safety simulations;
- arbitrary-code isolation;
- named zk verifier adapters; and
- post-quantum migration.

Laboratory work remains separated from production identities, secrets, user
data, real value, and public authority unless its own promotion gates pass.

## 16. Current programme

### 16.1 Controlled pilot

Production promotion still requires authentic external evidence including:

- dedicated pilot hardware;
- 30-day availability/capacity observation;
- pilot-owned secret/provider/workload-identity and backup-media custody;
- scheduled restore/rotation under that custody;
- externally retained Grid continuity-anchor cadence/custody;
- operator-owned telemetry/alert routes and measured acknowledgement;
- disposition of all 32 deprecated-history credential candidates;
- named human incident exercise;
- exact-source/image/deployment independent security review; and
- authentic exact pilot package plus a separate promotion decision.

### 16.2 Human utility

The parallel product path is to finish AXIOM One browser/session,
accessibility/usability, packaging, deletion/recovery, and broader consequential
approval boundaries; add one bounded AI provider and useful personal workflows;
then build selective sharing, Verify, Circles, Studio, and Managed Node behind
their own gates.

### 16.3 Machine/runtime progression

Machine-principal authorization, discovery, receipts, Agent Runtime Adapter v1,
and the repository draft-PR safety prototype now exist. Near-term work is to:

1. keep repository-effect production reachability closed while activation,
   operator custody/egress, rollback, and promotion analysis are completed;
2. select one maintained external runtime for a bounded read-only integration;
3. prove native authorization, cancellation, idempotency, receipt, fallback,
   uncertainty, and direct-service-denial parity; and
4. defer MCP/A2A, remote tasks, remote execution, and delegation to their own
   gates.

Protocol compatibility must never create authority.

## 17. Threat model summary

The current kernel addresses forged/replayed requests, wrong audiences, expired
grants, sponsor/authority substitution, action/purpose/destination escalation,
policy weakening, approval reuse, payload/evidence tamper, wrong keys, partial
provisioning, dependency loss, secret leakage, native-state overwrite, causal
replay/equivocation, queue ambiguity, and approval bypass.

The repository-effect prototype additionally defends against free-form input
becoming executor authority, stale base substitution, unplanned path/content
mutation, resolver constraint widening, stale registry/policy/build laundering,
approval race/replay, external I/O before durable preparation, forged prepared
proof, ambiguous operator outcomes, unverified receipts, duplicate execution,
and silent merge/direct-main behavior.

Agent Runtime Adapter v1 addresses capability/grant translation widening,
raw-secret transfer, synthetic receipt success, cancellation/revocation loss,
uncertain outcomes, and alternate runtime authority paths at the contract level.

Residual risks include compromised host/container engines, operator or signing-
key theft, cryptographic defects, denial of service beyond declared ceilings,
single-node authority compromise, continuity-anchor custody failure, browser
vulnerabilities, provider/runtime supply-chain compromise, governance capture,
economic exploits, and domain-specific legal/safety failures.

Each newly exposed surface reopens the relevant threat model and release gate.

## Non-claims

`0.12.0-dev.3` does **not** claim:

- a live public/customer/testnet/mainnet/production service;
- a completed authentic pilot or independent security approval;
- supported AXIOM One, Verify, Circles, Studio, or Managed Node releases;
- production AI, messaging, identity, storage-transfer, payment, repository, or
  regulated-domain adapters;
- production conformance/certification for OpenClaw, Hermes, Agent Zero, MCP,
  A2A, or another external runtime;
- a production resolver mapping or supported public repository-effect route;
- direct-main repository mutation or merge authority from the built docs
  operator;
- remote workload dispatch or authenticated remote-result provenance;
- federation, BFT consensus, replicated Grid finality, or global Sybil
  resistance;
- arbitrary-code sandbox security;
- operational zk verification without a named verifier adapter;
- operational token/staking/bridge/liquidity/treasury/payroll/settlement;
- clinical, educational, governmental, legal, employment, or financial
  compliance;
- secure embodied autonomy;
- end-to-end post-quantum security;
- proof that a model's reasoning/output is true;
- proof that a Grid-attested machine/operator receipt establishes arbitrary
  external-world truth;
- proof that local Grid state alone detects a consistently truncated suffix
  after matching local metadata rewrite; or
- continuity assurance for events after the newest externally retained anchor.

Historical and laboratory code may describe broader systems. Presence in source
is not promotion evidence.

## Reproducibility

Use an allowed Node.js 24 runtime. From repository root:

```bash
npm run setup
npm run runtime-adapter:contract
npm run runtime-adapter:drill
npm run release:verify
```

`npm run setup` validates the exact Node/npm source policy, installs both
zero-dependency locks with lifecycle scripts disabled, proves the locks
unchanged, and runs clean-kernel/release gates. It does not provision production
credentials.

The runtime-adapter commands verify the byte-pinned candidate contract and its
28-case synthetic reference. They do not load or certify an external runtime.

Current authorities/supporting documents:

- [capability registry](../../mesh/config/capabilities.json);
- [product definition](../rebuild/PRODUCT-DEFINITION.md);
- [normative requirements](../rebuild/REQUIREMENTS.md);
- [source traceability](../rebuild/SOURCE-TRACEABILITY.md);
- [project status](../PROJECT-STATUS-2026.md);
- [roadmap](../ROADMAP.md);
- [execution queue](../MASTER-TODO.md);
- [production readiness tracker](../PRODUCTION-READINESS-TRACKER.md);
- [current threat model](../security/CURRENT-BUILD-THREAT-MODEL.md);
- [runtime-adapter conformance](../architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md);
- [production runbook](../../mesh/PRODUCTION.md);
- [pilot dossier](../operations/PILOT-DEPLOYMENT-DOSSIER.md); and
- [independent review](../security/INDEPENDENT-SECURITY-REVIEW.md).

## Conclusion

AXIOM-MESH is developing into a sovereign coordination substrate rather than a
monolithic agent application. Its kernel minimizes and records authority; its
machine-principal surface makes non-human callers explicit and finite; its
human-product layer aims to make the same controls understandable; its
repository prototype demonstrates how an external effect can be prepared,
executed, recovered, and evidenced without silently granting merge authority;
and its runtime-adapter work shows how intelligence can remain replaceable
without becoming sovereign over the substrate.

The intended outcome is not maximum feature count. It is a system that can
become more capable while preserving user ownership, explicit consent,
least-privilege execution, replaceable intelligence, recoverability, and
evidence whose claims remain as narrow and verifiable as the mechanisms that
produce it.