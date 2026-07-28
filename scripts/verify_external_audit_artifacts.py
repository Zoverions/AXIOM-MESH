#!/usr/bin/env python3

import sys
import os
import shutil
import zipfile
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

    # EXT-AUD evidence packaging
    package_dir = Path("evidence/release/EXT-AUD-PACKAGE")
    package_dir.mkdir(parents=True, exist_ok=True)

    zip_path = package_dir / "external-audit-package.zip"

    print(f"Packaging external audit evidence into {zip_path}...")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for f in expected_files:
            zipf.write(f, arcname=Path(f).name)

    print("External audit artifacts verified and packaged successfully.")
    sys.exit(0)

if __name__ == "__main__":
    main()
