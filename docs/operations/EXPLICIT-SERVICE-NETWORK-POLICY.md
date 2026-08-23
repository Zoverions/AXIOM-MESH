# Explicit Service Network Policy

**Applies to:** `0.12.0-dev.3`

**Status:** implemented single-host candidate control

**Updated:** 2026-08-23

## Enforced policy boundary

AXIOM-MESH uses a machine-readable default-deny policy for communication
among Gateway, Hypervisor, Sandbox, Grid, and the compact-topology supervisor.
The policy is
[`mesh/config/service-network-policy.json`](../../mesh/config/service-network-policy.json).
Its runtime validator and authorizer are
[`mesh/src/lib/service-network-policy.mjs`](../../mesh/src/lib/service-network-policy.mjs).

The policy permits only the current build's exact source service, destination
service, HTTP method, and route-pattern combinations. There is no wildcard
service, wildcard method, wildcard path, arbitrary URL, or default-allow
fallback. The active policy contains 10 grouped flows and 42 exact current route
permissions, including bounded supervisor and self-health probes.

Every internal `signedFetch` request is authorized before request signing or
network I/O. Each receiving service independently applies the same exact
caller, destination, method, and route decision: to the active mTLS peer
before reading a request body, and to the verified signed caller in the
loopback development topology. Thus a valid service certificate or signature
cannot be used to reach another route that happens to exist on the same
destination. A disallowed request fails with `service_network_policy_denied`.
The failure result names only the bounded source, destination, method, and
path; it does not disclose credentials, request bodies, or query values.

The same policy derives each TLS server's allowed transport peers:

| Destination | Allowed TLS peers |
|---|---|
| Grid | Gateway, Hypervisor, Grid self-health, compact supervisor |
| Hypervisor | Gateway, Hypervisor self-health, compact supervisor |
| Sandbox | Hypervisor, Sandbox self-health, compact supervisor |
| Gateway | No service-network listener; loopback plus Unix-domain host ingress |

An active CA-valid leaf is therefore insufficient by itself. The destination
also requires the peer service to appear in this policy, and authenticated
application routes still require the signed caller permitted by that service.
Transport certificate identity, signed application identity, and route policy
must agree.

The public boundary is unchanged. Gateway binds loopback inside its container
and is exposed only through the permission-restricted Unix-domain socket. The
policy declares zero published TCP ports. The compact one-container topology
retains `network_mode: "none"` and the runtime route rejection. The
four-container topology uses the segmentation below.

## Exact communication graph

The current application graph is:

```text
local operator
     |
     | Unix-domain socket
     v
  Gateway --------GET/POST--------> Hypervisor
     |                                  |  \
     |                                  |   \ GET/POST
     |                                  |    v
     +-------------GET----------------> Grid   Sandbox
                                        ^
                                        |
                              Hypervisor GET/POST
```

Gateway may request Hypervisor operations and submit normalized intents.
Gateway may read the exact Grid query routes used by the public operator
surface. That read set includes one remote-social inspection edge:
`GET /internal/v1/social/remote-review/:owner`. It is allowed only from
Gateway to Grid, only with `GET`, and only because the public Gateway route
derives `:owner` from the authenticated principal. The Grid handler uses a
no-migration read adapter over the accepted `SocialGridStore` and returns the
bounded G5A review projection; it creates no remote schema and performs no
staging, admission, follow/unfollow, cleanup, transport, recommendation,
network, or authority effect.

Hypervisor may read policy/status/approval state and commit state transitions
to Grid. The governed Education convergence adds one further exact
Hypervisor-to-Grid permission:
`POST /internal/v1/education/learner-progress`. It is an authenticated internal
Education query/commit-support edge used by the Hypervisor learner-read path;
it is not public ingress, general Grid access, provider activation, curriculum
authority, or an alternate execution path. The Education result remains bound
to the exact request/result digests and the surrounding authority checks.
Hypervisor alone may request Sandbox operations or execution. Grid and Sandbox
have no application egress permissions.

