# Agent Worktree Storage Plane

**Status:** research architecture and benchmark programme; no runtime capability or production claim  
**Created:** 2026-08-12  
**Applies to:** local agent sandboxes, future bounded Runtime Capsules, remote-execution research, scheduler capacity modelling, and development/test fleets  
**Current decision:** investigate storage sharing below the agent-visible isolation boundary; do not make deduplication a security primitive or a capacity guarantee

## Purpose

AXIOM-MESH is expected to support increasing numbers of isolated machine workers. A naive implementation can make every worker appear to require a complete physical copy of the same repository, dependency tree, runtime files, model/tool support files, and temporary build inputs. That is unnecessary when most worker state is identical and only a small writable delta is unique.

The architectural objective is:

> **Preserve logical isolation while eliminating avoidable physical duplication.**

This document defines the research boundary for doing that without weakening AXIOM's authority, evidence, recovery, sovereignty, or fail-closed rules.

No storage optimization described here is currently a supported AXIOM-MESH runtime capability. Nothing in this document changes `mesh/config/capabilities.json`, production policy, scheduler authority, sandbox authority, or the current production-readiness decision.

## Seed observation

The immediate research trigger is an external benchmark screenshot supplied on 2026-08-12. The benchmark reports a TypeScript repository checkout with roughly 15.8k tracked files, hundreds of Git worktrees, and a warm local pnpm store.

Reported values were:

| Profile | ext4 | plain XFS | VDO/XFS physical | Mac APFS |
|---|---:|---:|---:|---:|
| 215 clean worktrees | 50.7 GiB | 51.4 GiB | 27.6 GiB | 51.33 GiB |
| 125 dependency-installed worktrees | 75.5 GiB | 48.2 GiB | 24.4 GiB | 43.68 GiB |

Reported latency values were:

| Filesystem | single median | single p95 | eight in parallel |
|---|---:|---:|---:|
| ext4 | 0.639 s | 0.690 s | 0.671 s |
| plain XFS | 0.646 s | 0.695 s | 0.680 s |
| VDO/XFS | 0.647 s | 0.703 s | 0.702 s |
| Mac APFS | 1.263 s | 1.416 s | 7.134 s |

On those reported numbers, VDO/XFS used about 46% less physical storage than ext4 for the clean-worktree profile and about 68% less than ext4 for the dependency-installed profile, while the displayed latency difference against ext4 was small on the Linux runs.

These values are **seed evidence only**. They are not AXIOM benchmark results and are not sufficient to select a production storage stack.

The screenshot itself states that the Linux and later Mac runs used nearby but different commits. The installed-worktree XFS figure is also lower than its clean-worktree figure, which is a warning that allocation, run ordering, source differences, cache state, filesystem accounting, or another uncontrolled variable may be significant. The APFS result crosses operating system, kernel, filesystem, hardware, storage-controller, scheduler, Git build, and potentially source-state boundaries. AXIOM MUST NOT describe it as an isolated APFS penalty without a controlled reproduction.

## Relevant upstream facts

The research programme starts from the following upstream behavior, which must still be reproduced on the exact pilot kernel and tools before promotion:

- Linux `dm-vdo` provides block-level deduplication, compression, zero-block elimination/thin provisioning behavior beneath a filesystem. Current kernel documentation states that it does **not** provide data-corruption protection itself and relies on integrity protection below it.
- `dm-vdo` processes data at 4 KiB deduplication granularity and has non-trivial metadata and RAM requirements. The current kernel documentation describes fixed memory plus block-map, logical-size, physical-size, and deduplication-index costs.
- Git linked worktrees share common repository state while retaining per-worktree state such as `HEAD` and index data. This is useful for trusted development workflows, but the shared repository control plane is not automatically an isolation boundary for mutually distrusting agents.
- OverlayFS permits multiple mounts to share lower layers while using separate upper/work directories, and performs copy-up when a lower object requires writable access. The kernel documentation contains important integrity, xattr, metacopy, redirect, and underlying-layer mutation constraints.

Primary references:

- Linux kernel dm-vdo usage: <https://docs.kernel.org/admin-guide/device-mapper/vdo.html>
- Linux kernel dm-vdo design: <https://docs.kernel.org/admin-guide/device-mapper/vdo-design.html>
- LVM VDO manual: <https://man7.org/linux/man-pages/man7/lvmvdo.7.html>
- Git worktree manual: <https://git-scm.com/docs/git-worktree>
- Linux OverlayFS documentation: <https://docs.kernel.org/filesystems/overlayfs.html>

