# AXIOM-MESH Technical White Paper

**Version:** `0.12.0-dev.3`

**Updated:** 2026-08-12

**Status:** implementation-grounded architecture and product-development paper

**Deployment status:** production candidate; no live production claim

## Abstract

AXIOM-MESH is a local-first coordination, authority, and evidence substrate. It
accepts authenticated human or machine intent, evaluates that intent against
explicit deny-dominant policy and consent/approval requirements, constructs a
bounded execution plan, performs only authorized effects through a constrained
runtime path, and records cryptographically linked evidence.

Its purpose is not merely to run agents. Its purpose is to make authority,
consent, execution, data custody, recovery, and claims inspectable while
allowing useful human applications, machine principals, replaceable runtimes,
domain systems, and eventually multi-node governance to sit above the same
fail-closed substrate.

The supported kernel separates public ingress, policy/planning, execution, and
durable evidence into four responsibilities: Gateway, Hypervisor, Sandbox, and
Grid. The current build implements a single-node authority and transparency
system with constrained human-sponsored machine principals, policy-filtered
machine discovery, Grid-attested terminal receipts, encrypted durable state,
signed hash-linked evidence, external continuity anchors, scoped portability,
recovery, service isolation, admitted-node reservations, operator-approved
causal exchange, and deployment-independent secret/policy provider startup.

The same source line also contains two substantial future-integration
boundaries that remain deliberately production-unreachable: a signed dynamic
repository-plan resolver/preparation chain and a byte-pinned Agent Runtime
Adapter v1 contract with synthetic conformance evidence. Their presence reduces
future integration risk; it does not promote repository mutation or any
external agent runtime.

The central design rule is:

> **Intelligence is not authority. Connectivity is not authority. Installation is not authority. Evidence must state exactly what it proves.**

## 1. Problem and motivation

Modern agent and automation systems commonly fuse prompts, models, tools,
credentials, storage, network access, external APIs, side effects, and logs into
one application process. That makes several questions difficult to answer with
precision:

- who requested an effect;
- which identity, sponsor, policy, consent, and approval authorized it;
- which plan, tool, provider, destination, data scope, and budget were bound;
- whether authority was reused, widened, delegated, or substituted;
- whether the runtime actually executed the reviewed input;
- what durable state changed;
- whether an acknowledged effect has corresponding evidence;
- whether a denial, degraded state, replay, conflict, or uncertain outcome was
  hidden;
- how a user can inspect, revoke, export, delete, restore, dispute, or migrate
  the result;
- whether evidence proves integrity, provenance, an internal claim, or an
  external-world fact;
- which capabilities are actually runnable and which exist only as research or
  future-compatible scaffolding.

AXIOM-MESH treats these questions as the product boundary. A model output is
data until an authenticated principal, valid authority profile, compatible
policy, explicit plan, scoped grant, bounded execution path, and durable
evidence agree.

This posture rejects two common shortcuts. A friendly interface may simplify
terminology, but it may not hide consequential authority. And source presence or
a green synthetic test may not be described as production simply because code
exists.

## 2. Governing development posture

### 2.1 Five lifecycle states

AXIOM-MESH distinguishes:

1. **Built** — code and tests exist.
2. **Enabled** — an operator deliberately activates it under explicit policy and
   credential boundaries.
3. **Exposed** — a user, node, runtime, or external system can reach it.
4. **Production-promoted** — the exact build and deployment pass applicable
   security, recovery, governance, legal, usability, and operational gates.
5. **Marketed** — public claims describe only that promoted scope.

These states are intentionally separate. A substantial implementation may
remain built but unreachable for months while the project proves its activation
path and external evidence.

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**

### 2.2 Claims follow executable evidence

The machine-readable capability registry classifies each tracked capability as
`implemented`, `experimental`, `specified`, `adapter_required`, or `disabled`.
The current registry tracks 49 capabilities, including 31 marked implemented.
Only registry-backed `implemented` status is a current runnable capability
claim.

This is intentionally stricter than “code exists.” The repository currently
contains resolver and runtime-adapter primitives that are tested, reviewed, and
useful, but are not production-reachable and therefore do not become new
capability claims.

### 2.3 Human clarity is a security property

