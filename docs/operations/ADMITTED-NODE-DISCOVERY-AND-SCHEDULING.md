# Admitted-node discovery and capability-aware scheduling

**Updated:** 2026-07-29

**Status:** implemented for the single-Grid production candidate  
**Applies to:** AXIOM-MESH `0.12.0-dev.2` supported development build
**Scope:** authenticated discovery metadata and deterministic placement leases  
**Non-claim:** this control does not connect to, launch work on, or federate remote nodes

This runbook defines the production-candidate contract for discovering admitted
nodes and reserving bounded placement leases. It covers the signed metadata
format, authorization path, deterministic scheduler, failure behavior,
operational evidence, and the limits that still block multi-host promotion.

## Enforced admission and discovery boundary

A node becomes discoverable only after an authenticated owner submits a
policy-controlled `node.register` intent containing a valid
`axiom-node-admission.v2` statement. The node, rather than the API caller, signs
that statement with Ed25519. The signature binds:

- the stable node identifier and Ed25519 public key;
- the security profile, capability set, and software digest;
- the absolute expiry and anti-replay nonce;
- one HTTPS origin with no credentials, path, query, or fragment;
- the failure domain and bounded role set;
- CPU, memory, storage, and concurrent-assignment ceilings.

Grid records the authenticated owner separately from the node signature. It
accepts at most 64 unexpired active nodes for one owner and rejects reuse of an
active Ed25519 signing key under a different node identifier. These controls
make inexpensive copied-key aliases and unlimited single-account admissions
fail closed. They are not proof that two authenticated owners represent two
different humans or organizations; global identity-backed Sybil resistance
remains outside this release.

An admitted node can refresh its lease, software digest, capabilities, and
discovery declaration with a signed `axiom-node-renewal.v2` statement.
Quarantined nodes cannot renew. Once a node has advertised v2 discovery
metadata, a v1 renewal cannot remove that metadata: the renewal fails rather
than silently downgrading a schedulable identity.

`GET /v1/node-discovery` requires the `node:read` scope. It returns only active,
unexpired v2 nodes whose signed fields satisfy all filters. The bounded query
accepts repeated `capability` and `role` parameters, plus
`minimum_security_level`, `minimum_lease_seconds`, and `limit`. Grid signs the
canonical discovery object with its service identity. The public result
contains the node signing-key digest, not the raw public key.

Example:

```text
GET /v1/node-discovery?capability=compute.batch&role=compute&minimum_security_level=2&minimum_lease_seconds=300&limit=50
Authorization: Bearer <token-with-node:read>
```

An operator must verify the response attestation against the expected Grid
identity before treating it as independent discovery evidence. API transport
authentication protects the request path; the object signature makes the
returned candidate set independently attributable to Grid.

## Deterministic scheduling and resource leases

Scheduling is a normal authenticated intent, not a privileged side channel.
The requester submits `node.schedule`, and the global/user policy stack must
allow the action and `node:schedule` scope. Sandbox validates a bounded
`axiom-node-schedule-request.v1`; Hypervisor applies the policy grant; Grid
selects and commits placements in the same transactional evidence path used by
other state changes.

The request binds:

- a caller-selected request identifier;
- at least one required capability and optional required roles;
- a minimum S0-S3 security level;
- positive CPU and memory plus non-negative storage per replica;
- 1 through 16 replicas;
- a 5 through 3,600 second schedule lease;
- optional excluded node identifiers;
- optional distinct failure-domain placement;
- a maximum number of placements per authenticated owner.

The requester identity and normalized request are hashed to derive the schedule
identifier. The scheduler filters out nodes that cannot remain admitted for the
entire requested lease, do not meet the capability/role/security contract, or
lack declared capacity. It accounts for all unexpired active or degraded
schedules, including assignment concurrency and allocated CPU, memory, and
storage. Selection favors lower utilization, unused failure domains and owners,
higher security level, then a stable SHA-256 tie-break derived from the
schedule and node identifiers.

The same nodes, schedules, request, and event timestamp therefore produce the
same complete placement regardless of input ordering. Grid never records a
partial schedule. If every replica cannot be placed under all constraints, the
intent fails with `schedule_capacity_unavailable` and no reservation is
committed.

Schedule requirements and placements are encrypted at rest with the Grid data
protector. Only the authenticated requester can list its schedules through
`GET /v1/node-schedules`, which also requires `node:read`. A returned placement
contains the selected node, owner, signed HTTPS origin, failure domain,
security profile, node-key digest, and reserved resources. This record is an
auditable reservation. It is not a workload instruction or permission to
invoke the node.

Example intent input:

```json
{
  "action": "node.schedule",
  "input": {
    "request_id": "batch-2026-07-29-001",
    "required_capabilities": ["compute.batch"],
    "required_roles": ["compute"],
    "minimum_security_level": 2,
    "resources": {
      "cpu_millis": 750,
      "memory_bytes": 1073741824,
      "storage_bytes": 0
    },
    "replicas": 2,
    "lease_seconds": 300,
    "excluded_node_ids": [],
    "distinct_failure_domains": true,
    "max_per_owner": 1
  }
}
```

