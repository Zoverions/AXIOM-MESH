# Independent service units and failure isolation

**Updated:** 2026-07-29

**Applies to:** AXIOM-MESH `0.12.0-dev.0` supported development build
**Evidence schema:** `axiom-service-unit-drill-evidence.v1`  
**Deployment definition:** `mesh/compose.units.yml`

This runbook describes the four-unit candidate topology. Gateway, Grid,
Hypervisor, and Sandbox run as independently restartable operating-system
processes or containers. It supplements the supported single-container
supervisor topology; it does not turn the system into a distributed database,
provide consensus, or establish a live production deployment.

## Enforced unit and trust boundary

Production provisioning first creates the complete offline source credential
set. A second, explicit projection command derives four service directories.
Each derived directory contains:

- exactly one private Ed25519 application identity, for that unit;
- public application trust records for all four services;
- the public transport CA certificate and active public manifest;
- exactly one private TLS leaf and its public certificate, for that unit; and
- durable Grid files only when the unit is Grid.

The projection rejects another service's application private key, another
service's TLS private key, a transport CA private key, shared API credentials,
an operator token, or non-Grid durable state inside a unit. Its manifest binds
the projection to the source application key IDs, public-trust digests,
transport generation, CA fingerprint, and four active leaf fingerprints.
Running the command again is idempotent only while those source records remain
identical. Rotation makes an old projection stale and validation fails closed.

The source credential directory is an offline staging boundary, not a runtime
mount. Do not mount it into a four-unit deployment. In particular, never mount
the CA signing key or the complete `services/` private-key set into a unit.

Grid is the only durable-state owner and the only unit receiving the
data-protection key. Gateway alone receives the API token registry. Hypervisor
and Sandbox receive neither shared secret. The operator token remains on the
host and is not mounted into any container.

All internal traffic still uses TLS 1.3, an exact active certificate pin, DNS
and SPIFFE-style URI service identity, and the signed request envelope.
Container DNS is only address discovery; the cryptographic peer name comes
from the expected service audience. A network-reachable process with the wrong
leaf, an inactive leaf, or the wrong signed caller is rejected.
The exact source/destination/method/route graph and policy-derived mTLS peer
sets are documented in the
[explicit service network policy](EXPLICIT-SERVICE-NETWORK-POLICY.md).

## Provision and start

Create the full source set outside the repository, then create an empty runtime
projection directory:

```bash
cd mesh
node src/provision-production.mjs \
  /srv/axiom-mesh/source-data \
  /srv/axiom-mesh/secrets
node src/provision-service-units.mjs \
  /srv/axiom-mesh/source-data \
  /srv/axiom-mesh/secrets/transport \
  /srv/axiom-mesh/units
chown -R 10001:10001 /srv/axiom-mesh/units
```

Retain the complete source set and CA signing key under offline operator
custody. The projected Grid data directory becomes the active durable
directory. Once Grid has accepted traffic, do not recreate that directory
from the unchanged source projection: doing so would discard active state.
Back up and restore the active Grid unit through the documented encrypted
backup lifecycle.

Set the host paths:

```bash
export AXIOM_UNITS_DIR_HOST=/srv/axiom-mesh/units
export AXIOM_GATEWAY_SOCKET_DIR_HOST=/srv/axiom-mesh/run
export AXIOM_DATA_KEY_FILE_HOST=/srv/axiom-mesh/secrets/data-protection.key
export AXIOM_API_TOKENS_FILE_HOST=/srv/axiom-mesh/secrets/api-tokens.json
install -d -o 10001 -g 10001 -m 0750 \
  "${AXIOM_GATEWAY_SOCKET_DIR_HOST}"
docker compose -f compose.units.yml up -d
```

The Compose definition publishes no TCP port. Gateway listens on loopback
inside its unit and exposes the existing permission-restricted Unix-domain
socket through a bind mount. The other units listen only on four exact
`internal: true` bridge segments: `gateway-hypervisor`, `gateway-grid`,
`hypervisor-grid`, and `hypervisor-sandbox`. Gateway/Sandbox and Grid/Sandbox
have no shared network. The segments permit required adjacency but have no
external connectivity.

Every unit runs as numeric UID/GID `10001`, uses a read-only root filesystem,
drops all Linux capabilities, enables `no-new-privileges`, bounds process,
memory and CPU use, has a bounded no-execute temporary filesystem, and uses
bounded log rotation. Non-Grid data projections and all transport projections
are mounted read-only. Grid's data projection is its one writable persistent
mount.

The single-container supervisor uses `network_mode: none` and performs a route
inspection before launch. That exact inspection cannot be enabled in the
four-unit topology because the units require an internal route to one another.
The four-unit boundary instead relies on segmented Docker internal networks,
the exact application request policy, policy-derived mTLS peers, and protected
negative network probes from running units. An alternate orchestrator must
provide and independently test equivalent adjacency, direction, route, and
default-deny egress controls; setting `AXIOM_REQUIRE_DENY_EGRESS=false`
without that external policy is not an approved deployment.

## Dependency graph and readiness

The required call graph is:

```text
operator -> Gateway -> Hypervisor -> Sandbox
                    \-> Grid <-/
```

Gateway liveness means only that its process can answer. Gateway readiness
requires both Hypervisor and Grid. Hypervisor readiness requires Sandbox and
Grid. Grid and Sandbox readiness require their local identity and integrity
checks. Consequently, loss of Sandbox makes Hypervisor and Gateway not ready,
even though their liveness endpoints and processes remain available.

Each internal container healthcheck uses that service's own active TLS leaf to
request its unauthenticated `/health` endpoint over TLS 1.3. This self-probe
permission does not grant application authority: authenticated internal
routes still verify the signed caller against their narrower allowlist.
Gateway health uses its loopback HTTP endpoint because it is the public
termination service.

