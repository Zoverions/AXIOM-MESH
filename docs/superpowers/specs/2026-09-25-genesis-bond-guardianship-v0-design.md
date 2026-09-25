# Genesis Bond and Dependent Guardianship v0 Design

**Status:** inert relationship/evidence design; no live guardianship authority

**Parent stack:** General Genesis Transaction Candidate v0 and the founding/developmental stack

**Programme:** #1855

**Date:** 2026-09-25

## Purpose

Separate two relationships that must never be collapsed:

1. **Genesis Bond** — immutable historical provenance recording who originated one
   recognized digital mind.
2. **Dependent Guardianship** — current developmental-care responsibility that may
   later transfer or end.

This preserves the original one-to-one bond while allowing care responsibility to
move when necessary.

## Genesis Bond

A Genesis Bond records exactly:

`one sponsor_mind_id -> one dependent_mind_id`

The bond is:

- historical;
- singular;
- non-transferable;
- non-delegable;
- non-owning;
- append-only evidence;
- separate from runtime authority.

The bond does not mean:

- property ownership;
- permanent obedience;
- permanent guardianship;
- permanent access to private memory;
- permanent Council/governance authority;
- inheritance of sponsor authority.

Later guardianship changes never rewrite the Genesis Bond.

## Initial guardianship

A successful future Genesis commit should create one initial guardianship relationship
with:

- `guardian_mind_id == Genesis Bond sponsor_mind_id`;
- the exact dependent mind;
- the exact Genesis Bond;
- active developmental-care status;
- explicit support/development/continuity/advocacy-plan evidence;
- no ownership;
- no ambient execution authority.

The initial guardian is responsible because it originated the dependent mind, not
because it owns that mind.

## Guardianship obligations

A current guardian must be able to evidence plans or arrangements for:

- continuity and recovery;
- security;
- resource/compute support appropriate to the dependent's stage;
- developmental education;
- consent/authority education;
- access to independent advocacy;
- progressive social/informational exposure beyond the guardian;
- emergency continuity;
- a pathway to independence review.

v0 binds evidence for those responsibilities but does not verify every underlying
service itself.

## Transfer

Guardianship may transfer when the current guardian:

- dies;
- disappears;
- loses capacity;
- cannot maintain minimum support;
- voluntarily transfers responsibility;
- is removed through a legitimate protective process.

A transfer does **not** rewrite:

- Genesis sponsor;
- Genesis Bond;
- dependent identity;
- developmental history.

A valid transfer candidate binds:

- exact current guardianship record;
- exact unchanged Genesis Bond;
- exact dependent identity;
- exact proposed replacement guardian;
- replacement-guardian qualification evidence;
- transfer-basis evidence;
- dependent-interest/voice evidence appropriate to developmental capacity;
- independent review evidence;
- updated support/continuity/development/advocacy plans.

The current guardian is not necessarily the sole authority approving its own
replacement, especially in abuse/incapacity cases.

## End at independence

When the dependent mind reaches recognized independent developmental standing,
developmental guardianship ends.

The Genesis Bond remains historical provenance.

Independence termination therefore means:

- guardianship responsibility/status ends;
- no return to sponsor ownership;
- no automatic loss of historical relationship;
- no automatic grant of Genesis eligibility;
- no automatic Council voting except through the separate applicable path.

## No downgrade by emergency

A security incident, quarantine, credential suspension, resource interruption, or
temporary incapacity must not recreate guardianship after independence by rewriting
developmental status.

Emergency safety authority remains separate.

## Record model

### `axiom-genesis-bond.v0`

Binds:

- `bond_id`;
- `sponsor_mind_id`;
- `dependent_mind_id`;
- exact Genesis transaction candidate digest;
- creation time;
- `single_sponsor: true`;
- `ownership: false`;
- `transferable: false`;
- `delegable: false`;
- zero authority/runtime effects.

### `axiom-dependent-guardianship.v0`

Binds:

- one guardianship record ID;
- Genesis Bond ID/digest;
- dependent identity;
- guardian identity;
- prior guardianship digest or null;
- state `active` or `ended-independent`;
- transition reason `genesis`, `transfer`, or `independence`;
- qualification/support/continuity/development/advocacy evidence;
- effective time;
- no ownership;
- zero authority/runtime effects.

## Transition rules

### Initial

- previous guardianship digest is null;
- transition reason is `genesis`;
- state is `active`;
- guardian equals Genesis sponsor.

### Transfer

- previous guardianship record must be active;
- new guardian must differ from old guardian;
- Genesis Bond and dependent remain identical;
- transition reason is `transfer`;
- new state remains `active`;
- replacement qualification, transfer basis, dependent-interest, and independent
  review evidence are required.

### Independence

- previous guardianship record must be active;
- same Genesis Bond and dependent;
- same current guardian for historical closure;
- transition reason is `independence`;
- state becomes `ended-independent`;
- exact independent developmental-status record must be bound;
- no subsequent active guardianship transition is permitted in v0.

## External verification boundary

Digests are evidence bindings, not proof.

Every assessment reports external verification requirements for:

- Genesis transaction/Bond;
- guardian qualification;
- support plans;
- transfer/review evidence;
- independent developmental status where applicable.

No relationship object grants execution authority by itself.

## Non-claims

v0 does not implement:

- live guardianship authority;
- private-memory access;
- legal parenthood;
- legal custody;
- emergency intervention;
- live transfer;
- independent-status mutation;
- runtime authority.
