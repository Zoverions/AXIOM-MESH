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

**Remediation status (2026-09-24)**

- *Streaming:* full rebuilds in the core, social and sovereign-information
  layers now iterate the event log instead of loading it with `.all()`, so
  rebuild memory no longer grows with history.
- *Materialization anchors: built, not enabled.* `mesh/src/grid/materialization-anchor.mjs`
  records a per-layer anchor at clean shutdown, signed with the Grid identity
  and binding the layer fingerprint (layer version, kernel version, schema),
  chain position and a streaming digest of the layer's tables. With
  `AXIOM_GRID_MATERIALIZATION_ANCHORS=1`, a start whose anchor verifies skips
  replay; a missing, malformed, unsigned, stale, upgraded or mismatched anchor
  replays as before, and `AXIOM_GRID_FULL_REBUILD=1` forces replay.
- *Why it is disabled by default.* Replay on every start currently undoes any
  edit to a materialized table, including one made during a session; the
  kernel test "Grid evidence survives restart and detects payload tampering"
  pins that guarantee. Anchors keep it for edits made at rest (signed digest)
  and for edits by any other database connection during a session (SQLite
  `data_version`), but not for edits made through the Grid's own connection.
  That writer is inside the Grid process and already holds the signing key,
  yet it is still a narrowing of a pinned guarantee, so enabling it is a
  maintainer decision under the capability lifecycle.
- *Decision (2026-09-25): stay disabled.* The substrate's promise is that
  evidence fails closed; replay on every start is what makes a session-time
  edit through the Grid's own connection visible after restart. At the
  measured scale the anchors save about 0.9 s of a 3.0 s start, and the
  remaining cost is checkpoint-bounded rather than history-bound, so the
  saving does not justify narrowing that guarantee. Revisit if startup
  replay becomes the dominant recovery cost, with a design that also covers
  the Grid's own connection (for example, anchoring a digest the Grid cannot
  produce without replaying).
- *Measured* (20,000 events, worst case where every event adds a row): full
  replay 1,041 ms against an anchor check of 188 ms; total startup 3.7 s
  (original) → 3.0 s (default, with S-02) → 2.1 s (anchors enabled). The
  remaining ~1.9 s is checkpoint-bounded chain verification of the events
  since the last checkpoint, which does not grow with total history.
- Not done: shadow-table rebuild. The existing rebuild already runs inside a
  single `BEGIN IMMEDIATE` transaction, so a failed replay rolls back to the
  previous materialization rather than leaving it deleted.

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

**Remediation status (2026-09-24): remediated.** A completed full pass
records `protected_columns:core` bound to the column mapping. Later starts
open one stored value per protected column instead of every value, which
still fails closed on a wrong data key (tested). A new mapping, a missing
marker, `AXIOM_GRID_FULL_REBUILD=1`, or plaintext found in the sample triggers
the full pass again. With anchors disabled, the startup replay still opens
every event payload, so this removes a redundant second pass rather than a
check.

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

**Remediation status (2026-09-24): hot path remediated; storage unchanged.**
Routine appends now read a scalar `chain_checkpoint_head_v1` meta value
(latest checkpoint sequence and digest), written in the same transaction as
each checkpoint, instead of parsing the whole history. Only the append that
reaches the interval, or finds the head missing, malformed or ahead of the
chain, takes the full path, which rewrites the head. The head schedules
checkpoint creation and nothing else; verification still reads and checks the
signed history, and a test shows an edited head cannot make a tampered
history verify. Measured append cost with 2,000 checkpoints (1.8 MB of
history): 6.2 ms before, 0.8 ms after, the same as with none.

Checkpoint-mode verification re-verified every checkpoint signature and
anchor event on each call, and `requireIntentEvidenceChain` (intent evidence
reads and every external-effect append) runs it after any append: 786 ms per
call with 2,000 checkpoints. It now remembers the digest of the exact stored
bytes of the verified records before the latest, under the active key set,
and re-verifies only the latest record and anything newer while those bytes
and keys are unchanged: 26 ms at 2,000 checkpoints, the remainder being the
parse and hash of the stored history. An edit to any earlier record, a key
change or an edit to the latest record still fails verification (tested,
including with the prefix comparison removed). Edits to event rows inside the
prefix are outside checkpoint mode's assurance, as for every other prefix
event; full verification from genesis still detects them.

