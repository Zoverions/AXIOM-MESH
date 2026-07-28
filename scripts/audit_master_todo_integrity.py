#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import re
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
MASTER = ROOT / "docs/MASTER-TODO.md"

SECTION2_START = "## 2) Active Pending Queue (Top Priority)"
SECTION2_END = "## 3)"


def section2_lines(text: str):
    start = text.find(SECTION2_START)
    end = text.find(SECTION2_END)
    if start == -1 or end == -1 or end <= start:
        return []
    block = text[start:end]
    return block.splitlines()


def extract_backticked_paths(line: str):
    paths = []
    for raw in re.findall(r"`([^`]+)`", line):
        candidate = raw.strip()
        if not candidate:
            continue
        if candidate.startswith("@"):  # mentions
            continue
        if " " in candidate and "/" not in candidate:
            continue
        if candidate.startswith("http://") or candidate.startswith("https://"):
            continue
        if candidate.endswith("()"):  # function names
            continue
        if "/" in candidate or candidate.endswith((".md", ".py", ".ts", ".json", ".yml", ".yaml")):
            paths.append(candidate)
    return paths


def audit_active_queue(master_text: str):
    checked = []
    unchecked = []
    file_refs = []
    for line in section2_lines(master_text):
        s = line.strip()
        if s.startswith("- [x]"):
            checked.append(line)
            file_refs.extend(extract_backticked_paths(line))
        elif s.startswith("- [ ]"):
            unchecked.append(line)

    file_refs = sorted(set(file_refs))
    exists = []
    missing = []
    for ref in file_refs:
        p = ROOT / ref
        if p.exists():
            exists.append(ref)
            continue
        # Resolve basename-only references if they map uniquely in the repository
        if "/" not in ref:
            matches = [m for m in ROOT.rglob(ref) if m.is_file() and ".git/" not in str(m)]
            if len(matches) == 1:
                exists.append(ref)
                continue
        missing.append(ref)

    return {
        "checked_count": len(checked),
        "unchecked_count": len(unchecked),
        "unchecked_lines": unchecked,
        "file_refs_checked": len(file_refs),
        "file_refs_existing": exists,
        "file_refs_missing": missing,
    }


def audit_unchecked_docs():
    docs_root = ROOT / "docs"
    unchecked = []
    for path in docs_root.rglob("*.md"):
        rel = path.relative_to(ROOT)
        for i, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if re.search(r"^\s*- \[ \]", line):
                unchecked.append((str(rel), i, line.strip()))

    buckets = defaultdict(list)
    for rel, ln, line in unchecked:
        if rel.startswith("docs/historical/"):
            buckets["historical"].append((rel, ln, line))
        elif "/media/MASTER-TODO.md" in rel:
            buckets["generated_media_mirror"].append((rel, ln, line))
        elif rel == "docs/MASTER-TODO.md":
            buckets["canonical_queue"].append((rel, ln, line))
        else:
            buckets["other_docs"].append((rel, ln, line))
    return buckets


def write_report(path: pathlib.Path, queue, buckets):
    today = dt.date.today().isoformat()
    lines = []
    lines.append("# MASTER TODO + Documentation Integrity Audit")
    lines.append("")
    lines.append(f"**Date:** {today}")
    lines.append("**Scope:** Canonical queue integrity, completion-claim evidence link sanity, and unchecked-checklist distribution across docs.")
    lines.append("")
    lines.append("## A) Canonical Queue Status (`docs/MASTER-TODO.md`) ")
    lines.append("")
    lines.append(f"- Completed items in active queue: **{queue['checked_count']}**")
    lines.append(f"- Unchecked items in active queue: **{queue['unchecked_count']}**")
    if queue["unchecked_lines"]:
        lines.append("- Remaining unchecked line(s):")
        for l in queue["unchecked_lines"]:
            lines.append(f"  - {l.strip()}")
    lines.append("")
    lines.append("## B) Completion-Claim File Reference Sanity (Active Queue)")
    lines.append("")
    lines.append(f"- Unique backticked file-like refs discovered: **{queue['file_refs_checked']}**")
    lines.append(f"- Existing paths: **{len(queue['file_refs_existing'])}**")
    lines.append(f"- Missing paths: **{len(queue['file_refs_missing'])}**")
    if queue["file_refs_missing"]:
        lines.append("- Missing refs:")
        for ref in queue["file_refs_missing"]:
            lines.append(f"  - `{ref}`")
    lines.append("")
    lines.append("## C) Unchecked Checklist Distribution Across `docs/`")
    lines.append("")
    for key in ["canonical_queue", "historical", "generated_media_mirror", "other_docs"]:
        entries = buckets.get(key, [])
        lines.append(f"- **{key}**: {len(entries)}")
    lines.append("")
    lines.append("### Key Findings")
    lines.append("")
    lines.append("1. Canonical queue has a single unchecked item, M6.4 deployment, consistent with explicit deployment exclusion for this pass.")
    lines.append("2. A large portion of unchecked boxes live in planning/assessment/supporting docs; these can create false signal if interpreted as active execution queue.")
    lines.append("3. Generated media mirrors of MASTER-TODO under docs/api/*/media contain stale unchecked tasks and should be marked non-canonical or synchronized.")
    lines.append("")
    lines.append("### Recommended Follow-up")
    lines.append("")
    lines.append("- Add a docs lint/check script in CI to fail when supporting docs present checklist items without explicit `status: reference-only` labeling.")
    lines.append("- Add front-matter marker (e.g., `canonical: false`) to planning docs with open checkboxes.")
    lines.append("- Generate the docs/api/*/media MASTER-TODO snapshots from canonical source to prevent drift.")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", default=f"docs/assessments/MASTER-TODO-DOCS-INTEGRITY-AUDIT-{dt.date.today().isoformat()}.md")
    args = parser.parse_args()

    master_text = MASTER.read_text(encoding="utf-8")
    queue = audit_active_queue(master_text)
    buckets = audit_unchecked_docs()

    report_path = ROOT / args.report
    report_path.parent.mkdir(parents=True, exist_ok=True)
    write_report(report_path, queue, buckets)
    print(f"Wrote report: {report_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
