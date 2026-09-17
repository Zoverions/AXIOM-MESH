# Persistent Entity Bundle v0 — Design

**Status:** proposed inert contract slice under issue #1610

**Date:** 2026-09-17

**Scope:** portable semantic representation of a personal persistent entity independent of current runtime/provider, without credential or authority portability

**Authority:** `mesh/config/capabilities.json` remains authoritative. This design does not promote any capability, create a Gateway route, activate a runtime, enable machine delegation, or grant authority.

## 1. Relationship to existing architecture

This is a narrow implementation extension of:

- `docs/superpowers/specs/2026-08-29-sovereign-agent-composition-continuity-design.md`;
- `mesh/config/agent-composition-v0.schema.json`;
- `mesh/src/lib/agent-composition.mjs`;
- existing owner-bound memory, export/import, backup/recovery and receipt primitives;
- issue #1401 native-reference-agent direction;
- issue #1451 recursive delegation/currentness/budget work;
- issue #1540 verified-work and harness-provenance integration;
- issue #1610 Axiom One co-creative agent programme.

It does not replace generic AXIOM portability. Generic portability moves supported Grid records. Persistent Entity Bundle v0 defines the **portable semantic meaning of the personal entity** so continuity can survive replacement of a model, provider, host, or scaffold without treating those implementations as identity.

## 2. Core invariants

> **Persistent identity is not runtime. Runtime is not credentials. Credentials are not authority.**

> **A portable entity bundle may carry meaning and owner-private continuity material. It may not carry ambient execution permission.**

> **Import reconstructs eligible semantic state on the target. It does not recreate source-server authority.**

The bundle is intentionally inert. Validation returns evidence about the bundle and its deterministic digest only.

## 3. Goals

Persistent Entity Bundle v0 should:

1. represent a minimal, versioned semantic self above any one runtime;
2. remain deterministic and content-addressable;
3. preserve selected identity/character/personalization/runtime-policy semantics;
4. carry only explicitly portable owner-private memory/artifact references or bounded semantic records;
5. represent portable skills as disabled-by-default references;
6. support explicit source/target conflict review at higher layers;
7. reject credential, authority, server-bound identity and implementation-lock-in fields;
8. provide a stable contract that later import planning and Axiom One UX can consume;
9. remain zero-authority and zero-network-effect in this slice.

## 4. Non-goals

v0 does not:

- transfer credentials, cookies, API keys, refresh tokens, passkeys, TOTP seeds or recovery material;
- transfer standing approvals, capability grants, live sessions or delegated execution authority;
- transfer Circle/institution membership authority merely because the source entity participated there;
- activate imported skills;
- compile the self into runtime-specific prompts or model adapters;
- migrate embeddings as canonical identity;
- expose a Gateway route;
- persist anything to the Grid;
- merge source and target identity automatically;
- claim psychological or metaphysical identity proof;
- claim a production "machine person".

## 5. Contract shape

The canonical v0 document is `axiom-persistent-entity-bundle.v0`.

Top-level fields:

- `schema` — exact schema identifier;
- `version` — `0`;
- `status` — `inert-portability-contract`;
- `bundle_id` — bounded identifier;
- `entity_ref` — stable logical reference to the personal entity, not a source DB/server ID;
- `source_composition_digest` — optional digest linking the source Agent Composition contract;
- `scopes` — explicit semantic groups included in this bundle;
- `records` — ordered semantic records;
- `created_at` — canonical ISO timestamp;
- `authority_effect` — constant `none`;
- `network_effect` — constant `none`;
- `runtime_activation` — constant `false`;
- `credential_material` — constant `false`.

The validator must reject unknown top-level fields.

## 6. Initial scopes and record kinds

The v0 scope set is deliberately bounded:

- `identity`
- `character`
- `personal_model_projection`
- `runtime_policy`
- `private_memory_ref`
- `private_artifact_ref`
- `skill_ref`
- `relationship_projection`

Every record has exactly one `kind` plus its kind-specific fields. Unknown record kinds fail closed.

### 6.1 identity

Fields:

- `kind: "identity"`
- `display_name`
- `handle_intent` nullable

This is semantic display identity only. It is not a principal, credential, account, server ID, or proof of legal identity.

### 6.2 character

Fields:

- `kind: "character"`
- `text`

Human-readable user-approved character/persona/voice material. It may help preserve relationship continuity but is not canonical authority.

### 6.3 personal_model_projection

Fields:

- `kind: "personal_model_projection"`
- `projection_ref`
- `projection_digest`
- `purpose`

The bundle carries a reference/digest to an explicitly selected projection, not unrestricted private MAJIK/personal-model state. A future importer must separately prove the referenced projection is export-eligible.

### 6.4 runtime_policy

