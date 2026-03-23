from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.verify_evidence_bundles import verify_bundle


def build_bundle(tmp_path: Path) -> Path:
    bundle = tmp_path / "FIN-2026-03-23"
    bundle.mkdir()
    (bundle / "CONTROL-COVERAGE.md").write_text("coverage")
    (bundle / "VERIFICATION-COMMANDS.md").write_text("commands")
    (bundle / "ATTESTATION.md").write_text("attestation")
    manifest = {
        "bundle_id": "FIN-2026-03-23",
        "generated_on": "2026-03-23",
        "owner": "finance+ops",
        "status": "draft",
        "controls_index": "docs/FINANCIAL-CONTROLS-EVIDENCE.md",
        "files": [
            "CONTROL-COVERAGE.md",
            "VERIFICATION-COMMANDS.md",
            "ATTESTATION.md",
        ],
    }
    (bundle / "manifest.json").write_text(json.dumps(manifest))
    return bundle


def test_verify_bundle_passes() -> None:
    bundle = Path("evidence/financial/FIN-2026-03-23")
    errors = verify_bundle(bundle)
    assert errors == []


def test_verify_bundle_detects_missing_artifact(tmp_path: Path) -> None:
    bundle = build_bundle(tmp_path)
    (bundle / "ATTESTATION.md").unlink()

    errors = verify_bundle(bundle)
    assert any("missing required file ATTESTATION.md" in e for e in errors)
