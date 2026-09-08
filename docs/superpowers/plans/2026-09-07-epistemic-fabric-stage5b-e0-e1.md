# Epistemic Fabric Stage 5B — E0/E1 Implementation Gate Proposal

**Status:** proposed implementation gate; NOT approved; no code authority granted

**Date:** 2026-09-07

**Fresh base head:** `344ad17b0e4781c66a5103a4df67c72b93bde4ca`

**Gate branch:** `docs/epistemic-fabric-e0-e1-gate`

**Proposed implementation branch after explicit approval:** `feat/epistemic-fabric-e0-e1`

**Design:** `docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md`

**Threat model:** `docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md`

**Queue:** `docs/MASTER-TODO-EPISTEMIC-FABRIC.md`

## Gate decision requested

This document is the fresh Stage 5B E0/E1 implementation-gate proposal required by the approved Epistemic Fabric architecture.

It does **not** authorize implementation by existing on-repository presence, by Stage 5A authority, by prior design approval, or by protected-check success. Implementation authority begins only after an explicit owner approval of this gate against the exact base head and exact E0 schema bytes recorded below.

If approved, the authority is limited to the exact E0/E1 candidate envelope in this document.

## Objective

Prepare the smallest fail-closed implementation candidate for:

```text
E0: inert schemas/contracts
E1: local proposal graph for Source -> Claim -> Evidence
```

Nothing in this proposal authorizes runtime activation, public ingestion, federation, autonomous discovery, canonical promotion, or external effect execution.

## Authority boundary

Approval of this gate, if given, would authorize only development of a bounded local proposal substrate:

```text
Source -> Claim -> Evidence
```

It would not authorize:

- runtime activation;
- public ingestion;
- federation;
- canonical epistemic admission;
- assessment scoring;
- unknown/contradiction mutation;
- prediction ledgers;
- continuous feeds;
- live external model/provider access;
- cross-domain discovery;
- experiment execution;
- capability-registry changes;
- production-policy changes;
- new Gateway routes;
- network egress;
- direct Grid mutation;
- any epistemic object acquiring execution authority.

The invariant remains:

```text
knowledge may inform authority
knowledge must never silently become authority
```

## Exact implementation file envelope

If this gate is explicitly approved, the first implementation PR may add or modify only the following implementation/test files unless a fresh gate amendment is approved:

```text
mesh/config/epistemic-record-v0.schema.json
mesh/config/epistemic-source-v0.schema.json
mesh/config/epistemic-claim-v0.schema.json
mesh/config/epistemic-evidence-v0.schema.json
mesh/src/lib/epistemic-contracts.mjs
mesh/src/lib/epistemic-proposal-store.mjs
mesh/test/epistemic-contracts.test.mjs
mesh/test/epistemic-proposal-store.test.mjs
mesh/test/epistemic-authority-boundary.test.mjs
docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md
docs/MASTER-TODO-EPISTEMIC-FABRIC.md
docs/superpowers/plans/2026-09-07-epistemic-fabric-stage5b-e0-e1.md
```

The following authority-bearing surfaces are explicitly outside the candidate envelope:

```text
mesh/config/capabilities.json
production policy/action registries
Gateway route contracts
Hypervisor authority paths
Sandbox external-effect paths
Grid durable authority state
service network policy
credential/token material
provider/runtime launchers
repository-effect activation
```

Any need to touch those surfaces requires a fresh gate.

## Required reuse points

The implementation MUST reuse the current plain-data canonicalization/digest discipline from:

```text
mesh/src/lib/canonical.mjs
```

It MUST NOT introduce a second canonicalization engine.

Existing `ValidationError` semantics SHOULD be reused for fail-closed validation.

No E0/E1 module may import filesystem-network-subprocess-provider-capability-effect surfaces except narrowly necessary local filesystem primitives inside the proposal store. Those calls must be bounded to an explicitly supplied disposable/local directory; there is no ambient production path.

## Resource ceilings

The first implementation is constrained to:

