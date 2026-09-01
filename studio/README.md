# Studio Artifact Model

Studio is the common composition environment for reusable AXIOM artifacts.

Every artifact class should eventually share a small cross-cutting envelope for:

- identity/version;
- immutable content digest;
- provenance;
- protection profile references;
- verification profile references;
- compatible deployment topologies;
- local-adaptation requirements;
- limitations;
- explicit non-authority semantics.

The artifact payload remains type-specific. A contract, capsule, adapter, topology, and institutional pattern do not need one giant schema.

This directory is intentionally an authoring/package namespace, not an execution namespace.