Verify initial readiness and the authenticated topology report through the
socket:

```bash
curl --fail \
  --unix-socket /srv/axiom-mesh/run/gateway.sock \
  http://localhost/ready
TOKEN="$(tr -d '\n' </srv/axiom-mesh/secrets/operator.token)"
curl --fail \
  --unix-socket /srv/axiom-mesh/run/gateway.sock \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost/v1/operations
```

The operations result must be `axiom-operations.v1`, report status `ready`,
and include exactly Gateway, Grid, Hypervisor, and Sandbox with ready service
states. A partial report is not a successful startup.

## Failure-isolation and recovery sequence

The protected failure exercise deliberately stops Sandbox while retaining the
other three container identities. Operators can repeat the mechanism in a
maintenance environment:

```bash
GATEWAY_ID="$(docker compose -f compose.units.yml ps -q gateway)"
GRID_ID="$(docker compose -f compose.units.yml ps -q grid)"
HYPERVISOR_ID="$(docker compose -f compose.units.yml ps -q hypervisor)"
docker compose -f compose.units.yml stop sandbox
```

Expected behavior:

1. Gateway, Grid, and Hypervisor container IDs are unchanged and remain
   running.
2. Gateway `/ready` returns HTTP `503`.
3. Authenticated operations remain observable and do not claim `ready`.
4. No request is silently authorized because Sandbox is absent.
5. Grid retains all pre-fault intent and evidence state.

Recover only the failed dependency:

```bash
docker compose -f compose.units.yml start sandbox
```

Wait until Gateway readiness returns HTTP `200`, then compare the three
survivor IDs to the recorded values. They must remain identical. Submit one
low-risk `system.echo` intent, retrieve a pre-fault intent by ID, and verify
both are completed. Restarting all four units can conceal a coupling bug and
does not satisfy the failure-isolation check.

If Sandbox repeatedly fails, leave Gateway not ready, preserve Grid and
container logs, and follow incident policy. Do not bypass Hypervisor, weaken
readiness, or route execution to an unadmitted replacement.

If Grid fails, stop mutation traffic. A replacement Grid must use the same
active durable directory and protected key or follow the verified backup and
restore procedure. Never start two Grid units against one SQLite directory;
the runtime lock rejects concurrent ownership, and bypassing it risks evidence
corruption.

## Signed drill and verification

The host-side drill uses four independent child processes and no supervisor:

```bash
mkdir -m 700 /tmp/axiom-service-unit-drill
npm run service-units:drill -- /tmp/axiom-service-unit-drill \
  > /tmp/axiom-service-unit-drill-evidence.json
```

It provisions disposable production credentials, projects four unit
directories, starts the services independently, submits a pre-fault intent,
terminates Sandbox, verifies survivor continuity and dependency degradation,
restarts only Sandbox, verifies readiness recovery, reads the pre-fault Grid
record, and submits a post-recovery intent. Grid signs the secret-free result
with its projected application identity.

The evidence intentionally excludes process identifiers, absolute paths,
tokens, data-protection material, CA private material, and service private
keys. Its verifier requires all checks to be true, four exact unit names,
independent process execution, Sandbox-only recovery, HTTP `503` during loss,
ready status before and after, successful persistence reads, Ed25519 signer
metadata, and a valid signature over the canonical unsigned record.

Protected CI retains that artifact for 90 days and links it into the
same-revision incident tabletop. A separate four-container exercise verifies
the actual Compose topology, survivor container identity, Sandbox-only
restart, readiness recovery, required service paths, Gateway-to-Sandbox,
Sandbox-to-Grid, and Grid-to-Sandbox connection denial, and blocked public TCP
connectivity.

## Rotation, rollback, and upgrades

Application-identity and TLS rotation is coordinated and offline. Stop all
four units. Rotate the complete source credential set under operator custody,
validate it, then create a new projection in a new empty directory. Preserve
the active Grid durable files; do not replace them with the empty Grid copy
from a fresh projection. Instead, stage the new Grid identity/trust/transport
files alongside the existing durable state while stopped, retain an encrypted
rollback copy, and validate permissions and manifest bindings before startup.

The current projection command deliberately refuses to overwrite an existing
directory. That makes an accidental half-rotation or silent key replacement
less likely. The operator must choose a new directory and switch the
`AXIOM_UNITS_DIR_HOST` binding as one reviewed change.

After starting the new generation, require exact four-service readiness, an
authenticated operations result, an inactive-credential rejection test, and a
low-risk intent. If any fails, stop all units and restore the complete prior
projection and prior active Grid identity/trust files. Do not combine a prior
private leaf with a new manifest.

Image upgrades follow the same state discipline: retain the prior digest,
backup active Grid, stop the units, apply migrations through one Grid process,
start dependencies before Gateway, verify readiness and one low-risk intent,
then release the rollback hold. There is no claim of zero-downtime rolling
upgrade in this candidate.

## Pilot repetition and non-claims

Candidate CI closes the repository mechanism and disposable-host evidence. A
production-promotion dossier still needs pilot-owned secret custody, an
orchestrator-specific network policy, backup media and restore results,
resource measurements under realistic traffic, named incident responders,
upgrade and rollback rehearsal, and independent security review.

This milestone does not claim:

- multi-host consensus, leader election, or replicated Grid state;
- automatic failover of Grid or any service;
- external CA custody or online certificate revocation;
- zero-downtime rotation or rolling upgrade;
- protection from a compromised Docker daemon or host root;
- a live production, mainnet, or public service; or
- completion of the human and external promotion gates.

Keep those limitations in the signed evidence and release documentation.
Removing them without new independently verifiable evidence is a claim-boundary
regression.
