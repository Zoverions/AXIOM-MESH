<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.12.0-dev.3; digest=1f61717d785b3e260d6eee36b2d772d4f1170287f6d262f24edc9fa1f412ff21 -->
# AXIOM-MESH

<img src="logo.png" alt="AXIOM-MESH logo" width="150" align="right">

AXIOM-MESH is a local-first capability network. It turns a human or agent
intent into an explicit policy-authorized plan, executes only approved effects
inside a bounded runtime, and emits portable cryptographically linked evidence.

The project is developing both a defensible kernel and useful human products:
AXIOM One, AXIOM Verify, AXIOM Circles, AXIOM Studio, and optional managed-node
operations.

## First 5 Minutes

Requirements: Node.js `>=24.14.0 <25` and npm `>=11.0.0 <12`. The supported
pin is Node.js `24.18.0`.

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git
cd AXIOM-MESH
npm run doctor
npm run setup
npm run dev
```

A successful start prints `"message": "AXIOM-MESH ready"` and the local Gateway
endpoint. In a second terminal:

```bash
npm run axiom -- status
npm run axiom -- intent system.echo '{"message":"hello"}'
```

Use `npm run axiom -- --help` to discover commands. Append `--json` for the
complete machine-readable response.

Docker is **not required** for the basic local development path.

## Current state

**Supported build:** `0.12.0-dev.3`

**Deployment decision:** production candidate; not production-promoted; no live
public or customer deployment claim.

**Last published candidate:** immutable `v0.11.0`

The machine-readable
[`mesh/config/capabilities.json`](mesh/config/capabilities.json) registry is the
authority for runnable capability status. Roadmap entries, demonstrations,
laboratories, and documentation cannot promote a capability beyond that
registry.

The current kernel implements:

- authenticated intent, policy, plan, approval, grant, bounded execution, and
  signed evidence;
- human-sponsored constrained machine principals with finite scopes, action and
  purpose ceilings, runtime binding, expiry, non-delegation, an execution-time
  ceiling, authenticated Gateway request-size, request-rate, concurrency, and response-size ceilings, and an AXIOM-computed effect destination constrained to the principal's finite destination allowlist;
- encrypted transactional state, consent, memory, governance, local accounting,
  export/import, backup, restore, rotation, and recovery;
- mutually authenticated internal transport and independently restartable
  single-host services;
- bounded telemetry, resilience, deny-egress, SLO, and incident evidence;
- signed node discovery metadata and deterministic placement reservations
  without remote execution;
- operator-approved two-Grid causal exchange without consensus;
- signed deployment-independent secret and policy provider startup;
- strict pilot and independent-review evidence intake;
- authenticated operator API and CLI.

The machine-principal capability is an authorization primitive, **not** an
autonomous-agent runtime. Authenticated Gateway request-size, request-rate, concurrency, and response-size
ceilings are enforced and evidenced. For current built-in effects, AXIOM computes the
effect destination as `local` from the authorized tool and requires it to remain
inside the principal's finite destination ceiling. Unknown provider, remote, or MCP
destination semantics remain unresolved and fail closed; this is not a claim of
remote execution or arbitrary external-destination support. AXIOM One remains an experimental browser/PWA preview,
not an implemented or supported product claim. External AI, Verify, Circles,
remote dispatch, federation, tokens, settlement, regulated domains, arbitrary
code, embodied systems, and post-quantum security are also not current
implemented claims.

## Development programme

Work advances through three coordinated tracks.

### Trust and operations

Complete one authentic controlled pilot with external custody, scheduled
recovery, 30-day measurements, named incident response, deprecated credential
dispositions, and an independent security review.

### Human utility and network activation

Build:

- **AXIOM One** — private personal agent, vault, approvals, and receipts;
- **AXIOM Verify** — independent local/static evidence verification;
- **AXIOM Circles** — invitation-based governed collaboration;
- **AXIOM Studio** — capsule, adapter, policy, and conformance tooling;
- **AXIOM Managed Node** — optional supported operations without platform data
  ownership.

The versioned same-origin Gateway client contract is implemented. An
experimental loopback-only AXIOM One PWA foundation now provides node status,
reversible reviews for five bounded actions, exact explanations for all stable
Gateway outcomes and current kernel events, one-use approval states, same-key
uncertainty recovery, and an owner-scoped Vault that can create private notes,
tombstone exact records after confirmation, record fixed-direction provenance
links, create selective local exports, and reveal a bundle only on a separate
user action. Corrections remain new linked records and never silently replace
their target. These explanations are experimental and are not an authoritative
pre-execution kernel plan. Edge deletion, hard deletion, restore, bulk
ingestion, browser session, accessibility, usability, and packaging gates
remain next, followed by one bounded AI provider and useful personal workflows,
then selective sharing, Verify, and Circles.
See the [Gateway client contract](docs/operations/GATEWAY-CLIENT-CONTRACT.md).
The [local preview runbook](docs/operations/AXIOM-ONE-LOCAL-PREVIEW.md) records
its exact setup, security boundary, verification, rollback, and non-claims.

### Frontier incubation

Distributed authority, BFT, settlement, tokens, bridges, liquidity, autonomous
agents, task markets, regulated domains, embodied systems, arbitrary-code
isolation, zk verification, and post-quantum migration may be built in isolated
laboratories.

Laboratory code remains disabled by default and separated from production
identities, secrets, user data, real value, and public authority.

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**

## Capability lifecycle

AXIOM-MESH distinguishes:

1. **Built** — code and tests exist.
2. **Enabled** — an operator deliberately activates it.
3. **Exposed** — a user, node, or external system can reach it.
4. **Production-promoted** — the exact build and deployment pass applicable
   evidence gates.
5. **Marketed** — public claims describe only the promoted scope.

These states are intentionally separate.

## Supported runtime

The supported implementation is [`mesh/`](mesh/README.md).

| Service | Responsibility |
|---|---|
| Gateway | Authentication, validation, abuse controls, idempotency, and versioned user/operator APIs |
| Hypervisor | Intent normalization, deny-dominant policy, explicit planning, approval checks, and grant issuance |
| Sandbox | Grant-bound bounded execution with no ambient authority |
| Grid | Encrypted durable state, evidence, consent, memory, governance, portability, recovery, and network records |

Every privileged or externally visible effect follows:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

No browser, provider, administrator, autonomous agent, remote node, settlement
process, or domain capsule may bypass that path.

Grid is currently a **single-node transparency log**, not BFT consensus.

## Choose Your Path

| Level | Goal | Minimum path |
|---|---|---|
| **Local Play** | Start the kernel and submit one intent | `npm run doctor` → `npm run setup` → `npm run dev` → `npm run axiom -- status` |
| **Verify** | Re-run source, test, documentation, and release gates | `npm run check` → `npm run release:verify` |
| **Operator / Pilot** | Exercise recovery, transport, resilience, custody, and evidence controls | Use the bounded drills and linked runbooks |
| **Product development** | Build human applications and adapters without expanding kernel authority | Follow `docs/ROADMAP.md`, `docs/MASTER-TODO.md`, product requirements, and capability gates |
| **Frontier laboratory** | Reduce uncertainty in advanced systems without production exposure | Use isolated identities, synthetic/test data, no real value, explicit halt, and no promotion claim |

## Command surface

```bash
npm run doctor
npm run setup
npm run dev
npm run axiom -- --help
npm run axiom -- status
npm run axiom -- capabilities
npm run axiom -- audit
npm run axiom-one
npm run axiom-one:check
npm run check
npm run release:verify
```

The local `npm run axiom -- ...` command uses the checked-out source directly.
It does not ask `npx` to resolve a similarly named registry package.

## Verification and drills

Run drills only in explicitly empty disposable workspaces.

| Purpose | Command |
|---|---|
| Recovery, tamper rejection, restore, rollback | `npm run recovery:drill -- /tmp/axiom-recovery-drill` |
| Backup retention and retained restore | `npm run backup-lifecycle:drill -- /tmp/axiom-backup-lifecycle-drill` |
| SLO and restart baseline | `npm run slo:drill -- /tmp/axiom-slo-drill` |
| Request pressure and dependency loss | `npm run resilience:drill -- /tmp/axiom-resilience-drill` |
| Internal TLS rotation and rollback | `npm run transport:drill -- /tmp/axiom-transport-drill` |
| Independent service-unit recovery | `npm run service-units:drill -- /tmp/axiom-service-unit-drill` |
| Node discovery and scheduling reservations | `npm run node-scheduling:drill -- /tmp/axiom-node-scheduling-drill` |
| Bidirectional causal exchange | `npm run online-sync:drill -- /tmp/axiom-online-causal-sync-drill` |
| Secret and policy provider conformance | `npm run provider:drill -- /tmp/axiom-provider-conformance` |
| Telemetry and alert relay | `npm run telemetry-relay:drill -- /tmp/axiom-telemetry-relay-drill` |
| Service/API credential rotation | `npm run credential-rotation:drill -- /tmp/axiom-credential-rotation-drill` |
| Data-protection-key rotation | `npm run data-key-rotation:drill -- /tmp/axiom-data-key-rotation-drill` |
| Incident command tabletop | `npm run incident-tabletop:drill -- /tmp/axiom-incident-tabletop-drill` |

Pilot and independent-review intake commands are documented in:

- [Pilot deployment dossier](docs/operations/PILOT-DEPLOYMENT-DOSSIER.md)
- [Independent security review](docs/security/INDEPENDENT-SECURITY-REVIEW.md)

Synthetic verifier fixtures do not claim a live pilot, independent review, or
production promotion.

## Documentation

Start with:

- [Technical white paper](docs/whitepapers_and_research/WHITEPAPER.md)
- [Product definition](docs/rebuild/PRODUCT-DEFINITION.md)
- [Normative requirements](docs/rebuild/REQUIREMENTS.md)
- [Current project status](docs/PROJECT-STATUS-2026.md)
- [Roadmap](docs/ROADMAP.md)
- [Production execution queue](docs/MASTER-TODO.md)
- [Production readiness tracker](docs/PRODUCTION-READINESS-TRACKER.md)
- [Documentation authority and index](docs/README.md)
- [Security policy](SECURITY.md)

Current `0.12.0-dev.3` changes are recorded in
[`docs/releases/0.12.0-dev.3.md`](docs/releases/0.12.0-dev.3.md).

When documents conflict, the capability registry and normative requirements
control. Historical documents are provenance or research inputs only.

The alternate single-host
[`mesh/compose.units.yml`](mesh/compose.units.yml) runs the four services as
independently restartable containers with per-unit private credentials,
Grid-only durable state, and four exact internal network segments. A
machine-readable default-deny policy permits only 38 current internal
caller/destination/method/route combinations at both ends, derives mTLS peer allowlists,
and removes Gateway-to-Sandbox and Grid-to-Sandbox adjacency. It preserves the
same Unix-domain Gateway ingress and makes no multi-host or automatic-failover
claim. See the
[explicit service network policy](docs/operations/EXPLICIT-SERVICE-NETWORK-POLICY.md).

## Security and contribution

Do not add dependencies, credentials, new egress, browser storage of secrets,
provider authority, remote execution, settlement, or domain effects without
the applicable threat model, negative tests, rollback, documentation, and
promotion gates.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Non-claims

The active build does not claim:

- live production, testnet, mainnet, or public federation;
- supported AXIOM One, Verify, Circles, Studio, or Managed Node products;
- an autonomous-agent runtime, autonomous delegation, MCP/A2A endpoints, or
  remote agent execution;
- production AI, messaging, identity, payment, storage-transfer, or domain
  adapters;
- remote workload execution or authenticated remote results;
- BFT consensus, tokens, bridges, liquidity, staking, treasury, or settlement;
- arbitrary-code isolation;
- regulated-domain compliance;
- secure embodied autonomy;
- end-to-end post-quantum security;
- an authentic completed pilot or independent security approval.

The project is intentionally ambitious. Its claims remain narrow until the
evidence is equally ambitious.