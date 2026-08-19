# AXIOM-MESH Project Status

**Status date:** 2026-08-19

**Supported build:** `0.12.0-dev.3`

**Development branch:** `main`

**Deployment status:** production candidate; no live deployment claim

## Current build

AXIOM-MESH `0.12.0-dev.3` is a clean-room, dependency-free Node.js coordination,
authority, and evidence kernel organized around Gateway, Hypervisor, Sandbox,
and Grid. It can run as supervised processes in one hardened container or as
independently restartable single-host units with isolated private credentials.
It is the supported development line, not a published release or production
promotion. The last immutable published production-candidate release is
`v0.11.0`.

The executable source of truth is
[`mesh/config/capabilities.json`](../mesh/config/capabilities.json). The
generated [capability status](rebuild/STATUS.md) records 31 implemented, 3
experimental, 2 specified, 9 adapter-required, and 4 disabled capabilities.
Built source does not become a runnable capability merely because tests exist:
production policy, registries, runtime wiring, and applicable promotion evidence
remain independent gates.

August 19 hardening closed two authority/evidence ambiguities without expanding
the capability surface. Capability use is now durably consumed in Grid before
Sandbox execution, with the signed consume receipt bound to the exact capability
and current Sandbox process epoch; restart or uncertain execution burns the
capability rather than making it replayable. Authority/evidence canonicalization
is also restricted to JSON-compatible plain data so class instances, accessors,
non-enumerable or symbol-keyed state, sparse arrays, and custom array/object
prototypes cannot silently collapse into misleading digests. Neither change
creates exactly-once external effects or production promotion.

## Current authority model

The ordinary supported privileged path is:

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

## Registry-backed implemented kernel scope

The production-candidate surface includes:

- authenticated intent, deny-dominant policy, explicit plans, confirmation and
  independent approval where required, short-lived capabilities durably consumed
  in Grid before execution, bounded deterministic execution, and signed evidence;
- a process-local Sandbox replay guard retained as a same-process fast path plus
  Grid-backed at-most-once capability consumption across Sandbox/Grid restart,
  with execution-epoch binding and explicit burn-on-uncertainty semantics;
- human-sponsored constrained machine principals with finite scopes, actions,
  purposes, destinations, runtime identity, expiry, non-delegation,
  execution-time, request-size, request-rate, concurrency, and response-size
  ceilings;
- AXIOM-computed current built-in effect destinations, with `builtin.*`
  resolving to `local` and failing closed when the destination is outside the
  machine principal's finite destination ceiling;
- authenticated `/v1/machine-discovery`, returning only the caller's
  digest-bound requestable intersection under active deny-dominant policy and
  explicitly not granting execution authority;
- owner-scoped Grid-attested terminal machine receipts binding canonical
  request and machine-authority digests, exactly one accepted and one terminal
  Grid event anchor, current chain-assurance metadata, and terminal result/error
  digests without exposing raw result/error content;
- backward-compatible least-privilege infrastructure `service` principals;
- encrypted transactional Grid state, consent, memory, governance, local
  accounting, import/export, backup/restore, credential and data-key rotation;
- local evidence-chain verification plus externally retainable
  `axiom-grid-continuity-anchor.v1` records;
- authenticated operator API and CLI;
- one-command source setup with exact Node.js/npm policy, two zero-dependency
  locks, prohibited install lifecycle scripts, unchanged-lock proof, and full
  kernel/release gates;
- a versioned Gateway client contract implemented for all 31 authenticated routes with
  relative-only application targets, explicit errors, timeout/cancellation,
  bounded request/response behavior, stable idempotent replay, and no direct
  Grid/Hypervisor/Sandbox target;
- an owner-derived `GET /v1/social` local snapshot that reconstructs bounded
  actor/persona/publication state from the authenticated principal's signed
  Grid history, strips execution/state-access provenance, rejects a
  contract-level owner override, and performs no network distribution;
- a separate owner-derived `GET /v1/social/remote-review` inspection route that
  rejects query overrides, returns only the minimized G5A remote-review
  projection, creates no remote-social schema, and performs no mutation,
  transport, federation, ranking, recommendation, or authority effect;
- bounded-cardinality telemetry, readiness, operations reports, OpenMetrics,
  and a host-side least-privilege OTLP/Alertmanager relay;
- explicit production credential provisioning and fail-closed supervision;
- per-unit private identity/TLS projection, Grid-only durable state, four exact
  internal network segments, a default-deny 41-route application policy,
  policy-derived mTLS peers, and signed failure/recovery evidence;
- TLS 1.3 internal transport with Ed25519 identities, DNS and SPIFFE-style URI
  identity, active-leaf pinning, offline rotation, retired-leaf rejection, and
  rollback;
