# Sovereign Information, Evidence, and Authority — Slice 2 Implementation Plan

**Date:** 2026-09-03
**Status:** implementation plan
**Parent design:** `docs/superpowers/specs/2026-09-03-sovereign-information-evidence-authority-design.md`
**Dependency:** Slice 1 head `e1a2c573d6cefb8cf55e45be26d03e440124cc87` / PR #1484
**Branch:** `feat/sovereign-information-grid-state`

## Goal

Implement the approved **Slice 2 — governed Grid state** without promoting any new user-facing or regulated-domain capability.

The slice must provide real encrypted/restart-safe Grid durability for the Slice 1 semantic objects while preserving the existing signed hash-linked event log as the authoritative mutation history.

It must add:

1. append-only event-backed persistence for information-rights envelopes, evidence assertions, evidence links, evidence review states, and delegated gate mandates;
2. transactional signed mutation receipts through the existing Grid event chain;
3. bounded expiry and irreversible revocation semantics where applicable;
4. fail-closed retrieval requiring an exact, separately produced information-access decision rather than deriving permission from identity, subject status, authorship, reputation, role, or risk;
5. minimized subject/institution views that reveal only records for which an exact read decision is supplied and never leak the existence of denied records through list metadata;
6. export/import preservation of relationship and evidence semantics without converting imported records into authority;
7. restart/rebuild, encryption, tamper, migration, and no-promotion verification.

## Non-goals

Slice 2 MUST NOT:

- create a new Gateway route;
- alter `mesh/config/capabilities.json`;
- expose Health, Justice, Education, Work/Payroll, Finance, or Government production functionality;
- interpret subject/originator/custodian/controller relationships as automatic read authority;
- create a universal `owner` shortcut;
- make a credential, reputation value, role, risk assessment, review state, or imported record an execution grant;
- add external providers, network egress, regulated data, or a public API;
- implement contextual reputation scoring or privacy collective-intelligence cryptography;
- weaken current independent approval requirements for existing executable high-risk effects.

## Architectural choice

Use a deliberately unpromoted `SovereignInformationGridStore` subclass of the supported `GridStore`.

The subclass gives Slice 2 real use of:

- SQLite WAL + `synchronous=FULL`;
- the existing core Grid schema and an independently checksummed SIEA extension-migration ledger;
- encrypted protected JSON columns;
- `appendEvents()` transactional writes;
- signed hash-linked event receipts;
- startup chain verification;
- materialized-state rebuild;
- existing export/import verification primitives;
- existing backup/recovery behavior inherited from Grid.

The supported runtime continues to instantiate its current `GridStore`; the new subclass is test/research infrastructure until a later explicit promotion.

### Layered migration correction

Implementation verification established that optional Grid subsystems must not advance the ordinary core `schema_version`. Existing social storage already follows this rule through its own extension migration ledger, and multiple core/social compatibility tests require ordinary `GridStore` to remain at core schema 10.

Therefore Slice 2 uses a separate `sovereign_information_schema_migrations` ledger with SIEA schema version 1. The core `mesh/src/grid/migrations.mjs` remains unchanged from the Slice 1 parent/current `main`. This preserves the no-promotion boundary while retaining checksum-verified migration and restart behavior for the SIEA subclass.

## Storage model

Add SIEA extension migration **v1** with materialized tables only. The authoritative history remains the immutable Grid event chain. Core Grid remains schema **10**.

### `siea_objects`

A single materialized object table avoids duplicating authority semantics across separate tables.

Columns:

- `storage_id TEXT PRIMARY KEY` — opaque local storage identifier;
- `object_kind TEXT NOT NULL` — bounded enum (`information-rights`, `evidence-assertion`, `evidence-link`, `evidence-review`, `delegated-gate-mandate`);
- `object_json TEXT NOT NULL` — encrypted canonical object;
- `object_digest TEXT NOT NULL` — integrity/equality check for the canonical object, not an authority claim;
- `lifecycle_status TEXT NOT NULL` — `active|revoked|expired|superseded` as applicable;
- `created_at TEXT NOT NULL`;
- `updated_at TEXT NOT NULL`.

