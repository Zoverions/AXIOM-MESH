# AXIOM-MESH Technical White Paper

**Version:** `0.12.0-dev.3`

**Updated:** 2026-07-30

**Status:** implementation-grounded architecture and product-development paper

**Deployment status:** production candidate; no live production claim

## Abstract

AXIOM-MESH is a local-first capability network that converts an authenticated
human or agent intent into an explicit policy-authorized plan, executes only
approved effects inside a bounded runtime, and records portable cryptographic
evidence. Its purpose is not merely to run agents. Its purpose is to make
authority, consent, execution, data custody, recovery, and claims inspectable.

The supported kernel separates public ingress, policy and planning, execution,
and durable evidence into four services: Gateway, Hypervisor, Sandbox, and
Grid. The current `0.12.0-dev.3` build implements a single-node authority and
transparency system with deny-dominant policy, independent approval for
permitted high-risk effects, encrypted durable state, signed hash-linked
evidence, scoped portability, recovery, service isolation, admitted-node
reservations, operator-approved causal exchange, and deployment-independent
secret and policy provider startup.

Development now proceeds through three coordinated tracks:

1. **Trust and operations** — collect authentic deployment, recovery, custody,
   incident, and independent-review evidence for one controlled pilot.
2. **Human utility and network activation** — build AXIOM One, AXIOM Verify,
   AXIOM Circles, AXIOM Studio, and managed-node tooling without moving user
   applications into the trusted kernel.
3. **Frontier incubation** — develop distributed authority, settlement,
   autonomy, regulated-domain, arbitrary-code, embodied-system, and
   post-quantum foundations in isolated, disabled-by-default laboratories.

This roadmap does not promote unfinished capabilities. AXIOM-MESH distinguishes
code that is built from capabilities that are enabled, exposed,
production-promoted, or marketed. The machine-readable capability registry
remains authoritative for runnable claims.

## 1. Problem and motivation

Agent systems commonly combine prompts, models, tools, credentials, storage,
network access, and external effects in one application process. When these
concerns are fused, it becomes difficult to answer:

- who requested an effect;
- which policy and consent authorized it;
- which plan, provider, tool, destination, and data scope were approved;
- whether authority was reused, widened, or silently delegated;
- what durable state changed;
- whether a denial, degraded state, or unresolved conflict was hidden;
- how the user can inspect, revoke, export, delete, restore, or dispute the
  result;
- which claims are established by evidence and which remain aspirations.

AXIOM-MESH treats these questions as the product boundary. Intelligence is not
authority. A model output is data until an authenticated principal, compatible
policy, valid consent, explicit plan, scoped grant, bounded execution path, and
durable evidence agree.

The project therefore rejects two common shortcuts. First, a friendly interface
must not conceal consequential authority. Second, experimental code must not be
described as production merely because it exists or passes synthetic tests.

## 2. Governing development posture

### 2.1 Build broadly, expose narrowly

AXIOM-MESH separates five lifecycle states:

1. **Built** — code and tests exist in an isolated development path.
2. **Enabled** — an operator deliberately activates it under an explicit policy
   and credential boundary.
3. **Exposed** — a user, node, or external system can reach it.
4. **Production-promoted** — the exact build and deployment pass applicable
   security, recovery, governance, legal, usability, and operational gates.
5. **Marketed** — public claims accurately describe only the promoted scope.

The doctrine is:

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**

A frontier implementation may be technically substantial while remaining
disabled, isolated from production identities and data, and absent from public
product claims.

### 2.2 Claims follow executable evidence

The [capability registry](../../mesh/config/capabilities.json) classifies each
capability as `implemented`, `experimental`, `specified`, `adapter_required`,
or `disabled`. Only `implemented` is a current runnable claim. Documentation,
demos, mock providers, synthetic pilot packages, and research branches cannot
promote a capability beyond that registry.

### 2.3 Human clarity is a security property

A user interface may simplify terminology, but it may not hide:

- what will happen;
- what data will leave the node;
- which provider or destination will receive it;
- what the cost, retention, timeout, and cancellation rules are;
- which approval is required;
- whether the system is degraded or uncertain;
- whether evidence proves integrity rather than truth;
- whether an action can be reversed.

