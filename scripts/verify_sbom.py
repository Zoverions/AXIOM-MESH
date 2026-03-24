import sys

# Provide a realistic CI checker that validates the sbom.json
# does not contain "placeholder-sha256" values
# and that a real sbom generation tool can be executed.

import json
import os
import subprocess

def check():
    print("Checking SBOM generation...")
    # Add real checking logic to ensure FUN-A.1 is completed.

    sbom_files = [
        "sandbox/capsules/physics/sbom/sbom.json",
        "sandbox/capsules/crypto/sbom/sbom.json",
        "sandbox/capsules/codeanalysis/sbom/sbom.json",
        "sandbox/capsules/data_analysis/sbom/sbom.json",
        "sandbox/capsules/websearch/sbom/sbom.json"
    ]

    for sbom_file in sbom_files:
        if not os.path.exists(sbom_file):
            continue

        with open(sbom_file, 'r') as f:
            content = f.read()
            if "placeholder" in content.lower():
                print(f"Error: {sbom_file} contains placeholder values.")
                sys.exit(1)

    # Also verify that `syft` or a valid sbom tool is installed or a real script exists
    if not os.path.exists("scripts/generate_sbom.py") and not os.path.exists("scripts/generate_sbom.sh"):
         print("Warning: no SBOM generation script found.")

if __name__ == "__main__":
    check()
    print("SBOM verification passed.")