A human-facing application may use ordinary language, but it must preserve the
ability to answer:

- what will happen;
- which principal is acting;
- what data will leave the node;
- which destination/provider will receive it;
- which purpose, cost, retention, timeout, cancellation, and retry rules apply;
- whether confirmation or another person's approval is required;
- whether the system is degraded or uncertain;
- which evidence exists and what it does not prove;
- whether the action can be reversed.

Phone usability, keyboard and screen-reader support, contrast, reduced motion,
plain-language receipts, export, deletion, revocation, and recovery are release
gates for human-facing products rather than optional polish.

## 3. System architecture

### 3.1 Four trusted responsibilities

| Service | Responsibility | Authority it does not have |
|---|---|---|
| Gateway | Authenticates principals, validates requests, applies abuse/idempotency controls, and exposes versioned user/operator APIs | Cannot invent execution authority |
| Hypervisor | Normalizes intent, composes deny-dominant policy, revalidates machine authority, builds explicit plans, checks approvals, and issues short-lived grants | Cannot bypass Grid evidence or silently widen authority |
| Sandbox | Verifies one grant and invokes only its named bounded operation or approved adapter contract | Has no ambient supported shell, package, host, secret, arbitrary-code, or open-network authority |
| Grid | Owns encrypted durable state, evidence, approvals, consent, governance, accounting, portability, recovery, node records, and conflict state | Cannot originate user intent or silently authorize effects |

The supported privileged path is:

```text
principal
   |
   v
Gateway -> Hypervisor -> Sandbox -> Grid
   |           |            |         |
 auth      plan/policy     grant     state+evidence
```

Browser applications, model providers, machine runtimes, channel adapters,
repository operators, remote dispatchers, settlement processes, autonomous
loops, administrators, and domain capsules may not create a parallel authority
path.

### 3.2 Current deployment boundary

The compact candidate runs the four services as separate supervised Node.js
processes in one hardened container. The alternate single-host topology runs
four independently restartable containers across four exact internal network
segments. Only Gateway crosses the permission-restricted host ingress.

Internal service edges use mutually authenticated TLS 1.3, distinct Ed25519
identities, DNS and SPIFFE-style URI identities, active-certificate pinning,
and signed replay-protected request envelopes. A machine-readable default-deny
policy authorizes only 40 exact current-build caller, destination, method, and
route combinations before request signing and again at the receiving service,
while deriving each destination's active mTLS peers.

Grid alone receives the durable database and data-protection key. Gateway alone
receives the API principal registry. Protected evidence proves dependency-aware
readiness degradation, Sandbox-only loss and recovery, unchanged surviving
units, and preserved Grid state.

This is single-host service isolation, not replicated state or automatic
failover. The host operating system, container engine, mounted secret paths,
process owner, host administrator, monotonic-enough wall clock, and data-
protection key remain within the trusted computing base.

### 3.3 Product and runtime layers remain outside the kernel

Human applications and replaceable runtimes are intentionally outside `mesh/`.
The relevant boundary is:

```text
mesh/                    trusted zero-dependency kernel
apps/axiom-one/          experimental loopback-only human shell
packages/axiom-client/   versioned Gateway client contract
adapters/                separately governed external adapters
capsules/                signed capability packages/fixtures
external runtimes        replaceable clients behind Agent Runtime Adapter v1
```

A client or runtime receives only the Gateway scopes, session lifetime,
resource limits, destinations, and data required for its current function. It
receives no ambient Grid, Hypervisor, Sandbox, filesystem, provider-secret, or
host authority.

## 4. Intent-to-evidence lifecycle

The supported production path is conceptually:

1. **Authenticate.** Gateway resolves the principal and exact authority profile.
2. **Validate.** Schema, action, size, origin, rate, concurrency, and
   idempotency rules are applied.
3. **Normalize.** Hypervisor creates a canonical intent and authority binding.
4. **Evaluate policy and consent.** Any denial wins; lower layers can tighten
   but not loosen authority.
5. **Resolve destination and constraints.** Current built-in effect destination
   is derived from the selected tool and must remain within machine and policy
   ceilings.
6. **Build a plan.** Effects, dependencies, data scope, destination, budget,
   timeout, cancellation behavior, and evidence obligations are explicit.
