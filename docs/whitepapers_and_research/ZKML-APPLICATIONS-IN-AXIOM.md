# zkML Applications in AXIOM-MESH (Priority Exploration)

Date: 2026-03-25

## Existing zkML Surface Area

AXIOM already contains production-facing zkML primitives across Grid, Gateway, and Hypervisor:
- Deterministic verification worker queue and payload guards in Grid API paths.【F:grid/api/server.go†L181-L300】
- Multi-level proof caching + verifier abstraction in Grid consensus package.【F:grid/consensus/zkml.go†L24-L174】
- Hypervisor inference orchestration that can require proof-backed execution for decentralized runs.【F:hypervisor/src/engine/inference_orchestrator.py†L1-L118】
- Gateway route integration to request proof generation and apply privacy-aware fallback behavior.【F:gateway/src/routes/rest.ts†L138-L191】

## High-Impact Near-Term Applications

1. **Governance Proposal Validity Proofs**
   - Use zkML evidence to attest that consequence-simulation outputs were generated from approved model commitments.
   - Attach proof hash to governance proposals before settlement execution.

2. **SSI Selective Disclosure for Public Services**
   - Replace full-record sharing with proof of predicate (e.g., “is eligible”, “is resident”, “is licensed”).
   - Bind proof scope to consent receipt nonce and purpose code.

3. **Cross-Chain Claim Safety Classifier**
   - Run zkML anomaly scoring over bridge claim features.
   - Require successful proof verification before redemption finality on PulseChain path.

4. **Adaptive Resource Balancing with Verifiable Risk Signals**
   - Route high-risk actions to stricter lanes (local/sandbox/grid) based on provable model outputs.

## Suggested Implementation Backlog (M8/M10 Support)

- Add `zkml_purpose` metadata in model-run envelopes for compliance traceability.
- Create verifier policy profiles (`strict`, `balanced`, `expedited`) mapped to service classes.
- Add partition/failure simulation test for proof verification timeout and fail-closed behavior.
- Create immutable audit summary writer for each verified decision path.

## Security Constraints

- Fail closed on missing, malformed, or timeout proofs.
- Enforce artifact/vector size ceilings (already present in Grid) on every new endpoint.
- Version and pin verification keys with explicit rotation runbook.

## Recommended First 2 Deliverables

1. `docs/audits/zkml-governance-closure-profile.md` (proof policy for governance decisions).
2. `testing/chaos/` scenario for network partition + proof queue saturation.
