#!/usr/bin/env python3
"""Run a financial reconciliation drill and persist auditable evidence."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REPORT_DIR = ROOT / "evidence" / "financial" / "reconciliation-drills"
REQUIRED_CONTROL_ARTIFACTS = [
    "docs/FINANCIAL-CONTROLS-EVIDENCE.md",
    "docs/TOKENOMICS.md",
    "grid/contracts/contracts/token/AXM.sol",
    "grid/contracts/contracts/AutomatedBicameralGovernance.sol",
]


def evaluate_control_artifacts(root: Path) -> list[dict[str, str]]:
    checks: list[dict[str, str]] = []
    for rel_path in REQUIRED_CONTROL_ARTIFACTS:
        full_path = root / rel_path
        checks.append(
            {
                "artifact": rel_path,
                "status": "pass" if full_path.exists() else "fail",
                "detail": "present" if full_path.exists() else "missing",
            }
        )
    return checks


def run_ledger_reconciliation_test(
    root: Path,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    command = ["go", "test", "./blockchain", "-run", "TestLedger_ApplyBondChainEvent_And_Reconcile", "-count=1"]
    completed = runner(
        command,
        cwd=root / "grid",
        check=False,
        capture_output=True,
        text=True,
    )
    return {
        "name": "ledger_chain_reconciliation",
        "status": "pass" if completed.returncode == 0 else "fail",
        "command": " ".join(command),
        "exit_code": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }


def build_report(
    root: Path,
    *,
    include_test: bool = True,
    now: datetime | None = None,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    timestamp = (now or datetime.now(timezone.utc)).replace(microsecond=0)
    control_checks = evaluate_control_artifacts(root)

    test_result: dict[str, Any] | None = None
    if include_test:
        test_result = run_ledger_reconciliation_test(root, runner=runner)

    has_control_failures = any(check["status"] != "pass" for check in control_checks)
    has_test_failure = include_test and test_result is not None and test_result["status"] != "pass"

    return {
        "drill": "financial_reconciliation",
        "generated_at": timestamp.isoformat().replace("+00:00", "Z"),
        "status": "pass" if not has_control_failures and not has_test_failure else "fail",
        "checks": {
            "control_artifacts": control_checks,
            "reconciliation_test": test_result,
        },
    }


def persist_report(report: dict[str, Any], report_dir: Path) -> Path:
    report_dir.mkdir(parents=True, exist_ok=True)
    generated = report["generated_at"].replace(":", "").replace("-", "")
    stamp = generated.replace("T", "_").replace("Z", "")
    report_path = report_dir / f"drill-{stamp}.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    (report_dir / "latest.json").write_text(json.dumps(report, indent=2) + "\n")
    return report_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report-dir",
        default=str(DEFAULT_REPORT_DIR),
        help="Directory where reconciliation drill reports are written.",
    )
    parser.add_argument(
        "--skip-test",
        action="store_true",
        help="Skip running the Go reconciliation test (artifact checks still run).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report_dir = Path(args.report_dir)
    report = build_report(ROOT, include_test=not args.skip_test)
    report_path = persist_report(report, report_dir)

    print(f"Reconciliation drill report written: {report_path}")
    if report["status"] != "pass":
        print("Reconciliation drill failed; inspect the generated report for details.", file=sys.stderr)
        return 1

    print("Reconciliation drill completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
