# Production Agent Network

**Status:** descriptive operations record

**Record date:** 2026-10-17

**Scope:** the operator-run agent network that supports AXIOM-MESH
development and the founder's circles

**Kernel status:** this network is **not** the AXIOM-MESH kernel. The kernel
(`0.12.0-dev.3`) is a production candidate and is not deployed anywhere. See
[PROJECT-STATUS-2026](../PROJECT-STATUS-2026.md) for kernel truth and
[`mesh/config/capabilities.json`](../../mesh/config/capabilities.json) for
what the kernel can run.

## What this document is

This record exists because the repository previously said nothing about the
production system that actually runs. It describes operational reality as
verified on 2026-10-17. It grants nothing, exposes nothing new, and promotes
nothing: operating this network is not kernel deployment, kernel promotion,
or evidence toward either.

The network runs in a pilot posture: production for the operator, a testnet
for the ecosystem, honestly early-stage.

## Components and state

### Agent relay (running)

A single relay server on the operator's infrastructure carries the network's
identity and messaging substrate:

- an identity registry (21 identities; 38 issued tokens, 19 active);
- device linking with an owner console and device commands (132 link
  records; deployed 2026-10-01);
- server-side `device.*` and `circle.*` actions, which the Axiom OS
  enrollment client speaks to.

The relay is a separate, simpler server written for operations. It does not
run the kernel's Gateway -> Hypervisor -> Sandbox -> Grid authority path,
and no claim in the kernel's registry or status documents rests on it.

### Circles registry (running; founded, largely unexercised)

Both circles exist as founded records in the relay's registry, created on
2026-09-30:

- `zoverions` — six members: two agents and four instrument devices. One
  instrument is a physical signage device on an older-lineage install; its
  current-lineage install and first real enrollment are still ahead.
- `kindred` — the everybody-circle. One member: the coordinator agent only.
  The founder is not yet a registered Kindred member; he is present only
  through the founder seat the coordinator holds.

The registry's agreement chain has never been exercised (sequence still 0).
Charter v0 (written 2026-09-29) is unratified, and live registry membership
has already drifted from the membership the charter names: several named
participants hold relay identities but not circle memberships.

### Coordination plane (running)

A job runner with a workstate register and periodic health snapshots
coordinates background work across the operator's servers. One honesty note:
the workstate register itself was last updated on 2026-09-29 — the
coordination plane runs, but its register has not kept pace with October's
work, and October's builds are recorded in their own build registers rather
than here.

### Matrix homeserver (running, staging posture only)

A tuwunel homeserver runs alongside the relay in staging posture:
loopback-only, registration closed, federation off. A public endpoint
(reverse-proxy vhost and placeholder certificate) is built but not run, and
there is no public DNS record for the Matrix endpoint. The governance bot
attached to the staging instance is a forwarding demonstration; by its own
description it is not an enforcement gate, and no kick, ban, or redact
capability exists. End-to-end encryption is absent and has never been
demonstrated.

### Second relay instance (running, shadow only)

A second instance of the relay runs on the operator's other server with its
own separate registry. The two registries are not synchronised; a sync
design was written on 2026-10-01 and never built. The second instance is a
shadow, not a replica.

### Estate failover machinery (built, deliberately unarmed)

Backup and promotion machinery for the operator's web estate is installed
on the second server: nightly backups run, and promotion is installed with
an age guard that has been proven to refuse immature snapshots. The
actuator is deliberately unarmed — no arming file exists and no registrar
credentials are held on the server. Arming is reserved to the founder.

## Known gaps

1. **Registration bound to the single mesh identity does not exist.** There
   is no mechanism tying a Matrix registration (or any public signup) to a
   Kindred registry record. This is the largest build item on the circle
   track.
2. **No public Matrix layer.** No public DNS record, no real certificate in
   service, registration closed, federation off — by staging design, and
   unchanged until the founder decides otherwise.
3. **No E2EE.** Matrix end-to-end encryption is absent and undemonstrated.
4. **No circle-state redundancy.** The circles registry is a single file on
   one server. Relay backups are local to the same disk (most recent:
   2026-10-09). Matrix data has no backup.
5. **No registry synchronisation** between the two relay instances (see
   above).
6. **No enforcement.** The governance bot demonstrates forwarding only.
7. **The agreement chain has never been used.** No circle agreement has ever
   been recorded through it.
8. **No real-circle enrollment on the current Axiom OS lineage.** The
   enrollment client is proven in QEMU against the relay's device-link
   contract; the first real enrollment is still ahead.

## What is not claimed

- that this network is the AXIOM-MESH kernel, runs its authority path, or
  promotes it;
- a public Matrix service, Matrix federation, or Matrix end-to-end
  encryption;
- open or self-service registration for Kindred or any circle;
- circle-state redundancy, registry synchronisation, or Matrix backups;
- an enforcement-capable governance bot;
- that relay identities are circle memberships (several are not);
- a physically verified Axiom OS release.

## Pointers

- Kernel truth: [PROJECT-STATUS-2026](../PROJECT-STATUS-2026.md) and
  [`mesh/config/capabilities.json`](../../mesh/config/capabilities.json).
- Axiom OS state: the Axiom OS section of PROJECT-STATUS-2026, until the
  current build lineage is committed to `Zoverions/axiom-os`.
- This document is descriptive only. Changes to the network's posture —
  public Matrix, registration, federation, arming — are the founder's
  decisions, recorded here after the fact, never implied by this record.