## Architectural rule: sharing is below authority

The storage plane MUST remain subordinate to the existing authority path:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Storage sharing may reduce the number of physical bytes occupied by identical logical data. It MUST NOT:

- make two agents share a writable authority namespace;
- give one sandbox visibility into another sandbox's paths, inode namespace, temporary state, credentials, outputs, or execution history;
- make storage-level deduplication count as identity, integrity, authorization, evidence, or trust;
- permit one worker to alter the immutable base seen by another worker;
- convert cache possession into authority to execute or trust cached content;
- allow storage pressure to widen permissions or silently fall back to a less isolated mode;
- allow a shared package store, Git object store, container layer, or filesystem lower layer to become an ambient secret channel;
- permit a worker to mutate common repository refs or configuration merely because its source objects are shared.

The governing separation is:

```text
logical isolation != physical duplication
```

but also:

```text
physical deduplication != security isolation
```

## Proposed storage-plane model

The preferred research model is a layered, immutable-base architecture rather than N complete mutable copies.

```text
                   +-----------------------------+
                   | AXIOM scheduler / Grid      |
                   | reservations + receipts     |
                   +--------------+--------------+
                                  |
                 exact source/runtime/dependency identities
                                  |
             +--------------------v--------------------+
             | content-identified immutable bases      |
             | repo | runtime | dependency/cache layers|
             +--------------------+--------------------+
                                  |
                  shared physically where permitted
                                  |
        +-------------------------+-------------------------+
        |                         |                         |
+-------v-------+         +-------v-------+         +-------v-------+
| agent A view  |         | agent B view  |         | agent C view  |
| private upper |         | private upper |         | private upper |
| private tmp   |         | private tmp   |         | private tmp   |
+-------+-------+         +-------+-------+         +-------+-------+
        |                         |                         |
        +-------------------------+-------------------------+
                                  |
                    evidence/artifact extraction
                                  |
                       +----------v----------+
                       | durable owned output |
                       | digests + receipts   |
                       +----------------------+
```

### Layer 1 — immutable source base

A worker receives a source view bound to an exact repository and commit/tree digest. The base is immutable for the lifetime of the sandbox.

The storage implementation may use a shared lower layer, reflinked clone, content-addressed image, block-level deduplication, or another measured mechanism. The logical contract is independent of the mechanism.

A worker MUST NOT be able to alter the source base used by another worker.

For untrusted or differently authorized agents, sharing Git objects is safer than sharing a writable Git administrative namespace. Linked Git worktrees are therefore a benchmark candidate, not the assumed security design. A production design SHOULD prefer one of:

1. an immutable repository image plus private writable overlay;
2. a per-agent Git administrative namespace backed by a read-only/shared object source;
3. an independently verified materialized source tree with no writable access to common refs/configuration.

Any optimization that shares writable refs, hooks, config, credentials, or lock files across mutually untrusted sandboxes fails this design.

### Layer 2 — dependency/runtime base

Dependencies and runtime support files are highly redundant across workers and are often larger than source code.

The preferred contract is a content-addressed, integrity-checked cache populated by a privileged cache service or build process and mounted/read through a non-authoritative interface. An agent may consume an already verified object but MUST NOT make an object trusted merely by writing it into a shared cache.

Cache entries SHOULD bind at least:

- package/runtime identity and exact version;
- package-manager lockfile digest or equivalent dependency-set identity;
- content digest;
- platform/architecture/ABI identity where applicable;
- provenance/source metadata;
- verification result;
- creation/last-validation time;
- vulnerability/revocation state where a promoted policy requires it.

The cache service and sandbox identities MUST be separate. Sandbox compromise must not imply cache-write authority.

### Layer 3 — private writable upper

Every agent receives a private writable layer for:

- modified source;
- generated files;
- local indexes;
- build output;
- package-manager mutable metadata;
- temporary state;
- checkpoints permitted by policy.

The upper layer MUST have an explicit hard quota. A dedupe forecast is not a quota.

Upper-layer identity SHOULD be bound to the workload/sandbox ID and its source/runtime profile. Reuse between workloads requires an explicit cache/checkpoint policy; accidental persistence is forbidden.

### Layer 4 — ephemeral scratch

Temporary files that are not evidence or declared artifacts SHOULD use separately bounded scratch storage with deterministic teardown behavior.

Scratch MAY trade durability for performance only when the workload contract explicitly permits loss on crash. It MUST NOT contain the only copy of a declared durable artifact, approval record, secret rotation state, or evidence obligation.

