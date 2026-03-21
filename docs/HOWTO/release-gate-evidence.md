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
    summary.json
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

## 3) `summary.json` contract

Required top-level keys:
- `release_candidate` (string)
- `decision` (`go` or `no-go`)
- `gates` (object with `security`, `financial`, `reliability`, `ecosystem`, `governance`)

Allowed gate values: `pass`, `fail`, `exception`.

If any gate value is `exception`, the `exceptions/` directory must include supporting files.

Use `docs/templates/release-summary.example.json` as the starting template.

## 4) `summary.md` minimum sections

The summary markdown must include sections/keywords for:
- security
- financial
- reliability
- ecosystem
- governance
- decision

## 5) Assembly workflow

1. Create RC folder and pre-populate all gate subfolders.
2. Collect automated test and validation artifacts.
3. Add narrative interpretation only where required; do not omit raw output.
4. Populate `summary.md` with pass/fail per gate.
5. Populate `summary.json` using the required contract above.
6. Record exceptions explicitly and link mitigation tasks.
7. Hold gate review and capture decision in summary files.

## 6) Go/No-Go rules

- **Go** only if all gates pass OR approved exceptions are present with expiry.
- **No-Go** if any gate lacks evidence, has stale evidence, or has unowned exceptions.

## 7) Validation commands

Standard validation:

```bash
make validate-release-evidence RC_PATH=release-evidence/RC-<date>-<tag>
```

Strict validation (recommended for release candidates):

```bash
make validate-release-evidence RC_PATH=release-evidence/RC-<date>-<tag> STRICT=1 ENFORCE_SUMMARY=1
```

`STRICT=1` enforces at least one artifact file in each non-exception gate folder.  
`ENFORCE_SUMMARY=1` enforces required summary.md section keywords.

## 8) Documentation synchronization

Before final gate approval, confirm:
- Relevant technical docs were updated for behavior changes.
- Operational runbooks/HOWTO docs reflect real production steps.
- Release notes include migration and rollback instructions.

