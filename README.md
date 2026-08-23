<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.12.0-dev.3; digest=3d909ef501e6f914c60f2a74f42a6155f18038f79a73e9ba915d8873511cfcc7 -->
# AXIOM-MESH

<img src="logo.png" alt="AXIOM-MESH logo" width="150" align="right">

AXIOM-MESH is a **local-first authority, coordination, evidence, and sovereign-context substrate** for humans, agents, applications, and independently owned nodes.

Its core rule is simple: intelligence may propose, coordinate, retrieve, simulate, or recommend, but consequential authority remains explicit, bounded, reviewable, and evidence-producing.

```text
human or machine principal
        |
        v
     Gateway
        |
        v
   Hypervisor
        |
        v
     Sandbox
        |
        v
       Grid
```

Agent runtimes, models, applications, Circles, connectors, semantic indexes, repository operators, remote nodes, and future network fabrics are clients of that authority path. Their existence does not create a second authority system.

**Updated for current `main`: 2026-08-23.**

## Current truth at a glance

**Supported build:** `0.12.0-dev.3`  
**Deployment decision:** production candidate; not production-promoted  
**Live public/customer deployment:** not claimed  
**Last immutable published candidate:** `v0.11.0`

The machine-readable [`mesh/config/capabilities.json`](mesh/config/capabilities.json) registry is the authority for current runnable capability status. `main` currently tracks **49 capabilities: 31 implemented, 3 experimental, 2 specified, 9 adapter-required, and 4 disabled**.

Built source, architecture contracts, protected-CI laboratories, product previews, and open pull requests do **not** become runnable capabilities merely because code or tests exist.

### Mainline status matrix

| Layer | Current status on `main` | What that means |
|---|---|---|
| Core Gateway → Hypervisor → Sandbox → Grid kernel | **Registry-backed production candidate** | Authenticated intent, deny-dominant policy, bounded grants/execution, encrypted state, signed evidence, consent, governance, recovery, machine principals, operations controls |
| AXIOM One | **Experimental local preview** | Loopback PWA/browser control surface; not a supported end-user product |
| Local social state | **Implemented bounded backend surface** | Owner-local actor/persona/publication state plus owner-scoped `/v1/social`; no public federation |
| Remote-social review | **Implemented read-only inspection surface** | Minimized owner-only remote observation review; no Following feed, ranking, transport, or recommendation authority |
| Runtime & Connector Fabric | **Executable/frozen coordination contracts; no external runtime enabled** | Catalog/task-handoff semantics are authority-neutral; installation or curation grants nothing |
| Sovereign Vault / Context stack | **Executable local validation, planning, compilation, evidence-admission, and lifecycle primitives; no vault/runtime route** | Context Requests, lease/capsule contracts, minimum-necessary planning, signed authority evidence, replay-resistant admission, admitted-only compilation, revocation/supersession guards |
| Personal Agent Pack v2 | **Executable validation and restore planning; no pack importer/exporter or trainer** | Portable companion-continuity contracts can be validated and planned without opening vaults or granting authority |
| Repository-document effect chain | **Built and tested, deliberately production-unreachable** | Evidence-first draft-PR operator exists, but production policy/registry/runtime do not expose it and it has no merge authority |
| AXIOM Circles | **Product/programme work; no live Circle runtime route on supported `main` surface** | Circle governance candidates remain separately gated from current runtime authority |
| State/path/network fabrics | **Draft review work, not current `main` capability** | Simulation, resilient-path, telemetry/provenance, routing, DTN, and related work remain non-authorizing until separately merged and promoted |

## First 5 minutes

Requirements: Node.js `>=24.14.0 <25` and npm `>=11.0.0 <12`.

