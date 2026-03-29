from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def run_indexer(repo_root: Path, output: Path) -> dict:
    cmd = [
        sys.executable,
        str(ROOT / "scripts" / "generate_agent_steering_index.py"),
        "--root",
        str(repo_root),
        "--output",
        str(output),
    ]
    subprocess.run(cmd, check=True)
    return json.loads(output.read_text())


def test_indexer_detects_steering_scopes(tmp_path: Path) -> None:
    (tmp_path / "AGENTS.md").write_text("root instructions")
    (tmp_path / "services" / "api").mkdir(parents=True)
    (tmp_path / "services" / "api" / "STEERING.md").write_text("api steering")

    payload = run_indexer(tmp_path, tmp_path / "index.json")

    assert payload["entry_count"] == 2
    by_path = {entry["path"]: entry for entry in payload["entries"]}

    assert by_path["AGENTS.md"]["scope_root"] == "."
    assert by_path["services/api/STEERING.md"]["scope_root"] == "services/api"
    assert by_path["services/api/STEERING.md"]["scope_chain"][0] == "services/api"
    assert by_path["services/api/STEERING.md"]["scope_chain"][-1] == "."


def test_indexer_excludes_heavy_dirs(tmp_path: Path) -> None:
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "AGENTS.md").write_text("ignore me")
    (tmp_path / "SKILL.md").write_text("include me")

    payload = run_indexer(tmp_path, tmp_path / "index.json")

    assert payload["entry_count"] == 1
    assert payload["entries"][0]["path"] == "SKILL.md"
