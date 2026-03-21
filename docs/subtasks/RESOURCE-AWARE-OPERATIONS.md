# Subtasks: Resource-Aware Operations

Parent queue: `docs/MASTER-TODO.md` (Lane M3)

## Objectives
Protect local hosts from over-exhaustion while preserving mesh contribution quality.

## M3.1 Quotas and limits
- [ ] Define baseline CPU/memory/IO quotas per machine profile.
- [ ] Enforce limits in runtime config and container settings.

## M3.2 Host-pressure response
- [ ] Track system pressure metrics (CPU steal/load, memory pressure, IO wait, thermal state).
- [ ] Introduce throttle tiers: `normal`, `constrained`, `critical`.

## M3.3 Shared-machine safeguards
- [ ] Add quiet-hours mode and user-activity sensitivity.
- [ ] Prioritize user-facing OS responsiveness over mesh throughput.

## M3.4 Routing adaptation
- [ ] Update ResourceBalancer to reduce local execution under pressure.
- [ ] Escalate to Peer/Grid when safe and policy-compliant.

## M3.5 Recovery and audit
- [ ] Log all throttle/routing decisions for auditability.
- [ ] Auto-restore normal mode after sustained healthy conditions.