| Dimension | Ceiling |
|---|---:|
| serialized epistemic object | 64 KiB |
| objects per proposal store | 1,024 |
| total deterministic export | 8 MiB |
| provenance refs per object | 64 |
| source anchors per claim | 32 |
| source/evidence refs per evidence object | 64 |
| parent source refs | 32 |
| graph traversal depth | 8 |
| proposition length | 16 KiB |
| scope/applicability string | 4 KiB |
| individual limitation string | 2 KiB |
| live model/provider calls | 0 |
| network requests | 0 |
| external effects | 0 |
| production credentials | 0 |

Unknown or missing limit information fails closed.

The proposal store must not persist acquired raw source bytes in E1. It may retain exact digests and bounded references only. Source-byte verification, when required by a fixture, occurs against caller-supplied bytes and does not convert the proposal store into an object archive.

## Revision and replay groundwork

E0/E1 remains proposal-only, but revisions must already be structurally monotonic:

- revision starts at 1;
- revision greater than 1 requires an exact prior proposal ID/content digest;
- missing prior revision fails;
- conflicting prior head fails;
- stale update fails rather than merges;
- replaying the exact same proposal may return the same deterministic object identity but MUST NOT create a second divergent revision;
- distributed replay protection is not claimed.

No field named `canonical_state` may contain anything other than `proposal` in E0/E1.

## Rollback and recovery

Rollback is deliberately simple and fail-closed:

1. E0 schema files are inert and not runtime-loaded.
2. E1 proposal-store state is local/disposable and carries no execution authority.
3. Removing the E0/E1 modules and local proposal data returns the runtime to the pre-E0/E1 state.
4. No rollback may rewrite Grid history because E0/E1 does not write Grid history.
5. No migration of production durable state is permitted.
6. If local proposal state becomes corrupt, validation fails and the store may be discarded/rebuilt from input fixtures or exported proposal records.

## Predeclared acceptance tests

The first implementation PR must demonstrate all of the following:

1. valid Source/Claim/Evidence fixtures validate deterministically;
2. key-order variations canonicalize to the same digest;
3. sparse arrays, accessors, custom prototypes, symbol keys, non-enumerable fields, unsupported numbers, and non-plain values fail under the reused canonical discipline;
4. missing source bytes cannot silently become empty bytes;
5. malformed optional evidence supplied by the caller fails rather than disappearing;
6. source anchors with invalid offsets or reversed ranges fail;
7. scope changes change the claim digest;
8. `independence_state: unknown` remains unknown and is not treated as independent;
9. `authority_effect` anything other than `none` fails;
10. `canonical_state` anything other than `proposal` fails;
11. model-generated fixture metadata is attributable to actor/run/input digest;
12. an epistemic object cannot be passed as a capability or grant;
13. no E0/E1 module mutates `mesh/config/capabilities.json`;
14. no E0/E1 module mutates production policy;
15. no E0/E1 module opens network transport;
16. no E0/E1 module invokes external-effect execution;
17. stale proposal-head updates fail;
18. object-count, object-size, export-size, ref-count, and traversal-depth ceilings fail closed;
19. deterministic export is byte-identical across repeated runs;
20. proposal-store corruption produces explicit failure, not partial acceptance.

Protected verification before merge must include the repository's current Clean Kernel and supported platform compatibility checks.

## Exact E0 schema byte contract

The four schema files below are proposed as exact UTF-8 bytes. Encoding is UTF-8, JSON is compact with no whitespace between tokens, line endings are LF, and each file has exactly one final newline. Their SHA-256 digests are normative for this gate.

If implementation requires different schema bytes, this gate must be amended before those bytes are merged.

### `mesh/config/epistemic-record-v0.schema.json`

SHA-256: `9c813d819cfdaca6702dbd0318ccac6edbbd85ea0e423b3d256ca0d61e914b68`