### Layer 5 — durable artifacts and evidence

Outputs promoted from a sandbox into owned durable state are not simply whatever remains in the writable layer. Promotion MUST be explicit.

A completion receipt SHOULD bind:

- workload/sandbox identity;
- owner/principal;
- source-base digest;
- runtime/dependency profile digest;
- storage profile/version;
- input digest;
- declared output paths or object IDs;
- output/artifact digests;
- observed logical bytes and physical-allocation metrics when available;
- quota/pressure events;
- cancellation/timeout/crash state;
- evidence chain anchor.

The storage optimization itself is not proof that output is correct.

## Candidate mechanisms

No single mechanism is selected yet. AXIOM SHOULD benchmark at least the following.

### A. Baseline ext4 or XFS materialized worktrees

Purpose: establish unoptimized correctness, latency, physical-byte, CPU, memory, and teardown baselines.

This is the control, not a recommended scale architecture.

### B. Git linked worktrees

Purpose: measure Git's own shared repository state versus repeated checkouts.

Security question: does the test expose shared writable repository administration to sandboxes? If yes, it is suitable only for trusted development workers or must be wrapped with a stronger namespace/mount design.

### C. OverlayFS shared immutable lower + private upper

Purpose: exploit shared lower content and copy-up only modified data.

Required review:

- unique upper/work directories per sandbox;
- no mutation of mounted lower layers;
- mount/xattr requirements;
- metacopy/redirect/index choices;
- fsync/durability behavior;
- container/runtime compatibility;
- teardown and orphan cleanup;
- hostile upper-layer fixtures.

### D. Filesystem-native reflink/clone path

Examples include XFS reflink-capable filesystems and other copy-on-write filesystems.

Purpose: create logically independent copies that share physical extents until modified.

Required review:

- clone support on the exact filesystem/device;
- copy-on-write amplification under dependency install/build workloads;
- quota/accounting semantics;
- snapshot/reflink corruption blast radius;
- fragmentation and long-run reclaim behavior.

### E. XFS or ext4 over LVM/dm-vdo

Purpose: keep ordinary filesystem semantics while deduplicating identical blocks below the filesystem.

Advantages to test:

- transparent block-level duplicate elimination across many materialized trees;
- compression and zero-block elimination where enabled;
- compatibility with ordinary filesystem tooling;
- potentially low application changes.

Costs/risks to test:

- CPU used for hashing/compression;
- RAM and on-disk metadata overhead;
- index sizing and deduplication-window behavior;
- 4 KiB block granularity;
- recovery/read-only behavior;
- physical-space exhaustion under thin provisioning;
- discard cost;
- interaction with encryption/integrity layers;
- one VDO failure domain affecting many logical sandboxes.

VDO MUST NOT be treated as an integrity layer. The kernel documentation explicitly states that integrity protection belongs below it.

### F. Btrfs/ZFS or equivalent copy-on-write host storage

Purpose: compare mature snapshot/reflink/compression approaches when the operating environment supports them.

These candidates add substantial operational semantics and therefore require independent analysis for quotas, recovery, corruption, scrubbing, memory behavior, fragmentation, send/receive, encryption, and operational familiarity. ZFS deduplication in particular MUST NOT be enabled merely because deduplication exists; memory and operational costs must be measured on the exact workload.

### G. Platform-native developer path such as APFS clone/copy-on-write

Purpose: preserve a usable Mac development path and determine whether explicit clone/reflink APIs materially change the external benchmark result.

APFS results MUST remain a separate platform profile. Cross-platform numbers must not be represented as filesystem-only causation.

## Dedupe domains and sovereignty

Global cross-user deduplication is **not** the default design.

Deduplication can create information and operational coupling even when file paths remain isolated. Timing, allocation, quota behavior, compression ratios, or cache hits can sometimes reveal whether data already exists. A corruption, index, operator, or recovery failure can also create a shared blast radius.

AXIOM SHOULD define an explicit **dedupe domain**. The initial safe policy is:

- deduplicate freely within immutable public/open-source runtime material;
- deduplicate within one owner's explicitly managed local execution pool where the owner accepts the shared failure domain;
- do not deduplicate private data across unrelated owners/tenants by default;
- do not use dedupe state as a user-visible oracle;
- do not expose physical-allocation differences to low-privilege sandboxes;
- keep secrets and high-sensitivity private payloads out of shared writable caches;
- require independent review before a managed multi-tenant service enables cross-tenant deduplication.

