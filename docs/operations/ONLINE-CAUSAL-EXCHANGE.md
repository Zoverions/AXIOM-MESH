# Operator-approved online causal exchange

**Updated:** 2026-07-29

**Status:** implemented for the two-Grid production candidate
**Applies to:** AXIOM-MESH `0.12.0-dev.2` supported development build
**Scope:** authenticated bundle transfer, encrypted staging, ordered approval, partition/rejoin, and explicit conflict convergence
**Non-claim:** this is not replicated Grid consensus, automatic authority, leader election, BFT, or an unrestricted peer-to-peer network

This runbook defines the supported online form of AXIOM-MESH causal exchange.
It extends the existing independently verifiable offline bundle format across
two authenticated Gateway deployments without weakening the destination's
high-risk approval boundary. The relay observes one owner at one source,
verifies source Grid evidence and node signatures, stages bundles in encrypted
host state, and submits them to one destination only after an independent
principal approves the exact request digest.

Run one configured direction for source-to-destination transfer. Bidirectional
exchange requires a second configuration with the origins, tokens, Grid key,
state file, and state key reversed. Each direction has an independent cursor
and queue. Sharing a state file, state key, or source key pin between
directions is unsupported.

## Trust and authority boundary

The relay has two distinct API credentials:

- the source token can read the configured owner's own signed event stream;
- the destination token can submit `sync.apply` for that same owner.

The relay configuration never contains either token value. It references
private regular files containing 32 through 512 non-whitespace characters.
The configuration and state-key files must also be private. On POSIX hosts,
group- or other-readable secret material is rejected before any network
request. The source Grid public key is intentionally public, but its file path
must be explicitly configured.

The source and destination are exact HTTPS origins. Credentials, paths,
queries, fragments, redirects, and plaintext origins are rejected by the
operator command. Controlled loopback HTTP is available only to the in-process
test and signed drill harness; it cannot be selected by the production CLI.
Normal Web PKI validates the HTTPS connection. Application evidence adds two
independent checks:

1. every source event payload digest and event hash are recomputed, and the
   event-hash attestation must verify against the pinned source Grid Ed25519
   key;
2. every `axiom-causal-sync-bundle.v1` and contained
   `axiom-causal-update.v1` must verify against its node Ed25519 key, owner,
   source-node identity, value digest, version vector, timestamps, and bundle
   membership.

The destination performs its normal admitted-node checks again during
`sync.apply`. A node must be active, unexpired, owned by the authenticated
principal, authorized for `offline.causal-sync`, and bound to the same public
key. Source validation cannot substitute for destination admission.

Most importantly, the relay does not hold an approver token. Polling can stage
data but cannot change destination causal state. Applying a staged bundle
requires one active approval from a different authenticated principal, bound
to the exact `sync.apply` action, bundle, purpose, and data scopes. The approval
is one-use and remains subject to the normal confirmation, policy, plan, grant,
Sandbox validation, and Grid evidence path.

## Configuration and encrypted state

Copy
[`mesh/config/online-causal-sync.example.json`](../../mesh/config/online-causal-sync.example.json)
outside the repository and change every path and origin. The schema is
`axiom-online-causal-sync-config.v1`. Important fields are:

- `owner`: the identical authenticated principal identifier at both sites;
- `source.origin`: the exact source Gateway HTTPS origin;
- `source.token_file`: a private source API token file;
- `source.grid_public_key_files`: one through eight pinned source Grid
  Ed25519 public keys, including only reviewed keys needed across a recorded
  identity transition;
- `destination.origin`: the exact destination Gateway HTTPS origin;
- `destination.token_file`: a private destination API token file;
- `state_file`: the atomic encrypted cursor, queue, receipt, and retry state;
- `state_key_file`: a separate private 32-byte base64url key;
- polling, request, event, queue, byte, and retry bounds.

The direction identifier binds the owner and both origins. The whole state
object is authenticated-encrypted with AES-256-GCM using that direction as
associated data. Copying state to a different owner or origin pair fails
authentication. The separately reported pinned-key digests may be updated
through a reviewed Grid identity transition without discarding a queued
direction; every event must verify under one configured key. Pending bundle values never
appear in the status output, retry record, receipt list, or signed drill
artifact.