Accessibility, phone usability, export, deletion, revocation, and plain-language
receipts are therefore release requirements for human-facing products, not
optional visual polish.

## 3. System architecture

### 3.1 Four trusted responsibilities

| Service | Responsibility | Authority it does not have |
|---|---|---|
| Gateway | Authenticates principals, validates requests, applies abuse controls, handles idempotency, and exposes versioned user/operator APIs | Cannot invent execution authority |
| Hypervisor | Normalizes intent, composes deny-dominant policy, builds explicit plans, checks approvals, and issues short-lived grants | Cannot execute arbitrary effects or bypass Grid evidence |
| Sandbox | Verifies one grant and invokes only its named bounded tool or adapter action | Has no ambient network, shell, package, host, secret, or filesystem authority |
| Grid | Owns encrypted durable state, evidence, consent, governance, accounting, portability, recovery, node admissions, and conflict records | Cannot originate user intent or silently authorize effects |

Every privileged or externally visible effect follows:

```text
principal
   |
   v
Gateway -> Hypervisor -> Sandbox -> Grid
   |           |            |         |
 auth      plan/policy     grant     state+evidence
```

No browser application, model provider, channel adapter, remote dispatcher,
settlement process, autonomous loop, administrator, or domain capsule may
bypass this path.

### 3.2 Current deployment boundary

The compact candidate runs the four services as separate supervised Node.js
processes in one hardened container. The alternate single-host topology runs
four independently restartable containers across four exact internal network
segments. Only Gateway crosses the permission-restricted host ingress.
Internal service edges use mutually authenticated TLS 1.3, distinct Ed25519
identities, DNS and SPIFFE-style URI identities, active-certificate pinning,
and signed replay-protected request envelopes. A machine-readable default-deny
policy authorizes only 38 exact current-build caller, destination, method, and
route combinations before request signing and again at the receiving service,
while deriving each destination's active mTLS peers. Segmentation removes
unrelated adjacency; transport and application checks impose direction.

Grid alone receives the durable database and data-protection key. Gateway alone
receives the API principal registry. Protected evidence proves Sandbox-only
loss, dependency-aware readiness degradation, Sandbox-only recovery, unchanged
survivors, and preserved Grid state. This is single-host isolation, not
replicated state or automatic failover.

The operating system, container engine, host administrator, mounted secret
paths, and data-protection key remain trusted. The candidate is not a defense
against a fully compromised host.

### 3.3 Product layer outside the kernel

Human-facing applications are intentionally outside `mesh/`. The current
client boundary and planned application structure are:

```text
mesh/                    zero-dependency trusted kernel
apps/axiom-one/          experimental loopback-only browser/PWA foundation
apps/axiom-verify/       static or local evidence verification
packages/axiom-client/   implemented versioned Gateway client contract
adapters/                separately governed provider/channel/domain adapters
capsules/                signed capability packages and fixtures
```

A user application receives only the API scopes, session lifetime, origin, and
resources required for its current function. It receives no ambient Grid,
filesystem, secret, provider, or host authority.

## 4. Intent-to-evidence lifecycle

1. **Authenticate.** Gateway resolves the caller and scopes.
2. **Validate.** Schema, size, action, origin, and idempotency are checked.
3. **Normalize.** Hypervisor creates a canonical intent.
4. **Evaluate policy and consent.** Any denial wins; lower layers can tighten
   but cannot loosen authority.
5. **Build a plan.** The plan names effects, dependencies, providers, data
   scopes, destinations, budgets, timeouts, cancellation behavior, and evidence
   obligations.
6. **Approve.** Permitted high-risk effects require a different authenticated
   principal and an exact expiring approval.
7. **Issue a grant.** Hypervisor signs a short-lived, audience-, intent-, plan-,
   policy-, tool-, resource-, and constraint-bound single-use grant.
8. **Execute.** Sandbox invokes only the named deterministic tool or approved
   adapter contract.
9. **Commit.** Grid transactionally records the mutation and evidence.
10. **Explain.** Gateway returns a structured result suitable for a human
    receipt without exposing secret values or private model chain-of-thought.

A failure at any stage produces no synthetic success for later stages.

## 5. Identity, authorization, and replay defense

