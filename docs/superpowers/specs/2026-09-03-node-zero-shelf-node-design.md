# AXIOM Host Node Zero — Shelf Node Design

**Status:** approved architecture; design-only, no capability promotion  
**Date:** 2026-09-03  
**Baseline:** `main` at `c61202a10cfe0a85001cea432423d2c4c22dbca8`  
**Target hardware class:** older x86_64 desktop, mains-powered, always-on, single vertical display  
**Canonical first host base:** Ubuntu 24.04 LTS x86_64  

## 1. Purpose

Build the smallest real AXIOM-controlled Linux host that can run continuously on ordinary hardware, participate in AXIOM-MESH under explicit bounded enrollment, survive network and software failure safely, and perform one useful local appliance task: continuously display locally cached book covers on a vertical screen.

Node Zero is the first physical proving ground for the sovereign-host, fresh-install, recovery, service-isolation, and constrained-node architecture. It is intentionally low-consequence: the primary appliance function must continue even if the Mesh is unavailable.

This design does **not** create a new Linux distribution. AXIOM owns a hardened host profile and lifecycle layer on top of Ubuntu 24.04 LTS. Kernel, firmware, drivers, bootloader, and ordinary base-system maintenance remain upstream responsibilities unless later evidence justifies replacing one of those layers.

## 2. Architectural position

Node Zero is a specialization of the existing AXIOM host-install productization direction, not a third authority model.

It must preserve these existing invariants:

- installation grants no Mesh, governance, application, agent, storage, compute, or external-effect authority;
- runtime privilege is separate from install-time privilege;
- AXIOM services run as dedicated unprivileged identities;
- data and secrets are separated;
- public ingress is disabled by default;
- external egress is deny-by-default for AXIOM services and workloads unless an explicit policy grants a narrow path;
- Mesh enrollment is an explicit, separate step;
- consequential AXIOM effects continue to use the `Gateway -> Hypervisor -> Sandbox -> Grid` authority path;
- updates bind to exact release inputs, are verified before activation, and retain a safe recovery path where compatibility permits;
- rollback must not silently restore stale authority, credentials, consent, or revocation state;
- every material host-security or custody mutation emits a non-secret receipt.

Node Zero also adopts the sovereign-host principle that the host remains locally sovereign over its own resources. Remote selection or Mesh admission can never force a locally disabled role or widen a local ceiling.

## 3. Scope

### 3.1 Included in the first implementation

1. Ubuntu 24.04 LTS x86_64 host baseline.
2. Deterministic host preflight and install planning.
3. Signed release/install-manifest verification reconstructed against current `main`.
4. A privileged installer executor that consumes only an already-verified plan and artifact set.
5. Dedicated AXIOM runtime users, groups, directories, service units, and permissions.
6. Host Guardian v0 service boundary and local profile/policy store.
7. cgroup v2/systemd resource ceilings for AXIOM services and the display workload.
8. Default-deny inbound networking and deny-by-default AXIOM-service/workload egress.
9. Existing Mesh production isolation semantics, including Linux network-boundary enforcement where applicable.
10. Local node identity generation and protected custody without automatic network admission.
11. Explicit Mesh enrollment request/approval flow.
12. Versioned AXIOM runtime release slots with active/previous generation switching.
13. Watchdog-driven service recovery and bounded restart behavior.
14. A local shelf-display workload with no required network access.
15. A local content directory containing book covers and a deterministic playlist/manifest.
16. Boot-to-display unattended operation.
17. Installation, update, rollback, recovery, health, and decommission receipts.
18. Disposable-VM validation before installation on Node Zero hardware.
19. A hardware evidence record for the actual Node Zero machine after successful installation.

### 3.2 Explicitly out of scope for Node Zero v0

- a forked kernel or AXIOM-maintained Linux distribution;
- custom Secure Boot keys or production measured/remote attestation claims;
- TPM dependence;
- full-disk encryption as a hard requirement on this low-sensitivity appliance node;
- custom A/B operating-system partitions;
- public listeners;
- general remote shell administration;
- remote agent execution;
- general distributed compute;
- storage-provider service;
- relay service;
- consensus or governance participation;
- personal-agent memory;
- legal, health, email, cloud-drive, biometric, or other private user corpus;
- model inference runtimes;
- automatic package or AXIOM release installation without verification and policy;
- production capability promotion based solely on this one machine.