7. **Approve.** Permitted high-risk effects require an exact expiring approval
   from an independent authenticated principal.
8. **Issue a grant.** Hypervisor signs an audience-, intent-, plan-, policy-,
   tool-, resource-, authority-, and constraint-bound single-use grant.
9. **Execute.** Sandbox invokes only the named bounded operation or reviewed
   adapter contract.
10. **Commit.** Grid transactionally records mutation and evidence.
11. **Explain/attest.** Gateway can return a human-readable result; constrained
   machine owners can retrieve a Grid-attested digest-only terminal receipt.

A failure at any stage cannot be converted into synthetic downstream success.

## 5. Machine principals

### 5.1 Human-sponsored finite authority

Authenticated `agent` principals use a constrained machine profile. They require
an existing human sponsor and are bounded by finite exact scopes, action and
purpose allowlists, runtime identity, expiry, non-delegation, execution-time
ceilings, request-size and request-rate ceilings, concurrency limits, response-
size limits, and a finite destination allowlist.

Wildcard scopes and administrator role are rejected. The normalized machine-
authority digest is carried through request binding, plan provenance,
capability claims, result evidence, and receipts.

Infrastructure `service` principals remain backward-compatible unless they
explicitly opt into the same constrained profile.

### 5.2 Destination binding

For the current built-in operation set, Hypervisor derives the destination from
the policy-selected `builtin.*` tool and resolves it canonically to `local`.
The request is denied before capability issuance when that destination is not
within the principal's finite destination ceiling. Sandbox independently
recomputes and verifies the signed destination before execution.

Unknown provider, remote, or MCP destination semantics remain unresolved and
fail closed. No arbitrary external-destination claim follows from the presence
of a destination field.

### 5.3 Policy-filtered machine discovery

`/v1/machine-discovery` exposes a digest-bound snapshot of the authenticated
machine principal's own requestable intersection: active deny-dominant policy,
finite actions, scopes, purposes, destinations, and budgets.

Denied, unrelated, unresolved-destination, and out-of-scope actions are omitted.
The response explicitly states that discovery is not authorization. Every
actual effect still passes the normal intent and policy pipeline.

### 5.4 Grid-attested machine receipts

After a constrained-machine intent reaches a terminal evidence state, the owner
may request a Grid-attested receipt. The receipt binds:

- the canonical request digest;
- the exact machine-authority digest;
- exactly one accepted and one terminal Grid event anchor;
- current Grid chain-assurance metadata; and
- a terminal result or error digest.

Raw terminal output is not included. Foreign-owned and nonexistent intent
identifiers share the same not-found boundary. Independent verification checks
the Grid signature against a trusted Grid public key.

This proves what Grid attests about the recorded AXIOM intent and evidence. It
does not independently prove that an arbitrary external-world event occurred.

### 5.5 Runtime identity is not hardware attestation

Machine runtime identifiers and optional software digests are typed,
authority-bound attribution metadata. The current build does not claim TPM/TEE,
measured boot, workload/process attestation, or remote hardware proof.

## 6. Identity, transport, replay, and key lifecycle

Production service identities use Ed25519 keys provisioned outside source
control. Signed internal requests bind issuer, audience, validity window,
nonce, method, path, caller identity, and body digest. Verification rejects
unknown issuers, wrong audiences, stale requests, altered bodies, invalid
signatures, and replay.

Internal TLS uses a locally provisioned Ed25519 CA and distinct leaves. Offline
rotation validates a complete replacement generation before atomic swap and
preserves the previous generation for exact rollback. Active-leaf pinning
rejects retired but still CA-valid credentials without requiring an online
revocation service.

The candidate separately supports coordinated service/API credential rotation
and data-protection-key re-encryption. Grid evidence follows signed key
transitions. Data-key rotation rewraps live Grid and supported recovery state,
rejects wrong keys, recovers interrupted cutover, and preserves later evidence
through rollback.

A secret-free keyed ledger covers 32 conservative credential candidates from
deprecated history and makes supported-tip reuse a protected-CI failure.
Repository trust revocation is complete; provider/custodian disposition of
historical external credentials remains an authentic promotion-evidence gate.

