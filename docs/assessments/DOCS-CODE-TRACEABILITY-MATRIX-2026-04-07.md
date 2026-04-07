# Docs ↔ Code Traceability Matrix (M12.1)

**Created:** 2026-04-07  
**Scope:** Operator-facing and production-critical features.  
**Purpose:** Prevent stale documentation claims by linking each feature claim to implementation paths and executable verification evidence.

## Traceability Matrix

| Feature claim | Primary implementation path(s) | Test / evidence command | Operator HOWTO |
|---|---|---|---|
| Gateway accepts intents and forwards to Hypervisor orchestration. | `gateway/src/routes/rest.ts`, `hypervisor/src/api/server.py` | `npm --prefix gateway test` and `PYTHONPATH=hypervisor/src pytest -q hypervisor/tests` | `docs/HOWTO/submit-intent.md` |
| Local stack can be started with health checks for core services. | `docker-compose.yml`, `scripts/run_hyper_ag.py` | `docker compose config` | `docs/HOWTO/run-local-stack.md` |
| Swarm participation and node lifecycle are available in Grid. | `grid/chain.go`, `grid/nodeprofiles/profiles.go` | `go test ./...` (from `grid/`) | `docs/HOWTO/swarm-join.md` |
| Contracts can be compiled/tested locally for operator/dev workflows. | `grid/contracts/hardhat.config.cjs`, `grid/contracts/scripts/deploy.cjs` | `npm --prefix grid/contracts test` | `docs/HOWTO/contracts-local.md` |
| Recovery and sensitive-secret lifecycle operations are documented and enforceable. | `hypervisor/src/api/routes/recovery.py`, `hypervisor/src/api/security.py` | `PYTHONPATH=hypervisor/src pytest -q hypervisor/tests` | `docs/HOWTO/recovery-2fa.md`, `docs/HOWTO/secret-management.md` |
| Bridge emergency controls and operator incident response procedures are available. | `grid/contracts/contracts/CrossChainBridge.sol`, `scripts/verify_bridge_audit_pack.py` | `python scripts/verify_bridge_audit_pack.py` | `docs/HOWTO/bridge-emergency-runbooks.md` |
| Transformer foundation deployment evidence process is documented and script-backed. | `grid/contracts/scripts/deploy-pulse.cjs`, `grid/contracts/scripts/generate-deployment-evidence.cjs` | `node grid/contracts/scripts/deploy-pulse.cjs --help` | `docs/HOWTO/transformer-foundation-pulsechain.md` |

## Maintenance Rules

1. Any production-impacting PR must update this matrix if feature behavior or file ownership changes.
2. Each matrix entry must keep at least one executable validation command.
3. Every operator-facing entry must include at least one linked HOWTO in `docs/HOWTO/index.md`.
