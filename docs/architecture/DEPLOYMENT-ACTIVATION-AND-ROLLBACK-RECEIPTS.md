# Deployment Activation, Suspension, and Rollback Receipts

**Status:** experimental deployment architecture; no production controller claim.

Local admission says that exact artifacts are eligible for one instance.

It still does not prove that those artifacts were activated.

AXIOM should record deployment lifecycle changes as explicit state transitions:

```text
admitted_inert
  -> staging
  -> active
  -> suspended
  -> rolled_back
  -> staging
  -> active

active/suspended/rolled_back
  -> retired
```

Each transition emits a receipt bound to:

- the target instance;
- the local admission record;
- exact artifact digests;
- current policy digest;
- transition authority evidence;
- pre/post health evidence;
- rollback target and plan;
- offline/currentness context;
- timestamp and limitations.

## Effect-increasing vs effect-reducing transitions

Activation and resume increase the system's ability to create effects. They require fresh authority at transition time.

Suspension, rollback, and retirement reduce or terminate effects. They may use a preauthorized fail-safe path where local policy explicitly permits it.

This matters during network partitions or incidents: a node should be able to **fail safer without first asking permission from an unavailable service**.

But the inverse is prohibited. An offline node cannot use a fail-safe grant to reactivate itself.

## Offline behavior

If an activation depends on external currentness or revocation state, that condition must already be satisfied under the local offline policy.

Loss of connectivity never converts a missing currentness check into approval.

Risk-reducing transitions can still proceed while currentness is unavailable, because containment should not be blocked by the same dependency that may be failing.

## Rollback

Rollback restores an explicit known target, not "whatever used to work" and not an unpinned latest version.

A transition receipt binds both:

- rollback target-state digest;
- rollback-plan digest.

Reactivation after rollback returns through staging and requires a fresh effect-increasing decision.

## Evidence boundary

A transition receipt is historical evidence.

It cannot be replayed as an activation grant, cannot authorize another instance, and cannot silently update an admission record.

## Governing rule

> **Activation requires fresh authority. Containment may be preauthorized. Recovery remains observable.**
