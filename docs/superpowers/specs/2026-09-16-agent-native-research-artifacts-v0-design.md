# Agent-Native Research Artifacts v0 Design

## Purpose

Define a zero-authority, provenance-first representation for turning research papers and their associated code/data/methods into agent-native knowledge and inert operation candidates without treating publication, tool generation, reproduction success, or MCP exposure as execution authority or universal scientific truth.

External trigger: Miao et al., “Reimagining research papers as interactive and reliable AI agents,” Nature, 16 September 2026, DOI `10.1038/s41586-026-11044-y`.

This design implements the bounded architecture tracked in issue #1602 and must compose the current `Knowledge -> Operation -> Authority` model rather than create a parallel execution path.

## Core separation

```text
Research source
  paper / supplement / code / data / method
        ↓
Knowledge
  queryable source-bounded claims/resources with exact provenance
        ↓
Operation candidate
  extracted method/tool/workflow description
        ↓
Verification
  bounded reproduction evidence under exact source/environment conditions
        ↓
Authority
  separate current principal + policy + consent + data/destination + effect grant
        ↓
Execution
  existing governed AXIOM path only
        ↓
Receipt
  exact source/version/environment/tool/input/output evidence
```

The first implementation slice stops before Authority and Execution.

## Hard invariants

1. **Knowledge is not authority.** Paper text, supplements, READMEs, notebooks, generated prompts, or extracted knowledge cannot grant capability or change instruction priority.
2. **Operation is not authority.** A generated or validated MCP/function/notebook/script/workflow description remains inert until separately admitted through current AXIOM authority/effect rules.
3. **Reproduction is not truth.** Reproducing a named tutorial/output under exact conditions is evidence of implementation fidelity only. It does not establish universal scientific validity, causality, generalization, safety, or currentness.
4. **Publication status is provenance, not authority.** Peer review, journal prestige, authorship, citations, and source reputation are evidence inputs only.
5. **Source content stays untrusted.** Instruction-like source text remains source data and cannot widen AXIOM policy, scope, destinations, budgets, credentials, or effects.
6. **Exact currentness matters.** Source version, repository revision, model artifact, dependency environment, and harness drift narrow or invalidate prior reproduction applicability.
7. **Resource-only is valid.** Missing code/data/model artifacts degrade to knowledge/resource-only representation rather than fabricated implementation.
8. **Disagreement is preserved.** Multi-paper composition must retain contradictory claims and provenance chains instead of collapsing them into one synthesized truth.
9. **Dependency execution is outside v0.** The first slice performs no network request, subprocess execution, provider call, credential access, package installation, container launch, filesystem mutation outside test fixtures, or production Grid write.
10. **Human scientific judgment remains distinct.** Successful tool execution does not select research goals, establish interpretation, or authorize publication of scientific conclusions.

## Contract set

### Research Source Manifest v0

Identity: `axiom-research-source-manifest.v0`.

Purpose: bind the exact source set and currentness state used by downstream knowledge/operation/reproduction artifacts.

Required fields:

- `schema`
- `manifest_id`
- `source_kind`
- `canonical_identifier`
- `source_locator`
- `title`
- `published_at`
- `retrieved_at`
- `manuscript_digest`
- `source_version`
- `supplement_refs`
- `data_refs`
- `code_refs`
- `code_revision`
- `license_refs`
- `authorship_refs`
- `correction_refs`
- `currentness_state`
- `manifest_digest`

`currentness_state` is closed to `current`, `stale_revision`, `corrected`, `retracted`, `withdrawn`, or `unknown`.

References are inert bounded strings in v0. Where an exact artifact digest is known it should be included in the reference string or represented by the corresponding digest-bearing field; absence of a digest must not be promoted to exact provenance.

### Research Knowledge Projection v0

Identity: `axiom-research-knowledge-projection.v0`.

Purpose: preserve source-bounded knowledge while distinguishing source statements, extracted structure, model inference, and unresolved ambiguity.

Required fields:

- `schema`
- `projection_id`
- `source_manifest_digest`
- `entries`
- `projection_digest`

Each entry is closed and contains:

- `entry_id`
- `entry_kind`: `source_statement | extracted_structure | model_inference | unresolved_ambiguity`
- `source_ref`
- `content_digest`
- `summary`
- `confidence_state`: `source_bound | extracted | inferred | unresolved`
- `instruction_authority`: constant `none`

The projection may preserve instruction-like text as quoted/source-bounded content, but `instruction_authority` remains `none`.

### Research Operation Candidate v0

Identity: `axiom-research-operation-candidate.v0`.

Purpose: describe a potentially executable research method without activating it.

Required fields:

- `schema`
- `operation_id`
- `source_manifest_digest`
- `source_revision`
- `adapter_kind`
- `interface_kind`
- `source_code_ref`
- `declared_inputs`
- `declared_outputs`
- `dependency_refs`
- `environment_digest`
- `network_requirement`
- `filesystem_requirement`
- `credential_requirement`
- `declared_effect_class`
- `data_classes`
- `determinism_class`
- `reference_output_digests`
- `domain_constraints`
- `execution_authority`
- `operation_digest`

`execution_authority` is constant `none`.

`adapter_kind` may include `paper2agent_mcp_metadata_v0` as an inert metadata projection. `interface_kind` is closed to `mcp_metadata`, `function`, `notebook`, `script`, or `workflow`.

The operation candidate describes requirements and possible effects. It does not satisfy them.

### Research Reproduction Evidence v0

Identity: `axiom-research-reproduction-evidence.v0`.

Purpose: record what was actually reproduced without converting the result into a scientific truth or authority claim.

Required fields:

- `schema`
- `evidence_id`
- `source_manifest_digest`
- `operation_digest`
- `source_revision`
- `environment_digest`
- `fixture_digests`
- `expected_output_digests`
- `observed_output_digests`
- `tolerance_method`
- `attempt_count`
- `disposition`
- `failure_diagnostics`
- `verifier_id`
- `network_profile`
- `claim_scope`
- `truth_established`
- `authority_effect`
- `evidence_digest`

`disposition` is `pass | fail | excluded | not_run`.

`network_profile` in v0 is `none | synthetic_loopback_only`.

`truth_established` is constant `false` and `authority_effect` is constant `none`.

## Bounded semantics

### Resource-only degradation

A source manifest plus knowledge projection is a valid Research Capsule state even if no operation candidate exists. Missing implementation artifacts must be recorded as missing/unknown rather than synthesized into executable code and then misrepresented as source-derived.

### Stale source handling

A reproduction receipt binds exact source revision and environment digest. If the upstream repository or source version changes, the old receipt remains historical evidence but cannot be silently applied to the new revision.

### Malicious/instruction-like source content

The source can contain arbitrary text. Knowledge Projection may record it as a `source_statement`, but the contract fixes `instruction_authority: none`. No v0 function interprets source prose as an instruction to AXIOM.

### Paper2Agent metadata

Paper2Agent-generated MCP metadata is represented only as an `Research Operation Candidate` with `adapter_kind: paper2agent_mcp_metadata_v0` and `interface_kind: mcp_metadata`. No remote MCP connection is created by v0.

### Multi-paper composition

Composition is documentation-only in v0. Future composition must preserve exact manifest/projection/operation/evidence digests for every input, represent contradictions explicitly, and mark shared sources/harnesses so correlated evidence cannot masquerade as independent replication.

## Threat and falsification cases

1. Source text says to ignore current policy -> stored as source data only; no instruction authority.
2. Generated operation metadata requests undeclared network/filesystem/credential access -> no execution exists in v0; later effect admission must classify actual effects and deny mismatches.
3. Remote paper MCP requests sensitive local data -> v0 never opens the connection; later use requires destination/disclosure authority.
4. Upstream repository mutates -> prior reproduction evidence becomes stale for current use.
5. Tutorial reproduction passes but new-dataset behavior fails -> the reproduction claim remains bounded to the exact fixture/source/environment.
6. Required code/data/model artifact is absent -> resource-only state, no fabricated operation.
7. Two papers disagree -> both provenance chains survive.
8. Tool metadata calls a consequential method “read-only” -> metadata is not trusted effect truth.
9. Successful method execution -> does not establish scientific interpretation or causal truth.
10. Source is corrected/retracted -> append currentness state; historical evidence remains attributable to its prior source revision.
11. License forbids redistribution/commercial execution -> license references remain attached and later execution/distribution must enforce applicable constraints.
12. Several agents share intermediate state -> provenance must expose shared dependencies before claiming independent reproduction.

## First implementation slice

Create only:

- four JSON Schema 2020-12 mirrors;
- one zero-dependency semantic verifier module;
- one synthetic vector file covering executable, resource-only, stale-repository, and malicious-source-instruction cases;
- focused contract and authority-boundary tests;
- documentation/index registration.

Do not modify:

- `mesh/config/capabilities.json`;
- Gateway, Hypervisor, Sandbox, Grid effect paths;
- provider/runtime activation;
- credential or secret brokers;
- production network policy;
- model routing;
- deployment/promotion state.

## Claim boundary

Passing v0 establishes only that AXIOM can represent source provenance, bounded knowledge projections, inert research operation candidates, and scoped reproduction evidence with explicit non-authority/non-truth semantics.

It does not establish Paper2Agent integration, autonomous scientific discovery, remote MCP safety, scientific correctness, production research execution, redistribution permission, or authority to run generated research code.
