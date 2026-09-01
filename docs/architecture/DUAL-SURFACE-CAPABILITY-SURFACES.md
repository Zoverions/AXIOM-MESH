# Dual-Surface Capability Surfaces

**Status:** architecture and documentation rule

**Updated:** 2026-09-01

## Rule

Every durable capability should have both:

1. a human-facing surface with a comprehensible name, purpose, state, controls, explanation, and exit/recovery/appeal path where applicable; and
2. an agent-facing surface with a stable capability ID, versioned contract, exact authority/effect semantics, resource/disclosure requirements, evidence bindings, lifecycle state, and explicit non-claims.

Human branding may change. Machine semantics must not silently change with branding.

## Four-name model

```text
Human product:        Studio
Human function:       Build and test systems
Capability family:    studio.composition
Schema/wire identity: axiom-studio-composition.v1
```

Do not force one marketing name to serve all layers.

## Working product families

- One -> `ui.*`
- Mesh -> `core.*`, `mesh.*`
- Studio -> `studio.*`
- Lab -> `lab.*`
- Verify -> `verification.*`
- Circles -> `circles.*`
- Governance -> `governance.*`
- Education -> `education.*` / domain-specific mappings
- Entity -> `entity.*`
- Relationship/Deliberation -> `relationship.*`, `deliberation.*`
- Runtime/Intelligence Fabric -> `runtime.*`, `connector.*`, `intelligence.*`
- Compute Fabric -> `compute.*`, `resource.*`
- Device/Embodiment -> `device.*`, `embodiment.*`
- Transport/Sync -> `transport.*`, `sync.*`
- Recovery/Portability -> `recovery.*`, `portability.*`

These are functional families, not final branding decisions.

## Completeness gate

A major capability is incomplete until the project can answer:

### Human
- What is it called and why would I use it?
- What can/can't it do?
- What data/resources/cost are involved?
- How do I stop, revoke, undo, leave, recover, appeal, or inspect evidence?

### Machine
- What is the canonical ID/schema?
- How is it discovered?
- Which actions/reads exist?
- Which principals may request it?
- What authority, resource, destination, and disclosure constraints apply?
- What evidence and failures are produced?
- What does discovery/install explicitly not authorize?

### Project
- Is it conceptual, specified, implemented, tested, enabled, exposed, pilot-proven, production-promoted, or marketed?
- Where are tests, threat model, rollback/recovery, and documentation?

## Capability Surface Registry

Add a machine-readable registry linked by stable capability ID to the executable capability registry rather than overloading runnable status. A future `axiom-capability-surfaces.v1` may map human descriptions and machine contracts while preserving `mesh/config/capabilities.json` as runnable authority.

## Naming doctrine

When a new concept appears, define it neutrally, classify its layer, assign a stable capability family/ID, define authority/non-authority semantics, create versioned contracts and human labels, add lifecycle/evidence, then integrate. Do not delay necessary capability work because final ecosystem branding is unresolved.