Fields:

- `kind: "runtime_policy"`
- `primary_profile_ref` nullable
- `fallback_profile_ref` nullable
- `local_preferred` boolean

Runtime preferences are configuration semantics only. They do not activate or authorize a runtime.

### 6.5 private_memory_ref

Fields:

- `kind: "private_memory_ref"`
- `memory_ref`
- `content_digest`

Only owner-private, separately export-eligible memory may later be resolved. v0 validates the reference shape and digest only; it does not access Grid state.

### 6.6 private_artifact_ref

Fields:

- `kind: "private_artifact_ref"`
- `artifact_ref`
- `content_digest`

Only owner-private, separately export-eligible artifacts may later be resolved.

### 6.7 skill_ref

Fields:

- `kind: "skill_ref"`
- `skill_ref`
- `artifact_digest`
- `disabled_by_default: true`

The constant `true` is a hard portability boundary. Import cannot silently activate a skill.

### 6.8 relationship_projection

Fields:

- `kind: "relationship_projection"`
- `relationship_ref`
- `projection_digest`
- `third_party_private_data: false`

This is an explicitly selected relationship projection with a hard v0 declaration that it contains no private third-party data. Future richer relationship portability requires a separate reviewed design.

## 7. Scope/record consistency

The bundle `scopes` set and `records` must agree:

- every record kind must appear in `scopes`;
- every declared scope must have at least one matching record;
- scopes are unique;
- record uniqueness is enforced for singleton semantic groups: `identity`, `character`, `personal_model_projection`, `runtime_policy`;
- reference kinds may contain multiple unique refs subject to bounded cardinality.

This prevents a manifest from claiming one disclosure surface while carrying another.

## 8. Forbidden field names

Defense-in-depth must reject the following field names at any depth, even if a future validator accidentally widens an allowed-key set:

- `password`
- `secret`
- `token`
- `api_key`
- `apiKey`
- `refresh_token`
- `refreshToken`
- `cookie`
- `cookies`
- `credential`
- `credentials`
- `recovery`
- `recovery_key`
- `session`
- `session_id`
- `server_id`
- `source_db_id`
- `capability`
- `capabilities`
- `standing_approval`
- `standing_approvals`
- `delegation`
- `delegations`
- `embedding`
- `embeddings`
- `filesystem_path`
- `absolute_path`

Kind-specific schema validation remains the primary boundary; the recursive forbidden-name scan is defense in depth.

## 9. Determinism and validation

The semantic validator should use the existing canonical helper and return a frozen result containing:

- `valid: true`;
- `schema`;
- `bundle_id`;
- `entity_ref`;
- `bundle_digest`;
- `record_count`;
- `authority_effect: "none"`;
- `network_effect: "none"`;
- `runtime_activation: false`;
- `credential_material: false`.

The same semantic document with different object key ordering must produce the same digest.

Validation must not mutate its input and must accept deeply frozen valid inputs.

## 10. Import boundary

This slice stops before mutation.

A later import implementation must use:

```text
parse + validate
  -> inspect scopes
  -> resolve export eligibility
  -> build deterministic import plan
  -> identify conflicts
  -> explicit conflict choices where required
  -> stage target mutations
  -> final authority/currentness checks
  -> commit
```

The presence of a valid bundle never makes any target-side mutation authorized.

## 11. Required hostile tests

At minimum test:

- valid inert bundle;
- deterministic digest across object key order;
- deeply frozen input is not mutated;
- unknown top-level field rejection;
- unknown record field rejection;
- unknown record kind rejection;
- duplicate scope rejection;
- scope/record mismatch rejection;
- duplicate singleton record rejection;
- duplicate reference rejection;
- bad digest rejection;
- non-canonical timestamp rejection;
- skill with `disabled_by_default: false` rejection;
- relationship projection with `third_party_private_data: true` rejection;
- authority/network/runtime boundary widening rejection;
- recursive credential/secret/authority field-name smuggling rejection;
- oversized record/scopes/text rejection;
- module imports only the local canonical helper.

## 12. Files for this slice

Create:

- `mesh/config/persistent-entity-bundle-v0.schema.json`
- `mesh/src/lib/persistent-entity-bundle.mjs`
- `mesh/test/persistent-entity-bundle.test.mjs`
- `mesh/test/persistent-entity-bundle-schema.test.mjs`

Do not modify in C0:

- `mesh/config/capabilities.json`
- Gateway/Hypervisor/Sandbox/Grid execution routes
- principal or credential stores
- Axiom One runtime policy
- existing generic import/export mutation logic

## 13. Promotion rule

Passing pure tests means only that the inert contract validator is implemented. Any later status/capability promotion requires separately reviewed evidence that a real safe user-facing path exists.
