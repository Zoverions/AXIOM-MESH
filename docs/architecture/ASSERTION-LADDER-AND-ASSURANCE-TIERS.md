# Assertion Ladder and Assurance Tiers

**Status:** foundational implementation on an architecture branch; not yet a registered AXIOM capability  
**Schema:** `axiom-assertion-ladder.v1`  
**Package:** `packages/axiom-assertion-ladder/`

## Decision

AXIOM will use one shared state primitive for claims whose central safety property is that a weaker state must never be presented as a stronger one.

The primitive is the **Assertion Ladder**.

An assertion event records:

- the ladder and version used;
- the subject being asserted about;
- the state actually achieved;
- the previous state, if this is an upgrade;
- evidence supporting the state;
- an explicit `not_yet` set containing every stronger state not achieved;
- time and bounded metadata.

A presentation layer may render an assertion at its achieved state or a weaker compatible state. It may never render it at a stronger state.

This is the code-level form of the constitutional rule that integrity is not proof of truth and of the portfolio-wide requirement to market only what evidence supports.

## Why this exists

The same state machine had emerged independently in multiple places:

1. software claims: built → enabled → exposed → promoted → marketed;
2. distributed facts: local/proposed/observed/committed/finalized and conflict/reversion handling;
3. external claims: budget → allocation → contract → order → delivered → accepted → operational;
4. financial effects: planned → approved → submitted → confirmed/settled;
5. verification strength: local → approved → attested → anchored → agreed → settled.

Those domains differ, but the invariant is the same: **state promotion requires new evidence, and presentation cannot outrun achieved state.**

The first implementation supports totally ordered monotonic ladders plus explicit terminal failure states. More complex DAG or conflict-resolution semantics remain domain-specific until there is evidence that a shared extension is needed.

## Core invariants

1. **No upward rendering.** A state at rank `n` cannot render as any state above `n`.
2. **Explicit negation.** Every event carries the stronger states it has `not_yet` achieved.
3. **Upgrade by event, never mutation.** Moving from A1 to A4 creates a new event linked to the prior state.
4. **No downgrade mutation.** Corrections, rollback, revocation or conflict are new events or explicit failure states, never rewriting the prior assertion.
5. **Evidence travels with the promotion.** Higher state is not inferred merely because a field, hash, identifier or status string has the right shape.
6. **A local status flag is not independent verification.** External claims require evidence from the relevant external authority/adaptor.

## AXIOM assurance ladder

The first concrete ladder is `axiom.assurance`.

| Tier | Name | Mechanism | Typical use | Reversibility |
|---|---|---|---|---|
| A0 | local optimistic | ephemeral local state; no durable evidence requirement | UI state, drafts, hints | silent local replacement |
| A1 | local durable | durable local evidence under one authoritative writer | learner events, notes, progress | compensating record |
| A2 | locally approved | A1 plus required independent local approval | configuration, pack activation, bounded agent budgets | receipt-bound compensation |
| A3 | attested | A2 plus Grid-attested externally verifiable receipt | credentials, portfolio export, cross-Grid receipts | compensating only |
| A4 | anchored | A3 plus externally ordered public checkpoint anchor | transcripts, audit checkpoints, anti-backdating | append-only correction |
| A5 | agreed | A4 plus bounded multi-Grid threshold/quorum agreement | Circle governance, shared registries | new governance event only |
| A6 | settled | independently evidenced external value settlement | value transfer only | external protocol rules |

These are assurance states, not implementation marketing states. Reaching A4 does not mean a feature is production-promoted; it means the relevant record/effect achieved A4 assurance.

## Policy owns the assurance tier

The caller does not choose the assurance tier.

Policy resolves the required tier from action, subject, destination, risk, purpose, jurisdiction and other bounded context. A caller may report the same tier for transparency, but a mismatched caller tier is rejected rather than used as a downgrade request.

This prevents a high-risk caller from choosing A0 merely because it is faster.

## Off-ramp model

The assurance ladder is explicitly designed to prevent unnecessary global coordination.

Most local interactions should remain at A0–A2. A3 is for independently portable attestation. A4 adds external ordering without requiring a federation-wide consensus protocol. A5 is reserved for bounded multi-party agreement domains. A6 is exclusively for effects whose truth depends on external value settlement.

This makes scalability a policy/risk partitioning problem rather than a requirement to put all traffic through one global consensus path.

## Blockchain boundary

The ladder also supplies a discriminator for blockchain use.

- A local hash chain can satisfy local integrity requirements.
- A3 can provide Grid attestation.
- A4 may use a public chain as one possible checkpoint anchor because the desired property is externally controlled ordering/anti-backdating.
- A6 may use a settlement chain when intermediary-free value transfer is actually required.

A well-formed transaction hash without independent chain evidence does not advance an assertion to A4 or A6.

## Adoption sequence

This branch intentionally does **not** add a new implemented capability to `mesh/config/capabilities.json`.

Promotion sequence:

1. land and test the generic primitive;
2. bind assurance semantics to selected intent/evidence records;
3. migrate one existing state machine to the shared primitive without losing domain semantics;
4. add claim/evidence tests at presentation boundaries;
5. only then consider a capability-registry entry with exact evidence paths.

The package is therefore foundational code, not a new production claim.