A future managed-node profile MAY define broader dedupe domains only with a documented side-channel, encryption, deletion, legal/privacy, quota, and incident model.

## Encryption and integrity ordering

Encryption placement changes whether deduplication is possible.

If every sandbox encrypts identical data independently before the dedupe layer sees it, the ciphertext will generally differ and physical deduplication will largely disappear. If encryption is below a trusted dedupe layer, the dedupe system can observe repeated plaintext blocks while the underlying device remains encrypted at rest.

That trade-off is security-sensitive. AXIOM MUST NOT select layer ordering from storage efficiency alone.

The benchmark programme SHALL test exact supported stacks, including the integrity/encryption mechanism intended for the target host. It SHALL record which component can observe plaintext, which keys it holds, which corruption classes are detected, recovery behavior, and the blast radius of compromise.

No design may weaken current encrypted-state or secret-custody guarantees merely to improve dedupe ratio.

## Scheduler and capacity semantics

Deduplication savings are opportunistic. They MUST NOT become a safety-critical capacity promise.

A worker can generate random, compressed, encrypted, adversarial, or simply unique data for which deduplication provides almost no benefit. Therefore:

- Grid reservations MUST enforce a hard physical or enforceable logical write ceiling independent of expected dedupe savings;
- a node MUST retain emergency headroom for metadata, journaling, recovery, evidence, and cancellation;
- placement MAY use historical dedupe/compression observations as a soft efficiency signal but not as proof of capacity;
- overcommit MUST have an explicit maximum and fail-closed behavior;
- a node approaching the hard storage floor MUST reject new work before filesystem/VDO exhaustion;
- already running workloads MUST receive deterministic pressure/cancellation handling rather than silent corruption or authority expansion;
- physical-byte accounting SHOULD distinguish base/shared/cache/upper/scratch/evidence categories where the storage stack permits it.

Future `Compute Node Profile` revisions SHOULD be able to advertise storage characteristics without turning them into trust claims, for example:

```text
storage_profile_id
filesystem
snapshot_or_overlay_mode
dedupe_mode
dedupe_domain_class
logical_capacity_bytes
hard_allocatable_bytes
reserved_recovery_bytes
observed_unique_write_budget_bytes
compression_enabled
integrity_profile
encryption_profile
measurement_timestamp
```

These are candidate fields only. They do not change the current draft schema.

## Failure model

The storage plane MUST explicitly test at least:

- host crash during sandbox creation;
- crash during OverlayFS copy-up or reflink write;
- crash during package/dependency materialization;
- VDO recovery and read-only transition;
- upper-layer quota exhaustion;
- physical backing-device low-space and full conditions;
- metadata/index exhaustion;
- out-of-memory pressure from dedupe/index/cache configuration;
- abrupt worker kill while files are open;
- concurrent teardown and creation;
- stale Git worktree metadata;
- shared-cache corruption;
- malicious cache entry and digest mismatch;
- lower-layer mutation attempt;
- cross-agent path, inode, xattr, hardlink, reflink, mount, and symlink escape attempts;
- orphaned mount/workdir cleanup;
- backup/restore with deduplicated blocks;
- storage-layer rollback while Grid/evidence state advances;
- key loss or corruption for any encryption/integrity layer;
- trim/discard storms;
- highly incompressible and non-deduplicable adversarial output.

Failure MUST produce explicit degraded/failed/uncertain state. It must not be hidden by retry loops that destroy evidence of partial work.

## Benchmark programme

### B0 — reproduce the seed workload

Construct a reproducible public or AXIOM-owned test repository profile with:

- exact source commit/tree digest;
- exact Git version;
- exact package manager and lockfile;
- exact Node/runtime version;
- exact dependency-store warm/cold state;
- exact kernel, filesystem, mount, VDO/reflink/overlay settings;
- exact host hardware and storage device;
- exact worktree count and installed-dependency count.

Reproduce clean and dependency-installed profiles on one Linux host before making any filesystem comparison.

A Mac/APFS run is a separate platform study.

### B1 — concurrency curve

Measure creation/materialization and representative agent operations at:

```text
1, 2, 4, 8, 16, 32, 64, 128, 215 workers
```

Use lower ceilings where hardware cannot safely reach the full profile. Record the tested ceiling rather than extrapolating silently.

For each point collect:

- p50/p95/p99 spawn/materialization time;
- throughput;
- CPU user/system/iowait;
- host and storage-layer RAM;
- logical bytes;
- filesystem-reported allocated bytes;
- device/VDO physical bytes where applicable;
- bytes written/read at block device;
- write amplification;
- dedupe ratio;
- compression ratio;
- cache hit/miss rate;
- queue depth and latency;
- teardown/reclaim latency;
- error/pressure events.

