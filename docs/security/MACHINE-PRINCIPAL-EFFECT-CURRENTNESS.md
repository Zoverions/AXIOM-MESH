# Machine-principal effect-admission currentness v1

Status: experimental semantic core only. This document and the accompanying pure evaluator do not create an authority source or claim that mutable machine-principal revocation is implemented.

## Purpose

A capability that was valid when issued must not remain sufficient permission for a consequential effect after the underlying machine-principal authority has been revoked, compromised, expired, or narrowed.

The effect path therefore needs currentness evidence checked as late as safely possible before the first consequential effect. That evidence is **not authority**. It only answers whether the authority already bound into the pending admission remains current enough under policy.

## Admission binding

The semantic core binds currentness evidence to:

- principal id;
- capability-bound authority digest;
- capability id;
- intent digest;
- plan digest;
- effect destination.

This prevents a currentness observation for one pending effect from being transplanted to another.

## Required denial conditions

The evaluator fails closed when:

- principal id differs;
- authority digest changed;
- the evidence is for another pending admission;
- lifecycle state is narrowed, revoked, compromised, or expired;
- the observation exceeds the configured freshness bound or is future-dated;
- the presented sequence is older than the retained sequence;
- the same retained sequence presents a different head digest.

## Explicit non-claims

Currentness evidence:

- grants no execution authority;
- cannot widen scopes, purposes, destinations, budgets, or approval floors;
- does not prove global currentness;
- is not a replacement for capability signature, policy, replay, durable consumption, plan, destination, or subject checks;
- does not yet prove a production currentness source exists.

## Integration gate

Do not wire this evaluator into Sandbox as a trusted decision input until AXIOM-MESH has a reviewed currentness source that can produce cryptographically verified lifecycle state and retained-head semantics. The existing delegation-root currentness checkpoint/store is the preferred semantic precedent.

The first integration regression must reproduce the external RT-AUTH-001 race safely:

1. issue and durably consume a capability;
2. pause before the first consequential effect;
3. mutate current authority through a repository-supported currentness source;
4. release the barrier;
5. require stale authority to fail closed.

If no supported mutable source exists, classify the race as architecture-limited / not reproduced rather than synthesizing a production vulnerability.
