import sys
import re
from pathlib import Path

def main():
    contract_path = Path("grid/contracts/contracts/ProveXVerifierWrapper.sol")
    if not contract_path.exists():
        print(f"Contract {contract_path} not found")
        sys.exit(1)

    content = contract_path.read_text()
    if 'uint256 releaseAmount = 1 ether + (poerScores[recipient] * 1e15);' in content:
        print("Scaffold found in ProveXVerifierWrapper.sol")
        sys.exit(1)

    # verify that calculateDynamicReleaseAmount exists
    if 'function calculateDynamicReleaseAmount(' not in content:
        print("calculateDynamicReleaseAmount not found in ProveXVerifierWrapper.sol")
        sys.exit(1)

    print("ProveX scaffold removed")
    sys.exit(0)

if __name__ == "__main__":
    main()
