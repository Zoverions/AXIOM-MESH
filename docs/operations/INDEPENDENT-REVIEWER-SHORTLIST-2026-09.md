# Independent Security Reviewer Shortlist — 2026-09

| Field | Value |
| --- | --- |
| **Status** | Outreach shortlist only; **no** engagement / ledger / SEC-002 claim |
| **Build** | `0.12.0-dev.3` |
| **Intake** | [`docs/security/INDEPENDENT-SECURITY-REVIEW.md`](../security/INDEPENDENT-SECURITY-REVIEW.md) |
| **Threat model** | [`docs/security/CURRENT-BUILD-THREAT-MODEL.md`](../security/CURRENT-BUILD-THREAT-MODEL.md) |
| **Decision log** | 2026-09-05 |

This document selects independent security reviewers for outreach. It does **not** authorize an engagement, create a findings ledger, or assert SEC-002 completion.

---

## What engagement must cover

Any independent review engagement for AXIOM-MESH must explicitly cover **all eight** areas below. Partial coverage is insufficient for intake acceptance.

1. **authentication-authorization** — identity, session, and permission boundaries
2. **container-policy** — isolation, capability, and runtime policy enforcement
3. **credential-trust** — secret handling, trust anchors, and delegation limits
4. **evidence-integrity** — receipt/evidence chain integrity and tamper resistance
5. **kernel** — authority/evidence kernel invariants and enforcement surfaces
6. **provider-boundary** — external provider trust limits and boundary crossings
7. **recovery-rotation** — key/credential recovery and rotation safety
8. **release-governance** — release signing, provenance, and governance controls

### Findings ledger requirement

Engagements must produce (or accept intake into) an **Ed25519 findings ledger** compatible with project intake. Reviewers who cannot support signed findings / ledger-compatible outputs are out of scope for primary selection.

### Explicit non-fit

**Do not hire pure smart-contract contest shops** as the primary reviewer. Contest-style Solidity/EVM bug-bounty platforms are deprioritized for this kernel-focused engagement.

---

## Fit criteria

A candidate is a fit when they demonstrate:

- Experience reviewing **authorization kernels**, trusted computing bases, or high-assurance crypto/systems security (not only application pentests).
- Willingness to cover **all eight** engagement areas above.
- Ability to work against a written threat model and produce **actionable, severity-ranked findings** with clear remediation guidance.
- Comfort with **Ed25519**-signed or ledger-compatible findings packaging.
- Capacity for a scoped consulting engagement (not only open contests).
- Clear conflict-of-interest and disclosure practices.
- Preference for teams with prior **open-source / protocol / infrastructure** review track records over compliance checklist audits alone.

---

## Tier A (primary outreach)

| # | Firm | Role | Contact | URL |
| --- | ---: | --- | --- | --- |
| 1 | **Least Authority** | **PRIMARY** | `consulting@leastauthority.com` | https://leastauthority.com/ |
| 2 | **Trail of Bits** | Primary parallel | Contact form | https://trailofbits.com/contact/ |
| 3 | **Cure53** | Primary parallel | `hello@cure53.de` | https://cure53.de/ |
| 4 | **Symbolic Software** | Primary parallel | Chat intake | https://symbolic.software/chat/ |

**Least Authority** is the designated primary contact for first-wave RFP parallelization; Trail of Bits, Cure53, and Symbolic Software remain full Tier A peers for simultaneous outreach.

---

## Tier B (backups)

| Firm | Notes |
| --- | --- |
| **NCC Group** | Backup if Tier A capacity/timeline fails |
| **Include Security** | Backup |
| **Radically Open Security** | Backup |

Use Tier B only after Tier A declines, cannot meet timeline, or fails fit on the eight-area / ledger requirements.

---

## OSTIF facilitation

Optional facilitation path for open-source-aligned audit packaging and vendor matching:

- https://ostif.org/get-an-audit/

OSTIF is **not** a substitute for Tier A RFPs; it is an optional parallel channel to improve packaging and reviewer matching.

---

## Deprioritized

| Category | Reason |
| --- | --- |
| **Smart-contract contest platforms as primary** | Wrong threat surface; contest shops are not a substitute for kernel / authz / evidence review |
| **Compliance-only vendors** | Checklist/compliance mapping without deep adversarial review of the eight areas |

