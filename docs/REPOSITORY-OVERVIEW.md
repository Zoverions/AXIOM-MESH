# AXIOM-MESH Repository Overview (March 2026)

## What is AXIOM-MESH?

AXIOM-MESH is a multi-service AI systems stack designed as a **closure-first, verifiable, governance-aware agent substrate**.
It combines AI orchestration with decentralized verification patterns, zk/zkML attestability paths, and governance-aware runtime boundaries.

## Core Architecture: Four Runtime Pillars

| Pillar | Language | Purpose | Default Port(s) |
| --- | --- | --- | --- |
| Gateway | TypeScript / Node | Authenticated API ingress, WebSocket handling, dashboard UI, and channel adapters | 3000 / 3001 |
| Hypervisor | Python / FastAPI | Context synthesis, memory orchestration, autonomous loops, and LangGraph workflows | 8000 |
| Sandbox | TypeScript / Node + Docker | Constrained ephemeral code execution with hardened container policy | 4000 |
| Grid | Go | Peer-aware ledger APIs, PoER checks, zk/zkML verification endpoints, bicameral governance sync | 5000 |

## Key Architectural Principles

1. **Graph-native**: Knowledge and context are represented as traversable/distributed graph structures.
2. **Bicameral governance**: Proposal generation and validation are separated to reduce unilateral drift.
3. **zkML-hardened**: Inference and proof-oriented verification paths are designed for attestability.
4. **Closure-first**: Explicit execution boundaries, capability constraints, and layered controls are favored over best-effort conventions.

## Capability Snapshot

### Operational Today
- Multi-service stack with health and status endpoints.
- Authenticated Gateway → Hypervisor intent handling with trace propagation.
- Sandbox code execution with hardened defaults (including `--network=none`).
- Grid endpoints for staking/slashing, skills, swarm/graph/cache primitives, and governance sync paths.

### Prototype / In Progress
- zkML verification flow hardening and production trust posture.
- AutoResearch/AutoTraining agent loop maturity.
- Extended explainability/audit workflows.
- Durable distributed sync and persistent graph retrieval guarantees.

### Backlog Direction
- Chain-integrated, production-grade bond lifecycle reconciliation.
- Fully integrated Rust air-gap control plane in default orchestration path.
- Operator-grade reasoning/safety auditor tooling.
- Robust persistent distributed graph search.

## 2026 Framework Integrations

AXIOM-MESH integrates modern framework patterns while preserving protocol-first constraints:
- **LangGraph**: Stateful orchestration substrate in Hypervisor flows.
- **CrewAI**: Role-oriented multi-agent collaboration patterns.
- **AgentZero/OpenClaw-style patterns**: Dynamic skill behavior and MCP interoperability.
- **AutoResearch lineage**: Autonomous research/training loop patterns.

## Quick Start

```bash
cp .env.example .env
make up

curl http://localhost:3000/health
curl http://localhost:8000/health
curl http://localhost:4000/health
curl http://localhost:5000/health
```

## Important Caveats

- Gateway sanitization is intentionally basic and not a full application firewall.
- `/api/v1/intent/process/public` is intentionally unauthenticated; treat as low-trust ingress and front with rate limiting/WAF.
- Grid ledger behavior is currently in-memory for key paths, not full persistent chain state.
- Safety/reasoning and zkML verification now include baseline policy/payload gates, but still require operator-grade hardening for full production trust.

## Related Documentation

- [README.md](../README.md)
- [docs/MASTER-INTEGRATION.md](./MASTER-INTEGRATION.md)
- [docs/AGENT-ENHANCEMENTS.md](./AGENT-ENHANCEMENTS.md)
- [AUDIT_REPORT.md](AUDIT_REPORT.md)
- [plan.md](plan.md)
- [docs/PARALLEL-DELIVERY-PLAN-2026.md](./PARALLEL-DELIVERY-PLAN-2026.md)
