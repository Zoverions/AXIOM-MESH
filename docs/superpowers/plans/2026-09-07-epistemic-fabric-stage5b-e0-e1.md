# Epistemic Fabric Stage 5B — E0/E1 Implementation Gate

**Status:** OWNER APPROVED at proposal head `9fec5a…`; implementation BLOCKED pending narrow schema-composition amendment approval

**Date:** 2026-09-08

**Original approved proposal head:** `9fec5a449811e343c4723dfb5598d860b59841dc`

**Fresh base head:** `344ad17b0e4781c66a5103a4df67c72b93bde4ca`

**Gate branch:** `docs/epistemic-fabric-e0-e1-gate`

**Implementation branch after amendment approval:** `feat/epistemic-fabric-e0-e1`

**Design:** `docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md`

**Threat model:** `docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md`

**Queue:** `docs/MASTER-TODO-EPISTEMIC-FABRIC.md`

## Gate decision

The owner explicitly approved the fresh Stage 5B E0/E1 gate against proposal head `9fec5a449811e343c4723dfb5598d860b59841dc` after that proposal passed Clean Kernel and supported-platform checks.

A pre-implementation standards review then identified one defect in the exact schema bytes: the approved base record used `additionalProperties:false`, while the specialized `Source`, `Claim`, and `Evidence` schemas composed it with `allOf`. Under JSON Schema 2020-12 semantics, the base therefore rejects the specialized fields before composition can succeed.

This is not being worked around in runtime code. Implementation remains blocked until the narrow byte amendment below is explicitly owner-approved.

The amendment changes only JSON Schema composition semantics:

1. remove `additionalProperties:false` from the extensible base record schema;
2. keep the base required/common properties unchanged;
3. compose specialized schemas with the base via `allOf`;
4. set `unevaluatedProperties:false` on each specialized schema so the final composed object remains closed;
5. keep all field names, enum values, cardinality/resource limits, authority semantics, implementation file envelope, and E0/E1 scope unchanged.

The invariant remains:

```text
knowledge may inform authority
knowledge must never silently become authority
```

## Gate 0 — exact candidate inventory

The implementation gate remains bound to base head:

```text
344ad17b0e4781c66a5103a4df67c72b93bde4ca
```

After amendment approval, the first implementation PR may add or modify only:

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

Explicitly outside the candidate envelope:

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

Any need to touch those surfaces requires a fresh gate amendment.

## Task 1 — common inert record envelope

The implementation MUST reuse the current plain-data canonicalization/digest discipline from:

```text
mesh/src/lib/canonical.mjs
```

It MUST NOT introduce a second canonicalization engine. Existing `ValidationError` semantics should be reused for fail-closed validation.

The common envelope remains proposal-only:

```text
schema
id
object_type
schema_version
created_at
created_by
revision
previous_revision?
content_digest
provenance_refs
canonical_state = proposal
machine_generated
generation_metadata?
authority_effect = none
```

No E0/E1 object may claim canonical status or effect authority.

## Task 2 — exact E0 schema byte contract — amendment A

Encoding remains UTF-8, JSON compact with no whitespace between tokens, LF line endings, and exactly one final newline. These four amended SHA-256 digests replace the originally approved digests only if the owner explicitly approves amendment A.

### `mesh/config/epistemic-record-v0.schema.json`

Amended SHA-256: `d647878abe6912d580ac60122b4a15a2ae845b411d4236630ce19a62deb0c7ae`