Still open: the history remains one JSON value, so creating checkpoint N
rewrites it (once per interval, small amortised) and each verification still
parses it. The table layout above removes both.

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

**Remediation status (2026-09-25): connection reuse remediated; load test
open.** `mutuallyAuthenticatedRequest` now takes a keep-alive `https.Agent`
from a pool keyed by caller service, audience and origin, and bound to a
credential generation. The generation is a digest of the caller's certificate,
key and trusted CA and the pinned fingerprint of the audience's certificate. A
reused socket skips the handshake and every identity check, so a change to any
of these must retire the socket. The server identity check is set on the pool,
not on each request. The pool is keyed by everything the check reads, and
Node 22 never reuses a socket opened with a per-request check. Limits: 64 sockets, 16 idle, 4 s idle timeout (under the services' 5 s
keep-alive timeout); the existing per-request timeout still applies. A new
generation replaces the pool and drains the old one: idle sockets close at
once and busy ones close when released. Node's agent already separates
sockets by TLS credentials, so the generation key is a second guard that also
retires old pools. `transportPoolStats()` reports pools, new connections,
reused sockets and drained pools. In a test, five warm calls use one
connection and four reuses. A supervisor certificate swap is refused on a new
connection and drains the pool. Swapping back opens a new connection. A new
pin for the audience also opens a new connection, and the server is refused
there. The test fails with `agent: false`, with a pool that ignores the
generation, and with a generation that leaves out the audience pin. Leaving
out the pin let a warm socket serve the audience after its pin changed. The
test also fails with the pool's identity check removed, and on Node 22 with
a per-request check. For 300 timed sequential local calls after 20 warm-up
calls, the pooled path took 1.94 ms per call, with one connection serving all
320 calls. The old path took 5.47 ms per call and opened one connection per
call. New connections, reuses and drained pools are exported in the
operations report and `/v1/metrics` (see S-06). Active sockets and queued
requests are not, and no load test has measured behavior near the socket
limit.

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

**Remediation status (2026-09-24): read and parse removed from the hot path;
generation model not built.** `loadTrustedKey` keeps each parsed key bound to
the identity of the file it came from (device, inode, size, nanosecond mtime
and ctime) and re-reads only when that identity changes, which a rename into
place or an in-place rewrite always does. A request now costs one `stat`
instead of a read and PEM parse: 166 µs to 45 µs per call. A removed file
still fails closed, and tests cover rename, rewrite and removal (each fails
against a cache that skips the identity check). An immutable in-memory trust
generation, which would also remove the `stat`, needs rotation to publish
generations and is still open.

Follow-up (2026-09-25): Windows CI showed that a same-size rewrite in place
within one filesystem timestamp tick keeps the file identity. NTFS ticks
about every 15.6 ms and Linux's coarse clock every few ms, so the cache
could keep serving the old key. As in Git's "racy clean" rule, a trust file
modified or changed within the last 2 s is now re-read on every request and
cached only once it is older. A test fails without that rule.
`trustedKeyCacheStats()` reports reads and cache hits.

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

**Remediation status (2026-09-25): hot path and capacity remediated; metrics
not yet exported; replication design open.** `ReplayGuard` indexes each live
nonce under its expiry time and keeps the distinct expiries in a min-heap. Each
admission evicts exactly the entries that have expired, so no request scans
the retained set. Before, an admission scanned every entry once the guard was
full. With 10,000 entries, an admission while full cost 66 µs; it now costs
0.48 µs at 61,000 entries. Capacity is now derived, not fixed: 500 signed
requests per second is the declared peak per receiving service. That rate,
times 61 s of worst-case retention (the 30 s skew on both sides plus 1 s),
times a margin of 2, gives 61,000 entries, about 8 MiB when full. A test
admits the declared rate for five minutes, every request stamped as far ahead
as the skew allows, and the guard never saturates. Replay and saturation were
already separate errors (409 and 503). `stats()` now also reports:

- occupancy, capacity and high-water mark;
- admitted, replayed, saturated and expired counts;
- the longest time an expired nonce stayed resident.

The tests fail with a full-scan sweep, with the old 10,000 default, and with
an off-by-one expiry. The guard is still process-local, so replicating a
service still needs one of the three designs above.