Production service identities use Ed25519 keys provisioned outside the
repository. Signed requests bind issuer, audience, validity window, nonce,
method, route context, and body digest. Verification rejects unknown issuers,
wrong audiences, stale requests, altered bodies, invalid signatures, and replay.

Internal TLS uses a locally provisioned Ed25519 CA and distinct leaves. Offline
rotation validates a complete replacement generation before an atomic swap and
preserves the previous generation for exact rollback. Active-leaf pinning
rejects retired but still CA-valid credentials without introducing an online
revocation dependency.

The candidate separately supports coordinated service/API credential rotation
and data-protection-key re-encryption. Grid evidence follows dual-signed key
transitions rather than silently trusting replacement keys. Data-key rotation
rewraps the live Grid and supported recovery contexts, rejects wrong keys,
recovers interrupted cutover, and preserves later evidence through rollback.

A secret-free keyed ledger covers 32 conservative credential candidates from
deprecated history and makes reuse in the supported tip a protected-CI failure.
Repository trust revocation is complete; external provider or prior-deployment
attestations remain open promotion evidence.

## 6. Policy, approval, consent, and governance

Policy composition is deny-dominant:

- any denial wins;
- highest risk wins;
- required scopes accumulate;
- required confirmations cannot decrease;
- numerical and categorical constraints can only narrow authority.

Consent receipts bind subject, controller, purpose, data scope, expiry, and
revocation. Installing a capsule, discovering a node, or connecting a provider
does not grant execution authority.

Local governance supports proposals, human voting, finalization, timelocked
activation, independently approved authority-reducing overlays, verification,
rollback metadata, expiring emergency controls, retrospective review, and
appeal records. Automated systems may tighten or pause authority; they may not
expand their own authority.

Portable delegation remains an unpromoted product and protocol track.

## 7. Execution and adapter boundary

The supported Sandbox is not a general-purpose code runner. It executes a
small registry of validated deterministic built-in tools. Arbitrary code,
rootless OCI execution, AI providers, messaging, content transfer, settlement,
zk verification, and regulated-domain workflows require separately named
adapters and evidence.

Every adapter must define:

- exact credentials and trust anchors;
- allowed origins and egress;
- input/output schemas;
- purpose and data scope;
- budget, timeout, cancellation, and retry;
- retention and deletion;
- idempotency and replay behavior;
- audit and evidence output;
- failure, uninstall, and rollback behavior;
- independent test environment and threat model.

A missing or invalid provider returns `capability_unavailable`; it never
returns mock success on a production path.

## 8. Grid, evidence, privacy, and durability

Grid stores authenticated-encrypted state and a signed SHA-256 hash-linked
evidence sequence. Startup verifies continuity and fails closed on unresolved
signatures, broken transitions, migration drift, or integrity failure.

Implemented Grid-owned families include principals, consent receipts, capsule
manifests, encrypted memory objects and edges, governance records, admitted
nodes, deterministic encrypted placement leases, storage offers, balanced
local accounting, import/export records, causal updates, conflicts, approvals,
and recovery evidence.

Memory is content-addressed, owner-bound, encrypted, selectively disclosable,
exportable, and tombstonable. Operational telemetry excludes user-controlled
labels and raw user content.

Local accounting uses balanced double-entry journals with safe integer units.
It does not itself authorize tokens, payroll, bridges, liquidity, or external
settlement.

Grid remains a single-node transparency log, not BFT consensus.

## 9. Portability, synchronization, and network foundations

### 9.1 Export and import

Canonical JSONL exports can be scoped by time, record family, owned object, and
capsule. Signed manifests and continuity metadata support independent
verification. Optional X25519 recipient encryption protects selected records
in transit or storage.

Imports are cryptographically verified and staged. The operator receives a
deterministic diff. Independent approval is required before data enters an
isolated foreign-provenance store. Imported records cannot overwrite native
signed state or impersonate local evidence.

### 9.2 Causal exchange

Admitted nodes can produce signed bundles with version vectors. Replay,
equivocation, missing dependencies, noncontiguous counters, and incomplete
conflict resolution are rejected. Concurrent heads remain visible until an
explicit resolution causally dominates and names every current head.

The online relay binds exact Gateway origins, pinned source Grid evidence, one
matching owner, encrypted ordered queues, bounded retry, duplicate preflight,
and independent one-use destination approval. Protected tests use two real
supervisors and controlled partitions. This proves transport and conflict
semantics, not federation or consensus.

