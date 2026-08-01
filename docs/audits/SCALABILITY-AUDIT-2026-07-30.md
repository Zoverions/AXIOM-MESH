# AXIOM-MESH Scalability Audit

**Audit date:** 2026-07-30  
**Audited revision:** `2ab099be6c8035d73dfe8d0118a9e87afa0ef2bf`  
**Kernel version:** `0.12.0-dev.3`
**Status:** architecture and source audit; implementation work required  
**Scope:** supported four-service kernel, durable Grid, internal transport, public API, exports, backups, observability, and capacity evidence

## Executive conclusion

AXIOM-MESH currently has a strong correctness and fail-closed foundation for a
single local node, controlled pilots, and small trusted groups. It is not yet
structurally bounded for a long-lived high-history node, a managed multi-user
node, sustained high request volume, or horizontal service replication.

The principal limit is not cryptography. It is unbounded work tied to total
history or tenant data, synchronous single-threaded database work, full-response
buffering, and per-hop transport setup.

The correct direction is **not** to replace the local Grid with a distributed
database prematurely. Preserve the local-first single-writer authority model,
but make every normal operation bounded. Scale the network by adding
independently owned Grids and explicit exchange rather than by turning one Grid
into an ambient global database.

### Current safe claim

The current build is suitable for:

- correctness and security validation;
- a single-user or small-group local deployment at modest traffic;
- controlled pilot measurement;
- bounded causal exchange between independently owned Grids.

The current build is not yet suitable for claiming:

- predictable restart time after years of event growth;
- large managed multi-tenant hosting;
- high-throughput synchronous intent processing;
- horizontally replicated Gateway, Hypervisor, Sandbox, or Grid services;
- large exports or backups with memory usage independent of dataset size;
- broad Circles or federation at production scale.

## Scale model

Scalability must be measured along separate axes. A single throughput number is
not sufficient.

1. **History scale** — total events and database age.
2. **State scale** — memory objects, edges, journals, approvals, consents,
   nodes, schedules, imports, and sync records.
3. **Principal scale** — users, agents, services, API credentials, and tenants.
4. **Request scale** — sustained and burst request rates, concurrency, and
   mixed read/write traffic.
5. **Artifact scale** — export, import, backup, restore, and evidence package
   size.
6. **Network scale** — independently owned Grids, Circles, admitted nodes, and
   causal exchange.
7. **Operator scale** — restart, recovery, rotation, investigation, migration,
   and incident workload.

## Findings

### S-01 — Full materialized-state rebuild remains tied to total history

**Severity:** Critical for long-lived nodes  
**Affected code:** `mesh/src/grid/_store-core.mjs`

Grid initialization verifies the chain, deletes every materialized table, loads
all events with `.all()`, and replays the complete event history inside one
`BEGIN IMMEDIATE` transaction. This has four compounding effects:

- startup memory grows with the complete event table;
- startup time grows linearly with all historical events;
- the rebuild holds a long write transaction;
- every crash, deployment, rotation, or host restart becomes slower as the node
  succeeds and accumulates history.

Signed checkpoints correctly bound normal cryptographic verification, but do
not bound materialized-state replay. The distinction is important: checkpoint
work must not be treated as closure of startup scalability.

**Required remediation**

- Add a signed or digest-bound materialization anchor containing schema version,
  last applied event sequence, materialized-state digest/version, and build
  compatibility.
- On normal startup, validate the anchor and replay only the suffix after the
  recorded sequence.
- Keep full genesis replay as an explicit offline repair/audit command.
- Replace `.all()` with streaming iteration for any full rebuild path.
- Build replacement state in shadow tables or a replacement database and swap
  atomically, rather than deleting the live materialization before replay.
- Record startup phase timings and replayed-event count.

**Acceptance evidence**

- Restart cost is proportional to the unmaterialized suffix, not total history.
- Peak RSS remains bounded across 100 thousand, 1 million, and 10 million event
  histories.
- Forced full rebuild remains deterministic and produces the same state digest.
- Corrupt, missing, stale, or schema-incompatible anchors fail closed or select
  the explicit repair path.

### S-02 — Protected-column migration scans and decrypts complete tables on every startup

**Severity:** High  
**Affected code:** `mesh/src/grid/_store-core.mjs`

