# Hypervisor Render Adapter Spike (M20.2)

Date: 2026-04-08

## Scope

This spike adds a fail-closed adapter boundary in Hypervisor for external Render GPU execution with three capabilities:

1. Job submission to an external Render-style API.
2. Signed callback ingestion for completion status.
3. Signed evidence hook generation for downstream governance/release bundles.

## Implemented Components

- `hypervisor/src/integrations_render_adapter.py`
  - `RenderAdapter.submit_job()` for outbound GPU job submission.
  - `RenderAdapter.ingest_callback()` for HMAC signature-verified callback ingestion.
  - `RenderAdapter.build_signed_evidence()` for deterministic evidence hash/signature creation.
- `hypervisor/src/api/routers/render.py`
  - `POST /api/v1/render/jobs`
  - `POST /api/v1/render/callbacks`
- `hypervisor/src/api/server.py`
  - Registers the render router.
- `hypervisor/tests/test_render_adapter.py`
  - Unit coverage for submit, callback verification, and invalid signature rejection.

## Security Notes

- Callback ingestion is fail-closed when `RENDER_CALLBACK_SIGNING_KEY` is absent.
- Invalid callback signatures are rejected before any evidence emission.
- Evidence signatures are generated from canonical JSON to support deterministic verification.

## Environment Variables

- `RENDER_API_BASE` (optional, default `https://api.render.network`)
- `RENDER_API_KEY` (required for submission)
- `RENDER_CALLBACK_SIGNING_KEY` (required for callback verification + evidence signing)

## Next Step (M20.3 dependency)

Bind the generated signed evidence envelope to ZKML attestation acceptance criteria in Grid verifier policy.
