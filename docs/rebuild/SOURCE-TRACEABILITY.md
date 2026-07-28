# AXIOM-MESH Source Traceability

**Audited revision:** `e65041c`
**Corpus:** all tracked files, with detailed review of the iterative
architecture, whitepaper, governance, security, audit, assessment, operations,
tokenomics, capsule, consensus, roadmap, and status documents
**Purpose:** show where the rebuild requirements came from and how conflicts
were resolved

## Interpretation rule

The corpus is not a single consistent specification. It is an idea and
implementation history. The rebuild used this precedence:

1. executable behavior and reproducible evidence over a checked roadmap item;
2. a later audit correction over an earlier readiness claim;
3. the interface-control path over convenience bypass routes;
4. a safety invariant over token, governance, or autonomy expansion;
5. an explicit `unavailable` state over mock or synthetic success;
6. user portability and revocation over platform lock-in;
7. one machine-readable status record over manually synchronized dashboards.

No visionary feature was discarded merely because it is not safe to run yet.
It is represented in the capability registry as `adapter_required`,
`experimental`, `specified`, or `disabled`.

## Source-to-requirement map

| Concern | Principal sources reviewed | Necessary content extracted | Rebuild disposition |
|---|---|---|---|
| Product identity | `AXIOM_MESH_ARCHITECT_REPORT.md`, `docs/whitepapers_and_research/WHITEPAPER.md`, `docs/REPOSITORY-OVERVIEW.md` | A decentralized, verifiable execution substrate for human and autonomous-entity intents | Retained as the local-first capability-network definition |
| Runtime topology | `docs/architecture/FOUNDATIONS.md`, `docs/architecture/ARCHITECTURE.md`, `docs/architecture/INTERFACE-CONTROL-DOCUMENT.md` | Gateway, Hypervisor, Sandbox, and Grid with one effect path | Implemented as four separate processes |
| Sovereignty program | `docs/MASTER-INTEGRATION.md`, `docs/STRATEGIC-AUDIT-RESPONSE.md` | Broader identity, governance, storage, workforce, economics, and portability pillars | Preserved as capability families outside the minimal trusted kernel |
| Capsules | `docs/SKILL-CAPSULE-SPEC.md`, capsule templates, security scope-firewall documents | Signed immutable manifests, constraints, schemas, provenance, SBOM, quarantine, revocation, install/authority separation | Registry implemented; marketplace and untrusted runtime remain specified/adapter-required |
| Planning and provenance | architecture reports, CPoR and transformer-control documents | Plans must name effects and evidence; observable lineage is useful | Implemented plan/evidence digests; private chain-of-thought and “proof of truth” claims rejected |
| Grid and consensus | `docs/GRID-CONSENSUS-SPEC.md`, Grid architecture/state documents, degraded-mode material | Durable evidence, node admission, finality-aware mutation, offline behavior | Transactional signed transparency log and admitted-node causal packages implemented; BFT/federation explicitly not claimed |
| Policy and governance | `docs/governance/GOVERNANCE.md`, governance control maps, v3 and uncertainty protocols | Deny-dominant policy, proposal/review/delay/activation, bounded emergency control, separate human/agent input, appeal | Local voting, activation, rollback, emergency, review, and appeal records implemented; portable delegation remains specified |
| Consent and identity | societal-OS assessments, identity/privacy documents, domain plans | Subject/controller/purpose/scope/expiry/revocation; SSI and selective disclosure; stricter minor/domain safeguards | Consent receipts implemented; SSI and credentials specified |
| Portability | `docs/assessments/SUPER-APP-GAP-AND-EXPORT-STRATEGY-2026-04-08.md`, societal-OS audit playbook | Export is a P0 trust primitive; stable schemas, selective scope, signed bundles, import dry run | Signed time/type/object/capsule-scoped export, optional X25519 recipient encryption, independent verification, and staged deterministic import are implemented |
| AI, research, and tools | AI, transformer, research, scientific-tool, Graphify, MCP, XMCP, and partner-adapter documents | Provider routing, memory graph, research loops, web/code/data/math/physics/crypto tools | Represented as fail-closed adapters; autonomous loops disabled |
| Communications | channel, XMCP, dashboard/mobile, and everything-app documents | Messaging and social channels through governed adapters | Adapter-required; no synthetic provider results |
| Node/storage/offline | node-profile, storage-offer, scaling/privacy, degraded-mode, and state-management documents | Capability-aware nodes, security profiles, storage offers, backup/restore, causal sync, conflict visibility | Local signed node/offer lifecycles, encrypted backup/restore, and admitted-node causal package sync implemented; transfer adapters, discovery, scheduling, and federation remain unavailable/specified |
| Domain capsules | education, health, government, business, finance, and embodied-workforce assessments | Shared capsule path with stricter consent, minimization, appeal, safety, and regulatory policy | Adapter-required or disabled; no domain receives kernel bypass authority |
| Economics | tokenomics, treasury, bond, reward, bridge, liquidity, payroll, and founder-decay documents | Core access token independence, integer double entry, optional finality-aware settlement, PoER only as a reward signal | All value-moving effects disabled until policy is reconciled and independently audited |
| Security and operations | security reality, threat model, hardening, release, degraded-mode, evidence, and audit documents | No default keys, authenticated services, secrets hygiene, deterministic startup, structured evidence, accurate readiness claims | Applied to the kernel and to the highest-risk historical defaults |
| Roadmaps and status | roadmap, backlog, traceability, release-readiness, master-task, and on-chain-queue documents | Large feature inventory and intended ordering | Converted to one validated capability registry; checklist completion is not proof |