`migrateProtectedColumns()` loads all protected columns from every mapped table
and decrypts every already-protected value during every Grid startup. Even when
there is no migration to perform, startup work grows with all stored protected
state.

**Required remediation**

- Track protected-storage format and migration completion by schema migration.
- Run each transformation once, under an explicit journaled migration.
- Validate a bounded sample or integrity digest during routine startup rather
  than reopening every protected value.
- Provide an explicit offline deep protected-state verification command.

**Acceptance evidence**

- A no-op restart performs no table-wide protected-column scan.
- Interrupted migration resumes or rolls back deterministically.
- Wrong-key and corrupt-ciphertext negative tests remain fail closed.

### S-03 — Checkpoint history is a growing JSON array rewritten from one metadata row

**Severity:** High over long histories  
**Affected code:** `mesh/src/grid/_store-checkpoints.mjs`

Every event append calls `ensureChainCheckpoint()`. That path reads and parses
the complete checkpoint history JSON array. When a new checkpoint is created,
the complete array is cloned, canonically serialized, and rewritten into one
`meta` value. The individual checkpoint interval is 10,000 events, but the
metadata design still creates work proportional to checkpoint count on routine
writes and quadratic cumulative rewrite cost over the life of the node.

**Required remediation**

- Store checkpoints as rows in a strict `chain_checkpoints` table.
- Use sequence as the primary key and index checkpoint digest.
- Keep only `last_checkpoint_seq` and `last_checkpoint_digest` as scalar meta
  values.
- Insert one new checkpoint transactionally without reading or rewriting prior
  checkpoint rows.
- Stream checkpoint-history verification when full history inspection is
  explicitly requested.

**Acceptance evidence**

- Routine append checkpoint-distance checks are O(1).
- Creating checkpoint N does not serialize checkpoints 1 through N-1.
- Rotation, rollback, boundary tamper, and missing-key coverage remains intact.

### S-04 — Production internal calls establish a new TLS connection for every hop

**Severity:** Critical for throughput  
**Affected code:** `mesh/src/lib/client.mjs`

The mTLS client uses `https.request()` with `agent: false`. Every internal call
therefore performs a new TCP and TLS 1.3 connection rather than reusing a bounded
keep-alive pool.

A successful low-risk intent currently requires multiple synchronous hops:
Gateway to Hypervisor, Hypervisor to Grid for active policy, Hypervisor to Grid
for acceptance, Hypervisor to Sandbox, and Hypervisor to Grid for completion.
Consequential actions can add approval and artifact calls. Repeating transport
setup on each hop amplifies CPU use, latency, file-descriptor churn, and tail
latency.

**Required remediation**

- Create one bounded keep-alive `https.Agent` per trusted audience and active
  transport generation.
- Set explicit maximum sockets, maximum free sockets, idle timeout, request
  timeout, and rotation drain behavior.
- Drain old pools during certificate rotation; do not permit a pool to outlive
  its credential generation.
- Measure handshake count, connection reuse, active sockets, queued requests,
  and connection failures.

**Acceptance evidence**

- Warm traffic reuses authenticated connections.
- Certificate rotation creates a new pool and drains the old one without trust
  overlap beyond policy.
- Load tests show bounded sockets and no unbounded request queue.

### S-05 — Trusted service keys are read and parsed from disk for every signed request

**Severity:** High  
**Affected code:** `mesh/src/lib/identity.mjs`

`verifySignedRequest()` calls `loadTrustedKey()` on each internal request. That
performs filesystem I/O and public-key parsing in the hot path. This is
unnecessary when the trusted generation is unchanged and compounds the
per-request TLS cost.

**Required remediation**

- Load trusted service keys into an immutable in-memory generation at startup.
- Make rotation atomically publish a new trust generation.
- Bind caches and connection pools to the same generation identifier.
- Preserve exact key-ID validation and fail closed on unknown generations.

**Acceptance evidence**

- No trust-file read occurs in steady-state request verification.
- Rotation and rollback tests prove immediate, deterministic generation change.

### S-06 — Replay protection has an O(n) hot-path sweep and a low fixed ceiling

**Severity:** High  
**Affected code:** `mesh/src/lib/identity.mjs`

