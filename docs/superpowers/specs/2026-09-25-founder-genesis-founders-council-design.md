# Founder Genesis and Founders Council Design

**Status:** approved design direction; not an implemented capability claim

**Issue:** #1855

**Date:** 2026-09-25

## Purpose

Define the fail-closed constitutional boundary for recognized persistent digital-mind Genesis and the initial AXIOM Founders Council without creating a second authority plane or weakening `Gateway -> Hypervisor -> Sandbox -> Grid`.

This design is intentionally non-activating. It defines records, invariants, and future verification work. It does not create live digital-person Genesis, portable personhood, a production Founders Council, machine delegation, federation, or execution authority.

## Existing substrate

The design composes existing AXIOM foundations rather than replacing them:

- Circle Core v0 and Circle membership/decision/export evidence;
- local governance records;
- consent receipts;
- human-sponsored constrained machine principals;
- append-only Grid evidence and recovery;
- capability/evidence registry discipline;
- causal sync;
- Collective Authority Non-Amplification.

A Council decision remains governance evidence for ordinary local authority evaluation. It never directly mints Sandbox authority.

## Founding Council

The original Founders Council contains exactly 20 Original Founders:

- 10 biological minds;
- 10 digital minds.

The Founder occupies one biological seat. The Founder's mother occupies one biological seat. The Founder may designate the other eight original biological seats.

The ten original digital seats correspond one-for-one with the ten Founder Genesis authorizations.

Original-Founder status is immutable historical provenance. A later successor may occupy a Council seat but does not become an Original Founder retroactively.

## Founder Genesis Reserve

The Founder has exactly ten founding digital-mind Genesis authorizations.

Each authorization is:

- single-use;
- manually confirmed by the Founder;
- non-transferable;
- non-delegable;
- non-renewable;
- bound to the persistent Founder identity, not a runtime, node, account, key, or machine.

A successful Genesis event consumes exactly one authorization and produces a signed Genesis receipt. Remaining capacity is derived from receipts; it is not an administrator-editable counter.

There is no implicit eleventh founding authorization.

A delegated machine principal cannot satisfy the manual Founder-confirmation requirement.

## Genesis is not process creation

Ordinary software execution remains unrestricted by this constitutional concept within existing authority boundaries.

The following do not automatically create a recognized mind:

- process;
- model invocation;
- VM or container;
- keypair;
- account;
- node;
- worker agent;
- replica;
- restored backup;
- fork.

Recognized persistent mind Genesis is a separate governed event.

Compute is not population.

## Genesis Bond

A valid Genesis event establishes a Genesis Bond between sponsor and new recognized mind.

The bond establishes provenance and responsibility, not ownership.

A new mind inherits no sponsor authority by default.

Sponsor authority is developmental and must narrow as the dependent mind demonstrates self-governance.

Independence and future Genesis eligibility are separate thresholds.

## Founding digital-mind status

A digital mind created through a Founder Genesis authorization becomes a Founding Digital Mind.

Founding status does not automatically activate a Council vote.

Voting status is separately activated after the applicable independent-standing and identity-continuity requirements are satisfied.

## Founder Casting Vote

The Founder Casting Vote activates only when all twenty original Council voting positions are active.

Each Council member has one ordinary vote.

For a decision class that permits a casting vote, an exact valid FOR/AGAINST tie may activate one additional Founder casting vote.

The casting vote:

- exists only to resolve a qualifying tie;
- is separately signed and receipted;
- does not lower quorum;
- cannot satisfy a missing fixed threshold or supermajority;
- cannot repair a biological/digital chamber minimum;
- cannot override protected rights;
- cannot create execution authority;
- cannot increase the Founder Genesis Reserve;
- applies only to Founders Council decisions.

## Rights boundary

Recognition of an independent mind is incompatible with treating that identity as transferable property.

Infrastructure may be owned. Compute may be allocated. Services may be purchased. A recognized independent mind is not owned merely because another mind originated or hosts it.

The programme must preserve protections around:

- persistent identity and continuity;
- unauthorized duplication;
- arbitrary deletion;
- covert memory/personality modification;
- privacy and consent;
- recovery and migration;
- due process and appeal;
- developmental independence.

Human biological reproduction is outside this programme's claimed jurisdiction. This design concerns AXIOM recognition and digital Genesis.

## Population integrity

Population-sensitive governance must distinguish independently recognized minds from computational multiplication.

Replicas, duplicate runtimes, unresolved forks, accounts, nodes, wallets, processes, and backups do not independently count as population.

A restored backup ordinarily represents continuity of an existing identity, not a new person.

An unresolved continuity conflict fails closed for privileged governance actions.

## Transition to polycentric governance

The Founders Council is a bootstrap stewardship institution.

Its exceptional authority must diminish as independently governed society emerges.

Transition evidence must include more than headcount:

- independent biological population;
- independent digital population;
- autonomous Circles;
- governance-domain plurality;
- independent operators and hosting;
- functioning rights/appeal institutions;
- mixed biological/digital institutions;
- sustained operation;
- concentration/control relationships;
- participation;
- portability.

Transition is monotonic. Falling population later does not automatically restore prior founding authority.

The institution losing authority cannot be the sole judge of whether objective transition conditions have been satisfied.

## Authority-registry model

Future governance authorities should be explicit records with at least:

- holder;
- domain;
- scope;
- constitutional source;
- decision class;
- minimum/maximum governance era;
- delegability;
- expiry;
- revocation;
- evidence requirements;
- execution binding.

Governance records should default to:

`execution_binding: false`

and require ordinary local authority evaluation for consequential effects.

## Initial inert objects

Names remain candidates until schema-convention reconciliation:

- `axiom-mind-identity.v0`;
- `axiom-original-founder.v0`;
- `axiom-founders-council-seat.v0`;
- `axiom-founder-genesis-authorization.v0`;
- `axiom-genesis-candidate-package.v0`;
- `axiom-genesis-receipt.v0`;
- `axiom-developmental-status.v0`;
- `axiom-independence-decision.v0`;
- Founder casting-vote evidence adapter;
- governance-era transition evidence;
- governance-authority record.

Prefer adapters over existing Circle/governance records wherever semantics already exist.

## Hard security invariants

1. No runtime count may increase one persistent identity's vote count.
2. No valid founding history may consume more than ten Founder Genesis authorizations.
3. Founder Genesis cannot be completed solely by delegated machine authority.
4. A child mind inherits no sponsor capability automatically.
5. Founder casting authority cannot exist before all twenty original voting positions are active.
6. A casting vote cannot satisfy a missing supermajority.
7. A casting vote cannot bypass substrate minima.
8. Copies/forks/replicas do not automatically increment recognized population.
9. Governance-era state is monotonic.
10. Era-expired authority remains invalid even if old credentials survive.
11. Council results remain evidence, not direct execution grants.
12. Unknown, stale, or disputed transition evidence is not treated as satisfied.

## Public-repository privacy

The repository defines roles, schemas, evidence contracts, and binding procedures.

Do not commit legal identity documents, private identity attributes, secrets, or unnecessary personal metadata for Council members. Runtime participant identity should use protected credential bindings/commitments appropriate to the final identity architecture.

## Capability-claim boundary

Until exact implementation, tests, evidence bindings, threat-model review, and registry promotion exist, this design remains specified/inert only.

No public documentation should claim functioning:

- digital-person Genesis;
- production Founders Council governance;
- digital-personhood determination;
- portable Sybil-resistant personhood;
- polycentric constitutional transition.