```json
{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:axiom:epistemic-record:v0","title":"AXIOM Epistemic Record v0","type":"object","required":["schema","id","object_type","schema_version","created_at","created_by","revision","content_digest","provenance_refs","canonical_state","machine_generated","authority_effect"],"properties":{"schema":{"const":"axiom-epistemic-record.v0"},"id":{"type":"string","minLength":1,"maxLength":256},"object_type":{"enum":["source","claim","evidence"]},"schema_version":{"const":"0.1.0"},"created_at":{"type":"string","format":"date-time"},"created_by":{"type":"string","minLength":1,"maxLength":256},"revision":{"type":"integer","minimum":1,"maximum":2147483647},"previous_revision":{"type":"string","minLength":1,"maxLength":256},"content_digest":{"type":"string","pattern":"^sha256:[0-9a-f]{64}$"},"provenance_refs":{"type":"array","maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"canonical_state":{"const":"proposal"},"machine_generated":{"type":"boolean"},"generation_metadata":{"type":"object","additionalProperties":false,"required":["actor_id","run_id","input_digest","generated_at","role"],"properties":{"actor_id":{"type":"string","minLength":1,"maxLength":256},"version":{"type":"string","minLength":1,"maxLength":128},"run_id":{"type":"string","minLength":1,"maxLength":256},"input_digest":{"type":"string","pattern":"^sha256:[0-9a-f]{64}$"},"generated_at":{"type":"string","format":"date-time"},"role":{"type":"string","minLength":1,"maxLength":128}}},"authority_effect":{"const":"none"}}}
```

### `mesh/config/epistemic-source-v0.schema.json`

Amended SHA-256: `d359eb1238eb44d573ff273aa8b89780b42b85b7e67f0f80f2a47f3eae6a3868`

```json
{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:axiom:epistemic-source:v0","title":"AXIOM Epistemic Source v0","allOf":[{"$ref":"urn:axiom:epistemic-record:v0"}],"type":"object","required":["source_type","retrieved_at","original_content_digest"],"properties":{"object_type":{"const":"source"},"source_type":{"enum":["paper","preprint","dataset","book","thesis","patent","report","standard","recording","webpage","archive","instrument_output","simulation","other"]},"title":{"type":"string","maxLength":1024},"authors":{"type":"array","maxItems":64,"items":{"type":"string","minLength":1,"maxLength":256}},"published_at":{"type":"string","format":"date-time"},"retrieved_at":{"type":"string","format":"date-time"},"external_identifiers":{"type":"array","maxItems":32,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":1024}},"original_content_digest":{"type":"string","pattern":"^sha256:[0-9a-f]{64}$"},"parent_source_refs":{"type":"array","maxItems":32,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"raw_artifact_ref":{"type":"string","minLength":1,"maxLength":2048}},"unevaluatedProperties":false}
```

### `mesh/config/epistemic-claim-v0.schema.json`

Amended SHA-256: `a7c6b20afcb223a2e48db9543d5e332bb8de9b752110d68b80582e63f02f2c87`

```json
{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:axiom:epistemic-claim:v0","title":"AXIOM Epistemic Claim v0","allOf":[{"$ref":"urn:axiom:epistemic-record:v0"}],"type":"object","required":["proposition","claim_kind","scope","source_anchors"],"properties":{"object_type":{"const":"claim"},"proposition":{"type":"string","minLength":1,"maxLength":16384},"claim_kind":{"enum":["observation_report","empirical_generalization","causal","mechanistic","interpretive","theoretical","mathematical","forecast","normative","hypothesis","speculative"]},"scope":{"type":"string","minLength":1,"maxLength":4096},"qualifiers":{"type":"array","maxItems":32,"items":{"type":"string","minLength":1,"maxLength":1024}},"assumption_refs":{"type":"array","maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"source_anchors":{"type":"array","minItems":1,"maxItems":32,"items":{"type":"object","additionalProperties":false,"required":["source_ref"],"properties":{"source_ref":{"type":"string","minLength":1,"maxLength":256},"page":{"type":"integer","minimum":1,"maximum":1000000},"section":{"type":"string","maxLength":1024},"start_offset":{"type":"integer","minimum":0,"maximum":1073741824},"end_offset":{"type":"integer","minimum":0,"maximum":1073741824},"quote_digest":{"type":"string","pattern":"^sha256:[0-9a-f]{64}$"}}}}},"unevaluatedProperties":false}
```

### `mesh/config/epistemic-evidence-v0.schema.json`

Amended SHA-256: `207ab9477334eb6654869abc9e688a7cbe40ba5065c72f349f22ede8d944d628`

