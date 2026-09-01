# Federated Recognition Composition

Bilateral recognition is safe only if federation does not silently turn graph reachability into trust.

A federation view may show:

```text
A <-> B <-> C <-> D
```

but that graph is **discovery and interoperability evidence**, not authority.

The safe rule is:

> **A path can suggest where to verify next. Only explicit local adoption can satisfy recognition policy.**

## Composition

Each edge remains one exact bilateral recognition profile. A local institution may adopt some edges directly and inspect others as candidate paths.

Useful federation functions include:

- discover likely credential routes;
- identify compatible verifier profiles;
- reveal stale or withdrawn edges;
- compare assurance floors;
- compute purpose/privacy intersections;
- surface conflicts;
- plan migration or interoperability.

They must not silently create trust.

## Path semantics

Multiple paths may provide corroboration, but not authority.

The shortest path is not necessarily best. The strongest path depends on purpose, assurance, privacy, currentness, and local policy.

Purpose and privacy compose conservatively:

- allowed purpose = intersection of all required scopes;
- permitted disclosure = intersection of all privacy constraints.

## Recognition sets

A community may publish a reusable recognition set for convenience.

Importing that set is equivalent to importing an inert institutional pattern: it grants nothing. Each receiving institution decides which exact edges to adopt.

## Failure containment

If one institution withdraws or is compromised, only recognition that depended on its exact edges should be affected. Other bilateral relationships remain intact.

## Governing rule

**Federate discovery. Localize trust. Make every trust edge explicit.**
