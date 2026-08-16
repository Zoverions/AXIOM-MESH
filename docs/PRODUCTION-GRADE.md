# AXIOM-MESH Production-Grade Status

**Updated:** 2026-08-16

**Version:** `0.12.0-dev.3`

**Status:** production candidate; not production-promoted

This record describes the exact current production boundary. It intentionally
separates repository mechanisms from authentic external pilot evidence and from
future network, product, or adapter claims.

The capability registry at
[`mesh/config/capabilities.json`](../mesh/config/capabilities.json) is the
machine-readable source of truth for runnable capability status. Source presence,
a passing synthetic drill, an experimental preview, or a production-unreachable
prototype does not independently promote a capability.

## Current production-candidate scope

The supported runtime is a clean-room, dependency-free Node.js kernel organized
around four responsibilities:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

The production-candidate surface currently provides:

- authenticated principals, request validation, rate/idempotency controls, and
  versioned Gateway APIs;
- deny-dominant policy, explicit plans, confirmations, independent approval
  where configured, short-lived single-use grants, bounded deterministic
  execution, and signed evidence;
- human-sponsored constrained machine principals with finite scopes, actions,
  purposes, destinations, runtime identity, expiry, non-delegation,
  execution-time, request-size, request-rate, concurrency, and response-size
  ceilings;
- local built-in effect-destination binding and policy-filtered machine
  discovery without turning discovery into authorization;
- owner-scoped Grid-attested terminal machine receipts that bind request,
  machine-authority, accepted/terminal event, chain-assurance, and terminal
  outcome digests without exposing raw result/error content;
- encrypted transactional Grid state with signed hash-linked evidence;
- consent, capsules, memory, governance records, balanced local accounting,
  import/export, backup/restore, node admission/scheduling records, and causal
  exchange state;
- a versioned 30-route client contract for every authenticated Gateway route,
  with relative-only targets, explicit response/error schemas,
  timeout/cancellation, bounded request/response behavior, stable idempotent
  replay, and no direct internal-service target;
- an owner-local social actor/persona/publication substrate with A2 non-raw
  publication projections, append-only supersession/retraction, and an
  owner-derived `GET /v1/social` snapshot; the substrate performs no federation
  or network distribution;
- local evidence-chain verification plus externally retainable continuity
  anchors for stronger retained-history truncation assurance;
- authenticated operator API and CLI;
- bounded readiness, operations, telemetry, OpenMetrics, SLO/load, resilience,
  recovery, backup retention, credential/data-key rotation, incident, pilot,
  and independent-review verification mechanisms;
- a candidate non-root/read-only container and alternate four-unit single-host
  topology;
- TLS 1.3 internal transport with Ed25519 identities, DNS/SPIFFE-style identity,
  active-leaf pinning, offline rotation, retired-leaf rejection, and rollback;
- four exact private service-network segments with a default-deny 40-route
  application policy, sender/receiver enforcement, and policy-derived mTLS peer
  allowlists;
- signed admitted-node v2 discovery and deterministic encrypted placement
  reservations with explicit capability/resource/security/owner/domain/
  expiry/quarantine constraints;
- operator-approved encrypted two-Grid causal exchange with visible conflicts
  and explicit convergence, without claiming federation or consensus; and
- deployment-independent signed secret/policy-provider startup with exact
  nonce-bound inventories and private per-start materialization.

Machine runtime identifiers and software digests are attribution metadata. They
are not TPM/TEE, measured-boot, process-isolation, or remote-attestation proof.
Unknown provider, remote, MCP, or future runtime destination semantics fail
closed until a separately reviewed adapter exists.

## Source and supply-chain policy

The supported source runtime is:

- Node.js `>=24.14.0 <25`;
- protected CI and `.node-version`: Node.js `24.18.0`;
- candidate production image: Node.js `24.19.0`;
- npm `>=11.0.0 <12`;
- zero third-party npm dependency packages.

The machine-readable setup authority is
[`mesh/config/setup.json`](../mesh/config/setup.json). The CI pin and candidate
production image pin are intentionally separate fields within the supported
engine range. Exact source setup installs both committed zero-dependency locks
with lifecycle scripts disabled, proves those locks remain unchanged, and runs
the full kernel/release verification gates. Setup creates no production
credential and performs no deployment.

## Authority model

The supported privileged path is mandatory. A browser application, external
agent runtime, provider, repository operator, administrator, remote node, model,
or orchestration layer cannot inherit authority merely by being connected.

Consequential effects require the applicable combination of:

1. authenticated principal identity;
2. exact request/purpose/data-scope binding;
3. deny-dominant policy;
4. confirmation and independent approval where required;
5. a short-lived, audience-bound, one-use capability;
6. bounded Sandbox execution;
7. Grid-durable evidence; and
8. explicit destination/provider constraints where an external effect exists.