## Contradiction resolutions

| Conflict | Resolution |
|---|---|
| Four runtime pillars vs eight sovereignty pillars | Four are runtime trust boundaries; the wider program is a set of governed capability families. |
| `MASTER-TODO.md` as canonical vs its later deletion | Engineering work remains reviewable off-chain; on-chain governance does not replace issue and release control. |
| mTLS and “all high findings resolved” vs security-reality warnings | Current kernel uses signed replay-resistant loopback calls; remote production transport remains unavailable until audited mTLS exists. |
| BFT finality vs in-memory/hash-puzzle behavior | Current Grid reports a single-node transparency log and `consensus: false`. |
| CPoR proves reasoning/truth vs hashes only prove record integrity | Evidence records observable inputs, rules, grants, outputs, and hashes; it makes no private-reasoning or truth claim. |
| PoER as consensus vs useful-compute reward scoring | PoER may later inform rewards but cannot supply Sybil resistance or finality. |
| Multiple incompatible founder and treasury schedules | Token, treasury, bond, bridge, and liquidity effects remain disabled. |
| “Deployed/verified” labels vs mock evidence and empty addresses | No deployment claim without chain, address, bytecode digest, transaction, and independent verification. |
| LWW described as safe offline resolution | Implemented version vectors retain concurrent heads; resolution must causally dominate and explicitly name every current head. |
| Legacy Compose and telemetry surfaces implied production readiness | Candidate packaging is limited to the claim-gated `mesh/` container, explicit offline provisioning, four supervised processes, loopback internals, bounded metrics, and dependency-aware readiness; the host-mode drill passes, while image/container evidence and any live-deployment claim remain pending. |
| Domain breadth vs kernel safety | Every domain is a capsule/adapter subject to the same effect path, with stricter policy where harm is higher. |

## Coverage result

The capability registry currently contains 35 explicit entries covering the
complete extracted feature program:

- core intent execution and evidence;
- policy, governance, consent, identity, and SSI;
- capsules, marketplace, scientific tools, and provider adapters;
- memory, research, communications, nodes, storage, and offline sync;
- education, health, government, business/finance, workforce, and embodiment;
- accounting, token/treasury/bond/reward/bridge/liquidity, and proof verifiers;
- export/import, dashboard/CLI, installer, observability, and release evidence.

Only executable, negative-tested slices are marked `implemented`. This
traceability file explains the product intent; the registry controls runtime
claims.
