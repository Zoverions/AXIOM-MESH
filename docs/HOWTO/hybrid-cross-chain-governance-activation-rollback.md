# Hybrid Cross-Chain Governance Activation & Rollback Runbook

This runbook defines the governance-controlled activation and rollback procedure for **hybrid cross-chain mode** (transport rail + sovereign/zk verification paths).

Hybrid mode changes settlement acceptance semantics and is therefore treated as a **high-risk change class** requiring explicit evidence and rehearsal.

## 1) Scope and Preconditions

Applies when promoting any environment from bridge-only mode to hybrid mode described in `docs/CROSS-CHAIN-EVOLUTION.md`.

Required before activation:
- `make verify-cross-chain-evidence-schema` passes against the proposed bundle set.
- A signed activation proposal exists with chain IDs, verifier thresholds, and rollback trigger conditions.
- Emergency pause and pending-claim cancellation operators are assigned and reachable.
- Incident/audit sinks are healthy and append-only.

## 2) Roles and Separation of Duties

- **Change Sponsor:** proposes activation intent and target threshold profile.
- **Governance Signers:** approve activation according to policy quorum.
- **Release Operator:** executes rollout steps exactly as approved.
- **Independent Auditor:** validates evidence integrity and rollback readiness.
- **Incident Commander:** owns emergency rollback if triggers fire.

No single person may be both Release Operator and Independent Auditor for the same activation window.

## 3) Activation Evidence Bundle (Required)

Create an activation folder:

`artifacts/cross-chain/hybrid-activation/<YYYY-MM-DD>/`

Minimum required artifacts:
- `proposal.json` (governance proposal ID, quorum proof, effective window)
- `thresholds.json` (policy thresholds, verifier requirements, allowlisted chains)
- `evidence-validation.txt` (output of `make verify-cross-chain-evidence-schema`)
- `shadow-comparison.json` (bridge-only vs sovereign verifier decision diff with zero unexplained accepts)
- `rollback-plan.json` (explicit triggers + execution checklist + owner rotations)
- `signatures.json` (detached signatures for all files above)

Fail closed if any artifact is missing, unsigned, or stale.

## 4) Activation Procedure (Phased)

1. **T-24h Preparation**
   - Freeze cross-chain policy changes except this activation proposal.
   - Confirm pending claims queue is below governance-defined risk threshold.
   - Run schema validation and capture output in evidence bundle.

2. **T-2h Shadow Confirmation**
   - Run hybrid verifiers in shadow mode only.
   - Compare accept/reject decisions against bridge baseline.
   - Escalate to governance board if unexplained decision divergence > 0.

3. **T0 Governance Close + Controlled Enablement**
   - Record final on-chain/off-chain approvals.
   - Enable hybrid mode with conservative thresholds (strictest profile).
   - Keep emergency pause command prepared and validated.

4. **T+1h Observation Window**
   - Track acceptance/rejection rates, replay detection events, and latency.
   - Reject any evidence payload failing provenance or replay checks.
   - Keep queue-drain velocity under configured limit to reduce blast radius.

5. **T+24h Confirmation**
   - If all service-level and safety thresholds are met, finalize activation status in governance logs.
   - If not, initiate rollback immediately.

## 5) Rollback Triggers (Automatic or Manual)

Rollback must be started immediately if any condition is met:
- Replay identifier collision not explained by duplicate submission handling.
- Provenance signature verification failure above policy tolerance (default: any critical failure).
- Unexplained increase in accepted claims versus baseline risk model.
- Verifier outage/partition exceeding rollback threshold window.
- Governance revocation vote reaches closure threshold.

## 6) Rollback Execution Procedure

1. Enter emergency change window and declare incident severity.
2. Pause hybrid acceptance path.
3. Revert policy flags to bridge-only transport verification mode.
4. Cancel or quarantine claims accepted during the suspect interval.
5. Re-run integrity checks on pending claims queue.
6. Publish rollback evidence bundle with timeline, commands, and signatures.
7. Require governance re-authorization before any future re-activation.

## 7) Quarterly Drill Requirement

Conduct at least one drill each quarter in staging (or production shadow if staging parity is unavailable).

### Drill objectives
- Prove rollback can be executed within the defined RTO.
- Prove no unsafe claim redemption occurs during rollback transition.
- Prove evidence logs are complete, signed, and reproducible.

### Drill evidence checklist
Store under:

`artifacts/drills/hybrid-cross-chain/<YYYY>-Q<1..4>/`

Required files:
- `scenario.md` (inject details + expected outcomes)
- `timeline.md` (UTC timestamps of each operator action)
- `commands.txt` (exact commands run)
- `outcomes.json` (SLOs, rejects, queue integrity checks)
- `lessons-learned.md` (gaps + owner + due date)
- `attestation.json` (governance/auditor sign-off)

If the quarterly drill is missed, hybrid mode eligibility for production promotions is suspended until the drill evidence is completed.

## 8) Post-Event Governance Reporting

Within 72 hours of any activation or rollback:
- Publish a summary to governance logs.
- Link all signed artifacts.
- Record whether controls behaved fail-closed.
- Open remediation actions for any observed drift.

## 9) Reference Commands

```bash
make verify-cross-chain-evidence-schema
python scripts/ci/verify_cross_chain_evidence_schema.py
```

> Keep command output in the event evidence bundle.