- signed admitted-node v2 discovery metadata and deterministic encrypted
  placement leases with capability, resource, concurrency, security,
  owner/domain, expiry, and quarantine controls;
- operator-approved two-Grid causal exchange with pinned Grid evidence,
  node-signed bundles, encrypted ordered queues, duplicate preflight, one-use
  destination approval, visible concurrent heads, and explicit convergence;
- deployment-independent secret/policy provider startup with separately pinned
  signers, exact short-lived inventories, private per-start materialization,
  semantic validation, cleanup, and fail-closed signer/input rejection;
- fail-closed pilot dossier/package intake and independent-security-review
  intake with exact build/scope/artifact and role/signature requirements; and
- hosted Windows compatibility hardening for source/documentation verification,
  evidence-path normalization, and timing/expiry tests.

Machine runtime IDs and software digests remain authority-bound attribution
metadata. They are not TPM/TEE, measured-boot, process-isolation, or remote-
attestation proof. Unknown provider, remote, or MCP destination semantics remain
unresolved and fail closed.

## Grid evidence boundary

Grid state is authenticated-encrypted and its evidence is signed and hash
linked. Local verification detects invalid signatures, altered events, gaps,
broken links, and disagreement with the locally stored head.

That is modification detection, not an unconditional retained-history claim. A
consistently deleted suffix can be hidden from local state alone if matching
local head/checkpoint metadata is also rewritten. Stronger truncation assurance
uses `axiom-grid-continuity-anchor.v1`, retained outside `AXIOM_DATA_DIR` and
verified against the full chain from genesis. A valid anchor proves that the
current history equals or extends the retained head through the newest retained anchor.
It does not prove preservation of later events and does not remove
malicious host/root or active Grid-signing-key compromise from the trust model.

Grid remains one transparency log, not replicated BFT consensus.

## Built, verified, but production-unreachable repository-effect chain

Merged August work contains a deliberately narrow repository-document effect
prototype. It is real source with adversarial tests, but it is not part of the
supported production-reachable capability surface.

### Planning, resolver, and target authorization

The chain can:

1. construct and sign a read-only repository plan against an exact base SHA and
   bounded documentation paths;
2. bind that plan to fresh execution eligibility and exact remediation,
   resolver, registry, policy, capability, build, requester, scope, destination,
   and target-policy facts;
3. derive strict resolver admission facts;
4. require independent implementation-conformance and security-authority
   review;
5. package exactly one resolver mapping addition without conflating packaging
   with installation;
6. independently observe exact registry application bytes without turning
   observation into authority; and
7. re-evaluate the resolved target through ordinary policy, confirmation, and
   independent-approval gates.

The preparation coordinator sources the named approval over authenticated
Hypervisor -> Grid transport and commits one transaction containing, in order,
`approval.consumed` and `external.effect.prepared`. Concurrent attempts prove
that exactly one preparation can survive one-use approval consumption.

### Durable outbox and credential-isolated docs operator

The built external-effect outbox verifies the prepared effect, requires Grid to
durably record preparation before operator invocation, and refuses to fabricate
success when the operator or receipt is uncertain. An unresolved result remains
durably prepared. Only a verified signed operator receipt can be bound into
`external.effect.completed`; if that completion commit itself fails, replay is
required to use the same prepared effect.

The built GitHub docs operator independently verifies the Grid-durable prepared
effect **before any GitHub request**. It is fixed to `Zoverions/AXIOM-MESH`,
accepts only the exact planned documentation paths and content, uses a
deterministic effect branch, and can create or recover an **open draft pull
request**. Tests cover stale-main rejection before mutation, unplanned paths,
wrong content/identity/branch, forged Grid proof, duplicate execution,
post-write transport uncertainty, and exact readback recovery.

The operator contains no merge operation. Its receipt/result explicitly records
`merge_performed: false` and `base_branch_content_changed: false`. The built
prototype therefore demonstrates an evidence-first, idempotent draft-PR effect
boundary—not autonomous repository administration.

### Why it remains production-unreachable

The production executor registry
[`mesh/config/intent-remediation-executors.json`](../mesh/config/intent-remediation-executors.json)
contains zero mappings. Production policy contains no
`repository.docs.pull-request.create` action. No supported public/runtime route
activates the resolver/executor/operator chain.

Accordingly, the operator can be built and tested while the capability remains
unavailable from the supported runtime. Activating even the first mapping would
require an explicit registry/policy/runtime change, operator credential/egress
review, rollback and negative-path evidence, independent review, and a separate
promotion decision. Direct-main mutation and merge authority are not part of
the candidate design.

## Agent Runtime Adapter v1

The repository defines a byte-pinned Agent Runtime Adapter v1 contract and a
28-case synthetic reference drill. The contract fixes authority, capability
translation, credential references, lifecycle, idempotency, cancellation,
revocation, receipt, fallback, uncertain-outcome, and rollback semantics for a
future replaceable external runtime.