Follow-up (2026-09-25): the stats are now in every service's operations
report (`transport` group, format unchanged at `axiom-operations.v1`, the
group optional for older snapshots) and in `/v1/metrics` as
`axiom_transport_state` (occupancy, capacity, high water) and
`axiom_transport_events_total` (saturations, expiries). Any saturation
raises a critical `replay-guard-saturated` alert, and a high-water mark at
80% of capacity raises a `replay-guard-near-capacity` warning. The same group
carries the connection-pool counters (S-04) and trusted-key reads and hits
(S-05).

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

**Remediation status (2026-09-25): lookup remediated; identity-plane design
open.** The registry was already keyed by each token's SHA-256 digest. Bearer
resolution now does one lookup by the presented token's digest instead of a
timing-safe comparison against every digest. Hits and misses take the same
path: one hash and one lookup. The lookup compares digests, never tokens, and
a caller cannot steer SHA-256 output toward a stored digest, so its timing
reveals nothing about registered tokens. Measured per rejected token:

| principals | before | after |
|---|---|---|
| 10 | 21 µs | 14 µs |
| 1,000 | 319 µs | 12 µs |
| 10,000 | 2.8 ms | 10 µs |

Before, invalid tokens cost the Gateway CPU in proportion to the registry. A
test resolves tokens against 5,000 principals through a map that counts
every scan. It asserts no scans and exactly one lookup per request, and it
fails against the previous loop. Still open: separating operator and service
tokens from end-user identity, a versioned adapter contract for managed
identity, and tenant-scoped revocation and rotation without loading the whole
registry into each Gateway.

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

**Remediation status (2026-09-25): single-node limits hardened; replication,
persistence and overload admission open.** The guarantee is now explicit, in
code comments and in this entry. Limits are per Gateway process and reset on
restart. The address bucket is keyed only by the connection's peer address.
`X-Forwarded-For`, `X-Real-IP` and `Forwarded` are never consulted, so a
client cannot choose its bucket; a test sends forged headers and is still
limited. Behind a proxy, every client shares the proxy's bucket until a
trusted-proxy contract exists. Two gaps are fixed:

- An IPv6 host controls at least a /64, but buckets were keyed by the full
  address. One host could hold a bucket per address, spend a fresh budget
  on each, and fill the 10,000-key address table. That would lock out every
  new client, since a full table refuses new keys. IPv6 is now keyed by /64,
  and IPv4-mapped addresses, in dotted or hex form, as plain IPv4.
- A full limiter scanned every bucket for a refilled one on each new key:
  193 µs at 10,000 keys and 938 µs at 100,000. A min-heap on the time each
  bucket will be full again now finds one in under 1 µs. Behaviour is
  unchanged: only a fully refilled bucket is evicted, so eviction never
  grants extra allowance, and while every bucket is still refilling a new
  key is refused.

The tests fail with full-address keys, with the scanning limiter, and without
the heap rebuild. Still open: the same effective limit across replicated
Gateways (sticky routing or a rate-limit authority), a trusted-proxy
contract, persisting or recording limit resets across restarts, and overload
admission control separate from abuse limits.

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

**Remediation status (2026-09-25): causal sync state paged; other collections
open.** An inventory of the Gateway's collection routes found:

- `capsules`, `proposals`, `nodes`, `node-discovery`, `node-schedules`,
  `approvals`, `memory`, `backups` and `audit/verify` already take a bounded
  `limit`, capped at 100 for the first three, but no cursor. Records beyond
  the first page are unreachable.
- `consents`, `accounting`, `imports`, `appeals` and `storage-offers` are
  unbounded.
- `/v1/sync` returned at most 1,000 head rows with a `truncated` flag.

That row cut in `/v1/sync` was also a correctness defect. It could fall
inside a record with several concurrent heads, which then reported fewer
heads, `status: active` instead of `conflict`, and a wrong `conflicts` count.
Sync values reach 256 KiB, so a few records could also exceed the 1 MiB
internal response ceiling.

