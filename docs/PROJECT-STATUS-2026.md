# AXIOM-MESH Project Status

**Status date:** 2026-07-29

**Supported build:** `0.12.0-dev.0`

**Development branch:** `main`

**Deployment status:** production candidate; no live deployment claim

## Current build

AXIOM-MESH `0.12.0-dev.0` is a clean-room, dependency-free Node.js kernel organized as
four services: Gateway, Hypervisor, Sandbox, and Grid. They run as supervised
processes in one hardened container or as independently restartable
single-host units with isolated private credentials. It is the supported
development line, not a published release or a production promotion. The last
published production-candidate release is immutable `v0.11.0`; changes after
that tag are identified only as the current 0.12 development build.

The executable source of truth is
[`mesh/config/capabilities.json`](../mesh/config/capabilities.json). The
generated [capability status](rebuild/STATUS.md) records 24 implemented, 2
experimental, 3 specified, 9 adapter-required, and 4 disabled capabilities.

## Implemented kernel scope

- authenticated intent, policy, plan, grant, deterministic execution, and
  signed evidence flow;
- deny-dominant layered policy and independent approval for high-risk effects;
- transactional, encrypted Grid state with a signed hash-linked evidence log;
- consent receipts, capsule manifests, encrypted memory, local balanced
  accounting, and admitted-node/storage registries;
- signed scoped export, recipient encryption, staged import, encrypted backup
  and restore, and admitted-node causal bundles;
- authenticated operator API and CLI;
- bounded-cardinality telemetry, dependency readiness, operational reports,
  OpenMetrics output, static security/integrity alerts, and a host-side
  least-privilege OTLP/Alertmanager relay with exact HTTPS origins, bounded
  persistent retry, redaction, receipts, and delivery audit;
- explicit production credential provisioning and a fail-closed four-process
  supervisor;
- per-unit private identity/TLS projection, Grid-only durable state, an
  internal deny-egress network, and signed Sandbox-only failure/recovery
  evidence;
- signed admitted-node v2 discovery metadata, authenticated Grid-signed
  discovery, and deterministic encrypted placement leases with resource,
  concurrency, security, owner/domain, expiry, and quarantine controls;
- bidirectional operator-approved online causal exchange with pinned
  Grid-signed event evidence, encrypted ordered queues, bounded retry,
  owner-scoped duplicate preflight, and explicit conflict convergence.
- deployment-independent startup from separate Ed25519-pinned secret and
  policy providers with digest-pinned command artifacts, nonce-bound
  short-lived exact inventories, private per-start materialization, semantic
  validation, cleanup, and fail-closed rejection.
- pilot evidence intake using a separately anchored policy authority, exact
  source/image and 30-day/SLO/custody inventory, five distinct role
  signatures, and an exact offline package of 13 canonical, secret-free,
  role-signed evidence envelopes with an explicit non-promotion result.

## Production package state

The repository contains a digest-pinned, non-root, read-only container
candidate with mounted secrets, resource ceilings, bounded logs, local
Unix-domain socket ingress, and readiness checks. Static deployment policy and
a real host-mode four-process drill are implemented. Compose attaches no
network; startup rejects active non-loopback and IPv4/IPv6 default routes while
retaining explicit host-local Gateway ingress.

The alternate `compose.units.yml` topology uses a Docker internal network,
publishes no port, and preserves the Unix socket. Protected CI stops only
Sandbox, verifies Gateway, Grid, and Hypervisor retain their container
identities while readiness degrades, starts Sandbox alone, verifies recovery,
and proves a public TCP target remains unreachable from a unit.