The policy does not allow:

- Gateway to call Sandbox directly;
- Grid to call Gateway, Hypervisor, or Sandbox;
- Sandbox to call Gateway, Hypervisor, or Grid;
- Hypervisor to call a Gateway route;
- Hypervisor to call the remote-social review Grid route;
- Gateway to call the Education learner-progress Grid route;
- `GET` access to the Education learner-progress route;
- a `POST` to the remote-social review route or any other read-only Grid route;
- a `GET` to Grid commit or Sandbox execution;
- an unknown `/internal/` path;
- a URL containing credentials or a fragment;
- a health identity to call an application route.

Route parameters such as intent, principal, owner, approval, export, backup,
and bundle identifiers match exactly one path segment. They are not
path-prefix wildcards. Query values remain subject to the destination
handler's existing type, size, authorization, ownership, and scope checks.
The remote-social review edge accepts the owner only in its internal path;
public clients cannot select that value because Gateway constructs it from the
authenticated `principal.id` and rejects query overrides. The Education edge
accepts no alternate caller or method simply because its Grid handler exists.

Plaintext development service URLs are restricted to loopback hosts. A
development configuration cannot point an unsigned HTTP internal URL at a
remote host. Production continues to require HTTPS for every internal URL,
TLS 1.3, the expected DNS and SPIFFE-style service identity, and the exact
active certificate fingerprint.

## Four-segment unit topology

The independently deployable unit topology no longer attaches every service
to one shared internal network. It defines four Docker `internal: true`
bridge segments:

| Segment | Members |
|---|---|
| `gateway-hypervisor` | Gateway, Hypervisor |
| `gateway-grid` | Gateway, Grid |
| `hypervisor-grid` | Hypervisor, Grid |
| `hypervisor-sandbox` | Hypervisor, Sandbox |

Gateway and Sandbox share no network. Grid and Sandbox share no network.
Gateway cannot resolve or connect to Sandbox through Compose DNS, and Sandbox
cannot resolve or connect to Grid. Hypervisor is the intended policy junction.

Docker network membership is necessarily bidirectional at the packet layer.
For example, Grid and Hypervisor share a segment because Hypervisor must call
Grid. Direction is enforced above that layer: Hypervisor's TLS listener rejects
Grid as an inbound peer, and the application authorizer gives Grid no outbound
route. Segmentation removes unrelated adjacency; mTLS peer selection and the
exact request allowlist impose direction and route authority.

Every segment must be present, internal, and use the bridge driver. Each
service must have exactly the segment inventory derived from the policy.
Adding a common network, adding a service to another segment, removing a
required segment, making a segment external, publishing a port, or selecting
host/ordinary bridge network mode fails the policy checker and release
verification.

Run the read-only checker from the repository root:

```bash
npm run network-policy:check
```

The receipt records the schema, kernel version, default action, policy digest,
segment/flow/route counts, service count, and a digest of the normalized
Compose segmentation. It contains no addresses, certificates, tokens, or
request data.

## Runtime and protected-CI proof

The normal kernel suite includes negative tests for:

- policy identity, exact-field, flow-order, and exact-digest drift;
- a default-allow change;
- published Gateway TCP ingress;
- a shared or enlarged network segment;
- an added service flow;
- a replaced or wildcard route;
- wrong callers, destinations, methods, and paths at both sending and
  receiving boundaries;
- Gateway-only GET enforcement for the remote-social review edge, including
  Hypervisor and POST rejection;
- Hypervisor-only POST enforcement for the Education learner-progress edge,
  including Gateway and GET rejection;
- credential-bearing and fragment-bearing URLs;
- missing, extra, external, or published Compose networks;
- a forbidden-edge probe that must fail when a connection succeeds.

All 38 implemented internal routes are checked against the same current
machine-readable allowlist; a detached or half-wired modular Education route
cannot silently become policy-equivalent to an implemented route.

