# AXIOM-MESH Kernel

This directory is the clean-room rebuild of the AXIOM-MESH runtime. It uses
four independent Node.js processes and no third-party runtime dependencies.

## Run locally

Local requirements: Node.js `>=24.14.0 <25`; `.node-version` and the candidate
production image pin Node.js 24.18.0.

```bash
cd mesh
npm run dev
```

The command creates local Ed25519 service identities and an administrator token
under `mesh/.data/`, starts Grid, Sandbox, Hypervisor, and Gateway, then prints
the Gateway URL and token path.

In another terminal:

```bash
cd mesh
node src/cli.mjs status
node src/cli.mjs capabilities
node src/cli.mjs intent system.echo '{"message":"hello"}'
node src/cli.mjs audit
```

Repository-root aliases provide the supported one-command surface:

```bash
npm run dev
npm test
npm run check
npm run release:verify
```

For the candidate hardened container package and explicit production
provisioning flow, see [PRODUCTION.md](PRODUCTION.md). Runtime startup never
generates production identities, API tokens, or data-protection keys.

The candidate Compose network is internal and retains only explicit
host-loopback Gateway ingress. With `AXIOM_REQUIRE_DENY_EGRESS=true`, the
supervisor fails before launching services if the Linux namespace has an
active IPv4 or IPv6 default route or lacks the isolated link. Protected CI
runs `npm run network-boundary:verify` inside the provisioned container,
establishes an outside positive control, and retains signed secret-free
evidence.

Verify an export without a running AXIOM-MESH process:

```bash
node src/verify-export.mjs \
  .data/exports/<export-id>/manifest.json \
  .data/exports/<export-id>/bundle.jsonl \
  .data/trust/grid.pub.pem
```

For a recipient-encrypted export, pass the recipient X25519 private key as the
fourth argument. The verifier authenticates the signed manifest and stored
ciphertext before decrypting and validating canonical JSONL records:

```bash
node src/verify-export.mjs \
  .data/exports/<export-id>/manifest.json \
  .data/exports/<export-id>/bundle.encrypted.json \
  .data/trust/grid.pub.pem \
  recipient-x25519-private.pem
```

Verify a transported causal-sync bundle without a running service. The expected
digest must come from the admitted node record, not from the bundle itself:

```bash
node src/verify-sync.mjs \
  ./causal-sync-bundle.json \
  <expected-node-public-key-sha256>
```

## Security model

- Only Gateway is public.
- Inter-service requests use Ed25519 signatures, body digests, timestamps,
  audience binding, and one-use nonces.
- Hypervisor issues a short-lived, single-use, intent-bound capability for each
  Sandbox execution.
- Policy files are loaded as an ordered global-to-local stack. A lower layer
  can deny or tighten an action but cannot introduce authority, replace its
  tool, lower its risk, or weaken its constraints.
- Every permitted high-risk action requires a one-use approval from a
  different authenticated principal, bound to the requester, action, canonical
  request digest, and expiry.
- Plans use the validated `axiom-plan.v1` schema and name effects,
  dependencies, approvals, capabilities, timeouts, observable decision
  provenance, and evidence obligations before execution.
- Sandbox currently exposes only audited deterministic built-ins. Arbitrary code
  and network egress are unavailable.
- Grid is the only durable-state owner and signs a transactional hash-linked
  evidence log.
- Durable event payloads and materialized JSON use context-bound AES-256-GCM
  authenticated encryption. Production requires an externally provisioned
  32-byte `AXIOM_DATA_KEY` or protected key file; development bootstrap creates
  a mode-0600 local key.
- The stopped-runtime data-key lifecycle re-encrypts the live Grid, backup
  envelopes and nested protected columns, credential recovery packages, and
  recovery database copies. Signed rewrap history, key-last journaled cutover,
  wrong-key rejection, and state-preserving rollback are exercised in CI.
- Grid verifies the signed evidence chain before accepting traffic and
  transactionally rebuilds all derived tables from that log on restart, so
  direct edits to balances, consents, approvals, memory, or registries do not
  become authoritative.
- Offline updates are accepted only from an active, owner-bound admitted node
  whose declared capabilities include `offline.causal-sync`. Node-global
  counters reject equivocation; version vectors preserve concurrent heads
  instead of applying last-write-wins.
