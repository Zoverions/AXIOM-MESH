# Machine-principal effect-admission currentness v1

Status: experimental semantic core plus local durable retained-head store. This layer does not create effect authority and does not claim that production mutable machine-principal revocation or globally rollback-resistant currentness is implemented.

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

## Local retained-head store

The experimental durable store retains controller-signed machine-principal currentness checkpoints as canonical append-only JSONL. It:

- requires an exact principal id/type trust binding;
- begins at signed sequence 1 and advances exactly one checkpoint at a time;
- rejects rollback, same-sequence equivocation, sequence gaps, truncated histories, torn writes, non-canonical records, and signed-record tampering;
- rejects symlink/non-regular state paths;
- synchronizes appended records before acknowledging retention;
- detects disk history changes made outside the active store before appending;
- exposes the exact retained checkpoint and source-head digests needed by later admission logic.

This is **local durable retention**, not global rollback proof. A local storage snapshot can still be reverted by an actor with sufficient storage control unless a stronger independent anchor, monotonic hardware source, quorum/witness policy, or equivalent reviewed mechanism is added.

## Explicit non-claims

Currentness evidence:

- grants no execution authority;
- cannot widen scopes, purposes, destinations, budgets, or approval floors;
- does not prove global currentness;
- is not a replacement for capability signature, policy, replay, durable consumption, plan, destination, or subject checks;
- does not yet prove a production currentness source exists.

## Integration gate

Do not wire this evaluator into Sandbox as a trusted decision input merely because the local durable store exists. The store now provides reviewed local retained-head semantics, but the accepted runtime still needs an authoritative currentness producer, trusted controller-key lifecycle/provisioning, and a defined method for Sandbox to obtain the required latest retained head without accepting caller-supplied rollback. Stronger rollback resistance beyond the local store remains a separate deployment/security gate.

The first integration regression must reproduce the external RT-AUTH-001 race safely:

1. issue and durably consume a capability;
2. pause before the first consequential effect;
3. mutate current authority through a repository-supported currentness source;
4. release the barrier;
5. require stale authority to fail closed.

If no supported mutable source exists, classify the race as architecture-limited / not reproduced rather than synthesizing a production vulnerability.
