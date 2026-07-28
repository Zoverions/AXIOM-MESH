# M21.7 Supply-Chain Attestations Runbook

## Objective
Provide a signed SBOM + provenance bundle for every `main` push and PR, while aligning workflow controls with SLSA L3 compatibility goals.

## Scope
- Produce repository SBOM in SPDX JSON format.
- Produce provenance predicate linked to workflow identity and commit SHA.
- Keyless-sign both SBOM and provenance predicate through Sigstore/cosign.
- Emit GitHub-native build provenance attestations for the SBOM artifact.

## CI Workflow
- Workflow: `.github/workflows/supply-chain-attestations.yml`
- Trigger: push/pull_request on `main` + manual dispatch
- Required permissions:
  - `id-token: write`
  - `attestations: write`
  - `contents: read`

## Artifact Bundle
Generated in `artifacts/supply-chain/`:
- `sbom.spdx.json`
- `manifest.sha256`
- `provenance-predicate.json`
- `sbom.spdx.json.sig` + `sbom.spdx.json.pem`
- `provenance-predicate.json.sig` + `provenance-predicate.json.pem`

## Local Reproduction
```bash
./scripts/generate_supply_chain_attestations.sh
```

## Verification
```bash
cosign verify-blob \
  --certificate artifacts/supply-chain/sbom.spdx.json.pem \
  --signature artifacts/supply-chain/sbom.spdx.json.sig \
  artifacts/supply-chain/sbom.spdx.json
```

```bash
cosign verify-blob \
  --certificate artifacts/supply-chain/provenance-predicate.json.pem \
  --signature artifacts/supply-chain/provenance-predicate.json.sig \
  artifacts/supply-chain/provenance-predicate.json
```

## SLSA L3 Compatibility Controls (Target State)
This implementation establishes the control foundations required for SLSA L3 compatibility workstreams:
1. **Hosted, non-forked CI provenance path** via GitHub Actions + `actions/attest-build-provenance@v2`.
2. **OIDC-backed identity** for keyless signing and attestation emission.
3. **Immutable artifact evidence** stored as CI artifacts with detached signatures and certificates.
4. **Policy gating hook** ready: downstream release workflows can require the uploaded attestation artifact before promotion.

## Remaining hardening
- Enforce branch protection requiring this workflow.
- Add release gate validation to deny promotion when attestation bundle is missing.
- Pin all third-party GitHub Actions by full commit digest.