Writes use a new private temporary file followed by atomic replacement.
Polling and apply commands take an OS-visible ownership lock. A live process
cannot be bypassed by a second relay process. A dead lock can be reclaimed only
after five minutes and a failed process-liveness check. The encrypted state
has bounded size, pending count, pending bytes, receipt history, and source
cursor. Tamper, truncation, wrong key, invalid ordering, or metadata drift
fails before a remote request.

Keep the state key in external secret custody and back it up separately from
the state file. Losing it makes pending data and cursor history unrecoverable.
Reusing it across directions unnecessarily enlarges compromise impact. State
may include user causal values in encrypted form and must follow the same
retention, access, backup, and incident requirements as protected Grid data.

## Poll, inspect, approve, and apply

Poll one direction:

```text
npm run online-sync -- poll /etc/axiom-mesh/source-to-destination.json
```

Run continuous staging:

```text
npm run online-sync -- run /etc/axiom-mesh/source-to-destination.json
```

`run` repeats polling and bounded backoff. It does not apply pending bundles.
Both commands print `axiom-online-causal-sync-status.v1`, containing origins,
the source Grid key digest, cursor, queue counts, safe bundle descriptors,
exact request digests, retry state, and bounded receipts. It never prints
tokens, state keys, bundle bodies, values, or private keys.

Inspect without polling:

```text
npm run online-sync -- status /etc/axiom-mesh/source-to-destination.json
```

The first pending descriptor contains `bundle_digest` and `request_digest`.
An independent destination approver reviews the source identity, namespaces,
bundle metadata, node admission, expected conflict effect, and operational
change record. The approver then grants an ordinary `approval.grant` intent
for:

```json
{
  "requester": "pilot-operator",
  "action": "sync.apply",
  "request_digest": "<pending request_digest>",
  "expires_at": "<short future ISO timestamp>"
}
```

Apply only after the approval is active:

```text
npm run online-sync -- apply \
  /etc/axiom-mesh/source-to-destination.json \
  <bundle_digest> \
  <approval_id>
```

The command refuses to skip the first pending bundle. This preserves source
event order and prevents a later update from being attempted before its causal
dependencies. It submits a stable idempotency key derived from the bundle
digest and approval identifier. If the network fails after destination commit but before the response,
the next attempt checks the owner-scoped destination bundle record and records
`already_present` without consuming another approval.

The destination preflight route is:

```text
GET /v1/sync/bundles/<64-character-bundle-digest>
Authorization: Bearer <destination-owner-token>
```

It returns only a materialized receipt for that authenticated owner. A token
for a different owner receives `sync_bundle_not_found`, even when the digest
exists. The route does not return the causal bundle or value. This check also
prevents bidirectional relays from echoing a bundle indefinitely.

## Consistency and conflict behavior

Online transport does not change causal semantics:

- each node counter must be contiguous with history accepted by that Grid;
- every cross-node version-vector dependency must already exist;
- reuse of one node counter for different content is equivocation;
- identical version vectors for different updates are rejected;
- causally dominated updates remain historical but are not current heads;
- concurrent updates become multiple visible heads;
- delete is a signed tombstone, not physical erasure of evidence;
- a resolution must causally dominate and name every current head;
- partial, phantom, or undeclared conflict resolution fails closed.

The relay never chooses a winner by receive time, wall-clock time, origin,
lexical order, or destination preference. It never implements silent
last-write-wins. Operators inspect conflicts through:

```text
GET /v1/sync?namespace=<namespace>&record_id=<record>
```

A record with multiple heads reports `status: conflict`. Resolution is a new
node-signed update whose vector includes all accepted dependencies and whose
sorted `resolves` list contains every current head identifier. That resolution
requires the same exact-request independent approval when exchanged online.

Because each Grid has one authoritative local event log, two Grids can accept
different concurrent heads during a partition. Rejoin exchanges both histories
without claiming that the Grids share a replicated log. After each side
accepts both bundles, their visible head sets are deterministic. They converge
to one head only after an explicit complete resolution is accepted on both.

## Partition, retry, and queue behavior

Source unavailability, timeout, invalid JSON, an oversized response,
authentication failure, invalid Grid evidence, destination preflight failure,
or queue saturation never advances the affected source event. A retry record
contains a fixed safe code, attempt count, last-failure time, next-attempt time,
and blocked flag. Exponential delay is bounded by the configured maximum.

