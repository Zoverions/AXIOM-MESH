# AXIOM Interrogation Plane v0

**Status:** read-only repository/operator introspection surface  
**Version:** v0  
**Authority:** none

## Purpose and boundary

The Interrogation Plane turns current AXIOM-MESH architecture, capability, evidence,
network-policy, and documentation verification state into one deterministic graph
that a human or supervising agent can inspect.

It is designed for exception supervision: operators should be able to see which
parts of the system deserve attention without treating a large code diff as the
only usable representation of change.

The supported privileged-effect authority sequence remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

The Interrogation Plane does not sit inside that sequence, bypass it, or grant
permission to enter it. It is a read-only projection over already-authoritative
repository sources and deterministic verifiers.

> **Semantic judgment is not authority.**

## v0 source model

The first slice consumes only repository-local current-build sources:

- `mesh/config/capabilities.json`;
- `mesh/config/capability-evidence-bindings.json`;
- `mesh/config/service-network-policy.json`; and
- the canonical documentation boundary verified by `mesh/src/check-docs.mjs`.

Before a report is emitted, v0 requires the existing deterministic capability
registry validator, exact evidence-binding validator, service-network-policy
validator, and canonical documentation verifier to succeed.

The report records digests of its three machine-readable source documents. The
evidence-binding document must bind the exact capability-registry digest and the
same kernel version. A stale binding therefore fails before a supervisory graph
can be presented as current.

## Graph structure

The graph contains several intentionally distinct node and edge classes.

### Capability and evidence nodes

Every capability is represented with its family, registry status, summary,
evidence count, and whether it has an exact executable assertion binding.

Evidence files are separate nodes. Capability-to-evidence edges preserve the
registry declaration, while binding nodes preserve the stronger exact
capability -> runnable test -> named test -> assertion relationship.

An implemented capability without an exact evidence binding is rejected. An
experimental capability without one remains visible as an attention item rather
than being silently promoted to equivalent evidence strength.

### Conceptual authority sequence

The graph contains the four conceptual authority stages and explicit
`authority_sequence` edges.

These edges are marked `conceptual: true` and `network_edge: false`.

That distinction is mandatory. The statement
`Gateway -> Hypervisor -> Sandbox -> Grid` describes the supported
privileged-effect authority sequence; it must not be misread as a claim that
every adjacent stage is a direct transport connection.

### Actual service-network topology

Actual network edges are derived independently from the exact
`axiom-service-network-policy.v1` allowlist.

Each `network_flow` edge contains its source, destination, route count, and exact
method/path pairs. These edges are marked `network_edge: true` and
`conceptual: false`.

The `network.segments` projection lists each declared policy segment and its
member services. This lets an operator identify the policy segment for an
allowed flow without inferring it from the source digest. Segment membership
describes the verified repository policy; it does not prove a live deployment's
network isolation or create another allowed flow.

The current service policy is still required to be default-deny. The
Interrogation Plane must never invent a network edge to make the diagram resemble
the conceptual authority sequence.

## Operator report

Generate the current report with:

```bash
npm run interrogation:report
```

The output is canonical JSON-friendly data containing:

- source digests;
- deterministic-verification summaries;
- read-only/non-authority posture;
- capability/evidence graph;
- conceptual authority graph;
- actual service-network graph;
- explicit attention items; and
- a deterministic report digest.

The report is intended to become a data source for AXIOM One / Verify and other
human supervisory views. v0 itself is a command-line JSON report, not a new
browser product or Gateway service.

## Semantic supervision and TypeSafe/Jev

A later slice may attach typed semantic annotations such as architectural-smell
likelihood, review priority, suspected documentation drift, or likely
regression category.

Those judgments must remain separate from observed/deterministic facts. Their
probabilities and confidence must remain visible enough for the caller to decide
whether to ignore, review, or escalate them.

System One/Jev is suitable for this layer because it can supply narrow typed
judgments while code retains workflow control. It is not suitable as a
replacement for authorization, exact registry/evidence validation, policy
verification, cryptographic verification, or other deterministic gates.

A semantic annotation may influence what a human or reasoning agent inspects
next. It may not:

- mint or widen a capability;
- change an allow/deny authority result;
- turn discovery into permission;
- convert confidence into truth;
- bypass deterministic evidence verification; or
- silently mutate the graph's trusted source facts.

## Future supervision layers

Later, separately reviewed slices may add:

1. coverage, mutation, complexity, churn, dependency, and ownership overlays;
2. change provenance and exact-commit comparison;
3. documentation-versus-implementation drift diagnostics;
4. typed semantic attention signals;
5. an AXIOM One interactive drill-down surface; and
6. bounded repair proposals launched from selected graph nodes.

The first five remain observational until their own authority boundary is
reviewed. A future repair proposal must re-enter the normal repository
contribution path and must not inherit merge, deployment, credential, or runtime
authority merely because it originated from the Interrogation Plane.

## Promotion boundary and non-claims

Interrogation Plane v0 adds no:

- capability-registry entry or capability promotion;
- Gateway or internal-service route;
- provider, TypeSafe, Jev, model, browser, or network call;
- credential or secret access;
- code mutation or autonomous repair;
- agent dispatch;
- merge or direct-main authority;
- deployment or production-promotion path; or
- claim that semantic confidence proves correctness.

Its purpose is narrower: produce a deterministic, inspectable representation of
what the current repository and its existing verifiers already support.

The governing rule is:

> **Make complexity inspectable without making inspection authoritative.**
