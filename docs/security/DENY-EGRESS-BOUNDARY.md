# Candidate Container Deny-Egress Boundary

**Status date:** 2026-07-29

**Scope:** single-container AXIOM-MESH `0.12.0-dev.2` production candidate

**Deployment claim:** candidate evidence only; no live deployment claim

The candidate container has no Ethernet interface. Compose uses
`network_mode: "none"`, so the four supervised processes communicate only
over container loopback. A bind-mounted Unix-domain socket provides explicit
host-local Gateway ingress without adding a network route. This closes the
candidate-host deny-egress implementation gate without claiming a multi-host
policy, an external adapter allowlist, or protection from a compromised
Docker daemon or host.

## Enforced topology

The supported Compose topology has one service and no attached Docker
network:

```text
authorized host operator
          |
 /run/axiom-mesh/gateway.sock
   bind-mounted Unix socket
          |
  local byte-stream bridge
          |
 Gateway 127.0.0.1:8080
          |
 AXIOM-MESH kernel container
   network_mode: "none"
   loopback interface only
```

`mesh/compose.production.yml` sets `network_mode: "none"`, mounts a dedicated
socket directory at `/run/axiom-mesh`, and sets
`AXIOM_REQUIRE_DENY_EGRESS=true`. The image carries the same enforcement
default. Gateway, Hypervisor, Sandbox, and Grid all bind to container
loopback. The supervisor creates `gateway.sock` with mode `0660` only after
the four services pass their startup checks.

This design adds no proxy container, privileged firewall sidecar, host-network
mode, `NET_ADMIN`, or external runtime dependency. The small local bridge runs
inside the existing supervisor, accepts only the Unix socket, and forwards
only to Gateway on `127.0.0.1`. The container remains non-root, drops every
Linux capability, and keeps `no-new-privileges`.

## Fail-closed startup

The production supervisor verifies the effective Linux network namespace
before starting any child service when deny-egress is required. It reads the
kernel route tables from `/proc/net/route` and `/proc/net/ipv6_route` and
requires:

- no active IPv4 default route;
- no active IPv6 default route;
- no active route on a non-loopback interface;
- Linux route-table syntax that can be parsed without ambiguity.

Production startup fails before Grid, Sandbox, Hypervisor, or Gateway launches
if the platform is not Linux, any non-loopback route exists, a default route
exists, or a required route table cannot be read. The Unix socket also fails
closed: its path must be absolute and bounded, an existing non-socket file is
never replaced, and failure to set restricted permissions aborts startup.
Host-mode drills do not set the enforcement flag because they are
process-boundary tests, not container network evidence.

## Protected CI proof

The container job performs complementary positive and negative controls:

1. From the GitHub runner, it opens TCP port 443 on the public probe target.
   This establishes that the runner and target are reachable before the
   negative assertion.
2. Compose starts the candidate with `network_mode: "none"`.
3. Host-local `/ready` and authenticated `/v1/operations` requests traverse
   the bind-mounted Unix socket, proving that intended ingress and the
   four-service path still work without port publication.
4. Inside the running container, the drill re-inspects both route tables,
   verifies loopback Gateway readiness, and attempts the same public TCP
   destination.
5. Any non-loopback route or successful container connection fails the job.
6. Grid signs a secret-free evidence object. Protected CI retains
   `axiom-deny-egress-evidence-<commit>` for 90 days.

The evidence records only the source revision, kernel version, route counts,
absence of default and non-loopback routes, successful runner and Unix-socket
control flags, public-probe outcome class, loopback status, local-ingress
transport class, public Grid key, and Ed25519 attestation. The protected
workflow passes the two control flags only after their steps succeed. The
artifact contains no tokens, private keys, route addresses, host paths, or
request payloads.

## Verification and rollback

Static release verification requires all of the following to remain present:

- `network_mode: "none"` in the Compose service;
- loopback-only Gateway binding and Unix-domain host ingress;
- the deny-egress environment requirement in both image and Compose policy;
- the startup route check;
- the runner positive control and in-container negative probe;
- signed evidence upload tied to the commit.

Removing any marker fails unit or release verification. Changing
`network_mode: "none"` to host networking has an explicit negative-path test.
Linux tests also exercise the Unix bridge and verify that it refuses to
replace a non-socket path.

If a runtime cannot satisfy this topology, do not disable
`AXIOM_REQUIRE_DENY_EGRESS`. Stop the deployment and roll back to the prior
non-promoted candidate while selecting a platform with an equivalent
deny-by-default network policy. A temporary exception cannot waive ambient
egress for production.

## Threat boundary and residual risk

The Docker daemon, kernel, host administrator, bind mount, and host filesystem
permissions remain trusted. Membership in the group permitted to connect to
`gateway.sock` is equivalent to local Gateway reachability; API authentication
and authorization still apply after connection. This control proves that the
candidate container has no non-loopback route and cannot complete the selected
public TCP probe. It is not a defense against a malicious or compromised host
reconfiguring the namespace or replacing mounted resources.

The candidate enables no external provider adapter. A future approved adapter
must not attach the kernel container to an ambient network. It requires a
separate deployable adapter with an explicit destination allowlist,
authenticated transport, DNS and redirect controls, bounded retry and budgets,
credential isolation, negative tests, and signed deployment evidence.

Multi-host deployment remains unsupported. Kubernetes, Nomad, cloud firewall,
or other orchestrator policies must reproduce the same deny-by-default result
and provide independently reviewed ingress and egress evidence before
replacing this Compose topology.
