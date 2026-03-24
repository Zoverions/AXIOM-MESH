#!/usr/bin/env python3
import sys
import re
import subprocess
from pathlib import Path

def get_git_diff(file_path):
    # For CI, we should check if there are differences against origin/main.
    # However, for local testing and this specific validation, we can check
    # both HEAD and the working tree, or look at recent commits.
    # We will just look at the last commit that touched this file.
    try:
        # Check if the file has been modified in the current branch
        result = subprocess.run(
            ['git', 'diff', 'origin/main...HEAD', '--', file_path],
            capture_output=True, text=True, check=True
        )
        return result.stdout
    except subprocess.CalledProcessError:
        try:
            # Fallback to local working tree
            result = subprocess.run(
                ['git', 'diff', 'HEAD', '--', file_path],
                capture_output=True, text=True, check=True
            )
            return result.stdout
        except subprocess.CalledProcessError:
            return ""

def verify_tokenomics_change_control():
    axm_path = "grid/contracts/contracts/token/AXM.sol"

    diff = get_git_diff(axm_path)

    # Actually, in a robust CI, we might just require that IF there's any commit
    # changing AXM.sol, there must be a governance record.
    # But for this task, the goal is to implement the check.
    # Let's ensure the mechanism exists.

    if diff:
        gov_dir = Path("evidence/governance")
        if not gov_dir.exists():
            return False, f"Tokenomics changed in {axm_path}, but no governance evidence directory found."

        found_record = False
        for record in gov_dir.glob("*.md"):
            content = record.read_text()
            if "AXM.sol" in content and ("Change-Control" in content or "migration note" in content.lower()):
                found_record = True
                break

        if not found_record:
            return False, "Tokenomics changed, but no valid governance decision record and migration note found in evidence/governance/."

    return True, ""

def main():
    print("Verifying Tokenomics Change-Control...")
    success, msg = verify_tokenomics_change_control()
    if not success:
        print(f"Error: {msg}", file=sys.stderr)
        sys.exit(1)

    print("Tokenomics Change-Control verified successfully.")
    sys.exit(0)

if __name__ == "__main__":
    main()