`/v1/sync` is now paged by record in `(namespace, record_id)` order, with an
opaque, canonical-only cursor. A page holds `limit` records (default 100, at
most 200) or about 512 KiB of records, whichever comes first, and always
every current head of each record on it. The response adds `page.has_more`
and `page.next_cursor`; existing fields are unchanged, and `truncated` now
means more pages or more bundles. Tests page 250 records at page sizes of 1,
7, 100 and 200: every record appears exactly once, in order, with all of its
heads. Another test checks that records written during a pass appear once if
ahead of the cursor and wait for the next pass if behind it. A third checks
that the byte budget keeps pages under 1 MiB. Tampered cursors are refused.
The tests fail with an inclusive cursor, without the byte budget, with
`has_more` forced false, and against the previous row-limited query.

This added two optional query parameters to the Gateway client contract, so
its digest and the contract blob pin in
`sovereign-information-grid-nonpromotion.test.mjs` were updated deliberately.
Follow-up (2026-09-25): every other list route except discovery and
accounting now pages the same way. That covers `capsules`, `proposals`,
`nodes`, `node-schedules`, `approvals`, `memory` and `backups`, which were
limited but had no cursor. It also covers `consents`, `imports`, `appeals`
and `storage-offers`, which were unbounded. Each is ordered by time and then
identifier, so ties are total. A page holds at most 100 items (memory keeps
its 500 maximum), and the route reads one extra item to set `has_more`.
Responses add `page` (`limit`, `has_more`, `next_cursor`); existing fields
are unchanged. Cursors are canonical-only and refused by any other
collection. Memory cursors follow the last object scanned, not the last
visible, so objects hidden from a consented reader still advance the page.
Consent enforcement keeps reading every receipt through the unpaged
`listConsents`. Tests page four collections with three items per timestamp
at page sizes 1, 7 and 100: each item appears once, in order. They fail
with a keyset that compares only the time column, with an inclusive keyset,
and with `has_more` forced false. The contract had also drifted:
`consents.list` declared a `limit` the Gateway ignored, and `backups.list`
declared none although the Gateway accepted one. Both now match.

Follow-up (2026-09-25): `accounting` now pages its journals, the part
that grows with activity, in `(created_at, journal_id)` order. Each page's
entries are loaded in one joined query for that page's journals only.
Accounts and balances are small per owner and stay whole on every page.
Without `limit`, the store method still returns every journal, which is how
exports read it. A test pages journals seven at a time and checks order,
entries and whole balances. The contract gained `limit` and `cursor` on
`accounting.get`, so its digest and blob pin were updated deliberately.

Related defect fixed (2026-09-25): every sync page also carried the owner's
100 newest bundle summaries, outside the page's byte budget. A summary lists
up to 128 update identifiers, so 100 of them came to about 975 KB, and next
to a full page of records the response passed the 1 MiB internal ceiling.
The list now has its own 256 KiB budget, newest first, and a cut sets
`truncated`. A test with a full page and 100 maximum-size summaries fails
without the budget, and without the flag on a page with no more records.

Follow-up (2026-09-25): every bundle summary is now reachable through
`GET /v1/sync/bundles`, newest first, keyset-paged like the other
collections (`limit` up to 100, `cursor`), backed by
`sync_bundles(owner, received_at, bundle_digest)` in migration 11. Sync
state keeps its budgeted newest summaries. This adds one read-only
owner-scoped route, so the Gateway contract (now 32 routes), the
Gateway-to-Grid allowlist (27 routes), their digests and the blob pins were
updated deliberately. The kernel test lists bundles through real Gateway and
Grid servers and checks owner isolation and cursor refusal.

Follow-up (2026-09-25): a record whose current heads alone exceed the page
budget (several concurrent values of up to 256 KiB) was still returned
whole, so its page could pass the 1 MiB ceiling and the owner could not
read that record at all. Such a record now comes on its own page with every
head field except the value (`value: null`, `value_omitted: true`,
`value_bytes`), and `GET /v1/sync/updates/:id` returns one update with its
value, for its owner only, to check against `value_digest`. Records that
fit are unchanged. This adds a second read-only route: the contract is now
33 routes, the Gateway-to-Grid allowlist 28 (44 in all). A test with five
200 KB heads fails without the omission; the kernel test fetches an update
through real servers and checks owner isolation.