### 9.3 Discovery and scheduling

Signed node admissions bind identity, owner, HTTPS origin, failure domain,
roles, software digest, security profile, resource ceilings, expiry, and
quarantine. Grid signs filtered discovery responses. Policy-controlled
scheduling creates deterministic all-or-nothing encrypted reservations subject
to capability, capacity, concurrency, owner, domain, security, and lease
constraints.

The current mechanism does not contact remote nodes, measure resources,
authorize workloads, authenticate remote results, or solve global Sybil
resistance. Remote dispatch and result provenance are planned multi-host gates.

## 10. Operations and production evidence

The production candidate includes:

- exact Node.js/npm source-setup policy and zero third-party npm packages;
- non-root, read-only, capability-dropped container policy;
- explicit secrets and fail-closed provisioning;
- bounded request bodies, rate limiting, logs, metrics, and queues;
- dependency-aware liveness and readiness;
- signed recovery, backup-retention, restore, SLO, resilience, transport,
  service-unit, scheduling, causal-sync, telemetry, credential-rotation,
  data-key-rotation, provider, pilot-verifier, security-review-verifier, and
  incident-tabletop evidence;
- a strict offline pilot evidence package and independent-review findings
  intake.

Protected synthetic evidence verifies mechanisms and rejection paths. It does
not create a live pilot, external custody, a 30-day availability record, an
independent audit, or production promotion.

## 11. Human product family

### 11.1 AXIOM One

AXIOM One is the planned private personal agent, vault, approval centre, and
evidence record. Its primary concepts are Ask, Plan, Approvals, Vault,
Receipts, Share, and Circles. A new user should be able to reach a useful result
without understanding service topology or using the CLI.

The first preview must support visible plans, explicit provider/data
boundaries, approval and denial, memory inspection, export, deletion,
revocation, recovery guidance, phone-size layouts, keyboard navigation,
screen-reader support, contrast, reduced motion, and plain-language receipts.

The current experimental slice implements an exact human-explanation contract
for five bounded actions: non-consequential echo, owner-scoped private memory
creation, fixed directional provenance linking, confirmation-bound
tombstoning, and selective local memory export. It provides reversible review,
maps every stable Gateway outcome and current kernel event kind, distinguishes
active, expired, consumed, and unknown
approvals, keeps raw evidence, and recovers uncertain browser outcomes with the
same idempotency key. The Vault fetches a generated bundle only after a separate
reveal action, stores neither token nor response in browser storage, and has
real-stack negative evidence against cross-principal read, link, export, and
tombstone. Provenance is restricted to `derived-from`, `supports`, and
`corrects`; a correction retains both records and does not silently replace its
target. The preview has no direct edge-deletion control. It does not mislabel
this projection as an authoritative pre-execution kernel plan. Hard deletion,
restore, bulk ingestion, general
consequential plan/execute, and human-comprehension evidence remain required.

### 11.2 AXIOM Verify

AXIOM Verify is a local or static verifier for signed receipts and export
packages. It must explain signer identity, integrity, continuity, package
contents, alterations, and non-claims without requiring trust in an AXIOM
operator.

### 11.3 AXIOM Circles

AXIOM Circles are invitation-based collaboration spaces for families, teams,
community groups, researchers, creators, and organizations. Members retain
independently owned nodes and records. Shared objects, proposals, tasks,
commitments, approvals, and conflicts use selective disclosure and approved
causal exchange.

Circles do not imply public federation, autonomous payroll, or settlement.

### 11.4 AXIOM Studio and Managed Node

AXIOM Studio will generate and test capsule manifests, schemas, permissions,
threat models, policy fixtures, rollback plans, and conformance evidence.

AXIOM Managed Node will provide optional hosting, backup, updates, and support
without transferring ownership of user information or creating a platform
right to inspect plaintext content.

## 12. Frontier incubation

Frontier laboratories may implement:

- BFT and distributed-authority protocols;
- replicated evidence, threshold authorization, and Sybil-resistant membership;
- tokens, treasury, staking, bonds, escrow, bridges, liquidity, and settlement;
- bounded autonomous agents, research loops, and task markets;
- education, health, government, finance, legal, and employment harnesses;
- embodied-system simulation and safety envelopes;
- arbitrary-code isolation;
- named zk verifier adapters;
- post-quantum migration.

