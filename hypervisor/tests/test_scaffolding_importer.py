import os
import json
import pytest
import shutil
from pathlib import Path
from scripts.scaffolding_importer import run_import

@pytest.fixture
def mock_scaffolding(tmp_path):
    # Setup Agent Zero mock
    az_dir = tmp_path / "agent-zero"
    az_dir.mkdir()
    tools_dir = az_dir / "tools"
    tools_dir.mkdir()

    az_tool = {
        "name": "test-az-tool",
        "description": "A test tool for Agent Zero"
    }
    with open(tools_dir / "test_tool.json", "w") as f:
        json.dump(az_tool, f)

    # Setup OpenClaw mock
    oc_dir = tmp_path / "openclaw"
    oc_dir.mkdir()
    skills_dir = oc_dir / "skills"
    skills_dir.mkdir()
    skill_dir = skills_dir / "test-skill"
    skill_dir.mkdir()

    oc_manifest = {
        "name": "test-oc-skill",
        "capabilities": ["test-cap"],
        "runtime": {"memory_limit_mb": 128}
    }
    with open(skill_dir / "manifest.json", "w") as f:
        json.dump(oc_manifest, f)

    return tmp_path

def test_run_import(mock_scaffolding, monkeypatch):
    # Mock intake_payload to avoid needing environment variables/schemas
    def mock_intake(source, name, capabilities, constraints, runtime):
        return {"capsule_id": f"mock-{name}", "name": name}

    monkeypatch.setattr("scripts.scaffolding_importer.intake_payload", mock_intake)

    # Also mock Path.home() to avoid searching real home dir
    monkeypatch.setattr(Path, "home", lambda: Path("/nonexistent"))

    results = run_import(str(mock_scaffolding))

    assert len(results) == 2
    names = [r["name"] for r in results]
    assert "test-az-tool" in names
    assert "test-oc-skill" in names

def test_run_import_no_scaffolding(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: Path("/nonexistent"))
    results = run_import(str(tmp_path))
    assert len(results) == 0
