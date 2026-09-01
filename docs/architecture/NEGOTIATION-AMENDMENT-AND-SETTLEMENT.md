# Negotiation, Amendment, and Mutually Acceptable Settlement

**Status:** experimental coordination architecture; not legal advice and not a production settlement system.

AXIOM should support negotiation as a reusable coordination mechanism between humans, institutions, and agents.

The objective is not to automate coercion. It is to make proposals, counterproposals, clarifications, amendments, and settlements precise enough to inspect, compare, verify, and safely hand into existing governance or contract processes.

## State flow

```text
offer
 -> clarification / counteroffer / partial acceptance / rejection
 -> explicit accepted terms
 -> contract or amendment candidate
 -> required local/institutional review
 -> accepted record
 -> obligations
 -> separate effect authority
```

Negotiation messages themselves remain evidence.

## Partial acceptance

A frequent source of ambiguity is an apparent "yes" to a document containing many terms.

AXIOM should allow explicit term-level acceptance.

A partial acceptance binds only the named term IDs in the negotiation record. It does not silently accept unmentioned terms.

## Counteroffers

Counteroffers do not automatically erase or replace prior offers.

The message graph records:

- base contract digest;
- prior-message digest;
- terms added/replaced/removed/retained;
- explicit supersession where intended.

That keeps negotiation history auditable.

## Amendments

Amendments are deltas over exact contract digests.

Material changes include changes to obligations, parties, price/value, deadlines, data scope, privacy, risk, remedies, jurisdiction, termination, delegation, authority context, verification requirements, or retention.

When such a dimension changes, every affected party must be named for renewed acceptance under the appropriate local process.

## Agents and delegated negotiation

Agents may negotiate where delegated.

A negotiation message should carry or reference the delegation evidence where the sender acts for another principal.

The receiving party must not infer unlimited agency from the fact that an agent participated successfully in prior negotiations.

## Mediation

A mediator may:

- identify incompatible terms;
- produce neutral summaries;
- suggest compromise;
- search for Pareto-improving alternatives;
- propose phased or reversible arrangements;
- identify missing evidence;
- recommend escalation to human/institutional review.

Mediator output remains advisory unless a separate charter or agreement gives the mediator a specifically bounded adjudicative role.

## Non-coercive settlement

The protocol should favor mutually acceptable outcomes where possible.

Safeguards include:

- explicit withdrawal;
- expiry of offers;
- no punishment merely for requesting clarification;
- no silent acceptance;
- clear surfacing of materially changed terms;
- independent review for high-consequence agreements;
- separation of urgency/reputation from actual consent and authority.

## Relationship to governance

Institutional governance may use negotiation records as deliberation evidence.

For example:

```text
charter amendment proposal
 -> negotiation/deliberation
 -> revised candidate
 -> vote/approval/timelock
 -> local governance activation
```

The negotiation layer never bypasses the institution's actual amendment mechanism.

## Relationship to settlement

A negotiated settlement may create a settlement candidate.

It still does not execute:

```text
settlement accepted
 -> obligation/settlement record
 -> proposed remedy/effect
 -> current policy + authority + verification
 -> bounded effect
 -> receipt
```

## Governing rule

**Negotiate freely. Accept explicitly. Amend visibly. Execute only with separate authority.**
