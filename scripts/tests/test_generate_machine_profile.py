from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_generate_machine_profile_creates_expected_fields(tmp_path: Path) -> None:
    out = tmp_path / "machine_profile.json"
    cmd = [
        sys.executable,
        str(ROOT / "scripts" / "generate_machine_profile.py"),
        "--machine-role",
        "shared-machine",
        "--output",
        str(out),
    ]
    subprocess.run(cmd, check=True)

    payload = json.loads(out.read_text())

    for required_key in [
        "os",
        "cpu_cores",
        "ram_gb",
        "disk_free_gb",
        "machine_role",
        "hardware_tier",
        "recommended_local_model",
        "local_load_threshold",
        "memory_pressure_threshold",
    ]:
        assert required_key in payload

    assert payload["machine_role"] == "shared-machine"
    assert payload["local_load_threshold"] <= 1.0
    assert payload["memory_pressure_threshold"] <= 1.0


def test_generate_machine_profile_role_thresholds(tmp_path: Path) -> None:
    out = tmp_path / "machine_profile_dedicated.json"
    cmd = [
        sys.executable,
        str(ROOT / "scripts" / "generate_machine_profile.py"),
        "--machine-role",
        "dedicated-mesh",
        "--output",
        str(out),
    ]
    subprocess.run(cmd, check=True)

    payload = json.loads(out.read_text())
    assert payload["machine_role"] == "dedicated-mesh"
    assert payload["local_load_threshold"] == 0.9
    assert payload["memory_pressure_threshold"] == 0.9
