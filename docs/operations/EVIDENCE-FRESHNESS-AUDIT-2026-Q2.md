# Quarterly Evidence Freshness Audit — 2026 Q2 (M12.2)

**Audit date:** 2026-04-07  
**Cadence:** Quarterly (Jan/Apr/Jul/Oct)  
**Coverage:** Security, performance, and reliability artifacts used by release and operational gates.

## Scope and Acceptance

- Evidence is **fresh** when it has been re-verified within the current quarter.
- Evidence is **stale** when it exceeds one quarter without re-verification.
- Any stale evidence item must include a remediation owner and target date.

## Evidence Register

| Domain | Artifact | Verification command | Last verified (UTC) | Status | Owner |
|---|---|---|---|---|---|
| Security | `docs/security/SECURITY-HARDENING.md` controls + contract scan notes | `python scripts/check_evidence_freshness.py` | 2026-04-07 | Fresh | security |
| Performance | `docs/operations/RESOURCE-BALANCER-POLICY.md` and runtime profile artifacts | `python scripts/check_evidence_freshness.py` | 2026-04-07 | Fresh | ops |
| Reliability | `docs/operations/RESILIENCE-DRILLS-AND-PENTEST-RUNBOOK-2026-03-29.md` drill evidence | `python scripts/check_evidence_freshness.py` | 2026-04-07 | Fresh | ops |

## Next Audit Window

- **Next due date:** 2026-07-07
- **Escalation:** If audit is not refreshed within 14 days after due date, block release promotion until refreshed.