```json
{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:axiom:epistemic-evidence:v0","title":"AXIOM Epistemic Evidence v0","allOf":[{"$ref":"urn:axiom:epistemic-record:v0"}],"type":"object","required":["target_claim_ref","direction","evidence_type","source_refs","independence_state","applicability_scope"],"properties":{"object_type":{"const":"evidence"},"target_claim_ref":{"type":"string","minLength":1,"maxLength":256},"direction":{"enum":["supports","weakens","contradicts","discriminates","neutral"]},"evidence_type":{"enum":["direct_observation","experiment","replication","dataset","statistical_result","logical_derivation","mathematical_proof","simulation","testimony","historical_record","other"]},"source_refs":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"observation_refs":{"type":"array","maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"methodology_refs":{"type":"array","maxItems":64,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":256}},"independence_state":{"enum":["independent","partially_independent","dependent","unknown"]},"limitations":{"type":"array","maxItems":64,"items":{"type":"string","minLength":1,"maxLength":2048}},"applicability_scope":{"type":"string","minLength":1,"maxLength":4096}},"unevaluatedProperties":false}
```

## Task 3 — bounded E1 local proposal store

After E0 tests are green under an amendment-approved gate, `mesh/src/lib/epistemic-proposal-store.mjs` may:

- accept an explicit local/disposable directory;
- persist bounded proposal records/revisions;
- verify exact prior head before revision;
- export a deterministic bounded proposal snapshot.

It must not accept an ambient production path, persist raw source artifact bytes, federate, infer truth, mutate Grid, call Gateway/Hypervisor/Sandbox effects, read production credentials, open network connections, launch providers/models, or promote proposals to canonical state.

## Task 4 — resource ceilings

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

Unknown or missing limit information fails closed. E1 stores digests and bounded references, not acquired source bytes.

## Task 5 — revision, replay, rollback, and recovery

- revision starts at 1;
- revision greater than 1 requires an exact prior proposal ID/content digest;
- missing or stale prior head fails;
- conflicting prior head fails rather than merges;
- exact replay must not create divergent revisions;
- distributed replay protection is not claimed;
- E0 schemas remain inert and runtime-unloaded;
- E1 state is local/disposable and carries no effect authority;
- no production durable-state migration is permitted;
- corrupted proposal state fails validation and may be discarded/rebuilt.

## Task 6 — predeclared negative and conformance tests

The first implementation PR must prove:

1. valid Source/Claim/Evidence fixtures validate deterministically;
2. key-order variation gives the same canonical digest;
3. sparse arrays, accessors, custom prototypes, symbol/non-enumerable state, unsupported numbers, and non-plain values fail under the reused canonical discipline;
4. missing source bytes do not silently become empty bytes;
5. malformed supplied optional evidence fails rather than disappearing;
6. invalid/reversed source-anchor offsets fail;
7. changing claim scope changes its digest;
8. `independence_state: unknown` remains unknown;
9. `authority_effect != none` fails;
10. `canonical_state != proposal` fails;
11. fixture-backed machine generation remains attributable to actor/run/input digest;
12. epistemic objects cannot be used as capabilities/grants;
13. capability registry remains unchanged;
14. production policy remains unchanged;
15. no network transport is opened;
16. no external effect is invoked;
17. stale proposal-head updates fail;
18. size/count/ref/depth ceilings fail closed;
19. deterministic export is byte-identical across repeated runs;
20. proposal-store corruption produces explicit failure.

The implementation tests must additionally prove that each specialized schema permits the base/common fields plus its own declared fields, and rejects truly unevaluated fields.

## Task 7 — model/agent attribution boundary

The first slice uses fixture-backed generation metadata only. No live provider call is authorized.

A fixture may record:

```text
actor_id
version
run_id
input_digest
generated_at
role
```

Model output remains proposal content with zero authority effect.

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

Original owner approval remains recorded but does not authorize implementation using changed bytes. Amendment A must be explicitly owner-approved because the exact schema hashes change.

No other part of the gate is reopened by this amendment.

## Completion condition

E0/E1 is complete only when the repository demonstrates a bounded, local, proposal-only `Source -> Claim -> Evidence` substrate whose bytes/provenance/revision semantics are reproducible and whose objects have structurally zero authority effect.

Until amendment A is explicitly approved:

```text
ORIGINAL GATE: OWNER APPROVED
AMENDMENT A: PROPOSED
IMPLEMENTATION AUTHORITY: BLOCKED PENDING AMENDMENT A
LATER PHASE AUTHORITY: NONE
```
