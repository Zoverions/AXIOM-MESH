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
> a registered, active authorization instance. A presentation (jti, nonce,
> holder) is a lookup hint and replay evidence, never remaining budget. A
> `receipt_id` is derivable (`sacl_` + digest of instance and ordinal), so
> knowing it is not authority either: `beginDispatch`, `retryDispatch`,
> `recordSinkOutcome` and `recordObservation` must also present the
> `admitting_jti` recorded at admission, and any other jti is denied
> (`admitting_token_mismatch`). The lab compares jti digests only; a live
> design would additionally need proof of possession for that token.

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
- Registration is all-or-nothing for the mandate: the instance id is first
  claimed as `pending` (never admittable), then the mandate is bound, then the
  instance is activated. An instance conflict stops before any mandate is
  bound, so a denied registration never burns its mandate. A mandate conflict
  leaves the claimed instance `pending` permanently (admission denies
  `authorization_instance_pending`). Retrying the same registration completes
  a crash between steps.
- Remaining budget only goes down. The API has no refund, reset, delete,
  restore or replenish operation; `sink_rejected`, reconciled absence, and
  abort never refund; `execution_budget` is immutable; and `getBudget` derives
  the remaining budget only from stored state, so rebuilding an evaluator from
  the same store gives the same value.
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

Adapter-defined equivalence: object key order; integers and decimal strings
(`90`, `"90"`, `"90.00"`, integer JSON token `90`); Unicode NFC text. Raw JSON
text is parsed by a strict parser that preserves number tokens.

Numbers in consequential parameters must be integers (JS safe integers or
integer JSON tokens); any fractional value must use the decimal-string form.
Non-integer JS numbers and fractional JSON tokens (including `90.0`) fail
closed. A JS number has no lexical form, so the literal `9e1` is simply the
integer 90; the lexical exponent forms `"9e1"` (string) and `9e1` (JSON token)
fail closed. MCP `_meta.progressToken` and the JSON-RPC `id` must be a bounded
string or an integer.

Ambiguity fails closed for consequential effects: duplicate JSON keys,
exponent or signed/leading-zero numbers, unsafe integers, boolean-as-string,
undeclared or missing parameters, unknown canonicalization version, unknown
protocol, unknown MCP metadata, non-`tools/call` methods, lone surrogates,
trailing data, and invisible or bidi-control text characters: C0/C1 controls,
soft hyphen, U+034F, U+061C, Hangul fillers (U+115F, U+1160, U+3164, U+FFA0),
Khmer and Mongolian invisibles, zero-width and bidi controls, line/paragraph
separators, U+2060–U+206F, variation selectors (U+FE00–U+FE0F,
U+E0100–U+E01EF), BOM, and tag characters (U+E0000–U+E007F).

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
the existing admission is resumed by `receipt_id` plus the admitting jti.

## Receipts and lifecycle

`axiom-semantic-action-consumption-lab-receipt.v0` receipts distinguish
`admission_consumed`, `effect_committed` (`no` / `yes` / `unknown`),
`effect_observed` (`not_observed` / `observed_present` / `observed_absent`),
`reconciliation`, and `abort_state`, and report the pinned `sink_idempotency`,
`redelivery_blocked`, and `remaining_budget`. Every receipt pins
`exactly_once_claimed: false`, `receipt_is_authority: false`,
`token_is_authority: false`, `authority_effect: none`, `execution_effect: none`,
`network_effect: none`, and `runtime_activation: false`.

The idempotency key is derived from the authorization instance digest, effect
identity, and admission ordinal, so it is stable across adapter retries and
token reissuance. The admission (`admission_consumed`) and the dispatch
reservation (`dispatch_started`) are both recorded durably before the sink is
called, and a reserved admission with no committed outcome counts as consumed.

Sink idempotency is declared by the effect profile (`sink_idempotency:
idempotency-key | none`) and pinned into the durable admission; the per-call
`sink_idempotent` flag on `retryDispatch` is only a declaration that must match
the pinned value (`sink_idempotency_mismatch` otherwise). Redelivery is allowed
only for a pinned `idempotency-key` sink, with the stable key, never after
abort, and never once `redelivery_blocked` is set. Any other retry, and any
mismatch, makes the admission explicitly `effect_uncertain` with
`redelivery_blocked: true`; a re-submit, crash-replay or retry then fails
closed and never calls the sink again until reconciliation, which is terminal. Reconciled absence does not
replenish the budget. Abort (`RT-ABORT-012`) dominates dispatch: an admission
not yet dispatched becomes `aborted_before_dispatch` without refund; a commit
that already happened is recorded, not erased.

## Required negative fixtures

Tests live in `mesh/test/semantic-action-consumption-lab.test.mjs`. Where a
jti-only comparison is meaningful, the test also runs the scenario against a
baseline that uses the live `capabilityConsumptionEventId(jti)` key read-only;
those test names carry `[jti-baseline RED]` (baseline performs the duplicate,
lab does not). Tests marked `(lab only)` assert lab behavior without a baseline
run, because the jti-only model has no state for that property (abort,
reconciliation, pinned sink idempotency, registration).

| Issue fixture | Baseline comparison | Tests |
| --- | --- | --- |
| 1. Fresh-token semantic replay / replan with new nonce | RED | `F1 [jti-baseline RED]`; `F1 [jti-baseline comparison, both refuse]` for literal replay |
| 2. Concurrent reissuance | RED (two evaluators) | `F2 [jti-baseline RED]`, `F2 (lab only)` SQLite replicas, `F2 (lab mutation) RT-CONC-011 falsifier` |
| 3. Canonicalization equivalence | RED (equivalent shapes) | `F3 [jti-baseline RED]`, `F3 (lab only)` equivalence, ambiguity, exact binding, `N5`, `N6` |
| 4. Crash after commit / lost response | RED (after commit) | `F4 [jti-baseline RED]`, `F4 (lab only)` crash before dispatch, `Addendum 3a` |
| 5. Downstream at-least-once retry | RED (idempotent sink) | `F5 [jti-baseline RED]`, `F5 (lab only)` non-idempotent and receipt phases, `B1` pinned idempotency |
| 6. Delegation / restart path | RED | `F6 [jti-baseline RED]`, `N1` admitting-token binding, `N2` registration |
| 7. Legitimate later repetition | none expected | `F7` (global-dedupe strawman shown to over-collapse) |
| Abort/commit race (`RT-ABORT-012`) | none | three `abort/commit race (lab only)` tests |
| Budget only goes down | none | `B2b` sink_rejected, `Addendum 3b` reload, `Addendum 3c` monotonic consumed |

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
