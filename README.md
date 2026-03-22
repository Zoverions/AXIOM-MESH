# AXIOM-MESH

AXIOM-MESH is a multi-service agent runtime with four core pillars:
- **Gateway** (TypeScript/Node): ingress APIs, channels, dashboard delivery.
- **Hypervisor** (Python/FastAPI): orchestration, context engine, policy and routing logic.
- **Sandbox** (TypeScript/Node + Docker): isolated code execution.
- **Grid** (Go): ledger, verification, governance-aligned coordination.

> Status (2026-03-21): repository/staging hardening. Not declared live on mainnet.

---

## Quick Start

### 1) Automated install (interactive)
```bash
./install.sh
```

### 2) Automated install (non-interactive / agent mode)
```bash
AUTO_INSTALL=1 \
MACHINE_ROLE=shared-machine \
MESHSTORE_QUOTA_GB=50 \
./install.sh
```

This installer now:
- detects hardware and writes `config/machine_profile.json`,
- runs blockchain launch preflight (`local-mesh` / `single-node` / `launch-testnet` / `launch-network`) and estimates required bootstrap funding,
- persists `.env` defaults for machine role, launch mode, profile path, and funding estimate,
- sets storage quota safely against available disk,
- can run fully unattended for digital-agent onboarding.

Use `docs/README.md` as the canonical documentation index.


## Lightweight Engagement Protocol

First-run setup now asks only a minimal secure set of user choices:
- machine role (`dedicated-mesh`, `shared-machine`, `minimal-edge`),
- launch mode (`local-mesh`, `single-node`, `launch-testnet`, `launch-network`),
- priority (`performance`, `security`, `cost`, `autonomy`).

If `launch-network` or `launch-testnet` is selected, preflight estimates bootstrap ETH required and surfaces whether wallet funding is needed before broadcast. If you skip funding, installer can fall back to local mesh mode.

---

## Runtime Resource-Aware Routing

The ResourceBalancer (Hypervisor) uses machine profile + live host pressure to decide `local`, `p2p`, or `grid` execution:
- shared machines bias away from local work when host pressure is high,
- dedicated mesh machines keep more execution local,
- critical or consensus tasks route to grid.

Primary implementation points:
- `hypervisor/src/graph/resource_balancer.py`
- `scripts/generate_machine_profile.py`
- `scripts/network_launch_preflight.py`
- `install.sh`

---

## Documentation (Consolidated)

Use `docs/README.md` as the canonical documentation index.

### Canonical execution queue
- **`docs/MASTER-TODO.md`** is the single queue for active agent work.
- Detailed task breakdowns live under `docs/subtasks/`.

### Execution references
- `docs/PARALLEL-DELIVERY-PLAN-2026.md`
- `docs/PRODUCTION-EXECUTION-BACKLOG.md`
- `docs/PRODUCTION-READINESS-TRACKER.md`

### Core references
- `docs/ARCHITECTURE.md`
- `docs/TECHNICAL-SPECIFICATION.md`
- `docs/INTERFACE-CONTROL-DOCUMENT.md`
- `docs/SECURITY-HARDENING.md`
- `AUDIT_REPORT.md`

---

## Consolidation & Pruning Rules

To keep the repository organized and reduce list sprawl:
1. Add new actionable work to `docs/MASTER-TODO.md` only.
2. Keep detailed steps in linked subtask files, not parallel top-level lists.
3. Archive duplicate/legacy planning docs to `docs/historical/` after migration.
4. Keep service-level READMEs focused on implementation, not parallel strategy queues.

---

## Service Readmes

- `gateway/README.md`
- `hypervisor/README.md`
- `sandbox/README.md`
- `grid/README.md`