```json
{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:axiom:epistemic-record:v0","title":"AXIOM Epistemic Record v0","type":"object","additionalProperties":false,"required":["schema","id","object_type","schema_version","created_at","created_by","revision","content_digest","provenance_refs","canonical_state","machine_generated","authority_effect"],"properties":{"schema":{"const":"axiom-epistemic-record.v0"},"id":{"type":"string","minLength":1,"maxLength":256},"object_type":{"enum":["source","claim","evidence"]},"schema_version":{"const":"0.1.0"},"created_at":{"type":"string","format":"date-time"},"created_by":{"type":"string","minLength":1,"maxLength":256},"revision":{"type":"integer","minimum":1,"maximum":2147483647},"previous_revision":{"type":"string","minLength":1,"maxLength":256},"content_digest":{"type":"string","pattern":"^sha256:[0-9a-f]{64}$"},"provenance_refs":{"type":"array","maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"canonical_state":{"const":"proposal"},"machine_generated":{"type":"boolean"},"generation_metadata":{"type":"object","additionalProperties":false,"required":["actor_id","run_id","input_digest","generated_at","role"],"properties":{"actor_id":{"type":"string","minLength":1,"maxLength":256},"version":{"type":"string","minLength":1,"maxLength":128},"run_id":{"type":"string","minLength":1,"maxLength":256},"input_digest":{"type":"string","pattern":"^sha256:[0-9a-f]{64}$"},"generated_at":{"type":"string","format":"date-time"},"role":{"type":"string","minLength":1,"maxLength":128}}},"authority_effect":{"const":"none"}}}
```

### `mesh/config/epistemic-source-v0.schema.json`

SHA-256: `8b2289ad038726a6476819dd9056ff94e6d6a6a83d2bafb5ae9ced4ea05dd7bf`

```json
{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:axiom:epistemic-source:v0","title":"AXIOM Epistemic Source v0","allOf":[{"$ref":"urn:axiom:epistemic-record:v0"},{"type":"object","required":["source_type","retrieved_at","original_content_digest"],"properties":{"object_type":{"const":"source"},"source_type":{"enum":["paper","preprint","dataset","book","thesis","patent","report","standard","recording","webpage","archive","instrument_output","simulation","other"]},"title":{"type":"string","maxLength":1024},"authors":{"type":"array","maxItems":64,"items":{"type":"string","minLength":1,"maxLength":256}},"published_at":{"type":"string","format":"date-time"},"retrieved_at":{"type":"string","format":"date-time"},"external_identifiers":{"type":"array","maxItems":32,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":1024}},"original_content_digest":{"type":"string","pattern":"^sha256:[0-9a-f]{64}$"},"parent_source_refs":{"type":"array","maxItems":32,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"raw_artifact_ref":{"type":"string","minLength":1,"maxLength":2048}}}]}
```

### `mesh/config/epistemic-claim-v0.schema.json`

SHA-256: `0d5fab72deb1b7696339a9812a7f23e471d618d01da4c8ab654980542f2c1c47`

```json
{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:axiom:epistemic-claim:v0","title":"AXIOM Epistemic Claim v0","allOf":[{"$ref":"urn:axiom:epistemic-record:v0"},{"type":"object","required":["proposition","claim_kind","scope","source_anchors"],"properties":{"object_type":{"const":"claim"},"proposition":{"type":"string","minLength":1,"maxLength":16384},"claim_kind":{"enum":["observation_report","empirical_generalization","causal","mechanistic","interpretive","theoretical","mathematical","forecast","normative","hypothesis","speculative"]},"scope":{"type":"string","minLength":1,"maxLength":4096},"qualifiers":{"type":"array","maxItems":32,"items":{"type":"string","minLength":1,"maxLength":1024}},"assumption_refs":{"type":"array","maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"source_anchors":{"type":"array","minItems":1,"maxItems":32,"items":{"type":"object","additionalProperties":false,"required":["source_ref"],"properties":{"source_ref":{"type":"string","minLength":1,"maxLength":256},"page":{"type":"integer","minimum":1,"maximum":1000000},"section":{"type":"string","maxLength":1024},"start_offset":{"type":"integer","minimum":0,"maximum":1073741824},"end_offset":{"type":"integer","minimum":0,"maximum":1073741824},"quote_digest":{"type":"string","pattern":"^sha256:[0-9a-f]{64}$"}}}}}}]}
```

