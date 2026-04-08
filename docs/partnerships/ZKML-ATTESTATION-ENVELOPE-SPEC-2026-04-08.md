# ZKML Attestation Envelope Specification (M20.3)

Date: 2026-04-08  
Owner: @agent

## Purpose

Define a canonical, signed attestation envelope for third-party compute outputs (for example Render GPU jobs) so Grid can deterministically accept/reject proofs under fail-closed policy.

## Scope

- Applies to external inference/training jobs whose outputs are consumed by AXIOM-MESH services.
- Covers payload shape, signing, hashing, replay protection, and Grid verifier policy criteria.
- Does not replace existing zkML proof format in `types.ZKMLPayload`; instead, this wraps provenance + integrity metadata around it.

## Canonical Envelope (v1)

```json
{
  "schema_version": "zkml_attestation_envelope.v1",
  "attestation_id": "uuid-v4",
  "job": {
    "provider": "render",
    "provider_job_id": "rdr_12345",
    "workflow": "inference",
    "model_commitment": "0x...",
    "input_hash": "sha256:...",
    "output_hash": "sha256:...",
    "started_at": "2026-04-08T12:00:00Z",
    "completed_at": "2026-04-08T12:00:42Z"
  },
  "zkml": {
    "proof_hash": "sha256:...",
    "vk_hash": "sha256:...",
    "settings_hash": "sha256:...",
    "public_outputs_hash": "sha256:..."
  },
  "runtime": {
    "executor_image_digest": "sha256:...",
    "hardware_class": "gpu-a100-80gb",
    "tee_quote_hash": "sha256:...",
    "dependency_sbom_hash": "sha256:..."
  },
  "evidence": {
    "callback_payload_hash": "sha256:...",
    "evidence_hash": "sha256:...",
    "evidence_signature": "hex-hmac-or-sig",
    "signing_key_id": "render-callback-key-2026q2"
  },
  "policy": {
    "risk_class": "high",
    "required_approvals": 2,
    "fleet_scope": "global/render",
    "max_clock_skew_seconds": 300,
    "ttl_seconds": 3600
  }
}
```

## Normalization Rules

1. Envelope serialization MUST use canonical JSON (sorted keys, UTF-8, no insignificant whitespace).
2. All hashes MUST be `sha256:<hex>`.
3. `attestation_id` MUST be globally unique UUIDv4.
4. `completed_at` MUST be greater than `started_at`.
5. `provider_job_id` MUST be bound into hash input for replay resistance.
6. `evidence_hash` MUST be computed over canonical JSON of the envelope excluding `evidence_signature`.

## Signature and Trust Chain

- `evidence_signature` MUST verify against trusted provider key material mapped by `signing_key_id`.
- Initial trust anchors are maintained in Grid policy config (`render-callback-key-2026q2` etc.) and rotated quarterly.
- Missing/unknown `signing_key_id` => hard reject.
- Signature mismatch => hard reject.

## Grid Verifier Acceptance Criteria

Grid accepts an envelope only if all checks pass:

1. **Schema check**: required fields exist and type checks pass.
2. **Temporal check**: now <= `completed_at + ttl_seconds` and clock skew <= `max_clock_skew_seconds`.
3. **Integrity check**: hash format/length valid and recomputed `evidence_hash` matches.
4. **Signature check**: `evidence_signature` verifies against trusted key id.
5. **Proof binding check**: `zkml.proof_hash`, `zkml.vk_hash`, `zkml.settings_hash`, and `job.model_commitment` match submitted Grid zkML payload.
6. **Runtime policy check**: `hardware_class` and optional `tee_quote_hash` satisfy route policy for `risk_class`.
7. **Governance check**: if `risk_class=high` or `required_approvals>0`, approval trace must be present before downstream execution release.

## Rejection Taxonomy (for deterministic logging)

- `E_SCHEMA_INVALID`
- `E_STALE_ATTESTATION`
- `E_CLOCK_SKEW_EXCEEDED`
- `E_HASH_MISMATCH`
- `E_SIGNATURE_INVALID`
- `E_SIGNING_KEY_UNTRUSTED`
- `E_ZKML_BINDING_MISMATCH`
- `E_RUNTIME_POLICY_VIOLATION`
- `E_APPROVAL_TRACE_MISSING`

Each rejection emits immutable audit event with: `attestation_id`, `provider_job_id`, error code, timestamp, and verifier node id.

## Integration Notes

- Hypervisor Render adapter evidence payload (`build_signed_evidence`) should be extended to produce this envelope directly.
- Grid verifier should evaluate this envelope before invoking expensive zk proof verification where possible.
- Verification order should be cheap-first: schema -> time -> signature -> binding -> zk verification.

## Deliverables

1. Canonical envelope doc (this file).
2. Grid verifier acceptance/rejection criteria (this file, sections above).
3. Deterministic rejection code list for governance/audit pipelines.