- The local memory graph is immutable/content-addressed, supports typed edges
  and tombstones, and discloses another owner's objects only through an active
  consent scope.
- Local accounting is token-independent and uses transactional, balanced
  double-entry journals with safe integer units. It does not enable settlement.
- Development credentials are generated with restrictive filesystem modes.
  Production refuses local auto-bootstrap and requires an external identity and
  secret provisioning workflow.
- Request logs are structured JSON, include trace IDs, omit query strings, and
  recursively redact authorization, credentials, keys, prompts, bodies, and
  payloads. Unexpected-error logs retain only error class/code.
- Each service emits bounded-cardinality request, duration, security, replay,
  availability, integrity, and process-memory metrics. Metric labels never
  contain principals, intents, routes with parameters, queries, prompts,
  payloads, tokens, capsules, or object identifiers.
- Liveness is process-local. Readiness follows the actual dependency graph and
  fails when a critical downstream service or Grid evidence verification is
  unavailable. Detailed operations and OpenMetrics surfaces require
  `operations:read`.
- Grid deep integrity readiness is cached for 30 seconds by default to keep
  probes bounded as the evidence log grows. Set
  `AXIOM_INTEGRITY_PROBE_INTERVAL_SECONDS` between 5 and 3600 when an operator
  has explicitly chosen a different verification/load tradeoff.

## API

The Gateway exposes:

- `GET /health`
- `GET /ready`
- `GET /v1/status`
- `GET /v1/operations`
- `GET /v1/metrics`
- `GET /v1/capabilities`
- `POST /v1/intents`
- `GET /v1/intents/:id`
- `GET /v1/events`
- `GET /v1/capsules`
- `GET /v1/proposals`
- `GET /v1/nodes`
- `GET /v1/consents`
- `GET /v1/approvals`
- `GET /v1/memory`
- `GET /v1/accounting`
- `GET /v1/imports`
- `GET /v1/imports/:id`
- `GET /v1/appeals`
- `GET /v1/storage-offers`
- `GET /v1/sync`
- `GET /v1/backups`
- `GET /v1/backups/:id`
- `GET /v1/exports/:id`
- `GET /v1/exports/:id/bundle`
- `GET /v1/audit/verify`

Every authenticated endpoint requires `Authorization: Bearer ...`. Intent
submission also requires an `Idempotency-Key` header.

`GET /health` and `GET /ready` are the only unauthenticated operational
probes. They disclose only liveness/readiness and the kernel version.
`GET /v1/operations` returns the dependency-aware four-service report and
static alert states; `GET /v1/metrics` renders the same bounded data in
OpenMetrics 1.0 format. Both require `operations:read`.

Mutation examples:

- `system.echo`
- `system.hash`
- `capsule.register`
- `capsule.revoke`
- `consent.grant`
- `consent.revoke`
- `approval.grant`
- `memory.put`
- `memory.link`
- `memory.tombstone`
- `accounting.account.create`
- `accounting.journal.post`
- `export.create`
- `import.stage`
- `import.apply`
- `governance.propose`
- `governance.vote`
- `governance.finalize`
- `governance.activate`
- `governance.verify`
- `governance.rollback`
- `governance.emergency`
- `governance.emergency.review`
- `governance.appeal`
- `node.register`
- `node.renew`
- `node.quarantine`
- `storage.offer`
- `sync.apply`
- `backup.create`

The active policy in `config/policy.json` is deny-by-default. Economic,
chain/bridge, and embodied effects are intentionally disabled.

Imports are deliberately two-phase. `import.stage` verifies the source Grid
signature and canonical bundle, rejects duplicate or unsupported records, and
stores a deterministic `new`/`existing`/`conflict` diff. `import.apply` is
high-risk, requires explicit confirmation plus a one-use independent approval,
rejects conflicts, and promotes records only inside the foreign-provenance
store. Imported records never become local signed events or overwrite native
state.

