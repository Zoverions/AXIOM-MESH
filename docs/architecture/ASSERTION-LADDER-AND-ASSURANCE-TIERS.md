# Assertion Ladder and Composed Assurance State

**Status:** foundational implementation on an architecture branch; not yet a registered AXIOM capability  
**Schema:** `axiom-assertion-ladder.v1`  
**Package:** `packages/axiom-assertion-ladder/`  
**Compatibility authority:** `docs/rebuild/ADAPTIVE-ASSURANCE-AND-PLURAL-AUTHORITY.md`

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

## Compatibility correction

An external portfolio audit proposed a seven-step A0–A6 ladder that combined local evidence, attestation, public anchoring, collective agreement and value settlement.

AXIOM already has an approved architecture decision from 2026-08-03 that defines **A0–A4 assurance profiles** and explicitly requires authority, assurance, finality and retention to remain conceptually separate. This implementation preserves that prior decision rather than silently changing the meaning of A0–A4.

The useful parts of the seven-step proposal are retained by composition:

```text
composed state =
  assurance profile
  + public-ordering state
  + value-settlement state
```

This gives the desired off-ramps without collapsing different truths into one scalar.

## Why this exists

The same state-promotion invariant had emerged independently in multiple places:

1. software claims: built → enabled → exposed → promoted → marketed;
2. distributed facts: local/proposed/observed/committed/finalized plus conflict/reversion handling;
3. external claims: budget → allocation → contract → order → delivered → accepted → operational;
4. financial effects: not submitted → submitted → confirmed → finalized;
5. adaptive assurance: A0 → A1 → A2 → A3 → A4.

Those domains differ, but the invariant is the same: **state promotion requires new evidence, and presentation cannot outrun achieved state.**

The first implementation supports totally ordered monotonic ladders plus explicit terminal failure states. More complex DAG or conflict-resolution semantics remain domain-specific until there is evidence that a shared extension is needed.

## Core invariants

1. **No upward rendering.** A state at rank `n` cannot render as any state above `n`.
2. **Explicit negation.** Every event carries the stronger states it has `not_yet` achieved.
3. **Upgrade by event, never mutation.** Moving to stronger evidence creates a new event linked to the prior state.
4. **No downgrade mutation.** Corrections, rollback, revocation or conflict are new events or explicit failure states, never rewriting the prior assertion.
5. **Evidence travels with the promotion.** Higher state is not inferred merely because a field, hash, identifier or status string has the right shape.
6. **A local status flag is not independent verification.** External claims require evidence from the relevant external authority or adapter.

## Approved AXIOM assurance profiles

`axiom.assurance` preserves the approved planning profiles exactly:

| Tier | Name | Meaning | Typical use |
|---|---|---|---|
| A0 | Ephemeral | best-effort, reversible, no durable claim beyond optional local telemetry | brainstorming, previews, disposable simulation |
| A1 | Attributable | authenticated principal, scoped authority, lightweight receipt | personal organization, reversible local changes |
| A2 | Auditable | inputs, policy decision, grant, execution identity, output digest and evidence continuity retained | persistent automation, selective sharing, Circle tasks |
| A3 | Independently verified | separate approval, verifier, reproducible execution, witness or equivalent corroboration | financial, legal, identity, administrative, sensitive governance |
| A4 | Collectively finalized | threshold or chamber decision, explicit quorum, challenge/dispute rules and finality record | constitutional changes, shared treasury, binding collective commitments |

These are assurance profiles, not implementation marketing states.

## Public ordering is a separate assertion

`axiom.public-ordering` tracks whether a record has an ordering commitment controlled outside the producing AXIOM domain:

```text
unanchored -> anchored
```

A public blockchain may be one implementation of `anchored`, but the semantic requirement is externally controlled ordering/anti-backdating, not blockchain branding.

A3 assurance can therefore coexist with either `unanchored` or `anchored` public-ordering state.

## Value settlement is a separate assertion

`axiom.value-settlement` tracks an external transfer independently of both assurance and public ordering:

```text
not_submitted -> submitted -> confirmed -> finalized
```

Terminal failure states include `rejected`, `reverted` and `unknown`.

A random or shape-correct transaction identifier is metadata only. It does not advance settlement state. Promotion requires evidence from the settlement system or a verified adapter representing it.

This directly prevents the portfolio failure mode where a synthetic transaction hash was written as `completed` or `funded`.

## Policy owns the assurance requirement

The caller does not choose the assurance tier.

Policy resolves the required assurance from applicable floors such as kernel safety, owner policy, Circle/institution policy, jurisdiction/domain policy, adapter requirements and action risk. A caller may repeat the selected tier for transparency, but a mismatch is rejected rather than treated as a downgrade request.

This preserves the existing doctrine:

```text
required_assurance = max(
  kernel_safety_floor,
  owner_policy,
  Circle_or_institution_policy,
  jurisdiction_or_domain_policy,
  adapter_requirement,
  action_risk_requirement
)
```

## Off-ramp model

Scalability should come from selecting only the assurance and external-state machinery an effect actually requires.

Examples:

- disposable UI preview: A0 + unanchored + not_submitted;
- attributable local note: A1 + unanchored + not_submitted;
- durable automated workflow: A2 + unanchored + not_submitted;
- independently verified credential: A3 + unanchored + not_submitted;
- independently verified transcript with anti-backdating anchor: A3 + anchored + not_submitted;
- binding chamber decision: A4 + either public-ordering state + not_submitted;
- externally settled payment: assurance selected by policy + independently advanced settlement state.

Most traffic therefore never needs collective finality, public anchoring or external settlement.

## Blockchain discriminator

AXIOM should use a chain only for a property that its existing evidence system does not already supply.

Two candidates remain structurally distinct:

1. **External ordering / anti-backdating:** an `anchored` public-ordering assertion. A daily Grid checkpoint is a plausible adapter target.
2. **External value transfer:** advancement of `axiom.value-settlement` based on independently verified settlement evidence.

Local integrity, provenance, credentials and ordinary governance do not become blockchain requirements merely because a chain is available.

## Adoption sequence

This branch intentionally does **not** add a new implemented capability to `mesh/config/capabilities.json`.

Promotion sequence:

1. land and test the generic primitive;
2. bind assurance semantics to selected intent/evidence records;
3. migrate one existing state machine to the shared primitive without losing domain semantics;
4. add claim/evidence tests at presentation boundaries;
5. only then consider a capability-registry entry with exact evidence paths.

The package is therefore foundational code, not a new production claim.
