# AXIOM-MESH Core Loop Contract

**Status:** Proposed (Design Candidate)
**Date:** 2026-03-26

## 1) Execution Invariant

AXIOM-MESH enforces a strict core execution loop for all actions:

```text
Intent -> Plan -> Capability Manifest -> Sandbox Execution -> Attestation (Grid) -> Response Shaping
```

If any step is missing or skipped, the execution is considered invalid and will be halted or rejected by the system.
