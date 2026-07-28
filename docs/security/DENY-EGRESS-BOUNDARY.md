# Candidate Container Deny-Egress Boundary

**Status date:** 2026-07-28

**Scope:** single-container AXIOM-MESH 0.11 production candidate

**Deployment claim:** candidate evidence only; no live deployment claim

The candidate container uses an internal Docker bridge network to preserve
explicit host-loopback ingress while removing the container network
namespace's default route to external IPv4 and IPv6 destinations. This closes
the candidate-host deny-egress implementation gate without claiming a
multi-host policy, an adapter allowlist, or protection from a compromised
Docker daemon or host.

## Enforced topology

The supported Compose topology has one service and one network:

```text
host 127.0.0.1:<configured-port>
                 |
          published TCP 8080
                 |
        internal Docker bridge
                 |
     AXIOM-MESH kernel container
       Gateway 0.0.0.0:8080
       other services 127.0.0.1
                 |
          no default route
```

`mesh/compose.production.yml` sets `internal: true` on the only attached
network, publishes Gateway only on host `127.0.0.1`, and sets
`AXIOM_REQUIRE_DENY_EGRESS=true`. The image carries the same enforcement
default. Hypervisor, Sandbox, and Grid remain reachable only on container
loopback.

This design does not add a proxy, privileged firewall sidecar, host-network
mode, `NET_ADMIN`, or another runtime dependency. The container remains
non-root, drops every Linux capability, and keeps `no-new-privileges`.

## Fail-closed startup

The production supervisor verifies the effective Linux network namespace
before starting any child service when deny-egress is required. It reads the
kernel route tables from `/proc/net/route` and `/proc/net/ipv6_route` and
requires:

- no active IPv4 default route;
- no active IPv6 default route;
- at least one active non-loopback link route, proving that the expected
  isolated ingress network exists rather than accepting `network_mode: none`;
- Linux route-table syntax that can be parsed without ambiguity.

Production startup fails before Grid, Sandbox, Hypervisor, or Gateway launches
if the platform is not Linux, a default route exists, the isolated link is
missing, or a required route table cannot be read. Host-mode drills do not set
the enforcement flag because they are process-boundary tests, not container
network evidence.

## Protected CI proof

The container job performs complementary positive and negative controls:

1. From the GitHub runner, it opens TCP port 443 on the public probe target.
   This establishes that the runner and target are reachable before the
   negative assertion.
2. Compose starts the candidate with the internal network.
3. Host-loopback `/ready` and authenticated `/v1/operations` requests prove
   that intended ingress and the four-service path still work.
4. Inside the running container, the drill re-inspects both route tables,
   verifies loopback Gateway readiness, and attempts the same public TCP
   destination.
5. Any successful container connection fails the job.
6. Grid signs a secret-free evidence object. Protected CI retains
   `axiom-deny-egress-evidence-<commit>` for 90 days.

The evidence records only the source revision, kernel version, route counts,
absence of default routes, public-probe outcome class, loopback status, public
Grid key, and Ed25519 attestation. It contains no tokens, private keys, route
addresses, host paths, or request payloads.

## Verification and rollback

Static release verification requires all of the following to remain present:

- `internal: true` on the Compose network;
- loopback-only host publication;
- the deny-egress environment requirement in both image and Compose policy;
- the startup route check;
- the runner positive control and in-container negative probe;
- signed evidence upload tied to the commit.

Removing any marker fails unit or release verification. Changing
`internal: true` to `internal: false` has an explicit negative-path test.

If a runtime cannot satisfy this topology, do not disable
`AXIOM_REQUIRE_DENY_EGRESS`. Stop the deployment and roll back to the prior
non-promoted candidate while selecting a platform with an equivalent
deny-by-default network policy. A temporary exception cannot waive ambient
egress for production.

## Threat boundary and residual risk

The Docker daemon, kernel, host administrator, and published-port forwarding
remain trusted. Docker's internal network may permit host-to-container
communication needed for the published port, so host services and firewall
policy remain part of the deployment trust boundary. This control proves that
the candidate container has no default external route; it is not a defense
against a malicious or compromised host reconfiguring the namespace.

The candidate enables no external provider adapter. A future approved adapter
must not weaken this network globally. It requires a separate deployable unit
or an explicit destination allowlist, authenticated transport, DNS and
redirect controls, bounded retry and budgets, credential isolation, negative
tests, and signed deployment evidence.

Multi-host deployment remains unsupported. Kubernetes, Nomad, cloud firewall,
or other orchestrator policies must reproduce the same deny-by-default result
and provide their own independently reviewed evidence before replacing this
Compose topology.
