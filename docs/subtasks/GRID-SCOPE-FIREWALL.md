# Grid Scope Firewall

**Status:** Proposed (Design Candidate)
**Date:** 2026-03-26

## 1) Execution Invariant

The Grid may verify, attest, and synchronize, but it must never decide intent or execution policy.

Therefore, the following constraints must be strictly enforced across all Grid interfaces:

1. **Grid rejects unsigned manifests**: Any capability manifest without a valid cryptographically signed origin is dropped.
2. **Grid cannot initiate execution**: Endpoints meant for orchestration must strictly validate inputs according to Grid attestation policy without automatically executing payloads that bypass execution boundaries.
3. **Grid only accepts proof-carrying artifacts**: State changes submitted back to the Grid (such as an execution artifact) must carry a valid execution proof (e.g. zkML).