Do **not** persist subject/controller/requester principal references in plaintext index columns. Relationship queries in this unpromoted slice may scan/decrypt a bounded local result set. This trades scale for metadata minimization until a reviewed privacy-preserving index exists.

### Why materialized rows may update

The Grid event chain is append-only. Materialized state may change because it is a rebuildable projection of that immutable chain, matching existing Grid design.

## Event kinds

Add exact supported materialization events:

- `siea.information-rights.recorded`
- `siea.evidence-assertion.recorded`
- `siea.evidence-link.recorded`
- `siea.evidence-review.recorded`
- `siea.delegated-mandate.recorded`
- `siea.delegated-mandate.revoked`

Every event payload must validate the Slice 1 object before insertion/materialization.

Newly recorded SIEA objects must begin with lifecycle state `active`; revocation, expiry, or supersession cannot be forged into an initial recorded event. Lifecycle contraction is represented through its specific append-only transition semantics.

No event kind may contain an effect/capability/Sandbox grant.

## Access-decision boundary

Slice 2 needs exact read authorization but MUST NOT invent authority from relationships.

Introduce a pure `InformationAccessDecision` contract used only to *consume* a decision made by a separately authorized policy layer.

Required fields:

- schema/version;
- decision id;
- requester principal;
- object reference;
- exact purpose;
- requested information right (`inspect-metadata|inspect-full-content|receive-projection|export` for this slice);
- decision `allow|deny|uncertain`;
- authority/policy reference;
- envelope/object digest binding;
- issued-at and expiry;
- verifier reference/version;
- reason codes.

The store does not create this decision and does not treat a bare authority-ref string as sufficient. A constructor-injected verifier validates authenticity/currentness. **No verifier means fail closed.**

The retrieval method checks the decision binds exactly to requester, target object, purpose, requested right, and current object digest, and that it is `allow`, has become effective, and is unexpired.

This separates:

`relationship → policy input`

from:

`verified access decision → bounded read`

and prevents `subject == owner == read-all` logic.

## Retrieval/view privacy

Single-object read:

- unknown object with an otherwise well-formed decision and denied/unverifiable object must return the same public not-found/unauthorized class where practical;
- no list method returns counts of denied records;
- subject/institution views accept a bounded array of verified access decisions and return only allowed objects;
- `truncated` refers only to the authorized result set and must not reveal the number of hidden objects;
- view metadata excludes unrelated relationships unless the caller has `inspect-full-content`; metadata projections are explicitly defined.

## Revocation and expiry

### Delegated mandates

- revocation is append-only via `siea.delegated-mandate.revoked`;
- a revoked mandate can never be returned to active under the same `mandate_id`;
- duplicate revocation is idempotent only when the revocation state is byte-equivalent, otherwise conflict;
- a revocation timestamp cannot be later than the signed Grid event that records it;
- effective state is expired when `expires_at <= now` even if the materialized row was stored active;
- expired/revoked mandates are never considered valid gate authority.

### Other objects

Evidence assertions/links are immutable records. Corrections/supersession are represented through new evidence nodes/links rather than destructive mutation.

Evidence review state is a mutable materialized projection with append-only review events.

Information-rights envelopes may be superseded only by a new validated envelope event; the prior event remains in the Grid chain.

## Export/import

Add a Slice 2-specific export/import layer on `SovereignInformationGridStore` rather than changing current Gateway export routes.

### Export

- requires exact `export` access decisions per exported object;
- emits canonical records with object kind, full validated object, digest, lifecycle status, and provenance event references;
- includes explicit non-claims: export does not grant authority and does not establish truth;
- never includes denied-object counts or identifiers;
- supports recipient encryption only through inherited existing mechanisms when later wired to the supported export surface.

