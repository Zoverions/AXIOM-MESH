# AXIOM Specialist Harness Bridge v0

**Status:** inert evidence and handoff binding / #1610 slice C3  
**Version:** v0  
**Authority:** none  
**Issue:** #1610

## Purpose and boundary

Specialist Harness Bridge v0 records, by digest, how one bounded specialist
harness (for example a coding runtime, a skill, or an admitted external agent)
is bound to one task. It is an **evidence and handoff binding**, not a new
delegation primitive, not a scheduler, and not an execution path.

The bridge never grants authority, never delegates, never executes, never opens
a network path, and never activates runtime. Any consequential effect that a
specialist later proposes still has to be separately authorized through the
supported sequence:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

> **A recommendation or output never grants authority.** A model, router, or
> semantic classifier may recommend a specialist, and a specialist may produce
> an output, but neither the selection nor the recorded `output_digest` grants
> authority, widens a ceiling, or satisfies an authority predicate.

## Contract identity

- Schema name: `axiom-specialist-harness-bridge.v0`
- Wire schema: `mesh/config/specialist-harness-bridge-v0.schema.json`
  (`additionalProperties: false` on every object)
- Validator: `mesh/src/lib/specialist-harness-bridge.mjs`
  (`buildSpecialistHarnessBridge`, `validateSpecialistHarnessBridge`,
  `specialistHarnessBridgeDigest`)
- Canonical digest: `digestObject` over the whole bridge document, the same
  canonical-JSON SHA-256 helper used by the sibling inert contracts. Callers
  compose the bridge by that digest; `validateSpecialistHarnessBridge(doc,
  { expectedDigest })` detects tampering.

## Composition by digest

The bridge references each existing contract by the SHA-256 digest produced by
that contract's own canonical helper. It does not redefine or reimplement any of
them.