## 7. Policy, approval, consent, and governance

Policy composition is deny-dominant:

- any denial wins;
- highest risk wins;
- required scopes accumulate;
- required confirmations cannot decrease;
- numeric and categorical constraints may only narrow authority.

Consent receipts bind subject, controller, purpose, data scope, expiry, and
revocation. Installing a capsule, discovering a node, connecting a provider, or
installing an agent runtime does not itself grant execution authority.

Local governance supports proposals, human voting, finalization, timelocked
activation, independently approved authority-reducing overlays, verification,
rollback metadata, expiring emergency controls, retrospective review, and
appeal records. Automated systems may tighten or pause authority; they may not
expand their own authority.

Portable delegation remains unpromoted. Machine-principal v1 is explicitly
non-delegating.

## 8. Execution and adapter boundary

The supported Sandbox is not a general-purpose code runner. It executes a small
registry of validated deterministic built-in operations. Arbitrary code,
rootless OCI execution, external AI providers, messaging, content transfer,
repository mutation, settlement, zk verification, regulated-domain workflows,
and embodied actions require separately named adapters and evidence.

Every exposed adapter must define:

- credentials and trust anchors;
- exact ingress/egress and destinations;
- input/output schemas;
- purpose and data scope;
- budget, timeout, cancellation, retry, and idempotency;
- retention and deletion;
- replay behavior;
- evidence/receipt semantics;
- failure, uninstall, and rollback behavior;
- independent test environment and threat model.

A missing or invalid provider returns `capability_unavailable`; it never returns
mock success on a production path.

## 9. Grid, evidence, privacy, and durability

Grid stores authenticated-encrypted state and a signed SHA-256 hash-linked
evidence sequence. Startup verification fails closed on unresolved signatures,
broken links, migration drift, wrong keys, or integrity failure.

Implemented Grid-owned families include principals, consent receipts, capsule
manifests, encrypted memory objects/edges, governance records, admitted nodes,
placement leases, storage offers, balanced local accounting, import/export,
causal updates, conflicts, approvals, machine terminal receipts, backup/recovery
records, and evidence anchors.

Memory is content-addressed, owner-bound, encrypted, selectively disclosable,
exportable, and tombstonable. Operational telemetry excludes raw user content
and user-controlled high-cardinality labels.

Local accounting uses balanced double-entry journals with safe integer units.
It does not authorize tokens, payroll, bridges, liquidity, or external
settlement.

### 9.1 Modification detection versus truncation detection

A local signed hash chain can detect altered events, invalid signatures, gaps,
broken links, and disagreement with the locally stored head. That is not the
same as proving that no suffix was deleted if an actor can also rewrite local
head metadata and trailing local checkpoints consistently.

For truncation assurance, the current build supports
`axiom-grid-continuity-anchor.v1` retained outside `AXIOM_DATA_DIR`. The anchor
is derived from a Grid-signed export-manifest head and verified with full
history re-verification from genesis.

A valid anchor proves that the current history equals or extends the retained
head through the anchor's committed sequence. It does **not** prove preservation
of events after the newest retained anchor, and it does not move malicious
host/root control or active Grid-signing-key compromise outside the trust
assumptions.

Grid remains a single-node transparency log, not BFT consensus.

## 10. Portability, synchronization, and network foundations

### 10.1 Export and import

Canonical JSONL exports can be scoped by time, record family, owned object, and
capsule. Signed manifests and continuity metadata support independent
verification. Optional X25519 recipient encryption protects selected records in
transit or storage.

Imports are cryptographically verified and staged. The operator receives a
deterministic diff. Independent approval is required before records enter an
isolated foreign-provenance store. Imported records cannot overwrite native
signed state or impersonate local evidence.

### 10.2 Causal exchange

Admitted nodes can produce signed bundles with version vectors. Replay,
equivocation, missing dependencies, noncontiguous counters, and incomplete
conflict resolution are rejected. Concurrent heads remain visible until an
explicit resolution causally dominates and names every current head.

The online relay binds exact Gateway origins, pinned source Grid evidence, one
matching owner, encrypted ordered queues, bounded retry, duplicate preflight,
and independent one-use destination approval. Protected tests use two real
supervisors and controlled partitions.