Exports cover the authenticated identity reference, evidence receipts, intents,
consents, approvals, owned capsule records, governance records, memory,
accounting, and signed sync updates. `since`/`until` constrain time;
`object_ids` and `capsule_ids`
create strict selectors that reject unknown or unowned targets and exclude
unrelated record families. Supplying `recipient_public_key` (X25519 PEM)
encrypts the JSONL bytes with an ephemeral X25519 exchange, HKDF-SHA-256, and
AES-256-GCM. Only the recipient key identifier—not the raw public key—is
published in the signed manifest scope.

`sync.apply` is a high-risk offline-ingress operation. It requires
`confirm:sync.apply` plus one independently issued approval and accepts only an
`axiom-causal-sync-bundle.v1` signed by an active node owned by the requesting
principal. Every update is separately Ed25519-signed and binds its owner,
source node, namespace, record, operation, value digest, version vector,
timestamp, and nonce. Replayed bundles/updates, source-counter equivocation,
counter gaps, unaccepted causal dependencies, unadmitted keys, expired or
quarantined nodes, and nodes lacking the declared sync capability fail closed.

`GET /v1/sync` returns the authenticated owner's materialized records and
current causal heads. Concurrent non-commutative values remain visible as a
conflict; no winner is selected by wall-clock time. A resolving update must
causally dominate and name every current head. Sync updates are included in
selective portability exports and remain foreign-provenance records on import.
This local package-exchange protocol does not claim peer discovery, transport,
federated consensus, or automatic application-layer merge semantics.

`backup.create` is a high-risk operation and therefore requires explicit
confirmation plus one independently issued one-use approval. Grid snapshots
are produced with the Node SQLite backup API, encrypted with context-bound
AES-256-GCM, and covered by a signed manifest containing the exact plaintext
database digest and evidence head. Restore is deliberately unavailable through
the live API. Stop Grid, then run:

```bash
node src/cli.mjs backup restore \
  .data/backups/<backup-id>/manifest.json \
  <expected-database-sha256>
```

The restore verifies the signed manifest, encrypted snapshot, exact database
digest, schema migrations, and evidence chain before replacement. The previous
database is preserved under `.data/recovery/rollback/`, and the next Grid start
commits a signed `backup.restored` recovery event.

Backup retention is a signed two-phase offline operation. First create a plan
against the complete verified active inventory:

```bash
npm run backup:maintain -- plan \
  .data \
  /srv/axiom-mesh/secrets/data-protection.key \
  config/backup-retention.json \
  /srv/axiom-mesh/retention-plan.json
```

Review and retain that plan, stop Grid, then apply the exact signed content:

```bash
npm run backup:maintain -- apply \
  .data \
  /srv/axiom-mesh/secrets/data-protection.key \
  /srv/axiom-mesh/retention-plan.json
```

Apply fails if Grid is live, any backup is corrupt, the inventory changed, the
plan was altered, or the verified minimum would be violated. Selected backups
move atomically to `.data/backups/.retired/<plan-id>/`; none are deleted. If
the process is killed mid-move, rerun `apply` or use:

```bash
npm run backup:maintain -- recover \
  .data \
  /srv/axiom-mesh/secrets/data-protection.key
```

Quarantined media remains covered by later data-key rotation and rollback.
Deletion or transfer from quarantine requires the deployment's separate media
custody, retention, and destruction approval.

Local governance is also lifecycle-bound. A proposal receives human-chamber
votes, finalizes only after voting closes, waits through its activation
timelock, and then requires an independently approved activation. Executable
policy proposals and emergency controls may contain deny rules only. They
cannot block approval, rollback, emergency review, appeal, or export recovery
paths. Emergency overlays expire within 24 hours and retain review records;
normal overlays retain verification and rollback metadata. Portable delegation
and federated identity proof are not yet enabled.

Set `AXIOM_POLICY_PATHS` to a JSON array of policy files ordered from the
highest-authority layer to the most local layer. `AXIOM_POLICY_PATH` remains
the single-file shorthand. Inter-service calls negotiate and sign an explicit
`axiom.<service>.v1` interface identifier; incompatible versions fail closed.

`npm run status:generate` regenerates the public capability table from the
registry. `npm run release:verify` checks version and lock consistency,
implemented-feature evidence, migration continuity/checksums, rollback
coverage, endpoint/action documentation parity, production container policy,
source digests, and active workflow scope. `npm run
release:evidence` writes a local SPDX SBOM and provenance bundle only from a
clean worktree.
