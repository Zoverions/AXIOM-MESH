# AXIOM-MESH Operations (Canonical)

**Document role:** Canonical operations runbook baseline for reliability, incident response, and release controls.
**Last updated:** 2026-07-28.

---

## 1) Operating Principles

1. **Safety first:** fail closed for privileged or high-risk flows.
2. **Continuity over perfection:** degraded service is preferred over unsafe service.
3. **Evidence over assumptions:** every major action leaves traceable artifacts.
4. **Recovery readiness:** drills and replay paths are first-class requirements.

---

## 2) Core Operational Domains

### 2.1 Service Reliability
- Health checks across Gateway, Hypervisor, Sandbox, and Grid.
- Backpressure/queueing to absorb transient faults.
- Circuit-breaker behavior for dependent service failures.

### 2.2 Security Operations
- Abuse controls at ingress.
- Access control verification for privileged paths.
- Incident containment and post-incident evidence capture.

### 2.3 State & Ledger Operations
- Snapshot integrity checks.
- Replay/reconciliation procedures.
- Finality-aware handling for chain-connected workflows.

### 2.4 Release Operations
- Gate evidence validation (security, reliability, economics, docs parity).
- Controlled rollout and rollback strategy.
- Immutable release summary artifacts.

---

## 3) Standard Operational Cadence

1. **Daily:** service health, alert triage, queue health, and drift checks.
2. **Per release:** gate evidence assembly and validation.
3. **Weekly:** resilience drills (partition/failure simulations).
4. **Per incident:** severity triage, containment, communication, recovery, retrospective.

---

## 4) Incident Lifecycle

1. **Detect:** trigger from telemetry, SLO breach, or operator report.
2. **Classify:** severity and affected trust boundaries.
3. **Contain:** isolate failing component and protect critical state.
4. **Recover:** restore service with minimal blast radius.
5. **Verify:** validate correctness and reconciliation post-recovery.
6. **Review:** capture root cause and preventive actions.

---

## 5) Canonical Chaos/Resilience Scenarios

The following are required baseline scenarios:

1. **Network partition (Grid/P2P)**
   - Validate queueing, consistency restoration, and sync behavior.
2. **Proof/verification failure surge**
   - Ensure unsafe outcomes are not accepted; fallback remains bounded.
3. **Hypervisor disruption**
   - Validate circuit-breakers, fallbacks, and recovery transitions.
4. **Snapshot persistence failure**
   - Validate safe startup warnings and recovery without silent corruption.

Detailed scenario playbooks live in:
- `docs/DEGRADED-MODE-PLAYBOOK.md`
- `docs/RESILIENCE-DRILLS-AND-PENTEST-RUNBOOK-2026-03-29.md`
- `docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md`

---

## 6) Release Readiness Controls

A release is not promotable unless all are satisfied:
- Security gate passed or explicitly excepted with expiry.
- Reliability gate passed with drill evidence.
- Economic/ledger gate passed with reconciliation evidence.
- Governance/audit gate passed with approval trace.
- Documentation parity confirmed for all production-impacting changes.

Primary references:
- `docs/PRODUCTION-READINESS-TRACKER.md`
- `docs/HOWTO/release-gate-evidence.md`
- `docs/MASTER-TODO.md`

---

## 7) Roles and Accountability

Operational ownership should always be explicit for:
- Incident commander,
- Security lead,
- Reliability lead,
- Release manager,
- Documentation owner.

Role roster and deputies are tracked in `docs/PRODUCTION-READINESS-TRACKER.md`.

---

## 8) Canonical Operations References

- Architecture baseline: `docs/ARCHITECTURE.md`
- Governance policy: `docs/GOVERNANCE.md`
- Strategic milestones: `docs/ROADMAP.md`
- Active execution queue: `docs/MASTER-TODO.md`