This proves transport and conflict semantics, not federation, replicated
consensus, or global finality.

### 10.3 Discovery and scheduling

Signed node admissions bind identity, owner, HTTPS origin, failure domain,
roles, software digest, security profile, resource ceilings, expiry, and
quarantine. Grid signs filtered discovery responses. Policy-controlled
scheduling creates deterministic all-or-nothing encrypted reservations subject
to capability, capacity, concurrency, owner, domain, security, expiry, and
lease constraints.

The current mechanism does not contact remote nodes to execute workloads,
measure remote resources, authenticate remote results, or solve global Sybil
resistance. Remote dispatch and result provenance remain multi-host gates.

## 11. Built future-boundary: dynamic resolver and prepared effects

AXIOM-MESH has begun extending its intent system beyond registry-fixed executor
inputs without allowing model prose or arbitrary caller JSON to become
execution authority.

The first resolver is deliberately narrow: a signed
`repository-docs-plan.v1` for a future semantic repository remediation mapping.
The correct ordering is non-circular:

1. fresh execution eligibility identifies unresolved resolver-backed input;
2. an independently signed read-only repository plan is verified against exact
   repository/base/path/lifetime ceilings;
3. Hypervisor signs content-addressed resolution and resolved-handoff evidence;
4. strict resolver admission facts are re-derived from current registry,
   policy, capability, build, requester, scope, and target-gate state;
5. independent implementation-conformance and security-authority reviews bind
   the exact candidate;
6. an exact-one-mapping addition can be packaged without applying it;
7. an independent receipt can observe exact before/after registry bytes without
   treating that observation as authority;
8. the resolved target input re-enters ordinary target policy, confirmation,
   and independent-approval evaluation;
9. only then may Hypervisor create a signed prepared-effect binding; and
10. the preparation coordinator reads the exact approval over authenticated
    Hypervisor -> Grid transport and atomically commits `approval.consumed`
    followed by `external.effect.prepared`.

Tests force two concurrent preparations to read the same active approval; only
one transaction can consume the approval and produce durable preparation
evidence. The losing path leaves no prepared effect.

This is an important authority property, but it is not a production repository
integration. The production executor registry remains empty, production policy
has no `repository.docs.pull-request.create` action, no public/runtime route
invokes the coordinator, the repository operator is not called, and no
external effect or merge occurs.

The next safe slice must bind an external repository operator to Grid-durable
prepared effects and bind the signed completion receipt back to the same
preparation before activation can even be considered.

## 12. Built future-boundary: Agent Runtime Adapter v1

External agent scaffolds evolve rapidly. AXIOM-MESH therefore does not make one
agent framework its authority model. Instead it defines a replaceable-runtime
contract.

Agent Runtime Adapter v1 is byte-pinned and specifies:

- trust bootstrap;
- signed AXIOM grants;
- capability translation;
- exact credential references rather than raw-secret transfer;
- one-use authorization;
- cancellation and revocation;
- idempotency;
- bounded fallback;
- uncertain-outcome handling;
- signed receipts;
- lifecycle and rollback;
- explicit chain-of-thought non-requirement; and
- failure behavior that preserves AXIOM as the final authority boundary.

A 28-case synthetic reference drill exercises positive and adversarial cases
and emits commit-bound conformance evidence.

The architectural rule is:

> A runtime may plan or coordinate work, but installing it, approving it, or declaring its tools can never create an alternate authority path around Gateway -> Hypervisor -> Sandbox -> Grid.

The reference adapter opens no external connection, resolves no real
credential, reads no user file, performs no external effect, and does not
certify any maintained third-party runtime. A future integration must pin one
specific upstream runtime and separately review its source, dependencies,
licence, sandbox/host behavior, update model, credential exposure, and adapter
implementation.

## 13. Operations and production evidence

The production candidate includes:

- exact Node.js/npm source-setup policy and zero third-party npm dependencies;
- non-root, read-only, capability-dropped container policy;
- explicit external secrets and fail-closed provisioning;
- bounded request bodies, rate limits, concurrency, logs, metrics, and queues;
- dependency-aware liveness/readiness;
- signed recovery, backup-retention, restore, SLO, resilience, transport,
  service-unit, scheduling, causal-sync, telemetry, credential-rotation,
  data-key-rotation, provider, pilot-verifier, security-review-verifier,
  continuity-anchor, incident-tabletop, and runtime-adapter evidence;