An external runtime may plan or coordinate work but cannot become an alternate
authority system. Installing or approving a runtime, or declaring its tool
allowlist, never bypasses Gateway -> Hypervisor -> Sandbox -> Grid.

The reference adapter loads no external runtime, resolves no production runtime
credential, opens no external runtime connection, reads no user file, performs
no external effect, and does not certify OpenClaw, Hermes, Agent Zero, MCP,
A2A, or any other runtime.

## Repository-native agent participation and portable identity

The repository now exposes a repository-native Security Agent Cell for public,
non-sensitive security evidence work. Its bounded roles are scout, reproducer,
verifier, patcher, and triage recorder. The cell reuses the canonical red-team
finding lifecycle and explicitly separates evidence from authority: public
agents may inspect code, reproduce in their own or disposable environments,
prepare patches/PRs, and exercise protected CI, but merge, deployment,
credentials, production promotion, spending, hardware custody, destructive
recovery, and unauthorized third-party testing remain separately authorized.

A portable machine-identity laboratory is also merged on `main` as the first
runtime-facing precursor to Agent Contributor Mode. The
`axiom-machine-identity-credential.v1` evidence binds principal identity,
sponsor, issuer/key epoch, operational key, runtime binding, credential history,
rotation/recovery, expiry, and issuer-signed revocation/currentness facts.

That laboratory is **identity evidence only**. It does not modify the capability
registry, enable self-service enrollment or machine delegation, create a bearer
grant, expose a remote executor or MCP/A2A, establish legal identity or
personhood, prove reputation/truth/global currentness, or grant repository,
deployment, credential, spending, hardware, governance, or runtime authority.
The next contributor-mode steps remain separately gated around currentness,
bounded contributor sessions, attenuation/delegation, portable handoff/receipt,
and plural governance.

## Human product state

The implemented Gateway client contract supports the experimental AXIOM One
loopback browser/PWA foundation. The current bounded preview provides node
status, reversible review for five bounded actions, stable outcome/event
explanations, one-use approval states, same-idempotency-key uncertainty
recovery, and an owner-scoped Vault that can create/list private notes, add one
of three directional provenance links (`derived-from`, `supports`, `corrects`),
tombstone an exact record after confirmation, create a selective local export,
and reveal its bundle only after a separate action.

The kernel now also supports local social actor/persona/publication state, an
owner-only `/v1/social` read contract, and a separate owner-only read-only
`/v1/social/remote-review` inspection contract. These are bounded corpus and
review substrates, not a public social network: no social mutation is exposed
through the review route, and no federation, remote Following feed, public
profile hosting, recommendation layer, messaging, or external distribution is
claimed. AXIOM One UI integration remains separately gated.

Corrections are new linked records; they do not silently replace their target.
Cross-principal read/link/export/tombstone paths are denied in real-stack tests.
The preview is not a supported product and does not claim general consequential
plan/execute, direct provenance-edge deletion, hard deletion, restore, bulk
ingestion, completed browser-session security, accessibility/usability evidence,
or signed end-user packaging.

AXIOM Verify, AXIOM Circles, AXIOM Studio, AXIOM Managed Node, bounded AI
providers, useful personal workflows, selective sharing, and later external
runtime integrations remain separately gated product work.

## Production package state

The candidate includes a digest-pinned non-root/read-only container, mounted
external secrets, resource ceilings, bounded logs, permission-restricted local
Gateway ingress, dependency-aware readiness, and compact/four-unit single-host
topologies.

The source-setup policy distinguishes protected-CI Node.js `24.18.0` from the
candidate production image pin `24.19.0`; both remain within the supported
`>=24.14.0 <25` engine range.

Protected evidence covers source setup, tests, release verification, network
policy, container build/readiness, recovery, backup lifecycle, SLO, resilience,
telemetry, transport, independent service units, node scheduling, causal
exchange, provider startup, credential/data-key rotation, restart-safe
capability consumption, plain-data authority/evidence canonicalization,
incident tabletop, pilot dossier/package verification,
independent-security-review verification, runtime-adapter synthetic conformance,
and applicable CodeQL/Windows gates.

These artifacts prove mechanisms and rejection behavior. They do not create the
external facts required for production promotion.

## Specified personal compute and local trust architecture

The repository contains the documentation-only `1.0.0-draft.1`
[Personal Compute Fabric and Local Trust Plane](architecture/PERSONAL-COMPUTE-FABRIC-AND-LOCAL-TRUST.md)
architecture plus JSON Schemas for a Personal Agent Pack, Agent Runtime
Capsule, Agent Runtime Adapter, Compute Node Profile, and Local Trust Envelope.