## Expiry, quarantine, and partition behavior

Scheduling is lease based and fail closed:

1. Discovery excludes a node when its admission expires or cannot cover the
   query's minimum lease horizon.
2. New schedules exclude a node unless its admission covers the complete
   requested schedule lease.
3. Quarantine immediately removes the node from discovery, quarantines its
   active storage offers, and marks schedules containing it degraded.
4. Reading a schedule recomputes effective status against current node state.
   Missing identity, signing-key change, lost metadata, capability/role/security
   regression, insufficient declared resources, quarantine, or expiry makes
   the schedule degraded.
5. Once the schedule's own lease ends, its effective status is expired and its
   capacity no longer contributes to new placement load.

There is no remote liveness probe in this milestone. A network partition is
modeled conservatively as missed signed renewal followed by admission expiry.
This protects the scheduler from indefinitely treating a silent node as
eligible, but it does not measure packet loss, latency, split-brain behavior,
or wide-area convergence.

When a schedule is degraded, stop any external dispatcher that might be using
it, identify the affected node, and preserve Grid evidence before remediation.
Do not manually rewrite the schedule. Quarantine a suspect node through the
governed node action, renew a healthy node with fresh signed v2 metadata, and
submit a new schedule request with a new request identifier. Existing records
remain available as evidence.

## Signed control drill and CI evidence

Run the local control in an explicitly empty disposable directory:

```text
npm run node-scheduling:drill -- /tmp/axiom-node-scheduling-drill
```

The drill creates a disposable encrypted Grid, admits three signed v2 nodes,
and produces `axiom-node-scheduling-drill-evidence.v1`. It proves:

- three valid nodes appear through filtered discovery;
- a second node identifier using an active signing key is rejected;
- a two-replica request selects different owners and failure domains;
- an additional request exceeding residual capacity is rejected atomically;
- quarantining a selected node degrades the existing schedule;
- the quarantined node disappears from discovery;
- a short-lease node simulating missed renewal disappears after expiry;
- the schedule itself becomes expired at the lease boundary;
- restart rebuild preserves the evidence head and degraded schedule.

Grid signs the secret-free artifact with its Ed25519 service identity. The
verifier checks schema, revision metadata, all control results, signer type,
key identifier, and object signature. Protected CI uploads the artifact with
90-day retention and requires it as one of the same-revision controls composed
into the signed incident tabletop. Release verification also checks that the
drill command and revision-scoped artifact are still present in the protected
workflow.

For a candidate revision, retain the workflow run URL, artifact name, SHA, and
verification result in the promotion packet. A local pass is development
evidence; promotion requires the protected main-branch run.

## Operator checks

Before enabling discovery or using reservations in a pilot:

1. Confirm every node owner is provisioned through the approved API identity
   process and has only the scopes it requires.
2. Record the expected Grid signing-key identifier and independently verify a
   discovery response.
3. Inspect admission expiry, security profile, software digest, roles,
   resources, endpoint origin, and failure domain.
4. Use a minimum lease horizon long enough to cover dispatch and expected work
   startup.
5. Set `distinct_failure_domains` and `max_per_owner` when replicas are intended
   to reduce common-control risk.
6. Compare requested resources with pilot orchestrator enforcement. Node claims
   are signed declarations; this release does not remotely measure them.
7. Alert on quarantine, degradation, expiry, and repeated
   `schedule_capacity_unavailable` outcomes.
8. Repeat the drill after changing admission formats, scheduling policy,
   encryption keys, migrations, or orchestrator placement rules.

During recovery, preserve the signed discovery response, schedule record,
relevant evidence-chain segment, node admission/renewal statement, and
quarantine event. Treat endpoint or key changes as new trust material, not
routine mutable labels.

## Pilot repetition and non-claims

The following claims are deliberately excluded:

- no arbitrary remote workload execution, RPC authorization, or result return;
- no active endpoint reachability or resource telemetry;
- no multi-host transfer, routing, service discovery, or federation;
- no replicated Grid, leader election, BFT, or distributed consensus;
- no global personhood, organization uniqueness, stake, or proof-of-work Sybil
  defense;
- no automatic re-placement or cancellation of external work after degradation;
- no live WAN partition, clock-fault, or orchestrator-eviction experiment.

Production promotion therefore requires a pilot-specific node/dispatcher
adapter with authenticated transport, measured resource enforcement, explicit
work authorization, cancellation, result provenance, and failure recovery. It
also requires identity review, a facilitated failure exercise, independent
security review, and repeatable multi-host evidence. Until those gates close,
this implementation is production-candidate discovery and reservation logic,
not a production distributed compute mesh.
