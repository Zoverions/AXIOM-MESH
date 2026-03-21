from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.validate_release_evidence import validate_structure


REQUIRED_DIRS = [
    "security",
    "financial",
    "reliability",
    "ecosystem",
    "governance",
    "exceptions",
]


def build_rc(tmp_path: Path) -> Path:
    rc = tmp_path / "RC-2026-03-21"
    rc.mkdir()
    for d in REQUIRED_DIRS:
        (rc / d).mkdir()

    (rc / "summary.md").write_text(
        """
# RC Summary
## security
ok
## financial
ok
## reliability
ok
## ecosystem
ok
## governance
ok
## decision
no-go
""".strip()
    )

    payload = {
        "release_candidate": "RC-2026-03-21",
        "decision": "no-go",
        "gates": {
            "security": "pass",
            "financial": "pass",
            "reliability": "pass",
            "ecosystem": "pass",
            "governance": "pass",
        },
    }
    (rc / "summary.json").write_text(json.dumps(payload))
    return rc


def test_validate_structure_passes_basic(tmp_path: Path) -> None:
    rc = build_rc(tmp_path)
    errors = validate_structure(rc)
    assert errors == []


def test_strict_artifacts_fails_without_gate_files(tmp_path: Path) -> None:
    rc = build_rc(tmp_path)
    errors = validate_structure(rc, strict_artifacts=True)
    assert any("Strict artifacts enabled" in e for e in errors)


def test_exception_gate_requires_exception_file(tmp_path: Path) -> None:
    rc = build_rc(tmp_path)
    payload = json.loads((rc / "summary.json").read_text())
    payload["gates"]["financial"] = "exception"
    (rc / "summary.json").write_text(json.dumps(payload))

    errors = validate_structure(rc)
    assert any("exceptions/ has no supporting files" in e for e in errors)

    (rc / "exceptions" / "financial_exception.md").write_text("approved")
    errors = validate_structure(rc)
    assert not any("exceptions/ has no supporting files" in e for e in errors)


def test_enforce_summary_sections_fails_when_missing(tmp_path: Path) -> None:
    rc = build_rc(tmp_path)
    (rc / "summary.md").write_text("# summary\n## security\npass")

    errors = validate_structure(rc, enforce_summary_sections=True)
    assert any("summary.md missing required section keyword" in e for e in errors)
