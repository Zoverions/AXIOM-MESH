#!/usr/bin/env bash
set -e

# Install syft if not present in the system or local bin
if ! command -v syft &> /dev/null; then
  if [ ! -f "./bin/syft" ]; then
    echo "Syft not found. Installing syft..."
    curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b ./bin
  fi
  export PATH="$PWD/bin:$PATH"
fi

echo "Generating SBOM for sandbox capsules..."

for capsule in sandbox/capsules/*; do
  if [ -d "$capsule" ]; then
    echo "Processing $capsule..."
    mkdir -p "$capsule/sbom"
    syft dir:"$capsule" -o spdx-json > "$capsule/sbom/sbom.json"
  fi
done

echo "SBOM generation complete."
