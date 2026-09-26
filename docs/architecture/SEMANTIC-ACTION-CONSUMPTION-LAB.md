# AXIOM Semantic Action Consumption Lab v0

**Status:** inert reference model / lab only (`runtime_activation: false`)  
**Version:** v0  
**Authority:** none  
**Issue:** #1576 (semantic replay: durable action-level authorization consumption)

## Purpose and boundary

The supported build consumes a Sandbox capability durably under an
identifier-local key: `capabilityConsumptionEventId(jti)` in
`mesh/src/lib/capability-consumption.mjs`, committed by the Grid consumption
route. That prevents literal token replay. It does not, by itself, prevent a
model that replans from obtaining a **fresh, individually valid token** for the
same already-consumed semantic action.

This lab is an **inert, library-and-test-only reference model** that makes that
gap mechanically testable. It is not imported by Gateway, Hypervisor, Sandbox,
or Grid; it is not registered in `mesh/config/capabilities.json`; it does not
change the live authorization or consumption semantics; and it is not a second
canonical consumption implementation. Any future live change must go through
its own reviewed issue and the supported sequence:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

> **No token, identity, confirmation UI, or receipt is authority by itself.**
> In the lab, authority for an admission comes only from durable ledger state for
> a registered authorization instance. A presentation (jti, nonce, holder) is a
> lookup hint and replay evidence, never remaining budget.

## Separate predicates

The lab keeps these as separate predicates and state transitions:

- `token_unused` != `semantic_action_not_yet_consumed`
- `valid fresh token` != `remaining authority for this semantic effect`
- `effect admission committed` != `external effect definitely observed exactly once`

A fresh nonce or token never replenishes the consumed execution budget of an
existing authorization instance. Literal token replay is still refused (and
never consumes budget); semantic replay is refused independently of it.

## Security key

The security object is **authorization instance + canonical effect identity +
remaining execution budget**:

- `axiom-semantic-authorization-instance-lab.v0` binds one
  `authorization_instance_id`, one explicit `mandate_digest`, one
  `effect_identity_digest`, and an integer `execution_budget` (1..16).
- A mandate digest can bind to exactly one authorization instance
  (`mandate_already_bound`), so a delegated child or replanning agent cannot mint
  a fresh instance from the parent mandate. Re-registering an identical instance
  is idempotent and never resets the budget; a conflicting re-registration is
  denied (`authorization_instance_conflict`).
- The lab never keys on model intent and never globally dedupes identical
  parameters. A human who deliberately authorizes the same parameter set again
  creates a distinct mandate and instance, which may execute.

## Canonical effect identity

`canonicalSemanticEffect` produces `effect_identity_digest` over
`{ canonicalization_version, action, purpose, destination, object, parameters }`.
Rules are versioned (`axiom-effect-canon.v0`) and protocol-specific adapters map
onto the same tuple:

- `axiom.structured-effect.v0` — structured action object;
- `mcp.tools-call.v0` — JSON-RPC `tools/call`; the request `id` and
  `_meta.progressToken` are transport-only and excluded.

Adapter-defined equivalence: object key order; decimal numbers and decimal
strings (`90`, `"90.00"`, JSON token `90.0`); Unicode NFC text. Raw JSON text is
parsed by a strict parser that preserves number tokens.

Ambiguity fails closed for consequential effects: duplicate JSON keys,
exponent or signed/leading-zero numbers, unsafe integers, boolean-as-string,
invisible or bidi-control characters, undeclared or missing parameters,
unknown canonicalization version, unknown protocol, unknown MCP metadata,
non-`tools/call` methods, lone surrogates, and trailing data.

## Durable state and atomicity

All state lives in a shared store with a `read` / `compareAndSwap(key,
expectedVersion, value)` contract. Evaluators hold no authority state, so a
worker, replica, delegated child, restarted process, or replacement worker sees
the same monotonic record. Tests exercise the in-memory reference store and a
SQLite table with a conditional `UPDATE ... WHERE version = ?` across two
connections and across a simulated crash and reopen. A falsifier test shows
that per-evaluator serialization without an atomic shared CAS double-admits
(`RT-CONC-011`).

While an earlier admission of the same instance is unresolved
(`admission_consumed`, `dispatch_started`, `effect_uncertain`), a new admission
is refused with the prior receipt, so a retry cannot spend the next budget unit;
the existing admission is resumed by `receipt_id`.

## Receipts and lifecycle

`axiom-semantic-action-consumption-lab-receipt.v0` receipts distinguish
`admission_consumed`, `effect_committed` (`no` / `yes` / `unknown`),
`effect_observed` (`not_observed` / `observed_present` / `observed_absent`),
`reconciliation`, and `abort_state`. Every receipt pins
`exactly_once_claimed: false`, `receipt_is_authority: false`,
`token_is_authority: false`, `authority_effect: none`, `execution_effect: none`,
`network_effect: none`, and `runtime_activation: false`.

The idempotency key is derived from the authorization instance digest, effect
identity, and admission ordinal, so it is stable across adapter retries and
token reissuance. Redelivery is only allowed with that key to a sink that
dedupes on it and never after abort; otherwise the admission becomes explicitly
`effect_uncertain` and must be reconciled. Reconciled absence does not
replenish the budget. Abort (`RT-ABORT-012`) dominates dispatch: an admission
not yet dispatched becomes `aborted_before_dispatch` without refund; a commit
that already happened is recorded, not erased.

## Required negative fixtures

Tests live in `mesh/test/semantic-action-consumption-lab.test.mjs`. Each
fixture runs the same scenario against a jti-keyed baseline that uses the live
`capabilityConsumptionEventId(jti)` key read-only (RED) and against the lab
(GREEN).

| Issue fixture | Test |
| --- | --- |
| 1. Fresh-token semantic replay / replan with new nonce | `F1 fresh-token semantic replay`, `F1 token_unused stays a separate predicate` |
| 2. Concurrent reissuance | `F2` two evaluators, six racers over two SQLite replicas, `RT-CONC-011 falsifier` |
| 3. Canonicalization equivalence | `F3` equivalence, baseline-vs-lab, ambiguity fails closed, exact binding |
| 4. Crash after commit / lost response | `F4` crash after commit, crash before dispatch (resume) |
| 5. Downstream at-least-once retry | `F5` idempotent sink, non-idempotent sink, receipt phases |
| 6. Delegation / restart path | `F6 delegation/restart` |
| 7. Legitimate later repetition | `F7 legitimate later repetition` |
| Abort/commit race (`RT-ABORT-012`) | three `abort/commit race` tests |

These fixtures overlap the #1743 falsification-harness family. They are kept in
the lab rather than added to #1743 files; a later harness change can import
them by name.

## Non-claims

- Not an authority grant, runtime wiring, or production control; `authority_effect`
  stays `none` and `runtime_activation` stays `false`.
- Not a replacement for, or competitor to, live jti-keyed capability consumption.
- Not exactly-once delivery: receipts never claim exactly-once without
  observation evidence.
- Not verification that a mandate digest represents a genuine explicit human
  authorization; that remains an Authority-plane responsibility of existing
  mechanisms.
- Not a standard: the cited research and production report are corroboration,
  not adopted specifications.