The active social write path follows the same authority chain. The local
custodian principal does not become the stable actor identity; actor and persona
state are first-class local records. Current runtime policy permits one local
actor per custodian and one active publication persona per actor. Publication
creation/supersession require at least A2 assurance, no raw-state disclosure,
no remote recipients, and exact actor/persona/projection binding. Retraction is
append-only and never claims third-party deletion.

## Grid evidence boundary

Grid state is authenticated-encrypted and its evidence records are signed and
hash linked. Local verification detects invalid signatures, altered events,
gaps, broken links, wrong-key state, and disagreement with the locally stored
head/checkpoint state.

That is a modification-detection claim, not unconditional proof that no valid
suffix was ever removed. An actor able to rewrite local durable state and local
head/checkpoint metadata can hide a consistently removed suffix from local state
alone.

Stronger retained-history assurance uses
`axiom-grid-continuity-anchor.v1`, stored outside `AXIOM_DATA_DIR` and verified
against the full chain from genesis. A valid retained anchor proves the current
history equals or extends the anchored head through the newest retained anchor.
It does not cover events after that anchor and does not eliminate malicious
host/root or active Grid-signing-key compromise from the trust assumptions.

Grid remains one transparency log, not replicated BFT consensus.

## Production packaging and operations

The candidate packaging includes:

- a digest-pinned non-root/read-only image;
- externally mounted production credentials;
- explicit resource ceilings and bounded logs;
- permission-restricted local Gateway ingress;
- dependency-aware readiness and authenticated operations reports;
- a compact deny-egress topology and an alternate four-unit single-host
  topology;
- encrypted backup/restore/retention with signed recovery evidence;
- service/API and data-protection-key rotation with rollback evidence;
- bounded telemetry and exact OTLP/Alertmanager routing;
- deterministic incident classification and tabletop evidence;
- pilot-dossier/package verification; and
- independent-security-review intake.

Protected CI exercises source setup, kernel/release checks, container
build/readiness, deny-egress and service-network boundaries, backup/recovery,
SLO/resilience, transport rotation, unit isolation, node scheduling, causal
exchange, provider startup, key rotation, incident tabletop, pilot intake,
security-review intake, Windows compatibility, and applicable CodeQL checks.

Synthetic or candidate-host evidence proves mechanisms and rejection paths. It
does not create authentic pilot custody, external receiver operation, independent
review, or production promotion.

## Repository-effect development boundary

The source contains a deliberately narrow evidence-first repository-document
effect prototype. It is built and adversarially tested but remains
**production-unreachable**.

The chain can produce and verify:

1. a signed read-only repository plan bound to exact repository/base/path/
   content/lifetime facts;
2. fresh executor/resolver eligibility tied to current policy, registry,
   capability, build, requester, and target state;
3. independently reviewed resolver admission;
4. an exact-one mapping package and exact before/after application observation;
5. resolved target policy/confirmation/independent-approval evidence;
6. one atomic Grid transaction recording `approval.consumed` followed by
   `external.effect.prepared`;
7. a durable external-effect outbox that never invokes an operator before
   preparation is durable;
8. a credential-isolated GitHub docs operator that independently verifies the
   Grid-durable preparation before any GitHub request;
9. exact planned documentation changes on a deterministic effect branch;
10. creation or recovery of an **open draft pull request**;
11. a signed operator receipt; and
12. `external.effect.completed` only after receipt verification.

Uncertain operator outcomes remain durably prepared. Retry uses the same
prepared effect rather than inventing success. Tests cover stale main, wrong
path/content/identity, forged Grid proof, duplicate execution, concurrent
approval consumption, post-write transport loss, exact readback recovery, and
completion-commit failure.

The operator contains no merge operation and explicitly reports
`merge_performed: false` and `base_branch_content_changed: false`.

Production reachability remains closed because:

- [`mesh/config/intent-remediation-executors.json`](../mesh/config/intent-remediation-executors.json)
  contains zero mappings;
- production policy contains no `repository.docs.pull-request.create` action;
- no supported public/runtime route invokes the chain;
- repository-operator credentials and egress are not part of the supported
  production deployment; and
- direct-main mutation and merge authority are absent.

A future first mapping is a separate activation and promotion decision requiring
its own policy/registry/runtime change, operator credential/egress custody,
rollback, negative-path evidence, independent review, and protected exact-head
CI.

## Agent Runtime Adapter v1 boundary

The repository contains a byte-pinned Agent Runtime Adapter v1 contract and a
28-case synthetic reference drill for future replaceable external agent
runtimes.

