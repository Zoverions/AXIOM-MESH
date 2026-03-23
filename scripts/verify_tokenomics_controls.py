#!/usr/bin/env python3
import sys
import re
from pathlib import Path

def verify_axm_sol():
    axm_path = Path("grid/contracts/contracts/token/AXM.sol")
    if not axm_path.exists():
        return False, "AXM.sol not found"

    content = axm_path.read_text()

    # Check for constants using regex to be robust
    if not re.search(r"FOUNDER_PERCENT\s*=\s*5\s*;", content):
        return False, "Missing FOUNDER_PERCENT = 5 in AXM.sol"
    if not re.search(r"NETWORK_TREASURY_PERCENT\s*=\s*10\s*;", content):
        return False, "Missing NETWORK_TREASURY_PERCENT = 10 in AXM.sol"
    if not re.search(r"ECOSYSTEM_RESERVE_PERCENT\s*=\s*85\s*;", content):
        return False, "Missing ECOSYSTEM_RESERVE_PERCENT = 85 in AXM.sol"

    # Check that they add up to 100
    constraint_pattern = r"FOUNDER_PERCENT\s*\+\s*NETWORK_TREASURY_PERCENT\s*\+\s*ECOSYSTEM_RESERVE_PERCENT\s*==\s*100"
    if not re.search(constraint_pattern, content):
        return False, "Missing 100% sum constraint in AXM.sol"

    return True, ""

def main():
    success, msg = verify_axm_sol()
    if not success:
        print(f"Tokenomics controls verification failed: {msg}", file=sys.stderr)
        sys.exit(1)

    print("Tokenomics controls verified successfully.")
    sys.exit(0)

if __name__ == "__main__":
    main()