Those exclusions are deliberate. Node Zero proves the host lifecycle and boundaries before expanding capability.

## 4. Layered architecture

```text
┌───────────────────────────────────────────────┐
│               Appliance workloads             │
│                                               │
│  shelf-display                                │
│  future separately admitted local workloads  │
├───────────────────────────────────────────────┤
│                 AXIOM-MESH                    │
│                                               │
│  Gateway -> Hypervisor -> Sandbox -> Grid     │
│  node identity / enrollment / health          │
│  capability and evidence boundaries           │
├───────────────────────────────────────────────┤
│              AXIOM Host Guardian              │
│                                               │
│  local host profile and willingness           │
│  cgroup/systemd resource ceilings             │
│  service supervision                          │
│  network-policy projection                    │
│  update / rollback controller                 │
│  host receipts                                │
├───────────────────────────────────────────────┤
│              Hardened Linux host              │
│                                               │
│  systemd / cgroup v2 / nftables / AppArmor    │
│  watchdog / protected filesystem boundaries   │
├───────────────────────────────────────────────┤
│              Ubuntu 24.04 LTS                 │
│                                               │
│  kernel / firmware / drivers / bootloader     │
└───────────────────────────────────────────────┘
```

The display application is never part of Mesh authority. It is an appliance workload with a narrow local-output permission.

## 5. Boot and failure model

The normal boot topology is:

```text
UEFI/firmware
  -> Ubuntu bootloader/kernel
  -> local filesystems + systemd
       ├── shelf-display unit
       └── AXIOM Host Guardian
             └── AXIOM runtime units
```

The display is intentionally outside the Mesh dependency chain. Guardian failure keeps AXIOM runtime participation failed closed or quarantined but does not prevent the display from starting from its local last-known-good content generation.

The first physical fail-safe invariant is:

> Loss of Internet connectivity, loss of all remote AXIOM services, failure of Mesh enrollment, crash of the local AXIOM runtime, or failure of Host Guardian must not prevent the host from booting and cycling the last-known-good local book-cover set.

The second invariant is:

> A failed or incompatible AXIOM update must leave either the previous verified runtime generation active or the machine in a local recovery state; it must never activate an unverified partial generation.

The third invariant is:

> Failure of the display workload must not widen Mesh, network, filesystem, or host authority.

## 6. Host filesystem and custody layout

Node Zero uses the ordinary Ubuntu root filesystem for v0, while AXIOM state is separated structurally so a later immutable/A-B host image can preserve the same logical contracts.

Canonical locations:

```text
/opt/axiom/
  releases/<release-id>/       immutable deployed runtime generations
  current -> releases/<id>/    active-generation pointer
  previous -> releases/<id>/   bounded rollback pointer

/etc/axiom/
  host/                         non-secret local host policy
  services/                     non-secret service configuration

/var/lib/axiom/
  grid/                         durable AXIOM state
  guardian/                     local Guardian state and receipts
  display/                      local display manifest and content cache
  install/                      non-secret install/update receipts

/var/lib/axiom-secrets/
  node/                         node/service private credentials
  data/                         local data-protection material if required

/run/axiom/
  sockets/                      permission-restricted local IPC
  status/                       ephemeral readiness/health state

/var/log/axiom/
  bounded non-secret service logs
```

Secrets must never appear in repository content, image layers, shell history, journald fields intentionally emitted by AXIOM, install receipts, telemetry, or display content.

`/var/lib/axiom-secrets` is root-owned with explicit per-service projection. The display workload receives no AXIOM Mesh private keys.

Because v0 permits unattended boot without requiring full-disk encryption or TPM sealing, Unix permissions alone are **not** claimed to protect node credentials from an attacker who steals the disk and performs offline access. The v0 node identity must therefore remain narrowly authorized and revocable, with key rotation/revocation included in operations. Full-disk encryption and hardware-backed sealing remain later assurance upgrades or may be enabled on Node Zero if the hardware/operator workflow supports them without defeating unattended recovery goals.

