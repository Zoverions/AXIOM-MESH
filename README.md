<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.12.0-dev.3; digest=3d909ef501e6f914c60f2a74f42a6155f18038f79a73e9ba915d8873511cfcc7 -->
# AXIOM-MESH

<img src="logo.png" alt="AXIOM-MESH logo" width="150" align="right">

AXIOM-MESH is a local-first coordination, authority, and evidence substrate. It
turns authenticated human or machine intent into an explicit policy-authorized
plan, executes only approved effects through bounded interfaces, and records
portable cryptographically linked evidence.

The project is developing a defensible kernel plus first-class applications and
replaceable machine/runtime interfaces. AXIOM One,
[Axiom Education](https://github.com/Zoverions/Axiom-Education), AXIOM Verify,
AXIOM Circles, AXIOM Studio, managed-node operations, agent runtimes, and future
protocol adapters are clients of the authority substrate; they do not become
alternate authorities merely by being installed or connected. Axiom Education
is independently releasable in its own repository while remaining an integral
AXIOM application and declared downstream Mesh consumer.

The machine-readable project/application boundary is recorded in
[`mesh/config/application-catalog.json`](mesh/config/application-catalog.json).

## First 5 Minutes

Requirements: Node.js `>=24.14.0 <25` and npm `>=11.0.0 <12`.

The setup policy pins **Node.js 24.18.0 for protected CI and `.node-version`**
and **Node.js 24.19.0 for the candidate production image**.

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
complete machine-readable response. Docker is not required for the basic local
development path.

This is a **clean source-checkout setup**, not yet a fresh-machine Linux
installer. It assumes the supported Node.js/npm toolchain is already present and
does not provision a complete personal or infrastructure node. The explicit
personal/local and infrastructure-node targets, their security invariants, and
the promotion gates for a real fresh-host installer are defined in
[`mesh/config/install-targets.json`](mesh/config/install-targets.json) and the
[Host Installation and Node Profiles](docs/operations/HOST-INSTALLATION-PROFILES.md).

## Current state

**Supported build:** `0.12.0-dev.3`

**Deployment decision:** production candidate; not production-promoted; no live
public or customer deployment claim.

**Last published candidate:** immutable `v0.11.0`

The machine-readable
[`mesh/config/capabilities.json`](mesh/config/capabilities.json) registry is the
authority for runnable capability status. Roadmap entries, demonstrations,
laboratories, synthetic conformance, and built-but-production-unreachable source
do not promote a capability beyond that registry.

The current registry tracks 49 capabilities, of which 31 are marked
`implemented`.

### Implemented production-candidate kernel surface

The supported kernel includes:

- authenticated intent, deny-dominant policy, explicit planning, confirmation
  and independent approval where required, short-lived grants, bounded
  execution, and signed evidence;
- human-sponsored constrained machine principals with finite exact scopes,
  actions, purposes, destinations, runtime identity, expiry, non-delegation,
  execution-time, request-size, request-rate, concurrency, and response-size
  ceilings;
- an AXIOM-computed destination for current built-in effects; `builtin.*`
  resolves to `local` and must remain inside the machine principal's finite
  destination ceiling;
- authenticated `/v1/machine-discovery`, filtered to the caller's own
  digest-bound requestable intersection under active policy and explicitly
  **not** granting execution authority;
- owner-scoped Grid-attested digest-only receipts for terminal constrained-
  machine intents, binding request and machine-authority digests,
  accepted/terminal evidence anchors, chain-assurance metadata, and terminal
  result/error digests;
- encrypted transactional Grid state, consent, memory, governance, local
  accounting, portability, backup/restore, rotation, and recovery;
- mutually authenticated internal transport, single-host service isolation,
  bounded telemetry, resilience, SLO, deny-egress, incident, pilot-intake, and
  independent-review evidence mechanisms;
- admitted-node discovery/scheduling foundations and operator-approved two-Grid
  causal exchange without claiming remote execution or consensus;
- signed deployment-independent secret/policy provider startup; and
- authenticated operator API and CLI.

Machine-principal runtime IDs and software digests are authority-bound
attribution metadata, not TPM/TEE, measured-boot, or remote-attestation proof.
Unknown provider, remote, or MCP destination semantics remain unresolved and
fail closed.

### Evidence integrity and continuity

Grid uses signed hash-linked evidence. Local verification detects altered
records, invalid signatures, gaps, and broken links. Local state alone does not
prove that no suffix was consistently removed if local head/checkpoint metadata
is rewritten with it.

For that stronger truncation claim the build supports
`axiom-grid-continuity-anchor.v1`, retained outside `AXIOM_DATA_DIR` and checked
with full-chain verification. A valid external continuity anchor proves that
the current history equals or extends the retained head **through the newest retained anchor**.
It does not prove preservation of later events and does not
remove malicious host/root or active signing-key compromise from the trust
assumptions.

Grid remains a single-node transparency log, not BFT consensus.

### Built repository-effect safety chain — not production-reachable

The source tree contains a deliberately narrow repository-document effect
prototype that is more complete than a planning fixture, but remains excluded
from the supported production surface.

Its built and tested chain includes:

1. signed read-only repository planning against an exact base SHA and bounded
   documentation paths;
2. resolver-backed executor-input resolution with fresh eligibility and exact
   registry/policy/build/request bindings;
3. independent resolver admission/review and exact mapping-package/application
   observation;
4. resolved target-policy, confirmation, and independent-approval checks;
5. atomic Grid approval consumption with durable
   `external.effect.prepared` evidence;
6. an evidence-first external-effect outbox that invokes an operator only after
   durable preparation, leaves uncertain outcomes durably prepared, verifies a
   signed operator receipt, and records `external.effect.completed` only after
   receipt verification; and
7. a credential-isolated docs-only GitHub repository operator that first
   verifies Grid-durable preparation, then can create/recover a deterministic
   effect branch, apply only the exact planned documentation changes, and
   create/recover an **open draft pull request**.

The operator has **no merge authority** and reports
`merge_performed: false` and `base_branch_content_changed: false`. Stale `main`,
unplanned paths, wrong content, wrong branch/identity, forged Grid proof,
duplicate execution, ambiguous transport outcomes, and malformed responses are
covered by fail-closed/idempotent tests.

This chain is still **production-unreachable**. The production executor registry
[`mesh/config/intent-remediation-executors.json`](mesh/config/intent-remediation-executors.json)
has zero mappings, the production policy contains no
`repository.docs.pull-request.create` action, and no supported public/runtime
route activates the resolver/executor/operator chain. The built operator is an
activation-safety primitive, not a current runnable capability or permission to
modify this repository.

### Agent Runtime Adapter v1 — contract, not certification

The repository also contains the byte-pinned **Agent Runtime Adapter v1**
contract and a 28-case synthetic reference drill. It fixes grant,
capability-translation, credential-reference, lifecycle, cancellation,
revocation, idempotency, fallback, uncertainty, receipt, and rollback semantics
for future replaceable runtimes.

The reference adapter loads no external runtime, resolves no production
credential, performs no external effect, and does not certify OpenClaw, Hermes,
Agent Zero, MCP, A2A, or any other external runtime. A runtime may plan or
coordinate work, but installation or runtime approval cannot create a second
authority path around Gateway -> Hypervisor -> Sandbox -> Grid.

### AXIOM One

AXIOM One remains an experimental loopback-only browser/PWA preview. The current
slice provides node status, reversible review for five bounded actions,
owner-scoped private memory, three fixed directional provenance relations,
confirmation-bound tombstoning, selective local export, explicit bundle reveal,
raw evidence, approval-state distinctions, same-idempotency-key uncertainty
recovery, and cross-principal negative tests.

It is not a supported product and does not yet claim general consequential
plan/execute, direct provenance-edge deletion, hard deletion, restore, bulk
ingestion, completed browser-session security, accessibility/usability evidence,
or signed end-user packaging.

### Axiom Education

[Axiom Education](https://github.com/Zoverions/Axiom-Education) is the
independently releasable local-first lifelong education application/domain
project. It is not confined to one grade band or curriculum: Ontario is the
first supported jurisdiction while elementary, secondary, later learning, and
future jurisdictional packs share the same governed application direction.

Education can maintain local/offline application functionality under its own
release boundary. Governed learner effects must bind to reviewed AXIOM-MESH
contracts and preserve Gateway -> Hypervisor -> Sandbox -> Grid. Installing or
listing Axiom Education grants no learner-record, curriculum, provider,
network, school, guardian, or delegated-human authority. The cross-repository
compatibility and feature-adoption rules are defined in
[Application and Downstream Integration](docs/rebuild/APPLICATION-AND-DOWNSTREAM-INTEGRATION.md).

## Development programme

Work advances through three coordinated tracks.

### Trust and operations

Complete one authentic controlled pilot with dedicated hardware, external
secret/provider/media custody, 30-day availability/capacity observations,
scheduled recovery and rotation, externally retained continuity anchors, named
incident response, deprecated-credential dispositions, operator-owned
telemetry/alert routes, and an independent security review.

### Human utility and network activation

Build and promote only with their own evidence:

- **AXIOM One** — private personal agent, vault, approvals, and receipts;
- **Axiom Education** — independently released lifelong education application
  and governed education-domain consumer of Mesh contracts;
- **AXIOM Verify** — independent local/static evidence verification;
- **AXIOM Circles** — invitation-based governed collaboration;
- **AXIOM Studio** — capsule, adapter, policy, and conformance tooling;
- **AXIOM Managed Node** — optional operations without platform data ownership.

The next machine/runtime work is not to invent a parallel authority model. It is
to preserve the existing AXIOM authorization/evidence semantics while reviewing
one maintained external runtime for a bounded read-only integration, and to
keep the repository-effect chain production-unreachable unless an explicit
future policy/registry/runtime promotion is independently justified.

The documentation-only
[Personal Compute Fabric and Local Trust Plane](docs/architecture/PERSONAL-COMPUTE-FABRIC-AND-LOCAL-TRUST.md)
`1.0.0-draft.1` specification extends that programme with a phone-first
portable Personal Agent Pack, replaceable Agent Runtime Capsules, policy-first
local/managed/cloud compute, a constrained phone-relayed wearable endpoint,
deterministic credential and authorization verification, and sandbox-value
payment mandates. The current runtime loads only the separately byte-pinned
Agent Runtime Adapter contract; it does not load the other four drafts, and the
phased MVP changes no capability status.

### Frontier incubation

Distributed authority, BFT, settlement, tokens, bridges, liquidity, autonomous
loops, task markets, regulated domains, embodied systems, arbitrary-code
isolation, zk verification, and post-quantum migration may be built in isolated
laboratories. Laboratory code remains separated from production identities,
secrets, user data, real value, and public authority.

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**

## Capability lifecycle

AXIOM-MESH distinguishes:

1. **Built** — code and tests exist.
2. **Enabled** — an operator deliberately activates it.
3. **Exposed** — a user, node, runtime, or external system can reach it.
4. **Production-promoted** — the exact build/deployment passes applicable gates.
5. **Marketed** — public claims describe only the promoted scope.

These states are intentionally separate.

## Supported runtime

The supported implementation is [`mesh/`](mesh/README.md).

| Service | Responsibility |
|---|---|
| Gateway | Authentication, validation, abuse controls, idempotency, and versioned user/operator APIs |
| Hypervisor | Intent normalization, deny-dominant policy, machine-authority checks, explicit planning, approvals, and grant issuance |
| Sandbox | Grant-bound bounded execution with no ambient supported authority |
| Grid | Encrypted durable state, evidence, approvals, consent, memory, governance, portability, recovery, and network records |

Every supported privileged effect preserves the authority sequence:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Future external-effect adapters may use evidence-first prepared/outbox/operator
boundaries, but they may not bypass the authenticated intent/policy/approval
chain that produces that authority.

## Choose Your Path

| Level | Goal | Minimum path |
|---|---|---|
| **Local Play** | Start the kernel and submit one intent | `npm run doctor` -> `npm run setup` -> `npm run dev` -> `npm run axiom -- status` |
| **Verify** | Re-run source, test, documentation, and release gates | `npm run check` -> `npm run release:verify` |
| **Install planning** | Review the future personal/local and infrastructure-node host profiles without mistaking them for implemented installers | `mesh/config/install-targets.json` -> `docs/operations/HOST-INSTALLATION-PROFILES.md` |
| **Applications** | Discover first-class in-tree and independently released applications and their authority boundaries | `mesh/config/application-catalog.json` -> `docs/rebuild/APPLICATION-AND-DOWNSTREAM-INTEGRATION.md` |
| **Operator / Pilot** | Exercise recovery, transport, resilience, custody, and evidence controls | Use the bounded drills and linked runbooks |
| **Product development** | Build products/adapters without expanding ambient kernel authority | Follow `docs/ROADMAP.md`, `docs/MASTER-TODO.md`, requirements, and capability gates |
| **Frontier laboratory** | Reduce uncertainty without production exposure | Isolated identities/data/value; explicit halt; no promotion claim |

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
npm run runtime-adapter:contract
npm run runtime-adapter:drill
npm run check
npm run release:verify
```

The local `npm run axiom -- ...` command uses the checked-out source directly;
it does not ask `npx` to resolve a similarly named registry package.

## Verification and drills

Run drills only in explicitly empty disposable workspaces.

| Purpose | Command |
|---|---|
| Recovery / restore / rollback | `npm run recovery:drill -- /tmp/axiom-recovery-drill` |
| Backup lifecycle | `npm run backup-lifecycle:drill -- /tmp/axiom-backup-lifecycle-drill` |
| SLO baseline | `npm run slo:drill -- /tmp/axiom-slo-drill` |
| Request pressure / dependency loss | `npm run resilience:drill -- /tmp/axiom-resilience-drill` |
| Internal TLS rotation | `npm run transport:drill -- /tmp/axiom-transport-drill` |
| Independent service units | `npm run service-units:drill -- /tmp/axiom-service-unit-drill` |
| Node scheduling | `npm run node-scheduling:drill -- /tmp/axiom-node-scheduling-drill` |
| Causal exchange | `npm run online-sync:drill -- /tmp/axiom-online-causal-sync-drill` |
| Provider conformance | `npm run provider:drill -- /tmp/axiom-provider-conformance` |
| Runtime adapter contract | `npm run runtime-adapter:contract` |
| Runtime adapter synthetic conformance | `npm run runtime-adapter:drill` |
| Telemetry relay | `npm run telemetry-relay:drill -- /tmp/axiom-telemetry-relay-drill` |
| Credential rotation | `npm run credential-rotation:drill -- /tmp/axiom-credential-rotation-drill` |
| Data-key rotation | `npm run data-key-rotation:drill -- /tmp/axiom-data-key-rotation-drill` |
| Incident tabletop | `npm run incident-tabletop:drill -- /tmp/axiom-incident-tabletop-drill` |

Synthetic pilot, review, runtime-adapter, and repository-effect fixtures prove
mechanism behavior only. They do not claim a live pilot, an independent review,
external-runtime certification, production repository mutation, or production
promotion.

## Documentation

The documentation is organized by decision type rather than by feature name.
Start with the [documentation index](docs/README.md), then use the path that
matches the question:

- [Current project status](docs/PROJECT-STATUS-2026.md)
- [Capability registry](mesh/config/capabilities.json)
- [Application catalogue](mesh/config/application-catalog.json) and [application/downstream integration model](docs/rebuild/APPLICATION-AND-DOWNSTREAM-INTEGRATION.md)
- [Install target registry](mesh/config/install-targets.json) and [host installation profiles](docs/operations/HOST-INSTALLATION-PROFILES.md)
- [Production readiness tracker](docs/PRODUCTION-READINESS-TRACKER.md)
- [Technical white paper](docs/whitepapers_and_research/WHITEPAPER.md)
- [Normative requirements](docs/rebuild/REQUIREMENTS.md)
- [Roadmap and execution queue](docs/ROADMAP.md) and [master todo](docs/MASTER-TODO.md)
- [Current threat model](docs/security/CURRENT-BUILD-THREAT-MODEL.md)
- [Repository migration and provenance](docs/REPOSITORY-MIGRATION.md)
- [Security policy](SECURITY.md)

Current `0.12.0-dev.3` development-line changes are recorded in
[`docs/releases/0.12.0-dev.3.md`](docs/releases/0.12.0-dev.3.md).

For agent interoperability or plural authority, read the white paper first,
then the relevant `docs/rebuild/` specification, roadmap extension, master
todo, and dated architecture review. Research and roadmap documents do not
promote capabilities or change readiness status. When documents conflict, the
ownership and precedence rules in [`docs/README.md`](docs/README.md) control;
historical documents remain provenance or research inputs only.

The alternate single-host
[`mesh/compose.units.yml`](mesh/compose.units.yml) runs the four kernel services
as independently restartable containers with per-unit private credentials,
Grid-only durable state, and four exact internal network segments. A
machine-readable default-deny policy **permits only 41 current internal**
caller/destination/method/route combinations at both ends, derives mTLS peer
allowlists, and removes unrelated adjacency. This is single-host isolation, not
multi-host consensus or automatic failover.

## Security and contribution

Do not add dependencies, credentials, new egress, browser secret storage,
provider/runtime authority, production resolver mappings, repository-effect
reachability, remote execution, settlement, or domain effects without the
applicable threat model, negative tests, rollback, documentation, and promotion
gates.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Non-claims

The active build does not claim:

- live production, testnet, mainnet, or public federation;
- a completed authentic pilot or independent security approval;
- a supported fresh-machine Linux installer, general infrastructure-node
  installer, or automatic network enrollment;
- implemented Google Drive, OneDrive, S3-compatible, decentralized, or other
  remote-backup provider adapters beyond the existing local encrypted backup
  foundation;
- a production-ready governed Axiom Education deployment;
- supported AXIOM One, Verify, Circles, Studio, or Managed Node products;
- supported wearable/companion hardware, Personal Agent Pack, Agent Runtime
  Capsule executor, Personal Compute Fabric, or Local Trust Plane;
- an autonomous-agent runtime, machine delegation, MCP/A2A endpoint, or remote
  agent execution;
- certification/production conformance of any external agent runtime;
- a production resolver mapping or supported public repository-effect route;
- merge authority or direct-main mutation from the built docs-only repository
  operator;
- production AI, messaging, identity, payment, storage-transfer, or regulated
  domain adapters;
- identity proofing, KYC, age assurance, government-ID, biometric, payment-
  authorization, funds-availability, merchant-acceptance, or settlement
  assurance;
- remote workload execution or authenticated remote results;
- BFT consensus, replicated Grid finality, tokens, bridges, liquidity, staking,
  treasury, payroll, or settlement;
- arbitrary-code isolation;
- regulated-domain compliance or secure embodied autonomy;
- end-to-end post-quantum security;
- proof that Grid-attested receipts establish arbitrary external-world truth;
- proof that local Grid state alone detects a consistently removed suffix after
  matching local metadata rewrite; or
- continuity evidence for events after the newest externally retained anchor.

The project is intentionally ambitious. Its public claims remain narrow until
the evidence is equally ambitious.
