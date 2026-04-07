#!/usr/bin/env python3
"""Validate operator-facing traceability entries link to HOWTO index (M12.3)."""

from pathlib import Path
import re
import sys

TRACEABILITY_DOC = Path("docs/assessments/DOCS-CODE-TRACEABILITY-MATRIX-2026-04-07.md")
HOWTO_INDEX = Path("docs/HOWTO/index.md")


def main() -> int:
    if not TRACEABILITY_DOC.exists():
        print(f"missing traceability doc: {TRACEABILITY_DOC}")
        return 1
    if not HOWTO_INDEX.exists():
        print(f"missing HOWTO index: {HOWTO_INDEX}")
        return 1

    traceability_text = TRACEABILITY_DOC.read_text(encoding="utf-8")
    index_text = HOWTO_INDEX.read_text(encoding="utf-8")

    howto_paths = sorted({p for p in re.findall(r"docs/HOWTO/[\w\-]+\.md", traceability_text) if not p.endswith("/index.md")})
    if not howto_paths:
        print("no HOWTO paths found in traceability matrix")
        return 1

    missing_files = [p for p in howto_paths if not Path(p).exists()]
    missing_from_index = [p for p in howto_paths if Path(p).name not in index_text]

    if missing_files:
        print("missing HOWTO file(s):")
        for path in missing_files:
            print(f" - {path}")
    if missing_from_index:
        print("HOWTO file(s) not linked in docs/HOWTO/index.md:")
        for path in missing_from_index:
            print(f" - {path}")

    if missing_files or missing_from_index:
        return 1

    print(f"PASS: validated {len(howto_paths)} HOWTO link(s) from traceability matrix.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