## 7. Linux identities and service isolation

The implementation should prefer distinct service identities over one broad `axiom` user where the existing service-unit topology supports it. At minimum:

- AXIOM Mesh runtime identity or current per-unit service identities;
- `axiom-guardian` host service identity where privilege separation permits;
- `axiom-display` workload identity;
- a short-lived privileged installer/update helper invoked only for host mutations.

Systemd units must use the strongest practical subset of:

- `NoNewPrivileges=yes`;
- dropped Linux capabilities;
- explicit capability bounding sets where privilege is unavoidable;
- read-only system/runtime paths;
- explicit writable path allowlists;
- `PrivateTmp=yes` or equivalent isolation;
- `ProtectSystem=` and `ProtectHome=` hardening;
- `RestrictSUIDSGID=yes`;
- syscall/address-family restrictions where compatible;
- memory, CPU, process, and file-descriptor ceilings;
- watchdogs and bounded restart rate limits;
- separate local IPC sockets with filesystem permissions;
- network denial unless the service has an explicit network requirement.

No appliance workload inherits Mesh credentials or Grid filesystem access merely because it runs on the same host.

## 8. Host Guardian v0

Node Zero makes Host Guardian a foundational host layer rather than optional application logic.

The implementation must reconstruct and consume the accepted semantics of the existing draft `host.profile.v1`, local contribution policy, sovereignty reserve, and Guardian states against current `main`; it must not merge stale host branches wholesale or create parallel semantics.

Required Guardian states:

- `NORMAL`
- `DEGRADED`
- `QUARANTINED`
- `RECOVERY`

For Node Zero, Guardian primarily governs local service/resource admission and health. Network or remote requests may only deny/narrow what the host is already willing to do; they may never turn on a locally disabled capability.

The initial Shelf Node local policy should advertise no voluntary shared compute/storage/relay contribution. It may expose only the minimum local node-health and interface-endpoint semantics required by the explicitly approved enrollment profile.

## 9. Network model

### 9.1 Inbound

Host firewall default:

- loopback: allowed;
- established/related traffic: allowed;
- public/LAN unsolicited inbound: denied by default;
- no SSH listener enabled by the AXIOM profile;
- no Mesh public listener enabled by installation alone.

Any later administration listener requires its own reviewed profile and explicit owner enablement.

### 9.2 Outbound

AXIOM service and appliance-workload egress is deny-by-default.

The implementation should preserve the existing Linux deny-egress namespace/supervisor protections for Mesh units that require zero external egress.

Networking is projected per service class:

- `shelf-display`: no network required;
- Grid/local durable services: local IPC only unless an existing reviewed contract says otherwise;
- Gateway/network adapter: only explicit enrollment or approved Mesh destinations/protocols;
- host time/update helper: explicit host-maintenance network authority, separate from Mesh authority;
- installer: no ambient network authority after artifacts have been acquired and verified.

Node Zero must continue displaying content with the physical Ethernet cable disconnected.

## 10. Installation model

The fresh-host install is split into non-collapsible stages.

### Stage 0 — Ubuntu base

Install supported Ubuntu 24.04 LTS x86_64 using ordinary verified installation media. Apply current firmware and security updates before AXIOM activation.

### Stage 1 — Preflight

A non-mutating planner records:

- OS identity/version;
- architecture;
- firmware/boot mode;
- CPU and memory;
- disk/filesystem capacity;
- cgroup v2/systemd availability;
- required kernel isolation features;
- graphics/display presence where detectable;
- network interface state;
- clock status;
- conflicting AXIOM state.

Unsupported or ambiguous conditions fail before privileged mutation.

### Stage 2 — Release verification

Reconstruct the signed release/install-manifest verifier from the accepted #1282 direction against current `main`.

It must establish exact signed release intent and compatibility but must not itself grant install or Mesh authority.