### B2 — mutation curve

The best storage design may change as workers modify more of their tree.

Run deterministic workloads that mutate approximately:

```text
0%, 0.1%, 1%, 5%, 10%, 25%, 50%, 100%
```

of materialized bytes, including many-small-file and few-large-file profiles.

This measures the point where copy-on-write, overlay, or block deduplication stops being advantageous.

### B3 — dependency/build profiles

Measure at least:

1. source checkout only;
2. package metadata only;
3. dependency installation from warm verified cache;
4. dependency installation from cold cache;
5. TypeScript/build output;
6. test output and coverage;
7. container/image build where permitted;
8. mixed read/write agent workload.

### B4 — security isolation

Run workers under distinct low-privilege identities and attempt to:

- enumerate another worker's paths;
- alter shared source/cache content;
- change shared Git refs/config/hooks;
- infer another tenant's private data from storage/quota/timing behavior;
- consume another worker's reflink/hardlink/xattr namespace;
- cause storage-pressure denial of service;
- escape through mount or symlink behavior;
- corrupt the shared cache/lower layer;
- poison a subsequent worker with persisted state.

Any cross-principal data disclosure or writable-authority coupling is a stop condition.

### B5 — crash and recovery

For each candidate stack, inject crashes at defined stages and verify:

- no source-base mutation;
- no cross-sandbox contamination;
- durable declared artifacts remain verifiable or explicitly fail;
- orphaned resources are discoverable and safely reclaimable;
- backing-store recovery does not fabricate successful workload completion;
- Grid evidence remains the authority for workload state.

### B6 — long-run fragmentation and reclaim

Short benchmarks can hide long-run pathologies. Run repeated create/mutate/delete cycles and record performance, fragmentation, physical-space reclaim, metadata growth, cache growth, and recovery time after thousands of sandbox lifecycles.

## Evaluation matrix

Each candidate SHOULD be scored on measured evidence, not feature count.

| Dimension | Required question |
|---|---|
| Isolation | Can one sandbox read, modify, infer, or persist into another sandbox? |
| Authority | Does storage sharing introduce a writable shared control plane? |
| Integrity | What corruption is detected, by which layer, and with what receipt? |
| Recovery | Can the host recover without fabricating workload success? |
| Density | What physical bytes are required at realistic worker counts? |
| Tail latency | What happens at p95/p99 under concurrent spawn and mutation? |
| CPU | What hashing/compression/copy-up cost appears under load? |
| RAM | What fixed and scaling memory overhead exists? |
| Write amplification | How much device writing is induced by copy-up/COW/dedupe? |
| Quotas | Are per-worker and host hard ceilings enforceable? |
| Reclaim | Is space returned predictably after sandbox deletion? |
| Portability | Which kernels/filesystems/hosts are supported and reproducible? |
| Operability | Can operators inspect, repair, back up, restore, and migrate it? |
| Evidence | Can storage profile and failure state be bound into workload receipts? |
| Sovereignty | Can dedupe/cache domains follow owner/trust boundaries? |

## Initial hypotheses

The programme starts with hypotheses, not conclusions.

### H1 — immutable lower + private upper will outperform full-copy sandboxes on high-redundancy workloads

Expected: large storage-density improvement while maintaining clear logical separation.

Disproof: copy-up, metadata, fragmentation, security, or teardown costs erase the advantage under representative mutation.

### H2 — VDO is a strong host-local density candidate for highly repeated materialized trees

Expected: transparent savings across source and dependencies without requiring every tool to use clone APIs.

Disproof: CPU/RAM/index/recovery costs, poor reclaim, thin-provisioning risk, or security/operational complexity outweigh physical savings.

### H3 — the best AXIOM architecture may combine mechanisms

Example candidate:

```text
immutable content-addressed base
    -> shared read-only dependency/source layers
    -> private OverlayFS/reflink upper
    -> filesystem on a measured VDO-backed host volume
```

This stack could compound logical copy-on-write with block-level elimination of remaining duplicate writes. It could also compound failure modes and complexity. It therefore requires direct measurement rather than assumed additive benefit.

### H4 — Git linked worktrees are an efficiency primitive, not an adversarial isolation primitive

Expected: useful for trusted local build/test workers.

Disproof of broader use: any worker with shared Git administrative write access can affect another worker's repository semantics.

