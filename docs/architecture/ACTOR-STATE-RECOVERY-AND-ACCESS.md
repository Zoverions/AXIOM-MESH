# Actor State Recovery and Access

**Status:** foundation architecture and executable validation only; not a promoted runtime capability

**Related:** #997, #998, #999, #1001, PR #1000

## Purpose

AXIOM actor state separates four questions that conventional account systems often collapse:

1. **Who is the continuing actor?**
2. **Who presently controls valid credentials?**
3. **Who may recover control after compromise or loss?**
4. **Who may use which part of actor state, for which purpose, and for how long?**

The same answer is not assumed for all four.

## Core invariants

> **Credentials prove present control. Recovery proves continuity. Neither alone defines the actor.**

> **Recovery authority restores control; it does not inherit or create ordinary authority.**

> **An authority or membership relationship may justify an exact state projection. It does not create ambient access to the actor's state.**

> **A state-access receipt proves a bounded authorized use. It does not transfer ownership of the source state.**

These extend the existing rule:

> **Relationship is not authority. Authority is not consent. Consent is not permanent.**

## Recovery model

Recovery is threshold evidence over a policy chosen or imposed through an independently valid authority path.

A policy may name factors such as:

- hardware recovery keys;
- trusted devices;
- trusted humans;
- guardian recovery for a dependent child;
- institutional attestations;
- government/high-assurance identity attestations;
- offline secrets;
- independent recovery services;
- carefully governed biometric attestations.

Each factor is separately scoped and effective-dated. A recovery policy may require both a numeric threshold and independent factor classes, for example possession + trusted human.

No recovery factor receives ordinary actor authority merely by being able to help satisfy recovery.

## Recovery transition

A successful recovery is a continuity transition, not a transfer of personhood or account ownership.

```text
existing actor
  -> restricted / recovery pending
  -> threshold evidence evaluated
  -> recovery approved
  -> old credential epoch retired/revoked
  -> new credential epoch activated
  -> actor id preserved
  -> actor-owned state preserved
  -> state keys may be re-wrapped/rekeyed by a later persistence layer
  -> actor marked recovered
```

The current foundation does not yet persist this transition to Grid and does not itself invalidate live sessions/capability tokens. Those are later runtime gates.

## State-access envelope

Every consequential use of actor state should be reducible to an explicit envelope that binds:

```text
subject actor
requester actor
state class
purpose
action
data scopes
recipients
disclosure profile
authority basis + digest
consent requirement + receipt digest when required
required assurance
observed assurance
effective time
expiry
raw-state permission
```

An attempted use must match the envelope. Substituting an employer for the learner, an advertising purpose for an education purpose, another recipient, a wider scope, or a public disclosure for a private one fails closed.

## Authority basis is evidence, not ambient power

The initial foundation recognizes five authority-basis types:

- self authority;
- delegated authority;
- association obligation;
- jurisdiction requirement;
- succession directive.

These labels are not self-authorizing. The envelope binds a source ID and digest that a later runtime integration must resolve through the appropriate current authority system immediately before use.

## Association obligations and collective metrics

Membership in a group, institution, or jurisdiction may create legitimate reporting or contribution obligations under applicable law, charter, contract, or policy.

AXIOM must represent those obligations without turning them into general surveillance permissions.

For example:

```text
association: cooperative-A
rule: safety-metric-v3
purpose: member-safety-statistics
state class: governance
action: contribute_metric
scope: incident-count-bucket
disclosure: aggregate
recipient: cooperative-A
raw state: forbidden
```

This permits the exact bounded contribution. It does not permit the cooperative to read private notes, education history, health records, private messages, or unrelated state.

The current executable foundation therefore rejects an `association_obligation` used as arbitrary private-state read authority.

## Compliance and dissent remain separate

The access envelope answers whether a bounded disclosure/use is authorized or required. It does not say the actor agrees with the rule.

A later governance slice from #1001 must preserve three separate facts:

```text
rule applies
actor complied or did not comply
actor agrees or protests
```

An actor should be able to comply under protest without falsifying either compliance or disagreement. A protest should not silently suspend a binding rule, and an institution should not be able to erase the protest merely because the rule remains in force.

## Succession

A succession directive may authorize access to selected source-state classes after an actor ends. It does not fabricate a new consent receipt from the ended actor.

The source actor's pre-authorized succession directive is the relevant authority basis. Legal inheritance, regulated authority, office, property, and other jurisdictional effects remain separate.

## Encryption boundary

Current Grid durable-state protection uses authenticated AES-256-GCM under the existing data-protection-key machinery. This is useful infrastructure but is not yet the actor-state key hierarchy.

Future actor-state persistence should add:

- compartment-specific data-encryption keys;
- separately rotatable wrapping/key-establishment profiles;
- actor credential epochs distinct from encryption-key epochs;
- encrypted replica support;
- re-wrap/rekey evidence;
- post-quantum migration profiles from #998.

A change of cryptographic suite must not change actor identity.

## Current claim boundary

This foundation does **not** claim:

- deployed actor-state persistence;
- a public actor-state API;
- legal validity of any represented reporting obligation;
- automatic jurisdiction determination;
- enabled biometric recovery;
- account recovery through a live external identity provider;
- quantum-safe storage or transport;
- anonymous-publication guarantees;
- digital-person legal succession.

Those require separately promoted, evidence-backed integration slices.
