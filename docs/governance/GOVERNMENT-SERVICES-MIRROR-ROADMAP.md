# Government Services Mirror Roadmap (Pull-Not-Push)

**Status:** Active roadmap baseline (non-mainnet/testnet task).  
**Last updated:** 2026-03-29.

## Objective
Mirror high-value government service flows for the US, UK, and China using a **pull-not-push** execution model:
- Citizens and agencies explicitly request data/actions.
- No proactive data push to third parties.
- Policy enforcement is region-scoped and consent-bound.

## Pull-Not-Push Principles
1. **Consent-gated retrieval only**: every cross-system request requires signed consent scope.
2. **Least-data responses**: return the minimum fields needed for a declared service intent.
3. **No silent fan-out**: no background replication of personal records to unrelated services.
4. **Fail-closed region checks**: requests without valid region policy proofs are rejected.
5. **Auditable lineage**: each pull records reason, actor, scope, and retention policy.

## Service Mirror Tiers

### Tier 1 (Foundational)
- Identity and eligibility checks
- Benefits status retrieval
- Case/ticket status lookup
- Appointment scheduling pull APIs

### Tier 2 (Operational)
- Education record verification
- Health eligibility routing (non-diagnostic)
- Permits/licensing status
- Tax statement retrieval

### Tier 3 (Advanced)
- Cross-agency orchestration with policy proofs
- Federated dispute workflows
- Region-aware governance simulation and redress automation

## Regional Capsule Plus Tracks

### US Government Capsule Plus (planned)
- Standards alignment: state/federal split policy overlays.
- Early services: identity/benefits, permits, education verification.
- Governance note: federal + state policy inheritance.

### UK Government Capsule Plus (planned)
- Standards alignment: national services with devolved regional overlays.
- Early services: NHS-facing eligibility pulls, local authority permits, HMRC statement retrieval.
- Governance note: nation-specific policy packs (England, Scotland, Wales, NI).

### China Governance Capsule Plus (planned)
- Standards alignment: province/municipal policy overlays.
- Early services: household/admin status retrieval and local permit workflows.
- Governance note: strict pull-not-push and explicit consent/authority boundaries.

## Implementation Phases

### Phase A — Policy + Data Contracts
- Define region policy packs and capability constraints.
- Publish canonical intent schemas for service pull requests.
- Define minimal field contracts per service category.

### Phase B — Capsule Runtime Integrations
- Implement adapters in capsule runtimes for Tier 1 pulls.
- Add consent receipt verification on each request.
- Add end-to-end audit artifacts for every pull invocation.

### Phase C — Governance Controls
- Enable bicameral review for policy-pack changes.
- Add red-team misuse scenarios (overbroad pulls, cross-region leakage).
- Add periodic compliance attestations and rollback runbooks.

## Acceptance Criteria
- Region-specific policy packs exist for US/UK/China.
- Pull requests fail closed without consent scope and region proof.
- Service mirror telemetry records actor/reason/scope/retention per request.
- No push-based replication pathways are enabled by default.

## Out-of-Scope
- Mainnet launch tasks.
- Testnet deployment tasks.
- Production funding ceremonies.