### Import

- validates bundle integrity and every SIEA object contract before staging;
- imported evidence/provenance remains evidence, not truth;
- imported mandates default to non-active/unusable unless a later local-authority transition separately admits them;
- imported access decisions are never trusted as local authority;
- dry-run reports `new|duplicate|conflict|non-authoritative` without exposing unrelated local records;
- apply is transactional and append-events-backed.

## Implementation tasks

### Task 1 — access-decision contract

**Create:**
- `mesh/src/domain/information-access-decision.mjs`
- `mesh/test/information-access-decision.test.mjs`

TDD requirements:

- strict schema/unknown-field rejection;
- exact enums;
- canonical timestamps;
- exact object/digest binding;
- `deny` and `uncertain` cannot be consumed as reads;
- future-issued decisions cannot be consumed before `issued_at`;
- no execution-authority fields;
- verifier callback required by consuming store APIs.

Commit: `feat: add bounded information access decisions`

### Task 2 — layered SIEA migration and protected storage

**Create:**
- `mesh/src/grid/sovereign-information-migrations.mjs`
- `mesh/test/sovereign-information-grid-migration.test.mjs`

**Do not modify for promotion:**
- core `mesh/src/grid/migrations.mjs` must remain at schema 10 and must not create SIEA tables for ordinary `GridStore`.

Requirements:

- SIEA extension migration v1 `sovereign-information-materialized-state`;
- independent checksum-verified `sovereign_information_schema_migrations` ledger;
- encrypted `object_json` migration/restart handling in the SIEA subclass;
- no plaintext relationship/principal indexes;
- ordinary Grid and social stores retain their existing core schema expectations;
- wrong-key/tamper behavior inherited and exercised.

Commit: `feat: layer sovereign information schema`

### Task 3 — unpromoted Grid subclass + event materialization

**Create:**
- `mesh/src/grid/sovereign-information-store.mjs`
- `mesh/test/sovereign-information-grid-store.test.mjs`

Requirements:

- subclass current supported `GridStore`;
- extension schema initializes only for the SIEA subclass;
- preflight exact SIEA event kinds;
- validate Slice 1 objects before append;
- newly recorded objects begin active;
- materialize only through `appendEvents()` transaction;
- return existing signed Grid event envelope as mutation receipt;
- duplicate/conflicting immutable IDs fail closed;
- no direct mutation path bypassing the event chain.

Commit: `feat: persist sovereign information through Grid evidence`

### Task 4 — evidence and rights lifecycle invariants

Extend store tests to prove:

- evidence assertions/links are immutable;
- contradiction/challenge links survive restart rebuild;
- evidence review updates append new events and never rewrite prior event bytes;
- information-rights replacement preserves prior event history;
- subject/originator status alone still cannot read full content.

Commit: `test: harden sovereign information lifecycle invariants`

### Task 5 — mandate expiry/revocation

Add methods:

- `recordDelegatedGateMandate()`
- `revokeDelegatedGateMandate()`
- `getDelegatedGateMandateEffectiveState()`

Tests:

- active before expiry;
- expired after expiry;
- revoked immediately;
- future-dated revocation fails closed relative to the signed event time;
- no un-revoke under same ID;
- replay/idempotence behavior bounded;
- revocation event and materialized state commit atomically.

Commit: `feat: add durable mandate revocation and expiry`

### Task 6 — exact authority-checked retrieval

Add bounded methods:

- `readSovereignInformationObject()`
- `listAuthorizedSovereignInformation()`

Tests:

- no verifier => fail closed;
- bad signature/currentness from verifier => fail closed;
- correct decision but wrong requester/object/purpose/right/digest => fail closed;
- future-issued, expired, `deny`, or `uncertain` decision => no disclosure;
- hidden objects do not affect returned counts/truncation;
- metadata-only decisions do not leak full relationship/body data;
- full-content decision returns only exact target.