| Bridge field | Existing contract |
| --- | --- |
| `task_binding.outcome_digest` | `axiom-outcome.v0` (#1823, `outcomeDigest`) |
| `task_binding.task_lifecycle_digest` | `axiom-task-lifecycle.v0` (#1823, `taskLifecycleDigest`) |
| `ceiling_binding.autonomy_envelope_digest` | `axiom-autonomy-envelope.v0` (#1828, `validateAutonomyEnvelope`) |
| `adapter_binding.execution_route_policy_digest` + `route_class` | `axiom-execution-route-policy.v0` (#1825) |
| `adapter_binding.skill_admission_digest` | `axiom-skill-admission.v0`, required only when `adapter_kind` is `skill` |
| `adapter_binding.external_agent_ingress_digest` | `axiom-external-agent-ingress-request.v0` (#1747), required only when `adapter_kind` is `external-agent` |
| `data_binding.data_projection_digest` | the allowed data/context projection |
| `data_binding.output_digest` | the output artifact; `null` while `output_state` is `pending` |
| `handoff_binding.task_continuity_policy_digest` | `axiom-task-continuity-policy.v0` (#1825/#1829) |
| `provenance_binding.portable_delegation_grant_digest` | `proof_digest` of an `axiom-portable-delegation-grant.v1` (#1808) |
| `provenance_binding.ai_execution_provenance_digest` | optional `axiom-ai-execution-provenance.v0` |
| `provenance_binding.verified_work_graph_digest` | optional `axiom-verified-work-graph.v0` |
| `composition_binding.semantic_operation_proposal_digest` | optional #1628 Semantic Operation Proposal |
| `composition_binding.persistent_entity_bundle_digest` | optional C0 `axiom-persistent-entity-bundle.v0` |

`issued_at` and `expires_at` carry currentness; `cancellation_handle` names the
cancellation/revocation handle. When callers pass the referenced documents in
`options.references`, each one is validated with its existing validator and its
digest must equal the bound digest. The route policy must also permit the bound
`route_class`, and the task continuity policy must bind the same outcome and task
digests. The portable delegation grant is bound by digest only: verifying its
signature needs pinned root material, which stays with the existing verifier.

## Ceilings are a subset of the Autonomy Envelope

The bridge declares its own tool/capability, data-class, effect, consequence,
execution-time and cost ceilings. When the caller supplies the envelope object
(`options.envelope`), the bridge:

1. rejects an envelope whose `delegation_allowed` is anything but `false`
   (missing, `null`, `0` or `"false"` included) before the envelope validator
   runs;
2. validates the envelope with the existing `validateAutonomyEnvelope` and
   requires its digest to equal `autonomy_envelope_digest`;
3. requires the same `subject_principal_id`;
4. requires `capability_ids`, `data_classes` and `effect_classes` to be subsets
   of the envelope's;
5. requires `consequence_ceiling`, `max_execution_ms` and `max_cost` to be at or
   below the envelope's (same currency; any cost fails when the envelope permits
   none). The bridge rejects a `max_minor_units` of `-0` even though the envelope
   validator and schema accept it; this is stricter only and never widens a
   ceiling;
6. requires `issued_at` at or after the envelope `active_from` and `expires_at`
   at or before the envelope `expires_at`.

Anything wider fails closed. Passing `options.now` rejects an expired or
not-yet-current bridge.

## Without an envelope, ceilings are NOT checked

> **`validateSpecialistHarnessBridge(doc)` without `options.envelope` checks
> structure only. It does not compare any ceiling against the Autonomy
> Envelope**, so a structurally valid bridge may declare ceilings wider than
> its envelope. The result reports this as `envelope_checked: false`.
> Consumers MUST require `envelope_checked === true` (and, where currentness
> matters, `currentness_checked === true`) before relying on ceiling
> compliance. `buildSpecialistHarnessBridge` without an envelope has the same
> limitation.

Every failure, including cyclic input, throwing getters or proxies, surfaces
as a `ValidationError`; the validator never returns a partial result.

## Hard zeros and invariants

Pinned by `const` in the schema and enforced again in the validator:

- `authority_effect: none`
- `execution_effect: none`
- `network_effect: none`
- `delegation_effect: none`: the bridge is non-delegating
- `population_effect: none` and `governance_identity_effect: none`: compute is
  not population (see `CONSTITUTION.md`)
- `runtime_activation: false`

Further invariants:

- Every object is closed (`additionalProperties: false` in the schema and an
  exact field set in the validator), so unknown keys are rejected at every
  depth, including `__proto__`, `constructor`, homoglyph and zero-width keys.
- `validateSpecialistHarnessBridge` validates a `structuredClone` snapshot of
  the document inside its fail-closed wrapper, so a Proxy (even one that never
  throws) or any other non-plain-data input fails closed instead of showing
  the validator a different shape than the caller later sees.
- The bridge carries no `mind_id`, no mind-continuation claim and no Founder
  Genesis receipt: the contract has no mind or Genesis slot, and closed
  objects mean one cannot be added. That absence is the guarantee.
- As defense in depth, a segment-boundary name guard rejects any field name
  (at every depth) and any `adapter_ref` that contains a `mind`/`minds` word
  token, split at separators, camelCase and letter/digit boundaries (for
  example `x/mind`, `urn:mind:x`, `agent:mind:1`, `mindId`, `mind-id`), or
  that contains `genesis` anywhere (including `genesis-receipt`). Words that
  merely contain "mind", such as `reminder-bot` or `mastermind-tool`, pass.
  Casing is handled fail-closed: a segment that is all-lower, all-upper, or a
  single Capitalized word is tokenized as above; any other mixed-case segment
  (`MiNd`, `MINDx`, `reMinder`) has no trustworthy word boundaries and is
  rejected if it contains "mind" case-insensitively anywhere.
  This guard is a name heuristic, not proof that an opaque reference is not a
  mind identity. `adapter_ref` also cannot equal the subject principal.
- `adapter_kind` must match exactly one admission reference: a `tool-harness`
  carries neither a skill admission nor an external-agent ingress digest.
- Wildcard or administrator-style ceilings are rejected structurally.
- `mesh/config/capabilities.json` is unchanged; this contract adds no capability.

## Non-claims

The bridge does not claim or create authority, delegation, execution,
scheduling, network egress, runtime activation, credential access, harness
certification, output correctness, personhood, population, governance
identity, or mind continuity. `authority_effect` is always `none`.