Actual artifact bytes are digest/signature checked independently before host mutation.

### Stage 3 — Deterministic install plan

Reconstruct the non-mutating #1281 host planner semantics against current `main` and extend them with a `shelf-node` specialization.

The plan must enumerate all intended:

- package/toolchain changes;
- users/groups;
- directories and permissions;
- service units;
- firewall/network-policy changes;
- release slots;
- secrets to be generated locally;
- Guardian policy;
- display workload;
- receipts and recovery surfaces.

Unknown actions are rejected rather than silently ignored.

### Stage 4 — Privileged executor

A small privileged helper consumes only a verified immutable plan and verified local artifact set.

It must be idempotent where practical and maintain a mutation journal sufficient to identify a resumable or rollback state after interruption.

It does not accept arbitrary shell fragments from a release manifest.

### Stage 5 — Local provisioning

Generate local node/service credentials into protected secret custody. Create durable state and service configuration. No network enrollment occurs here.

### Stage 6 — Readiness

Start local services, run applicable doctor/readiness/security checks, verify display startup, then emit a non-secret installation receipt bound to the exact release and install plan.

### Stage 7 — Optional Mesh enrollment

Enrollment is a separate explicit owner action after the local node is healthy.

## 11. Mesh identity and enrollment

Node Zero has a device/node identity distinct from:

- the human owner;
- any persistent agent/entity;
- the operating-system installation;
- a particular runtime release;
- display content;
- credentials used by external services.

The private node key is generated locally and never committed or embedded in an image.

Installation creates **eligibility to request admission**, not admission.

The enrollment flow must produce a request bound to:

- node public identity;
- exact installed AXIOM release;
- host-profile version;
- requested bounded role set;
- current local Guardian policy digest;
- current health/readiness evidence;
- explicit owner approval.

Admission may be refused, revoked, or expire without affecting the local display function.

The initial role set should remain intentionally narrow. Node Zero must not advertise storage, compute, relay, agent-execution, governance, or other contribution roles in v0.

## 12. Release update and rollback

Node Zero v0 uses **application/runtime release slots**, not custom operating-system A/B partitions.

New AXIOM runtime releases are staged under:

`/opt/axiom/releases/<immutable-release-id>`

Update sequence:

1. resolve channel/request to an exact signed release;
2. verify manifest/trust and artifact bytes;
3. check host/profile/data compatibility;
4. create and verify any required durable-state backup;
5. stage new runtime without replacing the active generation;
6. run preactivation checks;
7. stop only affected AXIOM units;
8. switch `current` atomically;
9. start and verify the new generation;
10. retain one bounded `previous` generation when rollback is data-safe;
11. emit exact transition receipt.

If readiness fails before the compatibility deadline, return to the previous verified generation when safe.

Rollback is forbidden when the previous runtime cannot safely interpret current durable state. In that case recovery must use an explicitly chosen verified backup/rebuild path.

Ubuntu operating-system updates remain a distinct host-maintenance lane. Their authority is not inherited by AXIOM Mesh updates.

## 13. Display workload

The Shelf Display is a deliberately simple appliance workload.

Requirements:

- automatically starts after boot without interactive login;
- uses the configured vertical display and preserves portrait orientation;
- cycles local JPEG/PNG/WebP cover assets from a validated local manifest;
- deterministic fallback ordering;
- configurable display duration and transition behavior;
- no Internet dependency;
- no Mesh private credentials;
- no write access to AXIOM durable state or secrets;
- read-only access to its approved content set plus minimal local state for playlist position/health;
- bounded CPU, memory, process, and log usage;
- automatic restart with rate limiting;
- a built-in last-known-good fallback playlist.

The first implementation should favor a lightweight kiosk/image-rendering stack over a full general desktop. The precise renderer is an implementation choice as long as it satisfies the workload contract and hardware tests.

A future content-sync adapter may update the cache, but content acquisition remains separate from rendering. A sync failure never empties or invalidates the last-known-good playlist.

## 14. Display content integrity

Display content is low sensitivity but should still be deterministic and corruption resistant.

The display manifest should bind at least:

- manifest schema/version;
- ordered asset identifiers;
- local relative paths;
- asset SHA-256 digests;
- intended display duration or default;
- optional human-readable title;
- activation timestamp/version;
- manifest digest.

New content is staged separately, validated, then atomically promoted as the active content generation. Invalid or partial content updates are discarded without disturbing the current generation.

## 15. Observability and receipts

Node Zero must provide a local status command/surface that can answer without external connectivity:

- installed host-profile version;
- active AXIOM release ID and digest;
- previous rollback generation, if valid;
- Guardian state;
- Mesh enrollment state;
- service readiness;
- current display-content generation;
- disk/resource pressure;
- last successful update/rollback/recovery action;
- last boot and watchdog recovery summary.

Receipts are non-secret, integrity-bound records for material lifecycle actions. They may include exact digests, reason codes, timestamps, state transitions, and success/failure outcomes but not private keys or bearer credentials.

## 16. Recovery

Node Zero v0 has two recovery layers.

### Layer A — automatic service recovery

Systemd/watchdog recovery handles:

- crashed display workload;
- crashed AXIOM service;
- bounded restart loops;
- transition to Guardian `DEGRADED` or `QUARANTINED` when a service cannot recover safely.

The display may remain operational while Mesh is quarantined.

### Layer B — local host recovery

The initial recovery path uses standard Ubuntu recovery/live media plus AXIOM recovery tooling rather than a custom partition.

Recovery tooling must be able to:

- inspect installation receipts without starting AXIOM;
- validate release-slot integrity;
- select a safe previous AXIOM runtime generation;
- validate and restore a supported encrypted/integrity-bound backup;
- quarantine node credentials before risky repair when required;
- preserve display content independently where possible;
- distinguish runtime repair from data/key destruction.

A later immutable AXIOM host image may add dedicated A/B root and recovery partitions while retaining these same higher-level contracts.

## 17. Security posture for Node Zero

Because Node Zero has a public-facing physical display but no reason to expose network services, the preferred posture is unusually narrow:

- no user browsing;
- no email;
- no general desktop session;
- no cloud-drive mount;
- no private corpus;
- no inbound administration listener by default;
- no display network access;
- no ambient Mesh egress;
- least-privilege service users;
- OS security updates through the separate host-maintenance lane;
- AXIOM updates only from verified exact release input;
- local physical recovery remains possible.

This machine should be safe to wipe and rebuild without loss of irreplaceable user information.

The v0 theft boundary is explicit: without required FDE/TPM sealing, physical possession of the storage device may expose locally stored node credentials to an offline attacker. Therefore Node Zero must hold no high-value user corpus or broad Mesh authority, and its node identity must support prompt quarantine/revocation and replacement. The project must not describe v0 as protecting secrets against offline disk theft unless FDE or equivalent protection is actually enabled and tested on that machine.

## 18. Testing strategy

Implementation follows test-first development.

### 18.1 Contract/unit tests

Add adversarial tests for:

- unsupported OS/architecture;
- install-plan mutation laundering;
- install-grants-authority laundering;
- public-ingress enablement;
- unknown host actions/fields;
- unsigned/stale/revoked/wrong-role release signer;
- artifact digest mismatch;
- partial secret generation;
- excessive service privileges;
- display access to Mesh secrets;
- display network egress;
- automatic Mesh enrollment;
- role widening beyond local Guardian policy;
- rollback across incompatible durable-state generation;
- invalid display-content manifest or asset digest;
- recovery that would silently resurrect stale authority.

### 18.2 Disposable-host integration tests

Run the profile against clean Ubuntu 24.04 x86_64 disposable hosts and prove:

1. install starts without a pre-existing repository checkout;
2. exact users/directories/units/network changes match the plan;
3. secrets are protected and absent from logs/receipts;
4. reboot reaches local readiness;
5. display workload starts automatically;
6. disconnecting network does not stop display;
7. killing Mesh services does not stop display;
8. killing Host Guardian keeps Mesh failed closed/quarantined while display remains available;
9. killing display does not widen Mesh authority and display restarts safely;
10. valid update activates exact new release;
11. tampered update is rejected before activation;
12. safe rollback returns to exact prior release;
13. unsupported rollback fails closed;
14. interrupted install/update leaves an inspectable recoverable state;
15. decommission can remove runtime without silently destroying data/keys unless explicitly selected.