Commit: `feat: enforce exact sovereign information reads`

### Task 7 — Slice 2 export

**Create:**
- `mesh/src/lib/sovereign-information-portability.mjs`
- `mesh/test/sovereign-information-portability.test.mjs`

Requirements:

- canonical bundle format;
- exact per-object `export` decision;
- relationship/evidence semantics preserved;
- no denied-object existence leakage;
- non-claims included;
- deterministic digest.

Commit: `feat: export sovereign information without authority transfer`

### Task 8 — staged import and local non-authority

Extend portability/store:

- validate-only/dry-run;
- duplicate/conflict detection;
- imported mandates marked `non-authoritative-import` and unusable;
- imported access decisions ignored/rejected;
- imported evidence never gains truth flag;
- apply through signed Grid events transactionally.

Commit: `feat: stage sovereign information imports safely`

### Task 9 — restart, tamper, encryption, and metadata tests

**Create:**
- `mesh/test/sovereign-information-grid-adversarial.test.mjs`

Cover:

- restart rebuild equality;
- altered event payload detected by chain verification;
- protected object JSON is not plaintext in SQLite;
- no subject/controller/principal relationship value appears in unprotected SIEA columns;
- revoked/expired mandate remains unusable after restart;
- contradictory evidence remains retrievable after rebuild;
- access-decision mismatch does not reveal object existence;
- forged initial revoked/expired/superseded recorded state fails closed.

Commit: `test: adversarially verify sovereign information Grid state`

### Task 10 — canonical documentation and non-promotion checks

**Modify:**
- `mesh/src/check-docs.mjs`
- `docs/rebuild/REQUIREMENTS.md` only if acceptance evidence needs precise Slice 2 wording; do not change doctrine;

**Create/modify tests:**
- `mesh/test/sovereign-information-doc-registration.test.mjs`
- `mesh/test/sovereign-information-grid-nonpromotion.test.mjs`

Register this plan as canonical documentation.

Verify:

- `mesh/config/capabilities.json` unchanged from parent Slice 1 head;
- no Gateway route added;
- no provider/network call in new modules;
- new store subclass is not current runtime default;
- core Grid migration bytes remain unchanged from the parent/current supported state;
- current high-risk executable approval remains unchanged.

Commit: `docs: register governed sovereign information Grid state`

### Task 11 — focused and full verification

Run at minimum:

```bash
cd mesh
node --test \
  test/information-access-decision.test.mjs \
  test/sovereign-information-grid-migration.test.mjs \
  test/sovereign-information-grid-store.test.mjs \
  test/sovereign-information-portability.test.mjs \
  test/sovereign-information-grid-adversarial.test.mjs \
  test/sovereign-information-invariants.test.mjs \
  test/sovereign-information-grid-nonpromotion.test.mjs
```

Then run the repository's full Clean Kernel/Windows/macOS CI on the exact head.

No readiness/merge claim until all applicable checks are green.

## Promotion boundary

Passing Slice 2 means only:

> AXIOM has an unpromoted, test-evidenced Grid persistence layer for sovereign information/evidence/mandate semantics with exact separately-verified access decisions and safe portability behavior.

It does **not** mean:

- regulated-domain deployment is supported;
- a new production API exists;
- imported evidence is true;
- subject data is universally accessible to the subject;
- delegated agents have new external effect authority;
- privacy-preserving collective intelligence is production-ready;
- contextual reputation is implemented;
- the current executable approval model has been replaced.

## Stacked-branch integration rule

This branch deliberately starts from Slice 1 head because Slice 2 imports Slice 1 contracts.

Until PR #1484 merges:

- keep Slice 2 as a stacked/draft PR targeting `design/sovereign-information-evidence-authority`;
- do not duplicate Slice 1 changes;
- after #1484 merges, retarget/rebase the Slice 2 PR to current `main` and rerun all required verification before readiness or merge.