---

## Phases 0 / 1 / 2 packaging

### Phase 0 — Packaging (pre-RFP)

- Freeze intake pointer: `docs/security/INDEPENDENT-SECURITY-REVIEW.md`
- Attach current threat model: `docs/security/CURRENT-BUILD-THREAT-MODEL.md`
- Confirm build tag: `0.12.0-dev.3`
- Define eight-area scope checklist and Ed25519 findings ledger expectation
- Prepare outreach email packet (below)
- **No engagement signed; no SEC-002 claim**

### Phase 1 — Parallel RFP / outreach

- Send RFPs in parallel to Tier A: Least Authority (PRIMARY), Trail of Bits, Cure53
- Optionally include Symbolic Software in the same wave
- Optionally open OSTIF facilitation in parallel
- Collect statements of work, timelines, and ledger-compatibility confirmations
- Still **outreach only** until a signed engagement exists

### Phase 2 — Selection & kickoff readiness

- Rank responses on eight-area coverage, ledger fit, timeline, and independence
- Escalate to Tier B only if needed
- Prepare kickoff package (scope freeze, access, disclosure rules)
- Engagement start and any SEC-002 / ledger claims happen **only after** contract + kickoff — outside this shortlist document’s authority

---

## Outreach email packet

### Subject

```
RFP: Independent security review — AXIOM-MESH authority/evidence kernel (build 0.12.0-dev.3)
```

### Body

```
Hello,

We are requesting proposals for an independent security review of AXIOM-MESH
(build 0.12.0-dev.3), focused on the authority/evidence kernel and related
trust boundaries.

This message is outreach / RFP only. It does not constitute an engagement,
findings ledger, or any SEC-002 completion claim.

Intake:
  docs/security/INDEPENDENT-SECURITY-REVIEW.md

Threat model:
  docs/security/CURRENT-BUILD-THREAT-MODEL.md

Required coverage (all eight areas):
  1. authentication-authorization
  2. container-policy
  3. credential-trust
  4. evidence-integrity
  5. kernel
  6. provider-boundary
  7. recovery-rotation
  8. release-governance

Findings packaging:
  Ed25519 findings ledger compatible with project intake.

Kernel invariants under review (non-negotiable framing):
  • intelligence ≠ authority
  • discovery ≠ permission
  • receipts ≠ external truth

Please do not treat this as a smart-contract contest engagement. We need a
consulting-style review of the authority/evidence kernel and the eight areas
above—not a pure Solidity/EVM contest shop as primary reviewer.

Please respond with:
  • fit confirmation against the eight areas and ledger requirement
  • proposed scope, timeline, and team composition
  • independence / conflict disclosures
  • rough commercial terms or next-step scheduling

Primary contact wave includes Least Authority, Trail of Bits, and Cure53
(parallel RFPs). OSTIF facilitation may be used optionally:
  https://ostif.org/get-an-audit/

Thank you,
AXIOM-MESH security outreach
```

---

## Recommended next

1. **Parallel RFPs** to **Least Authority** (PRIMARY), **Trail of Bits**, and **Cure53**.
2. Optionally include **Symbolic Software** in the same wave.
3. Optionally open **OSTIF** facilitation: https://ostif.org/get-an-audit/
4. Hold **NCC Group**, **Include Security**, and **Radically Open Security** as Tier B backups.
5. Keep status as **outreach shortlist only** until a signed engagement exists.

---

## Decision log — 2026-09-05

| Decision | Detail |
| --- | --- |
| Document created | Independent Security Reviewer Shortlist — 2026-09 |
| Status bound | Outreach shortlist only; no engagement / ledger / SEC-002 claim |
| Build pinned | `0.12.0-dev.3` |
| Primary | Least Authority (`consulting@leastauthority.com`) |
| Parallel Tier A | Trail of Bits, Cure53, Symbolic Software |
| Tier B | NCC Group; Include Security; Radically Open Security |
| Facilitation | OSTIF optional |
| Explicit exclude | Pure smart-contract contest shops as primary; compliance-only vendors |
| Scope | Eight named areas + Ed25519 findings ledger |
| Invariants | intelligence ≠ authority; discovery ≠ permission; receipts ≠ external truth |
