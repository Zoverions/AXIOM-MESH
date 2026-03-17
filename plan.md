# AXIOM-MESH Roadmap – Master 2026 Edition (Updated March 2026)

## Q1 2026 – Complete System Fusion & Resource Orchestration (In Progress)
- [x] Phase 0: Documentation consolidation (v1.7 directive reflected in README/plan/docs)
- [ ] Phase 1: ResourceBalancer node + priority allocation
- [ ] Phase 2: GPP incentives + treasury splits (Network Security + Wealth Generation) + ERC-20 compatibility
- [ ] Phase 3: Alignment Profile init + spectrum security profiles + MCP interoperability + firewall + hierarchical bonding + governance
- [ ] Phase 4: Hardware profiles + offline resource awareness

All prior fusions now unified under one self-regulating, risk-tolerant, firewall-protected layer.

## Priority Implementation Checklist (High → Low)

### P0 — Decision Gate (Do First)
- [x] **Repository boundary decision**: choose either:
  - **Option A (recommended): AXIOM-MESH as source-of-truth monorepo** for contracts + gateway + hypervisor + sandbox + grid (+ vendored adapters for external references), or
  - **Option B: polyrepo orchestration** with strict version pins and CI contract compatibility checks.
- [x] Approve governance rule: any contract/API tweak required by AXIOM-MESH priorities lands here first, then is mirrored outward.
- [x] Freeze an Interface Control Document (ICD) for Gateway ↔ Hypervisor ↔ Sandbox ↔ Grid ↔ Contracts.

### P1 — Security & Identity Foundations
- [x] Add Alignment Profile spec (goals, traits, characteristics, risk tolerance, priority tags).
- [ ] Bind profile lifecycle to DID/VC + CRDT storage model.
- [ ] Define bilateral severance protocol (human or agent initiated), including zero-knowledge selective disclosure requirements.
- [ ] Define agent-as-firewall enforcement points for all external interaction paths.

### P2 — Interoperability & Compatibility Controls
- [x] Create MCP compatibility matrix schema (minimum security/risk thresholds per peer class).
- [x] Define spectrum security profiles (legacy locked device → full zkML node).
- [x] Specify hierarchical agent-to-agent bonding policy (nested trust, inheritance, revocation).
- [ ] Map governance controls (guild + bicameral + AIGovernor) to compatibility policy updates.

### P3 — Resource/Treasury Mechanics
- [x] Specify ResourceBalancer decisions (local vs peer vs Grid vs L1 path).
- [x] Specify treasury split mechanics (Network Security Fund + Wealth Generation Pool) and reporting.
- [x] Define ERC-20 compatibility envelope for rewards/currencies.
- [x] Add zk-anonymized telemetry requirements for fairness proofs and anti-overload controls.

### P4 — Delivery, Operations, and Rollout
- [ ] Build phased migration plan for legacy hardware/offline cohorts.
- [x] Define validation harness for success metrics (alignment choice integrity, compatibility enforcement, severance privacy, firewall routing, hierarchical bond behavior).
- [x] Add release gating checklist and rollback criteria for each phase.

## Parallel Work Lanes (Assign to Agents)

### Lane A — Identity/Alignment (can run now)
- Alignment Profile schema drafts
- DID/VC + CRDT persistence model
- Severance and memory-zeroization requirements

### Lane B — Interop/Governance (can run now)
- MCP compatibility matrix draft
- Security profile taxonomy
- Governance control map for interoperability knobs

### Lane C — Resource/Treasury (can run now)
- ResourceBalancer policy draft
- Treasury split accounting model
- ERC-20 compatibility and token-flow diagrams

### Lane D — Platform/Ops (can run now)
- Hardware profile matrix
- Offline-first sync and degraded-mode playbooks
- Test strategy + CI acceptance gates

## Dependencies Between Lanes
- Lane A outputs feed Lane B policy constraints.
- Lane B and Lane C must agree on enforceable thresholds before implementation starts.
- Lane D finalizes rollout only after A/B/C define acceptance tests.

## Success Metrics (Must Pass Before Phase PR Approval)
- [ ] Alignment Profile creation preserves user/agent risk choice boundaries.
- [ ] MCP discovery and handshakes reject peers below required security/risk profile.
- [ ] Bond severance is bilateral, private, and cryptographically enforceable.
- [ ] Firewall routing prevents direct unmediated external actions.
- [ ] Hierarchical bonding follows inherited policy + independent revocation rights.
- [ ] Prior fusion guarantees (treasury, ERC-20, offline resilience) remain intact.