Protected CI and `.node-version` pin Node.js **24.18.0**. The candidate production image pins **24.19.0**.

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git
cd AXIOM-MESH
npm run doctor
npm run setup
npm run dev
```

In a second terminal:

```bash
npm run axiom -- status
npm run axiom -- capabilities
npm run axiom -- intent system.echo '{"message":"hello"}'
```

Use `npm run axiom -- --help` for the local command surface. Docker is not required for the basic local development path.

## What the supported kernel already does

The registry-backed production-candidate kernel includes:

- authenticated human and constrained-machine intent;
- deny-dominant policy and explicit planning;
- confirmation and independent approval where required;
- short-lived, bounded capabilities with restart-safe Grid consumption and burn-on-uncertainty semantics;
- machine principals with finite scopes, actions, purposes, destinations, runtime identity, expiry, non-delegation, execution time, request/response, rate, and concurrency ceilings;
- authenticated machine discovery that exposes requestability rather than permission;
- encrypted transactional Grid state for evidence, consent, memory, governance, accounting, portability, backup/restore, and recovery;
- signed hash-linked evidence plus externally retainable continuity anchors;
- authenticated operator API and CLI;
- mutually authenticated internal transport, deny-egress, service isolation, telemetry, SLO/resilience, backup/recovery, rotation, incident, pilot-intake, and independent-review mechanisms;
- admitted-node discovery/scheduling foundations;
- operator-approved two-Grid causal exchange without claiming remote execution or replicated consensus;
- deployment-independent signed secret/policy provider startup; and
- owner-scoped local and remote-review social projections.

Machine runtime IDs and software digests are authority-bound attribution metadata. They are **not** TPM/TEE, measured-boot, human-identity, legal-identity, or general remote-attestation proof.

## Sovereign context and private companion architecture

The largest change that the previous README underrepresented is the owner-local context plane now present on `main`.

The intended sequence is:

```text
semantic task need
  -> Context Request
  -> minimum-necessary local retrieval plan
  -> policy / consent / owner confirmation
  -> short-lived Vault Access Lease(s)
  -> local context broker / disclosure compiler
  -> minimized recipient-bound Context Capsule
  -> external model, agent, app, or workflow