The specification defines a phone-first path to a constrained wearable,
replaceable local, managed, or cloud inference, policy-first routing,
deterministic local credential and authorization checks, exact one-use
mandates, and truthful external payment and identity states. It separates
personal continuity from model weights, orchestration from authority, local
authorization from external authorization, and accounting from settlement.

This is product and protocol planning only. The current runtime loads only the
separately byte-pinned Agent Runtime Adapter contract; it does not load the
other four drafts. No wearable, pairing, agent capsule executor, Personal Agent
Pack, inference router, compute dispatcher, identity presentation, payment
mandate, or settlement adapter has been implemented or added to the capability
registry.

## Promotion blockers

Production promotion remains blocked by authentic external evidence, including:

1. dedicated pilot hardware plus 30-day availability/capacity observation;
2. pilot-owned secret/provider/workload-identity, backup-media, telemetry, and
   alert custody;
3. scheduled restore and rotation under that custody;
4. a defined cadence and independent custody path for external Grid continuity
   anchors;
5. provider/custodian or independently reviewed not-applicable dispositions for
   all 32 deprecated-history credential candidates;
6. a facilitated incident exercise with a named pilot roster and notification
   decision tree;
7. operator-owned telemetry/alert receivers, receiver-side retention decision,
   and measured named-person acknowledgement;
8. an authentic independent security review for the exact source, image,
   deployment policy, and pilot configuration; and
9. an authentic exact pilot evidence package and separate production-promotion
   decision.

The repository-effect, portable-identity, Security Agent Cell, and
runtime-adapter work do not themselves block the current pilot because none
expands the supported production-reachable authority surface. A future proposal
to activate any new runtime/effect authority creates its own promotion gates.

## What is not claimed

The `0.12.0-dev.3` build does **not** claim:

- a live public, customer, testnet, mainnet, or production service;
- a completed authentic pilot or independent security approval;
- a supported AXIOM One, Verify, Circles, Studio, or Managed Node release;
- a supported wearable/companion product, portable Personal Agent Pack, Agent
  Runtime Capsule executor, compute-routing fabric, or Local Trust Plane;
- a production AI, messaging, identity, storage-transfer, payment, repository,
  or regulated-domain adapter;
- production identity proofing, credential presentation, passkey authorization,
  payment authorization, funds availability, merchant acceptance, or
  settlement;
- self-service portable machine enrollment, autonomous-machine delegation,
  reputation/global-currentness proof, or authority derived from a portable
  identity credential or Security Agent Cell result;
- certification or production conformance of an external agent runtime;
- MCP/A2A exposure, autonomous-machine delegation, remote workload execution,
  or hardware/runtime attestation;
- a production resolver mapping or supported public repository-effect route;
- direct-main repository writes or merge authority from the built docs-only
  operator;
- federation, BFT consensus, replicated Grid finality, or global Sybil
  resistance;
- arbitrary-code sandbox security;
- exactly-once external side effects from durable capability consumption;
- operational token, bridge, liquidity, staking, treasury, payroll, or chain
  settlement;
- clinical, educational, governmental, legal, employment, or financial
  compliance;
- secure embodied autonomy or end-to-end post-quantum security;
- proof that a model's reasoning/output is true;
- proof that a Grid-attested machine or operator receipt establishes arbitrary
  external-world truth; or
- proof that local Grid state alone detects a consistently deleted suffix after
  matching local metadata rewrite.

Presence in the source tree, a passing synthetic drill, an identity credential,
a Security Agent Cell result, or a draft-PR operator test is not production
promotion.

## Current priorities

1. finish the remaining authority-algebra hardening and converge overlapping
   Agent Trust/semantic-memory laboratories into one selected progression rather
   than accumulating parallel green branches;
2. complete the authentic controlled pilot: dedicated hardware, external secret
   and continuity-anchor custody, real telemetry/alerts, restore/rotation,
   30-day observation, and exact independent security review;
3. finish AXIOM One browser/security/accessibility/package gates and one bounded
   useful provider/workflow path, followed by one immutable single-agent Runtime
   Capsule, a secret-free Personal Agent Pack, and transparent policy-first
   compute routing;
4. select and review one maintained external runtime for a deliberately bounded
   read-only Agent Runtime Adapter v1 integration before any remote execution or
   broader interoperability claim; and
5. continue Agent Contributor Mode, authenticated multi-host dispatch,
   Circles/social exchange, plural authority, and frontier work incrementally
   behind their own evidence and promotion gates.

See the [roadmap](ROADMAP.md), [execution queue](MASTER-TODO.md),
[production-readiness tracker](PRODUCTION-READINESS-TRACKER.md),
[product definition](rebuild/PRODUCT-DEFINITION.md),
[normative requirements](rebuild/REQUIREMENTS.md),
[current threat model](security/CURRENT-BUILD-THREAT-MODEL.md), and
[technical white paper](whitepapers_and_research/WHITEPAPER.md).