The container package is implemented and verified by the protected
[Clean Kernel workflow](https://github.com/Zoverions/AXIOM-MESH/actions/workflows/kernel.yml),
which built the digest-pinned image and passed composed readiness,
authenticated operations, and teardown. That workflow now also provisions a
disposable production workspace and exercises encrypted backup, tamper and
unsafe-restore rejection, exact restore, rollback preservation, and signed
recovery evidence with a measured recovery point and recovery time. It also
runs a fixed authenticated load profile against the real four-process
production supervisor, records latency, error rate, throughput, CPU/memory
observations and peak concurrency, then measures a graceful restart and
post-restart intent. It also performs an authenticated Unix-socket scrape
with a route-limited relay identity, exports 68 fixed OTLP points and bounded
Alertmanager alerts, forces transient failures, drains the alert-reserved
queue, and records signed delivery receipts. It also performs bounded
request-pressure and real dependency-loss checks: oversized requests
cannot reserve idempotency keys, concurrent bursts rate-limit predictably,
Sandbox suspension propagates dependency-not-ready state, Sandbox loss exits
the supervisor fail-closed, and a clean restart preserves Grid state. It also
provisions mutually authenticated TLS 1.3 for every internal service edge,
binds active leaf certificates to signed caller identities, rotates all leaves,
rejects a retired CA-valid peer, and restores the prior generation exactly. It
also
performs offline
coordinated rotation of all four service identities and the operator and
telemetry relay tokens, proves active and inactive trust in
both directions, preserves Grid evidence through a dual-signed key transition,
and restores the exact original set from an authenticated-encrypted rollback
package. The workflow also re-encrypts and rotates the data-protection key
across live and retained recovery state, proves wrong-key rejection in both
  directions, restores a backup under the rotated key, and preserves later
  evidence through rollback. Signed policy-derived backup retention now
  verifies the full inventory, keeps a minimum, moves excess media to
  recoverable quarantine with killed-process recovery, and restores a retained
  backup in protected CI on every relevant change and weekly. The container
  job also establishes that its public TCP probe is runner-reachable, then
  proves it is unreachable from the candidate namespace and uploads signed
  evidence. The kernel job also admits signed v2 nodes, rejects copied signing
  identities and exhausted capacity, schedules across owners and failure
  domains, degrades on quarantine, expires a missed-renewal node, and preserves
  the schedule through Grid restart. It also starts two real production
  supervisors, injects a two-direction causal-exchange partition, preserves
  encrypted cursors, rejoins through exact independent approvals, exposes two
  concurrent heads on both Grids, converges through explicit all-head
  resolution, and absorbs duplicate replay before approval. It also starts the
  real four-service host twice through independent signed
  secret and policy providers, activates rotated API and policy resources,
  rejects the retired token and an invalid provider signer, removes each
  private runtime generation, and binds that proof into the incident tabletop.
  It also runs signed synthetic conformance for both pilot intake boundaries.
  The dossier drill proves wrong-build, altered-approval, missing-evidence,
  and secret-field rejection. The package drill proves exact canonical
  inventory plus missing, extra, wrongly signed, noncanonical, and
  secret-bearing file rejection. Both explicitly declare that no live pilot
  was observed.
  Dedicated pilot-hardware capacity and availability validation,
  pilot-owned receiver/secret/media custody, external
  credential-history attestations, and independent security review are still
  required before production promotion. The repository-side history audit is
  implemented: a secret-free keyed ledger covers 32 conservative candidates,
  revokes each from supported trust, and makes supported-tip reuse a protected
  CI failure.

See:

- [production-grade definition](PRODUCTION-GRADE.md);
- [readiness tracker](PRODUCTION-READINESS-TRACKER.md);
- [active execution queue](MASTER-TODO.md);
- [production runbook](../mesh/PRODUCTION.md).

## Repository transition

The former GitHub `Main` tip is preserved by immutable tag
`archive/legacy-main-pre-clean-room-2026-05-21`. Credentials found anywhere in
that object graph are permanently untrusted. Lowercase `main` is the GitHub
default and the only supported development branch.

Unsupported legacy runtime trees and dependency manifests are absent from the
supported tip. Superseded documentation is also absent from `main`; its exact
pre-cleanup state is preserved on locked, read-only branch
`deprecated/pre-0.12-documentation-corpus`. The published 0.11 package,
archived source objects, and rebuilt checkpoints are provenance artifacts, not
alternate production branches.

## What is not claimed

AXIOM-MESH does not currently claim:

- a live public testnet, mainnet, or production service;
- BFT consensus, multi-host federation, or federated network peer discovery;
- independently hosted WAN causal-exchange performance or replicated Grid
  consensus;
- a live vendor-backed vault, cloud secret manager, HSM/KMS, workload
  identity, or provider high-availability deployment;
- remote workload dispatch, resource measurement, or result provenance from
  scheduled nodes;
- externally audited arbitrary-code isolation;
- operational tokens, bridges, liquidity, or chain settlement;
- working zk proof verification without a named adapter;
- production AI-provider or messaging integrations;
- clinical, educational, governmental, or financial regulatory compliance;
- secure embodied autonomy;
- post-quantum end-to-end security.

Historical code and documents may describe those systems. Presence in the
repository is not implementation or deployment evidence.

## Immediate next milestone

The next milestone is disposing the 32 external credential-history
attestations,
pilot-owned provider, telemetry-receiver, and media custody with scheduled
on-media recovery,
a facilitated named-roster incident exercise, pilot-platform network-policy
repetition, and independent security review for a controlled single-node
pilot. The automated external telemetry/alert relay, request-path resilience,
transport lifecycle, independent service failure isolation, admitted-node
discovery/scheduling reservations, operator-approved two-Grid causal exchange,
signed secret/policy provider startup, and candidate tabletop are implemented;
the signed pilot dossier, exact offline evidence package intake, and
independent-review contract are also implemented, but no authentic pilot
package has been submitted;
protected CI signs bounded delivery evidence and a same-revision composition
of eleven real control drills.
Work is ordered in
[`docs/MASTER-TODO.md`](MASTER-TODO.md).