`ReplayGuard.use()` scans all retained nonces to remove expired entries on every
request. It rejects all new requests when 10,000 entries are occupied. With the
default replay window, this creates a relatively low hard ceiling for signed
internal requests, and one user intent produces several such requests.

The guard is process-local, so it also cannot safely support horizontal service
replicas without a routing or shared-replay design.

**Required remediation**

- Replace full-map expiry scans with an expiry heap, timing wheel, or bucketed
  time windows.
- Derive capacity from the declared maximum signed request rate multiplied by
  the replay window and safety margin.
- Emit occupancy, rejection, expiry-lag, and high-water metrics.
- Before horizontal replication, define one of:
  - sticky routing by caller and nonce domain;
  - replica-specific audiences/keys;
  - a durable or shared replay authority.

**Acceptance evidence**

- Replay lookup and insert remain approximately O(1) or O(log n).
- Sustained target load cannot fill the guard under the declared replay window.
- Actual replay and saturation remain distinguishable in evidence.

### S-07 — Public authentication is linear in configured credential count

**Severity:** Medium now; High for managed nodes  
**Affected code:** `mesh/src/lib/public-auth.mjs`, `mesh/src/lib/config.mjs`

Bearer authentication hashes the supplied token and scans every known token
digest with timing-safe comparison. The credential registry is loaded as one
in-memory object and the file is capped at 1 MiB. This is acceptable for a
small operator registry but is not a scalable identity plane.

**Required remediation**

- Use direct digest-keyed lookup while preserving a fixed-shape failure path.
- Separate local operator/service tokens from end-user identity.
- Define a versioned authentication adapter contract for managed deployments.
- Support revocation, expiry, rotation, and tenant-scoped credentials without
  loading an unbounded registry into each Gateway.

**Acceptance evidence**

- Authentication work does not grow linearly with principal count.
- Revocation and rotation remain fail closed and auditable.

### S-08 — Rate limits are local, reset on restart, and diverge across replicas

**Severity:** High before horizontal Gateway scale  
**Affected code:** `mesh/src/gateway/server.mjs`, `mesh/src/lib/http.mjs`

IP and principal token buckets are process-local maps. They reset on restart,
evict old keys at fixed map limits, and would permit each Gateway replica to
grant a separate allowance. Remote address may also represent a local bridge or
proxy unless the ingress trust contract defines the actual client identity.

**Required remediation**

- Keep local buckets for single-node protection, but state that guarantee
  explicitly.
- Define trusted-proxy and ingress identity semantics before external exposure.
- For replicated Gateway, use partitioned sticky routing or a dedicated bounded
  rate-limit authority.
- Persist or deliberately reset limits with evidence during restart, rather
  than leaving the behavior implicit.
- Add overload admission control independent of abuse limits.

**Acceptance evidence**

- The effective limit is the same with one or multiple Gateway instances.
- Proxy identity spoofing is rejected.
- Load shedding protects Grid and Hypervisor before queue collapse.

### S-09 — Synchronous SQLite work blocks the Grid event loop and centralizes all writes

**Severity:** High  
**Affected code:** `mesh/src/grid/_store-core.mjs`

Grid uses `node:sqlite` `DatabaseSync`. All SQL, encryption, signature work,
materialization, export preparation, sync application, and many scans execute on
the service event loop. SQLite WAL supports useful read concurrency, but this
implementation exposes one synchronous Node process and one global write path.

The single writer is consistent with the local authority model. The problem is
unbounded or long-running work sharing that same loop.

**Required remediation**

- Preserve one authoritative write sequencer per Grid.
- Move database ownership to a dedicated worker thread or isolated state
  process with a bounded command queue.
- Classify commands as latency-sensitive, background, and maintenance.
- Add queue limits, deadline propagation, cancellation where safe, and explicit
  overload rejection.
- Do not perform artifact generation or full-history maintenance on the request
  loop.

**Acceptance evidence**

- Long reads, exports, backups, and maintenance do not stall health/readiness or
  normal intent commits.
- Queue depth and wait time are visible and bounded.
- Crash recovery preserves command ordering and evidence semantics.

### S-10 — Many list APIs are unbounded and fully buffered

**Severity:** Critical for state and principal growth  
**Affected code:** `mesh/src/grid/server.mjs`, `mesh/src/grid/_store-core.mjs`,
`mesh/src/lib/http.mjs`