Node discovery pages too (2026-09-25). It is ranked (security level, then
node id in byte order, which the in-memory ranking now also uses), so its
cursor is keyed on that order. SQL filters status, lease and minimum
security level on plain columns and orders by the level derived from the
profile; rows are decoded lazily and reading stops once a page and one
more eligible node are found, so a page decodes at most `limit + 1` rows
however many nodes have expired. The signed answer gains `page`, and the
contract an optional `cursor` (digest and tripwire pins updated
deliberately). Tests page through a mixed population (inactive, expired,
quarantined, under-level, missing capability, mixed-case ids) and match the
unpaged ranking exactly; they fail when the cursor is ignored, with a
locale tie-break, without the early stop, without the SQL filter, or with
an unranked SQL order. Remaining: the SQL still reads the nodes table's
plain columns and sorts them per request (no expression index), which is
cheap next to decoding but grows with registrations.

Still open: artifacts have no streaming contract.

Related defect fixed (2026-09-25): personal exports read memory through the
paged API method, so an export silently held only the first 100 memory
objects. An export scoped to a later object failed as "unknown or unowned".
Exports now read the owner's complete memory graph; a test with 150 objects
fails against the paged call.

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

**Remediation status (2026-09-25): paged queries index-backed; two N+1
patterns removed; node schedule reads scoped.**

- **Memory disclosure.** Consent was checked with one full scan of
  `consents` per memory object. A reader's active consents are now read
  once per page and turned into an allow-set.
- **Accounting.** Journal entries were loaded with one query per journal.
  They are now loaded in one joined query and grouped in memory.
- **Indexes.** Core migration 11 is index-only; no table or column changes.
  Its composite indexes match each paged route's predicate followed by the
  page order, time then identifier: capsules, proposals, nodes, approvals
  by approver and by requester, consents by subject and by controller,
  memory, imports, appeals, storage offers, backups, accounting
  journals by owner, node schedules by requester, and sync bundles by
  owner. It also adds
  `consents(subject, controller, status, expires_at)` for the consent check
  and `events(actor, seq)` for actor-filtered event pages.
- **Query shapes.** Proposals now choose the page before joining votes.
  Approvals and consents seek each role's index up to the page size and
  merge the two with `UNION`, instead of sorting every row the principal
  ever touched.
- **Tests.** `paged-query-plans.test.mjs` captures the SQL each paged store
  method runs, with and without a cursor, and fails on any full-table scan
  of a base table. It also checks that proposals are chosen through their
  page index, and that a statement with `LIMIT` never sorts its whole
  input with a temporary B-tree. It fails without migration 11, without
  the accounting journal index, and against the previous proposals query. The consent and accounting tests assert one read each
  and fail against the per-item loops.
- **Pins.** The pinned `core_migrations` blob and the SIEA migration test's
  core schema version (now 11) were updated deliberately.

- **Node schedules.** Listing, reading or degrading schedules decoded
  every schedule ever recorded, and every node, then filtered in
  JavaScript. A schedule's status depends on node load, which other
  requesters' schedules contribute, so the read cannot be scoped to the
  requester alone. It is now scoped to what status depends on:
  - the requester's page, by index;
  - the nodes that page is placed on, by key;
  - the schedules that can carry load: `active` or `degraded`, expiring
    after the instant judged. These are exactly the schedules the load
    calculation counts, so expired and revoked history is never decoded.
  Placement at creation reads the same load-bearing set. Statuses and stored
  writes are unchanged. A test with 300 expired and revoked schedules
  compares every status against the whole-table result and bounds the
  schedules decoded per page. It fails if load omits other requesters or
  degraded schedules, if a schedule expiring at the instant counts, and
  against the whole-table read.

Still open: load-bearing schedules and candidate nodes are still read in
full for each status check and placement. They are bounded by admitted
capacity, not by history, but a per-node load table would remove the read.
So are query-plan fixtures for the non-paged routes and rows-examined
evidence in scale drills.

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

**Remediation status (2026-09-25): plaintext generation streams; the rest is
open.**

- **Streaming generation.** Export records are produced one at a time, in the
  same canonical order, from row iterators (`exportRecords` in
  `mesh/src/grid/_store-core.mjs`). A plaintext bundle is written to a
  temporary file in batches of about 64 KiB while it is hashed, then
  renamed into place. The bundle is byte-identical to the previous joined
  serialization, so `axiom-export.v1` and its verifiers are unchanged.
  Generation stays synchronous, so the records come from one consistent read.
  Export preflight walks the same records to find scope errors, without
  holding them.