After `maximum_attempts`, polling is blocked so a persistent failure cannot
hammer either deployment. Inspect transport, certificate, token, Grid key,
destination admission, capacity, and state integrity before resetting:

```text
npm run online-sync -- retry /etc/axiom-mesh/source-to-destination.json
```

Resetting retry state does not change the cursor, remove pending bundles,
alter receipts, or bypass approval. Queue saturation is also blocked until the
oldest pending bundle is applied or the operator deliberately rolls back the
relay. Do not increase bounds merely to hide an unreviewed backlog.

The cursor is the highest fully examined event sequence, not an assertion that
the owner owns every source event sequence. Owner-filtered streams can contain
gaps because unrelated principals share the source Grid log. Every returned
event must still be strictly increasing and independently signed. A malformed
event stops the batch before its cursor is committed.

## Rollback and incident handling

To disable exchange, stop the relay process or scheduler. This removes no Grid
state and grants no new authority. Preserve the encrypted state and status
output before changing configuration. Revoking either API token immediately
prevents its side of the direction. Replacing the pinned source Grid trust set
requires a reviewed configuration change and verified application-identity
lineage. Retain only the active key and the minimum retired transition keys
needed to verify events beyond the cursor; do not add a key merely to make
verification pass.

If a source key, token, state key, node key, bundle, or event is suspect:

1. stop both directional relays;
2. revoke the affected API principal and quarantine affected admitted nodes;
3. preserve encrypted relay state, Grid evidence, status, configuration
   digest, origin certificates, and relevant approval records;
4. inspect pending request digests and destination receipts;
5. rotate credentials through the supported lifecycle;
6. restore only from verified state and explicitly re-establish key pins;
7. repeat the drill before resuming.

Removing a pending bundle by hand, editing a cursor, decrypting and rewriting
state, reusing an approval, or bypassing the normal intent path is unsupported.
If rollback requires discarding a queue, archive the encrypted state as
incident evidence and start a new reviewed direction with an explicit record
of the abandoned cursor.

## Signed partition/rejoin drill

Run:

```text
npm run online-sync:drill -- /tmp/axiom-online-causal-sync-drill
```

The directory must exist and be empty. The drill provisions two independent
production candidates, starts two real four-process supervisors, admits the
same two signed causal nodes at both Grids, and runs the production relay in
both directions. It proves:

- all eight production service processes become ready;
- source events verify against the configured Grid key;
- the encrypted pending queue survives runtime reconstruction;
- an injected two-direction transport partition preserves both cursors;
- each side accepts a different causally concurrent update while isolated;
- rejoin stages both directions in order;
- each received bundle requires an exact independent destination approval;
- both Grids expose the same two conflict heads;
- an explicit all-head resolution converges both Grids to one update;
- a fresh replay direction absorbs every duplicate before approval.

The Grid signs `axiom-online-causal-sync-drill-evidence.v1`. Protected CI binds
the artifact to the source revision, retains it for 90 days, and includes it in
the same-revision incident tabletop. The artifact contains fixed outcomes,
counts, cursors, key digests, environment metadata, and limitations—not
tokens, keys, bundle values, state plaintext, or user data.

## Pilot repetition and non-claims

Candidate evidence does not replace a multi-host pilot. Before promotion:

1. use independently operated hosts and externally custodied source,
   destination, approver, Grid, and state keys;
2. enforce least-privilege token scopes and separate relay/approver operators;
3. validate real public certificates, DNS failure, rotation, revocation, and
   certificate-expiry behavior;
4. measure latency, clock skew, sustained outage, backlog growth, recovery
   time, and destination processing capacity;
5. exercise packet loss, reordering, duplicated responses, asymmetric
   partition, host restart, disk pressure, and state-backup restoration;
6. review data residency, retention, deletion, disclosure, and incident duties
   for each exchanged namespace;
7. obtain the pending independent threat-model and configuration review.

This control exchanges already signed causal data for one matching owner. It
does not discover arbitrary peers, transfer workloads, prove remote resource
claims, replicate the complete Grid event log, elect a leader, tolerate a
Byzantine quorum, establish global membership, or authorize public federation.
Those remain separate roadmap and promotion gates.