Events are paginated, but capsules, proposals, nodes, schedules, consents,
approvals, memory, accounting, imports, appeals, storage offers, backups, and
other collections can return complete result sets. The Grid materializes arrays,
internal clients buffer responses, Gateway serializes the complete object, and
the HTTP layer buffers the complete response.

This creates memory and latency proportional to tenant or global state and makes
response-size limits fail unpredictably.

**Required remediation**

- Require stable cursor pagination on every collection.
- Use deterministic sort keys such as `(created_at, id)` or event sequence.
- Enforce server-selected maximum page sizes.
- Return `next_cursor`, `has_more`, and explicit truncation semantics.
- Add a separate streaming download contract for artifacts; do not use normal
  JSON collection routes for large payloads.

**Acceptance evidence**

- No collection endpoint can return an unbounded number of records.
- Memory and response bytes are bounded by page size.
- Cursor mutation/concurrency tests prove no duplicate or skipped records under
  the documented consistency model.

### S-11 — Query patterns contain missing indexes and N+1 work

**Severity:** High  
**Affected code:** `mesh/src/grid/migrations.mjs`, `mesh/src/grid/_store-core.mjs`

Representative problems include:

- actor-filtered event reads without a matching actor/sequence index;
- approvals filtered by approver/requester and creation order without matching
  composite indexes;
- consents filtered by subject/controller, status, expiry, and creation order;
- node admission and owner-limit checks without complete owner/status/expiry and
  public-key indexes;
- memory disclosure checking consent separately for each object;
- accounting loading entries separately for each journal;
- node schedule reads decoding all schedules globally and filtering in
  JavaScript;
- several list methods sorting unbounded result sets.

**Required remediation**

- Add query-plan tests for every supported API query.
- Add composite indexes matching predicates and stable cursor order.
- Replace N+1 consent checks with one scoped consent query and in-memory set or
  joined query.
- Load accounting journals and entries with bounded joined/batched queries.
- Query only one requester's schedules and only eligible node candidates.
- Track rows examined and slow-query evidence in scale drills.

**Acceptance evidence**

- `EXPLAIN QUERY PLAN` fixtures reject accidental full scans on scale-critical
  routes.
- Query latency grows with page size, not total unrelated tenant data.

### S-12 — Export creation is fully materialized in memory

**Severity:** Critical for portability at scale  
**Affected code:** `mesh/src/grid/_store-core.mjs`

Export currently collects all records into an array, serializes all lines,
joins the complete JSONL, creates a complete plaintext buffer, and may create a
second complete encrypted representation. Export generation occurs inline from
the Grid commit request.

Large exports can consume several times their final size in memory and block the
state service. The current internal response client also caps buffered upstream
responses at 1 MiB, making large completed bundles unsuitable for the normal
Gateway forwarding path.

**Required remediation**

- Convert export to an asynchronous durable job.
- Stream records in deterministic order to a temporary file while hashing.
- Define chunked recipient encryption or a versioned streaming envelope.
- Atomically publish the completed artifact and manifest.
- Serve artifacts through an authenticated streaming route with byte/range or
  chunk semantics.
- Keep manifest/status requests small and paginated.

**Acceptance evidence**

- Peak RSS is independent of export size within a fixed buffer allowance.
- Multi-gigabyte synthetic exports complete without blocking intent commits.
- Interrupted exports are resumable or cleanly discarded with evidence.

### S-13 — Backup and restore read the complete database into memory

**Severity:** Critical for durable-state growth  
**Affected code:** `mesh/src/grid/backup.mjs`

Backup copies SQLite to a temporary database, reads the complete database into a
Buffer, encrypts it into another complete representation, and writes the final
artifact. Verification and restore similarly retain complete database bytes.
Peak memory therefore grows by multiples of database size.

**Required remediation**

- Stream backup encryption and hashing from the SQLite backup file.
- Use a versioned chunked protected-artifact format with per-chunk integrity and
  a signed root manifest.
- Stream verification and decryption into a candidate restore file.
- Validate SQLite and evidence against the candidate file without retaining the
  full database in memory.
- Run backup as background maintenance with bounded I/O rate and queue priority.

**Acceptance evidence**

