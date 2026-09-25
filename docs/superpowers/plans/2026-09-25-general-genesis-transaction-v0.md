# General Genesis Transaction Candidate v0 Plan

**Status:** bounded inert implementation plan

**Design:** `docs/superpowers/specs/2026-09-25-general-genesis-transaction-v0-design.md`

## GT0 — canonical design

Register design and plan.

## GT1 — candidate package contract

Add:

- `axiom-general-genesis-transaction-candidate.v0`;
- deterministic identity/digest helper;
- strict validator;
- JSON Schema.

## GT2 — composition assessment

Compose:

- General Genesis Sponsor Eligibility;
- General Genesis Authorization Candidate;
- exact holder-confirmation evidence binding;
- prospective new-mind package;
- new-mind identity uniqueness/currentness evidence.

The assessment must confirm the authorization candidate is unexpired at transaction
evaluation time.

## GT3 — hard invariants

Prove:

- one sponsor only;
- one child only;
- child differs from sponsor;
- authorization/eligibility/holder bindings are exact;
- child identity must be externally evidenced available;
- child starts at Genesis developmental stage;
- no inherited authority;
- no initial Council vote;
- no initial Genesis eligibility;
- no Founder-reserve/founding-status effect;
- exact replay may be idempotent in future;
- conflicting authorization/child/transaction reuse must be denied in future commit;
- candidate itself creates no mutation.

## GT4 — later atomic commit seam

Only after the inert transaction is proven, design a separately reviewed live
commit protocol that atomically:

- consumes the live authorization;
- records sponsor ordinary Genesis use 0 -> 1;
- records Genesis Bond;
- creates recognized child identity;
- creates child Genesis developmental status.

No live mutation belongs in this PR.