These laboratories must use synthetic or separately consented test data,
non-production identities, no real user funds, no public authority, explicit
kill switches, reproducible experiments, adversarial tests, and documented
failure. They remain disabled and unmarketed until their individual promotion
gates pass.

## 13. Current programme and promotion sequence

The current programme has two immediate priorities:

1. collect authentic single-node pilot evidence, including external custody,
   scheduled media recovery, pilot telemetry, named incident response, legacy
   credential dispositions, and an independent security review;
2. maintain the implemented Gateway client contract and complete the
   experimental AXIOM One human-shell gates, followed by one bounded AI
   adapter, AXIOM Verify, and invitation-based Circles.

Multi-host remote dispatch, independently operated WAN evidence, broader
adapters, credentials, zk verification, managed nodes, and a curated capsule
catalogue follow behind their own gates. Frontier work proceeds in parallel but
does not alter the current production decision.

## 14. Threat model summary

The current kernel addresses forged and replayed requests, wrong audiences,
expired grants, policy weakening, approval reuse, payload and evidence
tampering, wrong keys, partial provisioning, dependency loss, secret leakage,
native-state overwrite, causal replay, equivocation, queue ambiguity, and
approval bypass.

Residual risks include compromised hosts or container engines, operator
credential theft, unreviewed cryptographic defects, denial of service beyond
declared ceilings, single-node authority compromise, operational custody
mistakes, browser/session vulnerabilities in future applications, provider
misbehavior, adapter supply-chain compromise, governance capture, economic
exploits, and domain-specific legal or safety failures.

Each newly exposed surface reopens the relevant threat model and release gate.

## Non-claims

The `0.12.0-dev.3` build does not claim:

- a live public, customer, testnet, mainnet, or production service;
- a completed authentic single-node pilot or independent security approval;
- a supported AXIOM One, Verify, Circles, Studio, or Managed Node release;
- production AI, messaging, identity, storage-transfer, payment, or domain
  adapters;
- remote workload dispatch or authenticated remote-result provenance;
- federation, BFT consensus, replicated Grid finality, or Sybil resistance;
- arbitrary-code sandbox security;
- operational zk verification without a named verifier adapter;
- token, staking, bridge, liquidity, treasury, payroll, or chain settlement;
- clinical, educational, governmental, legal, employment, or financial
  compliance;
- secure embodied autonomy;
- end-to-end post-quantum security;
- proof that a model's reasoning or output is true.

Historical and laboratory code may describe these systems. Presence in the
repository is not promotion evidence.

## Reproducibility

Use an allowed Node.js 24 runtime. From the repository root:

```bash
npm run setup
```

The command validates the Node.js/npm policy and CI/container pins, installs
both exact zero-dependency locks with lifecycle scripts disabled, proves the
locks unchanged, and runs the clean-kernel and release gates. It does not
provision production credentials.

Current authorities and supporting documents are:

- [capability registry](../../mesh/config/capabilities.json);
- [product definition](../rebuild/PRODUCT-DEFINITION.md);
- [normative requirements](../rebuild/REQUIREMENTS.md);
- [project status](../PROJECT-STATUS-2026.md);
- [roadmap](../ROADMAP.md);
- [execution queue](../MASTER-TODO.md);
- [production readiness tracker](../PRODUCTION-READINESS-TRACKER.md);
- [production runbook](../../mesh/PRODUCTION.md);
- [pilot evidence runbook](../operations/PILOT-DEPLOYMENT-DOSSIER.md);
- [independent review runbook](../security/INDEPENDENT-SECURITY-REVIEW.md).

## Conclusion

AXIOM-MESH is no longer only a kernel-reconstruction project. It is a
kernel-governed product and network programme. The current build supplies the
authority-minimizing substrate; the next human layer must make that substrate
useful without hiding its controls; and frontier development may proceed
aggressively only while isolation, evidence, and claims remain exact.

The intended outcome is not maximum feature count. It is a system people can
depend on because useful intelligence, personal data, collective coordination,
economic mechanisms, and future autonomous capabilities remain subordinate to
explicit human authority and verifiable boundaries.
