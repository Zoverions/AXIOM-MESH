<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.12.0-dev.3; digest=e8bf5b9c083fd4b20a630372fa135e630c36285064f58d84abea60975325c10e -->
# AXIOM-MESH

<img src="logo.png" alt="AXIOM-MESH logo" width="150" align="right">

AXIOM-MESH is a local-first coordination, authority, and evidence substrate. It turns authenticated human or machine intent into an explicit policy-authorized plan, executes only approved effects through bounded interfaces, and records portable cryptographically linked evidence.

The project combines a defensible kernel with first-class applications and replaceable runtime/service integrations. AXIOM One, [Axiom Education](https://github.com/Zoverions/Axiom-Education), AXIOM Verify, AXIOM Circles, AXIOM Studio, Managed Node tooling, external agent runtimes, and future protocol adapters are clients of the authority substrate; installation or connectivity does not make them alternate authorities.

The application boundary is recorded in [`mesh/config/application-catalog.json`](mesh/config/application-catalog.json).

## First 5 Minutes

Requirements for the current **source-checkout** path: Node.js `>=24.14.0 <25` and npm `>=11.0.0 <12`.

The setup policy pins Node.js **24.18.0** for protected CI/`.node-version` and **24.19.0** for the candidate production image.

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git
cd AXIOM-MESH
npm run doctor
npm run setup
npm run dev
```

Then, in another terminal:

```bash
npm run axiom -- status
npm run axiom -- intent system.echo '{"message":"hello"}'
```

Use `npm run axiom -- --help` for commands and `--json` for machine-readable output.

This is a **clean source-checkout setup**, not a completed fresh-machine installer. It assumes the supported Node/npm toolchain is already present.

## Installation productization

The installation path is now split into explicit evidence layers rather than one privileged bootstrap script.

### Implemented: source setup

`npm run setup` validates the checked-out source, exact zero-dependency locks, runtime policy, documentation, tests, and release-readiness gates. It creates no production credential and deploys nothing.

### Implemented: non-mutating host planning

The `personal-local` and `infrastructure-node` targets remain `specified`, but a deterministic planner now records supported Linux host facts and produces a digest-bound plan without changing the machine.

```bash
npm run host-install:policy
npm run host-install:plan -- personal-local
npm run host-install:plan -- infrastructure-node
```

Planner success is not install authorization. It creates no user, directory, service, credential, network rule, Mesh enrollment, or authority.

### Implemented: signed release-input verification

The source tree now contains `axiom-install-release-manifest.v1` verification. A valid package must be signed by an **externally supplied active Ed25519** key carrying the `release-installer-authority` role. The package cannot establish trust by embedding its own public key.

The signed statement binds the exact source revision, kernel/channel, current install-profile statuses, Node/npm requirements, migration generation, current install/capability/application/network/setup control-plane digests, artifact SHA-256/byte lengths, documentation bundle, SBOM, provenance, validity window, and non-claims.

Artifact bytes are separately verified against signed size/digest metadata. Even a fully valid release statement reports:

```text
host_mutation_authorized: false
installation_authority_granted: false
mesh_authority_granted: false
network_authority_granted: false
node_enrolled: false
services_started: false
```

See [`docs/operations/SIGNED-RELEASE-INSTALL-MANIFEST.md`](docs/operations/SIGNED-RELEASE-INSTALL-MANIFEST.md) and [`docs/operations/HOST-INSTALLATION-PROFILES.md`](docs/operations/HOST-INSTALLATION-PROFILES.md).

### Still pending: privileged fresh-host installation

No current supported command installs Node/OS packages, creates host users/systemd units/firewall state, provisions a full personal or infrastructure node from an untouched machine, performs automatic network enrollment, or claims reboot/update/second-host-restore evidence.

The retained AXIOM Host H0/H1 research is being treated as a source of appliance/image design and tests, not merged wholesale. Its `axiom-host-image` path remains distinct from ordinary Linux installation and does not imply Secure Boot, measured boot, TPM attestation, or remote attestation.

## Current state

**Supported build:** `0.12.0-dev.3`  
**Deployment decision:** production candidate; not production-promoted; no live public/customer deployment claim  
**Last immutable published candidate:** `v0.11.0`

[`mesh/config/capabilities.json`](mesh/config/capabilities.json) remains authoritative for runnable capability status. Roadmaps, laboratories, signed release metadata, tests, and built-but-production-unreachable source do not promote a capability.

The current registry tracks **49 capabilities: 31 implemented, 3 experimental, 2 specified, 9 adapter-required, and 4 disabled**.

### Implemented production-candidate kernel

The supported kernel includes:

- authenticated intent, deny-dominant policy, explicit planning, confirmation and independent approval where required, short-lived grants, bounded execution, and signed evidence;
- restart-safe Grid-backed capability consumption with process-epoch binding and burn-on-uncertainty semantics;
- human-sponsored constrained machine principals with finite scopes, actions, purposes, destinations, runtime identity, expiry, non-delegation, execution-time, request-size, request-rate, concurrency, and response-size ceilings;
- authenticated `/v1/machine-discovery`, filtered to the caller's current requestable intersection and explicitly granting no execution authority;
- owner-scoped Grid-attested terminal machine receipts binding request and machine-authority digests, accepted/terminal anchors, chain-assurance metadata, and outcome digests;
- encrypted transactional Grid state, consent, memory, governance, local accounting, portability, backup/restore, rotation, and recovery;
- authenticated operator API/CLI and versioned Gateway client contract;
- mutually authenticated internal transport, independently restartable service units, bounded telemetry, resilience/SLO, deny-egress, incident, pilot-intake, and review-evidence mechanisms;
- admitted-node discovery/scheduling foundations and operator-approved two-Grid causal exchange without claiming remote execution or consensus;
- signed deployment-independent secret/policy provider startup;
- owner-local social actor/persona/publication state and bounded owner-derived read/review projections; and
- governed Axiom Education learner-record/memory/provider/self-read foundations without production Education policy activation.

Machine runtime IDs and software digests are authority-bound attribution metadata, not TPM/TEE, measured-boot, or remote-attestation proof. Unknown provider/remote/MCP destination semantics fail closed.

## Evidence integrity and continuity

Grid uses signed hash-linked evidence. Local verification detects invalid signatures, altered events, gaps, and broken links, but local state alone cannot prove that a consistent suffix was not removed along with matching local head/checkpoint metadata.

`axiom-grid-continuity-anchor.v1`, when retained outside `AXIOM_DATA_DIR` and checked from genesis, proves that current history equals or extends the retained head **through the newest retained anchor**. It does not prove preservation of later unanchored events and does not remove malicious-host/root or active Grid-signing-key compromise from the trust model.

Grid is a single-node transparency log, not BFT consensus.

## Built repository-effect chain — production-unreachable

The source tree contains a deliberately narrow docs-only repository-effect prototype. It is real code with adversarial tests, but it remains **production-unreachable**.

Its built path includes signed read-only repository planning, resolver eligibility/admission/review, exact target-policy checks, confirmation/independent approval, and a durable evidence-first outbox. The state transition keeps the exact boundary explicit: a one-use approval is recorded as `approval.consumed` before the separately bound `external.effect.prepared` state can reach the credential-isolated operator.

The docs-only GitHub repository operator independently verifies durable Grid preparation before any GitHub request. It is fixed to this repository and exact planned documentation content, uses a deterministic effect branch, and can create/recover an **open draft pull request**. Preparation is not completion.

The operator has **no merge authority** and reports `merge_performed: false` and `base_branch_content_changed: false`.

Production reachability remains closed: `mesh/config/intent-remediation-executors.json` has zero mappings, production policy has no `repository.docs.pull-request.create`, and no supported runtime route activates the chain. Signed installation/release metadata does not alter that boundary.

## Agent Runtime Adapter v1

Agent Runtime Adapter v1 is a byte-pinned contract plus synthetic reference conformance. It fixes grant, capability translation, credential reference, lifecycle, cancellation, revocation, idempotency, fallback, uncertainty, receipt, and rollback semantics for replaceable external runtimes.

The reference loads **no external runtime**, resolves no production runtime credential, performs no external effect, and does not certify OpenClaw, Hermes, Agent Zero, MCP, A2A, or another runtime. A runtime may plan or coordinate work, but it cannot create a second authority path around:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

## AXIOM One

AXIOM One remains an experimental loopback-only browser/PWA preview. It provides bounded status/review, owner-private memory/provenance, confirmation-bound tombstoning, selective local export/reveal, raw evidence, approval-state distinctions, uncertainty recovery, and local social presentation foundations.

It is not a supported product and does not yet claim general consequential plan/execute, hard deletion, restore/bulk ingestion, completed browser-session/device security, accessibility/usability evidence, or signed end-user packaging.

## Axiom Education

[Axiom Education](https://github.com/Zoverions/Axiom-Education) is an integral, independently releasable local-first lifelong education application—not merely a high-school project.

Current Mesh foundations include governed learner memory/record ownership, consent-bound records, provider contracts, Sandbox composition, and bounded learner self-read through Hypervisor and one exact Hypervisor-to-Grid Education edge. The downstream repository independently pins and verifies Mesh compatibility.

Installing, listing, or cryptographically verifying an Education release must not grant learner-record, curriculum, provider, school/institution, guardian/educator, network, or production authority.

## Single-host service isolation

The alternate [`mesh/compose.units.yml`](mesh/compose.units.yml) topology runs Gateway, Hypervisor, Sandbox, and Grid as independently restartable containers with per-unit private credentials and Grid-only durable state.

The current machine-readable default-deny application policy **permits only 42 current internal** caller/destination/method/route combinations, derives mTLS peer allowlists, and removes unrelated adjacency. The reviewed Education edge does not create public Education exposure or alternate authority.

This is single-host isolation, not multi-host consensus or automatic failover.

## Development programme

Three tracks continue in parallel.

### Trust and operations

Complete an authentic controlled pilot with dedicated hardware, external secret/provider/media custody, 30-day availability/capacity observations, scheduled recovery/rotation, externally retained continuity anchors, named incident response, credential-history dispositions, operator-owned telemetry/alert routes, and an independent security review.

### Human utility and productization

Advance AXIOM One, Axiom Education, Verify, Circles, Studio, Managed Node, signed release/install packaging, clean-host installation, backup-provider adapters, and bounded useful AI workflows without widening authority by convenience.

### Machine/network/frontier work

Review one maintained external runtime for bounded read-only integration; continue agent contributor mode, authenticated multi-host dispatch/results, and network/path work behind separate gates. Distributed authority/BFT, settlement, autonomous loops, task markets, regulated domains, embodied systems, arbitrary-code isolation, zk verification, and post-quantum migration remain isolated laboratories until independently promoted.

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**

## Capability lifecycle

AXIOM distinguishes:

1. **Built** — source/tests exist.
2. **Enabled** — an operator deliberately activates it.
3. **Exposed** — a user/node/runtime/external system can reach it.
4. **Production-promoted** — the exact build/deployment passes applicable gates.
5. **Marketed** — public claims describe only promoted scope.

Release signatures and install manifests are evidence about release inputs; they do not collapse these states.

## Choose Your Path

| Level | Goal | Minimum path |
|---|---|---|
| Local Play | Start the kernel and submit an intent | `npm run doctor` -> `npm run setup` -> `npm run dev` |
| Verify | Re-run source, tests, docs, and release gates | `npm run check` -> `npm run release:verify` |
| Install planning | Inspect the future Linux host profiles | `npm run host-install:plan -- personal-local` or `infrastructure-node` |
| Release trust | Understand signed release-input and artifact verification | `docs/operations/SIGNED-RELEASE-INSTALL-MANIFEST.md` |
| Applications | Discover first-class applications and authority boundaries | `mesh/config/application-catalog.json` |
| Operator / Pilot | Exercise recovery, transport, resilience, custody, and evidence | bounded drills + runbooks |
| Frontier laboratory | Reduce uncertainty without production exposure | isolated identities/data/value; no promotion claim |

## Command surface

```bash
npm run doctor
npm run setup
npm run host-install:policy
npm run host-install:plan -- personal-local
npm run host-install:plan -- infrastructure-node
npm run dev
npm run axiom -- --help
npm run axiom -- status
npm run axiom -- capabilities
npm run axiom -- audit
npm run axiom-one
npm run runtime-adapter:contract
npm run runtime-adapter:drill
npm run check
npm run release:verify
```

The local CLI uses checked-out source directly; it does not ask `npx` to resolve a similarly named registry package.

## Documentation

Start with [`docs/README.md`](docs/README.md), then use the canonical owner for the question:

- [Current project status](docs/PROJECT-STATUS-2026.md)
- [Capability registry](mesh/config/capabilities.json)
- [Host installation profiles](docs/operations/HOST-INSTALLATION-PROFILES.md)
- [Signed release/install manifest](docs/operations/SIGNED-RELEASE-INSTALL-MANIFEST.md)
- [Application/downstream integration](docs/rebuild/APPLICATION-AND-DOWNSTREAM-INTEGRATION.md)
- [Production readiness](docs/PRODUCTION-READINESS-TRACKER.md)
- [Technical white paper](docs/whitepapers_and_research/WHITEPAPER.md)
- [Normative requirements](docs/rebuild/REQUIREMENTS.md)
- [Roadmap](docs/ROADMAP.md) and [master todo](docs/MASTER-TODO.md)
- [Current threat model](docs/security/CURRENT-BUILD-THREAT-MODEL.md)
- [Current dev.3 build notes](docs/releases/0.12.0-dev.3.md)

## Non-claims

The active development build does not claim:

- live production, public testnet/mainnet, or customer deployment;
- a completed authentic pilot or independent security approval;
- a completed fresh-machine Linux or infrastructure-node installer;
- a published production install-release manifest or production release-signing key/custody ceremony;
- that a valid release signature authorizes host mutation, Mesh authority, node admission, or network participation;
- Secure Boot, measured boot, TPM/TEE workload attestation, or remote attestation from an AXIOM Host image;
- implemented Google Drive, OneDrive, S3-compatible, decentralized, or other remote-backup provider adapters beyond local encrypted-backup foundations;
- supported AXIOM One, Axiom Education, Verify, Circles, Studio, or Managed Node products;
- supported wearable/companion hardware, arbitrary Runtime Capsule execution, or production Personal Compute/Local Trust fabric;
- autonomous-agent authority, machine self-delegation, MCP/A2A production exposure, or remote agent execution;
- certification of any external agent runtime;
- a production resolver mapping or public repository-effect route;
- direct-main mutation or merge authority from the docs-only repository operator;
- production AI, messaging, identity, payment, storage-transfer, or regulated-domain adapters;
- identity proofing/KYC/age assurance/biometric/payment/funds/merchant/settlement assurance;
- authenticated remote workload results, public federation, BFT consensus, replicated Grid finality, tokens, bridges, liquidity, staking, treasury, payroll, or settlement;
- arbitrary-code isolation, secure embodied autonomy, or end-to-end post-quantum security;
- proof that a signed release, Grid receipt, machine output, or model statement establishes arbitrary external-world truth; or
- proof that local Grid state alone detects a consistently removed suffix after matching local metadata rewrite.

The project is intentionally ambitious. Its public claims remain narrow until the evidence is equally ambitious.
