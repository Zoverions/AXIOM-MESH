# Obligation Contracts, Settlement, and Runtime Authority

**Status:** experimental architecture; not legal advice and not a legal-enforceability claim.

AXIOM already has several kinds of "contract": API contracts, runtime-adapter contracts, domain contracts, intent contracts, and human-interface contracts. Those describe interfaces, expectations, or mission constraints.

A different layer is needed for **organizational and inter-agent obligations**.

The key architectural rule is:

> **An agreement can create an obligation model without creating runtime authority.**

## Separation of layers

```text
agreement expression
  -> legal / institutional context
  -> obligation state
  -> evidence of fulfillment / breach claim
  -> dispute / cure / settlement
  -> proposed execution or remedy
  -> separate local authority evaluation
  -> consequential effect
```

A signature can establish which bytes were signed under a key. It does not by itself establish comprehension, capacity, voluntariness, applicable law, enforceability, truth of every recital, or authority to seize funds or alter protected state.

## Reusable obligations

The common substrate should represent:

- obligor and beneficiary;
- promised action/result;
- conditions;
- deadline/window;
- evidence requirements;
- verification mode;
- fulfillment;
- claimed breach;
- cure/remediation;
- waiver;
- amendment;
- termination;
- dispute;
- settlement;
- conditional or escrow-like release.

These mechanisms can then be reused for businesses, institutions, research collaborations, public bodies, human-agent arrangements, and agent-agent agreements.

## Fulfillment

A machine-readable fulfillment state should be evidence-grounded.

If a contract requires delivery of an artifact, fulfillment could be supported by:

- exact artifact digest;
- receipt;
- independent verifier result;
- timestamp;
- acceptance record.

The system should not mark something fulfilled merely because an agent claims it is.

## Breach and remedies

"Breach" is especially dangerous to automate.

A failed condition may mean:

- genuine non-performance;
- ambiguous evidence;
- external impossibility;
- invalid premise;
- force-majeure-like circumstance;
- dispute over interpretation;
- verifier failure.

Therefore an observed failure first becomes a **breach claim or unresolved state**.

A remedy such as refund, escrow release, suspension, penalty, account change, or asset transfer requires its own authority and policy basis.

## Escrow and conditional settlement

AXIOM can support escrow-like structures without turning contract state into spending authority.

```text
condition evidence
  -> verification
  -> obligation/settlement state
  -> release request
  -> current local authority / policy
  -> release effect
  -> receipt
```

This composes naturally with proof-bearing assertions and portable verification bundles.

## Agents as parties

Agents may appear as parties or operational representatives where the local institutional framework recognizes that role.

The contract should still bind:

- accountable principal/sponsor where required;
- delegated scope;
- expiry;
- authority ceiling;
- dispute path.

An agent's acceptance statement does not automatically prove legal capacity or bind a human/institution beyond separately established authority.

## Negotiation

Studio is the natural environment for drafting and negotiating these structures.

Agents can:

- compare versions;
- identify conflicts;
- propose compromise;
- translate clauses into machine-readable obligations;
- surface missing evidence or asymmetric risk;
- simulate possible outcomes.

They should not silently sign, accept, waive, amend, or execute beyond their explicit authority.

## Governing rule

**Model obligations precisely. Verify performance independently. Resolve disputes explicitly. Authorize effects separately.**
