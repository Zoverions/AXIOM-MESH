# External Telemetry and Alert Routing

**Status:** implemented for the automated production candidate; pilot
destinations and live operating evidence remain pending

**Updated:** 2026-07-28

**Applies to:** AXIOM-MESH 0.11.0 clean-room kernel

This runbook defines the supported external observability boundary. The
four-process kernel continues to run with no network interface and no egress.
A separate, unprivileged host-side telemetry relay reads the authenticated
Gateway telemetry endpoints through the permission-restricted Unix-domain
socket. The relay converts the already bounded service report to OTLP/HTTP
JSON and routes the fixed alert vocabulary to an Alertmanager v2 endpoint.

The relay is not a general webhook client, log forwarder, proxy, or extension
runtime. It cannot submit intents, read application records, attach
user-controlled labels, follow redirects, select arbitrary destinations, or
grant the kernel network access.

## Enforced relay boundary

The production data flow is:

```text
four-process kernel (network_mode: none)
            |
            | authenticated GET over gateway.sock
            | telemetry:collect only
            v
host-side telemetry relay
      |                      |
      | OTLP/HTTP JSON       | Alertmanager API v2
      | exact HTTPS origin   | exact HTTPS origin
      v                      v
operator collector      operator alert service
```

`provision:production` creates a separate `telemetry-relay.token` and registers
it as the service principal `production-telemetry-relay`. Its sole scope is
`telemetry:collect`. Gateway admits that scope only for `GET /v1/operations`
and `GET /v1/metrics`; any attempt to use it on another route is rejected with
HTTP 403. Missing or retired tokens are rejected with HTTP 401. The operator
token is not used by the relay.

The relay runs outside the candidate container because Compose enforces
`network_mode: "none"`. This separation is intentional: the kernel retains no
external network authority, while the host service receives only the narrow
outbound authority needed for two configured receivers. The Gateway socket
and relay state directory should be owned by a dedicated operating-system
account. Do not run the relay as root.

The canonical policy is
[`mesh/config/telemetry-routing.json`](../../mesh/config/telemetry-routing.json).
It fixes:

- Unix-domain HTTP as the only scrape transport;
- a 30-second collection interval and three-second scrape timeout;
- a 256 KiB maximum response;
- exactly four service names;
- exactly four metric attribute keys and four alert label keys;
- OTLP/HTTP JSON at `/v1/metrics`;
- Alertmanager v2 at `/api/v2/alerts`;
- queue, item, retry, receipt-history, and resolution-replay ceilings;
- a forbidden telemetry vocabulary covering principals, prompts, payloads,
  queries, object and intent identifiers, approvals, and tokens.

Production destination configuration is deployment-owned and must not be
committed. Use this shape:

```json
{
  "schema": "axiom-telemetry-destinations.v1",
  "version": 1,
  "allowed_origins": [
    "https://otel.example.net",
    "https://alerts.example.net"
  ],
  "metrics": {
    "url": "https://otel.example.net/v1/metrics",
    "credential_file": "/run/axiom-relay/otel.token"
  },
  "alerts": {
    "url": "https://alerts.example.net/api/v2/alerts",
    "credential_file": "/run/axiom-relay/alertmanager.token"
  }
}
```

Origins must be exact, credential-free HTTPS origins without paths, queries,
or fragments. Each endpoint must use its protocol's fixed path and match one
of those origins. Redirects are rejected so authorization cannot move to a
different host. Receiver credentials are absolute-path, private regular files
and never enter queue state, logs, evidence, or delivery bodies. Private PKI
deployments should provide their CA through the Node runtime trust mechanism;
TLS verification must not be disabled.

## Metric and alert contracts

The relay independently validates and reconstructs the operations report. It
requires the exact `gateway`, `grid`, `hypervisor`, and `sandbox` topology,
then exports 68 bounded metric points:

- readiness and uptime gauges;
- request counters across the fixed `2xx`, `3xx`, `4xx`, and `5xx` classes;
- one cumulative duration histogram per service;
- fixed authentication, authorization, replay, and rate-limit counters;
- fixed upstream-unavailability, internal-error, and integrity counters;
- resident-memory gauges and user/system CPU counters.

Only `service`, `status_class`, `kind`, and `mode` appear as metric point
attributes. The two resource attributes are fixed by code. Cumulative
histogram buckets must be monotonic; an invalid or changed topology fails the
scrape rather than being forwarded.

The fixed alert names are:

- `AxiomServiceNotReady`;
- `AxiomIntegrityFailure`;
- `AxiomReplayRejected`;
- `AxiomAuthenticationFailures`;
- `AxiomServerErrorRatio`;
- `AxiomServiceSaturated`;
- `AxiomUpstreamUnavailable`.

Alert labels are limited to `alertname`, `service`, `severity`, and `source`.
Annotations are static summaries and the generator URL points to the supported
operator documentation. The client retains the first observed firing time,
resends active alerts, and replays resolution records for five minutes. This
matches Alertmanager's stateless client behavior without adding identifiers
from requests or application objects.

## Queue, retry, and delivery audit

The relay state is a private, versioned JSON file whose queued bodies are
integrity-checked with exact content digests. A single-process lock rejects
concurrent writers.
Every queue item has a stable delivery ID, canonical-body digest, byte count,
creation time, attempt number, and next-attempt time. Receiver authentication
is added only at send time.