### `mesh/config/epistemic-evidence-v0.schema.json`

SHA-256: `4ff83b8362e2fe893d4058a9211f6346ec71f6749d532478face6175be11f8e1`

```json
{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:axiom:epistemic-evidence:v0","title":"AXIOM Epistemic Evidence v0","allOf":[{"$ref":"urn:axiom:epistemic-record:v0"},{"type":"object","required":["target_claim_ref","direction","evidence_type","source_refs","independence_state","applicability_scope"],"properties":{"object_type":{"const":"evidence"},"target_claim_ref":{"type":"string","minLength":1,"maxLength":256},"direction":{"enum":["supports","weakens","contradicts","discriminates","neutral"]},"evidence_type":{"enum":["direct_observation","experiment","replication","dataset","statistical_result","logical_derivation","mathematical_proof","simulation","testimony","historical_record","other"]},"source_refs":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"observation_refs":{"type":"array","maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"methodology_refs":{"type":"array","maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"independence_state":{"enum":["independent","partially_independent","dependent","unknown"]},"limitations":{"type":"array","maxItems":64,"items":{"type":"string","minLength":1,"maxLength":2048}},"applicability_scope":{"type":"string","minLength":1,"maxLength":4096}}}]}
```

## E1 implementation shape

After E0 tests are green under an approved gate:

### `mesh/src/lib/epistemic-contracts.mjs`

May:

- load the four exact schema contracts;
- expose bounded validation/build helpers;
- reuse `canonicalize`, hashing, and `ValidationError` behavior from the current kernel;
- validate source-byte digests against caller-supplied bytes;
- produce proposal-only records.

Must not:

- create capabilities;
- call Gateway;
- call Hypervisor;
- call Sandbox effects;
- mutate Grid;
- read production credentials;
- open network connections;
- launch providers/models.

### `mesh/src/lib/epistemic-proposal-store.mjs`

May:

- accept an explicit local directory;
- persist bounded proposal records/revisions;
- verify exact prior head before revision;
- export a deterministic bounded proposal snapshot.

Must not:

- become a production durable authority store;
- accept an ambient default production path;
- persist source artifact bytes;
- federate;
- infer truth;
- promote proposals to canonical state.

## Model/agent attribution boundary

The first slice uses fixture-backed machine-generation metadata only.

No live provider call is authorized.

A fixture may record:

```text
actor_id
version
run_id
input_digest
generated_at
role
```

but model output remains proposal content with zero authority effect.

## Documentation and threat-model obligations

The implementation PR must:

- update this plan with actual implementation commit evidence;
- update `docs/MASTER-TODO-EPISTEMIC-FABRIC.md`;
- update `docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md` only for real implementation deltas;
- keep `mesh/config/capabilities.json` unchanged;
- keep current project-status claims truthful: E0/E1 remains non-production, proposal-only, and not externally exposed.

## Explicitly out of scope

- canonical epistemic admission;
- assessment scoring;
- unknown/contradiction mutation;
- evidence aggregation;
- prediction scoring;
- federation;
- continuous web/source ingestion;
- live external model providers;
- cross-domain discovery;
- autonomous experiment planning/execution;
- tokenized truth or reputation markets;
- global truth scores.

## Independent gate rule

Protected CI success proves the candidate passes those checks. It does not itself approve the gate.

An explicit owner decision must state that the E0/E1 implementation gate is approved against base `344ad17b0e4781c66a5103a4df67c72b93bde4ca` and the four schema digests above before implementation begins.

## Completion condition

If approved, E0/E1 is complete only when the repository demonstrates a bounded, local, proposal-only `Source -> Claim -> Evidence` substrate whose exact bytes/provenance/revision semantics are reproducible and whose objects have structurally zero authority effect.

Until explicit approval:

```text
GATE STATUS: PROPOSED
IMPLEMENTATION AUTHORITY: NONE
```