- hosted Windows compatibility for source/documentation/evidence-path and
  timing-sensitive verification; and
- a strict offline pilot evidence package and independent-review findings
  intake.

Protected synthetic evidence proves mechanisms and rejection paths. It does not
create a live pilot, external custody, a 30-day availability record, a real
operator acknowledgement trail, an independent audit, an external runtime
certification, or production promotion.

## 14. Human product family

### 14.1 AXIOM One

AXIOM One is the planned private personal agent, vault, approval centre, and
evidence record. Its user-facing concepts are Ask, Plan, Approvals, Vault,
Receipts, Share, and Circles.

The experimental loopback-only slice currently provides reviewed bounded
intent submission, owner-scoped private memory creation/listing, three fixed
directional provenance relations, correction-without-replacement,
confirmation-bound tombstoning, selective local export, explicit bundle reveal,
approval-state distinctions, same-idempotency-key uncertainty recovery, raw
evidence access, and cross-principal negative tests.

The preview does not claim an authoritative general pre-execution kernel plan,
general consequential plan/execute, direct edge deletion, hard deletion,
restore, bulk ingestion, completed browser-session security, human
comprehension, accessibility/usability evidence, or supported packaging.

### 14.2 AXIOM Verify

AXIOM Verify is planned as a local/static verifier for signed receipts and
export packages. It should explain signer identity, integrity, continuity,
package contents, alterations, scope, and non-claims without requiring trust in
an AXIOM operator.

Machine terminal receipts are a kernel verification primitive; they are not the
AXIOM Verify product.

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

AXIOM Managed Node is intended to provide optional hosting, backup, updates, and
support without converting hosting into platform ownership of user plaintext or
a general inspection right.

## 15. Frontier incubation

Frontier laboratories may implement:

- BFT and distributed-authority protocols;
- replicated evidence, threshold authorization, and stronger membership;
- tokens, treasury, staking, bonds, escrow, bridges, liquidity, and settlement;
- bounded autonomous agents, research loops, and task markets;
- education, health, government, finance, legal, employment, and other domain
  harnesses;
- embodied-system simulation and safety envelopes;
- arbitrary-code isolation;
- named zk verifier adapters; and
- post-quantum migration.

Laboratories must remain separated from production identities, secrets, user
data, real value, and public authority unless their own evidence and promotion
gates pass.

## 16. Current programme and promotion sequence

The immediate programme has three priorities.

First, complete one authentic controlled single-node pilot with external secret
and media custody, 30-day availability/capacity measurement, scheduled
recovery/rotation, named incident response, external credential-history
dispositions, pilot-owned telemetry/alert routes, and an independent security
review.

Second, complete the human utility layer: harden AXIOM One's browser/session,
accessibility, usability, packaging, deletion/recovery, and consequential
approval boundaries; then add one bounded AI provider and useful personal
workflows before selective sharing, Verify, and Circles.

Third, continue the machine/runtime line without widening authority: complete
the repository-effect completion/provenance chain while production-unreachable,
select one maintained external runtime for a bounded read-only adapter review,
and prove runtime parity with native AXIOM authorization, cancellation,
idempotency, receipt, and uncertain-outcome semantics before exposing MCP/A2A
or remote-execution edges.

Multi-host remote dispatch, WAN evidence, broader adapters, credentials,
managed nodes, distributed authority, settlement, and regulated domains remain
behind separate gates.

## 17. Threat model summary

The current kernel addresses forged/replayed requests, wrong audiences, expired
grants, machine sponsor/authority substitution, action/purpose/destination
escalation, policy weakening, approval reuse, payload/evidence tampering, wrong
keys, partial provisioning, dependency loss, secret leakage, native-state
overwrite, causal replay/equivocation, queue ambiguity, and approval bypass.

