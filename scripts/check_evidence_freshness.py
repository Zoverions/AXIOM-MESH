#!/usr/bin/env python3
"""Check quarterly evidence freshness audit metadata (M12.2)."""

from datetime import datetime
from pathlib import Path
import re
import sys

AUDIT_DOC = Path("docs/operations/EVIDENCE-FRESHNESS-AUDIT-2026-Q2.md")
MAX_AGE_DAYS = 120


def main() -> int:
    if not AUDIT_DOC.exists():
        print(f"missing audit doc: {AUDIT_DOC}")
        return 1

    text = AUDIT_DOC.read_text(encoding="utf-8")
    dates = re.findall(r"\b\d{4}-\d{2}-\d{2}\b", text)
    if not dates:
        print("no audit dates found")
        return 1

    today = datetime.utcnow().date()
    stale = []
    for d in dates:
        parsed = datetime.strptime(d, "%Y-%m-%d").date()
        age = (today - parsed).days
        if age > MAX_AGE_DAYS:
            stale.append((d, age))

    if stale:
        print("stale evidence date(s) found:")
        for d, age in stale:
            print(f" - {d} ({age} days old)")
        return 1

    print(f"PASS: freshness audit metadata is within {MAX_AGE_DAYS} days.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