### 18.3 Physical Node Zero drills

After VM validation, run and record on the actual shelf machine:

- cold boot and repeated reboot;
- 24-hour continuous display;
- Ethernet disconnect/reconnect;
- router/Internet outage;
- forced display-process kill;
- forced AXIOM service kill;
- forced Guardian failure with Mesh fail-closed behavior;
- bounded disk-pressure test;
- update and safe rollback;
- power loss during normal operation;
- power loss during staged-but-not-activated update;
- manual local recovery inspection.

Hardware compatibility claims are limited to hardware actually tested.

## 19. Implementation order

The implementation must proceed in dependency order:

1. reconstruct/forward-port the non-mutating host planner semantics from #1281 onto current `main`;
2. reconstruct/forward-port the signed install-manifest verifier semantics from #1282 onto that current base;
3. converge accepted Host Guardian/local-sovereignty semantics from #1456 without importing stale branch history wholesale;
4. add `shelf-node` host/profile schema and contracts;
5. implement deterministic privileged host executor with mutation journal;
6. add systemd/cgroup/network hardening projection;
7. add release-slot activation/rollback controller;
8. add local node identity provisioning and explicit enrollment request surface;
9. add independent shelf-display workload and content-generation contract;
10. add disposable Ubuntu install/reboot/update/recovery tests;
11. build a candidate offline/online installation bundle from the same exact deployment specification;
12. install on Node Zero hardware and record hardware evidence;
13. update current threat model, operations, recovery, installation, non-claims, and readiness documentation;
14. only then consider promotion of any installer/host capability status.

## 20. Promotion criteria

Node Zero being useful is not sufficient for production promotion.

The first host profile may advance only when executable evidence demonstrates, on an exact release:

- clean-host installation from verified artifacts;
- deterministic mutation surface;
- service least privilege;
- no secret leakage;
- deny-by-default network behavior;
- explicit enrollment separation;
- reboot persistence;
- local display independence from Mesh/network/Guardian availability;
- valid update and tampered-update rejection;
- safe rollback or explicit restore requirement;
- local recovery;
- decommission behavior;
- current threat-model and operations documentation;
- protected CI/disposable-host reproduction;
- real Node Zero hardware evidence;
- remaining non-claims stated explicitly.

One successful household machine remains pilot evidence, not proof of universal hardware compatibility or production-grade decentralized operation.

## 21. Future evolution

If Node Zero proves stable, the same logical profile can evolve without changing Mesh authority semantics.

### H1 — immutable host image

- read-only system image;
- A/B root generations;
- dedicated recovery environment;
- signed image updates;
- boot-success counters and automatic fallback.

### H2 — stronger boot trust

Where hardware permits and evidence warrants:

- Secure Boot posture;
- measured boot;
- TPM-backed key sealing;
- local attestation evidence.

These are later host-assurance improvements. They do not grant Mesh authority by themselves.

### Additional device profiles

The shared AXIOM Host foundation can later support:

- personal/local interactive node;
- infrastructure/support node;
- compute node;
- storage/backup node;
- room/interface endpoint;
- cognition-provider node.

Each remains a bounded profile over the same authority and host-sovereignty principles.

## 22. Completion definition

Node Zero v0 is complete when an ordinary Ubuntu 24.04 LTS x86_64 machine can be converted from a clean supported host into a recoverable AXIOM Shelf Node using an exact verified installation bundle; boots unattended; continuously displays the last-known-good local book-cover set; runs the bounded AXIOM Mesh foundation under least-privilege host controls; does not auto-enroll or auto-grant authority; survives ordinary process, Guardian, network, update, reboot, and power-failure drills; and produces enough exact evidence to reproduce and audit what happened.

Until those conditions are demonstrated, this remains an architectural and implementation candidate, not a production host claim.
