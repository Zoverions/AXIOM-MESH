#!/usr/bin/env python3

import sys
import os
from pathlib import Path

def main():
    expected_files = [
        "docs/audits/smart-contract-audit-report.md",
        "docs/audits/remediation-plan.md"
    ]

    missing_files = []
    for f in expected_files:
        if not Path(f).exists():
            missing_files.append(f)

    if missing_files:
        print(f"Missing external audit artifacts: {', '.join(missing_files)}")
        sys.exit(1)

    print("External audit artifacts verified successfully.")
    sys.exit(0)

if __name__ == "__main__":
    main()
