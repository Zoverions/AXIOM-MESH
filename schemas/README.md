# AxiomMesh Schema Contracts

This directory contains versioned JSON Schema definitions that define the contract interfaces between the Gateway, Hypervisor, and Grid pillars of the AxiomMesh architecture.

## Schemas

* `IntentObject` (Gateway -> Hypervisor): Represents an intent sent from the Gateway to the Hypervisor for processing.
* `IntentResponse` (Hypervisor -> Gateway): Represents the response sent from the Hypervisor back to the Gateway.
* `SkillVector` (Hypervisor -> Grid): Represents a skill vector to be added to the Grid ledger.
* `ZKMLPayload` (Hypervisor -> Grid): Represents a Zero-Knowledge Machine Learning payload for verification on the Grid.

## Versioning
These schemas are versioned. Each schema has a `$schema` and `id` representing its version. For example: `intent_object.v1.json`.
