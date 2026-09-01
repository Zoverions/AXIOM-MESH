# Machine-principal effect-admission currentness v1

Status: experimental semantic core only. This document and the accompanying pure evaluator do not create an authority source or claim that mutable machine-principal revocation is implemented.

## Purpose

A capability that was valid when issued must not remain sufficient permission for a consequential effect after the underlying machine-principal authority has been revoked, compromised, expired, or narrowed.

The effect path therefore needs currentness evidence checked as late as safely possible before the first consequential effect. That evidence is **not authority**. It only answers whether the authority already bound into the pending admission remains current enough under policy.

## Two deliberately separate bindings

Machine-principal currentness has two layers that must not be collapsed.

**Lifecycle currentness state** is operation-independent. It binds:

- principal id and type;
- current authority digest;
- lifecycle state;
- monotonic sequence;
- observation time;
- current source-head digest;
- predecessor source-head digest.

A controller-signed lifecycle checkpoint therefore changes when authority lifecycle state changes, not merely because another effect is attempted. This keeps retained-head storage meaningful and prevents execution volume from becoming the authority-currentness sequence.

**Effect-admission evaluation** is operation-specific. The evaluator combines a verified lifecycle state with an independently computed admission digest binding:

- principal id and type;
- capability-bound authority digest;
- capability id;
- intent digest;
- plan digest;
- effect destination.

The successful evaluation emits a separate `effect_currentness_evaluation_digest` over the exact admission digest plus the consulted lifecycle evidence/head. That evaluation can later be included in an execution attestation or portable work receipt.

A lifecycle checkpoint must never contain `admission_digest`.

## Required denial conditions

The evaluator fails closed when:

- principal id differs;
- principal type differs;
- current authority digest differs from the capability-bound authority digest;
- lifecycle state is narrowed, revoked, compromised, or expired;
- the observation exceeds the configured freshness bound or is future-dated;
- the presented sequence is older than the retained sequence;
- the same retained sequence presents a different head digest.

Lifecycle normalization also rejects:

- a genesis sequence that names a predecessor;
- a non-genesis sequence without a predecessor;
- unsupported fields;
- authority/global-currentness claims.

Checkpoint transition validation additionally requires sequence +1, exact predecessor-head chaining, and strictly advancing observation time.

## Explicit non-claims

Currentness state, checkpoints, and effect-currentness evaluations:

- grant no execution authority;
- cannot widen scopes, purposes, destinations, budgets, or approval floors;
- do not prove global currentness;
- are not replacements for capability signature, policy, replay, durable consumption, plan, destination, or subject checks;
- do not yet prove a production mutable currentness source exists.

## Integration gate

Do not wire this evaluator into Sandbox as a trusted decision input until AXIOM-MESH has a reviewed currentness source that can produce cryptographically verified lifecycle state and retained-head semantics. The existing delegation-root currentness checkpoint/store is the preferred semantic precedent.

The first integration regression must reproduce the external RT-AUTH-001 race safely:

1. issue and durably consume a capability;
2. pause before the first consequential effect;
3. mutate current authority through a repository-supported currentness source;
4. resolve the latest lifecycle checkpoint;
5. evaluate that checkpoint against the exact pending admission;
6. release the barrier only if currentness still matches;
7. require stale authority to fail closed.

If no supported mutable source exists, classify the race as architecture-limited / not reproduced rather than synthesizing a production vulnerability.
