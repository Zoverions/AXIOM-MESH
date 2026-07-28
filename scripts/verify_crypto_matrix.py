#!/usr/bin/env python3
import sys
import re
from pathlib import Path

def main():
    matrix_path = Path("docs/CRYPTOGRAPHY-POSTURE-MATRIX.md")
    if not matrix_path.exists():
        print("docs/CRYPTOGRAPHY-POSTURE-MATRIX.md not found.")
        sys.exit(1)

    content = matrix_path.read_text()

    # 1. Check required posture keywords
    for keyword in ["Implemented", "Planned", "Experimental"]:
        if keyword not in content:
            print(f"docs/CRYPTOGRAPHY-POSTURE-MATRIX.md missing required keyword: {keyword}")
            sys.exit(1)

    # 2. Extract the table rows from the "Cryptography Posture Matrix" section
    in_table = False
    table_lines = []
    for line in content.splitlines():
        if line.startswith("| Component"):
            in_table = True
        elif in_table and line.startswith("|---"):
            continue
        elif in_table and not line.startswith("|"):
            if table_lines: # Reached end of table
                break
        elif in_table:
            table_lines.append(line)

    if not table_lines:
        print("No table found in docs/CRYPTOGRAPHY-POSTURE-MATRIX.md")
        sys.exit(1)

    # 3. Verify each row has a valid code reference (not N/A) and exists
    for row in table_lines[1:]: # Skip header
        columns = [col.strip() for col in row.split("|")[1:-1]]
        if len(columns) < 4:
            continue

        component = columns[0]
        code_refs_raw = columns[3]

        # Extract things in backticks
        code_refs = re.findall(r'`([^`]+)`', code_refs_raw)

        if not code_refs or "N/A" in code_refs_raw:
            print(f"Component '{component}' lacks a valid code reference or uses N/A: {code_refs_raw}")
            sys.exit(1)

        for ref in code_refs:
            # Check if ref exists in the repo
            p = Path(ref)
            # Allow directories or files
            if not p.exists():
                print(f"Component '{component}' references missing path: {ref}")
                sys.exit(1)

    print("Cryptography posture matrix verified successfully.")
    sys.exit(0)

if __name__ == "__main__":
    main()
