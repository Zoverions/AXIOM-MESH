# Dispute Resolution, Mediation, and Negotiated Remediation

**Status:** experimental coordination architecture; not a court, arbitration system, or legal judgment mechanism.

AXIOM should be able to help parties resolve disagreements without forcing every dispute immediately into either automatic enforcement or total deadlock.

The reusable process is:

```text
claim
 -> response / counter-evidence
 -> known vs contested vs unknown facts
 -> mediation / clarification
 -> remediation proposals
 -> settlement candidate
 -> explicit acceptance
 -> separate authority for any consequential remedy
```

## Preserve uncertainty

Dispute systems become dangerous when they collapse uncertain evidence into one confident story.

The record therefore keeps:

- known facts;
- contested facts;
- unknown facts;
- each side's evidence;
- independent verification;
- procedural history.

An agent may summarize or assess evidence quality, but unresolved uncertainty remains visible.

## Mediators

A mediator can help search the solution space.

Useful mediator functions include:

- identify incompatible assumptions;
- surface common ground;
- propose reversible compromises;
- suggest phased remedies;
- request missing evidence;
- identify Pareto-improving outcomes;
- recommend escalation.

The mediator does not become an adjudicator merely because both parties agree to hear proposals.

If an institution wants binding arbitration, that authority must come from a separate explicit charter/agreement and should use a different bounded profile.

## Remedies

A proposed remedy may be purely informational or may create a consequential effect.

Examples:

- correction or clarification;
- redelivery;
- apology or acknowledgement;
- new verification;
- refund proposal;
- escrow release proposal;
- access suspension proposal.

The first group may not require an external effect. The latter group does.

The dispute record therefore requires a separate effect-authority reference for consequential remedies.

## Settlement

Settlement is an agreement candidate, not enforcement.

Material settlement terms reuse the amendment-materiality rules. A materially changed obligation, remedy, privacy exposure, deadline, or authority context needs renewed explicit acceptance by affected parties.

## Urgent safety

Negotiation must not block necessary containment.

If an active system is causing immediate risk, previously authorized suspension or rollback mechanisms may operate through the separate fail-safe path.

That containment is not proof that the disputed party was wrong.

## Digital entities

The same framework can support disputes involving agents or potentially morally relevant digital entities.

Containment, disagreement, or unfamiliar goals should not be confused with punishment. Where safe, the system can seek negotiated remediation, restricted coexistence, or phased capability restoration.

Moral consideration does not grant execution authority; security concern does not erase procedural fairness.

## Governing rule

**Preserve evidence. Preserve uncertainty. Seek reversible agreement. Escalate deliberately. Enforce only through separately valid authority.**