- **Memory and accounting stream too.** The owner's memory objects are read
  one row at a time; edges come from one joined read that keeps an edge only
  when both ends are active objects the owner holds (the same rule as the
  whole graph); a scoped export checks the objects it names before writing
  any memory record. Accounting journals and their entries come from two
  reads in the same order, merged, so one journal is held at a time. A test
  compares every record against the previous whole-set export, across
  inactive rows, another owner's rows, edges to inactive or foreign objects,
  date windows and object scopes.
- **Evidence.** A 25 MiB event export is generated within 8 MiB of live
  memory, measured in a child process from inside generation; the previous
  code measures 58 MiB and fails. A memory and accounting export stays near
  1 MiB of live memory at both 300 and 1,200 objects (about 20 MiB of memory
  text at 1,200); the previous code measures 52.8 MiB at 1,200 and fails, as
  does whole-set accounting alone (9.6 MiB). A scope error part-way leaves no
  bundle or temporary file and the export pending. Tests fail without the
  temporary-file cleanup, the final batch flush, the preflight walk, the
  active-endpoint join, the scoped edge filter, or the journal merge.
- **Not yet streaming.** A recipient-encrypted export is still assembled in
  memory, because its envelope seals the bundle whole; its plaintext is never
  written to disk.

Still open: a chunked recipient envelope, generation as a background job
(S-14), a streaming bundle route (bundles are still read whole to serve, and
Gateway forwarding caps responses at 1 MiB), and resumable exports.

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

**Remediation status (2026-09-25): streaming format is the default;
data-key rotation supports it.**

- **Format.** `axiom-grid-backup.v2` stores the snapshot as a chunked
  protected artifact (`mesh/src/lib/chunked-artifact.mjs`): records of
  1 MiB plaintext, each AES-256-GCM under a per-artifact key derived with
  HKDF-SHA256 from the data-protection key, a random salt and the backup
  context. Each chunk's associated data binds the format, context, index and
  a final flag, and every chunk but the last must be full. The signed manifest
  binds the ciphertext and plaintext digests, sizes, chunk count and salt.
- **Streaming.** The SQLite backup copy is sealed from file to file.
  Verification checks the signature and digests, decrypts chunk by chunk into
  a candidate file, and verifies the evidence chain on a copy, so the
  candidate stays byte-identical to the signed digest. Restore copies that
  candidate beside the database and renames it into place.
- **Evidence.** Tests cover flipped bytes, a middle chunk marked final,
  swapped, replayed and omitted chunks, trailing bytes, a chunk spliced from
  another backup, and the wrong context, key or metadata; each fails closed
  and leaves no partial plaintext. Sealing and opening a 48 MiB artifact
  holds under 16 MiB of live memory, measured in a child process; a variant
  that keeps every chunk measures 50 MiB and fails. Backup tests restore
  byte-exactly, refuse a tampered snapshot or re-signed manifest without
  touching the live database, and plan retention across v1 and v2 backups.
- **Rotation.** Data-key rotation and rollback rewrap a streaming backup
  chunk by chunk: the snapshot is decrypted to disk, its protected columns
  are re-encrypted in that file, and it is sealed again under the new key.
  A signed rewrap record (the existing `axiom-protected-artifact-rewrap.v1`
  sidecar, encoding `chunked`) binds the source and target ciphertext,
  plaintext and chunk parameters, and verification follows that history. A
  forged or discontinuous record, re-signed or not, is refused. Tests fail
  without the column re-encryption, the chunk continuity rule, following the
  history on open, and with the snapshot rotated as one envelope.
- **Default.** New backups use v2. `AXIOM_GRID_BACKUP_FORMAT=axiom-grid-backup.v1`
  still writes the single-envelope format, and existing v1 backups verify,
  restore and rotate as before. Making v2 the default surfaced one defect,
  now fixed: the retention inventory named every snapshot `snapshot.axb`
  when checking rewrap records, so a rotated v2 backup failed retention
  planning. The recovery drill now runs the default format. Rotation still
  stages each rewrapped artifact and the live database in memory, so a
  snapshot above 512 MiB cannot be rotated.