The newer resolver and runtime-adapter boundaries additionally defend against
free-form input becoming executor authority, stale policy/registry/build
laundering, unsigned repository-plan substitution, resolver constraint
widening, approval race/replay during preparation, runtime capability/grant
translation widening, raw-secret transfer, synthetic receipt success, and
alternate runtime authority paths.

Residual risks include compromised hosts/container engines, operator credential
or signing-key theft, cryptographic defects, denial of service beyond declared
ceilings, single-node authority compromise, continuity-anchor custody failure,
operational mistakes, future browser/session vulnerabilities, provider
misbehavior, adapter/runtime supply-chain compromise, governance capture,
economic exploits, and domain-specific legal/safety failures.

Each newly exposed surface reopens the relevant threat model and release gate.

## Non-claims

The `0.12.0-dev.3` build does not claim:

- a live public, customer, testnet, mainnet, or production service;
- a completed authentic pilot or independent security approval;
- a supported AXIOM One, Verify, Circles, Studio, or Managed Node release;
- production AI, messaging, identity, storage-transfer, payment, repository, or
  regulated-domain adapters;
- production conformance/certification for OpenClaw, Hermes, Agent Zero, MCP,
  A2A, or any other external runtime/protocol;
- a public resolver-backed repository-effect route, pull-request creation,
  direct-main write, or merge authority;
- remote workload dispatch or authenticated remote-result provenance;
- federation, BFT consensus, replicated Grid finality, or global Sybil
  resistance;
- arbitrary-code sandbox security;
- operational zk verification without a named verifier adapter;
- token, staking, bridge, liquidity, treasury, payroll, or settlement;
- clinical, educational, governmental, legal, employment, or financial
  compliance;
- secure embodied autonomy;
- end-to-end post-quantum security;
- proof that a model's reasoning or output is true;
- proof that a Grid-attested receipt establishes arbitrary external-world truth;
- proof that local Grid data alone detects a consistently truncated suffix after
  matching local metadata rewrite; and
- evidence after the newest externally retained Grid continuity anchor.

Historical and laboratory code may describe broader systems. Presence in the
repository is not promotion evidence.

## Reproducibility

Use an allowed Node.js 24 runtime. From the repository root:

```bash
npm run setup
npm run runtime-adapter:contract
npm run runtime-adapter:drill
npm run release:verify
```

`npm run setup` validates the Node.js/npm policy and CI/container pins, installs
both exact zero-dependency locks with lifecycle scripts disabled, proves the
locks unchanged, and runs clean-kernel/release verification. It does not
provision production credentials.

The runtime-adapter commands verify the byte-pinned candidate contract and its
28-case synthetic reference boundary. The drill uses ephemeral test identities,
loads no external runtime, performs no external effect, and is not production
adapter or external-runtime conformance evidence.

Current authorities and supporting documents are:

- [capability registry](../../mesh/config/capabilities.json);
- [product definition](../rebuild/PRODUCT-DEFINITION.md);
- [normative requirements](../rebuild/REQUIREMENTS.md);
- [source traceability](../rebuild/SOURCE-TRACEABILITY.md);
- [project status](../PROJECT-STATUS-2026.md);
- [roadmap](../ROADMAP.md);
- [execution queue](../MASTER-TODO.md);
- [production readiness tracker](../PRODUCTION-READINESS-TRACKER.md);
- [current threat model](../security/CURRENT-BUILD-THREAT-MODEL.md);
- [runtime adapter conformance](../architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md);
- [production runbook](../../mesh/PRODUCTION.md);
- [pilot evidence runbook](../operations/PILOT-DEPLOYMENT-DOSSIER.md); and
- [independent review runbook](../security/INDEPENDENT-SECURITY-REVIEW.md).

## Conclusion

AXIOM-MESH is developing into a sovereign coordination substrate rather than a
monolithic agent application. Its kernel minimizes and records authority; its
machine-principal surface makes non-human callers explicit and finite; its
human-product layer aims to make the same controls understandable; and its
runtime-adapter/resolver work shows how future capability can be built without
silently converting intelligence, installation, or connectivity into authority.

The intended outcome is not maximum feature count. It is a system that can
become more capable while preserving user ownership, explicit consent,
least-privilege execution, replaceable intelligence, recoverability, and
evidence whose claims remain as narrow and verifiable as the mechanisms that
produce it.