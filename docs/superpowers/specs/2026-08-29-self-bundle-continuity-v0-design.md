# Self Bundle Index v0 and Continuity Report v0 Design

**Status:** approved design for an inert contract laboratory; no runtime activation or capability promotion

**Created:** 2026-08-29

**Builds on:**

- `docs/superpowers/specs/2026-08-29-sovereign-agent-composition-continuity-design.md`
- `docs/architecture/PERSONAL-AGENT-PACK-V2-AND-COMPANION-CONTINUITY.md`
- `mesh/src/lib/agent-composition.mjs`
- `mesh/src/lib/personal-agent-pack-v2.mjs`
- `mesh/src/lib/personal-agent-pack-v2-restore.mjs`

## Purpose

Self Bundle Index v0 defines a small, content-addressed lineage object that identifies the durable configuration of a sovereign agent without duplicating the data, authority, or recovery responsibilities already owned by Agent Composition, Personal Agent Pack v2, Sovereign Vaults, semantic-state artifacts, or the Mesh authority path.

Continuity Report v0 is a pure diagnostic comparison over supplied Self Bundle objects and supplied observations. It reports continuity dimensions and an aggregate `full`, `degraded`, or `blocked` state without asserting consciousness, philosophical personal identity, subjective continuity, or equivalence between model families.

The core rule is:

> The AXIOM principal is the stable identity root. A Self Bundle records a versioned configuration lineage around that principal; it does not become an authority token, memory store, model checkpoint, vault, or legal identity credential.

## Architectural placement

```text
AXIOM principal
      |
      +-- Self Bundle Index lineage
              |
              +-- Agent Composition ref + digest
              +-- Personal Agent Pack v2 ref + digest
              +-- bounded semantic-state refs + digests

Continuity Report v0
      = pure comparison over exact supplied objects/observations
```

Agent Composition v0 already reserves the required `self_bundle {ref,digest}` position. Self Bundle v0 defines the referenced object's own contract without changing Agent Composition v0.

Personal Agent Pack v2 remains a portability/recovery manifest. It is not expanded into a universal self object.

## Self Bundle Index v0 contract

Schema identifier: `axiom-self-bundle-index.v0`.

Required fields:

- `schema`: exact schema identifier;
- `version`: `0`;
- `status`: `inert-contract-laboratory`;
- `bundle_id`: bounded AXIOM identifier;
- `principal_id`: bounded AXIOM principal identifier;
- `created_at`: canonical ISO timestamp;
- `predecessor_bundle`: `null` for a root bundle or an exact `{ref,digest}` pair;
- `agent_composition`: exact `{ref,digest}` pair;
- `personal_agent_pack`: exact `{ref,digest}` pair;
- `semantic_state`: bounded list of semantic-state entries;
- `contains_secret_material`: exact `false`;
- `authority_effect`: exact `none`;
- `network_effect`: exact `none`;
- `runtime_activation`: exact `false`.

Each semantic-state entry contains:

- `claim_id`;
- `ref`;
- `digest`;
- `required_for_continuity`.

The list is bounded at 256 entries and `claim_id` values must be unique. The validator computes a deterministic canonical digest but must not mutate the input.

## Explicit exclusions

Self Bundle v0 MUST NOT contain:

- raw memories or raw vault content;
- passwords, API keys, cookies, refresh tokens, provider sessions, private keys, recovery secrets, or payment credentials;
- model weights or adapter blobs;
- executable runtime code;
- ambient permissions, capability tokens, access leases, or execution grants.

All references are names plus exact digests. Possession of a bundle grants no access to the referenced objects.

## Lineage semantics

A root bundle has `predecessor_bundle: null`.

A successor bundle names and hashes its exact predecessor. The lineage therefore remains explicit and content-addressed. A successor may change model, runtime, memory provider, Pack contents, or semantic-state references without automatically becoming a different principal.

A claimed successor is blocked when:

- `principal_id` differs from the predecessor;
- the successor omits or changes the expected predecessor reference;
- the successor's predecessor digest does not equal the supplied predecessor's canonical digest.

A root bundle compared against another root bundle does not establish successor continuity and is reported as blocked for migration/lineage purposes.

## Continuity observations

Continuity Report v0 accepts supplied observations rather than opening files or performing network access.

Observation schema is a bounded list of objects:

```json
{
  "ref": "artifact.ref",
  "available": true,
  "observed_digest": "<sha256>"
}
```

For unavailable observations, `observed_digest` must be absent. Duplicate refs fail closed.

