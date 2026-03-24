#!/usr/bin/env python3
import sys
import subprocess
from pathlib import Path

def main():
    release_dir = Path("evidence/release")
    if not release_dir.exists():
        print("evidence/release directory not found.", file=sys.stderr)
        sys.exit(1)

    found_rc = False
    validator_script = Path("scripts/validate_release_evidence.py")

    for rc_dir in release_dir.glob("RC-*"):
        if rc_dir.is_dir():
            found_rc = True
            if validator_script.exists():
                try:
                    subprocess.run([sys.executable, str(validator_script), str(rc_dir)], check=True)
                except subprocess.CalledProcessError:
                    print(f"Validation failed for {rc_dir}", file=sys.stderr)
                    sys.exit(1)
            else:
                # Fallback validation if script is missing
                print(f"Validator script missing. Running fallback validation for {rc_dir}...")
                for folder in ["security", "financial", "reliability", "ecosystem", "governance", "exceptions"]:
                    if not (rc_dir / folder).is_dir():
                        print(f"Missing required directory: {folder}", file=sys.stderr)
                        sys.exit(1)
                for file in ["summary.md", "summary.json", "security/sbom.json", "governance/control_mapping.md"]:
                    if not (rc_dir / file).is_file():
                        print(f"Missing required file: {file}", file=sys.stderr)
                        sys.exit(1)

    if not found_rc:
        print("No RC dossier found. Run `make generate-rc-dossier` first.", file=sys.stderr)
        sys.exit(1)

    print("RC dossier verification passed.")
    sys.exit(0)

if __name__ == "__main__":
    main()
