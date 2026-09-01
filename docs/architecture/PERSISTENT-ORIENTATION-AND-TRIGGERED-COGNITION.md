# Persistent Orientation and Triggered Cognition

**Status:** architecture refinement; implementation pending

**Updated:** 2026-09-01

## Principle

> Persistent orientation does not require persistent inference.

A long-lived entity should retain identity, commitments, goals, unresolved questions, relationship state, schedules, authority boundaries, and the ability to resume the correct thread while expensive generative cognition sleeps.

## Lightweight always-available core

The always-available portion should primarily be deterministic software:

- event listener;
- trigger router;
- timers/deadlines;
- authority/revocation watcher;
- resource governor;
- health/recovery monitor;
- bounded state/index maintenance; and
- local human stop/inspection controls.

It must not require a continuously running frontier model.

## Dormant obligations

Represent long-lived intentional state explicitly:

```yaml
direction: investigate-condition-X
trigger: condition-Y
priority: background
authority: research-only
resource_profile: bounded-R3
expires_at: 2027-03-01T00:00:00Z
```

A dormant obligation does not execute merely because it exists. Trigger satisfaction re-enters normal authority, privacy, resource, and placement checks.

## Trigger classes

- direct human request;
- authorized incoming event;
- deadline;
- watched-condition change;
- dormant commitment becoming actionable;
- protest/reconsideration trigger;
- resource/health event;
- scheduled maintenance opportunity;
- bounded opportunistic reflection.

## Cognition routing

```text
event
 -> deterministic rule/lookup when sufficient
 -> narrow local specialist when sufficient
 -> general local/remote cognition when justified
 -> bounded specialist ensemble for difficult/high-consequence work
 -> checkpoint useful result
 -> unload/sleep
```

Use the least powerful sufficient cognition. More available compute may increase duty cycle and parallelism; it does not widen authority.

## Resource integration

Persistent orientation is subordinate to the Resource Governance Plane. P0 human sovereign controls and P1 foreground work outrank P3 reflection and P4 maintenance. Background work pauses or terminates under pressure without losing identity or durable orientation.

## Required proof cases

1. stop all expensive cognition while preserving identity and dormant obligations;
2. restart/change runtime;
3. fire a trigger;
4. prove the same obligation and provenance resume under inherited authority/resource limits;
5. checkpoint outcome and return to dormancy;
6. increase available compute and prove capability/duty cycle can expand without authority expansion.

## Non-claims

This design does not claim consciousness, continuous subjective experience, implementation of an always-on entity, or production background autonomy.
