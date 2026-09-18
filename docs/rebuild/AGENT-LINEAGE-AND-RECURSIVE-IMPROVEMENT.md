# Agent Lineage and Recursive Improvement Substrate

Status: design baseline for an experimental, non-production-reachable laboratory slice.

This document is name-neutral and does not alter public branding, protocol identity outside the new experimental schemas, or the current `axiom-machine-principal.v1` authorization contract.

## Purpose

Dynamic agent runtimes can create short-lived workers, specialists, critics, verifiers, and coordinators that did not exist when a node was configured. The Mesh needs to preserve attribution and bounded authority across that causal tree without requiring every ephemeral worker to be globally registered in advance.

The core rule is:

> Trust is not inherited. Authority may only be introduced by an authority that already holds it. Provenance must remain linked across the lineage.

The first implementation slice is deliberately weaker than a live delegation protocol. It proves that a proposed child machine principal is an attenuation of a parent principal, binds the causal relationship into a signed lineage attestation, and preserves resource/depth ceilings. It does **not** authorize a process spawn, grant a capability, promote a capability-registry entry, or make a claim about task success.

## Compatibility boundary

`axiom-machine-principal.v1` remains unchanged. Its `constraints.delegation` field continues to require `{ "allowed": false, "max_depth": 0 }`.

A spawned child in the laboratory model is still a normal v1 machine principal with the same human sponsor as its parent. The parent is recorded as causal lineage, not substituted as the child's human sponsor and not treated as an authority issuer.

This avoids silently changing the meaning of existing authority digests, identity credentials, discovery documents, authority manifests, or machine receipts.

## Security invariants

1. **No authority amplification.** Child roles, scopes, actions, purposes, and destinations must be subsets of the parent's corresponding ceilings.
2. **No budget amplification.** Every child machine budget must be less than or equal to the parent's budget.
3. **Human sponsorship continuity.** Parent and child must resolve to the same human sponsor in this slice.
4. **Distinct principal identity.** A child cannot reuse the parent's principal ID.
5. **Ephemeral-by-default offspring.** The laboratory slice rejects persistent children.
6. **Expiry attenuation.** When the parent is non-persistent, the child may not outlive the parent. The spawn proposal itself may not outlive the child.
7. **Bounded recursion metadata.** Spawn proposals carry explicit depth, child-count, descendant-count, token, storage, and wall-clock ceilings.
8. **Monotonic recursive ceilings.** A descendant proposal linked to a parent lineage attestation may not increase any recursive ceiling and must increment lineage depth exactly once.
9. **Strict lineage binding.** A descendant link commits to the exact parent lineage attestation digest and to the exact principal that was the previous attestation's child.
10. **Strict parsing.** Unknown fields, malformed timestamps, unsupported schemas, unsorted/ambiguous sets, and digest mismatches fail closed.
11. **Signed provenance is not authorization.** A valid lineage attestation proves only that the signer attested to the normalized proposal. It does not authorize execution, grant authority, verify output, establish reputation, or establish global currentness.
12. **Existing v1 delegation remains disabled.** Nothing in this slice changes the current machine-principal delegation boundary.

## Experimental schemas

### `axiom-agent-spawn-proposal.v1`

A canonical proposal binds:

- exact parent and child normalized machine-principal definitions through definition and authority digests;
- shared root human sponsor;
- task ID, declared purpose, and input digest;
- creation and expiry timestamps;
- lineage depth and optional parent-lineage-attestation digest;
- bounded recursive resource ceilings;
- fixed non-authorizing semantics;
- a deterministic proposal digest.

The proposal contains enough material to reproduce the attenuation decision without treating the object as a bearer token.

### `axiom-agent-lineage-attestation.v1`

An Ed25519-signed envelope binds the exact normalized spawn proposal and its digest to an issuer identity/key ID.

The signature is evidence of provenance only. The fixed semantics state:

- `authority_effect = none`;
- `delegation_effect = none`;
- `spawn_authorized = false`;
- `trust_inherited = false`;
- `task_success_claimed = false`;
- `output_verified = false`;
- `global_currentness_claimed = false`.

## Attenuation relation

For every authority-bearing set `S`:

`S(child) ⊆ S(parent)`

For every numeric execution budget `B`:

`B(child) ≤ B(parent)`

For recursive spawn ceilings `R`, a linked descendant proposal must satisfy:

`R(descendant) ≤ R(parent-lineage-proposal)`

and:

`depth(descendant) = depth(parent-lineage-proposal) + 1`

The first slice intentionally does not attempt to infer semantic equivalence between differently named roles, scopes, purposes, tools, or destinations. Exact set membership is required.

## What this slice does not claim

- It does not make dynamic spawning production reachable.
- It does not permit machine principals to mint or delegate current v1 authority.
- It does not issue machine identity credentials for children.
- It does not replace admission policy, sandboxing, runtime attestation, effect receipts, or current revocation checks.
- It does not prove that a runtime actually spawned the child.
- It does not prove that the child executed a task successfully.
- It does not prove that an output is true or correct.
- It does not create reputation inheritance.
- It does not define model-weight self-modification or evaluator promotion.
- It does not promote any registry capability.

## Follow-on gates

A future production-reaching design must separately prove:

1. sponsor/root authorization for a specific spawn class;
2. child identity issuance and currentness;
3. admission-time policy evaluation;
4. runtime/sandbox attestation where consequence requires it;
5. actual descendant-count and resource-budget enforcement, not merely declared ceilings;
6. cancellation and revocation propagation;
7. action/effect receipts carrying lineage references;
8. improvement proposal versus promotion separation;
9. independent-lineage evaluation for consequential self-improvement;
10. evaluator/reward-function mutation as a higher-assurance class;
11. offline verification and selective-disclosure rules for lineage proofs;
12. capability-registry evidence before any public capability claim.

## Recursive improvement layering

The Mesh should treat recursive improvement as multiple consequence classes rather than one capability:

- retrieval/context changes;
- memory/experience changes;
- prompt/instruction changes;
- tool/routing changes;
- workflow/agent-topology changes;
- new skills/tools;
- runtime/source changes;
- evaluator/reward changes;
- training-data changes;
- model-weight changes;
- changes to the improvement mechanism itself.

The ability to **propose** an improvement must remain separable from the authority to **promote** it.

## Long-horizon model

The target is not a single privileged self-rewriting agent. It is a population of sovereign local lineages that can experiment privately, preserve failed and successful branches, package improvements with evidence, and optionally exchange reproducible improvement artifacts across admitted peers.

Evidence may propagate broadly. Installation authority remains local and explicit.
