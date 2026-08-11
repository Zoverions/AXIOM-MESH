# Education Learner-Record Provider Foundation

## Status

This document describes an **adapter foundation only**. `domains.education` remains `adapter_required`, no education provider is configured by default, and the existing education domain entry point continues to fail closed with `capability_unavailable` until a reviewed adapter is deliberately wired.

The first provider slice covers only:

- `education.learner.event.append`;
- `education.learner.progress.read`.

Curriculum and tutoring providers remain separate later adapters.

## Why this is a provider instead of a second education database

AXIOM already owns the lower-level authority and evidence primitives needed by education:

- subject/identity context;
- consent receipts and revocation semantics;
- content-addressed encrypted memory objects;
- evidence chains;
- policy and capability admission;
- Gateway intent transport.

The education adapter therefore must not create parallel identity, consent, or raw-content authority. It receives references and validated context from the kernel and projects education-specific event/read semantics over those existing primitives.

## Provider contract

`mesh/config/domain-providers/education-learner-record.v1.json` defines the narrow provider boundary.

A runtime provider must expose:

- `assertConsent(...)` — kernel/deployment-owned consent assertion;
- `assertMemoryReference(...)` — kernel/deployment-owned verification that the referenced governed memory object is valid for the subject/purpose/consent binding;
- `appendEvent(...)` — adapter-specific learner-event indexing/persistence after those authority checks pass;
- `readProgress(...)` — adapter-specific read of bounded learner-event projections.

Installing or constructing a provider grants none of those authorities by itself.

## Append ordering

`executeEducationLearnerRecordAction('education.learner.event.append', ...)` enforces:

1. pinned `axiom.education` domain-contract validation;
2. exact consent purpose and data-scope assertion;
3. exact governed memory-reference assertion;
4. adapter append call;
5. result binding back to the same subject, event, payload digest, and memory object;
6. deterministic result digest.

If consent or memory-reference validation fails, the mutation adapter is never called.

The provider result may contain only bounded record metadata. It may not return raw student work, raw educator feedback, mastery, grades, credits, or transcript state.

## Progress read ordering

`education.learner.progress.read` enforces:

1. pinned domain-contract validation;
2. `learning-progress-review` consent assertion with read scope;
3. adapter read;
4. bounded result validation.

Progress output is a list of event references and workflow metadata, not an inferred learner-state verdict. The provider contract does not authorize automatic mastery, grading, credit, or transcript interpretation.

## Memory boundary

`memory_object_id` is reference-only at the education provider seam. The provider boundary does not read or decrypt learner work itself and does not treat possession of an object ID as authority.

A later deployment adapter must bind `assertMemoryReference` to the existing Grid/memory and consent/evidence machinery. That integration is a separate promotion gate and must preserve revocation/deletion behavior.

## Default failure behavior

If no provider is supplied, `executeEducationLearnerRecordAction(...)` delegates to the existing education-domain unavailable result. The result remains:

- HTTP 503;
- `capability_unavailable`;
- provider capability `education.learner-record`;
- capability status `adapter_required`.

This foundation does not alter `mesh/config/capabilities.json` and does not enable education policy.

## Promotion gates

Before `domains.education` or an education learner-record capability can be promoted, at minimum:

1. bind consent assertion to the real kernel/deployment consent authority;
2. bind memory-reference assertion to the encrypted content-addressed memory/evidence path;
3. implement append/read persistence with replay/idempotency and revocation semantics;
4. exercise the provider through Hypervisor/Gateway admission rather than direct unit-only invocation;
5. run cross-repository contract tests against Axiom Education’s governed learner-event client;
6. threat-model minor data, deletion/revocation, cross-subject substitution, stale consent, and provider compromise;
7. keep grades/credits/transcripts outside this provider unless a separately governed educational-authority protocol is designed and reviewed.
