# AXIOM-MESH Baseline Audit

**Audited revision:** `e65041c`
**Audit date:** 2026-07-25
**Method:** full tracked-file inventory, canonical/reference document review,
git-history review, endpoint and source inventory, targeted secret/default/mock
scans, and attempted clean builds.

## Executive finding

The repository contains a valuable and unusually broad product design, but the
implementation is not a coherent production system. It grew from 62 files to
more than 1,200 tracked files and more than 800 merged changes in about ten
weeks. Many changes added a new named feature, contract, document, or test
without closing the end-to-end runtime loop. The result is high conceptual
coverage but low assurance density.

The safest rebuild strategy is a small, dependency-light kernel with explicit
capability states and adapters. Reusing the existing runtime as the production
base would preserve too many contradictory interfaces, weak defaults, synthetic
success paths, and unverifiable claims.

## Corpus interpretation

The documents form four overlapping generations:

1. **Core substrate:** four services, secure intent loop, capability manifests,
   Grid evidence, and optional settlement.
2. **Sovereignty expansion:** eight pillars, governance guilds, tokenomics,
   cross-chain liquidity, automated workforce, and digital legacy.
3. **Societal OS expansion:** education, health, government, identity, consent,
   mini-app/capsule ecosystem, and embodied systems.
4. **Audit correction:** repeated warnings that mock paths, key management,
   deployment evidence, service identity, and financial controls remain
   incomplete.

The rebuild retains requirements from all four generations but treats the audit
corrections as constraints on every earlier claim.

## Material contradictions

| Topic | Conflicting repository claims | Rebuild decision |
|---|---|---|
| Execution authority | ICD says Gateway → Hypervisor → Sandbox → Grid; several routes allow Gateway → Sandbox or direct Grid mutation. | One mandatory effect path; no direct public Sandbox or Grid mutation. |
| Roadmap authority | Dozens of files call `docs/MASTER-TODO.md` canonical; it was deleted when the on-chain queue was introduced; newer roadmap still references it. | Machine-readable feature/status registry plus normal reviewed backlog; on-chain governance does not replace engineering issue tracking. |
| Readiness | Trackers mark every release gate complete; status/security docs say controlled pilot only; production compose and install paths are internally inconsistent. | Baseline is pre-alpha/rebuild. Claims derive from executable evidence only. |
| Consensus | Docs describe BFT-like ≥2/3 finality; code and other docs describe an in-memory ledger or hash-puzzle PoER. | Single-node mode is a transparency log. Federated consensus must use a separately audited protocol; PoER is a reward signal only. |
| CPoR | Some text says hashes prove why an AI reasoned or that a result is true. | Evidence graph proves record integrity and declared lineage, not truth or private reasoning. |
| Founder control | 4-year vesting, 8-year vesting, decay to zero, permanent 5% reserve, and locked 5% appear in different canonical documents/contracts. | Economic controls remain disabled until one ratified policy is encoded and tested. |
| Treasury | 60/40 is canonical, while historical code/audits show 10/90 defaults and owner withdrawal paths. | Double-entry journal first; settlement adapter disabled until reconciled and audited. |
| Deployment | “Verified/deployed” claims coexist with mock deployment bundles and empty mainnet addresses. | No live-deployment claim without chain ID, address, bytecode digest, transaction, and independent verification. |
| Security | README says all service calls use mTLS and all high findings are resolved; security reality says inter-service auth is C-grade. | Signed, replay-resistant service calls are mandatory; production additionally requires mTLS. |
| Capsules | Spec correctly says external skills are quarantined; runtime contains mock fallback and broad execution surfaces. | Declarative, signed, immutable capsule registry; provider absence is explicit failure. |
| Offline sync | LWW is described as resolving conflicts safely. | Causal/version-vector merge with visible conflicts for non-commutative data. |

## Concrete security and integrity findings

### Critical/high

- A real private key file is tracked at `cli/skill-sign/private.pem`.
- A known development EVM private key is a runtime fallback in
  `gateway/src/routes/distribution.ts`.
- `hypervisor/src/orchestrator/sovereign_queue.py` defaults to the private key
  value `1`.
- `services/provision/provision_service.py` invokes `os.system()` with an
  interpreter path.
- Production and development Compose files disagree on ports, build contexts,
  Dockerfiles, service commands, networks, and included services.
- Root Compose references `grid/main.go`, while the tracked entry point is
  `grid/cmd/grid/main.go`.
- Root Docker/Compose topology does not match the service-specific Dockerfiles
  described by the production configuration.
- Public and internal routes are mixed across services, and Grid even wraps its
  health endpoint in mutation-style signature middleware.

### Medium

- Runtime code contains mock data paths for X, mobile dashboards, distribution,
  MCP, privacy/zkML, chain adapters, and external connectors.
- The repository tracks a roughly 47 MB compiled `grid/grid` binary, source
  maps, `.orig` files, a bundled ZIP, sample signatures, and generated API docs.
- More than 130 Solidity contracts create a very large audit and deployment
  surface. Several are duplicates, legacy variants, mocks, or placeholders.
- Dependencies are split across unpinned Python requirements, multiple npm lock
  files, Go modules, Rust, Hardhat, and Foundry. Toolchain versions are
  inconsistent (`Node 20`, `25`, and `26`; Go `1.23` and `1.25.7`).
- The top-level traceability matrix references files and commands that do not
  match the current tree.
- Evidence artifacts are often generated by scripts that validate shape rather
  than independent runtime truth.

## Baseline build results

- Grid tests could not start in the audit environment because the Go toolchain
  is absent.
- Python tests could not start because pytest is not installed in the clean
  runtime; `hypervisor/requirements.txt` is unpinned and includes duplicate and
  exceptionally heavy dependencies.
- Gateway and Sandbox clean installs did not complete in the first pass because
  the environment's default npm cache path was unavailable. This is an
  environment blocker rather than a code verdict, but it also illustrates the
  cost of the current dependency surface.
- Static compilation of Python source completed before pytest dependency
  discovery.

The rebuild therefore uses a runtime and test strategy that can execute from a
clean checkout without dependency installation, while external adapters remain
separately installable.

## Rebuild architecture decision

The new kernel uses one maintained runtime language and the platform standard
library for the four services. This removes hundreds of transitive packages
from the trusted computing base while keeping each pillar as a separate
process and security boundary.

The initial persistence layer is a transactional local database owned only by
Grid. The evidence store is hash linked and exportable. Federation, chain
settlement, model providers, channel providers, object stores, and untrusted
container execution are adapters that are unavailable until configured and
verified; they never silently return mock success.

## What is preserved

- Four-pillar topology and strict core loop
- Graph-native provenance and memory concepts
- Capsule lifecycle and capability manifests
- layered deny-dominant policy
- user-controlled consent, severance, revocation, and export
- governance lifecycle, bounded emergency controls, and rollback
- local-first/degraded operation
- node profiles, adaptive scheduling, and resource accounting
- education/health/government/business/finance as stricter domain capsules
- transparent accounting and optional external settlement

## What is intentionally removed from the trusted kernel

- arbitrary unauthenticated “dev public” execution
- hidden default keys and synthetic provider results
- self-modifying/repository-managing agents with direct merge authority
- model chain-of-thought storage or “proof of truth” claims
- PoER hash puzzles as finality or Sybil resistance
- automatic bridge/liquidity/token deployment
- bespoke privileged routes for every speculative domain
- duplicated, placeholder, and unaudited contracts on the default deployment
  path