The report treats an omitted observation as `unassessed`, not as proof of absence or presence.

## Continuity dimensions

### Principal continuity

- `retained`: predecessor and successor have the same principal.
- `blocked`: different principals.

Principal mismatch blocks the aggregate report.

### Lineage continuity

- `retained`: successor points to the exact supplied predecessor ref and canonical digest.
- `blocked`: predecessor reference/digest is absent, changed, or invalid for the supplied predecessor.

Lineage mismatch blocks the aggregate report.

### Composition continuity

The report compares the Self Bundle's exact `agent_composition` ref/digest pair between predecessor and successor:

- `retained`: unchanged;
- `changed`: exact ref or digest changed.

A composition change is diagnostic and degrades aggregate continuity; it does not imply identity loss.

### Portable-state continuity

The report compares the exact `personal_agent_pack` ref/digest pair and its supplied observation:

- `retained`: predecessor/successor pack reference is unchanged and a supplied observation digest matches;
- `changed`: predecessor/successor Pack reference changed but the successor artifact is observed with a matching digest;
- `missing`: successor Pack observation explicitly reports unavailable;
- `digest-mismatch`: successor Pack observation is available with a different digest;
- `unassessed`: no observation was supplied for the successor Pack.

`missing` or `digest-mismatch` blocks continuity. `changed` or `unassessed` degrades continuity.

The report does not invoke the existing Pack restore planner in v0 because Self Bundle v0 receives only a Pack reference and digest, not the full Pack document and environment required by that planner. Future callers may compose the Self Bundle report with a separately generated Pack restore plan.

### Semantic continuity

For every successor semantic-state entry:

- exact observation digest match => retained;
- unavailable => missing;
- available with wrong digest => digest-mismatch;
- no observation => unassessed.

The report also compares predecessor/successor claim IDs to identify added, removed, retained, and changed semantic claims.

A missing or digest-mismatched successor semantic-state entry with `required_for_continuity: true` blocks continuity.

Optional missing/mismatched entries, unassessed required entries, added claims, removed claims, or changed claim digests degrade continuity.

### Model/runtime affinity

Self Bundle v0 does not inspect model/runtime internals. Those remain in Agent Composition. A changed composition is therefore reported as change, not as identity failure. Model- or runtime-specific evaluation belongs to later continuity benchmark work.

### Evidence completeness

- `full`: all successor Pack and semantic-state references relevant to v0 have matching observations;
- `degraded`: at least one successor reference is unassessed;
- `blocked`: an explicitly observed required reference is missing or digest-mismatched.

## Aggregate status

The report aggregate is one of:

- `blocked`: any hard blocker exists;
- `degraded`: no blockers exist, but one or more diagnostic dimensions changed or remain unassessed;
- `full`: principal and lineage are retained, composition and Pack reference are retained, all successor artifact observations match, and semantic-state comparison contains no additions/removals/changes.

No percentage, probability, or subjective identity score is produced in v0.

## Report output

Schema identifier: `axiom-continuity-report.v0`.

The report includes:

- predecessor and successor bundle IDs/digests;
- `continuity_status`;
- sorted `blockers` and `warnings`;
- structured dimension results for principal, lineage, composition, portable state, semantic state, and evidence completeness;
- an `authority_boundary` object declaring no file writes, network effects, vault access, execution authority, artifact substitution, or subjective identity proof;
- deterministic `report_digest` over the unsigned report.

The report is deeply frozen before return.

## Security and authority boundary

Both the validator and report builder are pure library functions.

They MUST NOT:

- read files;
- write files;
- access the network;
- open or decrypt vaults;
- activate runtimes;
- load models;
- issue or refresh credentials;
- grant vault access;
- grant execution authority;
- substitute missing artifacts;
- modify capability-registry state.

Historical authority is never inherited from a predecessor bundle.

## Non-claims

This slice does not claim:

- philosophical or subjective personal identity;
- consciousness continuity;
- cross-model behavioral equivalence;
- cryptographic signature verification beyond canonical digest comparison;
- Pack restore readiness;
- semantic truth of referenced claims;
- runtime activation;
- migration execution;
- production promotion;
- autonomous self-modification.

## Files introduced

- `mesh/config/self-bundle-index-v0.schema.json`
- `mesh/src/lib/self-bundle-index.mjs`
- `mesh/src/lib/continuity-report.mjs`
- `mesh/test/self-bundle-index.test.mjs`
- `mesh/test/self-bundle-index-schema.test.mjs`
- `mesh/test/continuity-report.test.mjs`

No capability registry entry changes in this slice.
