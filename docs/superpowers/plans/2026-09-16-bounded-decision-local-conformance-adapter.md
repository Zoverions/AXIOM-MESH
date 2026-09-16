# Bounded Decision Intelligence v0 — Slice B Execution Notes

**Status:** owner approved by continuation instruction on 2026-09-16.

**Scope:** implement the design's Slice B local conformance adapter only. The adapter consumes provider-specific local/fixture payloads and normalizes them through the existing Slice A observation contract. It performs no provider invocation, network access, credential access, runtime activation, capability widening, policy mutation, or `axiom-plan.v1` change.

## First conformance target

The first closed adapter kind is `typesafe-system-one-v0.6.0`, pinned to the public `@typesafe-ai/sdk` 0.6.0 `SystemOneResult` response shape:

- Choice: `type`, `choice`, `confidence`, `probabilities`
- Score: `type`, `score`, `confidence`, `legend`, `probabilities`
- Noul: `type`, `noul`
- Request result metadata: `model`, `answers`, `usage.input_tokens`, `usage.output_tokens`

The production adapter does not import or depend on the TypeSafe SDK. The SDK source is external evidence used to define deterministic local fixtures only.

## TDD sequence

1. RED: add local conformance tests before the production module.
2. GREEN: implement the minimal adapter that maps TypeSafe-shaped fixtures into `normalizeBoundedDecisionProviderResult()`.
3. HARDEN: reject model/revision drift, unknown payload fields, question-kind drift, malformed distributions, rubric/legend drift, invalid usage, and input mutation.
4. INERTNESS: verify the adapter imports no effectful network, credential, filesystem, subprocess, payment, Grid, or capability-issuance surfaces.
5. VERIFY: run the Slice B tests, then the full bounded-decision suite and normal repository CI.
6. CLEANUP: remove temporary Slice B TDD workflow before final review.
