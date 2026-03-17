# AXIOM-MESH Interface Control Document (ICD)

Version: 1.0  
Status: Approved for implementation  
Updated: 2026-03-17

## 1. Repository Boundary Decision

**Decision: Option A (Monorepo source of truth)**

AXIOM-MESH is the source-of-truth monorepo for contracts, gateway, hypervisor, sandbox, grid, schemas, and docs. External adapters may be vendored but must not supersede canonical interfaces defined here.

## 2. Governance Rule for Interface Changes

Any contract or API change required by AXIOM-MESH priorities **must land in this repository first**, including:
- OpenAPI/API surface changes in `gateway`, `hypervisor`, `sandbox`, or `grid`.
- Contract ABI/event changes in `grid/contracts`.
- Schema contract changes in `schemas/`.

Downstream mirrors are updated only after this repo passes release gates.

## 3. Inter-service Contract Surface

| Edge | Protocol | Primary Contract | Reliability Requirements |
|---|---|---|---|
| Gateway -> Hypervisor | HTTP JSON | `schemas/intent_object.v1.json` | auth required, trace id required, retries bounded |
| Hypervisor -> Gateway | HTTP JSON | `schemas/intent_response.v1.json` | provenance + audit fields preserved |
| Hypervisor -> Grid | HTTP JSON | `schemas/skill_vector.v1.json`, `schemas/zkml_payload.v1.json` | idempotent skill submit, proof verification required |
| Gateway -> Sandbox | HTTP JSON | internal execute contract | strict policy allowlist, timeout + kill path |
| Agent/Peer MCP edges | MCP | `schemas/mcp_compatibility_matrix.v1.json` | reject peers below security/risk thresholds |

## 4. Security Profile Taxonomy

- `S0_LEGACY_LOCKED`: highly constrained device, limited crypto support.
- `S1_BASELINE`: modern device with signed runtime and encrypted storage.
- `S2_HARDENED`: attested runtime, hardened sandbox, secure key mgmt.
- `S3_ZKML_FULL_NODE`: full zkML verifier + governance participation.

Interaction policy defaults to deny; compatibility matrix defines minimum required profile per peer class.

## 5. Firewall Enforcement Points

All external interactions route through bonded agent controls:
1. Gateway ingress authentication and normalization.
2. Hypervisor policy checks and alignment-profile evaluation.
3. Sandbox execution policy and egress isolation.
4. Grid attestation, settlement, and governance checks.

Direct external action paths that bypass this chain are disallowed.

## 6. Severance & Hierarchical Bonding Controls

- Bilateral severance may be initiated by human or agent.
- Severance requires revocation record + selective-disclosure proof artifact.
- Post-severance memory handling: private context is cryptographically zeroized/withheld.
- Hierarchical agent bonds inherit parent policy ceilings while retaining independent revocation rights.

## 7. Resource/Treasury Decision Envelope

### ResourceBalancer route order
1. Local execution if policy + capacity thresholds pass.
2. Trusted peer offload if compatible and lower risk/cost.
3. Grid execution path for consensus/auditable tasks.
4. L1 fallback for settlement-critical operations.

- Telemetry used for balancing/fairness must be zk-anonymized and aggregation-safe before export.

### Treasury split policy
- `Network Security Fund`: default 60%
- `Wealth Generation Pool`: default 40%

Percentages are governance-managed and versioned. Reporting must publish allocation period, inflow totals, outflow totals, and balance deltas.

### ERC-20 compatibility envelope
- Rewards/currencies exposed through canonical ERC-20 transfer/allowance semantics.
- Non-ERC20 assets require wrapped representation before entering reward accounting.

## 8. Validation Harness Requirements

Release gate must demonstrate:
- alignment choice integrity,
- compatibility enforcement,
- severance privacy,
- firewall routing,
- hierarchical bond inheritance + independent revocation,
- treasury and ERC-20 invariants.

## 9. Rollback Criteria

Rollback is mandatory if any of the following are detected:
- unauthorized direct-path external action,
- compatibility checks bypassed,
- severance privacy violation,
- treasury split/accounting drift,
- failed schema backward-compatibility guarantees on mandatory fields.