The default queue holds at most 64 items and 1 MiB. Sixteen item positions are
reserved for alerts. New metric snapshots coalesce older queued metric
snapshots; they cannot consume the alert reserve. An alert may evict a queued
metric if the overall queue is full, but an alert is never silently evicted.
If the queue contains only alerts and is full, the cycle fails visibly and the
existing alerts remain preserved.

HTTP 408, 425, 429, 500, 502, 503, and 504 responses, plus transport failures,
are retried with exponential delays from one to 30 seconds. No item receives
more than five attempts. Other 4xx responses enter the bounded dead-letter
audit immediately because they normally indicate a credential, policy, or
receiver configuration error. OTLP `partialSuccess.rejectedDataPoints` is
also treated as rejection. HTTP response bodies are bounded.

Every attempt produces a secret-free audit outcome:

- `delivered`, with HTTP status and a syntactically bounded optional receiver
  receipt ID;
- `retry_scheduled`, with status and bounded error code;
- `dead_letter`, with status and bounded error code.

The delivery ID is also sent as `Idempotency-Key`; the canonical content
digest is sent as `X-Axiom-Payload-SHA256`. A receiver should deduplicate by
the delivery ID and return a stable receipt in `X-Axiom-Receipt-ID`. Because a
process can stop after the receiver accepts but before local state is saved,
the receiver must tolerate at-least-once delivery.

Queue depth, retry count, dead-letter count, and delivery count appear in each
structured `relay.cycle` log. Operators must alert on a nonzero dead-letter
count, an alert-only full queue, repeated scrape failure, or lack of a
successful cycle for twice the configured interval.

## Operation

Create an operator-owned destination file and two receiver credential files.
Keep the destination file and state outside the repository. Start the relay
under a service manager:

```text
npm run telemetry-relay:start -- \
  /run/axiom-mesh/gateway.sock \
  /run/axiom-secrets/telemetry-relay.token \
  /etc/axiom-mesh/telemetry-destinations.json \
  /var/lib/axiom-telemetry-relay
```

Append `--once` for a single validation cycle. The state directory and each
credential file must be inaccessible to group and other users. Production
startup fails on a symlinked credential, insecure mode, invalid policy,
non-HTTPS URL, origin mismatch, unexpected endpoint path, concurrent state
lock, oversized queue, changed digest, or malformed receiver response.

Coordinated `rotate:production` rotates the telemetry scrape token together
with the operator token and four service identities. Stop both the kernel and
relay first. Restart the kernel with the new registry, then restart the relay
with the new token file. The signed rotation drill proves that the retired
relay token returns 401, the successor works only on telemetry routes, and
rollback exactly restores the original token. Receiver credentials are owned
by their external systems and require their own rotation procedure.

To disable delivery without weakening kernel isolation, stop the host relay.
Queue state is preserved. To roll back relay code, stop it, preserve
`state.json` as evidence, deploy the previously verified commit, and start
only if its policy digest matches the state. Do not manually edit queue state;
digest or policy mismatch is designed to fail closed.

## Signed CI proof

Run:

```text
npm run telemetry-relay:drill -- <empty-disposable-workspace>
```

On Linux, the drill starts the actual four-process production supervisor in
host mode with
Unix-domain ingress, uses the dedicated relay credential, proves missing
authentication returns 401 and an out-of-scope route returns 403, injects the
bounded authentication-failure alert, scrapes both telemetry endpoints, and
delivers real HTTP requests to isolated loopback receivers. Those receivers
return one 503 and one 429 before accepting the retries, so both retry paths
and delivery receipts are exercised. Production policy still rejects HTTP;
loopback HTTP is enabled only inside the injected drill adapter. The separate
same-revision container artifact proves `network_mode: none` and blocked
egress; the host-mode relay drill does not independently claim network-policy
enforcement.

The Grid identity signs `axiom-telemetry-relay-drill-evidence.v1`. Evidence
contains the source revision, policy digest, topology, OpenMetrics digest,
point and byte counts, queue limits, retry and receipt summaries, negative
checks, timings, public verification key, and limitations. It contains no
scrape credential, receiver credential, operator token, raw service report,
or queued body. Protected CI retains
`axiom-telemetry-relay-evidence-<commit>` for 90 days.

## Pilot repetition and non-claims

The automated drill closes candidate implementation for PILOT-002 and
PILOT-003. It does not prove that a pilot collector or on-call destination is
available, that a named person acknowledged an alert, or that retention and
regional handling meet deployment-specific obligations.

Before production promotion, repeat the procedure with:

1. operator-owned HTTPS OTLP and Alertmanager endpoints;
2. independently custodied scrape and receiver credentials;
3. documented CA trust and receiver-side authorization;
4. receiver deduplication and stable delivery receipts;
5. forced timeout, 429, 503, credential rejection, and receiver recovery;
6. measured queue growth under an outage longer than the retry window;
7. a named on-call route and acknowledgement measurement;
8. external retention, access, deletion, and incident procedures;
9. independent review of the destination allowlist and service-manager unit.

Until those records are attached to the deployment dossier, AXIOM-MESH
remains a production candidate. The CI artifact is evidence of bounded
candidate behavior, not evidence of a live external telemetry deployment.
