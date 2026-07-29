# AXIOM-MESH Project Status

**Status date:** 2026-07-28

**Supported kernel:** 0.11.0

**Development branch:** `main`

**Deployment status:** production candidate; no live deployment claim

## Current release

AXIOM-MESH 0.11.0 is a clean-room, dependency-free Node.js kernel organized as
four independently supervised processes: Gateway, Hypervisor, Sandbox, and
Grid. The verified source checkpoint is
`1d318b481dc03858a4f46b63da05a395adbd7c6f`; the new GitHub development line
starts from a tree-identical clean root so deprecated legacy ancestry is not
inherited by the default branch.

The executable source of truth is
[`mesh/config/capabilities.json`](../mesh/config/capabilities.json). The
generated [capability status](rebuild/STATUS.md) records 18 implemented, 2
experimental, 4 specified, 9 adapter-required, and 4 disabled capabilities.

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
  supervisor.

## Production package state

The repository contains a digest-pinned, non-root, read-only container
candidate with mounted secrets, resource ceilings, bounded logs, local
Unix-domain socket ingress, and readiness checks. Static deployment policy and
a real host-mode four-process drill are implemented. Compose attaches no
network; startup rejects active non-loopback and IPv4/IPv6 default routes while
retaining explicit host-local Gateway ingress.

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
  evidence. Dedicated pilot-hardware capacity and availability validation,
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

The former GitHub `Main` line is preserved as
`deprecated/legacy-main-pre-clean-room`. Credentials found anywhere in that
history are permanently untrusted. Lowercase `main` is now the GitHub default
and the only supported development branch. The deprecated branch is locked
against pushes, force pushes, and deletion. Unsupported legacy runtime trees
and their dependency manifests were removed from the supported tip; they
remain recoverable from Git history and the deprecated branch. The 0.11
release package and original rebuilt checkpoints remain provenance artifacts,
not alternate production branches.

## What is not claimed

AXIOM-MESH does not currently claim:

- a live public testnet, mainnet, or production service;
- BFT consensus, multi-host federation, or automatic peer discovery;
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
pilot-owned secret, telemetry-receiver, and media custody with scheduled
on-media recovery,
a facilitated named-roster incident exercise, pilot-platform network-policy
repetition, and independent security review for a controlled single-node
pilot. The automated external telemetry/alert relay, request-path resilience,
transport lifecycle, and candidate tabletop are implemented; protected CI
signs bounded delivery evidence and a same-revision composition of seven real
control drills.
Work is ordered in
[`docs/MASTER-TODO.md`](MASTER-TODO.md).