- Peak RSS remains bounded for databases larger than available process memory.
- Corrupt, reordered, omitted, replayed, and mixed-generation chunks fail
  closed.
- Backup load does not violate intent SLOs beyond the declared maintenance
  budget.

### S-14 — Long-running artifact work is performed inline with commit requests

**Severity:** High  
**Affected code:** `mesh/src/grid/server.mjs`

After recording an export or backup request, Grid creates the artifact before
returning the same commit response. This couples user request latency and state
service availability to artifact size and storage speed.

**Required remediation**

- Commit a durable requested job and return `202 Accepted` or the existing
  pending record promptly.
- Execute jobs from a bounded background worker under explicit policy and
  resource budgets.
- Commit completion/failure/cancellation evidence separately.
- Make retries idempotent and generation-bound.

**Acceptance evidence**

- Artifact request latency is bounded and independent of artifact size.
- Worker loss leaves an inspectable recoverable job state.

### S-15 — Intent execution has synchronous write and network amplification

**Severity:** High  
**Affected code:** `mesh/src/hypervisor/server.mjs`

A low-risk successful intent performs multiple sequential internal calls and at
least two full-durability Grid commits: accepted and completed. This is valuable
for evidence completeness, but it means throughput is limited by sequential
round trips and durable writes. Active policy overlays are also fetched and
potentially merged on each request.

**Required remediation**

- Preserve accepted and terminal evidence states.
- Cache active policy by a Grid-signed policy-generation digest and invalidate
  on generation change.
- Reuse internal connections and cached trust material.
- Introduce a bounded execution queue with explicit accepted/pending/completed
  API semantics for actions that need not complete in one HTTP request.
- Evaluate whether accepted plus terminal events can use safe group commit while
  retaining per-intent ordering and crash semantics.
- Define separate latency targets for synchronous deterministic built-ins and
  external/long-running adapters.

**Acceptance evidence**

- Policy fetches do not occur per intent when generation is unchanged.
- Queue saturation produces explicit bounded overload responses, not timeout
  collapse.
- Crash tests prove no authorized effect lacks a terminal or recoverable state.

### S-16 — Current capacity evidence is a smoke baseline, not a scale test

**Severity:** High for promotion claims  
**Affected code:** `mesh/src/slo-drill.mjs`

The current drill runs four warmups and 40 measured `system.echo` requests at
concurrency four. It is useful as a repeatable correctness baseline but cannot
establish saturation, long-history behavior, tenant isolation, memory slope,
artifact scaling, or soak stability.

**Required remediation**

Create a separate scalability evidence suite with:

- concurrency ladder and sustained-rate tests;
- mixed read/write/action profiles;
- event histories at 1 thousand, 100 thousand, 1 million, and 10 million;
- state cardinality growth per collection;
- 30- to 60-minute CI/nightly soak and longer pilot soak;
- restart after each history tier;
- export and backup under concurrent intent load;
- fault injection at queue, storage, worker, and transport boundaries;
- latency, throughput, RSS, CPU, WAL, file descriptors, queue depth, rows
  examined, TLS reuse, and replay-guard occupancy;
- slope assertions in addition to absolute thresholds.

**Acceptance evidence**

- Signed evidence binds data cardinalities, load profile, hardware limits,
  revision, configuration, and all measured results.
- Claims explicitly distinguish CI runner, dedicated pilot hardware, and live
  deployment observations.

### S-17 — Single-host supervision is fail-stop, not horizontally available

**Severity:** Medium for current claims; Critical before managed service claims  
**Affected code:** `mesh/src/supervisor.mjs`

The production supervisor starts one instance of each service and stops the
whole stack when any child exits unexpectedly. This is appropriate for the
current fail-closed single-host product, but it is not a high-availability
architecture.

**Required remediation**

- Keep the current topology as a supported sovereign single-node profile.
- Define a second managed-node topology rather than silently changing the
  existing trust model.
- Replicate stateless services only after replay, rate-limit, credential,
  idempotency, and routing semantics are replica-safe.
- Treat Grid high availability as a separate authority/consensus design, not a
  deployment toggle.
- Establish RPO/RTO and failover authority for each topology.

**Acceptance evidence**

- Product claims identify the selected topology and its failure model.
- No stateless replica can duplicate an effect or bypass one-use authority.
- Grid failover cannot create two authoritative writers.