### H5 — dedupe savings should improve placement efficiency but never expand admitted capacity beyond hard safety floors

Expected: historical unique-write ratios help ranking and packing.

Disproof: if safe prediction intervals are too broad or manipulable, scheduler use should remain telemetry-only.

## Recommended implementation sequence

### Stage S0 — architecture freeze

This document is the initial S0 output.

Before code is considered a runtime capability:

- define sandbox storage profile identity;
- define dedupe-domain policy;
- define hard quota and reserve semantics;
- define required receipt fields;
- define encryption/integrity candidate stacks;
- define adversarial isolation fixtures.

### Stage S1 — Linux benchmark harness

Build a root/operator-run laboratory harness outside the trusted kernel that can create, measure, and destroy each candidate storage profile.

The harness MUST require an explicit laboratory flag and MUST refuse to operate on the production Grid data directory.

Initial profiles:

```text
linux-xfs-baseline
linux-ext4-baseline
linux-overlay-xfs
linux-xfs-reflink
linux-vdo-xfs
linux-overlay-vdo-xfs
```

Only include a profile when the host proves the required feature exists.

### Stage S2 — evidence bundle

Each run emits a machine-readable benchmark bundle containing:

- source/runtime/lockfile identities;
- host/kernel/storage identities;
- mount/VDO/profile configuration;
- workload/concurrency/mutation profile;
- raw measurement artifact digests;
- summarized metrics;
- failures and exclusions;
- exact non-claims.

The bundle is benchmark evidence, not capability evidence unless a later capability specifically adopts it.

### Stage S3 — security campaign

Run cross-agent isolation, cache-poisoning, pressure, corruption, crash, and recovery fixtures.

Cross-owner deduplication remains disabled.

### Stage S4 — scheduler simulation

Feed observed unique-write distributions into a simulation of Grid placement. Compare:

- hard worst-case reservation;
- soft dedupe-aware ranking with unchanged hard floors;
- controlled overcommit with reserve;
- adversarial incompressible output.

No scheduler behavior changes until the simulation shows that efficiency signals cannot create unsafe admission.

### Stage S5 — controlled single-host pilot

If a candidate passes S1-S4, run it on a disposable non-production worker host with no production secrets and no authoritative Grid state.

Promotion requires repeated recovery, pressure, isolation, and long-run reclaim evidence on the exact deployment profile.

### Stage S6 — bounded runtime integration

Only after the current remote-execution/runtime-capsule authority work exists should storage profile selection become a bounded scheduler/runtime concern.

Storage selection MUST remain policy-constrained and must not allow an agent or model to request a weaker isolation mode than policy permits.

## Promotion gates

A storage profile may be considered for a supported worker/runtime path only when all applicable gates pass:

1. exact kernel/filesystem/storage configuration is pinned and reproducible;
2. logical isolation and writable-authority separation pass adversarial tests;
3. hard quota and reserve behavior is proven under zero-dedupe adversarial output;
4. crash/full-disk/OOM/index/corruption recovery is exercised;
5. integrity and encryption layering is independently reviewed;
6. cross-owner dedupe remains off unless separately reviewed and explicitly promoted;
7. benchmark results show a material density or latency/operability advantage over the baseline;
8. long-run create/mutate/delete cycles do not reveal unacceptable fragmentation or reclaim behavior;
9. backup, restore, migration, and decommissioning are documented and tested;
10. workload receipts can identify the storage profile without implying that profile proves correctness;
11. threat model and operator runbooks are updated;
12. capability registry changes occur only if an actual supported runtime behavior is implemented and evidenced.

## Current recommendation

AXIOM should **not** choose VDO as a universal storage layer yet.

It should treat the external result as strong enough to justify a dedicated benchmark track and should prefer a layered architecture that separates:

1. immutable shared content,
2. private per-agent writable state,
3. storage-level physical optimization,
4. durable owned artifacts/evidence.

The first Linux experiment should compare XFS baseline, XFS reflink, OverlayFS on XFS, VDO/XFS, and OverlayFS over VDO/XFS on the same host and source commit. That experiment directly tests whether savings come primarily from filesystem-level copy-on-write, block-level deduplication, or their combination.

The expected strategic benefit is substantial: if the result survives controlled testing, AXIOM can scale local and remote worker density by making hundreds of logically isolated execution environments share immutable bytes physically while preserving independent writable state and evidence. The optimization would therefore increase resource efficiency without changing the sovereignty model.

That is the design target. It remains a hypothesis until the benchmark and security gates pass.