The contract fixes grant translation, capability mapping, one-use authority,
credential references, lifecycle, idempotency, cancellation, revocation,
fallback, uncertain outcomes, receipts, and rollback semantics. An external
runtime may plan or coordinate work, but installation, runtime approval, a tool
allowlist, or runtime-owned credentials cannot create an alternate authority
path around Gateway -> Hypervisor -> Sandbox -> Grid.

The synthetic reference loads no external runtime, resolves no production
runtime credential, opens no external runtime connection, reads no user file,
performs no external effect, and does not certify OpenClaw, Hermes, Agent Zero,
MCP, A2A, or another runtime.

## Human-product boundary

The experimental AXIOM One loopback/PWA foundation is outside the trusted
kernel. It currently provides bounded node status, reversible review for a
small action set, stable outcome/event explanations, approval-state views,
raw-evidence inspection, same-idempotency-key uncertainty recovery, and an
owner-scoped private Vault with bounded note/provenance/tombstone/export flows.

The kernel now also exposes the owner-derived `/v1/social` local snapshot and the
policy-governed social write actions. The snapshot owner is always the
authenticated principal; the versioned client contract allows only
`publication_limit`, never an owner override. Snapshot reconstruction strips
Hypervisor execution provenance and state-access receipts from the returned
owner view. It is a local corpus substrate, not a public profile, remote feed,
Following network, recommendation service, messaging system, federation layer,
or external distribution mechanism.

AXIOM One social UI integration remains a separate evidence gate. General
browser-session/device security, accessibility/usability, signed packaging,
updates, recovery/uninstall, broader consequential plan/execute, permitted hard
deletion/restore/bulk ingestion, and human-comprehension evidence also remain
open.

AXIOM Verify, Circles, Studio, Managed Node, bounded AI providers, Personal Agent
Pack, Runtime Capsule, policy-first compute routing, AXIOM Link, Local Trust,
identity, payments, and external runtime integrations remain separately gated.

## Authentic promotion blockers

Production promotion of the currently exposed kernel still requires authentic
external evidence including:

1. dedicated pilot hardware and a 30-day availability/capacity observation;
2. pilot-owned secret/provider/workload-identity, backup-media, telemetry, and
   alert custody;
3. scheduled restore and rotation under that custody;
4. an independently retained Grid continuity-anchor cadence/custody path;
5. provider/custodian or independently reviewed not-applicable dispositions for
   all 32 deprecated-history credential candidates;
6. a facilitated incident exercise with a named pilot roster and notification
   decision tree;
7. operator-owned telemetry/alert receivers, a receiver-side retention decision,
   and measured named-person acknowledgement;
8. an authentic independent security findings/remediation ledger for the exact
   source, image, deployment, and pilot configuration; and
9. an authentic exact pilot evidence package followed by a separate promotion
   decision.

The repository-effect prototype and Agent Runtime Adapter reference are not
current pilot blockers because neither is production-reachable. Proposing to
activate either creates its own promotion gates.

## What this build does not claim

`0.12.0-dev.3` does **not** claim:

- live public, customer, testnet, mainnet, or production deployment;
- completed authentic pilot or independent security approval;
- a supported AXIOM One, Verify, Circles, Studio, or Managed Node release;
- public social federation, remote Following feeds, recommendation service,
  messaging, public-profile hosting, remote media hosting, or external
  distribution from the local social substrate;
- an autonomous-agent runtime, machine delegation, MCP/A2A endpoint, or
  certified third-party runtime;
- production repository resolver/operator reachability, direct-main mutation,
  or merge authority;
- production AI, messaging, identity, storage-transfer, payment, repository, or
  regulated-domain adapters;
- remote workload execution or authenticated remote workload results;
- federation, BFT consensus, replicated Grid finality, or global Sybil
  resistance;
- arbitrary-code sandbox security;
- production token, bridge, liquidity, staking, treasury, payroll, or settlement
  systems;
- production identity proofing, payment authorization, funds availability,
  merchant acceptance, or settlement assurance;
- clinical, educational, governmental, legal, employment, or financial
  compliance;
- secure embodied autonomy or end-to-end post-quantum security;
- proof that a model result or external-world effect is true merely because an
  AXIOM receipt is cryptographically intact; or
- proof that local Grid state alone detects a consistently deleted suffix after
  matching local metadata rewrite.

## Promotion decision

The correct current decision remains:

> **Production candidate. Not production-promoted.**

The codebase contains a broad set of hardened mechanisms and some deliberately
production-unreachable future-effect primitives. Promotion depends on authentic
pilot, custody, review, recovery, and operational evidence—not on expanding the
source tree or passing synthetic tests alone.
