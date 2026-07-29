# Request Pressure and Dependency Loss

**Status:** implemented for the automated production candidate; dedicated
pilot hardware and cgroup pressure remain pending

**Updated:** 2026-07-29

**Applies to:** AXIOM-MESH 0.11.0 clean-room kernel

This runbook defines the supported request-pressure and dependency-loss
exercise. It verifies that bounded request resources fail closed, a stalled
critical dependency makes readiness fail, loss of one supervised service
stops the partial runtime, and a complete restart preserves committed state.

The exercise is destructive only inside an explicitly named empty disposable
workspace. It is not a production traffic generator, a public fault endpoint,
an out-of-memory test, a CPU-throttling claim, or evidence of a live pilot
outage.

## Enforced resilience profile

The canonical policy is
[`mesh/config/resilience-drill.json`](../../mesh/config/resilience-drill.json).
Version 1 fixes the following profile:

- a 4 KiB maximum Gateway request body;
- an 8 KiB oversized request;
- a ten-request token-bucket capacity with one request per second refill;
- a concurrent burst of 24 authenticated operations requests;
- a 1.2-second recovery wait and eight-second request timeout;
- Sandbox as the only dependency fault target;
- `SIGSTOP` to make the dependency unresponsive without first notifying the
  supervisor;
- `SIGKILL` to prove child-loss detection and partial-runtime shutdown;
- an eight-second degraded-response timeout;
- a ten-second supervisor shutdown ceiling;
- a twenty-second full-stack restart ceiling.

The validator rejects any policy drift, including a larger request-body
allowance, smaller burst, different dependency, weaker signal, or longer
ceiling. Changing this profile requires a new policy revision and updated
evidence expectations.

Production provisioning remains unchanged. The drill uses the real
file-backed data key, API registry, four Ed25519 service identities, policy,
capability registry, Grid database, and four-process production supervisor.
It never enables auto-bootstrap or introduces a synthetic success path.

## Request-pressure sequence

The drill first starts the complete host-mode production supervisor and
requires an exact parent-only inventory of the `gateway`, `grid`,
`hypervisor`, and `sandbox` child processes. The supervisor sends this
inventory through its existing Node IPC channel only when an orchestrating
parent channel exists. Process identifiers are never exposed over HTTP,
written to signed evidence, or logged by the public services.

The request-pressure sequence then:

1. requires the authenticated four-service operations report to be ready;
2. submits a valid JSON intent body larger than the configured 4 KiB limit;
3. requires HTTP 413 with `body_too_large`;
4. reuses the same idempotency key with a bounded `system.echo` intent;
5. requires that intent to complete, proving the rejected body created no
   idempotency reservation or application effect;
6. issues 24 concurrent authenticated operations requests;
7. requires both accepted requests and HTTP 429 rejections, with no other
   status;
8. waits for the fixed token refill;
9. requires authenticated operations to recover;
10. requires Gateway telemetry to expose at least the observed number of
    `rate_limit_rejections_total`.

Request bodies are bounded before authentication and intent construction.
IP and principal token buckets are bounded independently. A rejected burst
does not authorize work, and successful recovery does not bypass either
limiter.

This is evidence of request-path resource containment. It is not evidence that
the candidate survives arbitrary memory pressure, disk exhaustion, file
descriptor exhaustion, process-count exhaustion, or sustained hostile
traffic. Those conditions require the actual pilot host and container
resource policy.

## Dependency-loss and recovery sequence

After request recovery, the drill suspends only the Sandbox child. The process
remains present, so the supervisor has not yet received an exit event.
Hypervisor's signed Sandbox request reaches its bounded timeout, causing the
operations graph to become `not_ready`. The report must contain Gateway, Grid,
and Hypervisor but not claim a Sandbox snapshot it could not authenticate.

The report must include the bounded alerts:

- `service-not-ready:gateway`;
- `service-not-ready:hypervisor`;
- `upstream-unavailable:gateway`;
- `upstream-unavailable:hypervisor`.

The unauthenticated `/ready` probe must return HTTP 503. Liveness is not used
as a substitute for dependency readiness.

The drill then terminates the suspended Sandbox process. The supervisor must:

1. observe the child exit;
2. emit its bounded `child.exited` diagnostic;
3. stop Gateway, Hypervisor, Grid, and the local ingress bridge;
4. exit with code 1 within ten seconds;
5. leave Gateway unreachable rather than operating a partial topology.

No production fault API is added. The drill process sends operating-system
signals directly to the child PID received through the private parent IPC
channel. This mechanism is available only to the host account already able to
control the supervisor's processes.

The same supervisor configuration is then restarted. The drill requires:

- all four services ready within twenty seconds;
- the intent committed before dependency loss still readable and completed;
- a new post-restart intent to complete;
- the exact four-service operations report to be ready;
- clean final shutdown.

This proves fail-closed process composition and durable-state continuity for
the injected failure. It does not prove an external orchestrator's restart
policy, multi-host failover, or availability during the restart window.

## Signed evidence and CI gate

Run on Linux:

```text
npm run resilience:drill -- /tmp/axiom-resilience-drill \
  > /tmp/axiom-resilience-drill-evidence.json
```

The workspace must be empty. The command emits
`axiom-resilience-drill-evidence.v1`, signed by the disposable Grid Ed25519
identity. Protected CI uploads:

```text
axiom-resilience-drill-evidence-<commit>
```

with 90-day retention.

Evidence contains:

- source revision and kernel version;
- exact resilience-policy digest;
- platform and bounded timings;
- oversized-body status and error code;
- burst accepted/rate-limited counts;
- observable rejection count and recovery time;
- degraded service and alert vocabularies;
- readiness status;
- supervisor exit code and shutdown time;
- restart, persisted-intent, post-restart intent, and final readiness results;
- every pass/fail assertion;
- Grid public verification key and Ed25519 attestation;
- explicit limitations.

Evidence omits request bodies, messages, intent identifiers, process IDs,
ports, operator tokens, data keys, private keys, and raw service logs. The
generator scans the completed evidence for active secret material before
returning it.

The incident tabletop treats this artifact as a required sixth same-revision
control. Missing, stale, malformed, unsigned, or failed resilience evidence
prevents the automated tabletop from passing.

## Operator response

In a real deployment, HTTP 413 is normally a client-contract issue. Repeated
413 responses may indicate incompatible clients or deliberate pressure.
Operators should not raise the body limit without reviewing the capability
contract, memory budget, reverse-proxy limits, and abuse impact.

HTTP 429 is an expected fail-closed response after a bucket is exhausted.
Investigate sustained rejection counts, identify whether pressure is bound to
one principal or source, preserve relevant bounded logs, and reduce authority
before increasing capacity. Do not disable authentication or rate limiting to
restore throughput.

A 503 readiness result means traffic should not be routed to the candidate.
If the supervisor exits after a child loss:

1. preserve the bounded supervisor diagnostic and service exit status;
2. determine whether the failure was expected maintenance, resource pressure,
   integrity failure, or compromise;
3. follow the incident severity policy;
4. verify secret and data-key custody before restart;
5. restart only the complete four-service topology;
6. verify operations readiness, Grid integrity, one prior record, and one new
   bounded intent;
7. retain the evidence and corrective owner.

Repeated child loss is not solved by an infinite restart loop. Apply an
orchestrator restart budget, backoff, and human escalation appropriate to the
pilot platform.

## Parallel drill endpoint leases

The production test runner executes independent real-stack drills
concurrently. Each launch therefore acquires an atomic cross-process lease for
one aligned block of four loopback ports before closing its availability
probes. The lease remains held while the supervisor is running and across
deliberate stopped-runtime rotation or restart gaps. Another drill that selects
the same block must choose a different block rather than racing the next
service bind.

Blocks begin on a four-port boundary, so two different lease names cannot
partially overlap. Actual loopback sockets are still probed after acquisition;
an externally occupied port causes the complete lease to be released and
another candidate selected. The owner record binds process, block, creation
time, purpose, and a random nonce. It is permission restricted, released only
by the matching owner, and idempotent. A dead owner is reclaimable only after a
bounded stale interval. This coordination is a test/drill reliability control,
not a production service-discovery or network-authorization mechanism.

Regression tests force two callers to select the same initial block, verify
that their assigned ports do not overlap, prove idempotent release and reuse,
and bind an external listener inside a candidate block to prove rejection.
Protected CI then exercises the SLO, resilience, telemetry, transport,
credential-rotation, data-key-rotation, and independent-unit drills under the
normal concurrent test runner.

## Pilot repetition and non-claims

Before production promotion, repeat the request-pressure and dependency-loss
exercise on the isolated pilot with:

1. actual container memory, CPU, PID, and file-descriptor limits;
2. disk-space and inode pressure in a disposable data volume;
3. slow, stopped, and terminated dependency processes;
4. host and container runtime event capture;
5. the real ingress proxy and client timeout policy;
6. expected peak traffic plus an agreed hostile-pressure margin;
7. orchestrator restart limits, exponential backoff, and alert routing;
8. operator acknowledgement and a corrective-action owner;
9. verification that encrypted state and recovery media remain intact;
10. independent review of the results.

The automated artifact closes the request-path and supervised-process
candidate mechanism. It does not close dedicated capacity validation,
thirty-day availability observation, cgroup exhaustion testing, pilot incident
handling, or independent security review.
