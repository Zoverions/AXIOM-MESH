#!/usr/bin/env python3
"""Build an index of directory-level agent steering instructions.

This script discovers steering files (for example AGENTS.md) and writes a
single JSON index that runtime components can load quickly instead of scanning
the filesystem repeatedly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Iterable

DEFAULT_STEERING_FILENAMES = (
    "AGENTS.md",
    "STEERING.md",
    "SKILL.md",
    "SKILL_MANIFEST.json",
    "SOURCE_DESCRIPTOR.json",
)

DEFAULT_EXCLUDE_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "dist",
    "build",
    "coverage",
    "__pycache__",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_steering_files(root: Path, filenames: set[str], excludes: set[str]) -> Iterable[Path]:
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel_parts = path.relative_to(root).parts
        if any(part in excludes for part in rel_parts[:-1]):
            continue
        if path.name in filenames:
            yield path


def compute_scope_chain(rel_dir: Path) -> list[str]:
    """Return ordered ancestor scopes from closest to root-most scope."""
    chain = []
    current = rel_dir
    while True:
        chain.append(str(current) if str(current) else ".")
        if str(current) in {"", "."}:
            break
        current = current.parent
    return chain


def build_index(root: Path, filenames: set[str], excludes: set[str]) -> dict:
    entries = []
    for path in iter_steering_files(root, filenames, excludes):
        rel = path.relative_to(root)
        rel_dir = rel.parent
        entries.append(
            {
                "path": str(rel),
                "name": path.name,
                "scope_root": str(rel_dir) if str(rel_dir) else ".",
                "scope_chain": compute_scope_chain(rel_dir),
                "sha256": sha256_file(path),
                "size_bytes": path.stat().st_size,
            }
        )

    entries.sort(key=lambda item: (item["scope_root"], item["name"], item["path"]))

    return {
        "version": 1,
        "root": str(root.resolve()),
        "steering_filenames": sorted(filenames),
        "exclude_dirs": sorted(excludes),
        "entry_count": len(entries),
        "entries": entries,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate indexed directory steering metadata.")
    parser.add_argument("--root", default=".", help="Repository root to scan (default: current directory)")
    parser.add_argument(
        "--output",
        default="config/agent_steering_index.json",
        help="Where to write the index JSON",
    )
    parser.add_argument(
        "--include",
        action="append",
        default=[],
        help="Additional steering filename to include (repeatable)",
    )
    parser.add_argument(
        "--exclude-dir",
        action="append",
        default=[],
        help="Additional directory name to exclude from scanning (repeatable)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    output = Path(args.output)

    filenames = set(DEFAULT_STEERING_FILENAMES)
    filenames.update({name for name in args.include if name})

    excludes = set(DEFAULT_EXCLUDE_DIRS)
    excludes.update({name for name in args.exclude_dir if name})

    payload = build_index(root, filenames=filenames, excludes=excludes)

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote steering index with {payload['entry_count']} entries to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
