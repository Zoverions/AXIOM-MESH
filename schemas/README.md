# AxiomMesh Schema Contracts

This directory contains versioned JSON Schema definitions that define the contract interfaces between the Gateway, Hypervisor, and Grid pillars of the AxiomMesh architecture.

## Schemas

* `IntentObject` (Gateway -> Hypervisor): Represents an intent sent from the Gateway to the Hypervisor for processing.
* `IntentResponse` (Hypervisor -> Gateway): Represents the response sent from the Hypervisor back to the Gateway.
* `SkillVector` (Hypervisor -> Grid): Represents a skill vector to be added to the Grid ledger.
* `ZKMLPayload` (Hypervisor -> Grid): Represents a Zero-Knowledge Machine Learning payload for verification on the Grid.
* `AlignmentProfile` (Init/User|Agent -> Hypervisor): Captures goals, traits, characteristics, risk tolerance, and priority tags used for policy evaluation.
* `MCPCompatibilityMatrix` (Governance -> MCP policy engine): Defines peer-class minimum security and risk thresholds for interoperability decisions.
* `SkillCapsuleManifest` (Capsule compiler -> Runtime): Defines capability, constraints, runtime budget, and token policy for a Mesh-native skill capsule.
* `SourceDescriptor` (Ingestion pipeline -> Compiler): Captures upstream provenance, immutable source refs, and declared authority for external skills.
* `RebuildAttestation` (Compiler -> Governance/Audit): Records rewrite/rebuild actions and security rationale for Mesh re-issuance.
* `CapabilityManifest` (Node -> Grid): Hardware-aware capability and benchmark profile for dynamic routing.
* `CausalReasoningAttestation` (Hypervisor/Grid -> Verifier): Binds inference outputs to an auditable causal DAG, consensus context, and proof bundle for CPoR verification.
* `NetworkServicePolicy` (Governance -> Runtime policy engine): Defines machine-readable constitutional controls for participant domains, risk routing, weighted governance, overlays, economics, and audit obligations.
* `AuditControls` (M23.5 - Audit Operations): Machine-readable control manifest for operationalizing the Societal OS Audit Playbook with domain controls, owners, evidence commands, freshness SLOs, and CI release gate bindings.

## Versioning
These schemas are versioned. Each schema has a `$schema` and `id` representing its version. For example: `intent_object.v1.json`.
