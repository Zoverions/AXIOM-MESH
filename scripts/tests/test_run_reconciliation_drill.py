from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.run_reconciliation_drill import build_report, persist_report


class _Completed:
    def __init__(self, returncode: int, stdout: str = "", stderr: str = "") -> None:
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def _write_required_artifacts(root: Path) -> None:
    for rel in [
        "docs/FINANCIAL-CONTROLS-EVIDENCE.md",
        "docs/TOKENOMICS.md",
        "grid/contracts/contracts/token/AXM.sol",
        "grid/contracts/contracts/AutomatedBicameralGovernance.sol",
    ]:
        full = root / rel
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text("ok")


def test_build_report_passes_when_artifacts_and_test_pass(tmp_path: Path) -> None:
    _write_required_artifacts(tmp_path)

    report = build_report(
        tmp_path,
        now=datetime(2026, 3, 23, 0, 0, tzinfo=timezone.utc),
        runner=lambda *_, **__: _Completed(0, "ok", ""),
    )

    assert report["status"] == "pass"
    assert report["checks"]["reconciliation_test"]["status"] == "pass"


def test_build_report_fails_when_artifact_missing(tmp_path: Path) -> None:
    _write_required_artifacts(tmp_path)
    (tmp_path / "docs" / "TOKENOMICS.md").unlink()

    report = build_report(
        tmp_path,
        now=datetime(2026, 3, 23, 0, 0, tzinfo=timezone.utc),
        runner=lambda *_, **__: _Completed(0, "ok", ""),
    )

    assert report["status"] == "fail"
    assert any(check["artifact"] == "docs/TOKENOMICS.md" and check["status"] == "fail" for check in report["checks"]["control_artifacts"])


def test_persist_report_writes_latest_and_timestamped_file(tmp_path: Path) -> None:
    report = {
        "drill": "financial_reconciliation",
        "generated_at": "2026-03-23T00:00:00Z",
        "status": "pass",
        "checks": {"control_artifacts": [], "reconciliation_test": None},
    }

    report_path = persist_report(report, tmp_path)

    assert report_path.exists()
    assert (tmp_path / "latest.json").exists()
    latest = json.loads((tmp_path / "latest.json").read_text())
    assert latest["drill"] == "financial_reconciliation"