Still open: streaming rotation of the live database and staged artifacts,
and background maintenance with a bounded I/O rate.
Exports (S-12) now generate plaintext bundles by streaming.

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

**Remediation status (2026-09-25): policy overlays are cached by generation,
and intent admission is bounded; the rest is open.**

- **Generation.** Grid names the overlay set in force with a generation: the
  digest of its ordered `[overlay_id, policy_digest]` list, read from plain
  columns without decrypting any policy. It changes whenever an overlay
  activates, is rolled back or expires, since expiry is part of the query.
- **Conditional fetch.** The Hypervisor sends the generation it holds.
  - When Grid's matches, Grid answers with the generation alone, and the
    Hypervisor reuses the engine it built for exactly that generation.
    Nothing is decrypted, sent or merged.
  - Otherwise Grid sends the overlays. The Hypervisor verifies each policy
    body against its declared digest, then verifies the ordered set against
    the generation Grid names. A malformed overlay list is not an empty set.
  - An inconsistent answer fails closed (`503 policy_unavailable`) and drops
    the cache.
- **Deliberate deviation.** The Hypervisor still asks Grid on every intent.
  A cache that skipped the question would keep a revoked or expired overlay,
  or miss a new one, until invalidated, and policy must take effect on the
  very next intent. The saving is the decryption, transfer and merge, not
  the round trip. Removing the round trip needs a pushed, signed generation
  change, which does not exist yet.
- **Remaining signature work.** The generation travels over the authenticated
  internal channel; it is not a standalone Grid-signed policy-generation
  receipt. That part of the required remediation remains open.
- **Evidence.**
  - Unit tests cover the cache:
    - reuse while unchanged;
    - rebuild on activation;
    - fallback to the base policy on rollback;
    - one question to Grid per call;
    - refusal of an "unchanged" answer for another generation, and of
      overlays that do not match their generation;
    - no caching against a Grid that names no generation.
  - A store test checks that the generation follows activation, rollback and
    expiry, names exactly the overlays served, and decrypts nothing.
  - The four-service kernel test exercises the cache through real services:
    an activated overlay denies the next intent, a rollback restores it, and
    an expiry restores it.
  - Mutation checks: the tests fail when the cache skips the question, when
    an "unchanged" answer for another generation is accepted, when
    mismatched overlays are accepted, when the generation ignores expiry,
    and (kernel) when Grid answers "unchanged" regardless.

- **Bounded admission.** The Hypervisor runs at most 32 intents at once
  (`AXIOM_HYPERVISOR_MAX_CONCURRENT_INTENTS`). Up to 64 more
  (`AXIOM_HYPERVISOR_MAX_QUEUED_INTENTS`) wait, first come, first served, for
  at most 2 seconds each (`AXIOM_HYPERVISOR_INTENT_QUEUE_TIMEOUT_MS`).
  - Beyond that, the intent is refused at once with
    `503 dependency_unavailable`. The details name the service
    (`hypervisor`), the reason (`queue_full` or `queue_timeout`) and
    `retry_after_seconds`.
  - The code is an existing stable, retryable code in the Gateway client
    contract, so the contract is unchanged and clients already retry it.
  - The gate stands before any evidence is written. A refused intent leaves
    nothing behind, and the same request with the same idempotency key
    succeeds once there is room. Every intent that starts runs to its own
    terminal state as before.
  - Code: `mesh/src/lib/execution-gate.mjs`.
- **Evidence for admission.** `mesh/test/execution-gate.test.mjs`:
  - first-come, first-served order;
  - immediate refusal when the queue is full;
  - refusal after the wait bound, with the task never run and its place
    given up;
  - a failing task frees its slot;
  - invalid bounds are refused;
  - through the four services, a saturated Hypervisor refuses an intent
    with the retryable code before recording anything, and the retry with
    the same key completes.

  Mutation checks: the tests fail when the route bypasses the gate, when
  either bound is off by one, when a timed-out task keeps its place, when
  the order is last-in first-out, when a finished task keeps its slot, when
  a started task can still time out, and when the reason or details are
  dropped.

Still open:

- accepted/pending/completed API semantics for actions that need not
  complete in one HTTP request (admission is bounded, but every admitted
  intent still completes within its request);
- queue depth in the operations report;
- group commit of accepted and terminal events;
- separate latency targets;
- crash tests for terminal states.

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