```

The design separates four things that must not collapse into one another:

1. **Need** — what a task requires.
2. **Access** — which owner-local principal may inspect which private source.
3. **Disclosure** — which minimized claims may leave the owner trust domain.
4. **Effect authority** — whether any consequential action may occur.

`main` now contains executable, side-effect-free or deny-only primitives for Context Request / Vault Access Lease / Context Capsule validation, minimum-necessary retrieval planning, local disclosure compilation, Ed25519-signed authority evidence verification, replay-resistant Grid admission of evidence, admitted-only compilation, and append-only revocation/supersession state.

These primitives **do not** currently create a live vault service, decrypt private vault contents, issue general leases through a public route, deliver Context Capsules over a network, or grant execution authority.

### Personal Agent Pack v2

Personal Agent Pack v2 models companion continuity as a composition rather than one opaque model checkpoint:

```text
replaceable base model
+ runtime capsule
+ independently governed vault manifests
+ correction/evaluation history
+ preferences and policy
+ optional personalized model artifact
+ voice/avatar/persona configuration
+ recovery/migration manifest
= portable companion continuity
```

`main` can validate Pack v2 and governed model-adaptation contracts and can build deterministic restore plans from supplied observations. It does not yet perform Pack import/export, vault recovery, training, model unlearning, adapter loading, or personalized-model hosting.

Revocable personal memory remains outside model weights by default. Durable adaptation is a separate explicitly scoped operation.

## Agents, runtimes, and connectors

AXIOM-MESH is designed to work with replaceable agent scaffolding and model providers without delegating its authority boundary to them.

The byte-pinned **Agent Runtime Adapter v1** contract fixes grant translation, credential references, lifecycle, cancellation, revocation, idempotency, uncertainty, receipt, and rollback semantics. The reference adapter remains synthetic and certifies no external runtime.

The **Runtime & Connector Fabric** adds authority-neutral catalog and task/handoff contracts for future runtimes, models, tools, protocols, compute providers, and evidence sources. Catalog presence, installation, certification, curation, orchestration, or Circle/community endorsement cannot themselves grant AXIOM authority.

Current work may inspect bounded external-runtime candidates, but `main` does not claim certification or supported execution of Hermes, OpenClaw, Agent Zero, MCP, A2A, Codex CLI, or another third-party runtime.

## Human products

### AXIOM One

AXIOM One is an experimental loopback-only browser/PWA preview. It currently demonstrates node status, reversible review for bounded actions, approval-state distinctions, private owner-scoped memory, fixed provenance relations, confirmation-bound tombstoning, selective export/bundle reveal, raw evidence, and uncertainty recovery.

The kernel also contains owner-local social state and owner-only social/remote-review read surfaces. AXIOM One does not yet expose the full current Mesh capability surface, and Social/Circles/Governance/Identity/Recovery/Accounting remain broader product-integration work.

### AXIOM Verify

Planned as a user-facing independent evidence-verification surface. Current verification mechanisms exist in the kernel and tooling, but a promoted AXIOM Verify product is not claimed.

### AXIOM Circles

Circles are intended to provide invitation-based plural governance among independently owned nodes: membership, charters, proposals, decisions, tasks/commitments, objections/appeals, selective disclosure, revocation, exit, and export.

No live Circle runtime write route is claimed in the supported `main` capability surface. Circle candidate layers and governance semantics remain separately reviewed and promotion-gated.

### AXIOM Studio / Managed Node

These remain product programmes: Studio for contracts/capsules/adapters/policy/conformance tooling; Managed Node for optional operations without transferring platform ownership of user authority or data.

## Social and federation boundary

Current `main` supports local social actor/persona/publication state plus bounded owner-derived read projections. It does **not** claim a public social network or federation.

Future federation, including ActivityPub/Mastodon-compatible edges, must preserve user sovereignty: discovery and transport cannot silently grant authority, remote observations remain provenance-bound, and feed curation should remain separable from what a user is technically permitted to inspect.

No live Following feed, public-profile hosting, messaging, recommendation engine, relay network, blocking-as-community-censorship mechanism, or public consensus/finality layer is claimed today.

## Multi-node and network boundary

The current kernel has admitted-node scheduling and operator-approved causal exchange. Those controls are not a general routing layer.

Current `main` does not claim live multipath routing, RF control, DTN transport, Babel/RPL/RAW/Wi-SUN integration, cellular orchestration, public relays, or automated network-path optimization. Any future path-selection system remains subordinate to normal AXIOM authorization and evidence rules.

## Evidence integrity and continuity

Grid evidence is signed and hash linked. Local verification detects altered records, invalid signatures, gaps, and broken links. Local state alone cannot prove absence of a consistently deleted suffix if matching local head/checkpoint metadata is rewritten.

For stronger retained-history assurance, `axiom-grid-continuity-anchor.v1` can be kept outside `AXIOM_DATA_DIR` and checked against the full chain. It proves continuity through the newest retained anchor, not preservation of events after that anchor and not immunity from malicious host/root or active signing-key compromise.

Grid is a single-node transparency log. It is not BFT consensus.

## Repository-effect safety chain

`main` contains an evidence-first, credential-isolated, docs-only repository-effect prototype that can prepare a deterministic branch and create/recover an **open draft pull request** only after durable Grid preparation and exact-plan verification.

It has **no merge authority**, no direct-main mutation path, and reports `merge_performed: false` and `base_branch_content_changed: false`.

It remains production-unreachable: the production executor registry has zero mappings, production policy contains no `repository.docs.pull-request.create` action, and no supported public/runtime route invokes the chain.

## Capability lifecycle

AXIOM-MESH deliberately separates:

1. **Built** — code and tests exist.
2. **Enabled** — an operator deliberately activates it.
3. **Exposed** — a user, node, runtime, or external system can reach it.
4. **Production-promoted** — the exact build/deployment passes applicable gates.
5. **Marketed** — public claims describe only the promoted scope.

A feature may be technically sophisticated at stage 1 while remaining unavailable at stages 2–5.

## Supported runtime

The supported implementation is [`mesh/`](mesh/README.md).

| Service | Responsibility |
|---|---|
| Gateway | Authentication, validation, abuse controls, idempotency, and versioned user/operator APIs |
| Hypervisor | Intent normalization, deny-dominant policy, machine-authority checks, explicit planning, approvals, and capability issuance |
| Sandbox | Capability-bound bounded execution with no ambient supported authority |
| Grid | Encrypted durable state, evidence, approvals, consent, memory, governance, portability, recovery, and network records |

Every supported privileged effect preserves:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

The alternate four-unit single-host topology uses private per-service credentials, Grid-only durable state, and four exact internal network segments. Its machine-readable default-deny policy **permits only 41 current internal** caller/destination/method/route combinations and removes unrelated adjacency. This is single-host isolation, not multi-host consensus or automatic failover.

## Choose your path

| Goal | Minimum path |
|---|---|
| Start the local kernel | `npm run doctor` → `npm run setup` → `npm run dev` |
| Inspect current capability truth | `npm run axiom -- capabilities` and `mesh/config/capabilities.json` |
| Re-run source/test/docs gates | `npm run check` → `npm run release:verify` |
| Explore AXIOM One | `npm run axiom-one` → `npm run axiom-one:check` |
| Build products/adapters | Start with the roadmap, requirements, capability registry, and relevant architecture contract |
| Work on frontier research | Keep identities/data/value isolated and preserve explicit no-authority/no-promotion boundaries |

## Useful commands

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

## Verification drills

Run stateful drills only in explicitly empty disposable workspaces.

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
| Telemetry relay | `npm run telemetry-relay:drill -- /tmp/axiom-telemetry-relay-drill` |
| Credential rotation | `npm run credential-rotation:drill -- /tmp/axiom-credential-rotation-drill` |
| Data-key rotation | `npm run data-key-rotation:drill -- /tmp/axiom-data-key-rotation-drill` |
| Incident tabletop | `npm run incident-tabletop:drill -- /tmp/axiom-incident-tabletop-drill` |

Synthetic pilot, review, runtime-adapter, repository-effect, context, and laboratory fixtures prove mechanism behavior only. They do not create authentic deployment, external-world truth, runtime certification, or production promotion.

## Documentation

The documentation is organized by decision type. Start with the [documentation index](docs/README.md).

- [Current project status](docs/PROJECT-STATUS-2026.md)
- [Capability registry](mesh/config/capabilities.json)
- [Production readiness tracker](docs/PRODUCTION-READINESS-TRACKER.md)
- [Technical white paper](docs/whitepapers_and_research/WHITEPAPER.md)
- [Normative requirements](docs/rebuild/REQUIREMENTS.md)
- [Roadmap](docs/ROADMAP.md) and [master execution queue](docs/MASTER-TODO.md)
- [Sovereign Vaults and Context Broker](docs/architecture/SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md)
- [Vault Lease and Context Request](docs/architecture/VAULT-LEASE-AND-CONTEXT-REQUEST.md)
- [Personal Agent Pack v2 and Companion Continuity](docs/architecture/PERSONAL-AGENT-PACK-V2-AND-COMPANION-CONTINUITY.md)
- [Runtime & Connector Fabric](docs/architecture/RUNTIME-AND-CONNECTOR-FABRIC.md)
- [Current threat model](docs/security/CURRENT-BUILD-THREAT-MODEL.md)
- [Security policy](SECURITY.md)

When documents conflict, executable code, machine-readable policy, and the capability registry outrank narrative planning documents. Historical reviews remain provenance; open branches and pull requests are not current-main capability claims.

## Security and contribution

Do not add dependencies, credentials, new egress, browser secret storage, provider/runtime authority, production resolver mappings, remote execution, settlement, federation effects, or regulated-domain effects without the applicable threat model, negative tests, rollback, documentation, and promotion gates.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Non-claims

The active build does **not** claim:

- live production, public federation, testnet, or mainnet;
- a completed authentic pilot or independent security approval;
- supported AXIOM One, Verify, Circles, Studio, or Managed Node products;
- a live Sovereign Vault service, universal personal-context mount, or ambient cross-vault access;
- Pack v2 import/export, personalized-model training, model unlearning, or automatic vault recovery;
- certification or production operation of Hermes, OpenClaw, Agent Zero, MCP, A2A, Codex CLI, or another external runtime;
- autonomous machine delegation, remote agent execution, or general remote workload execution;
- a production repository-effect route, merge authority, or direct-main mutation from the docs operator;
- live multipath routing, radio/spectrum control, DTN forwarding, or public mesh relays;
- BFT consensus, replicated Grid finality, tokens, bridges, liquidity, staking, treasury, payroll, or settlement;
- arbitrary-code isolation;
- identity proofing, KYC, age assurance, government-ID, biometric, payment-authorization, funds-availability, or merchant-acceptance assurance;
- regulated-domain compliance or secure embodied autonomy;
- end-to-end post-quantum security;
- proof that a valid signature or Grid receipt establishes arbitrary external-world truth; or
- proof of retained history beyond the newest independently retained continuity anchor.

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**