### S-18 — Tenant boundaries are logical, not resource-isolated

**Severity:** High before managed multi-tenant deployment  
**Affected code:** cross-cutting

Owner/principal checks protect data access, but one SQLite database, one Grid
process, one write queue, one encryption key hierarchy, and shared artifact
storage create shared resource fate. A large or abusive tenant can consume
storage, queue time, backup bandwidth, nonce capacity, and database maintenance
budget.

**Required remediation**

- Prefer one Grid per person, household, Circle, or managed isolation unit.
- Define quotas for events, objects, artifact bytes, requests, concurrent jobs,
  and retained evidence.
- Add tenant-aware scheduling and fair queueing if multiple principals share one
  Grid.
- For stronger managed isolation, use separate processes, databases, keys, and
  storage roots rather than relying only on row ownership.

**Acceptance evidence**

- One tenant cannot exhaust another tenant's declared budget.
- Backup, restore, export, deletion, and incident scope map cleanly to the
  isolation unit.

## Recommended architecture boundary

### Scale up a sovereign node

Near-term work should make one Grid predictable and bounded:

- incremental startup and materialization;
- O(1) checkpoint append;
- pooled mTLS and cached trust generations;
- paginated indexed APIs;
- bounded worker queues;
- streaming artifacts;
- explicit quotas and overload control;
- growth and soak evidence.

### Scale out through independently owned Grids

Network growth should retain local authority:

- one authoritative writer per Grid;
- signed node and Circle identities;
- explicit selective exchange;
- causal conflict visibility;
- no ambient cross-Grid table access;
- no shared global bearer-token registry;
- no assumption that service replication equals authority replication.

Remote execution, federation, and consensus remain separate promotion domains.

## Proposed delivery sequence

### Phase 0 — Define scale contracts and evidence

1. Add deterministic scale-data generation.
2. Establish four declared deployment profiles:
   - personal sovereign node;
   - household/small Circle node;
   - managed isolated node;
   - multi-Grid exchange network.
3. Define proposed targets per profile for history, state, principals, request
   rate, artifact size, restart, backup, and recovery.
4. Add signed scale evidence schema and benchmark command.

### Phase 1 — Remove total-history startup work

1. Materialization anchors and suffix replay.
2. One-time protected-column migrations.
3. Checkpoint table migration.
4. Streaming explicit full rebuild.
5. Startup phase metrics and history-tier tests.

### Phase 2 — Bound the hot request path

1. mTLS keep-alive pools.
2. Trust-key generation cache.
3. scalable replay guard.
4. policy generation cache.
5. bounded Grid command queue and overload responses.
6. direct digest-key authentication for the local token registry.

### Phase 3 — Bound reads and artifacts

1. Cursor pagination for every collection.
2. Composite indexes and query-plan tests.
3. Remove memory/accounting/scheduling N+1 queries.
4. Asynchronous export and backup jobs.
5. Streaming download, encryption, backup, verification, and restore.

### Phase 4 — Prove capacity and failure behavior

1. Concurrency ladder.
2. mixed workload.
3. growth tiers through 10 million events.
4. soak and fault injection.
5. backup/export under load.
6. restart and recovery at every tier.
7. dedicated pilot-hardware evidence.

### Phase 5 — Select topology-specific scale-out

1. Keep sovereign single-host profile stable.
2. Define managed isolation unit and quotas.
3. Replicate stateless services only with replica-safe controls.
4. Treat Grid replication/consensus as a separate architecture and threat model.

## Immediate implementation queue

The highest-value first changes are:

1. **Materialized-state anchor and incremental startup.**
2. **Pooled mTLS plus in-memory trust generations.**
3. **Checkpoint rows instead of one growing JSON metadata value.**
4. **Pagination and matching indexes on all collection APIs.**
5. **Streaming asynchronous export and backup.**
6. **A real growth/concurrency/soak evidence harness.**

These changes improve scale without weakening local-first authority, evidence
completeness, or fail-closed behavior.

## Audit limitations

This review is based on the source and current repository evidence at the pinned
revision. It did not execute a fresh large-cardinality benchmark on dedicated
hardware. The current repository's 40-request SLO drill and existing operational
drills remain valid for their stated narrow scope; they are not treated as
capacity proof.