Protected CI builds the current image, starts the four segmented units, and
waits for the full authenticated operations report. That success traverses
all required application edges: Gateway to Hypervisor and Grid, Hypervisor to
Grid, and Hypervisor to Sandbox. CI then executes forbidden network probes
from running containers:

```bash
docker compose -f compose.units.yml exec -T gateway \
  node src/network-policy-probe.mjs sandbox 8082
docker compose -f compose.units.yml exec -T sandbox \
  node src/network-policy-probe.mjs grid 8083
docker compose -f compose.units.yml exec -T grid \
  node src/network-policy-probe.mjs sandbox 8082
```

The probe exits successfully only when the forbidden hostname cannot resolve,
the connection is rejected, or the bounded timeout expires. A successful TCP
connection makes the check fail. The existing public-network probe separately
proves that a running Gateway unit cannot connect to the public control
target.

After the negative probes, the protected workflow still stops only Sandbox,
requires Gateway readiness to degrade, verifies the three survivor container
identities, starts only Sandbox, and requires full readiness recovery. Network
segmentation therefore cannot be accepted merely because a static file
parses; the complete required service path and failure-isolation behavior must
continue to work.

Release verification independently validates the policy file and exact
Compose membership. Release provenance includes the policy digest, deny
default, counts, and segmentation digest. A changed policy or topology cannot
produce a valid release receipt unless code, tests, documentation, and
release expectations are intentionally updated together.

## Operator verification and rollback

Before starting an independently deployed candidate:

1. run `npm run network-policy:check`;
2. render the Compose configuration and confirm only the four named internal
   networks exist;
3. start the units and require Gateway `/ready` plus the authenticated
   four-service operations report;
4. repeat the three forbidden-edge probes;
5. confirm there is no published TCP port and public egress remains blocked;
6. retain the image digest, policy digest, Compose digest, and protected
   workflow result with the deployment record.

If a required edge fails, do not attach all services to a shared network and
do not widen the route policy. Preserve the failing receipt and logs, stop the
units, and compare the deployed image, policy, Compose rendering, DNS
membership, active leaf fingerprints, and service URLs with the protected
commit.

Rollback means restoring the prior image and its matching policy and Compose
definition as one unit. A prior image with a newer policy, or a new image with
an older topology, is not an exact rollback. Grid durable state and its
data-protection key follow the existing backup/migration rules; this network
policy change does not authorize replacing or copying Grid state.

An alternate orchestrator must reproduce both layers:

- network-level removal of unrelated adjacency and public egress; and
- identity-, direction-, method-, and route-level request authorization.

A flat private network alone is not equivalent. A service mesh allowlist alone
is also insufficient if the workload can bypass it through another interface.
The pilot dossier must bind the actual orchestrator policy and its observed
negative evidence, not merely this reference Compose file.

## Pilot repetition and non-claims

This control closes the repository-owned single-host candidate mechanism. It
does not prove the policy of a Kubernetes cluster, cloud security group,
service-mesh control plane, host firewall, or independently operated network.
Production promotion still requires the pilot operator to reproduce the
allowlist, bind the exact deployed artifacts, retain negative-path evidence,
and obtain independent review.

This milestone does not claim:

- a multi-host deployment or a live pilot;
- remote workload dispatch to scheduled nodes;
- WAN routing, federation, or Grid replication;
- live remote-social transport, public remote Following, recommendation, or
  admission effect APIs;
- public Education deployment, curriculum/provider activation, or learner-data
  authority outside the governed internal path;
- automatic failover, leader election, or consensus;
- that Docker's internal network is a universal egress control;
- that an external orchestrator implements this policy;
- that the development build is production-promoted.

The implemented claim is narrower: current source requests fail closed against
an exact machine-readable 42-route application graph, the reference four-unit
topology removes unrelated Docker adjacency through four internal segments,
protected CI proves both required-path operation and selected forbidden
network edges, the remote-social addition remains a Gateway-only bounded
owner-review read path, and the Education addition is one Hypervisor-only POST
edge whose existence does not create public ingress or independent authority.