# TODO Issue Import List

**Generated:** 2026-03-23  
**Source of truth:** `docs/MASTER-TODO.md` (Section 5)

This file converts open scaffolded audit TODOs into tracker-ready issues with owner, priority, ETA, and acceptance CI check.

| Issue Title | Priority | Owner | ETA | CI Acceptance Check | Source TODO |
|---|---|---|---|---|---|
| FIN-A.2 Enforce Operational Tokenomics Controls | P0 | finance+ops | 2026-03-30 | `verify-tokenomics-controls` | FIN-A.2 |
| FIN-A.3 Automate Financial Reconciliation Drills | P1 | finance+ops | 2026-04-06 | `test-reconciliation` | FIN-A.3 |
| BLK-A.1 Harden Grid Mutation Boundaries | P0 | core+contracts | 2026-03-30 | `test-grid-authz` | BLK-A.1 |
| BLK-A.2 Enforce Tokenomics Change-Control | P0 | core+contracts | 2026-04-02 | `verify-change-control` | BLK-A.2 |
| SEC-A.2 Enforce Service-to-Service mTLS & Anti-Replay | P0 | security | 2026-04-03 | `test-mtls` | SEC-A.2 |
| SEC-A.3 Harden Sandbox Identity Boundaries | P0 | security | 2026-04-03 | `test-sandbox-identity` | SEC-A.3 |
| FUN-A.1 Replace SBOM Placeholder Logic | P1 | core | 2026-04-07 | `verify-sbom` | FUN-A.1 |
| FUN-A.2 Remove Sandbox Execution Mocks | P0 | core | 2026-03-31 | `test-sandbox-broker` | FUN-A.2 |
| FEA-A.1 Automate Gate Evidence Packaging | P1 | release | 2026-04-07 | `verify-rc-dossier` | FEA-A.1 |
| STA-A.2 Finalize Failure-Path Matrices | P1 | ops | 2026-04-10 | `test-telemetry-alerts` | STA-A.2 |

## Import notes

1. Create one tracker issue per row.
2. Copy the matching TODO text from `docs/MASTER-TODO.md` into issue description.
3. Add labels: `audit-remediation`, `priority:<P#>`, and team label.
4. Require linked PR + CI check pass before closing issue.
