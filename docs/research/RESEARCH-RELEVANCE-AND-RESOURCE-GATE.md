# Research Relevance and Resource Gate

AXIOM-MESH should not confuse novelty with progress.

Scarce engineering effort should go toward unresolved problems, missing guarantees, and interoperability gaps—not toward rebuilding mature mechanisms or repeating research programs whose key premises have already failed.

## Core rule

**Reuse mature mechanisms. Augment bounded gaps. Research only where the uncertainty is real. Preserve compatibility at the edges.**

A direction should be classified before substantial implementation:

- **Adopt existing** — use mature prior art directly.
- **Augment existing** — build only the missing guarantee or bridge.
- **Novel research** — proceed experimentally with explicit falsification criteria and resource limits.
- **Compatibility only** — support legacy/institutional reality through a thin edge adapter.
- **Park** — retain the idea but stop allocating implementation resources.
- **Reject** — document why the path should not be pursued.

## Meeting institutions where they are

A technically superseded interface can still matter because governments, schools, universities, hospitals, corporations, and standards bodies often operate on long replacement cycles.

That does not justify contaminating the Mesh core with legacy assumptions.

The preferred pattern is:

```text
legacy/current institutional system
  -> compatibility adapter / translation profile
  -> neutral AXIOM primitive
  -> current trust / authority / evidence semantics
```

This lets AXIOM support older infrastructure while preserving a forward-compatible internal model.

## Example: authentication and authorization

Recent IETF work on AI-agent authentication and authorization explicitly emphasizes composition of established mechanisms such as OAuth, SPIFFE, WIMSE, and related standards rather than inventing a fresh protocol for every agent system.

The AXIOM opportunity is therefore usually not "invent another authentication protocol." It is to contribute where current mechanisms are weaker: attenuation, causal composition, intent binding, evidence separation, lifecycle semantics, cross-protocol parity, recovery, and adversarial conformance.

## Example: prompt injection

Prompt-injection research increasingly shows that string filters and simple data/instruction separation are not sufficient for contextual manipulation.

Therefore AXIOM should continue detector research, red teaming, quarantine, and digital-immune-system work—but should not make detection the fundamental security boundary.

The stronger architecture is:

```text
detect if possible
  + classify context
  + constrain authority
  + isolate effectors
  + observe behavior
  + fail closed at the effect boundary
```

Even if detection fails, unauthorized effects should still fail.

## Novelty test

A proposal is not novel merely because AXIOM implements it independently.

A useful novelty claim requires at least one of:

- a stronger invariant;
- a new composition of existing mechanisms;
- a new adversarial test or falsification method;
- a lower-friction adoption path;
- a portability/interoperability improvement;
- a new security/evidence property;
- a solution to a failure mode not adequately handled elsewhere.

## Dead-end recovery

If a path proves weak, the work should still produce reusable value where possible:

- threat models;
- negative fixtures;
- adapters;
- interoperability observations;
- falsification results;
- migration guidance;
- archived design rationale.

Research failure should become evidence, not sunk-cost pressure.

## Resource doctrine

Before substantial implementation, record:

1. the unresolved problem;
2. strongest existing alternatives;
3. why those alternatives are insufficient;
4. AXIOM's differentiated contribution;
5. minimum experiment that could falsify the idea;
6. expected implementation and maintenance cost;
7. compatibility/adoption value;
8. opportunity cost;
9. exit criteria.

The project should be willing to stop attractive work early when the evidence says the gap is already solved or the expected value is too low.
