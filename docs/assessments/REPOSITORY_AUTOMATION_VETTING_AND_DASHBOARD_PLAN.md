# Repository Automation, Vetting, and Web Dashboard Plan

**Status:** Draft for implementation
**Date:** 2026-03-29

## 1) Objective

Create a repository governance model that combines:

1. Automated updates and security controls (GitHub + local system pipelines)
2. Community-driven contribution throughput
3. A hard vetting gate before merge/release
4. A web dashboard that makes risk, quality, and review state visible in real time

This plan is intentionally hybrid: automation for speed and consistency, humans for judgment.

---

## 2) Documentation Organization Decisions

To reduce confusion and drift:

- External security and compliance audit artifacts remain in `docs/audits/`.
- Non-audit strategic assessments (integration plans, architecture assessments, rollout plans) are stored in `docs/assessments/`.
- This repository automation plan is classified as an assessment and belongs in `docs/assessments/`.

---

## 3) GitHub + System Automation Architecture

## 3.1 Pull Request Automation

Required on every PR:

- Lint, unit tests, and integration tests
- SBOM generation and dependency vulnerability scan
- Secret scanning and IaC/container policy checks
- Required docs check (reject if behavior changed but docs were not updated)
- Provenance/signature check for release-sensitive files

## 3.2 Security Automation

- Dependabot (or equivalent) for dependency updates
- Scheduled weekly security sweep workflow
- Auto-open security remediation issues when scanner risk exceeds threshold
- Auto-label by severity (`sec-critical`, `sec-high`, `sec-medium`, `sec-low`)

## 3.3 Release Automation

Before release tag creation:

- Ensure all required checks are green
- Verify audit/remediation artifacts are current
- Verify changelog + release notes generated from merged PR metadata
- Generate immutable release evidence package in `evidence/release/<release-id>/`

---

## 4) Web Dashboard (Governance + Delivery)

A web dashboard should aggregate repository and system telemetry into one control surface.

## 4.1 Dashboard Panels

- **Merge Gate Health:** pass/fail by check type and branch
- **Security Posture:** open vulnerabilities, mean time to remediate, aging CVEs
- **Review Load:** PR queue, stalled reviews, reviewer distribution
- **Vetting State:** automated score + human review stage
- **Release Readiness:** status of required release evidence and unresolved blockers

## 4.2 Suggested Data Inputs

- GitHub Checks API / GraphQL API
- CI workflow artifacts and logs
- SBOM + vuln scan outputs
- Code ownership metadata
- Branch protection and rulesets status

---

## 5) Traxxas-Inspired Operational Model

If the team is referring to "Traxxas" as a practical operations model (fast iteration + strong quality controls), apply the pattern as:

- Rapid iteration lanes for low-risk changes
- High-control lane for security-sensitive and core protocol changes
- Standardized checklist templates for both lanes
- Visible dashboard status for every lane to avoid hidden work

If "Traxxas" instead refers to a specific tool, map that tool into the dashboard as an upstream data source and treat it as optional until reliability is proven.

---

## 6) Hybrid Vetting Process (Automation + Community)

## 6.1 Stage A: Automated Pre-Vetting

Every incoming PR receives a machine score derived from:

- Test coverage delta
- Static analysis findings delta
- Dependency and license risk delta
- Security scanner findings delta
- Blast-radius estimate (critical path files touched)

Outcome:

- **Auto-approve for review queue** only when score is below risk threshold and no hard blockers.
- **Auto-escalate** when hard blockers or high-risk indicators are present.

## 6.2 Stage B: Community Review

Community or contributor reviewers evaluate:

- Functional correctness
- Architectural fit
- Documentation quality
- Backward compatibility risk

Outcome:

- Review comments, requested changes, or provisional approval.

## 6.3 Stage C: Maintainer/Steward Gate

Maintainers decide final merge based on:

- Automated risk report
- Community review record
- Security policy constraints
- Release timeline implications

No direct-to-main bypass for protected branches.

---

## 7) Repository Policy Requirements

- CODEOWNERS enforcement for critical directories
- Branch protections with required status checks
- Signed commits or signed tags for release branches
- Mandatory issue linkage for changes above a defined risk threshold
- Security exception workflow with explicit expiry and owner

---

## 8) Implementation Milestones

## M1: Folder and policy baseline

- Finalize docs placement conventions
- Add/confirm CODEOWNERS, branch protections, and PR templates

## M2: CI security hardening

- Add or tighten scanning workflows
- Introduce severity-based fail thresholds

## M3: Vetting workflow rollout

- Implement automated risk scoring
- Add reviewer guidance and maintainer gate checklist

## M4: Dashboard release

- Ship web dashboard MVP (merge health, security, vetting, release readiness)
- Add audit log and export for governance records

## M5: Continuous tuning

- Measure false positives/negatives in automated scoring
- Tune thresholds and reviewer assignment logic

---

## 9) Success Metrics

- Reduced time-to-merge for low-risk changes
- Reduced open high/critical vulnerability dwell time
- Increased percentage of PRs with complete documentation updates
- Reduced release blockers discovered late in cycle
- Clear auditability of who approved what and why

---

## 10) Immediate Next Actions

1. Approve the folder convention (`docs/audits/` vs `docs/assessments/`).
2. Convert this plan into tracked tasks in `docs/MASTER-TODO.md`.
3. Implement CI checks for security and documentation drift.
4. Define dashboard MVP schema and data contracts.
5. Pilot hybrid vetting on one subsystem before repository-wide rollout.
