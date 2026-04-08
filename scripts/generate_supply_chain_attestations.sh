#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_DIR="${1:-artifacts/supply-chain}"
mkdir -p "$ARTIFACT_DIR"

if ! command -v syft >/dev/null 2>&1; then
  echo "syft CLI is required (https://github.com/anchore/syft)" >&2
  exit 1
fi

SBOM_PATH="$ARTIFACT_DIR/sbom.spdx.json"
PROVENANCE_PREDICATE="$ARTIFACT_DIR/provenance-predicate.json"
MANIFEST_PATH="$ARTIFACT_DIR/manifest.sha256"

syft dir:. -o spdx-json > "$SBOM_PATH"
sha256sum "$SBOM_PATH" > "$MANIFEST_PATH"

cat > "$PROVENANCE_PREDICATE" <<JSON
{
  "buildType": "https://github.com/Attestations/GitHubActionsWorkflow@v1",
  "builder": {
    "id": "https://github.com/${GITHUB_REPOSITORY:-local}/actions/runs/${GITHUB_RUN_ID:-local}"
  },
  "invocation": {
    "configSource": {
      "uri": "git+https://github.com/${GITHUB_REPOSITORY:-local}.git",
      "digest": {
        "sha1": "${GITHUB_SHA:-unknown}"
      },
      "entryPoint": ".github/workflows/supply-chain-attestations.yml"
    }
  },
  "metadata": {
    "buildInvocationId": "${GITHUB_RUN_ID:-local}",
    "completeness": {
      "parameters": true,
      "environment": false,
      "materials": false
    },
    "reproducible": false
  },
  "subject": [
    {
      "name": "sbom.spdx.json",
      "digest": {
        "sha256": "$(sha256sum "$SBOM_PATH" | awk '{print $1}')"
      }
    }
  ]
}
JSON

echo "Generated:"
echo " - $SBOM_PATH"
echo " - $PROVENANCE_PREDICATE"
echo " - $MANIFEST_PATH"
