#!/usr/bin/env python3

import sys
from pathlib import Path

def main():
    expected_files = [
        "docs/audits/zkml-trusted-setup.md",
        "docs/audits/zkml-circuit-coverage.md",
        "docs/audits/zkml-proof-malleability-tests.md"
    ]

    missing_files = []
    for f in expected_files:
        if not Path(f).exists():
            missing_files.append(f)

    if missing_files:
        print(f"Missing zkML audit pack artifacts: {', '.join(missing_files)}")
        sys.exit(1)

    print("zkML audit pack artifacts verified successfully.")
    sys.exit(0)

if __name__ == "__main__":
    main()
