# AXIOM-MESH

AXIOM-MESH is a multi-service AI systems stack with four runtime pillars plus contracts/schemas/tooling.

**Reality status (2026-03-21):** pre-launch repository and staging hardening; not live on testnet/mainnet.

## Runtime Pillars

- **Gateway (TypeScript/Node):** ingress APIs, auth, channels, routing.
- **Hypervisor (Python/FastAPI):** orchestration, context/memory, policy gates.
- **Sandbox (TypeScript/Node + Docker):** constrained code execution.
- **Grid (Go):** ledger, p2p sync, chain-facing components.

## Quick Start

```bash
make up
make test
```

Health endpoints:
- `http://localhost:3000/health` (Gateway)
- `http://localhost:8000/health` (Hypervisor)
- `http://localhost:4000/health` (Sandbox)
- `http://localhost:5000/health` (Grid)

Stop services:

```bash
make down
```

## Documentation

Use `docs/README.md` as the canonical documentation index.

Key docs:
- `docs/TASK-BOARD.md` — agent-actionable canonical task list
- `docs/AGENT-DOC-UPDATE-POLICY.md` — required documentation update rules
- `docs/FOUNDATIONS.md` — foundational architecture/governance/security/economics
- `docs/TOKENOMICS.md` — canonical tokenomics reference
- `docs/HOWTO/README.md` — operational runbook index

## Contract Workflow

```bash
make contracts-compile
make contracts-test
make contracts-deploy
```

## Release Evidence Validation

```bash
make validate-release-evidence RC_PATH=release-evidence/RC-<date>-<tag>
```

Strict mode:

```bash
make validate-release-evidence RC_PATH=release-evidence/RC-<date>-<tag> STRICT=1 ENFORCE_SUMMARY=1
```
