# HOWTO: Build a Release Gate Evidence Package

This guide defines the mandatory process for assembling AXIOM-MESH production gate evidence.

## 1) Package structure

Create one folder per release candidate:

```text
release-evidence/
  RC-<date>-<tag>/
    security/
    financial/
    reliability/
    ecosystem/
    governance/
    exceptions/
    summary.md
```

## 2) Required evidence by gate

### Security gate
- Security regression report (auth/replay/injection).
- Open findings list with severity and disposition.
- Confirmation that privileged action audit logs are complete.

### Financial gate
- Reconciliation report for selected ledger/chain window.
- Treasury journal export with hash/chaining reference.
- Distribution proof verification output.

### Reliability gate
- SLO report including P95 latency and error budget status.
- Recovery drill outputs with measured RTO/RPO.
- Replay/reorg test evidence for chain event handling.

### Ecosystem gate
- API/schema/ABI compatibility check logs.
- Partner smoke test report.
- Interface change log and migration notes (if applicable).

### Governance/Audit gate
- Signed approval record from accountable owners.
- Any exception documents with owner + expiry + mitigation.

### M12.13 External Audit Gate
- Evidence of external smart contract security audit matching the exact commit hashes deployed.
- Resolution matrix of all findings marked as "Fixed" or "Acknowledged" with an architectural justification.
- Official PDF/attestation from external auditing firm checked into the `evidence/` directory.

## 3) Assembly workflow

1. Create RC folder and pre-populate all gate subfolders.
2. Collect automated test and validation artifacts.
3. Add narrative interpretation only where required; do not omit raw output.
4. Populate `summary.md` with pass/fail per gate.
5. Record exceptions explicitly and link mitigation tasks.
6. Hold gate review and capture decision in summary file.

## 4) Go/No-Go rules

- **Go** only if all gates pass OR approved exceptions are present with expiry.
- **No-Go** if any gate lacks evidence, has stale evidence, or has unowned exceptions.

## 5) Documentation synchronization

Before final gate approval, confirm:
- Relevant technical docs were updated for behavior changes.
- Operational runbooks/HOWTO docs reflect real production steps.
- Release notes include migration and rollback instructions.



## 6) Validation command

After assembling a package, run:

```bash
make validate-release-evidence RC_PATH=release-evidence/RC-<date>-<tag>
```

The command fails if required folders/files are missing or if gate statuses/decision are invalid.
